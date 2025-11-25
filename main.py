import asyncio
import logging
import os
from threading import Thread
from aiogram import Bot, Dispatcher
from config import BOT_TOKEN

# استيراد الراوتر والتطبيق
from bot.handlers import router as bot_router
from website.app import app as flask_app 

logging.basicConfig(level=logging.INFO)

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()
dp.include_router(bot_router)

def run_web_server():
    port = int(os.environ.get("PORT", 10000))
    flask_app.run(host='0.0.0.0', port=port)

async def main():
    # تشغيل السيرفر في الخلفية
    server_thread = Thread(target=run_web_server)
    server_thread.daemon = True
    server_thread.start()
    
    print("✅ System Started...")
    await bot.delete_webhook(drop_pending_updates=True)
    await dp.start_polling(bot)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("🛑 Stopped")