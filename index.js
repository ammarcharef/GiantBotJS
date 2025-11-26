require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');

const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGO_URL = process.env.MONGO_URL;
const ADMIN_PASS = process.env.ADMIN_PASSWORD || "123";
const PORT = process.env.PORT || 3000;
const APP_URL = process.env.RENDER_EXTERNAL_URL; 

mongoose.connect(MONGO_URL).then(() => console.log('✅ DB Connected'));

const UserSchema = new mongoose.Schema({
    id: { type: Number, unique: true },
    name: String, refCode: String, referrer: Number,
    fullName: String, phone: String, address: String,
    paymentMethod: String, paymentAccount: String, paymentPassword: String,
    paymentLocked: { type: Boolean, default: false },
    balance: { type: Number, default: 0.0 },
    totalEarned: { type: Number, default: 0.0 }, // إجمالي ما ربحه
    lastDaily: { type: Date, default: null }, // تاريخ آخر مكافأة يومية
    tasksDone: { type: Number, default: 0 },
    isBanned: { type: Boolean, default: false },
    joinedAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', UserSchema);

const TaskSchema = new mongoose.Schema({
    title: String, url: String, fullPrice: Number, seconds: Number,
    active: { type: Boolean, default: true }
});
const Task = mongoose.model('Task', TaskSchema);

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// --- APIs الجديدة والمطورة ---

app.get('/api/user/:id', async (req, res) => {
    let user = await User.findOne({ id: req.params.id });
    res.json(user || { error: "Not found" });
});

// جلب المتصدرين (أغنى 10)
app.get('/api/leaderboard', async (req, res) => {
    const topUsers = await User.find({ isBanned: false })
        .sort({ totalEarned: -1 })
        .limit(10)
        .select('name totalEarned');
    res.json(topUsers);
});

// المكافأة اليومية
app.post('/api/daily', async (req, res) => {
    const { userId } = req.body;
    const user = await User.findOne({ id: userId });
    
    const now = new Date();
    // التحقق هل مر 24 ساعة
    if (user.lastDaily && (now - new Date(user.lastDaily)) < 86400000) {
        return res.json({ error: "لقد أخذت المكافأة اليوم، عد غداً!" });
    }

    const bonus = 5.00; // قيمة المكافأة
    user.balance += bonus;
    user.totalEarned += bonus;
    user.lastDaily = now;
    await user.save();
    
    res.json({ success: true, msg: `حصلت على ${bonus} DZD مكافأة يومية!` });
});

app.post('/api/register', async (req, res) => {
    try {
        const { userId, fullName, phone, address, method, account, pass } = req.body;
        let user = await User.findOne({ id: userId });
        if(!user) user = await User.create({ id: userId, name: fullName, refCode: userId });
        if (user.paymentLocked) return res.json({ error: "بياناتك مقفلة" });

        user.fullName = fullName; user.phone = phone; user.address = address;
        user.paymentMethod = method; user.paymentAccount = account; user.paymentPassword = pass;
        user.paymentLocked = true;
        await user.save();
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/tasks', async (req, res) => {
    const tasks = await Task.find({ active: true }).sort({ _id: -1 });
    res.json(tasks.map(t => ({
        id: t._id, title: t.title, url: t.url, seconds: t.seconds,
        reward: (t.fullPrice * 0.70).toFixed(2)
    })));
});

app.post('/api/claim', async (req, res) => {
    const { userId, taskId } = req.body;
    const task = await Task.findById(taskId);
    const user = await User.findOne({ id: userId });
    
    if (!task || user.isBanned) return res.json({ error: "Error" });
    
    const reward = task.fullPrice * 0.70;
    await User.findOneAndUpdate({ id: userId }, { 
        $inc: { balance: reward, totalEarned: reward, tasksDone: 1 } 
    });
    
    if(user.referrer) await User.findOneAndUpdate({ id: user.referrer }, { $inc: { balance: task.fullPrice * 0.10 } });
    
    res.json({ success: true, msg: "تمت الإضافة" });
});

app.post('/api/admin', async (req, res) => {
    const { password, action, payload } = req.body;
    if (password !== ADMIN_PASS) return res.json({ error: "Auth Error" });
    if (action === 'add_task') await Task.create(payload);
    res.json({ success: true });
});

app.listen(PORT, () => console.log(`🚀 Running on port ${PORT}`));

// --- أوامر البوت الجديدة ---
const bot = new Telegraf(BOT_TOKEN);

// القائمة الرئيسية للبوت
const mainMenu = Markup.keyboard([
    ["📱 دخول المنصة", "🎁 المكافأة اليومية"],
    ["👤 حسابي", "🏆 المتصدرين"],
    ["🆘 الدعم الفني", "🔗 رابط الإحالة"]
]).resize();

bot.start(async (ctx) => {
    const user = ctx.from;
    let dbUser = await User.findOne({ id: user.id });
    if (!dbUser) await User.create({ id: user.id, name: user.first_name, refCode: user.id });
    
    const webLink = `${APP_URL}/?uid=${user.id}`;
    
    // تعديل الزر ليكون Inline لفتح الموقع مباشرة بشكل أجمل
    ctx.reply(`👋 أهلاً بك ${user.first_name} في عالم الأرباح!\n\n👇 اختر من القائمة بالأسفل:`, mainMenu);
});

bot.hears("📱 دخول المنصة", async (ctx) => {
    const webLink = `${APP_URL}/?uid=${ctx.from.id}`;
    ctx.reply("اضغط الزر بالأسفل للدخول 👇", Markup.inlineKeyboard([
        Markup.button.webApp("🚀 فتح التطبيق", webLink)
    ]));
});

bot.hears("👤 حسابي", async (ctx) => {
    const user = await User.findOne({ id: ctx.from.id });
    if(!user) return ctx.reply("سجل أولاً!");
    ctx.reply(`📊 **معلوماتك:**\n\n💰 الرصيد: ${user.balance.toFixed(2)} DZD\n✅ المهام المنجزة: ${user.tasksDone}\n🆔 الكود: ${user.refCode}`);
});

bot.hears("🏆 المتصدرين", async (ctx) => {
    const topUsers = await User.find().sort({ totalEarned: -1 }).limit(5);
    let msg = "🏆 **أغنى 5 أعضاء:**\n\n";
    topUsers.forEach((u, i) => msg += `${i+1}. ${u.name} ➡️ ${u.totalEarned.toFixed(1)} DZD\n`);
    ctx.reply(msg);
});

bot.hears("🎁 المكافأة اليومية", (ctx) => {
    ctx.reply("🎁 لاستلام المكافأة اليومية، ادخل إلى التطبيق ثم قسم 'المكافآت'.");
});

bot.hears("🔗 رابط الإحالة", (ctx) => {
    ctx.reply(`شارك هذا الرابط واربح 10%:\nhttps://t.me/${ctx.botInfo.username}?start=${ctx.from.id}`);
});

bot.launch();
