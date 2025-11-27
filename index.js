require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGO_URL = process.env.MONGO_URL;
const ADMIN_PASS = process.env.ADMIN_PASSWORD || "admin123";
const PORT = process.env.PORT || 3000;
const APP_URL = process.env.RENDER_EXTERNAL_URL;

mongoose.connect(MONGO_URL).then(() => console.log('✅ Full System DB Connected'));

// --- الجداول الشاملة ---
const UserSchema = new mongoose.Schema({
    id: { type: Number, unique: true },
    name: String, refCode: String, referrer: Number,
    fullName: String, phone: String, 
    paymentMethod: String, paymentAccount: String, paymentPassword: String,
    paymentLocked: { type: Boolean, default: false },
    balance: { type: Number, default: 0.00 },
    totalEarned: { type: Number, default: 0.00 },
    xp: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    badge: { type: String, default: "عضو جديد" },
    notifications: [{ msg: String, date: { type: Date, default: Date.now }, read: Boolean }],
    isBanned: { type: Boolean, default: false },
    joinedAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', UserSchema);

const TaskSchema = new mongoose.Schema({
    title: String, url: String, price: Number, reward: Number, seconds: Number, active: { type: Boolean, default: true }
});
const Task = mongoose.model('Task', TaskSchema);

// نظام التذاكر (الدعم الفني)
const TicketSchema = new mongoose.Schema({
    userId: Number, subject: String, message: String,
    reply: String, status: { type: String, default: 'open' }, // open, closed
    date: { type: Date, default: Date.now }
});
const Ticket = mongoose.model('Ticket', TicketSchema);

const WithdrawalSchema = new mongoose.Schema({
    userId: Number, amount: Number, method: String, account: String,
    status: { type: String, default: 'pending' }, date: { type: Date, default: Date.now }
});
const Withdrawal = mongoose.model('Withdrawal', WithdrawalSchema);

// --- السيرفر ---
const app = express();
app.use(express.json());
app.use(cors());
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(rateLimit({ windowMs: 15*60*1000, max: 300 }));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// --- دوال مساعدة ---
async function notify(userId, msg) {
    await User.findOneAndUpdate({ id: userId }, { $push: { notifications: { msg, read: false } } });
}

// --- APIs ---

app.get('/api/user/:id', async (req, res) => {
    let user = await User.findOne({ id: req.params.id });
    if (!user) return res.json({ notFound: true });
    // إرسال آخر 5 إشعارات فقط لتخفيف الحمل
    const recentNotifs = user.notifications.reverse().slice(0, 5);
    res.json({ ...user._doc, notifications: recentNotifs });
});

// المهام والربح
app.get('/api/tasks', async (req, res) => {
    const tasks = await Task.find({ active: true }).sort({ _id: -1 });
    res.json(tasks);
});

app.post('/api/claim', async (req, res) => {
    const { userId, taskId } = req.body;
    const task = await Task.findById(taskId);
    if(!task) return res.json({ error: "Error" });
    
    await User.findOneAndUpdate({ id: userId }, { 
        $inc: { balance: task.reward, totalEarned: task.reward, xp: 10 } 
    });
    res.json({ success: true, msg: "تمت إضافة الأجر" });
});

// الدعم الفني
app.post('/api/ticket', async (req, res) => {
    const { userId, subject, message } = req.body;
    await Ticket.create({ userId, subject, message });
    res.json({ success: true, msg: "تم فتح التذكرة" });
});

app.get('/api/tickets/:id', async (req, res) => {
    const tickets = await Ticket.find({ userId: req.params.id }).sort({ date: -1 });
    res.json(tickets);
});

// السحب
app.post('/api/withdraw', async (req, res) => {
    const { userId, amount, pass } = req.body;
    const user = await User.findOne({ id: userId });
    
    if(user.paymentPassword !== pass) return res.json({ error: "كلمة المرور خاطئة" });
    if(user.balance < amount) return res.json({ error: "الرصيد غير كافٍ" });
    
    user.balance -= parseFloat(amount);
    await user.save();
    
    await Withdrawal.create({ userId, amount, method: user.paymentMethod, account: user.paymentAccount });
    await notify(userId, `تم استلام طلب سحب بقيمة ${amount} DZD`);
    
    res.json({ success: true, msg: "الطلب قيد المعالجة" });
});

// تغيير كلمة المرور
app.post('/api/settings/password', async (req, res) => {
    const { userId, oldPass, newPass } = req.body;
    const user = await User.findOne({ id: userId });
    if(user.paymentPassword !== oldPass) return res.json({ error: "كلمة المرور القديمة خاطئة" });
    
    user.paymentPassword = newPass;
    await user.save();
    await notify(userId, "تم تغيير كلمة مرور المحفظة بنجاح");
    res.json({ success: true, msg: "تم التغيير بنجاح" });
});

// التسجيل
app.post('/api/register', async (req, res) => {
    const { userId, fullName, phone, method, account, pass } = req.body;
    await User.findOneAndUpdate({ id: userId }, { 
        fullName, phone, paymentMethod: method, paymentAccount: account, paymentPassword: pass, paymentLocked: true 
    }, { upsert: true });
    res.json({ success: true });
});

// لوحة الأدمن (للرد على التذاكر)
app.post('/api/admin', async (req, res) => {
    if (req.body.password !== ADMIN_PASS) return res.json({ error: "Auth Error" });
    const { action, payload } = req.body;

    if (action === 'reply_ticket') {
        await Ticket.findByIdAndUpdate(payload.id, { reply: payload.reply, status: 'closed' });
        const t = await Ticket.findById(payload.id);
        await notify(t.userId, `رد الإدارة على تذكرتك: ${payload.reply}`);
    }
    if (action === 'add_task') {
        const reward = payload.price * 0.70;
        await Task.create({ ...payload, reward });
    }
    res.json({ success: true });
});

app.listen(PORT, () => console.log(`🚀 Full System on ${PORT}`));

const bot = new Telegraf(BOT_TOKEN);
bot.start((ctx) => {
    const url = `${APP_URL}/?uid=${ctx.from.id}`;
    ctx.reply("👋 أهلاً بك في المنصة المتكاملة.\n\n👇 اضغط للدخول:", Markup.keyboard([[Markup.button.webApp("📱 دخول التطبيق", url)]]).resize());
});
bot.launch();