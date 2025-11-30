const tg = window.Telegram.WebApp;
tg.expand();
let userId = null;
let activeTaskId = null;
let taskStartTime = 0;

async function init() {
    const p = new URLSearchParams(window.location.search);
    userId = p.get('uid') || tg.initDataUnsafe?.user?.id;

    if (!userId) {
        document.getElementById('loader').style.display = 'none';
        return document.getElementById('landing-page').classList.remove('hidden');
    }

    try {
        const res = await fetch(`/api/user/${userId}`);
        const user = await res.json();
        document.getElementById('loader').style.display = 'none';

        if (user.isBanned) return document.body.innerHTML = `<div style="text-align:center; padding:50px; color:#ef4444;"><h2>🚫 محظور</h2></div>`;

        if (user.notFound || !user.paymentLocked) {
            showScreen('reg');
            if(tg.initDataUnsafe?.user?.first_name) document.getElementById('r-name').value = tg.initDataUnsafe.user.first_name;
        } else {
            showScreen('home');
            document.getElementById('navbar').classList.remove('hidden');
            updateUI(user);
        }
    } catch (e) { alert("خطأ اتصال"); }
}

// --- 🔥 دالة الإعلانات (المعدلة بالكود الخاص بك) 🔥 ---
function openOfferwall(company) {
    if (!userId) return showToast("يجب الدخول من البوت", true);

    if (company === 'MONETAG') {
        // التحقق هل الإعلان جاهز؟
        if (typeof show_10256524 === 'function') {
            showToast("جاري فتح الإعلان... ⏳");
            
            // هذا هو الكود الذي أرسلته لي
            show_10256524().then(() => {
                // المستخدم شاهد الإعلان وأغلقه -> نعطيه المكافأة
                giveAdReward(2.00); // نعطيه 2 دينار
            });
        } else {
            showToast("الإعلان يجهز... حاول بعد 5 ثوانٍ", true);
        }
    } 
    
    else if (company === 'CPALEAD') {
        // رابطك المباشر (استبدله برابطك الحقيقي)
        const link = `https://vr.cpalead.com/mobile/locker/?id=YOUR_ID&subid=${userId}`; 
        tg.openLink(link);
    }
}

// دالة تسليم مكافأة الإعلان
async function giveAdReward(amount) {
    try {
        await fetch('/api/ad_reward', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ userId })
        });
        
        showToast(`💰 مبروك! ربحت ${amount} DZD`);
        
        // تحديث الرصيد فورياً في الشاشة
        let bal = parseFloat(document.getElementById('balance').innerText);
        document.getElementById('balance').innerText = (bal + amount).toFixed(2);
        
        // إعادة تحميل الصفحة لتحديث البيانات
        setTimeout(() => location.reload(), 2000);
    } catch (e) {
        showToast("حدث خطأ في إضافة الرصيد", true);
    }
}

// --- باقي الوظائف (بدون تغيير) ---
function showScreen(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById(name + '-screen').classList.remove('hidden');
    window.scrollTo(0, 0);
}

function showTab(name) {
    showScreen(name);
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    if(name === 'home') { loadTasks(); document.querySelector('.nav-item:nth-child(1)').classList.add('active'); }
    else if(name === 'invite') { loadRefLink(); document.querySelector('.nav-item:nth-child(2)').classList.add('active'); }
    else if(name === 'wallet') { loadWallet(); document.querySelector('.nav-item:nth-child(3)').classList.add('active'); }
}

function updateUI(user) {
    document.getElementById('balance').innerText = user.balance.toFixed(2);
    document.getElementById('u-id').innerText = user.refCode || user.id;
    document.getElementById('u-lvl').innerText = user.level;
}

