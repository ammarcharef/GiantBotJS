require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet'); // حماية إضافية

// --- 1. إعدادات النظام ---
const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGO_URL = process.env.MONGO_URL;
const ADMIN_PASS = process.env.ADMIN_PASSWORD || "123";
const PORT = process.env.PORT || 3000;
const APP_URL = process.env.RENDER_EXTERNAL_URL; 

// --- 2. قاعدة البيانات ---
mongoose.connect(MONGO_URL)
    .then(() => console.log('✅ DB Connected'))
    .catch(err => console.log('❌ DB Error:', err));

const UserSchema = new mongoose.Schema({
    id: { type: Number, unique: true },
    name: String,
    balance: { type: Number, default: 0.0 },
    joinedAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', UserSchema);

const TaskSchema = new mongoose.Schema({
    title: String,
    url: String,
    fullPrice: Number, // السعر الكامل من المعلن
    seconds: Number,
    active: { type: Boolean, default: true }
});
const Task = mongoose.model('Task', TaskSchema);

// --- 3. السيرفر والموقع (Express) ---
const app = express();
app.use(express.json());
app.use(cors());
app.use(helmet({ contentSecurityPolicy: false })); // السماح بسكربتات تيلجرام
app.use(express.static(path.join(__dirname, 'public')));

// API: جلب المهام للمستخدم
app.get('/api/tasks', async (req, res) => {
    try {
        const tasks = await Task.find({ active: true }).sort({ _id: -1 });
        // نرسل للمستخدم فقط 70% من السعر
        const secureTasks = tasks.map(t => ({
            id: t._id,
            title: t.title,
            reward: (t.fullPrice * 0.70).toFixed(2), // حساب النسبة
            seconds: t.seconds,
            url: t.url
        }));
        res.json(secureTasks);
    } catch (e) { res.status(500).json({ error: "Error fetching tasks" }); }
});

// API: استلام الأرباح (النقطة الحساسة)
app.post('/api/claim', async (req, res) => {
    const { userId, taskId } = req.body;
    if (!userId || !taskId) return res.status(400).json({ error: "Missing data" });

    try {
        const task = await Task.findById(taskId);
        if (!task || !task.active) return res.status(400).json({ error: "Task invalid" });

        // حساب الأرباح في السيرفر (آمن)
        const userShare = task.fullPrice * 0.70;
        const systemShare = task.fullPrice * 0.30;

        // تحديث رصيد المستخدم
        await User.findOneAndUpdate(
            { id: userId },
            { $inc: { balance: userShare } }
        );

        // (اختياري) يمكن تسجيل حصة النظام في قاعدة البيانات هنا

        res.json({ success: true, added: userShare, msg: "تم إضافة الرصيد بنجاح" });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Transaction failed" });
    }
});

// API: إضافة مهام (أدمن)
app.post('/api/admin/add', async (req, res) => {
    const { password, title, url, price, seconds } = req.body;
    if (password !== ADMIN_PASS) return res.status(403).json({ error: "Wrong Password" });
    
    await Task.create({ title, url, fullPrice: price, seconds });
    res.json({ success: true });
});

// API: معلومات المستخدم
app.get('/api/user/:id', async (req, res) => {
    const user = await User.findOne({ id: req.params.id });
    res.json({ balance: user ? user.balance : 0 });
});

// تشغيل السيرفر
app.listen(PORT, () => console.log(`🚀 Server ready on port ${PORT}`));

// --- 4. البوت (Telegraf) ---
const bot = new Telegraf(BOT_TOKEN);

bot.start(async (ctx) => {
    const { id, first_name } = ctx.from;
    // تسجيل المستخدم إن لم يكن موجوداً
    let user = await User.findOne({ id });
    if (!user) await User.create({ id, name: first_name });

    ctx.reply(
        `مرحباً ${first_name}! 🇩🇿\nفي منصة الأرباح العملاقة.\nاضغط "دخول المنصة" للبدء.`,
        Markup.keyboard([
            [Markup.button.webApp("📱 دخول المنصة", `${APP_URL}/index.html`)],
            ["💰 رصيدي", "💳 سحب الأرباح"],
            ["🆘 الدعم الفني"]
        ]).resize()
    );
});

bot.hears("💰 رصيدي", async (ctx) => {
    const user = await User.findOne({ id: ctx.from.id });
    const bal = user ? user.balance.toFixed(2) : "0.00";
    ctx.reply(`💰 رصيدك الحالي: ${bal} DZD`);
});

bot.hears("💳 سحب الأرباح", (ctx) => {
    ctx.reply("لطلب السحب، يرجى الدخول للمنصة 📱 واختيار صفحة المحفظة.", 
        Markup.inlineKeyboard([
            Markup.button.webApp("فتح المحفظة 💳", `${APP_URL}/wallet.html`)
        ])
    );
});

bot.launch();
console.log("🤖 Bot Started");

// التعامل مع الإغلاق
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));