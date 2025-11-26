// تهيئة تيلجرام
const tg = window.Telegram.WebApp;
tg.expand(); // توسيع الشاشة لتملأ الهاتف

// متغير لتخزين هوية المستخدم
let currentUserId = null;

// --- دالة البدء (تعمل فور فتح الموقع) ---
async function init() {
    try {
        // 1. محاولة الحصول على الآيدي من تيلجرام
        const user = tg.initDataUnsafe?.user;
        
        if (user && user.id) {
            currentUserId = user.id;
        } else {
            console.warn("لم يتم العثور على بيانات المستخدم من تيلجرام");
        }

        // 2. إخفاء شاشة التحميل في كل الأحوال
        document.getElementById('loader').style.display = 'none';

        if (!currentUserId) {
            // حالة الخطأ: لم يفتح من تيلجرام أو حدث مشكلة في الشبكة
            // نظهر شاشة التسجيل ليتمكن المستخدم من المحاولة أو نطلب منه العودة للبوت
            alert("تنبيه: لم يتم التعرف على حسابك تلقائياً. يرجى التأكد من فتح المنصة عبر البوت.");
            document.getElementById('register-screen').classList.remove('hidden');
            return;
        }

        // 3. الاتصال بالسيرفر لجلب بيانات المستخدم
        const res = await fetch(`/api/user/${currentUserId}`);
        
        if (!res.ok) throw new Error("فشل الاتصال بالسيرفر");
        
        const userData = await res.json();

        // 4. التوجيه حسب حالة المستخدم
        if (userData.paymentLocked) {
            // المستخدم مسجل من قبل -> اعرض لوحة التحكم
            showDashboard(userData);
        } else {
            // مستخدم جديد -> اعرض شاشة التسجيل
            document.getElementById('register-screen').classList.remove('hidden');
            // ملء الاسم تلقائياً لتسهيل الأمر
            if (user?.first_name) document.getElementById('r-name').value = user.first_name;
        }

    } catch (error) {
        console.error(error);
        alert("حدث خطأ في الاتصال. حاول تحديث الصفحة.");
        document.getElementById('loader').style.display = 'none';
        document.getElementById('register-screen').classList.remove('hidden');
    }
}

// --- دالة عرض الداشبورد ---
function showDashboard(user) {
    document.getElementById('register-screen').classList.add('hidden');
    document.getElementById('main-screen').classList.remove('hidden');
    
    document.getElementById('balance').innerText = user.balance.toFixed(2);
    document.getElementById('ref-code').innerText = user.refCode || user.id;
    
    loadTasks(); // استدعاء دالة جلب المهام
}

// --- دالة التسجيل (الحفظ) ---
async function register() {
    // محاولة أخيرة للتأكد من الآيدي قبل الإرسال
    if (!currentUserId) currentUserId = tg.initDataUnsafe?.user?.id;

    if (!currentUserId) {
        alert("خطأ: لا يوجد معرف مستخدم. أعد تشغيل البوت.");
        return;
    }

    const data = {
        userId: currentUserId,
        fullName: document.getElementById('r-name').value,
        phone: document.getElementById('r-phone').value,
        address: document.getElementById('r-addr').value,
        method: document.getElementById('r-method').value,
        account: document.getElementById('r-acc').value,
        pass: document.getElementById('r-pass').value
    };

    // التحقق من الحقول الفارغة
    if (!data.fullName || !data.account || !data.pass) {
        alert("⚠️ يرجى ملء جميع الحقول ومعلومات الدفع!");
        return;
    }

    // قفل الزر لمنع التكرار
    const btn = document.querySelector('button');
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
            alert("✅ تم الحفظ بنجاح! أهلاً بك في الفريق.");
            location.reload(); // إعادة تحميل الصفحة للدخول للداشبورد
        } else {
            alert("❌ خطأ: " + (json.error || "فشلت العملية"));
            btn.innerText = "حفظ وبدء العمل ✅";
            btn.disabled = false;
        }
    } catch (e) {
        alert("فشل الاتصال بالسيرفر. تحقق من الانترنت.");
        btn.innerText = "حفظ وبدء العمل ✅";
        btn.disabled = false;
    }
}

// --- دالة تحميل قائمة المهام ---
async function loadTasks() {
    try {
        const res = await fetch('/api/tasks');
        const tasks = await res.json();
        const container = document.getElementById('tasks-container');
        
        if (tasks.length === 0) {
            container.innerHTML = '<div style="padding:20px; color:#888;">لا توجد مهام متاحة حالياً. عد لاحقاً!</div>';
            return;
        }

        container.innerHTML = tasks.map(t => `
            <div class="glass task" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <div>
                    <h4 style="margin:0 0 5px 0;">${t.title}</h4>
                    <span class="gold" style="font-weight:bold;">+${t.reward} DZD</span>
                </div>
                <button class="btn small" style="width:auto; padding:5px 15px; margin:0;" onclick="doTask('${t.id}', '${t.url}', ${t.seconds})">
                    بدء ▶️
                </button>
            </div>
        `).join('');
    } catch (e) {
        console.error("Error loading tasks", e);
    }
}

// --- دالة تنفيذ المهمة ---
function doTask(id, url, sec) {
    // فتح الرابط
    tg.openLink(url);
    
    // البحث عن الزر الذي تم ضغطه وتغييره
    const btn = event.target;
    const originalText = btn.innerText;
    
    btn.disabled = true;
    let timeLeft = sec;
    
    const timer = setInterval(() => {
        btn.innerText = `⏳ ${timeLeft}`;
        timeLeft--;
        
        if (timeLeft < 0) {
            clearInterval(timer);
            claimReward(id, btn, originalText);
        }
    }, 1000);
}

// --- دالة المطالبة بالأرباح ---
async function claimReward(taskId, btnElement, originalText) {
    btnElement.innerText = "تحقق...";
    
    try {
        const res = await fetch('/api/claim', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ userId: currentUserId, taskId: taskId })
        });
        
        const json = await res.json();
        
        if (json.success) {
            alert("✅ " + (json.msg || "تمت إضافة الرصيد!"));
            location.reload(); // تحديث الصفحة لتحديث الرصيد وإخفاء المهمة (اختياري)
        } else {
            alert("❌ " + json.error);
            btnElement.innerText = originalText;
            btnElement.disabled = false;
        }
    } catch (e) {
        alert("خطأ في الاتصال");
        btnElement.innerText = originalText;
        btnElement.disabled = false;
    }
}

// تشغيل الدالة الرئيسية
init();
