<!DOCTYPE html>
<html dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>المنصة العملاقة</title>
    <link rel="stylesheet" href="style.css">
    <script src="https://telegram.org/js/telegram-web-app.js?v=7.10"></script>
</head>
<body>

    <div id="loader" style="text-align:center; margin-top:50px;">
        <h3 style="color:#fbbf24;">جاري الاتصال... ⏳</h3>
    </div>

    <div id="register-screen" class="hidden">
        <div class="glass">
            <h2>📝 إكمال الملف الشخصي</h2>
            <p class="warning" style="color:#ef4444; font-size:0.9rem;">⚠️ انتبه: لا يمكنك تغيير معلومات الدفع لاحقاً!</p>
            
            <label>المعلومات الشخصية:</label>
            <input type="text" id="r-name" placeholder="الاسم واللقب">
            <input type="tel" id="r-phone" placeholder="رقم الهاتف">
            <input type="text" id="r-addr" placeholder="العنوان (الولاية)">
            
            <hr style="border-color:#444; margin:15px 0;">
            
            <label>معلومات السحب:</label>
            <select id="r-method">
                <option value="CCP">بريد الجزائر (CCP)</option>
                <option value="BaridiMob">BaridiMob</option>
            </select>
            <input type="text" id="r-acc" placeholder="رقم الحساب (RIP/CCP)">
            <input type="password" id="r-pass" placeholder="أنشئ كلمة سر للسحب">
            
            <button class="btn" onclick="register()">حفظ وبدء العمل ✅</button>
        </div>
    </div>

    <div id="main-screen" class="hidden">
        <div class="glass center" style="text-align:center;">
            <p style="color:#ccc;">رصيدك الحالي</p>
            <h1 class="gold" style="font-size:2.5rem; margin:10px 0;"><span id="balance">0.00</span> DZD</h1>
            <div style="background:#334155; padding:5px; border-radius:5px; display:inline-block;">
                <small>🆔 كود الإحالة: <span id="ref-code" style="color:#fbbf24;">...</span></small>
            </div>
        </div>

        <h3 style="margin-top:20px; color:#fbbf24;">🔥 المهام المتاحة اليوم</h3>
        <div id="tasks-container">
            <p style="text-align:center;">جاري جلب المهام...</p>
        </div>
    </div>

    <script src="script.js"></script>
</body>
</html>
