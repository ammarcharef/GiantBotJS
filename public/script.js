const tg = window.Telegram.WebApp;
tg.expand(); 

let currentUserId = null;

async function init() {
    // 1. محاولة جلب الآيدي من الرابط المباشر (الطريقة المضمونة)
    const urlParams = new URLSearchParams(window.location.search);
    const uidFromUrl = urlParams.get('uid');

    if (uidFromUrl) {
        currentUserId = uidFromUrl;
    } else {
        // 2. محاولة جلبه من تيلجرام (الطريقة الاحتياطية)
        currentUserId = tg.initDataUnsafe?.user?.id;
    }

    // إخفاء شاشة التحميل
    document.getElementById('loader').style.display = 'none';

    if (!currentUserId) {
        // في أسوأ الحالات، اطلب من المستخدم العودة للبوت
        alert("⚠️ لم يتم التعرف على الحساب. يرجى العودة للبوت والضغط على /start مجدداً.");
        return;
    }

    try {
        // جلب البيانات
        const res = await fetch(`/api/user/${currentUserId}`);
        const userData = await res.json();

        if (userData.paymentLocked) {
            showDashboard(userData);
        } else {
            document.getElementById('register-screen').classList.remove('hidden');
            // محاولة ملء الاسم تلقائياً
            if(tg.initDataUnsafe?.user?.first_name) {
                document.getElementById('r-name').value = tg.initDataUnsafe.user.first_name;
            }
        }
    } catch (error) {
        // في حال فشل الاتصال، نظهر التسجيل كخيار
        document.getElementById('register-screen').classList.remove('hidden');
    }
}

function showDashboard(user) {
    document.getElementById('register-screen').classList.add('hidden');
    document.getElementById('main-screen').classList.remove('hidden');
    document.getElementById('balance').innerText = user.balance.toFixed(2);
    document.getElementById('ref-code').innerText = user.refCode || user.id;
    loadTasks();
}

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

    if (!data.fullName || !data.account || !data.pass) return alert("املأ جميع البيانات!");

    const btn = document.querySelector('button');
    btn.disabled = true; btn.innerText = "جاري الحفظ...";

    try {
        const res = await fetch('/api/register', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        });
        const json = await res.json();
        if (json.success) {
            alert("✅ تم التسجيل!");
            location.reload();
        } else {
            alert("خطأ: " + json.error);
            btn.disabled = false; btn.innerText = "حفظ";
        }
    } catch (e) {
        alert("فشل الاتصال");
        btn.disabled = false; btn.innerText = "حفظ";
    }
}

async function loadTasks() {
    try {
        const res = await fetch('/api/tasks');
        const tasks = await res.json();
        const container = document.getElementById('tasks-container');
        
        if (tasks.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:#777">لا توجد مهام</p>';
            return;
        }

        container.innerHTML = tasks.map(t => `
            <div class="glass task" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <div>
                    <h4 style="margin:0">${t.title}</h4>
                    <span class="gold">+${t.reward} DZD</span>
                </div>
                <button class="btn small" style="width:auto; margin:0" onclick="doTask('${t.id}', '${t.url}', ${t.seconds})">بدء</button>
            </div>
        `).join('');
    } catch (e) {}
}

function doTask(id, url, sec) {
    tg.openLink(url);
    const btn = event.target;
    const oldText = btn.innerText;
    btn.disabled = true;
    let timeLeft = sec;
    
    const timer = setInterval(() => {
        btn.innerText = timeLeft;
        timeLeft--;
        if (timeLeft < 0) {
            clearInterval(timer);
            claim(id, btn, oldText);
        }
    }, 1000);
}

async function claim(taskId, btn, oldText) {
    btn.innerText = "تحقق...";
    const res = await fetch('/api/claim', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ userId: currentUserId, taskId })
    });
    const json = await res.json();
    if(json.success) { alert("✅ مبروك"); location.reload(); }
    else { alert("❌ " + json.error); btn.disabled = false; btn.innerText = oldText; }
}

init();
