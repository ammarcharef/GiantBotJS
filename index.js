require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');

// --- إعدادات الإمبراطورية ---
const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGO_URL = process.env.MONGO_URL;
const ADMIN_PASS = process.env.ADMIN_PASSWORD || "empire2025";
const PORT = process.env.PORT || 3000;
const APP_URL = process.env.RENDER_EXTERNAL_URL;

mongoose.connect(MONGO_URL).then(() => console.log('✅ Empire DB Online'));

// --- المخططات الذكية ---
const UserSchema = new mongoose.Schema({
    id: { type: Number, unique: true },
    name: String,
    // نظام التدرج (RPG Style)
    level: { type: Number, default: 1 },
    xp: { type: Number, default: 0 },
    balance: { type: Number, default: 0.00 },
    // البيانات
    fullName: String, phone: String, ccp: String,
    isBanned: { type: Boolean, default: false },
    joinedAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', UserSchema);

const TaskSchema = new mongoose.Schema({
    title: String, url: String, reward: Number, xpReward: Number, seconds: Number,
    active: { type: Boolean, default: true }
});
const Task = mongoose.model('Task', TaskSchema);

const ShopItemSchema = new mongoose.Schema({
    name: String, price: Number, description: String, image: String,
    type: { type: String, default: 'digital' } // digital, cash
});
const ShopItem = mongoose.model('ShopItem', ShopItemSchema);

const OrderSchema = new mongoose.Schema({
    userId: Number, item: String, price: Number, status: { type: String, default: 'pending' },
    date: { type: Date, default: Date.now }
});
const Order = mongoose.model('Order', OrderSchema);

// --- السيرفر فائق السرعة ---
const app = express();
app.use(compression()); // ضغط البيانات
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// --- منطق اللعبة (Gamification Logic) ---
function calculateLevel(xp) {
    return Math.floor(Math.sqrt(xp / 100)) + 1;
}

// --- APIs ---

app.get('/api/me/:id', async (req, res) => {
    let user = await User.findOne({ id: req.params.id });
    if (!user) return res.json({ error: "User not found" });
    res.json(user);
});

app.post('/api/register', async (req, res) => {
    const { userId, name, phone, ccp } = req.body;
    await User.findOneAndUpdate({ id: userId }, { fullName: name, phone, ccp }, { upsert: true });
    res.json({ success: true });
});

app.get('/api/home', async (req, res) => {
    const tasks = await Task.find({ active: true }).sort({ _id: -1 });
    const shop = await ShopItem.find();
    res.json({ tasks, shop });
});

app.post('/api/do_task', async (req, res) => {
    const { userId, taskId } = req.body;
    const task = await Task.findById(taskId);
    const user = await User.findOne({ id: userId });

    if (!task || !user) return res.json({ error: "Error" });

    // إضافة المال والخبرة
    user.balance += task.reward;
    user.xp += task.xpReward;
    
    // التحقق من ترقية المستوى
    const newLevel = calculateLevel(user.xp);
    if (newLevel > user.level) {
        user.level = newLevel;
        // مكافأة المستوى الجديد
        user.balance += (newLevel * 10); 
    }

    await user.save();
    res.json({ success: true, newBalance: user.balance, newLevel: user.level, msg: `+${task.reward} DZD | +${task.xpReward} XP` });
});

app.post('/api/buy', async (req, res) => {
    const { userId, itemId } = req.body;
    const user = await User.findOne({ id: userId });
    const item = await ShopItem.findById(itemId);

    if (user.balance < item.price) return res.json({ error: "رصيدك لا يكفي" });

    user.balance -= item.price;
    await user.save();
    await Order.create({ userId, item: item.name, price: item.price });

    // إشعار البوت
    bot.telegram.sendMessage(userId, `✅ تم استلام طلبك لشراء: ${item.name}\nسيتم التنفيذ قريباً.`);
    
    res.json({ success: true });
});

// --- لوحة القيادة (Admin) ---
app.post('/api/admin', async (req, res) => {
    if (req.body.pass !== ADMIN_PASS) return res.json({ error: "Access Denied" });
    
    const { action, payload } = req.body;
    
    if (action === 'stats') {
        const users = await User.countDocuments();
        const orders = await Order.find({ status: 'pending' });
        res.json({ users, orders });
    }
    if (action === 'add_item') {
        await ShopItem.create(payload);
        res.json({ success: true });
    }
    if (action === 'add_task') {
        await Task.create(payload);
        res.json({ success: true });
    }
    if (action === 'pay_order') {
        await Order.findByIdAndUpdate(payload.id, { status: 'completed' });
        res.json({ success: true });
    }
});

app.listen(PORT, () => console.log(`⚡ EmpireOS Active on ${PORT}`));

// --- البوت الذكي ---
const bot = new Telegraf(BOT_TOKEN);
bot.start(async (ctx) => {
    const user = ctx.from;
    let dbUser = await User.findOne({ id: user.id });
    if (!dbUser) await User.create({ id: user.id, name: user.first_name });
    
    const url = `${APP_URL}/?uid=${user.id}`;
    ctx.replyWithPhoto({ url: 'https://cdn-icons-png.flaticon.com/512/9626/9626626.png' }, {
        caption: `👋 **مرحباً بك في إمبراطورية الأرباح**\n\n🚀 نظام مستويات متطور\n💎 متجر هدايا مباشر\n🔒 سحب آمن\n\nاضغط للدخول 👇`,
        reply_markup: { inline_keyboard: [[{ text: "🚀 تشغيل النظام", web_app: { url } }]] }
    });
});
bot.launch();