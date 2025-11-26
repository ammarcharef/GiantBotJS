const tg = window.Telegram.WebApp;
tg.expand();
let currentUserId = null;

async function init() {
    const p = new URLSearchParams(window.location.search);
    currentUserId = p.get('uid') || tg.initDataUnsafe?.user?.id;
    
    if(!currentUserId) return document.getElementById('register-screen').classList.remove('hidden');
    document.getElementById('loader').style.display = 'none';

    try {
        const res = await fetch(`/api/user/${currentUserId}`);
        const user = await res.json();
        if(user.paymentLocked) {
            showTab('home');
            document.getElementById('navbar').classList.remove('hidden');
            updateUI(user);
        } else {
            document.getElementById('register-screen').classList.remove('hidden');
            if(tg.initDataUnsafe?.user?.first_name) document.getElementById('r-name').value = tg.initDataUnsafe.user.first_name;
        }
    } catch(e) { alert("خطأ اتصال"); }
}

function showTab(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById(name+'-screen').classList.remove('hidden');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    // (يمكن إضافة كود لتفعيل أيقونة النافبار هنا)
    if(name === 'home') loadTasks();
    if(name === 'top') loadLeaderboard();
    if(name === 'wallet') loadWalletInfo();
}

function updateUI(user) {
    document.getElementById('balance').innerText = user.balance.toFixed(2);
}

// 1. التحويل
async function transfer() {
    const data = {
        senderId: currentUserId,
        receiverRef: document.getElementById('tr-code').value,
        amount: document.getElementById('tr-amount').value,
        pass: document.getElementById('tr-pass').value
    };
    if(!data.receiverRef || !data.amount) return alert("أكمل البيانات");
    
    const res = await fetch('/api/transfer', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
    const json = await res.json();
    alert(json.success ? "✅ " + json.msg : "❌ " + json.error);
    if(json.success) location.reload();
}

// 2. الكوبون
async function redeem() {
    const code = document.getElementById('cp-code').value;
    const res = await fetch('/api/redeem', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({userId:currentUserId, code}) });
    const json = await res.json();
    alert(json.success ? json.msg : json.error);
    if(json.success) location.reload();
}

// 3. الهدية اليومية
async function claimDaily() {
    const res = await fetch('/api/daily', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({userId:currentUserId}) });
    const json = await res.json();
    if(json.success) { alert("🎉 " + json.msg); location.reload(); }
    else alert("⚠️ " + json.error);
}

// التسجيل
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
    
    await fetch('/api/register', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
    location.reload();
}

// المهام
async function loadTasks() {
    const res = await fetch('/api/tasks');
    const tasks = await res.json();
    const container = document.getElementById('tasks-container');
    if (tasks.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#777; padding:20px;">لا توجد مهام حالياً، عد لاحقاً ⏳</p>';
        return;
    }
    container.innerHTML = tasks.map(t => `
        <div class="glass task">
            <div><h4 style="margin:0 0 5px 0">${t.title}</h4><span class="gold" style="font-weight:bold">+${t.reward} DZD</span></div>
            <button class="btn small primary" onclick="doTask('${t.id}', '${t.url}', ${t.seconds})">بدء العمل</button>
        </div>
    `).join('');
}

function doTask(id, url, sec) {
    tg.openLink(url);
    setTimeout(async () => {
        const res = await fetch('/api/claim', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({userId:currentUserId, taskId:id}) });
        const json = await res.json();
        if(json.success) { alert("✅ تم إضافة الرصيد"); location.reload(); }
        else alert(json.error);
    }, sec * 1000);
}

// المتصدرين والمحفظة
async function loadLeaderboard() {
    const res = await fetch('/api/leaderboard');
    const users = await res.json();
    document.querySelector('#leaderboard-table tbody').innerHTML = users.map((u, i) => `<tr><td>${i+1}</td><td>${u.name}</td><td class="gold">${u.totalEarned.toFixed(1)}</td></tr>`).join('');
}
async function loadWalletInfo() {
    const res = await fetch(`/api/user/${currentUserId}`);
    const user = await res.json();
    document.getElementById('p-name').innerText = user.fullName;
    document.getElementById('p-acc').innerText = user.paymentAccount;
}

init();
