import sys
import os
from flask import Flask, render_template, jsonify, request, redirect, url_for

# ضبط المسارات لاستيراد الملفات الخارجية
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
sys.path.append(parent_dir)

from database import db, update_balance, add_new_task, tasks_col, system_wallet_col
from config import USER_PERCENTAGE, SYSTEM_PERCENTAGE, ADMIN_PASSWORD

app = Flask(__name__, template_folder='templates', static_folder='static')

# --- 1. الصفحات الرئيسية ---

@app.route('/dashboard')
def dashboard():
    return render_template('dashboard.html')

@app.route('/wallet')
def wallet():
    # صفحة المحفظة (يمكنك إنشاؤها لاحقاً، حالياً سنعرض رسالة)
    return "<h1>صفحة المحفظة قيد الإنشاء 🛠️</h1>"

# --- 2. لوحة تحكم الأدمن (لإضافة المهام) ---

@app.route('/admin', methods=['GET', 'POST'])
def admin_panel():
    message = ""
    if request.method == 'POST':
        # التحقق من كلمة المرور
        password = request.form.get('password')
        if password != ADMIN_PASSWORD:
            message = "❌ كلمة المرور خاطئة!"
        else:
            # استلام بيانات المهمة
            title = request.form.get('title')
            url = request.form.get('url')
            price = request.form.get('price') # السعر الكامل
            seconds = request.form.get('seconds')
            
            # حفظ في قاعدة البيانات
            add_new_task(title, url, price, seconds)
            message = "✅ تمت إضافة المهمة بنجاح!"

    return render_template('admin.html', msg=message)

# --- 3. واجهة البيانات (API) ---

@app.route('/api/get_tasks', methods=['GET'])
def get_tasks():
    # جلب المهام النشطة
    # نعيد أحدث 20 مهمة
    tasks_cursor = tasks_col.find({"active": True}).sort("created_at", -1).limit(20)
    
    tasks_list = []
    for task in tasks_cursor:
        full_price = task['price']
        user_reward = full_price * USER_PERCENTAGE # حساب نصيب المستخدم
        
        tasks_list.append({
            "id": str(task['_id']),
            "title": task['title'],
            "reward": round(user_reward, 2),
            "time": task['seconds'],
            "url": task['link']
        })
    
    return jsonify(tasks_list)

@app.route('/api/claim_reward', methods=['POST'])
def claim_reward():
    data = request.json
    user_id = data.get('user_id')
    task_id_str = data.get('task_id')
    
    # تحويل ID المهمة من نص إلى ObjectId
    from bson.objectid import ObjectId
    try:
        task_id = ObjectId(task_id_str)
    except:
        return jsonify({"status": "error", "message": "معرف مهمة غير صالح"}), 400

    task = tasks_col.find_one({"_id": task_id})
    
    if not task:
        return jsonify({"status": "error", "message": "المهمة غير موجودة"}), 404

    # حساب الأرباح
    full_price = task['price']
    user_share = full_price * USER_PERCENTAGE
    system_share = full_price * SYSTEM_PERCENTAGE
    
    # تنفيذ المعاملة المالية
    # 1. المستخدم
    update_balance(user_id, user_share)
    
    # 2. الشركة (أنت)
    system_wallet_col.update_one(
        {"_id": "master_wallet"},
        {"$inc": {"balance": system_share}},
        upsert=True
    )
    
    return jsonify({
        "status": "success", 
        "new_balance": user_share,
        "message": "تم استلام المكافأة"
    })

# تشغيل التطبيق (لا تقم بتشغيله هنا، سيتم تشغيله عبر main.py)