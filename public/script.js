const tg = window.Telegram.WebApp;
tg.expand(); // توسيع الشاشة

async function init() {
    // 1. محاولة جلب الآيدي
    let userId = tg.initDataUnsafe?.user?.id;

    // 2. إخفاء شاشة التحميل فوراً (لضمان عدم تعليق الشاشة)
    document.getElementById('loader').style.display = 'none';

    // 3. التحقق من الآيدي
    if (!userId) {
        // محاولة بديلة: إذا كنا في وضع تطوير أو متصفح خارجي
        console.warn("No User ID found via Telegram");
        // لا نوقف التطبيق، بل نوجه للتسجيل اليدوي
        document.getElementById('register-screen').classList.remove('hidden');
        return; 
    }

    try {
        // 4. جلب البيانات من السيرفر
        const res = await fetch(`/api/user/${userId}`);
        
        if (!res.ok) throw new Error("Network response was not ok");
        
        const user = await res.json();

        if (user.paymentLocked) {
            // المستخدم مسجل سابقاً -> عرض المهام
            document.getElementById('main-screen').classList.remove('hidden');
            document.getElementById('register-screen').classList.add('hidden');
            
            document.getElementById('balance').innerText = user.balance.toFixed(2);
            document.getElementById('ref-code').innerText = user.refCode || user.id;
            loadTasks();
        } else {
            // مستخدم جديد -> عرض التسجيل
            document.getElementById('register-screen').classList.remove('hidden');
            document.getElementById('main-screen').classList.add('hidden');
        }
    } catch (error) {
        alert("خطأ في الاتصال: " + error.message);
        // إظهار التسجيل كخيار احتياطي
        document.getElementById('register-screen').classList.remove('hidden');
    }
}

// دالة التسجيل
async function register() {
    // استخدام الآيدي الحقيقي أو 0 في حال الفشل (سيقوم السيرفر بمعالجته)
    const userId = tg.initDataUnsafe?.user?.id;

    if (!userId) {
        alert("خطأ: لم يتم التعرف على حسابك في تيلجرام. أعد تشغيل البوت.");
        return;
    }

    const data = {
        userId: userId,
        fullName: document.getElementById('r-name').value,
        phone: document.getElementById('r-phone').value,
        address: document.getElementById('r-addr').value,
        method: document.getElementById('r-method').value,
        account: document.getElementById('r-acc').value,
        pass: document.getElementById('r-pass').value
    };

    // التحقق من البيانات
    if (!data.fullName || !data.account || !data.pass) {
        alert("⚠️ يرجى ملء جميع الحقول المطلوبة!");
        return;
    }

    // تغيير الزر
    const btn = document.querySelector('button');
    const oldText = btn.innerText;
    btn.innerText = "جاري الاتصال...";
    btn.disabled = true;

    try {
        const res = await fetch('/api/register', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        });

        const json = await res.json();
        
        if (json.success) {
            alert("✅ تم الحفظ بنجاح! يمكنك بدء العمل الآن.");
            location.reload();
        } else {
            // عرض رسالة الخطأ القادمة من السيرفر
            alert("❌ خطأ: " + (json.error || "فشلت العملية"));
            btn.innerText = oldText;
            btn.disabled = false;
        }
    } catch (e) {
        alert("❌ فشل الاتصال: تأكد من الانترنت وحاول مجدداً");
        btn.innerText = oldText;
        btn.disabled = false;
        console.error(e);
    }
}

// دالة تحميل المهام
async function loadTasks() {
    try {
        const res = await fetch('/api/tasks');
        const tasks = await res.json();
        const div = document.getElementById('tasks-container');
        
        if(tasks.length === 0) {
            div.innerHTML = '<p style="text-align:center; color:#777">لا توجد مهام حالياً</p>';
            return;
        }

        div.innerHTML = tasks.map(t => `
            <div class="glass task">
                <div>
                    <h4>${t.title}</h4>
                    <span class="gold">+${t.reward} DZD</span>
                </div>
                <button class="btn small" onclick="doTask('${t.id}', '${t.url}', ${t.seconds})">بدء</button>
            </div>
        `).join('');
    } catch (e) {
        console.error(e);
    }
}

// دالة تنفيذ المهمة
function doTask(id, url, sec) {
    tg.openLink(url);
    
    // تأثير بصري للزر
    let btn = event.target;
    let oldText = btn.innerText;
    btn.disabled = true;
    
    let timeLeft = sec;
    const timer = setInterval(() => {
        btn.innerText = `⏳ ${timeLeft}`;
        timeLeft--;
        
        if (timeLeft < 0) {
            clearInterval(timer);
            claimReward(id, btn, oldText);
        }
    }, 1000);
}

async function claimReward(taskId, btn, oldText) {
    const userId = tg.initDataUnsafe?.user?.id;
    if(!userId) return alert("فشل التحقق من المستخدم");

    btn.innerText = "تحقق...";
    
    try {
        const res = await fetch('/api/claim', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ userId, taskId })
        });
        const json = await res.json();
        
        if(json.success) { 
            alert("✅ " + json.msg); 
            location.reload(); 
        } else {
            alert("❌ " + json.error);
            btn.innerText = oldText;
            btn.disabled = false;
        }
    } catch (e) {
        btn.innerText = "خطأ";
    }
}

// تشغيل عند البداية
init();

