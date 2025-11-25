require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');
// const helmet = require('helmet'); <--- تم تعطيله مؤقتاً لحل المشكلة

const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGO_URL = process.env.MONGO_URL;
const ADMIN_PASS = process.env.ADMIN_PASSWORD || "123";
const PORT = process.env.PORT || 3000;
const APP_URL = process.env.RENDER_EXTERNAL_URL;

mongoose.connect(MONGO_URL).then(() => console.log('✅ DB Connected'));

const UserSchema = new mongoose.Schema({
    id: { type: Number, unique: true },
    name: String,
    refCode: String,
    referrer: Number,
    fullName: String,
    phone: String,
    address: String,
    paymentMethod: String,
    paymentAccount: String,
    paymentLocked: { type: Boolean, default: false },
    paymentPassword: String,
    balance: { type: Number, default: 0.0 },
    totalEarned: { type: Number, default: 0.0 },
    isBanned: { type: Boolean, default: false },
    joinedAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', UserSchema);

const TaskSchema = new mongoose.Schema({
    title: String,
    url: String,
    fullPrice: Number,
    seconds: Number,
    active: { type: Boolean, default: true },
    completions: { type: Number, default: 0 }
});
const Task = mongoose.model('Task', TaskSchema);

const WithdrawalSchema = new mongoose.Schema({
    userId: Number,
    amount: Number,
    method: String,
    account: String,
    status: { type: String, default: 'pending' },
    date: { type: Date, default: Date.now }
});
const Withdrawal = mongoose.model('Withdrawal', WithdrawalSchema);

const app = express();
app.use(express.json());
app.use(cors());
// app.use(helmet()); <--- إيقاف الحماية مؤقتاً لتظهر الصفحة
app.use(express.static(path.join(__dirname, 'public')));

// --- ⚠️ الحل الجذري للشاشة السوداء ---
// هذا الكود يضمن إرسال ملف الواجهة عند طلب الصفحة الرئيسية
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- باقي الـ API والبوت كما هو ---

async function checkUser(req, res, next) {
    const userId = req.body.userId || req.query.userId;
    if (userId) {
        const user = await User.findOne({ id: userId });
        if (user && user.isBanned) return res.status(403).json({ error: "حسابك محظور 🚫" });
    }
    next();
}
app.use(checkUser);

app.post('/api/user/update', async (req, res) => {
    const { userId, fullName, phone, address, paymentMethod, paymentAccount, paymentPassword } = req.body;
    const user = await User.findOne({ id: userId });
    if (!user) return res.status(404).json({ error: "User not found" });

    if (fullName) user.fullName = fullName;
    if (phone) user.phone = phone;
    if (address) user.address = address;

    if (!user.paymentLocked) {
        if (paymentMethod) user.paymentMethod = paymentMethod;
        if (paymentAccount) user.paymentAccount = paymentAccount;
        if (paymentPassword) user.paymentPassword = paymentPassword;
        if (paymentMethod && paymentAccount && paymentPassword) user.paymentLocked = true;
    } else {
        if (paymentMethod || paymentAccount) return res.status(400).json({ error: "عذراً، البيانات مقفلة." });
    }
    await user.save();
    res.json({ success: true, locked: user.paymentLocked });
});

app.get('/api/user/:id', async (req, res) => {
    const user = await User.findOne({ id: req.params.id });
    if (!user) return res.json({ error: "Not found" });
    res.json({
        name: user.fullName || user.name,
        balance: user.balance,
        refCode: user.refCode,
        paymentLocked: user.paymentLocked,
        paymentMethod: user.paymentMethod,
        paymentAccount: user.paymentAccount
    });
});

app.post('/api/admin/data', async (req, res) => {
    if (req.body.password !== ADMIN_PASS) return res.status(403).json({ error: "Wrong Password" });
    const stats = {
        totalUsers: await User.countDocuments(),
        totalBalance: (await User.aggregate([{ $group: { _id: null, total: { $sum: "$balance" } } }]))[0]?.total || 0,
        pendingWithdrawals: await Withdrawal.countDocuments({ status: 'pending' })
    };
    const users = await User.find().sort({ joinedAt: -1 }).limit(50);
    const withdrawals = await Withdrawal.find().sort({ date: -1 }).limit(50);
    const tasks = await Task.find();
    res.json({ stats, users, withdrawals, tasks });
});

app.post('/api/admin/action', async (req, res) => {
    if (req.body.password !== ADMIN_PASS) return res.status(403).json({ error: "Auth Error" });
    const { type, id, payload } = req.body;
    if (type === 'ban_user') await User.findOneAndUpdate({ id: id }, { isBanned: true });
    else if (type === 'approve_withdraw') await Withdrawal.findByIdAndUpdate(id, { status: 'approved' });
    else if (type === 'reject_withdraw') {
        const w = await Withdrawal.findById(id);
        if (w && w.status === 'pending') {
            await User.findOneAndUpdate({ id: w.userId }, { $inc: { balance: w.amount } });
            w.status = 'rejected'; await w.save();
        }
    } else if (type === 'delete_task') await Task.findByIdAndDelete(id);
    else if (type === 'add_task') await Task.create(payload);
    res.json({ success: true });
});

app.get('/api/tasks', async (req, res) => {
    const tasks = await Task.find({ active: true });
    res.json(tasks.map(t => ({
        id: t._id, title: t.title, url: t.url, 
        reward: (t.fullPrice * 0.70).toFixed(2), seconds: t.seconds 
    })));
});

app.post('/api/claim', async (req, res) => {
    const { userId, taskId } = req.body;
    const task = await Task.findById(taskId);
    if(!task) return res.status(400).json({error: "Error"});
    const reward = task.fullPrice * 0.70;
    const referrerShare = task.fullPrice * 0.10;
    const user = await User.findOneAndUpdate({ id: userId }, { $inc: { balance: reward, totalEarned: reward } }, {new: true});
    if (user.referrer) await User.findOneAndUpdate({ id: user.referrer }, { $inc: { balance: referrerShare } });
    await Task.findByIdAndUpdate(taskId, { $inc: { completions: 1 } });
    res.json({ success: true });
});

const bot = new Telegraf(BOT_TOKEN);
bot.start(async (ctx) => {
    const user = ctx.from;
    const args = ctx.message.text.split(' ');
    const referrerId = args[1] ? parseInt(args[1]) : null;
    let dbUser = await User.findOne({ id: user.id });
    if (!dbUser) {
        await User.create({ id: user.id, name: user.first_name, refCode: user.id, referrer: (referrerId && referrerId !== user.id) ? referrerId : null });
        dbUser = await User.findOne({ id: user.id });
    }
    if (dbUser.isBanned) return ctx.reply("⛔ حسابك محظور.");
    ctx.reply(`أهلاً بك ${user.first_name} 🇩🇿\n🆔 الكود: ${dbUser.refCode}\n\nاضغط "دخول المنصة" لإكمال بياناتك.`, 
        Markup.keyboard([[Markup.button.webApp("📱 دخول المنصة", `${APP_URL}/`)]]).resize() // <-- تأكدنا من وجود / في الرابط
    );
});

app.listen(PORT, () => console.log('🚀 System Ready'));
bot.launch();
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
