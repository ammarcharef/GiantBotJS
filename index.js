require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');

// إعدادات المشروع
const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGO_URL = process.env.MONGO_URL;
const ADMIN_PASS = process.env.ADMIN_PASSWORD || "123";
const PORT = process.env.PORT || 3000;
const APP_URL = process.env.RENDER_EXTERNAL_URL;
const BOT_NAME = "ياسين"; // <-- غير هذا الاسم لاسمك

mongoose.connect(MONGO_URL).then(() => console.log('✅ DB Connected'));

// جداول البيانات
const UserSchema = new mongoose.Schema({
    id: { type: Number, unique: true },
    name: String, refCode: String, referrer: Number,
    fullName: String, phone: String, address: String,
    paymentMethod: String, paymentAccount: String, paymentPassword: String,
    paymentLocked: { type: Boolean, default: false },
    balance: { type: Number, default: 0.0 },
    totalEarned: { type: Number, default: 0.0 },
    lastDaily: { type: Date, default: null },
    redeemedCoupons: [String],
    isBanned: { type: Boolean, default: false },
    joinedAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', UserSchema);

const TaskSchema = new mongoose.Schema({
    title: String, url: String, fullPrice: Number, seconds: Number,
    active: { type: Boolean, default: true }
});
const Task = mongoose.model('Task', TaskSchema);

const CouponSchema = new mongoose.Schema({
    code: String, amount: Number, uses: Number, maxUses: Number
});
const Coupon = mongoose.model('Coupon', CouponSchema);

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// --- APIs الشرعية ---

// 1. تحويل الأموال (هدية/سداد دين)
app.post('/api/transfer', async (req, res) => {
    const { senderId, receiverRef, amount, pass } = req.body;
    const sender = await User.findOne({ id: senderId });
    
    if (!sender || sender.paymentPassword !== pass) return res.json({ error: "كلمة المرور خاطئة" });
    if (sender.balance < amount || amount < 10) return res.json({ error: "الرصيد غير كافٍ" });

    const receiver = await User.findOne({ refCode: receiverRef });
    if (!receiver || receiver.id === sender.id) return res.json({ error: "المستلم غير موجود" });

    sender.balance -= parseFloat(amount);
    receiver.balance += parseFloat(amount);
    
    await sender.save();
    await receiver.save();
    
    // إشعار المستلم
    bot.telegram.sendMessage(receiver.id, `✅ وصلك مبلغ ${amount} DZD من ${sender.name}`);
    res.json({ success: true, msg: "تم التحويل بنجاح" });
});

// 2. الكوبونات (هدية ترويجية)
app.post('/api/redeem', async (req, res) => {
    const { userId, code } = req.body;
    const coupon = await Coupon.findOne({ code: code });
    const user = await User.findOne({ id: userId });

    if (!coupon || coupon.uses >= coupon.maxUses) return res.json({ error: "الكود منتهي" });
    if (user.redeemedCoupons.includes(code)) return res.json({ error: "استخدمته سابقاً" });

    user.balance += coupon.amount;
    user.redeemedCoupons.push(code);
    coupon.uses += 1;

    await user.save();
    await coupon.save();
    res.json({ success: true, msg: `تمت إضافة ${coupon.amount} DZD هدية لك` });
});

// 3. المكافأة اليومية (هدية ولاء)
app.post('/api/daily', async (req, res) => {
    const { userId } = req.body;
    const user = await User.findOne({ id: userId });
    const now = new Date();
    
    if (user.lastDaily && (now - new Date(user.lastDaily)) < 86400000) {
        return res.json({ error: "عد غداً للحصول على الهدية" });
    }

    const bonus = 5.00; 
    user.balance += bonus;
    user.lastDaily = now;
    await user.save();
    res.json({ success: true, msg: "استلمت هديتك اليومية!" });
});

// باقي الـ APIs الأساسية (تسجيل، مهام، سحب...)
app.get('/api/user/:id', async (req, res) => {
    let user = await User.findOne({ id: req.params.id });
    res.json(user || { error: "Not found" });
});
app.post('/api/register', async (req, res) => {
    /* (نفس كود التسجيل السابق تماماً) */
    try {
        const { userId, fullName, phone, address, method, account, pass } = req.body;
        let user = await User.findOne({ id: userId });
        if(!user) user = await User.create({ id: userId, name: fullName, refCode: userId });
        if (user.paymentLocked) return res.json({ error: "locked" });
        user.fullName = fullName; user.phone = phone; user.address = address;
        user.paymentMethod = method; user.paymentAccount = account; user.paymentPassword = pass;
        user.paymentLocked = true;
        await user.save();
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/tasks', async (req, res) => {
    const tasks = await Task.find({ active: true }).sort({ _id: -1 });
    res.json(tasks.map(t => ({ id: t._id, title: t.title, url: t.url, seconds: t.seconds, reward: (t.fullPrice * 0.70).toFixed(2) })));
});
app.post('/api/claim', async (req, res) => {
    const { userId, taskId } = req.body;
    const task = await Task.findById(taskId);
    if(!task) return res.json({ error: "Error" });
    await User.findOneAndUpdate({ id: userId }, { $inc: { balance: task.fullPrice * 0.70, totalEarned: task.fullPrice * 0.70 } });
    res.json({ success: true, msg: "تم احتساب الأجر" });
});
app.get('/api/leaderboard', async (req, res) => {
    const top = await User.find({ isBanned: false }).sort({ totalEarned: -1 }).limit(10).select('name totalEarned');
    res.json(top);
});
// أدمن لإضافة الكوبونات والمهام
app.post('/api/admin', async (req, res) => {
    const { password, action, payload } = req.body;
    if (password !== ADMIN_PASS) return res.json({ error: "Auth Error" });
    if (action === 'add_coupon') await Coupon.create(payload);
    if (action === 'add_task') await Task.create(payload);
    res.json({ success: true });
});

app.listen(PORT, () => console.log(`🚀 Running on port ${PORT}`));

// البوت
const bot = new Telegraf(BOT_TOKEN);
bot.start(async (ctx) => {
    const user = ctx.from;
    let dbUser = await User.findOne({ id: user.id });
    if (!dbUser) await User.create({ id: user.id, name: user.first_name, refCode: user.id });
    
    const webLink = `${APP_URL}/?uid=${user.id}`;
    ctx.reply(`👋 أهلاً بك يا ${user.first_name}\nفي منصة **${BOT_NAME}** الرسمية.\n\n💰 نعمل وفق ضوابط شرعية.\n👇 اضغط للدخول:`, 
        Markup.keyboard([[Markup.button.webApp("📱 فتح المنصة", webLink)]]).resize()
    );
});
bot.launch();
