// --- KONFIGURACE ---
const API_BASE = 'https://crm.skch.cz/ajax0/procedure.php';

// Výchozí data (fallback)
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

// --- DATA LOGIKA ---
function populateUsers(usersData) {
    userSelect.innerHTML = '<option value="" disabled>Vyberte uživatele</option>';
    
    // Ošetření: Pokud učitel pošle objekt, převedeme ho na pole. Pokud pole, necháme ho být.
    const usersArray = Array.isArray(usersData) ? usersData : Object.values(usersData);

    usersArray.forEach(u => {
        const opt = document.createElement('option');
        // Ošetření: Učitel posílá "ID", my dříve měli "id"
        opt.value = u.ID || u.id;
        opt.textContent = u.name;
        userSelect.appendChild(opt);
    });

    const savedUser = getLastUser();
    if (savedUser && Array.from(userSelect.options).some(o => o.value === savedUser)) {
        userSelect.value = savedUser;
    }
}


// --- OFFLINE FRONT (Local Storage) ---
function saveToOfflineQueue(payload) {
    // Načte existující frontu nebo vytvoří prázdné pole
    let queue = JSON.parse(localStorage.getItem('coffeeSyncQueue') || '[]');
    queue.push(payload);
    localStorage.setItem('coffeeSyncQueue', JSON.stringify(queue));
}

async function syncOfflineData() {
    // Pokud prohlížeč ví, že je offline, ani se nesnažíme
    if (!navigator.onLine) return;

    let queue = JSON.parse(localStorage.getItem('coffeeSyncQueue') || '[]');
    if (queue.length === 0) return;

    let remainingQueue = [];
    let syncedCount = 0;

    for (let payload of queue) {
        try {
            const response = await fetch(`${API_BASE}?cmd=saveDrinks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error('API chyba při synchronizaci');
            syncedCount++; // Úspěšně odesláno, nevracíme do fronty
        } catch (error) {
            console.error("Synchronizace selhala, vracím do fronty:", error);
            remainingQueue.push(payload); // API stále nejede, necháme na později
        }
    }

    // Uložíme zbytek fronty (případně prázdné pole, pokud prošlo vše)
    localStorage.setItem('coffeeSyncQueue', JSON.stringify(remainingQueue));
    
    if (syncedCount > 0) {
        showToast(`Synchronizováno ${syncedCount} offline záznamů!`);
    }
}



// --- API KOMUNIKACE ---
async function loadInitialData() {
    try {
        // 1. Uživatelé
        const resUsers = await fetch(`${API_BASE}?cmd=getPeopleList`);
        if (!resUsers.ok) throw new Error('API chyba - uživatelé');
        const realUsers = await resUsers.json();

        // 2. Nápoje
        const resTypes = await fetch(`${API_BASE}?cmd=getTypesList`);
        if (!resTypes.ok) throw new Error('API chyba - nápoje');
        const realTypesData = await resTypes.json();

        populateUsers(realUsers);

        currentDrinks = {};
        
        // Ošetření struktury nápojů (převod z objektu na pole, pokud je třeba)
        // Převod objektu z API na iterovatelné pole
        const typesArray = Object.values(realTypesData);
        
        typesArray.forEach(drink => {
            // Natvrdo bereme klíč "typ" přesně podle učitelova JSONu
            const drinkName = drink.typ;
            currentDrinks[drinkName] = 0;
        });

        renderDrinks();

    } catch (error) {
        console.error("Kritická chyba, nahazuji fallback:", error);
        populateUsers(DEFAULT_USERS);
        DEFAULT_DRINKS.forEach(d => currentDrinks[d] = 0);
        renderDrinks();
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

    // Detekce fyzického odpojení od sítě (vypnutá WiFi/Data)
    if (!navigator.onLine) {
        saveToOfflineQueue(payload);
        showToast('Jsi offline. Uloženo lokálně pro pozdější odeslání.');
        Object.keys(currentDrinks).forEach(k => currentDrinks[k] = 0);
        renderDrinks();
        return;
    }

    try {
        const response = await fetch(`${API_BASE}?cmd=saveDrinks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error('Server hlásí chybu');
        
        showToast('Úspěšně uloženo!');
        Object.keys(currentDrinks).forEach(k => currentDrinks[k] = 0);
        renderDrinks();

    } catch (error) {
        // Záchyt pro případ, kdy síť sice je, ale učitelův server spadl (Timeout / CORS)
        console.error("Chyba spojení se serverem:", error);
        saveToOfflineQueue(payload);
        showToast('Server je nedostupný. Uloženo lokálně pro pozdější odeslání.', true);
        Object.keys(currentDrinks).forEach(k => currentDrinks[k] = 0);
        renderDrinks();
    }
}

// --- START ---
loadInitialData();
btnSubmit.addEventListener('click', submitData);
// Posluchač na událost prohlížeče "připojeno k síti"
window.addEventListener('online', syncOfflineData);

// Pokus o synchronizaci rovnou při startu aplikace (pokud zůstalo něco viset z minula)
syncOfflineData();