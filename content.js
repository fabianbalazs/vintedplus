
const CURRENT_DOMAIN = window.location.origin; 
const UPLOAD_URL = `${CURRENT_DOMAIN}/items/new`; 
const STORAGE_KEY = "vinted_relist_data";
const DELETE_TASK_KEY = "vinted_delete_task"; 
const AUTOSTART_KEY = "vinted_autostart_url"; 
const DRAFT_POST_KEY = "vinted_post_draft_url"; 
const DRAFT_SUCCESS_KEY = "vinted_draft_success"; /

console.log(`Vinted Reloader: Aktív.`);

(function() {
    const currentUrl = window.location.href;
   
    if (currentUrl.includes("/items/new") || currentUrl.includes("/upload")) {
        initUploadPage();
    } 
    else {
        checkStartConditions(); 
    }
})();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "GET_ITEMS") {
        scrollAndScrape().then(items => sendResponse({ items }));
        return true;
    }
});

async function scrollAndScrape() {
    const delay = ms => new Promise(r => setTimeout(r, ms));
    const getCount = () => document.querySelectorAll('[data-testid="grid-item"]').length;

    let lastCount = 0;
    let sameRounds = 0;
    const maxSameRounds = 3;

    while (sameRounds < maxSameRounds) {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
        await delay(700);
        const current = getCount();
        if (current === lastCount) {
            sameRounds++;
        } else {
            lastCount = current;
            sameRounds = 0;
        }
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
    await delay(300);

    return scrapeGridItems();
}

function scrapeGridItems() {
    const itemElements = document.querySelectorAll('[data-testid="grid-item"]');
    const items = [];
    
    const pageLang = document.documentElement.lang || "en";
    const isHu = pageLang.startsWith('hu');

    itemElements.forEach(el => {
        try {
            const linkEl = el.querySelector('a'); 
            const imgEl = el.querySelector('img'); 
            
            let titleText = "Névtelen termék";
            if (imgEl && imgEl.alt) titleText = imgEl.alt;
            else if (linkEl && linkEl.title) titleText = linkEl.title;

            // Tisztítás
            const keywords = [", MÁRKA:", ", BRAND:", "Előresorolás", "Bump", "Tervezet", "Draft", "Promoted"];
            keywords.forEach(keyword => {
                if (titleText.toUpperCase().includes(keyword.toUpperCase())) {
                    const index = titleText.toUpperCase().indexOf(keyword.toUpperCase());
                    titleText = titleText.substring(0, index);
                }
            });
            titleText = titleText.trim();

            const rawText = el.innerText.split('\n').map(t => t.trim()).filter(t => t.length > 0);
            
            let price = "";
            let size = "";
            let brand = "";
            let views = "";
            let favorites = "";
            let isSold = false;
            let isDraft = false;

            const soldMatch = rawText.find(line => line.toLowerCase() === 'eladva' || line.toLowerCase() === 'sold');
            if (soldMatch) { isSold = true; favorites = isHu ? "Eladva" : "Sold"; }

            const draftMatch = rawText.find(line => line.toLowerCase() === 'tervezet' || line.toLowerCase() === 'draft');
            if (draftMatch) {
                isDraft = true;
                favorites = isHu ? "Tervezet" : "Draft"; 
            }

            const priceRegex = /(HUF|Ft|€|\$|zł|£|PLN|kr)\s*[\d\s.,]+|[\d\s.,]+\s*(HUF|Ft|€|\$|zł|£|PLN|kr)/i;
            const priceMatch = rawText.find(line => priceRegex.test(line));
            if (priceMatch) price = priceMatch;

            const sizeRegex = /^([XSMLXL]+|[\d\/\s]+|One size)$/i;
            const sizeMatch = rawText.find(line => line !== price && sizeRegex.test(line) && line.length < 15);
            if (sizeMatch) size = sizeMatch;

            if (!isSold && !isDraft) {
                const favRegex = /(\d+)\s*(kedvenc|favourites|favorites)/i;
                const favMatch = rawText.find(line => favRegex.test(line));
                if (favMatch) favorites = favMatch;
                else favorites = isHu ? "0 kedvenc" : "0 favourites";
            }

            const brandCandidates = rawText.filter(line => 
                line !== price && line !== size && line !== favorites &&
                !line.match(/kedvenc|favourites|eladva|sold|tervezet|draft|megtekintés|view|promoted|bump/i)
            );
            if (brandCandidates.length > 0) brand = brandCandidates[0];

            const viewMatch = rawText.find(line => line.match(/megtekintés|view/i));
            if (viewMatch) views = viewMatch;

            if (linkEl && imgEl) {
                items.push({
                    url: linkEl.href,
                    img: imgEl.src,
                    title: titleText, 
                    price: price,
                    size: size,
                    brand: brand,
                    favorites: favorites, 
                    isSold: isSold,      
                    isDraft: isDraft,    
                    date: views || "" 
                });
            }
        } catch (e) {
            console.log("Hiba:", e);
        }
    });

    return items;
}


async function checkStartConditions() {
    const currentUrl = window.location.href;


    const successCheck = await chrome.storage.local.get(DRAFT_SUCCESS_KEY);
    if (successCheck[DRAFT_SUCCESS_KEY]) {
        await chrome.storage.local.remove(DRAFT_SUCCESS_KEY); 
        showSuccessModal();
        return;
    }

    const deleteTarget = await chrome.storage.local.get(DELETE_TASK_KEY);
    if (deleteTarget[DELETE_TASK_KEY] && currentUrl.includes(deleteTarget[DELETE_TASK_KEY])) {
        performAutoDelete();
        return;
    }

    const autostart = await chrome.storage.local.get(AUTOSTART_KEY);
    if (autostart[AUTOSTART_KEY] && currentUrl.includes(autostart[AUTOSTART_KEY])) {
        await chrome.storage.local.remove(AUTOSTART_KEY);
        handleScrape(); 
        return;
    }

    // D) DRAFT POSZTOLÁS
    const draftPost = await chrome.storage.local.get(DRAFT_POST_KEY);
    if (draftPost[DRAFT_POST_KEY]) {
        if (currentUrl.includes(draftPost[DRAFT_POST_KEY]) || currentUrl.includes("/edit")) {
            console.log("📝 Draft publikálása indul...");
            await chrome.storage.local.remove(DRAFT_POST_KEY);
            handleDraftPost();
        }
    }
}

function showSuccessModal() {
    const isHu = document.documentElement.lang.startsWith('hu');

    const text = isHu
        ? "A ruha sikeresen fel lett töltve az oldaladra!"
        : "The item has been successfully uploaded to your wardrobe!";
    const btnText = isHu ? "Rendben" : "OK";

    const FONT = "'DM Sans', 'Montserrat', sans-serif";

    if (!document.getElementById('vp-modal-style')) {
        const style = document.createElement('style');
        style.id = 'vp-modal-style';
        style.textContent = `
            @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
            @keyframes vpFadeIn { from { opacity: 0 } to { opacity: 1 } }
            @keyframes vpSlideUp { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: translateY(0) } }
            .vp-btn-ok:hover { background: #005a63 !important; }
        `;
        document.head.appendChild(style);
    }

    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.6); backdrop-filter: blur(3px);
        z-index: 10000; display: flex; justify-content: center; align-items: center;
        animation: vpFadeIn 0.15s ease;
    `;

    const modal = document.createElement('div');
    modal.style.cssText = `
        background: #ffffff;
        border-radius: 12px;
        width: 420px;
        font-family: ${FONT};
        box-shadow: 0 20px 60px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.06);
        overflow: hidden;
        animation: vpSlideUp 0.2s ease;
    `;

    const accent = document.createElement('div');
    accent.style.cssText = `height: 4px; background: linear-gradient(90deg, #007782, #00a8b5);`;

    const body = document.createElement('div');
    body.style.cssText = `padding: 28px 28px 24px; text-align: center;`;

    const iconWrap = document.createElement('div');
    iconWrap.style.cssText = `
        width: 48px; height: 48px; border-radius: 50%;
        background: #f0fdf4; border: 2px solid #bbf7d0;
        display: flex; align-items: center; justify-content: center;
        margin: 0 auto 16px;
    `;
    iconWrap.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

    const titleEl = document.createElement('div');
    titleEl.innerText = isHu ? "Sikeres feltöltés!" : "Upload successful!";
    titleEl.style.cssText = `font-size: 17px; font-weight: 700; color: #0a0a0a; margin-bottom: 8px;`;

    const message = document.createElement('p');
    message.innerText = text;
    message.style.cssText = `font-size: 13px; color: #6b7280; line-height: 1.6; margin: 0 0 24px; padding: 0;`;

    const okBtn = document.createElement('button');
    okBtn.className = 'vp-btn-ok';
    okBtn.innerText = btnText;
    okBtn.style.cssText = `
        display: inline-block; padding: 10px 36px; border-radius: 7px; border: none;
        background: #007782; color: white; font-family: ${FONT};
        font-size: 13px; font-weight: 700; cursor: pointer; transition: background 0.15s;
        letter-spacing: 0.3px;
    `;

    okBtn.onclick = () => { document.body.removeChild(overlay); };

    body.appendChild(iconWrap);
    body.appendChild(titleEl);
    body.appendChild(message);
    body.appendChild(okBtn);
    modal.appendChild(accent);
    modal.appendChild(body);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
}

