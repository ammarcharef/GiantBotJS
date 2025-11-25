// تهيئة تيلجرام
let tg = window.Telegram.WebApp;
tg.expand(); // توسيع النافذة لتملأ الشاشة

// بيانات المستخدم والمهام (محاكاة لما سيأتي من قاعدة البيانات)
const mockUser = {
    name: tg.initDataUnsafe.user?.first_name || "زائر كريم",
    photo: tg.initDataUnsafe.user?.photo_url || "https://cdn-icons-png.flaticon.com/512/149/149071.png",
    balance: 0.00
};

// قائمة المهام (لاحظ: السعر هنا هو حصة المستخدم 70% فقط)
// النظام في الخلفية يحسب الـ 30% تلقائياً
const tasks = [
    { id: 1, title: "زيارة موقع إسلامي", reward: 15.00, time: 10, url: "https://google.com" },
    { id: 2, title: "اشتراك في قناة تعليمية", reward: 20.00, time: 15, url: "#" },
    { id: 3, title: "مشاهدة منتج جديد", reward: 10.00, time: 5, url: "#" }
];

// عند تحميل الصفحة
document.addEventListener("DOMContentLoaded", () => {
    // 1. تعيين بيانات المستخدم
    document.getElementById("username").innerText = mockUser.name;
    document.getElementById("user-avatar").src = mockUser.photo;
    
    // 2. تحميل المهام
    loadTasks();
});

function loadTasks() {
    const container = document.getElementById("tasks-container");
    container.innerHTML = ""; // مسح التحميل

    tasks.forEach(task => {
        const taskHTML = `
            <div class="task-card">
                <div class="task-info">
                    <h4>${task.title}</h4>
                    <span class="task-reward">+${task.reward} DZD</span>
                </div>
                <button class="btn-start" onclick="startTask(${task.id}, ${task.time}, '${task.url}')">
                    بدء <i class="fas fa-play"></i>
                </button>
            </div>
        `;
        container.innerHTML += taskHTML;
    });
}

// --- نظام المؤقت ومنع الغش ---
let timerInterval;
let timeLeft;
let isTabActive = true;

// كشف مغادرة الصفحة (Anti-Cheat)
document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
        isTabActive = false;
        // يمكن إضافة تحذير هنا أو إيقاف المؤقت
    } else {
        isTabActive = true;
    }
});

function startTask(id, time, url) {
    // فتح الرابط (الإعلان) في نافذة جديدة
    // Telegram WebApp يفضل openLink
    tg.openLink(url);

    // إظهار العداد
    const modal = document.getElementById("ad-modal");
    modal.classList.remove("hidden");
    
    timeLeft = time;
    updateTimerDisplay();

    const claimBtn = document.getElementById("claim-btn");
    claimBtn.disabled = true;
    claimBtn.className = "btn-disabled";
    claimBtn.innerText = "جاري التحقق...";

    // بدء العد التنازلي
    timerInterval = setInterval(() => {
        if (!isTabActive) return; // إيقاف العد إذا خرج المستخدم

        timeLeft--;
        updateTimerDisplay();

        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            enableClaim(id);
        }
    }, 1000);
}

function updateTimerDisplay() {
    document.getElementById("countdown").innerText = timeLeft;
}

function enableClaim(taskId) {
    const btn = document.getElementById("claim-btn");
    btn.disabled = false;
    btn.className = "btn-disabled btn-active"; // تغيير اللون للأخضر
    btn.innerText = "💰 استلام المكافأة";
    
    // عند الضغط على استلام
    btn.onclick = () => {
        // هنا سيتم إرسال طلب للخادم (Python) لتسجيل الربح
        // سنبرمج هذا الجزء في الخطوة القادمة (API)
        alert("تمت إضافة المكافأة لرصيدك!");
        document.getElementById("ad-modal").classList.add("hidden");
        
        // تحديث الرصيد (وهمي حالياً)
        let currentBal = parseFloat(document.getElementById("balance").innerText);
        let task = tasks.find(t => t.id === taskId);
        document.getElementById("balance").innerText = (currentBal + task.reward).toFixed(2);
    };
}