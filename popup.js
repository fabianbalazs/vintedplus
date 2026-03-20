document.addEventListener('DOMContentLoaded', async () => {
    const listContainer = document.getElementById('product-list');
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Detect language
    let isHu = false;
    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => document.documentElement.lang
        });
        if (results && results[0] && results[0].result) {
            isHu = results[0].result.startsWith('hu');
        }
    } catch (err) {}

    // Apply language labels
    applyLabels(isHu);

    // Init UI
    initTabs();
    initSearchAndFilter(isHu);

    if (!tab) return;

    const texts = {
        notProfile: isHu
            ? `<strong>Nem vagy a profilodon!</strong><br><br>A "Relist" funkció csak a saját gardrób oldaladon működik.<br><br><a href="#" id="go-to-profile" style="color: #007782; font-weight: bold;">Kattints a profilodra!</a>`
            : `<strong>You're not on your profile!</strong><br><br>The "Relist" feature only works on your own wardrobe page.<br><br><a href="#" id="go-to-profile" style="color: #007782; font-weight: bold;">Go to your profile!</a>`,
        noItems: isHu
            ? `Nem találtam termékeket.<br><br><strong>Tippek:</strong><br>1. Nyisd meg a saját gardróbodat!<br>2. Frissítsd az oldalt (F5)!`
            : `No items found.<br><br><strong>Tips:</strong><br>1. Open your own wardrobe!<br>2. Refresh the page (F5)!`,
        error: isHu
            ? `Hiba történt. Frissítsd a Vinted oldalt!`
            : `An error occurred. Refresh the page!`
    };

    if (!tab.url.includes('/member/')) {
        listContainer.innerHTML = `<div class="loading">${texts.notProfile}</div>`;
        return;
    }

    // Show scanning indicator while scroll-scrape runs
    const scanMsg = isHu
        ? `Termékek betöltése...<br><small>Oldal szkennelése folyamatban</small>`
        : `Loading items...<br><small>Scanning page, please wait</small>`;
    listContainer.innerHTML = `<div class="loading">${scanMsg}</div>`;

    try {
        chrome.tabs.sendMessage(tab.id, { action: "GET_ITEMS" }, (response) => {
            if (chrome.runtime.lastError || !response || !response.items || response.items.length === 0) {
                listContainer.innerHTML = `<div class="loading">${texts.noItems}</div>`;
                return;
            }

            const items = response.items;

            // Badge
            const activeCount = items.filter(i => !i.isSold && !i.isDraft).length;
            document.getElementById('item-count').textContent = isHu
                ? `${activeCount} aktív termék`
                : `${activeCount} active products`;

            // Store globally for filter/sort
            window._allItems = items;
            window._isHu = isHu;

            renderItems(items, isHu);
            calculateAndRenderProfit(items, isHu);
        });
    } catch (e) {
        listContainer.innerHTML = `<div class="loading">${texts.error}</div>`;
    }
});

// ── LANGUAGE LABELS ──────────────────────────────────────────────────
function applyLabels(isHu) {
    const el = (id) => document.getElementById(id);
    if (!el('tab-label-products')) return;

    if (isHu) {
        el('tab-label-products').textContent = 'Termékek';
        el('tab-label-profit').textContent = 'Profit';
        el('search-input').placeholder = 'Keresés...';
        el('filter-select').options[0].text = 'Mind';
        el('filter-select').options[1].text = 'Aktív';
        el('filter-select').options[2].text = 'Eladott';
        el('filter-select').options[3].text = 'Tervezet';
        el('sort-label').textContent = 'Rendezés:';
        el('sort-default').textContent = 'Alapértelmezett';
        el('sort-price-asc').textContent = 'Ár ↑';
        el('sort-price-desc').textContent = 'Ár ↓';
    }
}

// ── TABS ─────────────────────────────────────────────────────────────
function initTabs() {
    const tabs = document.querySelectorAll('.nav-tab');
    const contents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            const targetId = tab.getAttribute('data-tab');
            document.getElementById(targetId).classList.add('active');
        });
    });
}

// ── SEARCH, FILTER, SORT ─────────────────────────────────────────────
function initSearchAndFilter(isHu) {
    const searchInput = document.getElementById('search-input');
    const filterSelect = document.getElementById('filter-select');
    const sortBtns = document.querySelectorAll('.sort-btn');

    let currentSort = 'default';

    function refresh() {
        if (!window._allItems) return;
        const query = searchInput.value.trim().toLowerCase();
        const filter = filterSelect.value;

        let filtered = window._allItems.filter(item => {
            const matchSearch = !query || item.title.toLowerCase().includes(query);
            const matchFilter =
                filter === 'all' ||
                (filter === 'active' && !item.isSold && !item.isDraft) ||
                (filter === 'sold'   && item.isSold) ||
                (filter === 'draft'  && item.isDraft);
            return matchSearch && matchFilter;
        });

        if (currentSort === 'price-asc') {
            filtered.sort((a, b) => extractPrice(a.price) - extractPrice(b.price));
        } else if (currentSort === 'price-desc') {
            filtered.sort((a, b) => extractPrice(b.price) - extractPrice(a.price));
        }

        renderItems(filtered, window._isHu);
    }

    searchInput.addEventListener('input', refresh);
    filterSelect.addEventListener('change', refresh);

    sortBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            sortBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentSort = btn.getAttribute('data-sort');
            refresh();
        });
    });
}

function extractPrice(priceStr) {
    if (!priceStr) return 0;
    const num = parseFloat(priceStr.replace(/[^\d.,]/g, '').replace(',', '.'));
    return isNaN(num) ? 0 : num;
}