async function handleDraftPost() {
    const toast = document.createElement('div');
    toast.innerText = "⏳ Publikálás...";
    toast.style.cssText = "position:fixed; top:20px; right:20px; background:#007782; color:white; padding:15px; border-radius:8px; z-index:9999; font-weight:bold;";
    document.body.appendChild(toast);

    await new Promise(r => setTimeout(r, 2000));

    const buttons = Array.from(document.querySelectorAll('button'));
    const submitBtn = buttons.find(b => 
        b.innerText.trim().toLowerCase() === 'feltöltés' || 
        b.innerText.trim().toLowerCase() === 'upload'
    );
    
    if (submitBtn) {
        toast.innerText = "✅ Feltöltés!";
        

        await chrome.storage.local.set({ [DRAFT_SUCCESS_KEY]: true });
        
        submitBtn.click();
    } else {
        const fallbackBtn = document.querySelector('button[type="submit"]');
        if (fallbackBtn && !fallbackBtn.innerText.toLowerCase().includes('mentés') && !fallbackBtn.innerText.toLowerCase().includes('save')) {
             toast.innerText = "✅ Feltöltés (Fallback)!";
             await chrome.storage.local.set({ [DRAFT_SUCCESS_KEY]: true });
             fallbackBtn.click();
        } else {
            toast.innerText = "⚠️ Nem találom a gombot!";
        }
    }
}


