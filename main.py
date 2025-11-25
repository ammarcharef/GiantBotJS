#!/usr/bin/env python3
import asyncio
import logging
import os
import sys
from threading import Thread

# --- خدعة برمجية لضمان رؤية المجلدات ---
# هذا يضيف المجلد الحالي إلى مسارات بايثون لتجنب ModuleNotFoundError
sys.path.append(os.getcwd())

from aiogram import Bot, Dispatcher, types
from aiogram.filters import Command
from config import BOT_TOKEN
from database import register_user

# استدعاء الملفات الفرعية
from bot.handlers import router as bot_router
from website.app import app as flask_app 

# إعداد السجلات (Log) لرؤية الأخطاء بوضوح
logging.basicConfig(level=logging.INFO)

# تهيئة البوت
bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()
dp.include_router(bot_router)

# --- وظيفة تشغيل الموقع ---
def run_web_server():
    # Render يحدد المنفذ تلقائياً عبر متغير البيئة PORT
    # إذا لم يجده سيستخدم 10000 كاحتياطي
    port = int(os.environ.get("PORT", 10000))
    print(f"🚀 Starting Web Server on port {port}")
    # مهم: host='0.0.0.0' ضروري ليعمل الموقع على السيرفر الخارجي
    flask_app.run(host='0.0.0.0', port=port, debug=False, use_reloader=False)

# --- وظيفة التشغيل الرئيسية ---
async def main():
    # 1. تشغيل الموقع في خيط منفصل (Thread)
    server_thread = Thread(target=run_web_server)
    server_thread.daemon = True
    server_thread.start()
    
    print("✅ Web Server is running in background...")
    
    # 2. تشغيل البوت
    print("✅ Bot is starting polling...")
    # حذف التحديثات القديمة لتجنب التكرار عند إعادة التشغيل
    await bot.delete_webhook(drop_pending_updates=True)
    await dp.start_polling(bot)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("🛑 System Stopped")
