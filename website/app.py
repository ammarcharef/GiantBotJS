# تشغيلimport sys
import os
from flask import Flask, render_template, jsonify, request

# إضافة المجلد الرئيسي للمسارات (Fix Import Errors)
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
if parent_dir not in sys.path:
    sys.path.append(parent_dir)

from database import db, update_balance, add_new_task, tasks_col, system_wallet_col
from config import USER_PERCENTAGE, SYSTEM_PERCENTAGE, ADMIN_PASSWORD

app = Flask(__name__, template_folder='templates', static_folder='static')

# ... (باقي الكود كما هو) ... التطبيق (لا تقم بتشغيله هنا، سيتم تشغيله عبر main.py)