async function handleScrape() {
    const isHu = document.documentElement.lang.startsWith('hu');
    const toast = document.createElement('div');
    toast.innerText = isHu ? "⏳ Adatok másolása..." : "⏳ Copying data...";
    toast.style.cssText = "position:fixed; top:20px; right:20px; background:#007782; color:white; padding:15px; border-radius:8px; z-index:9999; font-weight:bold;";
    document.body.appendChild(toast);

    try {
        const imgElements = document.querySelectorAll('.item-photo--1 img, .item-photos img, [class*="ItemPhoto"] img'); 
        const imageUrls = Array.from(imgElements).map(img => img.src || img.dataset.src).filter(src => src);
        const uniqueUrls = [...new Set(imageUrls)];
        if (uniqueUrls.length === 0) throw new Error("No images found!");

        const getMeta = (name) => document.querySelector(`meta[property='${name}']`)?.getAttribute('content') || "";
        let cleanTitle = getMeta('og:title').replace(" | Vinted", "").replace(" - Vinted", "").replace("Vinted", "").trim();
        let rawDescription = getMeta('og:description');
        let cleanDescription = rawDescription;
        if (cleanDescription && cleanDescription.startsWith(cleanTitle)) {
            cleanDescription = cleanDescription.substring(cleanTitle.length).replace(/^[\s\-\–]+/, "").trim();
        }

        let foundPrice = null;
        try {
            const scripts = document.querySelectorAll('script[type="application/ld+json"]');
            for (const script of scripts) {
                const json = JSON.parse(script.innerText);
                if (json.offers && (json.offers.price || json.offers.lowPrice)) { foundPrice = json.offers.price || json.offers.lowPrice; break; }
                if (Array.isArray(json)) {
                    const product = json.find(item => item['@type'] === 'Product' && item.offers);
                    if (product && product.offers.price) { foundPrice = product.offers.price; break; }
                }
            }
        } catch (e) {}
        
        if (!foundPrice) foundPrice = document.querySelector('meta[property="product:price:amount"]')?.getAttribute('content');
        if (!foundPrice) {
            const priceEl = document.querySelector('[data-testid="item-price"]') || document.querySelector('.title-content');
            if (priceEl) foundPrice = priceEl.innerText;
        }
        
        let rawPrice = foundPrice ? String(foundPrice) : "0";
        let cleanPrice = rawPrice.replace(/[.,]00(\D*)$/, "").replace(/[^0-9]/g, ""); 
        if (cleanPrice === "0" || cleanPrice === "") cleanPrice = "1500"; 

        const processedImages = await Promise.all(uniqueUrls.map(url => downloadImageViaBackground(url)));
        const validImages = processedImages.filter(img => img !== null);

        const data = {
            originalUrl: window.location.href.split('?')[0],
            title: cleanTitle,
            description: cleanDescription,
            price: cleanPrice,
            images: validImages
        };

        await chrome.storage.local.set({ [STORAGE_KEY]: data });
        window.location.href = UPLOAD_URL; 

    } catch (err) {
        alert("Error: " + err.message);
        if(toast) toast.remove();
    }
}

