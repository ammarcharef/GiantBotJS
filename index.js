require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGO_URL = process.env.MONGO_URL;
const ADMIN_PASS = process.env.ADMIN_PASSWORD || "admin2025";
const PORT = process.env.PORT || 3000;
const APP_URL = process.env.RENDER_EXTERNAL_URL;

mongoose.connect(MONGO_URL).then(() => console.log('✅ DB Connected'));

// --- الجداول ---
const UserSchema = new mongoose.Schema({
    id: { type: Number, unique: true },
    name: String, refCode: String, referrer: Number,
    fullName: String, phone: String, address: String,
    paymentMethod: String, paymentAccount: String, paymentPassword: String,
    paymentLocked: { type: Boolean, default: false },
    balance: { type: Number, default: 0.00 }, // بالدينار
    usdBalance: { type: Number, default: 0.000 }, // رصيد بالدولار (للحسابات الدقيقة)
    totalEarned: { type: Number, default: 0.00 },
    xp: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    lastDaily: { type: Date, default: null },
    isBanned: { type: Boolean, default: false },
    joinedAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', UserSchema);

// جدول الإعدادات (التحكم في الرابط والسعر)
const ConfigSchema = new mongoose.Schema({
    key: { type: String, unique: true }, // adsterra_link, ad_price_usd, usd_to_dzd
    value: String
});
const Config = mongoose.model('Config', ConfigSchema);

// باقي الجداول (Task, Transaction, etc...) كما هي...
const TaskSchema = new mongoose.Schema({ title: String, url: String, fullPrice: Number, seconds: Number, active: Boolean });
const Task = mongoose.model('Task', TaskSchema);
const TransactionSchema = new mongoose.Schema({ userId: Number, type: String, amount: Number, details: String, date: { type: Date, default: Date.now } });
const Transaction = mongoose.model('Transaction', TransactionSchema);
const WithdrawalSchema = new mongoose.Schema({ userId: Number, userName: String, amount: Number, method: String, account: String, status: String, date: { type: Date, default: Date.now } });
const Withdrawal = mongoose.model('Withdrawal', WithdrawalSchema);
const CouponSchema = new mongoose.Schema({ code: String, amount: Number, maxUses: Number, used: Number });
const Coupon = mongoose.model('Coupon', CouponSchema);

const app = express();
app.use(compression());
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(rateLimit({ windowMs: 15*60*1000, max: 300 }));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

async function logTrans(userId, type, amount, details) {
    await Transaction.create({ userId, type, amount, details });
}

// --- تهيئة الإعدادات الافتراضية ---
async function initConfig() {
    const defaults = [
        { key: 'adsterra_link', value: 'https://google.com' }, // رابط افتراضي
        { key: 'ad_price_usd', value: '0.002' }, // سعر النقرة بالدولار (تقديري)
        { key: 'usd_to_dzd', value: '220' } // سعر الصرف
    ];
    for (const d of defaults) {
        const exists = await Config.findOne({ key: d.key });
        if (!exists) await Config.create(d);
    }
}
initConfig();

// --- APIs ---

// 1. جلب إعدادات الإعلان (للمستخدم)
app.get('/api/ad-config', async (req, res) => {
    const link = await Config.findOne({ key: 'adsterra_link' });
    res.json({ link: link.value });
});

// 2. احتساب أرباح الإعلان (بالدولار والدينار والنسبة)
app.post('/api/ad_reward', async (req, res) => {
    const { userId } = req.body;
    const user = await User.findOne({ id: userId });
    if (!user) return res.json({ error: "User not found" });

    // جلب الأسعار الحالية من الأدمن
    const priceDoc = await Config.findOne({ key: 'ad_price_usd' });
    const rateDoc = await Config.findOne({ key: 'usd_to_dzd' });
    
    const priceUSD = parseFloat(priceDoc.value); // الربح الكامل من Adsterra
    const rate = parseFloat(rateDoc.value); // سعر الصرف

    // التقسيم: 70% مستخدم - 30% منصة
    const userShareUSD = priceUSD * 0.70;
    const userShareDZD = userShareUSD * rate;

    // تحديث الرصيد
    await User.findOneAndUpdate({ id: userId }, { 
        $inc: { 
            balance: userShareDZD, 
            usdBalance: userShareUSD,
            totalEarned: userShareDZD, 
            xp: 5 
        } 
    });

    await logTrans(userId, 'ad_view', userShareDZD, `مشاهدة إعلان ($${userShareUSD.toFixed(4)})`);
    res.json({ success: true, added: userShareDZD.toFixed(2) });
});

// --- لوحة الأدمن (تحديث الإعدادات) ---
app.post('/api/admin', async (req, res) => {
    const { password, action, payload } = req.body;
    if (password !== ADMIN_PASS) return res.json({ error: "Auth Failed" });

    // جلب الإعدادات الحالية
    if (action === 'get_settings') {
        const configs = await Config.find();
        const stats = { users: await User.countDocuments(), withdraws: await Withdrawal.countDocuments({ status: 'pending' }) };
        // تحويل القائمة لكائن
        const settings = {};
        configs.forEach(c => settings[c.key] = c.value);
        res.json({ stats, settings });
    }

    // تحديث الإعدادات
    if (action === 'update_settings') {
        await Config.findOneAndUpdate({ key: 'adsterra_link' }, { value: payload.link });
        await Config.findOneAndUpdate({ key: 'ad_price_usd' }, { value: payload.price });
        await Config.findOneAndUpdate({ key: 'usd_to_dzd' }, { value: payload.rate });
        res.json({ success: true });
    }

    // ... (باقي أوامر الأدمن السابقة: data, add_task, process_withdraw, manage_user تبقيها كما هي)
    if (action === 'data') { /* نفس الكود السابق */ 
         const stats = { users: await User.countDocuments(), withdraws: await Withdrawal.countDocuments({ status: 'pending' }) };
         const withdrawals = await Withdrawal.find().sort({ date: -1 }).limit(50);
         const usersList = await User.find().sort({ balance: -1 }).limit(50);
         res.json({ stats, withdrawals, usersList });
    }
    if (action === 'manage_user') { /* نفس الكود السابق */
         const { id, type } = payload;
         if (type === 'delete') await User.deleteOne({ id: id });
         else if (type === 'ban') { const u = await User.findOne({ id: id }); if(u) { u.isBanned = !u.isBanned; await u.save(); } }
         res.json({ success: true });
    }
    if (action === 'process_withdraw') { /* نفس الكود السابق */ 
         const w = await Withdrawal.findById(payload.id); w.status = payload.status; await w.save();
         if (payload.status === 'rejected') { await User.findOneAndUpdate({ id: w.userId }, { $inc: { balance: w.amount } }); await logTrans(w.userId, 'refund', w.amount, 'سحب مرفوض'); }
         res.json({ success: true });
    }
    // ... تأكد من نسخ باقي الـ APIs من الكود السابق (register, login, tasks...) لكي لا تضيع الميزات
    // (اختصرت هنا للتركيز على التغيير، لكن في ملفك اترك كل شيء كما كان)
});
// (ملاحظة: يجب نسخ باقي APIs المستخدم tasks, claim, transfer من الردود السابقة هنا)
// ...
// ...

// تشغيل السيرفر
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Empire Dynamic System on ${PORT}`));

// البوت
const bot = new Telegraf(BOT_TOKEN);
bot.start((ctx) => {
    const url = `${APP_URL}/?uid=${ctx.from.id}`;
    ctx.reply("💎 منصة الأرباح الديناميكية\nاضغط للدخول:", Markup.keyboard([[Markup.button.webApp("📱 فتح", url)]]).resize());
});
bot.launch();