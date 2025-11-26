require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// --- إعدادات النظام ---
const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGO_URL = process.env.MONGO_URL;
const ADMIN_PASS = process.env.ADMIN_PASSWORD || "admin2025";
const PORT = process.env.PORT || 3000;
const APP_URL = process.env.RENDER_EXTERNAL_URL;

// --- قاعدة البيانات ---
mongoose.connect(MONGO_URL).then(() => console.log('✅ Royal DB Connected'));

// سجل المعاملات (للمصداقية)
const TransactionSchema = new mongoose.Schema({
    userId: Number,
    type: String, // 'task', 'gift', 'transfer_in', 'transfer_out', 'withdraw'
    amount: Number,
    details: String,
    date: { type: Date, default: Date.now }
});
const Transaction = mongoose.model('Transaction', TransactionSchema);

const UserSchema = new mongoose.Schema({
    id: { type: Number, unique: true },
    name: String,
    refCode: String,
    referrer: Number,
    // البيانات
    fullName: String, phone: String, address: String,
    paymentMethod: String, paymentAccount: String, paymentPassword: String,
    paymentLocked: { type: Boolean, default: false },
    // المحفظة والرتب
    balance: { type: Number, default: 0.00 },
    totalEarned: { type: Number, default: 0.00 },
    tasksCompleted: { type: Number, default: 0 },
    rank: { type: String, default: "مبتدئ" }, // مبتدئ، محترف، خبير
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

const WithdrawalSchema = new mongoose.Schema({
    userId: Number, amount: Number, method: String, account: String,
    status: { type: String, default: 'pending' },
    date: { type: Date, default: Date.now }
});
const Withdrawal = mongoose.model('Withdrawal', WithdrawalSchema);

const CouponSchema = new mongoose.Schema({
    code: String, amount: Number, maxUses: Number, currentUses: { type: Number, default: 0 }
});
const Coupon = mongoose.model('Coupon', CouponSchema);

// --- السيرفر ---
const app = express();
app.use(express.json());
app.use(cors());
// حماية خاصة تسمح بسكربتات تيلجرام
app.use(helmet({ contentSecurityPolicy: false }));
// حماية ضد الضغط (100 طلب في 15 دقيقة)
app.use(rateLimit({ windowMs: 15*60*1000, max: 150 }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// --- دالة مساعدة لتسجيل المعاملات ---
async function logTrans(userId, type, amount, details) {
    await Transaction.create({ userId, type, amount, details });
}

// --- APIs ---

// 1. بيانات المستخدم + آخر المعاملات
app.get('/api/user/:id', async (req, res) => {
    const user = await User.findOne({ id: req.params.id });
    if (!user) return res.json({ notFound: true });
    
    // تحديث الرتبة تلقائياً
    let newRank = "مبتدئ";
    if (user.totalEarned > 5000) newRank = "خبير 💎";
    else if (user.totalEarned > 1000) newRank = "محترف 🥇";
    
    if (user.rank !== newRank) {
        user.rank = newRank;
        await user.save();
    }

    const transactions = await Transaction.find({ userId: user.id }).sort({ date: -1 }).limit(10);
    
    res.json({ ...user._doc, transactions });
});

// 2. التسجيل
app.post('/api/register', async (req, res) => {
    const { userId, fullName, phone, address, method, account, pass } = req.body;
    let user = await User.findOne({ id: userId });
    
    if (!user) user = await User.create({ id: userId, name: fullName, refCode: userId });
    if (user.paymentLocked) return res.json({ error: "البيانات محفوظة مسبقاً" });

    user.fullName = fullName; user.phone = phone; user.address = address;
    user.paymentMethod = method; user.paymentAccount = account; user.paymentPassword = pass;
    user.paymentLocked = true;
    await user.save();
    res.json({ success: true });
});

// 3. المهام
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

    if (!task || !user) return res.json({ error: "Error" });

    const reward = task.fullPrice * 0.70;
    
    // التحديث الذري للأرصدة
    await User.findOneAndUpdate({ id: userId }, { 
        $inc: { balance: reward, totalEarned: reward, tasksCompleted: 1 } 
    });
    await logTrans(userId, 'task', reward, `إنجاز مهمة: ${task.title}`);

    // الإحالة
    if (user.referrer) {
        const refReward = task.fullPrice * 0.10;
        await User.findOneAndUpdate({ id: user.referrer }, { $inc: { balance: refReward, totalEarned: refReward } });
        await logTrans(user.referrer, 'referral', refReward, `ربح من إحالة: ${user.name}`);
    }

    res.json({ success: true, msg: "تم احتساب الأجر" });
});

// 4. تحويل (سجلنا المعاملة)
app.post('/api/transfer', async (req, res) => {
    const { senderId, receiverRef, amount, pass } = req.body;
    const val = parseFloat(amount);
    const sender = await User.findOne({ id: senderId });

    if (!sender || sender.paymentPassword !== pass) return res.json({ error: "كلمة المرور خاطئة" });
    if (sender.balance < val || val < 10) return res.json({ error: "الرصيد غير كافٍ" });

    const receiver = await User.findOne({ refCode: receiverRef });
    if (!receiver || receiver.id === sender.id) return res.json({ error: "المستلم غير موجود" });

    sender.balance -= val;
    receiver.balance += val;
    await sender.save();
    await receiver.save();

    await logTrans(sender.id, 'transfer_out', -val, `إرسال إلى ${receiver.name}`);
    await logTrans(receiver.id, 'transfer_in', val, `استلام من ${sender.name}`);

    try { bot.telegram.sendMessage(receiver.id, `💰 وصلك ${val} DZD من ${sender.name}`); } catch(e){}
    res.json({ success: true });
});

// 5. الهدية اليومية (بدون قمار)
app.post('/api/daily', async (req, res) => {
    const user = await User.findOne({ id: req.body.userId });
    const now = new Date();
    if (user.lastDaily && (now - new Date(user.lastDaily)) < 86400000) return res.json({ error: "عد غداً" });

    const bonus = 5.00;
    user.balance += bonus;
    user.lastDaily = now;
    await user.save();
    await logTrans(user.id, 'gift', bonus, 'المكافأة اليومية');
    
    res.json({ success: true, msg: "استلمت الهدية" });
});

// 6. الكوبون
app.post('/api/redeem', async (req, res) => {
    const { userId, code } = req.body;
    const coupon = await Coupon.findOne({ code });
    const user = await User.findOne({ id: userId });

    if (!coupon || coupon.currentUses >= coupon.maxUses) return res.json({ error: "انتهى الكود" });
    if (user.redeemedCoupons.includes(code)) return res.json({ error: "مستخدم سابقاً" });

    user.balance += coupon.amount;
    user.redeemedCoupons.push(code);
    coupon.currentUses += 1;
    await user.save();
    await coupon.save();
    await logTrans(userId, 'gift', coupon.amount, `كوبون: ${code}`);

    res.json({ success: true, msg: "مبروك الهدية" });
});

// 7. السحب
app.post('/api/withdraw', async (req, res) => {
    const { userId, amount, pass } = req.body;
    const val = parseFloat(amount);
    const user = await User.findOne({ id: userId });

    if (user.paymentPassword !== pass) return res.json({ error: "كلمة المرور خاطئة" });
    if (user.balance < val || val < 500) return res.json({ error: "الرصيد غير كافٍ" });

    user.balance -= val;
    await user.save();
    await Withdrawal.create({ userId, amount: val, method: user.paymentMethod, account: user.paymentAccount });
    await logTrans(userId, 'withdraw', -val, 'طلب سحب قيد المراجعة');

    res.json({ success: true });
});

// 8. المتصدرين
app.get('/api/leaderboard', async (req, res) => {
    const users = await User.find({ isBanned: false }).sort({ totalEarned: -1 }).limit(10).select('name totalEarned rank');
    res.json(users);
});

// 9. أدمن
app.post('/api/admin', async (req, res) => {
    const { password, action, payload } = req.body;
    if (password !== ADMIN_PASS) return res.json({ error: "Auth Error" });

    if (action === 'data') {
        const stats = { users: await User.countDocuments(), withdrawalPending: await Withdrawal.countDocuments({status:'pending'}) };
        const withdrawals = await Withdrawal.find().sort({date:-1}).limit(50);
        const tasks = await Task.find();
        res.json({ stats, withdrawals, tasks });
    }
    if (action === 'add_task') {
        await Task.create(payload);
        res.json({ success: true });
    }
    if (action === 'process_withdraw') {
        const w = await Withdrawal.findById(payload.id);
        w.status = payload.status;
        await w.save();
        if (payload.status === 'rejected') {
            await User.findOneAndUpdate({ id: w.userId }, { $inc: { balance: w.amount } });
            await logTrans(w.userId, 'refund', w.amount, 'إرجاع سحب مرفوض');
        }
        res.json({ success: true });
    }
});

app.listen(PORT, () => console.log(`🚀 Royal Server on ${PORT}`));

// --- البوت ---
const bot = new Telegraf(BOT_TOKEN);
bot.start(async (ctx) => {
    const user = ctx.from;
    let dbUser = await User.findOne({ id: user.id });
    if (!dbUser) await User.create({ id: user.id, name: user.first_name, refCode: user.id });
    
    const webLink = `${APP_URL}/?uid=${user.id}`;
    ctx.reply(
        `👑 **منصة النخبة للخدمات** 🇩🇿\n\n` +
        `👤 **العضو:** ${user.first_name}\n` +
        `🆔 **المعرف:** \`${user.id}\`\n\n` +
        `💰 نظام آمن، حلال، ومربح.\n👇 ابدأ رحلتك نحو القمة:`,
        Markup.keyboard([[Markup.button.webApp("💎 دخول المنصة الملكية", webLink)]]).resize()
    );
});
bot.launch();