async function performAutoDelete() {
    await chrome.storage.local.remove(DELETE_TASK_KEY);
    const maxRetries = 10;
    let attempt = 0;
    const finderInterval = setInterval(async () => {
        attempt++;
        const buttons = Array.from(document.querySelectorAll('button, a[role="button"]'));
        const deleteBtn = buttons.find(b => 
            b.innerText.toLowerCase().includes("törlés") || b.innerText.toLowerCase().includes("delete") ||
            b.getAttribute('data-testid') === 'item-action-delete'
        );
        if (deleteBtn) {
            clearInterval(finderInterval);
            deleteBtn.click();
            await new Promise(r => setTimeout(r, 1000));
            const confirmButtons = Array.from(document.querySelectorAll('div[class*="Modal"] button, div[role="dialog"] button'));
            const confirmBtn = confirmButtons.find(b => 
                b.innerText.toLowerCase().includes("igen") || b.innerText.toLowerCase().includes("törlés") || 
                b.innerText.toLowerCase().includes("confirm") || b.innerText.toLowerCase().includes("delete")
            );
            if (confirmBtn) {
                confirmBtn.click();
                setTimeout(() => { chrome.runtime.sendMessage({ action: "closeTab" }); }, 1500);
            }
        } else if (attempt > maxRetries) {
            clearInterval(finderInterval);
        }
    }, 500);
}

