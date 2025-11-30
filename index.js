require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

// --- إعدادات البيئة ---
const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGO_URL = process.env.MONGO_URL;
const ADMIN_PASS = process.env.ADMIN_PASSWORD || "admin2025";
const PORT = process.env.PORT || 3000;
const APP_URL = process.env.RENDER_EXTERNAL_URL;

// --- قاعدة البيانات ---
mongoose.connect(MONGO_URL)
    .then(() => console.log('✅ Empire DB Connected'))
    .catch(err => console.error('❌ DB Error:', err));

// --- الجداول (Schema) ---
const UserSchema = new mongoose.Schema({
    id: { type: Number, unique: true },
    name: String,
    refCode: String,
    referrer: Number,
    // الملف الشخصي
    fullName: String, phone: String, address: String,
    paymentMethod: String, paymentAccount: String, paymentPassword: String,
    paymentLocked: { type: Boolean, default: false },
    // المحفظة
    balance: { type: Number, default: 0.00 },
    totalEarned: { type: Number, default: 0.00 },
    xp: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    lastDaily: { type: Date, default: null },
    // الأمان
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

const TransactionSchema = new mongoose.Schema({
    userId: Number, type: String, amount: Number, details: String,
    date: { type: Date, default: Date.now }
});
const Transaction = mongoose.model('Transaction', TransactionSchema);

const WithdrawalSchema = new mongoose.Schema({
    userId: Number, userName: String, amount: Number, method: String, account: String,
    status: { type: String, default: 'pending' },
    date: { type: Date, default: Date.now }
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
// حماية: 300 طلب كل 15 دقيقة
app.use(rateLimit({ windowMs: 15*60*1000, max: 300 }));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// --- البوت ---
const bot = new Telegraf(BOT_TOKEN);

async function logTrans(userId, type, amount, details) {
    await Transaction.create({ userId, type, amount, details });
}

async function notifyUser(userId, msg) {
    try { await bot.telegram.sendMessage(userId, msg); } catch (e) {}
}

// --- APIs ---

// 1. جلب البيانات
app.get('/api/user/:id', async (req, res) => {
    let user = await User.findOne({ id: req.params.id });
    if (!user) return res.json({ notFound: true });
    
    // تحديث المستوى تلقائياً
    const newLevel = Math.floor(Math.sqrt(user.xp / 100)) + 1;
    if (newLevel > user.level) {
        user.level = newLevel;
        await user.save();
    }
    res.json(user);
});

// 2. التسجيل
app.post('/api/register', async (req, res) => {
    const { userId, fullName, phone, address, method, account, pass } = req.body;
    let user = await User.findOne({ id: userId });
    
    // إنشاء تلقائي إذا لم يوجد
    if (!user) user = await User.create({ id: userId, name: fullName, refCode: userId });
    
    if (user.paymentLocked) return res.json({ error: "البيانات محفوظة مسبقاً" });

    user.fullName = fullName; user.phone = phone; user.address = address;
    user.paymentMethod = method; user.paymentAccount = account; user.paymentPassword = pass;
    user.paymentLocked = true;
    
    await user.save();

    // إشعار المحيل
    if (user.referrer) {
        notifyUser(user.referrer, `🎉 عضو جديد في فريقك: ${fullName}\nستربح 10% من عمله.`);
    }

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

    if (!task || !user || user.isBanned) return res.json({ error: "خطأ في العملية" });

    const reward = task.fullPrice * 0.70;
    
    await User.findOneAndUpdate({ id: userId }, { 
        $inc: { balance: reward, totalEarned: reward, xp: 20 } 
    });
    
    // عمولة الإحالة
    if (user.referrer) {
        await User.findOneAndUpdate({ id: user.referrer }, { $inc: { balance: task.fullPrice * 0.10 } });
    }

    await logTrans(userId, 'task', reward, `إنجاز: ${task.title}`);
    res.json({ success: true, msg: "تم احتساب الأجر" });
});

// 4. التحويل P2P
app.post('/api/transfer', async (req, res) => {
    const { senderId, receiverRef, amount, pass } = req.body;
    const val = parseFloat(amount);
    const sender = await User.findOne({ id: senderId });

    if (!sender || sender.paymentPassword !== pass) return res.json({ error: "كلمة المرور خاطئة" });
    if (sender.balance < val || val < 10) return res.json({ error: "الرصيد غير كافٍ" });

    const receiver = await User.findOne({ refCode: receiverRef });
    if (!receiver) return res.json({ error: "المستلم غير موجود" });

    sender.balance -= val;
    receiver.balance += val;
    await sender.save();
    await receiver.save();

    await logTrans(sender.id, 'transfer_out', -val, `إرسال إلى ${receiver.name}`);
    await logTrans(receiver.id, 'transfer_in', val, `استلام من ${sender.name}`);
    
    notifyUser(receiver.id, `💸 وصلك ${val} DZD من ${sender.fullName}`);

    res.json({ success: true, msg: "تم التحويل بنجاح" });
});

// 5. الكوبون
app.post('/api/redeem', async (req, res) => {
    const { userId, code } = req.body;
    const coupon = await Coupon.findOne({ code });
    const user = await User.findOne({ id: userId });

    if (!coupon || coupon.used >= coupon.maxUses) return res.json({ error: "الكود منتهي" });
    if (user.redeemedCoupons.includes(code)) return res.json({ error: "مستخدم سابقاً" });

    user.balance += coupon.amount;
    user.redeemedCoupons.push(code);
    coupon.used += 1;
    
    await user.save();
    await coupon.save();
    await logTrans(userId, 'gift', coupon.amount, `كوبون: ${code}`);

    res.json({ success: true, msg: `+${coupon.amount} DZD هدية` });
});

// 6. المكافأة اليومية
app.post('/api/daily', async (req, res) => {
    const { userId } = req.body;
    const user = await User.findOne({ id: userId });
    const now = new Date();

    if (user.lastDaily && (now - new Date(user.lastDaily)) < 86400000) {
        return res.json({ error: "عد غداً لاستلام الهدية" });
    }

    user.balance += 5.00;
    user.lastDaily = now;
    await user.save();
    await logTrans(userId, 'daily', 5.00, "هدية يومية");
    
    res.json({ success: true, msg: "حصلت على 5 DZD" });
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
    
    await Withdrawal.create({ 
        userId, userName: user.fullName, amount: val, 
        method: user.paymentMethod, account: user.paymentAccount 
    });
    
    await logTrans(userId, 'withdraw', -val, 'طلب سحب قيد الانتظار');
    res.json({ success: true, msg: "تم إرسال الطلب للمراجعة" });
});

// 8. البيانات
app.get('/api/referrals/:id', async (req, res) => {
    const count = await User.countDocuments({ referrer: req.params.id });
    res.json({ count });
});

app.get('/api/history/:id', async (req, res) => {
    const data = await Transaction.find({ userId: req.params.id }).sort({ date: -1 }).limit(20);
    res.json(data);
});

app.get('/api/leaderboard', async (req, res) => {
    const users = await User.find({ isBanned: false }).sort({ totalEarned: -1 }).limit(10).select('fullName totalEarned level');
    res.json(users);
});

app.post('/api/settings/delete', async (req, res) => {
    const { userId, pass } = req.body;
    const user = await User.findOne({ id: userId });
    if (!user || user.paymentPassword !== pass) return res.json({ error: "كلمة المرور خاطئة" });
    await User.deleteOne({ id: userId });
    res.json({ success: true });
});

// 9. لوحة الأدمن
app.post('/api/admin', async (req, res) => {
    const { password, action, payload } = req.body;
    if (password !== ADMIN_PASS) return res.json({ error: "Auth Failed" });

    if (action === 'data') {
        const stats = { users: await User.countDocuments(), withdraws: await Withdrawal.countDocuments({ status: 'pending' }) };
        const withdrawals = await Withdrawal.find().sort({ date: -1 }).limit(50);
        const usersList = await User.find().sort({ balance: -1 }).limit(50);
        res.json({ stats, withdrawals, usersList });
    }
    
    if (action === 'add_task') {
        const userReward = payload.fullPrice * 0.70;
        await Task.create({ ...payload, userReward });
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
            await logTrans(w.userId, 'refund', w.amount, 'سحب مرفوض');
            notifyUser(w.userId, `❌ تم رفض طلب السحب ${w.amount} DZD.`);
        } else {
            notifyUser(w.userId, `✅ تم دفع ${w.amount} DZD لحسابك!`);
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

// --- نظام الشركات الخارجية (CPA Postback) ---

// سعر صرف الدولار مقابل الدينار (لأن الشركات تدفع بالدولار)
const USD_TO_DZD = 200; 

// هذا الرابط تعطيه لشركة الإعلانات في خانة Postback URL
// الرابط سيكون: https://YOUR-APP.onrender.com/api/postback?uid={subid}&amt={payout}&secret=MY_SECRET_KEY
app.get('/api/postback', async (req, res) => {
    // نستقبل البيانات من الشركة
    const { uid, amt, secret, ip } = req.query;

    // 1. الحماية: التأكد أن الطلب من الشركة وليس من هاكر
    // يجب أن تضع كلمة سر في إعدادات الشركة وتطابقها هنا
    if (secret !== "MY_SUPER_SECRET_KEY") {
        console.log("ماولة اختراق للبوست باك!");
        return res.status(403).send("Invalid Secret");
    }

    try {
        const user = await User.findOne({ id: uid });
        if (!user) return res.status(404).send("User not found");

        // 2. الحسابات المالية
        const profitInUSD = parseFloat(amt); // الربح بالدولار من الشركة
        const profitInDZD = profitInUSD * USD_TO_DZD; // تحويل للدينار

        const userShare = profitInDZD * 0.70; // حصة المستخدم
        // الـ 30% الباقية تبقى في حسابك في الشركة، لا نحتاج لتسجيلها هنا

        // 3. إضافة الرصيد
        user.balance += userShare;
        user.totalEarned += userShare;
        user.xp += 50; // نقاط خبرة عالية للعروض
        
        // ترقية المستوى
        const newLevel = Math.floor(Math.sqrt(user.xp / 100)) + 1;
        if (newLevel > user.level) user.level = newLevel;

        await user.save();

        // 4. مكافأة الإحالة (5% من أرباح الشركات)
        if (user.referrer) {
            await User.findOneAndUpdate({ id: user.referrer }, { $inc: { balance: profitInDZD * 0.05 } });
        }

        // 5. التسجيل في السجل
        await logTrans(user.id, 'cpa_offer', userShare, `إتمام عرض خارجي ($${profitInUSD})`);

        // 6. إشعار المستخدم
        notifyUser(user.id, `🔥 مبروك! تم احتساب عرض خارجي.\nربحت: ${userShare.toFixed(2)} DZD`);

        console.log(`Postback Success: User ${uid} earned ${userShare} DZD`);
        res.status(200).send("OK");

    } catch (e) {
        console.error("Postback Error:", e);
        res.status(500).send("Error");
    }
});

// تشغيل
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Empire OS Online on ${PORT}`));

// البوت
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
        `🏛 **منصة ${user.first_name} للخدمات** 🇩🇿\n\n` +
        `✅ ربح حلال ومضمون\n` +
        `🆔 كودك: \`${user.id}\`\n\n` +
        `👇 اضغط للدخول والبدء:`, 
        Markup.keyboard([[Markup.button.webApp("📱 دخول المنصة", webLink)]]).resize()
    );
});
bot.launch().catch(err => console.log("Bot Error:", err));

// ... (أضف هذا مع باقي الـ APIs)

// API خاص بمكافأة إعلانات Monetag
app.post('/api/ad_reward', async (req, res) => {
    const { userId } = req.body;
    // إضافة 2 دينار مكافأة مشاهدة
    await User.findOneAndUpdate({ id: userId }, { 
        $inc: { balance: 2.00, totalEarned: 2.00, xp: 5 } 
    });
    
    // تسجيل المعاملة
    await logTrans(userId, 'ad_view', 2.00, 'مشاهدة إعلان');
    
    res.json({ success: true });
});

// ...