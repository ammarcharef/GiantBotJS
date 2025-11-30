// --- دالة فتح Adsterra الديناميكية ---
async function openAdsterra() {
    if (!userId) return showToast("ادخل من البوت", true);

    const btn = event.currentTarget;
    const originalText = btn.innerHTML;
    btn.innerHTML = "⏳ جاري الجلب...";
    btn.disabled = true;

    try {
        // 1. جلب الرابط الحالي من السيرفر
        const resConfig = await fetch('/api/ad-config');
        const config = await resConfig.json();
        
        if (!config.link || config.link === "https://google.com") {
            btn.innerHTML = originalText;
            btn.disabled = false;
            return showToast("الإعلانات غير متوفرة حالياً", true);
        }

        // 2. فتح الرابط
        tg.openLink(config.link);

        // 3. بدء المؤقت للمكافأة
        let timeLeft = 15;
        const timer = setInterval(() => {
            btn.innerHTML = `⏳ انتظر... ${timeLeft}`;
            timeLeft--;
            if (timeLeft <= 0) {
                clearInterval(timer);
                btn.innerHTML = originalText;
                btn.disabled = false;
                giveDynamicReward();
            }
        }, 1000);

    } catch (e) {
        btn.innerHTML = originalText;
        btn.disabled = false;
        showToast("خطأ اتصال");
    }
}

async function giveDynamicReward() {
    try {
        const res = await fetch('/api/ad_reward', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ userId })
        });
        const json = await res.json();
        if (json.success) {
            showToast(`💰 مبروك! تمت إضافة ${json.added} DZD`);
            // تحديث الرصيد
            let bal = parseFloat(document.getElementById('balance').innerText);
            document.getElementById('balance').innerText = (bal + parseFloat(json.added)).toFixed(2);
        }
    } catch (e) {}
}