async function initUploadPage() {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const data = stored[STORAGE_KEY];
    if (!data) return;

    const isHu = document.documentElement.lang.startsWith('hu');
    const toast = document.createElement('div');
    toast.innerText = isHu ? "🔄 Adatok betöltése..." : "🔄 Filling data...";
    toast.style.cssText = "position:fixed; top:20px; right:20px; background:#007782; color:white; padding:15px; border-radius:8px; z-index:9999; font-weight:bold;";
    document.body.appendChild(toast);

    setTimeout(async () => {
        try {
            await fillForm(data);
            toast.remove(); 
            if (data.originalUrl) {
                showDeleteConfirmation(data.originalUrl);
            } else {
                await chrome.storage.local.remove(STORAGE_KEY);
            }
        } catch (e) {
            console.error(e);
            toast.innerText = "⚠️ Error.";
        }
    }, 2000);
}

function showDeleteConfirmation(originalUrl) {
    const isHu = document.documentElement.lang.startsWith('hu');
    const texts = {
        title: isHu ? "Adatok sikeresen betöltve" : "Details loaded successfully",
        body: isHu
            ? "Ahhoz hogy a termék újralistázása sikeres legyen, a régi terméket szükséges letörölni. Eltávolítod a régi terméket?"
            : "To successfully relist the item, the old listing needs to be deleted. Remove the old item?",
        yesBtn: isHu ? "Igen, törlés" : "Yes, delete",
        noBtn: isHu ? "Nem" : "No"
    };

    const FONT = "'DM Sans', 'Montserrat', sans-serif";
    const MONO = "'DM Sans', sans-serif";

    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.6); backdrop-filter: blur(3px);
        z-index: 10000; display: flex; justify-content: center; align-items: center;
        animation: vpFadeIn 0.15s ease;
    `;

    if (!document.getElementById('vp-modal-style')) {
        const style = document.createElement('style');
        style.id = 'vp-modal-style';
        style.textContent = `
            @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
            @keyframes vpFadeIn { from { opacity: 0 } to { opacity: 1 } }
            @keyframes vpSlideUp { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: translateY(0) } }
            .vp-btn-yes:hover { background: #2d2d2d !important; }
            .vp-btn-no:hover  { background: #e5e7eb !important; }
        `;
        document.head.appendChild(style);
    }

    const modal = document.createElement('div');
    modal.style.cssText = `
        background: #ffffff;
        border-radius: 12px;
        width: 420px;
        font-family: ${FONT};
        box-shadow: 0 20px 60px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.06);
        overflow: hidden;
        animation: vpSlideUp 0.2s ease;
    `;

    const accent = document.createElement('div');
    accent.style.cssText = `
        height: 4px;
        background: linear-gradient(90deg, #007782, #00a8b5);
    `;

    const body = document.createElement('div');
    body.style.cssText = `padding: 28px 28px 24px;`;

    const titleRow = document.createElement('div');
    titleRow.style.cssText = `display: flex; align-items: center; gap: 10px; margin-bottom: 14px;`;

    const iconWrap = document.createElement('div');
    iconWrap.style.cssText = `
        width: 36px; height: 36px; border-radius: 8px;
        background: #f0fdf4; display: flex; align-items: center; justify-content: center;
        flex-shrink: 0;
    `;
    iconWrap.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

    const titleEl = document.createElement('div');
    titleEl.innerText = texts.title;
    titleEl.style.cssText = `font-size: 16px; font-weight: 700; color: #0a0a0a; line-height: 1.2;`;

    titleRow.appendChild(iconWrap);
    titleRow.appendChild(titleEl);

    const message = document.createElement('p');
    message.innerText = texts.body;
    message.style.cssText = `
        font-size: 13px; color: #6b7280; line-height: 1.6;
        margin: 0 0 24px; padding: 0;
    `;

    const btnRow = document.createElement('div');
    btnRow.style.cssText = `display: flex; gap: 10px;`;

    const noBtn = document.createElement('button');
    noBtn.className = 'vp-btn-no';
    noBtn.innerText = texts.noBtn;
    noBtn.style.cssText = `
        flex: 1; padding: 10px 0; border-radius: 7px; border: 1px solid #e5e7eb;
        background: #f9fafb; color: #374151; font-family: ${FONT};
        font-size: 13px; font-weight: 600; cursor: pointer; transition: background 0.15s;
    `;

    const yesBtn = document.createElement('button');
    yesBtn.className = 'vp-btn-yes';
    yesBtn.innerText = texts.yesBtn;
    yesBtn.style.cssText = `
        flex: 2; padding: 10px 0; border-radius: 7px; border: none;
        background: #0a0a0a; color: white; font-family: ${FONT};
        font-size: 13px; font-weight: 700; cursor: pointer; transition: background 0.15s;
        letter-spacing: 0.3px;
    `;

    yesBtn.onclick = async () => {
        document.body.removeChild(overlay);
        await chrome.storage.local.set({ [DELETE_TASK_KEY]: originalUrl });
        await chrome.storage.local.remove(STORAGE_KEY);
        window.open(originalUrl, "_blank");
    };
    noBtn.onclick = async () => {
        document.body.removeChild(overlay);
        await chrome.storage.local.remove(STORAGE_KEY);
    };

    btnRow.appendChild(noBtn);
    btnRow.appendChild(yesBtn);
    body.appendChild(titleRow);
    body.appendChild(message);
    body.appendChild(btnRow);
    modal.appendChild(accent);
    modal.appendChild(body);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
}

async function fillForm(data) {
    await trySetInput('#title', data.title);
    await trySetInput('[name="title"]', data.title);
    await trySetInput('#description', data.description);
    await trySetInput('textarea[name="description"]', data.description);
    if (data.images && data.images.length > 0) await uploadImages(data.images);
    const priceInput = document.querySelector('[name="price"]') || document.querySelector('#price');
    if (priceInput) {
        priceInput.focus();
        priceInput.click();
        await new Promise(r => setTimeout(r, 300));
        document.execCommand('selectAll', false, null);
        await new Promise(r => setTimeout(r, 50));
        document.execCommand('delete', false, null);
        await new Promise(r => setTimeout(r, 50));
        const success = document.execCommand('insertText', false, data.price);
        if (!success) setNativeValue(priceInput, data.price);
        priceInput.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 100));
        const titleInput = document.querySelector('#title') || document.body;
        titleInput.click(); 
    }
}

