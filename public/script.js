const tg = window.Telegram.WebApp;
tg.expand();
let userId = null;

async function init() {
    const p = new URLSearchParams(window.location.search);
    userId = p.get('uid') || tg.initDataUnsafe?.user?.id;

    if (!userId) return alert("افتح من البوت");

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
    } catch (e) { alert("Error connecting"); }
}

function showScreen(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById(name + '-screen').classList.remove('hidden');
}

function nav(tab) {
    showScreen(tab);
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    event.currentTarget.classList.add('active');
    tg.HapticFeedback.selectionChanged();
    
    if(tab === 'home') loadTasks();
    if(tab === 'social') loadSocial();
    if(tab === 'wallet') loadInvoices();
}

function updateUI(user) {
    document.getElementById('balance').innerText = user.balance.toFixed(2);
    document.getElementById('lvl-num').innerText = user.level;
    document.getElementById('user-badge').innerText = user.badge;
    document.getElementById('user-xp').innerText = user.xp;
    // تحديث شريط التقدم
    const percent = (user.xp % 100);
    document.getElementById('xp-fill').style.width = `${percent}%`;
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
    if(!data.account || !data.pass) return alert("أكمل البيانات");
    
    await fetch('/api/register', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
    location.reload();
}

// 2. المهام
async function loadTasks() {
    const res = await fetch('/api/tasks');
    const tasks = await res.json();
    document.getElementById('tasks-container').innerHTML = tasks.map(t => `
        <div class="item-card">
            <div>
                <h4>${t.title}</h4>
                <small style="color:#aaa">${t.seconds} ثانية</small>
            </div>
            <button class="btn-action" onclick="doTask('${t._id}', '${t.url}', ${t.seconds})">+${t.reward}</button>
        </div>
    `).join('');
}

function doTask(id, url, sec) {
    tg.openLink(url);
    setTimeout(async () => {
        const res = await fetch('/api/claim', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({userId, taskId:id}) });
        const json = await res.json();
        if(json.success) {
            tg.showAlert(`🎉 رائع! +${json.msg}`);
            // تحديث الواجهة محلياً
            let bal = parseFloat(document.getElementById('balance').innerText);
            document.getElementById('balance').innerText = (bal + 5).toFixed(2); // تقديري
        }
    }, sec * 1000);
}

// 3. المجتمع
async function loadSocial() {
    const res = await fetch('/api/community');
    const data = await res.json();
    const cont = document.getElementById('posts-container');
    
    let html = data.posts.map(p => `
        <div class="post-card">
            <div class="post-header"><i class="fas fa-bullhorn"></i> إدارة المنصة</div>
            <p>${p.content}</p>
            <small style="color:#666">${new Date(p.date).toLocaleDateString()}</small>
        </div>
    `).join('');

    html += `<h4 style="color:#aaa; margin:15px 0">💸 أحدث السحوبات</h4>`;
    html += data.proofs.map(p => `
        <div class="item-card" style="border-right:4px solid #f59e0b">
            <span>مستخدم سحب</span>
            <span style="color:#f59e0b">${p.amount} DZD</span>
        </div>
    `).join('');
    
    cont.innerHTML = html;
}

// 4. المحفظة (فواتير + تحويل)
async function loadInvoices() {
    const res = await fetch(`/api/invoices/${userId}`);
    const data = await res.json();
    document.getElementById('invoices-container').innerHTML = data.map(i => `
        <div class="item-card" style="border-right:4px solid ${i.amount>0?'#10b981':'#ef4444'}">
            <div>
                <div>${i.details}</div>
                <small style="color:#666">${new Date(i.date).toLocaleDateString()}</small>
            </div>
            <div style="font-weight:bold; direction:ltr">${i.amount}</div>
        </div>
    `).join('');
}

function openModal(id) { document.getElementById(id+'-modal').classList.remove('hidden'); }
function closeModal() { document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden')); }

async function transfer() {
    const data = {
        senderId: userId,
        receiverRef: document.getElementById('tr-code').value,
        amount: document.getElementById('tr-amount').value,
        pass: document.getElementById('tr-pass').value
    };
    const res = await fetch('/api/transfer', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
    const json = await res.json();
    alert(json.success ? json.msg : json.error);
    if(json.success) { closeModal(); nav('wallet'); }
}

init();