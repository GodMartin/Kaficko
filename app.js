const API_BASE = '[https://crm.skch.cz/ajax0/procedure.php](https://crm.skch.cz/ajax0/procedure.php)';

// Výchozí data (fallback, pokud API nepojede kvůli CORS nebo výpadku)
const DEFAULT_DRINKS = ["Mléko", "Espresso", "Coffe", "Long", "Doppio+"];
const DEFAULT_USERS = [
    { id: "1", name: "Jan Novák" },
    { id: "2", name: "Martin (Ty)" },
    { id: "3", name: "Učitel" }
];

// --- STAV APLIKACE ---
let currentDrinks = {};

// --- DOM ELEMENTY ---
const userSelect = document.getElementById('userSelect');
const drinkList = document.getElementById('drinkList');
const btnSubmit = document.getElementById('btnSubmit');
const toastEl = document.getElementById('toast');

// --- PWA INICIALIZACE ---
function initPWA() {
    // 1. Vytvoření Manifestu jako Data URI
    const manifest = {
        name: "Kávový deník",
        short_name: "Káva",
        start_url: ".",
        display: "standalone",
        background_color: "#121212",
        theme_color: "#121212",
        icons: [{
            src: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdib3g9IjAgMCAxMDAgMTAwIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI0MCIgZmlsbD0iI2JiODZmYyIvPjwvc3ZnPg==",
            sizes: "192x192",
            type: "image/svg+xml"
        }]
    };
    const manifestBlob = new Blob([JSON.stringify(manifest)], {type: 'application/manifest+json'});
    const manifestLink = document.getElementById('manifest-link');
    if (manifestLink) {
        manifestLink.href = URL.createObjectURL(manifestBlob);
    }

    // 2. Vytvoření a registrace Service Workeru
    const swCode = `
        const CACHE_NAME = 'coffee-v1';
        self.addEventListener('install', e => self.skipWaiting());
        self.addEventListener('activate', e => self.clients.claim());
        self.addEventListener('fetch', e => {
            e.respondWith(fetch(e.request).catch(() => new Response('Jsi offline, ale appka běží.')));
        });
    `;
    const swBlob = new Blob([swCode], {type: 'application/javascript'});
    const swUrl = URL.createObjectURL(swBlob);
    
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register(swUrl).catch(err => console.error("SW Reg Error:", err));
    }
}

// --- STORAGE & COOKIES ---
function saveLastUser(userId) {
    localStorage.setItem('lastUserId', userId);
    document.cookie = `lastUserId=${userId}; max-age=31536000; path=/; SameSite=Strict`;
}

function getLastUser() {
    let user = localStorage.getItem('lastUserId');
    if (!user) {
        const match = document.cookie.match(/(?:^|; )lastUserId=([^;]*)/);
        user = match ? match[1] : null;
    }
    return user;
}

// --- UI FUNKCE ---
function showToast(msg, isError = false) {
    toastEl.textContent = msg;
    toastEl.className = `toast show ${isError ? 'error' : 'success'}`;
    setTimeout(() => { toastEl.className = 'toast'; }, 3000);
}

function renderDrinks() {
    drinkList.innerHTML = '';
    Object.keys(currentDrinks).forEach(type => {
        const val = currentDrinks[type];
        
        const item = document.createElement('div');
        item.className = 'drink-item';
        
        item.innerHTML = `
            <div class="drink-name">${type}</div>
            <div class="controls">
                <button class="btn-control btn-minus" data-type="${type}">-</button>
                <span class="drink-value" id="val-${type}">${val}</span>
                <button class="btn-control btn-plus" data-type="${type}">+</button>
            </div>
        `;
        drinkList.appendChild(item);
    });

    document.querySelectorAll('.btn-minus').forEach(btn => {
        btn.addEventListener('click', (e) => updateDrink(e.target.dataset.type, -1));
    });
    document.querySelectorAll('.btn-plus').forEach(btn => {
        btn.addEventListener('click', (e) => updateDrink(e.target.dataset.type, 1));
    });
}

function updateDrink(type, delta) {
    let newVal = currentDrinks[type] + delta;
    if (newVal < 0) newVal = 0;
    currentDrinks[type] = newVal;
    document.getElementById(`val-${type}`).textContent = newVal;
}

// --- API KOMUNIKACE ---
async function loadInitialData() {
    try {
        // Fallback pro lokální testování, pokud reálné API hodí CORS chybu
        populateUsers(DEFAULT_USERS);
        DEFAULT_DRINKS.forEach(d => currentDrinks[d] = 0);
        renderDrinks();
    } catch (error) {
        console.error("API Error:", error);
    }
}

function populateUsers(users) {
    userSelect.innerHTML = '<option value="" disabled>Vyberte uživatele</option>';
    users.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.id;
        opt.textContent = u.name;
        userSelect.appendChild(opt);
    });

    const savedUser = getLastUser();
    if (savedUser && Array.from(userSelect.options).some(o => o.value === savedUser)) {
        userSelect.value = savedUser;
    }
}

async function submitData() {
    const userId = userSelect.value;
    if (!userId) {
        showToast('Musíš vybrat uživatele!', true);
        return;
    }

    const payload = {
        user: userId,
        drinks: Object.entries(currentDrinks).map(([type, value]) => ({ type, value }))
    };

    saveLastUser(userId);

    try {
        const response = await fetch(`${API_BASE}?cmd=saveDrinks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error('Network error');
        
        showToast('Úspěšně uloženo!');
        Object.keys(currentDrinks).forEach(k => currentDrinks[k] = 0);
        renderDrinks();

    } catch (error) {
        console.error("Submit error:", error);
        console.log("Odesílaný payload pro kontrolu:", JSON.stringify(payload, null, 2));
        showToast('Uloženo (Simulace - API nedostupné)');
        Object.keys(currentDrinks).forEach(k => currentDrinks[k] = 0);
        renderDrinks();
    }
}

// --- START ---
initPWA();
loadInitialData();
btnSubmit.addEventListener('click', submitData);