// ── RENDER ITEMS ─────────────────────────────────────────────────────
function renderItems(items, isHu) {
    const listContainer = document.getElementById('product-list');
    listContainer.innerHTML = '';

    if (items.length === 0) {
        listContainer.innerHTML = `
            <div class="empty-state">
                <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <p>${isHu ? 'Nincs találat.' : 'No items found.'}</p>
            </div>`;
        return;
    }

    items.forEach(item => {
        const div = document.createElement('div');
        div.className = item.isSold ? 'product-item item-sold' : 'product-item';

        // Status chips
        let chips = '';
        if (item.isDraft) {
            chips = `<span class="meta-chip chip-draft">${isHu ? 'Tervezet' : 'Draft'}</span>`;
        } else if (item.isSold) {
            chips = `<span class="meta-chip chip-sold">${isHu ? 'Eladva' : 'Sold'}</span>`;
            if (item.date) chips += ` <span class="meta-chip">${item.date}</span>`;
        } else {
            if (item.date) chips += `<span class="meta-chip">${item.date}</span>`;
            if (item.favorites && item.favorites !== '0 favourites' && item.favorites !== '0 kedvenc') {
                chips += ` <span class="meta-chip chip-fav">♥ ${item.favorites.replace(/[^\d]/g, '') || '0'}</span>`;
            }
        }

        // Button
        let buttonHtml = '';
        if (item.isDraft) {
            buttonHtml = `<button class="relist-btn btn-post" data-action="post" data-url="${item.url}">${isHu ? '▶ PUBLIKÁLÁS' : '▶ POST'}</button>`;
        } else if (!item.isSold) {
            buttonHtml = `<button class="relist-btn" data-action="relist" data-url="${item.url}">↺ RELIST</button>`;
        }

        div.innerHTML = `
            <div class="product-top-row">
                <div class="image-container">
                    <img src="${item.img}" class="product-img" alt="${item.title}" loading="lazy">
                </div>
                <div class="product-info-col">
                    <div class="product-title" title="${item.title}">${item.title}</div>
                    <div class="product-meta">${chips}</div>
                    <div class="product-price-row">
                        <span class="meta-price">${item.price || '—'}</span>
                    </div>
                </div>
            </div>
            ${buttonHtml}
        `;

        listContainer.appendChild(div);
    });

    // Button listeners
    document.querySelectorAll('.relist-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const url = e.target.getAttribute('data-url');
            const action = e.target.getAttribute('data-action');

            if (action === 'post') {
                await chrome.storage.local.set({ "vinted_post_draft_url": url });
            } else {
                await chrome.storage.local.set({ "vinted_autostart_url": url });
            }
            chrome.tabs.update(null, { url: url });
            window.close();
        });
    });
}

// ── PROFIT ───────────────────────────────────────────────────────────
function calculateAndRenderProfit(items, isHu) {
    const container = document.getElementById('profit-container');
    const soldItems = items.filter(item => item.isSold);
    const activeItems = items.filter(item => !item.isSold && !item.isDraft);
    const draftItems = items.filter(item => item.isDraft);

    let total = 0;
    let currency = "";

    soldItems.forEach(item => {
        let rawPrice = item.price.replace(/[^\d.,]/g, "").replace(",", ".");
        let val = parseFloat(rawPrice);
        if (!isNaN(val)) total += val;
        if (!currency && item.price) currency = item.price.replace(/[\d.,\s]/g, "").trim();
    });

    // Avg price
    const avg = soldItems.length > 0 ? (total / soldItems.length) : 0;
    const avgStr = avg.toLocaleString(undefined, { maximumFractionDigits: 0 }) + (currency ? ' ' + currency : '');
    const totalStr = total.toLocaleString(undefined, { maximumFractionDigits: 0 }) + (currency ? ' ' + currency : '');

    const lbl = {
        revenue: isHu ? 'Összes Bevétel' : 'Total Revenue',
        sold: isHu ? 'eladott' : 'sold',
        avg: isHu ? 'Átlag ár' : 'Avg. price',
        active: isHu ? 'Aktív' : 'Active',
        drafts: isHu ? 'Tervezet' : 'Drafts',
        breakdown: isHu ? 'Eladott termékek' : 'Sold items',
        noSold: isHu ? 'Nincs eladott termék.' : 'No sold items yet.',
    };

    let listHtml = soldItems.length === 0
        ? `<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:13px;">${lbl.noSold}</div>`
        : soldItems.map((item, i) => `
            <div class="profit-item">
                <span class="p-idx">${i + 1}</span>
                <span class="p-name" title="${item.title}">${item.title}</span>
                <span class="p-price">${item.price}</span>
            </div>`).join('');

    container.innerHTML = `
        <div class="profit-header-card">
            <div class="profit-label">${lbl.revenue}</div>
            <div class="profit-amount">${totalStr}</div>
            <div class="profit-count">${soldItems.length} ${lbl.sold}</div>
        </div>

        <div class="profit-stats-row">
            <div class="stat-card">
                <span class="stat-value">${avgStr}</span>
                <span class="stat-label">${lbl.avg}</span>
            </div>
            <div class="stat-card">
                <span class="stat-value">${activeItems.length}</span>
                <span class="stat-label">${lbl.active}</span>
            </div>
            <div class="stat-card">
                <span class="stat-value">${draftItems.length}</span>
                <span class="stat-label">${lbl.drafts}</span>
            </div>
        </div>

        ${soldItems.length > 0 ? `<div class="profit-section-title">${lbl.breakdown}</div>` : ''}
        <div class="profit-list">${listHtml}</div>
    `;
}
