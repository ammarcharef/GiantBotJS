from aiogram import Router, F, types
from aiogram.filters import Command
from bot.keyboards import get_main_keyboard
from database import users_col  # لاستدعاء بيانات الرصيد

# تعريف الراوتر (المسؤول عن توجيه الرسائل)
router = Router()

# --- أمر البداية /start ---
@router.message(Command("start"))
async def cmd_start(message: types.Message):
    user_name = message.from_user.first_name
    
    await message.answer(
        f"أهلاً بك يا {user_name} في البوت العملاق! 🇩🇿💎\n\n"
        "🚀 منصتنا تتيح لك الربح من الهاتف بطريقة شرعية 100%.\n"
        "✅ شاهد الإعلانات.\n"
        "✅ نفذ المهام.\n"
        "✅ اسحب أرباحك عبر CCP أو BaridiMob.\n\n"
        "👇 اضغط على 'دخول المنصة' للبدء",
        reply_markup=get_main_keyboard()
    )

# --- زر رصيدي ---
@router.message(F.text == "💰 رصيدي")
async def check_balance(message: types.Message):
    user_id = message.from_user.id
    
    # جلب الرصيد من قاعدة البيانات
    user_data = users_col.find_one({"_id": user_id})
    
    if user_data:
        balance = user_data.get('balance', 0.0)
        await message.answer(f"💰 رصيدك الحالي هو: *{balance:.2f} DZD*", parse_mode="Markdown")
    else:
        await message.answer("⚠️ ليس لديك حساب مسجل، اضغط /start للتسجيل.")

# --- زر سحب الأرباح ---
@router.message(F.text == "💳 سحب الأرباح")
async def withdraw_info(message: types.Message):
    await message.answer(
        "لطلب السحب، يرجى الدخول إلى **المنصة** 📱 ثم الانتقال إلى صفحة المحفظة.",
        reply_markup=get_main_keyboard()
    )

# --- زر الدعم الفني ---
@router.message(F.text == "🆘 الدعم الفني")
async def support(message: types.Message):
    await message.answer("للتواصل مع الإدارة: @YourUsername")