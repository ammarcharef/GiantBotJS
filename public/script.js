const tg = window.Telegram.WebApp;
tg.expand();
let userId = null;

async function init() {
    const p = new URLSearchParams(window.location.search);
    userId = p.get('uid') || tg.initDataUnsafe?.user?.id;

    if (!userId) return alert("Error: Open from Telegram");

    try {
        const res = await fetch(`/api/user/${userId}`);
        const user = await res.json();
        document.getElementById('loader').style.display = 'none';

        if (user.notFound || !user.paymentLocked) {
            showScreen('register');
            if(tg.initDataUnsafe?.user?.first_name) document.getElementById('r-name').value = tg.initDataUnsafe.user.first_name;
        } else {
            showScreen('home');
            updateUI(user);
        }
    } catch (e) { alert("Connection Error"); }
}

function showScreen(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById(name + '-screen').classList.remove('hidden');
}

function showTab(name) {
    showScreen(name);
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    if(name === 'home') { loadTasks(); document.querySelector('.nav-item:nth-child(1)').classList.add('active'); }
    else if(name === 'wallet') { loadWallet(); document.querySelector('.nav-item:nth-child(2)').classList.add('active'); }
    else if(name === 'support') { loadTickets(); document.querySelector('.nav-item:nth-child(3)').classList.add('active'); }
    else if(name === 'notifications') loadNotifications();
}

function updateUI(user) {
    document.getElementById('balance').innerText = user.balance.toFixed(2);
    document.getElementById('u-name').innerText = user.name;
    document.getElementById('u-badge').innerText = user.badge;
    document.getElementById('my-uid').innerText = user.id;
    
    if(user.notifications && user.notifications.length > 0 && !user.notifications[0].read) {
        document.getElementById('notif-dot').style.display = 'block';
    }
}

function showToast(msg, isError=false) {
    const t = document.getElementById('toast');
    t.innerText = msg; t.className = `toast ${isError ? 'error' : ''}`;
    t.classList.remove('hidden');
    setTimeout(() => t.classList.add('hidden'), 3000);
}

// 1. التسجيل
async function register() {
    const data = {
        userId,
        fullName: document.getElementById('r-name').value,
        phone: document.getElementById('r-phone').value,
        method: document.getElementById('r-method').value,
        account: document.getElementById('r-acc').value,
        pass: document.getElementById('r-pass').value
    };
    if(!data.account || !data.pass) return showToast("أكمل البيانات", true);
    
    const res = await fetch('/api/register', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
    const json = await res.json();
    if(json.success) { showToast("تم الحفظ"); location.reload(); }
}

// 2. المهام
async function loadTasks() {
    const res = await fetch('/api/tasks');
    const tasks = await res.json();
    document.getElementById('tasks-container').innerHTML = tasks.length ? tasks.map(t => `
        <div class="item-card">
            <div><h4>${t.title}</h4><span class="gold">+${t.reward} DZD</span></div>
            <button class="btn-action" onclick="doTask('${t._id}', '${t.url}', ${t.seconds})">تنفيذ</button>
        </div>
    `).join('') : '<p style="text-align:center;color:#777">لا مهام</p>';
}

function doTask(id, url, sec) {
    tg.openLink(url);
    setTimeout(async () => {
        const res = await fetch('/api/claim', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({userId, taskId:id}) });
        const json = await res.json();
        if(json.success) { showToast(json.msg); setTimeout(() => location.reload(), 1000); }
        else showToast(json.error, true);
    }, sec * 1000);
}

// 3. الدعم الفني
async function sendTicket() {
    const data = { userId, subject: document.getElementById('t-subject').value, message: document.getElementById('t-msg').value };
    if(!data.subject || !data.message) return showToast("اكتب الرسالة", true);
    
    const res = await fetch('/api/ticket', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
    const json = await res.json();
    if(json.success) { showToast(json.msg); document.getElementById('t-msg').value=""; loadTickets(); }
}

async function loadTickets() {
    const res = await fetch(`/api/tickets/${userId}`);
    const list = await res.json();
    document.getElementById('tickets-list').innerHTML = list.map(t => `
        <div class="ticket-item">
            <div style="display:flex;justify-content:space-between"><b>${t.subject}</b> <span class="status-${t.status}">${t.status}</span></div>
            <p style="color:#aaa">${t.message}</p>
            ${t.reply ? `<p style="color:#fbbf24; border-top:1px solid #333; padding-top:5px">رد الإدارة: ${t.reply}</p>` : ''}
        </div>
    `).join('');
}

// 4. السحب
async function loadWallet() {
    const res = await fetch(`/api/user/${userId}`);
    const user = await res.json();
    document.getElementById('w-method').innerText = user.paymentMethod;
    document.getElementById('w-acc').innerText = user.paymentAccount;
}

async function withdraw() {
    const amount = document.getElementById('w-amount').value;
    const pass = document.getElementById('w-pass').value;
    if(!amount || !pass) return showToast("أكمل البيانات", true);
    const res = await fetch('/api/withdraw', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({userId, amount, pass}) });
    const json = await res.json();
    if(json.success) showToast(json.msg);
    else showToast(json.error, true);
}

// 5. الإعدادات والإشعارات
async function changePass() {
    const data = { userId, oldPass: document.getElementById('set-old').value, newPass: document.getElementById('set-new').value };
    const res = await fetch('/api/settings/password', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
    const json = await res.json();
    showToast(json.success ? json.msg : json.error, !json.success);
}

async function loadNotifications() {
    const res = await fetch(`/api/user/${userId}`);
    const user = await res.json();
    document.getElementById('notif-list').innerHTML = user.notifications.map(n => `
        <div class="notif-item">
            <p>${n.msg}</p>
            <small style="color:#666">${new Date(n.date).toLocaleString()}</small>
        </div>
    `).join('');
    document.getElementById('notif-dot').style.display = 'none'; // إخفاء النقطة
}

init();