function showToast(msg, isError=false) {
    const t = document.getElementById('toast');
    t.innerText = msg; t.className = `toast ${isError ? 'error' : ''}`;
    t.classList.remove('hidden');
    tg.HapticFeedback.notificationOccurred(isError ? 'error' : 'success');
    setTimeout(() => t.classList.add('hidden'), 3000);
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
    if(!data.account || !data.pass) return showToast("أكمل البيانات", true);
    const res = await fetch('/api/register', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
    const json = await res.json();
    if(json.success) { showToast("تم الحفظ"); location.reload(); } else showToast(json.error, true);
}

async function loadTasks() {
    const res = await fetch('/api/tasks');
    const tasks = await res.json();
    document.getElementById('tasks-list').innerHTML = tasks.length ? tasks.map(t => `
        <div class="task-item">
            <div><h4>${t.title}</h4><span class="gold">+${t.reward.toFixed(2)} DZD</span></div>
            <button class="btn-act" onclick="startTask('${t._id}', '${t.url}', ${t.seconds})">بدء</button>
        </div>
    `).join('') : '<p style="text-align:center;color:#777">لا توجد مهام</p>';
}

function startTask(id, url, sec) {
    if(activeTaskId) return showToast("أكمل المهمة الحالية", true);
    tg.openLink(url);
    activeTaskId = id;
    taskStartTime = Date.now();
    const btn = event.target;
    const oldText = btn.innerText;
    btn.disabled = true;
    let timeLeft = sec;
    const timer = setInterval(() => {
        btn.innerText = `⏳ ${timeLeft}`;
        timeLeft--;
        if (timeLeft < 0) {
            clearInterval(timer);
            completeTask(id, btn, oldText, sec);
        }
    }, 1000);
}

async function completeTask(id, btn, oldText, reqSec) {
    const elapsed = (Date.now() - taskStartTime) / 1000;
    if(elapsed < reqSec) {
        activeTaskId = null; btn.disabled=false; btn.innerText=oldText; return showToast("غش!", true);
    }
    const res = await fetch('/api/claim', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({userId, taskId:id}) });
    const json = await res.json();
    activeTaskId = null;
    if(json.success) { 
        showToast(json.msg); 
        setTimeout(() => location.reload(), 1000); 
    } else {
        showToast(json.error, true);
        btn.disabled = false; btn.innerText = oldText;
    }
}

async function transfer() {
    const data = { senderId: userId, receiverRef: document.getElementById('tr-code').value, amount: document.getElementById('tr-amount').value, pass: document.getElementById('tr-pass').value };
    const res = await fetch('/api/transfer', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
    const json = await res.json();
    if(json.success) { showToast(json.msg); setTimeout(()=>location.reload(), 1500); } else showToast(json.error, true);
}

async function redeem() {
    const res = await fetch('/api/redeem', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({userId, code: document.getElementById('cp-code').value}) });
    const json = await res.json();
    if(json.success) { showToast(json.msg); setTimeout(()=>location.reload(), 1500); } else showToast(json.error, true);
}

async function claimDaily() {
    const res = await fetch('/api/daily', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({userId}) });
    const json = await res.json();
    if(json.success) { showToast(json.msg); setTimeout(()=>location.reload(), 1500); } else showToast(json.error, true);
}

async function withdraw() {
    const data = { userId, amount: document.getElementById('w-amount').value, pass: document.getElementById('w-pass').value };
    const res = await fetch('/api/withdraw', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
    const json = await res.json();
    if(json.success) { showToast(json.msg); setTimeout(()=>location.reload(), 1500); } else showToast(json.error, true);
}

async function loadWallet() {
    const res = await fetch(`/api/user/${userId}`);
    const user = await res.json();
    document.getElementById('w-name').innerText = user.fullName;
    document.getElementById('w-acc').innerText = user.paymentAccount;
}

async function loadHistory() {
    const res = await fetch(`/api/history/${userId}`);
    const list = await res.json();
    document.getElementById('hist-list').innerHTML = list.map(i => `
        <div class="hist-item">
            <div><div>${i.details}</div><small style="color:#777">${new Date(i.date).toLocaleDateString()}</small></div>
            <div style="direction:ltr; font-weight:bold; color:${i.amount>0?'#10b981':'#ef4444'}">${i.amount}</div>
        </div>
    `).join('');
}

async function loadLeaderboard() {
    const res = await fetch('/api/leaderboard');
    const users = await res.json();
    document.querySelector('#lb-table tbody').innerHTML = users.map((u, i) => `<tr><td>${i+1}</td><td>${u.name}</td><td>${u.level}</td><td class="gold">${u.totalEarned.toFixed(1)}</td></tr>`).join('');
}

async function loadRefLink() {
    const botName = "YacineAS_Bot";
    document.getElementById('my-ref-link').innerText = `https://t.me/${botName}?start=${userId}`;
    const res = await fetch(`/api/referrals/${userId}`);
    const data = await res.json();
    document.getElementById('ref-count').innerText = data.count;
}
function copyRefLink() { navigator.clipboard.writeText(document.getElementById('my-ref-link').innerText); showToast("تم النسخ"); }

async function deleteAccount() {
    if(!confirm("تأكيد الحذف النهائي؟")) return;
    const pass = document.getElementById('del-pass').value;
    const res = await fetch('/api/settings/delete', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({userId, pass}) });
    const json = await res.json();
    if(json.success) { alert("تم الحذف"); tg.close(); } else showToast(json.error, true);
}

function openSupport() { tg.openTelegramLink('https://t.me/YacineSupport'); }

init();