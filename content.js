let widgetHost = null;
let floatingPanelHost = null;

function extractItemData() {
  let jsonBrand = "";
  let jsonImages = [];
  let jsonCondition = "";

  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const s of scripts) {
    try {
      const parsed = JSON.parse(s.innerText);
      const products = Array.isArray(parsed) ? parsed : [parsed];
      const prod = products.find(x => x['@type'] === 'Product' || x['@type'] === 'http://schema.org/Product');
      
      if (prod) {
        if (prod.image) jsonImages = Array.isArray(prod.image) ? prod.image : [prod.image];
        if (prod.brand && prod.brand.name) jsonBrand = prod.brand.name;
        if (prod.itemCondition) jsonCondition = prod.itemCondition.replace('http://schema.org/', '');
      }
    } catch (e) {}
  }

  let imageCount = jsonImages.length;
  const photoGrid = document.querySelector('[data-testid="item-photos"], [class*="photos-grid"], [class*="ItemPhotos"], .item-photos');
  
  if (photoGrid) {
    const imgs = Array.from(photoGrid.querySelectorAll('img'))
      .map(i => i.src)
      .filter(src => src && !src.includes('avatar') && !src.includes('icon'));
    const gridCount = new Set(imgs).size;
    if (gridCount > imageCount) imageCount = gridCount;

    const overlay = photoGrid.textContent.match(/\+\s*(\d+)/);
    if (overlay && overlay[1]) {
      imageCount += parseInt(overlay[1], 10);
    }
  } else if (imageCount === 0) {
    const allImgs = Array.from(document.querySelectorAll('main img, #content img'))
      .map(i => i.src)
      .filter(src => src && src.includes('vinted') && !src.includes('avatar') && !src.includes('icon'));
    const fallbackCount = new Set(allImgs).size;
    if (fallbackCount > imageCount) imageCount = fallbackCount;
  }

  let brand = jsonBrand;
  let condition = jsonCondition;
  let size = "";
  
  const titleEl = document.querySelector('h1, [itemprop="name"], [data-testid="item-title"]');
  if (titleEl && titleEl.nextElementSibling) {
    const subtitle = titleEl.nextElementSibling.innerText.trim();
    if (subtitle.includes('·') && subtitle.length < 50) {
      const parts = subtitle.split('·').map(p => p.trim());
      if (!condition) condition = parts[0];
      if (!brand && parts[1]) brand = parts[1];
    }
  }

  const detailRows = document.querySelectorAll('[data-testid="item-attributes"] > div, .details-list > div, [class*="DetailsList_item"]');
  detailRows.forEach(row => {
    const text = row.innerText.trim(); 
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    if (lines.length >= 2) {
      const key = lines[0].toLowerCase();
      const val = lines[1];
      if (key.includes('márka') || key.includes('brand')) brand = val;
      if (key.includes('állapot') || key.includes('condition')) condition = val;
      if (key.includes('méret') || key.includes('size')) size = val;
    }
  });

  let breadcrumbs = "";
  const breadcrumbLinks = document.querySelectorAll('[itemprop="itemListElement"] a, [data-testid="breadcrumbs"] a, [class*="breadcrumbs"] a, nav[aria-label="Breadcrumb"] a, .breadcrumbs a');
  
  if (breadcrumbLinks.length > 0) {
    breadcrumbs = Array.from(breadcrumbLinks)
      .map(a => a.innerText.trim())
      .filter(t => t.length > 0 && !t.includes("Főoldal") && !t.includes("Home"))
      .join(' > ');
  } else {
    const catLinks = Array.from(document.querySelectorAll('a[href*="/catalog/"]'))
      .map(a => a.innerText.trim())
      .filter(t => t.length > 0 && t.length < 30);
    if (catLinks.length > 0) {
      breadcrumbs = [...new Set(catLinks)].slice(0, 3).join(' > '); 
    }
  }

  const getMeta = (prop) => document.querySelector(`meta[property='${prop}']`)?.content || "";
  const title = getMeta('og:title').replace(/\s*\|\s*Vinted.*$/i, '').trim() || titleEl?.innerText?.trim();
  const description = getMeta('og:description').trim();

  const price = document.querySelector('[data-testid="item-price"]')?.innerText?.trim() || 
                getMeta('product:price:amount') || "Ismeretlen";
  
  const totalWrap = document.querySelector('.title-content, [class*="total-price"], [data-testid="item-price-with-shipping"]');
  const totalPrice = totalWrap ? totalWrap.innerText.replace(/\n/g, ' ').trim() : "";

  let sellerUsername = "";
  let sellerRating = "0 értékelés";
  
  const memberLink = document.querySelector('a[href*="/member/"]');
  if (memberLink) sellerUsername = memberLink.innerText.trim();

  const ratingEl = document.querySelector('[data-testid="user-rating"], [aria-label*="értékelés"], [aria-label*="star"], [class*="Rating_"]');
  if (ratingEl) {
    sellerRating = ratingEl.getAttribute('aria-label') || ratingEl.innerText.trim() || sellerRating;
  }

  return {
    title: title || "Névtelen termék",
    description,
    price,
    totalPrice,
    imageCount: imageCount > 0 ? imageCount : 1,
    brand: brand || "Ismeretlen",
    size: size || "Nem megadott",
    condition: condition || "Nem megadott",
    category: breadcrumbs || "Nincs megadva",
    seller: {
      username: sellerUsername || "Rejtett eladó",
      rating: sellerRating
    }
  };
}

