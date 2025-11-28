const tg = window.Telegram.WebApp;
tg.expand();
let userId = null;

// --- نظام الأمان (Anti-Cheat) ---
let taskStartTime = 0;
let activeTaskId = null;

// --- البداية ---
async function init() {
    const p = new URLSearchParams(window.location.search);
    userId = p.get('uid') || tg.initDataUnsafe?.user?.id;

    if (!userId) {
        document.getElementById('loader').style.display = 'none';
        return alert("يرجى الدخول من البوت");
    }

    try {
        const res = await fetch(`/api/user/${userId}`);
        const user = await res.json();
        
        document.getElementById('loader').style.display = 'none';

        // 🛑 التحقق من الحظر أولاً (هذا هو التعديل الجديد) 🛑
        if (user.isBanned) {
            document.body.innerHTML = `
                <div style="text-align:center; padding:50px; color:#ef4444;">
                    <i class="fas fa-ban" style="font-size:4rem; margin-bottom:20px;"></i>
                    <h2>حسابك محظور</h2>
                    <p>تم إيقاف حسابك بسبب مخالفة القوانين.</p>
                    <p style="font-size:0.8rem; color:#aaa;">تواصل مع الدعم الفني للمراجعة.</p>
                </div>
            `;
            return; // إيقاف تنفيذ باقي الكود
        }

        if (user.notFound || !user.paymentLocked) {
            showScreen('register');
            if(tg.initDataUnsafe?.user?.first_name) document.getElementById('r-name').value = tg.initDataUnsafe.user.first_name;
        } else {
            showScreen('home');
            document.getElementById('navbar').classList.remove('hidden');
            updateUI(user);
        }
    } catch (e) {
        alert("خطأ في الاتصال");
    }
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
    else if(name === 'history') loadHistory();
    else if(name === 'leaderboard') loadLeaderboard();
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

// 1. التسجيل
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
    if(json.success) { showToast("تم الحفظ"); location.reload(); }
    else showToast(json.error, true);
}

// 2. المهام (مع الحماية)
async function loadTasks() {
    const res = await fetch('/api/tasks');
    const tasks = await res.json();
    document.getElementById('tasks-list').innerHTML = tasks.length ? tasks.map(t => `
        <div class="task-item">
            <div><h4>${t.title}</h4><span class="gold">+${t.reward} DZD</span></div>
            <button class="btn-act" onclick="startTask('${t._id}', '${t.url}', ${t.seconds})">بدء</button>
        </div>
    `).join('') : '<p style="text-align:center;color:#777">لا توجد مهام حالياً</p>';
}

function startTask(id, url, sec) {
    // التحقق من أن المستخدم لا يقوم بمهمتين في نفس الوقت
    if(activeTaskId) return showToast("أكمل المهمة الحالية أولاً", true);

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

async function completeTask(id, btn, oldText, requiredSec) {
    // حماية الوقت: التأكد من مرور الوقت الفعلي
    const timeElapsed = (Date.now() - taskStartTime) / 1000;
    if(timeElapsed < requiredSec) {
        activeTaskId = null;
        btn.disabled = false;
        btn.innerText = oldText;
        return showToast("محاولة غش! انتظر الوقت كاملاً", true);
    }

    const res = await fetch('/api/claim', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({userId, taskId:id}) });
    const json = await res.json();
    
    activeTaskId = null; // تصفير المهمة الحالية
    
    if(json.success) { 
        showToast(json.msg); 
        // تحديث الرصيد فورياً
        let bal = parseFloat(document.getElementById('balance').innerText);
        document.getElementById('balance').innerText = (bal + 5).toFixed(2); // (تحديث بصري)
        setTimeout(() => location.reload(), 1000); 
    }
    else {
        showToast(json.error, true);
        btn.disabled = false;
        btn.innerText = oldText;
    }
}

// 3. العمليات
async function transfer() {
    const data = {
        senderId: userId,
        receiverRef: document.getElementById('tr-code').value,
        amount: document.getElementById('tr-amount').value,
        pass: document.getElementById('tr-pass').value
    };
    const res = await fetch('/api/transfer', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
    const json = await res.json();
    if(json.success) { showToast(json.msg); setTimeout(() => location.reload(), 1500); } else showToast(json.error, true);
}

async function redeem() {
    const code = document.getElementById('cp-code').value;
    const res = await fetch('/api/redeem', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({userId, code}) });
    const json = await res.json();
    if(json.success) { showToast(json.msg); setTimeout(() => location.reload(), 1500); } else showToast(json.error, true);
}

async function withdraw() {
    const amount = document.getElementById('w-amount').value;
    const pass = document.getElementById('w-pass').value;
    if(!amount || !pass) return showToast("أكمل البيانات", true);
    const res = await fetch('/api/withdraw', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({userId, amount, pass}) });
    const json = await res.json();
    if(json.success) { showToast(json.msg); setTimeout(() => location.reload(), 1500); } else showToast(json.error, true);
}

// 4. البيانات
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

function openSupport() {
    tg.openTelegramLink('https://t.me/+Cb5M_sW2bZFmYjhk');
}

init();

// --- دالة حذف الحساب ---
async function deleteAccount() {
    const pass = document.getElementById('del-pass').value;
    
    if (!pass) return showToast("أدخل كلمة المرور أولاً!", true);

    if (confirm("هل أنت متأكد تماماً؟ 🛑\nسيتم حذف رصيدك وكل بياناتك ولن تتمكن من استرجاعها!")) {
        // تأكيد ثانٍ للأمان
        if (confirm("تنبيه أخير! هل أنت موافق على الحذف النهائي؟")) {
            
            const res = await fetch('/api/settings/delete', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ userId, pass })
            });

            const json = await res.json();

            if (json.success) {
                alert("تم حذف حسابك. سيتم إغلاق التطبيق.");
                tg.close(); // إغلاق التطبيق في تيلجرام
            } else {
                showToast(json.error, true);
            }
        }
    }
}
