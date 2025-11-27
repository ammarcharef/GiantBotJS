require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// إعدادات الإمبراطورية
const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGO_URL = process.env.MONGO_URL;
const ADMIN_PASS = process.env.ADMIN_PASSWORD || "admin123";
const PORT = process.env.PORT || 3000;
const APP_URL = process.env.RENDER_EXTERNAL_URL;

mongoose.connect(MONGO_URL).then(() => console.log('✅ Halal Empire DB Connected'));

// --- المخططات الذكية ---
const UserSchema = new mongoose.Schema({
    id: { type: Number, unique: true },
    name: String, refCode: String, referrer: Number,
    // الملف الشخصي
    fullName: String, phone: String, 
    paymentMethod: String, paymentAccount: String, paymentPassword: String,
    paymentLocked: { type: Boolean, default: false },
    // النظام المالي
    balance: { type: Number, default: 0.00 },
    totalEarned: { type: Number, default: 0.00 },
    // نظام الألعاب (Gamification)
    xp: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    badge: { type: String, default: "مبتدئ" },
    // الأمان
    isBanned: { type: Boolean, default: false },
    joinedAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', UserSchema);

const TaskSchema = new mongoose.Schema({
    title: String, url: String, 
    price: Number, // ما يدفعه المعلن
    reward: Number, // ما يأخذه المستخدم (محسوب: Price - Tax)
    seconds: Number, active: { type: Boolean, default: true }
});
const Task = mongoose.model('Task', TaskSchema);

// سجل الفواتير (شفافية تامة)
const InvoiceSchema = new mongoose.Schema({
    userId: Number, type: String, // earning, transfer, withdraw
    amount: Number, details: String, date: { type: Date, default: Date.now }
});
const Invoice = mongoose.model('Invoice', InvoiceSchema);

// المنشورات (نظام فيسبوك المصغر)
const PostSchema = new mongoose.Schema({
    type: String, // news, proof
    content: String, date: { type: Date, default: Date.now }
});
const Post = mongoose.model('Post', PostSchema);

// --- السيرفر ---
const app = express();
app.use(express.json());
app.use(cors());
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(rateLimit({ windowMs: 15*60*1000, max: 200 })); // حماية

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// --- منطق المستويات ---
function updateLevel(user) {
    const newLevel = Math.floor(Math.sqrt(user.xp / 50)) + 1;
    if (newLevel > user.level) {
        user.level = newLevel;
        // ترقية الشارة
        if (newLevel >= 5) user.badge = "محترف 🥈";
        if (newLevel >= 10) user.badge = "خبير 🥇";
        if (newLevel >= 20) user.badge = "إمبراطور 👑";
    }
    return user;
}

// --- APIs ---

// 1. البيانات الشاملة
app.get('/api/user/:id', async (req, res) => {
    let user = await User.findOne({ id: req.params.id });
    if (!user) return res.json({ notFound: true });
    res.json(user);
});

// 2. المجتمع (Facebook Lite)
app.get('/api/community', async (req, res) => {
    // جلب آخر المنشورات + آخر السحوبات كإثبات
    const posts = await Post.find().sort({ date: -1 }).limit(5);
    const proofs = await Invoice.find({ type: 'withdraw' }).sort({ date: -1 }).limit(5);
    res.json({ posts, proofs });
});

// 3. إنجاز مهمة (الربح الحلال)
app.post('/api/claim', async (req, res) => {
    const { userId, taskId } = req.body;
    const task = await Task.findById(taskId);
    let user = await User.findOne({ id: userId });

    if (!task || !task.active || !user) return res.json({ error: "خطأ" });

    // العملية الحسابية
    user.balance += task.reward;
    user.totalEarned += task.reward;
    user.xp += 10; // نقاط خبرة
    user = updateLevel(user);
    
    await user.save();
    
    // تسجيل فاتورة (سجل)
    await Invoice.create({ userId, type: 'earning', amount: task.reward, details: `مهمة: ${task.title}` });

    // عمولة الإحالة (صدقة جارية للمدعو)
    if (user.referrer) {
        const refReward = task.reward * 0.10; // 10% من ربح المستخدم (ليس خصماً منه بل من النظام)
        await User.findOneAndUpdate({ id: user.referrer }, { $inc: { balance: refReward } });
    }

    res.json({ success: true, msg: "تم إضافة الأجر", newLvl: user.level });
});

// 4. التحويل بين الأصدقاء (P2P)
app.post('/api/transfer', async (req, res) => {
    const { senderId, receiverRef, amount, pass } = req.body;
    const val = parseFloat(amount);
    const sender = await User.findOne({ id: senderId });

    if (!sender || sender.paymentPassword !== pass) return res.json({ error: "كلمة المرور خاطئة" });
    if (sender.balance < val || val < 50) return res.json({ error: "الرصيد غير كافٍ" });

    const receiver = await User.findOne({ refCode: receiverRef });
    if (!receiver) return res.json({ error: "المستلم غير موجود" });

    sender.balance -= val;
    receiver.balance += val;
    
    await sender.save();
    await receiver.save();

    await Invoice.create({ userId: sender.id, type: 'transfer_out', amount: -val, details: `إرسال لـ ${receiver.name}` });
    await Invoice.create({ userId: receiver.id, type: 'transfer_in', amount: val, details: `استلام من ${sender.name}` });

    bot.telegram.sendMessage(receiver.id, `🔔 وصلك ${val} DZD من ${sender.name}`);
    res.json({ success: true, msg: "تم التحويل" });
});

// 5. التسجيل والمهام
app.post('/api/register', async (req, res) => {
    const { userId, fullName, phone, address, method, account, pass } = req.body;
    await User.findOneAndUpdate({ id: userId }, { 
        fullName, phone, address, paymentMethod: method, paymentAccount: account, paymentPassword: pass, paymentLocked: true 
    }, { upsert: true });
    res.json({ success: true });
});

app.get('/api/tasks', async (req, res) => {
    const tasks = await Task.find({ active: true }).sort({ _id: -1 });
    res.json(tasks);
});

// 6. السجل (الفواتير)
app.get('/api/invoices/:id', async (req, res) => {
    const list = await Invoice.find({ userId: req.params.id }).sort({ date: -1 }).limit(20);
    res.json(list);
});

// أدمن (إضافة مهام ومنشورات)
app.post('/api/admin', async (req, res) => {
    if (req.body.password !== ADMIN_PASS) return res.json({ error: "Auth Error" });
    const { action, payload } = req.body;
    
    if (action === 'add_task') {
        const reward = payload.price * 0.70; // النظام يحسب ربح المستخدم تلقائياً
        await Task.create({ ...payload, reward });
    }
    if (action === 'add_post') {
        await Post.create(payload);
    }
    res.json({ success: true });
});

app.listen(PORT, () => console.log(`🚀 Empire running on ${PORT}`));

// البوت
const bot = new Telegraf(BOT_TOKEN);
bot.start(async (ctx) => {
    const user = ctx.from;
    let dbUser = await User.findOne({ id: user.id });
    if (!dbUser) await User.create({ id: user.id, name: user.first_name, refCode: user.id });
    
    ctx.reply(
        `🏛 **مرحباً بك في إمبراطورية ${user.first_name}**\n\n` +
        `💼 نظام عمل حقيقي\n📈 مستويات وترقيات\n🤝 مجتمع وتواصل\n\n` +
        `👇 ابدأ بناء ثروتك:`,
        Markup.keyboard([[Markup.button.webApp("📱 دخول الإمبراطورية", `${APP_URL}/?uid=${user.id}`)]]).resize()
    );
});
bot.launch();