require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');

// الإعدادات
const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGO_URL = process.env.MONGO_URL;
const ADMIN_PASS = process.env.ADMIN_PASSWORD || "123";
const PORT = process.env.PORT || 3000;
const APP_URL = process.env.RENDER_EXTERNAL_URL; 

// قاعدة البيانات
mongoose.connect(MONGO_URL)
    .then(() => console.log('✅ Connected to MongoDB'))
    .catch(err => console.error('❌ DB Error:', err));

const UserSchema = new mongoose.Schema({
    id: { type: Number, unique: true },
    name: String, refCode: String, referrer: Number,
    fullName: String, phone: String, address: String,
    paymentMethod: String, paymentAccount: String, paymentPassword: String,
    paymentLocked: { type: Boolean, default: false },
    balance: { type: Number, default: 0.0 },
    isBanned: { type: Boolean, default: false },
    joinedAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', UserSchema);

const TaskSchema = new mongoose.Schema({
    title: String, url: String, fullPrice: Number, seconds: Number,
    active: { type: Boolean, default: true }
});
const Task = mongoose.model('Task', TaskSchema);

// السيرفر
const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// APIs
app.get('/api/user/:id', async (req, res) => {
    let user = await User.findOne({ id: req.params.id });
    res.json(user || { error: "Not found" });
});

app.post('/api/register', async (req, res) => {
    try {
        const { userId, fullName, phone, address, method, account, pass } = req.body;
        let user = await User.findOne({ id: userId });
        if(!user) { 
             user = await User.create({ id: userId, name: fullName, refCode: userId });
        }
        if (user.paymentLocked) return res.json({ error: "البيانات مقفلة مسبقاً" });

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
    if (!task) return res.json({ error: "Error" });
    
    const reward = task.fullPrice * 0.70;
    const user = await User.findOneAndUpdate({ id: userId }, { $inc: { balance: reward } }, {new: true});
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

// --- البوت (التعديل الجذري هنا) ---
const bot = new Telegraf(BOT_TOKEN);

bot.start(async (ctx) => {
    const user = ctx.from;
    // التأكد من وجود المستخدم في قاعدة البيانات
    let dbUser = await User.findOne({ id: user.id });
    if (!dbUser) await User.create({ id: user.id, name: user.first_name, refCode: user.id });
    
    // ✅ الحل السحري: إرسال الآيدي في الرابط نفسه
    const webLink = `${APP_URL}/?uid=${user.id}`;

    ctx.reply(
        `✨ أهلاً بك ${user.first_name} 🇩🇿\n🆔 كودك: \`${user.id}\`\n\n👇 اضغط للدخول المباشر`,
        Markup.keyboard([
            [Markup.button.webApp("📱 دخول المنصة", webLink)]
        ]).resize()
    );
});

bot.launch();
