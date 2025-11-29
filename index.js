require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

// --- إعدادات الإمبراطورية ---
const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGO_URL = process.env.MONGO_URL;
const ADMIN_PASS = process.env.ADMIN_PASSWORD || "admin123";
const PORT = process.env.PORT || 3000;
const APP_URL = process.env.RENDER_EXTERNAL_URL;

mongoose.connect(MONGO_URL).then(() => console.log('✅ Empire Database Connected'));

// --- المخططات البيانية (Database Schemas) ---
const UserSchema = new mongoose.Schema({
    id: { type: Number, unique: true },
    name: String, refCode: String, referrer: Number,
    // الملف الشخصي
    fullName: String, phone: String, address: String,
    paymentMethod: String, paymentAccount: String, paymentPassword: String,
    paymentLocked: { type: Boolean, default: false },
    // المحفظة
    balance: { type: Number, default: 0.00 }, // للسحب
    adBalance: { type: Number, default: 0.00 }, // للإعلانات (لا يسحب)
    totalEarned: { type: Number, default: 0.00 },
    // المستويات
    xp: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    // الأمان والإدارة
    redeemedCoupons: [String],
    isBanned: { type: Boolean, default: false },
    banReason: String,
    lastActive: { type: Date, default: Date.now },
    joinedAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', UserSchema);

const TaskSchema = new mongoose.Schema({
    title: String, url: String, 
    price: Number, // تكلفة المعلن
    reward: Number, // ربح المستخدم
    seconds: Number, 
    totalClicks: { type: Number, default: 0 },
    maxClicks: Number, // حد أقصى للنقرات
    active: { type: Boolean, default: true }
});
const Task = mongoose.model('Task', TaskSchema);

const WithdrawalSchema = new mongoose.Schema({
    userId: Number, userName: String, amount: Number, method: String, account: String,
    status: { type: String, default: 'pending' }, date: { type: Date, default: Date.now }
});
const Withdrawal = mongoose.model('Withdrawal', WithdrawalSchema);

const CouponSchema = new mongoose.Schema({
    code: String, amount: Number, maxUses: Number, used: { type: Number, default: 0 }
});
const Coupon = mongoose.model('Coupon', CouponSchema);

// --- السيرفر ---
const app = express();
app.use(compression());
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(rateLimit({ windowMs: 15*60*1000, max: 500 })); // حماية ضد الهجمات

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// --- Helper Functions ---
async function notifyUser(userId, msg) {
    try { await bot.telegram.sendMessage(userId, msg); } catch (e) {}
}

// --- APIs العملاقة ---

// 1. جلب بيانات المستخدم الشاملة
app.get('/api/user/:id', async (req, res) => {
    let user = await User.findOne({ id: req.params.id });
    if (!user) return res.json({ notFound: true });
    
    // تحديث النشاط والمستوى
    user.lastActive = Date.now();
    const newLevel = Math.floor(Math.sqrt(user.xp / 100)) + 1;
    if (newLevel > user.level) user.level = newLevel;
    await user.save();
    
    res.json(user);
});

// 2. التسجيل والتوثيق
app.post('/api/register', async (req, res) => {
    const { userId, fullName, phone, address, method, account, pass } = req.body;
    let user = await User.findOne({ id: userId });
    
    if (!user) user = await User.create({ id: userId, name: fullName, refCode: userId });
    if (user.paymentLocked) return res.json({ error: "البيانات محفوظة مسبقاً ولا يمكن تعديلها" });

    user.fullName = fullName; user.phone = phone; user.address = address;
    user.paymentMethod = method; user.paymentAccount = account; user.paymentPassword = pass;
    user.paymentLocked = true;
    
    await user.save();
    
    if (user.referrer) {
        await notifyUser(user.referrer, `🎉 عضو جديد في فريقك: ${fullName}\nستربح 10% من عمله.`);
    }
    res.json({ success: true });
});

// 3. نظام المهام الذكي
app.get('/api/tasks', async (req, res) => {
    // جلب المهام التي لم تصل للحد الأقصى
    const tasks = await Task.find({ active: true }).sort({ _id: -1 });
    // تصفية المهام المنتهية
    const validTasks = tasks.filter(t => !t.maxClicks || t.totalClicks < t.maxClicks);
    res.json(validTasks);
});

app.post('/api/claim', async (req, res) => {
    const { userId, taskId } = req.body;
    const task = await Task.findById(taskId);
    const user = await User.findOne({ id: userId });

    if (!task || !user || user.isBanned) return res.json({ error: "عملية مرفوضة" });
    if (task.maxClicks && task.totalClicks >= task.maxClicks) return res.json({ error: "انتهت المهمة" });

    // زيادة الرصيد
    const reward = task.reward;
    await User.findOneAndUpdate({ id: userId }, { 
        $inc: { balance: reward, totalEarned: reward, xp: 15 } 
    });
    
    // تحديث المهمة
    await Task.findByIdAndUpdate(taskId, { $inc: { totalClicks: 1 } });

    // عمولة الإحالة (10%)
    if (user.referrer) {
        await User.findOneAndUpdate({ id: user.referrer }, { $inc: { balance: reward * 0.10 } });
    }

    res.json({ success: true, msg: "تمت إضافة الأجر" });
});

// 4. نظام التحويل المالي (P2P)
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

    await notifyUser(receiver.id, `💸 وصلك ${val} DZD من ${sender.fullName}`);
    res.json({ success: true, msg: "تم التحويل بنجاح" });
});

