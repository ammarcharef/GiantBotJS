const tg = window.Telegram.WebApp;
tg.expand();
let userId = null;

async function init() {
    const p = new URLSearchParams(window.location.search);
    userId = p.get('uid') || tg.initDataUnsafe?.user?.id;

    if (!userId) return alert("يرجى الدخول من البوت");

    // جلب البيانات الأولية
    const [userRes, homeRes] = await Promise.all([
        fetch(`/api/me/${userId}`),
        fetch(`/api/home`)
    ]);
    
    const user = await userRes.json();
    const home = await homeRes.json();

    document.getElementById('loader').style.display = 'none';
    
    updateUI(user);
    renderTasks(home.tasks);
    renderShop(home.shop);

    // ملء البيانات إن وجدت
    if(user.fullName) {
        document.getElementById('p-name').value = user.fullName;
        document.getElementById('p-phone').value = user.phone;
        document.getElementById('p-ccp').value = user.ccp;
    }
}

function updateUI(user) {
    document.getElementById('balance').innerText = user.balance.toFixed(2);
    document.getElementById('lvl').innerText = user.level;
}

function nav(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(`${page}-page`).classList.add('active');
    
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    event.currentTarget.classList.add('active');
    tg.HapticFeedback.selectionChanged();
}

function renderTasks(tasks) {
    const div = document.getElementById('tasks-list');
    div.innerHTML = tasks.map(t => `
        <div class="task-card">
            <div>
                <h4 style="margin:0">${t.title}</h4>
                <small style="color:#8b5cf6">+${t.xpReward} XP</small>
            </div>
            <button class="btn-neon" style="width:auto; padding:5px 15px; margin:0" 
                onclick="doTask('${t._id}', '${t.url}', ${t.seconds}, ${t.reward})">
                +${t.reward}
            </button>
        </div>
    `).join('');
}

function renderShop(items) {
    const div = document.getElementById('shop-list');
    div.innerHTML = items.map(i => `
        <div class="shop-card">
            <div style="font-size:2rem; margin-bottom:10px">🎁</div>
            <h4>${i.name}</h4>
            <p style="color:#999; font-size:0.8rem">${i.description}</p>
            <button class="btn-buy" onclick="buy('${i._id}', ${i.price})">${i.price} DZD</button>
        </div>
    `).join('');
}

function doTask(id, url, sec, reward) {
    tg.openLink(url);
    tg.HapticFeedback.impactOccurred('heavy');
    setTimeout(async () => {
        const res = await fetch('/api/do_task', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({userId, taskId:id}) });
        const json = await res.json();
        if(json.success) {
            tg.showPopup({ title: 'مبروك! 🎉', message: json.msg });
            document.getElementById('balance').innerText = json.newBalance.toFixed(2);
            document.getElementById('lvl').innerText = json.newLevel;
        }
    }, sec * 1000);
}

async function buy(id, price) {
    const conf = confirm(`هل تريد شراء هذا المنتج بـ ${price} دج؟`);
    if(!conf) return;
    
    const res = await fetch('/api/buy', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({userId, itemId:id}) });
    const json = await res.json();
    
    if(json.success) {
        tg.showPopup({ title: 'تم الشراء ✅', message: 'تم استلام طلبك وسيتم مراسلتك بالتفاصيل.' });
        location.reload();
    } else {
        tg.showPopup({ title: 'خطأ ❌', message: json.error });
    }
}

async function saveProfile() {
    const data = {
        userId,
        name: document.getElementById('p-name').value,
        phone: document.getElementById('p-phone').value,
        ccp: document.getElementById('p-ccp').value
    };
    await fetch('/api/register', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
    tg.showPopup({ title: 'نجاح', message: 'تم حفظ بياناتك بأمان 🔒' });
}

init();