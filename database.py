import pymongo
import datetime
from config import MONGO_URL

# الاتصال بالسيرفر
try:
    client = pymongo.MongoClient(MONGO_URL)
    db = client['GiantBotDB']
    print("✅ تم الاتصال بقاعدة البيانات بنجاح")
except Exception as e:
    print(f"❌ خطأ في الاتصال بقاعدة البيانات: {e}")

# الجداول (Collections)
users_col = db['users']
tasks_col = db['tasks']
withdrawals_col = db['withdrawals']
system_wallet_col = db['system_wallet']

# --- دوال المستخدمين ---
def register_user(user_id, first_name):
    if not users_col.find_one({"_id": user_id}):
        users_col.insert_one({
            "_id": user_id,
            "name": first_name,
            "balance": 0.00,
            "completed_tasks": 0,
            "joined_at": datetime.datetime.now()
        })
        return True
    return False

def update_balance(user_id, amount):
    users_col.update_one(
        {"_id": user_id},
        {"$inc": {"balance": amount}}
    )

# --- دوال المهام (الجديدة) ---
def add_new_task(title, url, price, seconds):
    """
    إضافة مهمة جديدة لقاعدة البيانات
    price: السعر الكامل الذي يدفعه المعلن
    """
    tasks_col.insert_one({
        "title": title,
        "link": url,
        "price": float(price),
        "seconds": int(seconds),
        "active": True,
        "created_at": datetime.datetime.now()
    })