// ---------------------------------------------------------
// Vizuális komponensek: Gomb
// ---------------------------------------------------------
function getOrCreateTriggerButton() {
  if (widgetHost) return widgetHost;

  widgetHost = document.createElement('div');
  widgetHost.id = 'vinted-legit-check-root';

  const shadow = widgetHost.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&display=swap');
      :host { display: block; margin: 16px 0; font-family: 'Plus Jakarta Sans', sans-serif; }
      
      .trigger-btn {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        background: #09090b;
        color: #fff;
        border: 1px solid #27272a;
        padding: 14px 18px;
        border-radius: 8px;
        cursor: pointer;
        font-size: 14px;
        font-weight: bold;
        position: relative;
        overflow: hidden;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
      }
      
      .trigger-btn::before {
        content: '';
        position: absolute;
        top: 0; left: -100%;
        width: 100%; height: 100%;
        background: linear-gradient(90deg, transparent, rgba(6, 182, 212, 0.15), transparent);
        transition: left 0.5s;
      }
      
      .trigger-btn svg {
        color: #06b6d4;
        transition: all 0.3s ease;
      }
      
      .trigger-btn:hover {
        cursor: pointer;
        transform: translateY(-2px);
      }
      
      .trigger-btn:hover::before { left: 100%; }
      .trigger-btn:hover svg { filter: drop-shadow(0 0 6px #06b6d4); }
      .trigger-btn:active { transform: translateY(0); }
    </style>
    
    <button class="trigger-btn" id="start-analysis-btn">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
      Legit Checker
    </button>
  `;

  shadow.getElementById('start-analysis-btn').addEventListener('click', () => {
    openFloatingPanelAndAnalyze();
  });

  return widgetHost;
}

// ---------------------------------------------------------
// Vizuális komponensek: Lebegő Dark Mode Panel
// ---------------------------------------------------------
function openFloatingPanelAndAnalyze() {
  if (floatingPanelHost) {
    floatingPanelHost.remove();
  }

  floatingPanelHost = document.createElement('div');
  floatingPanelHost.id = 'vinted-legit-panel-overlay';
  document.body.appendChild(floatingPanelHost);

  const shadow = floatingPanelHost.attachShadow({ mode: 'open' });

  shadow.innerHTML = `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
      
      @keyframes slideDown { 
        from { opacity: 0; transform: translateY(-24px) scale(0.97); } 
        to { opacity: 1; transform: translateY(0) scale(1); } 
      }
      @keyframes spinGlow { 
        0% { transform: rotate(0deg); filter: drop-shadow(0 0 5px #06b6d4); } 
        100% { transform: rotate(360deg); filter: drop-shadow(0 0 15px #06b6d4); } 
      }


      :host { 
        position: fixed; top: 24px; right: 24px; z-index: 2147483647; 
        font-family: 'Plus Jakarta Sans', sans-serif; 
      }
      
      .panel { 
        width: 400px; max-width: calc(100vw - 48px); 
        background: rgba(9, 9, 11, 0.95); 
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid #27272a;
        border-radius: 8px; 
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.05); 
        overflow: hidden; 
        animation: slideDown 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; 
        color: #f8fafc; 
      }

      .panel-header { 
        display: flex; align-items: center; justify-content: space-between; 
        padding: 16px 20px; 
        background: rgba(24, 24, 27, 0.8); 
        border-bottom: 1px solid #27272a; 
      }
      
      .brand-title { 
        display: flex; align-items: center; gap: 8px; 
        font-weight: 800; font-size: 14px; 
        color: #06b6d4; ;
      }
      
      .close-btn { 
        background: #27272a; border: none; width: 28px; height: 28px; border-radius: 50%; 
        cursor: pointer; display: flex; align-items: center; justify-content: center; 
        color: #a1a1aa; font-size: 14px; font-weight: 700; transition: all 0.2s; 
      }
      .close-btn:hover { background: #3f3f46; color: #fff; transform: scale(1.1); }
      
      .panel-body { padding: 24px; max-height: 75vh; overflow-y: auto; }
      .panel-body::-webkit-scrollbar { width: 6px; }
      .panel-body::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 10px; }

      .loading-box { text-align: center; padding: 40px 10px; }
      .spinner { 
        width: 36px; height: 36px; 
        border: 3px solid rgba(6, 182, 212, 0.1); 
        border-top-color: #06b6d4; 
        border-radius: 50%; 
        animation: spinGlow 1s cubic-bezier(0.68, -0.55, 0.265, 1.55) infinite; 
        margin: 0 auto 20px; 
      }
      .loading-title { font-weight: 700; font-size: 15px; letter-spacing: 0.5px; }
      .loading-sub { font-size: 12px; color: #94a3b8; margin-top: 6px; }

      .meta-summary-chips { 
        display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px; 
      }
      .chip { 
        font-size: 11px; font-weight: 600; 
        background: #18181b; border: 1px solid #27272a; 
        padding: 5px 10px; border-radius: 8px; color: #e2e8f0; 
        box-shadow: inset 0 1px 2px rgba(255,255,255,0.05);
      }

      .score-hero { 
        border-radius: 16px; padding: 20px; text-align: center; margin-bottom: 24px; 
        position: relative; overflow: hidden;
      }
      
      .score-hero::after {
        content: ''; position: absolute; top: 0; left: 0; width: 100%; height: 100%;
        background: linear-gradient(180deg, rgba(255,255,255,0.05) 0%, transparent 100%);
        pointer-events: none;
      }

      .score-hero.Alacsony { background: #064e3b; border: 1px solid #059669; box-shadow: 0 0 30px rgba(5, 150, 105, 0.2); }
      .score-hero.Közepes { background: #78350f; border: 1px solid #d97706; box-shadow: 0 0 30px rgba(217, 119, 6, 0.2); }
      .score-hero.Magas { background: #7f1d1d; border: 1px solid #dc2626; box-shadow: 0 0 30px rgba(220, 38, 38, 0.2); }

      .score-title { font-size: 11px; font-weight: 800; color: rgba(255,255,255,0.7); text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 8px; }
      .score-val { font-size: 48px; font-weight: 800; line-height: 1; text-shadow: 0 2px 10px rgba(0,0,0,0.5); }
      
      .Alacsony .score-val { color: #34d399; }
      .Közepes .score-val { color: #fbbf24; }
      .Magas .score-val { color: #f87171; }

      .risk-pill { 
        display: inline-block; padding: 6px 14px; border-radius: 20px; 
        font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; margin-top: 10px; 
        box-shadow: 0 4px 10px rgba(0,0,0,0.3);
      }
      .Alacsony .risk-pill { background: #10b981; color: #022c22; }
      .Közepes .risk-pill { background: #f59e0b; color: #451a03; }
      .Magas .risk-pill { background: #ef4444; color: #450a0a; }

      .section-title { 
        font-size: 12px; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 12px; 
      }
      
      .flags-list { margin: 0 0 24px; padding: 0; list-style: none; }
      .flags-list li { 
        position: relative; padding-left: 24px; margin-bottom: 12px; 
        font-size: 13px; color: #cbd5e1; line-height: 1.6; 
      }
      .flags-list li::before { 
        content: "■"; position: absolute; left: 2px; top: 2px;
        color: #06b6d4; font-size: 10px; filter: drop-shadow(0 0 4px #06b6d4); 
      }

      .advice-box { 
        background: #18181b; border: 1px solid #27272a; border-left: 4px solid #06b6d4; 
        padding: 16px; border-radius: 8px; font-size: 13px; color: #e2e8f0; line-height: 1.6; 
        position: relative; overflow: hidden;
      }
      .advice-box::before {
        content: ''; position: absolute; top: 0; left: 0; width: 100%; height: 100%;
        background: linear-gradient(90deg, rgba(6, 182, 212, 0.05), transparent); pointer-events: none;
      }
    </style>

    <div class="panel">
      <div class="panel-header">
        <div class="brand-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          Legit Checker
        </div>
        <button class="close-btn" id="close-panel-btn">✕</button>
      </div>

      <div class="panel-body" id="panel-body-content">
        <div class="loading-box">
          <div class="spinner"></div>
          <div class="loading-title">Termék elemzése...</div>
          <div class="loading-sub">AI modellek szinkronizálása a Vinted adatokkal</div>
        </div>
      </div>
    </div>
  `;

  shadow.getElementById('close-panel-btn').onclick = () => {
    floatingPanelHost.remove();
    floatingPanelHost = null;
  };

  const itemData = extractItemData();

  chrome.runtime.sendMessage({ action: 'ANALYZE_ITEM', data: itemData }, (res) => {
    const bodyContent = shadow.getElementById('panel-body-content');
    if (!bodyContent) return;

    if (!res || res.error) {
      bodyContent.innerHTML = `<div style="color:#f87171; font-size:13px; padding: 20px; background: #450a0a; border-radius: 8px;">Hiba történt: ${res ? res.error : 'Nem érkezett válasz'}</div>`;
      return;
    }

    const { score, risk, red_flags, advice } = res.result;

    let flagsHtml = '';
    if (red_flags && red_flags.length > 0) {
      flagsHtml = `
        <div class="section-title">Észlelt faktorok</div>
        <ul class="flags-list">${red_flags.map(f => `<li>${f}</li>`).join('')}</ul>
      `;
    }

    bodyContent.innerHTML = `
      <div class="meta-summary-chips">
        <span class="chip">🏷️ ${itemData.brand}</span>
        <span class="chip">📸 ${itemData.imageCount} fotó</span>
        <span class="chip">✨ ${itemData.condition}</span>
        <span class="chip">👤 ${itemData.seller.rating}</span>
      </div>

      <div class="score-hero ${risk}">
        <div class="score-title">Biztonsági Index</div>
        <div class="score-val">${score} <span style="font-size:18px; color:rgba(255,255,255,0.4); font-weight:700;">/ 100</span></div>
        <div class="risk-pill">${risk}</div>
      </div>

      ${flagsHtml}

      <div class="section-title">Tanács</div>
      <div class="advice-box">💡 ${advice}</div>
    `;
  });
}

function ensureWidgetMounted() {
  if (!window.location.href.includes('/items/')) return;
  const target = document.querySelector('[data-testid="item-buy-button"]') || 
                 document.querySelector('.item-actions') || 
                 document.querySelector('.details-list');

  if (!target || !target.parentNode) return;

  const existing = document.getElementById('vinted-legit-check-root');
  if (!existing || !existing.isConnected) {
    const widget = getOrCreateTriggerButton();
    target.parentNode.insertBefore(widget, target);
  }
}

ensureWidgetMounted();
const observer = new MutationObserver(() => ensureWidgetMounted());
observer.observe(document.body, { childList: true, subtree: true });