// 5. نظام الكوبونات
app.post('/api/redeem', async (req, res) => {
    const { userId, code } = req.body;
    const coupon = await Coupon.findOne({ code });
    const user = await User.findOne({ id: userId });

    if (!coupon || coupon.used >= coupon.maxUses) return res.json({ error: "الكود منتهي" });
    if (user.redeemedCoupons.includes(code)) return res.json({ error: "تم استخدامه مسبقاً" });

    user.balance += coupon.amount;
    user.redeemedCoupons.push(code);
    coupon.used += 1;
    
    await user.save();
    await coupon.save();
    res.json({ success: true, msg: `مبروك! +${coupon.amount} DZD` });
});

// 6. المكافأة اليومية
app.post('/api/daily', async (req, res) => {
    const user = await User.findOne({ id: req.body.userId });
    const now = new Date();
    if (user.lastDaily && (now - new Date(user.lastDaily)) < 86400000) return res.json({ error: "عد غداً" });
    
    user.balance += 5.00;
    user.lastDaily = now;
    await user.save();
    res.json({ success: true, msg: "هدية يومية: 5 DZD" });
});

// 7. نظام السحب الصارم
app.post('/api/withdraw', async (req, res) => {
    const { userId, amount, pass } = req.body;
    const val = parseFloat(amount);
    const user = await User.findOne({ id: userId });

    if (user.paymentPassword !== pass) return res.json({ error: "كلمة المرور خاطئة" });
    if (val < 500) return res.json({ error: "الحد الأدنى 500 DZD" });
    if (user.balance < val) return res.json({ error: "الرصيد غير كافٍ" });

    user.balance -= val;
    await user.save();
    
    await Withdrawal.create({ 
        userId, userName: user.fullName, amount: val, 
        method: user.paymentMethod, account: user.paymentAccount 
    });
    
    res.json({ success: true, msg: "تم إرسال الطلب للمراجعة" });
});

// 8. إحصائيات الإحالة
app.get('/api/referrals/:id', async (req, res) => {
    const count = await User.countDocuments({ referrer: req.params.id });
    res.json({ count });
});

// 9. المتصدرين
app.get('/api/leaderboard', async (req, res) => {
    const users = await User.find({ isBanned: false }).sort({ totalEarned: -1 }).limit(10).select('fullName totalEarned level');
    res.json(users);
});

// 10. حذف الحساب
app.post('/api/settings/delete', async (req, res) => {
    const { userId, pass } = req.body;
    const user = await User.findOne({ id: userId });
    if (!user || user.paymentPassword !== pass) return res.json({ error: "كلمة المرور خاطئة" });
    await User.deleteOne({ id: userId });
    res.json({ success: true });
});

// --- لوحة التحكم (Admin Dashboard) ---
app.post('/api/admin', async (req, res) => {
    const { password, action, payload } = req.body;
    if (password !== ADMIN_PASS) return res.json({ error: "Auth Failed" });

    if (action === 'data') {
        const stats = { 
            users: await User.countDocuments(), 
            withdraws: await Withdrawal.countDocuments({ status: 'pending' }),
            tasks: await Task.countDocuments({ active: true })
        };
        const withdrawals = await Withdrawal.find().sort({ date: -1 }).limit(50);
        const usersList = await User.find().sort({ balance: -1 }).limit(50);
        const tasksList = await Task.find().sort({ _id: -1 });
        res.json({ stats, withdrawals, usersList, tasksList });
    }
    
    if (action === 'add_task') {
        // حساب تلقائي: المستخدم يأخذ 70% من السعر
        const reward = payload.price * 0.70;
        await Task.create({ ...payload, reward });
        res.json({ success: true });
    }
    
    if (action === 'delete_task') {
        await Task.findByIdAndDelete(payload.id);
        res.json({ success: true });
    }

    if (action === 'add_coupon') {
        await Coupon.create(payload);
        res.json({ success: true });
    }
    
    if (action === 'process_withdraw') {
        const w = await Withdrawal.findById(payload.id);
        w.status = payload.status; await w.save();
        if (payload.status === 'rejected') {
            await User.findOneAndUpdate({ id: w.userId }, { $inc: { balance: w.amount } });
            await notifyUser(w.userId, `❌ تم رفض سحب ${w.amount} DZD وإعادة المبلغ.`);
        } else {
            await notifyUser(w.userId, `✅ تم دفع ${w.amount} DZD بنجاح!`);
        }
        res.json({ success: true });
    }
    
    if (action === 'manage_user') {
        const { id, type } = payload;
        if (type === 'delete') await User.deleteOne({ id: id });
        else if (type === 'ban') {
            const u = await User.findOne({ id: id });
            if(u) { u.isBanned = !u.isBanned; await u.save(); }
        }
        res.json({ success: true });
    }
});

// تشغيل السيرفر
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Empire OS Active on ${PORT}`));

// البوت
const bot = new Telegraf(BOT_TOKEN);
bot.start(async (ctx) => {
    const user = ctx.from;
    const args = ctx.message.text.split(' ');
    const referrerId = args[1] ? parseInt(args[1]) : null;

    let dbUser = await User.findOne({ id: user.id });
    if (!dbUser) {
        await User.create({ 
            id: user.id, name: user.first_name, refCode: user.id, 
            referrer: (referrerId && referrerId !== user.id) ? referrerId : null 
        });
    }
    
    const webLink = `${APP_URL}/?uid=${user.id}`;
    ctx.reply(
        `🏛 **أهلاً بك في المنصة العملاقة** 🇩🇿\n\n` +
        `👤 **العضو:** ${user.first_name}\n` +
        `🆔 **كودك:** \`${user.id}\`\n\n` +
        `💰 اربح المال الحلال عبر المهام والإحالات.\n` +
        `👇 اضغط للدخول للمنصة:`, 
        Markup.keyboard([[Markup.button.webApp("📱 دخول المنصة", webLink)]]).resize()
    );
});
bot.launch().catch(err => console.log("Bot Error:", err));