async function uploadImages(base64Array) {
    const fileInput = document.querySelector('input[type="file"][multiple]') || document.querySelector('input[name="photos"]');
    if (!fileInput) return;
    const dt = new DataTransfer();
    let count = 0;
    for (let i = 0; i < base64Array.length; i++) {
        if (!base64Array[i]) continue;
        try {
            const file = await base64ToFile(base64Array[i], `photo_${i}.jpg`);
            dt.items.add(file);
            count++;
        } catch (err) {}
    }
    if (count > 0) {
        fileInput.files = dt.files;
        fileInput.dispatchEvent(new Event('input', { bubbles: true }));
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
}

function setNativeValue(element, value) {
    const valueSetter = Object.getOwnPropertyDescriptor(element, 'value').set;
    const prototype = Object.getPrototypeOf(element);
    const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value').set;
    if (valueSetter && valueSetter !== prototypeValueSetter) prototypeValueSetter.call(element, value);
    else valueSetter.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
}

async function trySetInput(selector, value) {
    const el = document.querySelector(selector);
    if (!el) return;
    let proto = (el.tagName === "TEXTAREA") ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value").set;
    nativeSetter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
}

async function base64ToFile(base64, filename) {
    const res = await fetch(base64);
    const blob = await res.blob();
    return new File([blob], filename, { type: "image/jpeg" });
}

function downloadImageViaBackground(url) {
    return new Promise((resolve) => {
        try {
            chrome.runtime.sendMessage({ action: "downloadImage", url: url }, (response) => {
                if (chrome.runtime.lastError || !response || !response.success) resolve(null);
                else resolve(response.data);
            });
        } catch (e) { resolve(null); }
    });
}
