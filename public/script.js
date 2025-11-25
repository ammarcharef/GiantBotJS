const tg = window.Telegram.WebApp;
tg.expand();
const userId = tg.initDataUnsafe.user?.id;

// تحديث الرصيد
async function updateBalance() {
    if (!userId) return;
    const res = await fetch(`/api/user/${userId}`);
    const data = await res.json();
    if (document.getElementById('balance')) {
        document.getElementById('balance').innerText = data.balance.toFixed(2);
    }
}

// جلب المهام
async function loadTasks() {
    const container = document.getElementById('tasks-list');
    if (!container) return;
    
    container.innerHTML = "جاري التحميل...";
    const res = await fetch('/api/tasks');
    const tasks = await res.json();
    
    container.innerHTML = "";
    tasks.forEach(t => {
        const div = document.createElement('div');
        div.className = 'glass task-row';
        div.innerHTML = `
            <div>
                <h3>${t.title}</h3>
                <span class="price-tag">+${t.reward} DZD</span>
            </div>
            <button class="btn" style="width:auto" onclick="startTask('${t.id}', '${t.url}', ${t.seconds})">بدء ▶️</button>
        `;
        container.appendChild(div);
    });
}

// تنفيذ المهمة
function startTask(id, url, sec) {
    tg.openLink(url);
    
    // إظهار نافذة الانتظار (Simple Alert for now)
    let btn = event.target;
    btn.disabled = true;
    btn.innerText = `⏳ ${sec}`;
    
    let timeLeft = sec;
    const timer = setInterval(() => {
        timeLeft--;
        btn.innerText = `⏳ ${timeLeft}`;
        if (timeLeft <= 0) {
            clearInterval(timer);
            claimReward(id, btn);
        }
    }, 1000);
}

async function claimReward(taskId, btnElement) {
    btnElement.innerText = "جاري التحقق...";
    const res = await fetch('/api/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, taskId })
    });
    const data = await res.json();
    
    if (data.success) {
        alert(`✅ ${data.msg}`);
        btnElement.innerText = "تم ✅";
        updateBalance();
    } else {
        alert("❌ خطأ: " + data.error);
        btnElement.disabled = false;
        btnElement.innerText = "بدء ▶️";
    }
}

// عند التحميل
document.addEventListener('DOMContentLoaded', () => {
    updateBalance();
    loadTasks();
});