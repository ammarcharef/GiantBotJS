from aiogram.types import ReplyKeyboardMarkup, KeyboardButton, WebAppInfo

def get_main_keyboard():
    """
    إنشاء لوحة المفاتيح الرئيسية التي تظهر للمستخدم
    تحتوي على زر التطبيق (Web App) وأزرار الدعم
    """
    # رابط الموقع - سيتم تحديثه لاحقاً برابط Render الحقيقي
    # ملاحظة: استبدل الرابط أدناه برابط موقعك بعد الرفع
    web_app_url = "https://giantbot.onrender.com/dashboard"
    
    kb = [
        [
            KeyboardButton(
                text="📱 دخول المنصة والربح", 
                web_app=WebAppInfo(url=web_app_url)
            )
        ],
        [
            KeyboardButton(text="💰 رصيدي"),
            KeyboardButton(text="💳 سحب الأرباح")
        ],
        [
            KeyboardButton(text="🆘 الدعم الفني"),
            KeyboardButton(text="📜 الشروط والأحكام")
        ]
    ]
    
    return ReplyKeyboardMarkup(
        keyboard=kb,
        resize_keyboard=True,
        input_field_placeholder="اختر من القائمة..."
    )