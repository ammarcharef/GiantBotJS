const tg = window.Telegram.WebApp;
tg.expand();
let userId = null;

// --- المحرك الأساسي ---
async function init() {
    const p = new URLSearchParams(window.location.search);
    userId = p.get('uid') || tg.initDataUnsafe?.user?.id;

    if (!userId) return document.getElementById('loader').innerHTML = "<h3 style='color:white'>خطأ في المصادقة</h3>";

    try {
        const res = await fetch(`/api/user/${userId}`);
        const user = await res.json();
        
        document.getElementById('loader').style.display = 'none';

        if (user.notFound || !user.paymentLocked) {
            showScreen('register');
            if(tg.initDataUnsafe?.user?.first_name) document.getElementById('r-name').value = tg.initDataUnsafe.user.first_name;
        } else {
            showScreen('home');
            document.getElementById('navbar').classList.remove('hidden');
            updateUI(user);
        }
    } catch (e) { alert("خطأ اتصال"); }
}

// --- واجهة المستخدم ---
function showScreen(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById(name + '-screen').classList.remove('hidden');
}

function showTab(name) {
    showScreen(name);
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    if(name === 'home') {
        loadTasks();
        document.querySelector('.nav-item:nth-child(1)').classList.add('active');
    } else if(name === 'history') {
        document.querySelector('.nav-item:nth-child(2)').classList.add('active');
        renderHistory(); // عرض السجل
    } else if(name === 'wallet') {
        document.querySelector('.nav-item:nth-child(3)').classList.add('active');
        loadWallet();
    } else if(name === 'leaderboard') {
        loadLeaderboard();
    }
    tg.HapticFeedback.selectionChanged();
}

function showToast(msg, isError=false) {
    const div = document.createElement('div');
    div.className = `toast ${isError ? 'error' : ''}`;
    div.innerText = msg;
    document.getElementById('toast-container').appendChild(div);
    if(isError) tg.HapticFeedback.notificationOccurred('error');
    else tg.HapticFeedback.notificationOccurred('success');
    setTimeout(() => div.remove(), 3000);
}

function updateUI(user) {
    document.getElementById('balance').innerText = user.balance.toFixed(2);
    document.getElementById('my-code').innerText = user.refCode || user.id;
    document.getElementById('user-rank').innerText = user.rank;
    
    // حفظ المعاملات في الذاكرة لاستخدامها في صفحة السجل
    window.userTransactions = user.transactions; 
}

// --- العمليات ---
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
    if(!data.account || !data.pass) return showToast("أكمل البيانات!", true);
    
    const res = await fetch('/api/register', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) });
    const json = await res.json();
    if(json.success) { showToast("تم الحفظ"); location.reload(); }
    else showToast(json.error, true);
}

async function loadTasks() {
    const res = await fetch('/api/tasks');
    const tasks = await res.json();
    const cont = document.getElementById('tasks-container');
    cont.innerHTML = tasks.length ? tasks.map(t => `
        <div class="task-item">
            <div class="task-info">
                <h4>${t.title}</h4>
                <span class="price-tag">+${t.reward} DZD</span>
            </div>
            <button class="start-btn" onclick="doTask('${t.id}', '${t.url}', ${t.seconds})">بدء</button>
        </div>
    `).join('') : '<p style="text-align:center; color:#777">لا توجد مهام حالياً</p>';
}

function doTask(id, url, sec) {
    tg.openLink(url);
    tg.HapticFeedback.impactOccurred('medium');
    setTimeout(async () => {
        const res = await fetch('/api/claim', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({userId, taskId:id}) });
        const json = await res.json();
        if(json.success) { showToast("✅ تم احتساب المكافأة"); location.reload(); }
        else showToast(json.error, true);
    }, sec * 1000);
}

async function transfer() {
    const data = {
        senderId: userId,
        receiverRef: document.getElementById('tr-code').value,
        amount: document.getElementById('tr-amount').value,
        pass: document.getElementById('tr-pass').value
    };
    if(!data.receiverRef || !data.amount) return showToast("أكمل البيانات", true);
    
    const res = await fetch('/api/transfer', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
    const json = await res.json();
    if(json.success) { showToast(json.msg); setTimeout(() => location.reload(), 1500); }
    else showToast(json.error, true);
}

async function redeem() {
    const code = document.getElementById('cp-code').value;
    const res = await fetch('/api/redeem', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({userId, code}) });
    const json = await res.json();
    if(json.success) { showToast(json.msg); setTimeout(() => location.reload(), 1500); }
    else showToast(json.error, true);
}

async function claimDaily() {
    const res = await fetch('/api/daily', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({userId}) });
    const json = await res.json();
    if(json.success) { showToast(json.msg); setTimeout(() => location.reload(), 1500); }
    else showToast(json.error, true);
}

async function withdraw() {
    const amount = document.getElementById('w-amount').value;
    const pass = document.getElementById('w-pass').value;
    if(!amount || !pass) return showToast("بيانات ناقصة", true);
    const res = await fetch('/api/withdraw', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({userId, amount, pass}) });
    const json = await res.json();
    if(json.success) { showToast(json.msg); setTimeout(() => location.reload(), 1500); }
    else showToast(json.error, true);
}

// دالة عرض السجل (History)
function renderHistory() {
    const list = window.userTransactions || [];
    const cont = document.getElementById('history-list');
    cont.innerHTML = list.length ? list.map(tr => `
        <div class="hist-item">
            <div>
                <div style="font-weight:bold">${tr.details}</div>
                <div class="hist-date">${new Date(tr.date).toLocaleDateString()}</div>
            </div>
            <div style="color:${tr.amount > 0 ? '#10b981' : '#ef4444'}; font-weight:bold; direction:ltr">
                ${tr.amount > 0 ? '+' : ''}${tr.amount}
            </div>
        </div>
    `).join('') : '<p style="text-align:center">لا توجد معاملات</p>';
}

async function loadWallet() {
    const res = await fetch(`/api/user/${userId}`);
    const user = await res.json();
    document.getElementById('p-name').innerText = user.fullName;
    document.getElementById('p-acc').innerText = user.paymentAccount;
}

async function loadLeaderboard() {
    const res = await fetch('/api/leaderboard');
    const users = await res.json();
    document.querySelector('#lb-table tbody').innerHTML = users.map((u, i) => `
        <tr><td>${i+1}</td><td>${u.name} <br><small style="color:#aaa">${u.rank}</small></td><td style="color:#fbbf24">${u.totalEarned.toFixed(1)}</td></tr>
    `).join('');
}

init();
