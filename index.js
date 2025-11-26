require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');

// --- إعدادات ---
const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGO_URL = process.env.MONGO_URL;
const ADMIN_PASS = process.env.ADMIN_PASSWORD;
const PORT = process.env.PORT;
const APP_URL = process.env.RENDER_EXTERNAL_URL; 

// --- قاعدة البيانات ---
mongoose.connect(MONGO_URL)
    .then(() => console.log('✅ Connected to MongoDB'))
    .catch(err => console.error('❌ DB Error:', err));

const UserSchema = new mongoose.Schema({
    id: { type: Number, unique: true },
    name: String,
    refCode: String,
    referrer: Number, // آيدي الشخص الذي دعاه
    
    // البيانات الشخصية والمالية
    fullName: String,
    phone: String,
    address: String,
    paymentMethod: String,
    paymentAccount: String,
    paymentPassword: String,
    paymentLocked: { type: Boolean, default: false }, // هل البيانات مقفلة؟

    balance: { type: Number, default: 0.0 },
    isBanned: { type: Boolean, default: false },
    joinedAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', UserSchema);

const TaskSchema = new mongoose.Schema({
    title: String,
    url: String,
    fullPrice: Number,
    seconds: Number,
    active: { type: Boolean, default: true }
});
const Task = mongoose.model('Task', TaskSchema);

// --- السيرفر ---
const app = express();
app.use(express.json());
app.use(cors());
// هام: تقديم الملفات الثابتة
app.use(express.static(path.join(__dirname, 'public')));

// هام جداً: المسار الرئيسي يوجه لصفحة الويب
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- APIs ---

// 1. جلب بيانات المستخدم أو إنشاؤه
app.get('/api/user/:id', async (req, res) => {
    let user = await User.findOne({ id: req.params.id });
    if (!user) return res.json({ error: "Not found" });
    res.json(user);
});

// 2. تحديث البيانات (التسجيل)
app.post('/api/register', async (req, res) => {
    try {
        const { userId, fullName, phone, address, method, account, pass } = req.body;
        
        console.log("Registering user:", userId); // تسجيل في السجلات للمراقبة

        // محاولة العثور على المستخدم
        let user = await User.findOne({ id: userId });
        
        // ⚠️ الإصلاح هنا: إذا لم يوجد المستخدم، قم بإنشائه فوراً
        if (!user) {
            console.log("User not found, creating new one...");
            user = await User.create({
                id: userId,
                name: fullName, // استخدام الاسم المدخل
                refCode: userId,
                balance: 0.0
            });
        }

        // التحقق من القفل
        if (user.paymentLocked) {
            return res.json({ success: false, error: "تم تسجيل بياناتك مسبقاً ولا يمكن تعديلها" });
        }

        // تحديث البيانات
        user.fullName = fullName;
        user.phone = phone;
        user.address = address;
        user.paymentMethod = method;
        user.paymentAccount = account;
        user.paymentPassword = pass;
        user.paymentLocked = true; // قفل البيانات لمنع التغيير
        
        await user.save();
        console.log("User registered successfully");
        
        res.json({ success: true });

    } catch (e) {
        console.error("Register Error:", e);
        res.status(500).json({ success: false, error: "خطأ داخلي في السيرفر: " + e.message });
    }
});

// 3. جلب المهام
app.get('/api/tasks', async (req, res) => {
    const tasks = await Task.find({ active: true }).sort({ _id: -1 });
    res.json(tasks.map(t => ({
        id: t._id,
        title: t.title,
        url: t.url,
        seconds: t.seconds,
        reward: (t.fullPrice * 0.70).toFixed(2) // 70% للمستخدم
    })));
});

// 4. استلام المكافأة
app.post('/api/claim', async (req, res) => {
    const { userId, taskId } = req.body;
    const user = await User.findOne({ id: userId });
    const task = await Task.findById(taskId);

    if (!user || !task) return res.json({ error: "Error" });
    if (user.isBanned) return res.json({ error: "Banned" });

    const reward = task.fullPrice * 0.70;
    const refReward = task.fullPrice * 0.10; // 10% للإحالة

    // إضافة الرصيد
    await User.findOneAndUpdate({ id: userId }, { $inc: { balance: reward } });

    // إضافة للإحالة (إن وجد)
    if (user.referrer) {
        await User.findOneAndUpdate({ id: user.referrer }, { $inc: { balance: refReward } });
    }

    res.json({ success: true, msg: "مبروك! تمت الإضافة" });
});

// 5. لوحة الأدمن (إضافة مهام وإحصائيات)
app.post('/api/admin', async (req, res) => {
    const { password, action, payload } = req.body;
    if (password !== ADMIN_PASS) return res.json({ error: "كلمة السر خاطئة" });

    if (action === 'stats') {
        const users = await User.find().sort({ balance: -1 }).limit(20);
        const tasks = await Task.find();
        res.json({ users, tasks });
    } else if (action === 'add_task') {
        await Task.create(payload);
        res.json({ success: true });
    } else if (action === 'delete_task') {
        await Task.findByIdAndDelete(payload.id);
        res.json({ success: true });
    } else if (action === 'ban_user') {
        await User.findOneAndUpdate({ id: payload.id }, { isBanned: true });
        res.json({ success: true });
    }
});

app.listen(PORT, () => console.log(`🚀 Running on port ${PORT}`));

// --- البوت ---
const bot = new Telegraf(BOT_TOKEN);

bot.start(async (ctx) => {
    const user = ctx.from;
    const args = ctx.message.text.split(' ');
    const referrerId = args[1] ? parseInt(args[1]) : null;

    let dbUser = await User.findOne({ id: user.id });
    if (!dbUser) {
        await User.create({
            id: user.id,
            name: user.first_name,
            refCode: user.id, // كود الإحالة هو الآيدي
            referrer: (referrerId && referrerId !== user.id) ? referrerId : null
        });
        dbUser = await User.findOne({ id: user.id });
    }

    ctx.reply(
        `✨ أهلاً بك في المنصة العملاقة 🇩🇿\n🆔 كودك: \`${dbUser.id}\`\n\nاضغط بالأسفل لإكمال التسجيل وبدء الربح.`,
        Markup.keyboard([
            [Markup.button.webApp("📱 دخول المنصة", `${APP_URL}/`)]
        ]).resize()
    );
});

bot.launch();


