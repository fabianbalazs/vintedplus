chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'ANALYZE_ITEM') {
    handleAnalysis(request.data)
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }
});

async function handleAnalysis(data) {
  const { geminiApiKey } = await chrome.storage.local.get('geminiApiKey');
  if (!geminiApiKey) {
    throw new Error('Nincs beállítva API kulcs! Kattints a bővítmény ikonjára a megadásához.');
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${geminiApiKey}`;

  const prompt = `
Elemezd az alábbi Vinted termékhirdetést és eladót másolati, csalási és megbízhatósági kockázatok szempontjából!

TERMÉK ADATOK:
- Megnevezés: ${data.title}
- Márka: ${data.brand}
- Kategória: ${data.category}
- Méret: ${data.size}
- Állapot: ${data.condition}
- Hirdetett ár: ${data.price} (Teljes ár védelemmel: ${data.totalPrice || 'N/A'})
- Feltöltött fotók pontos száma: ${data.imageCount} db
- Termékleírás: "${data.description}"

ELADÓ PROFILJA:
- Felhasználónév: ${data.seller.username}
- Értékelések & Csillagok: ${data.seller.rating}

SZEMPONTOK AZ ÉRTÉKELÉSHEZ:
1. Márka jellege: Fast-fashion (pl. Zara, H&M, Reserved) esetén a másolat ritka, ott inkább az ár-érték arány és állapot a kérdés. Prémium/hype (pl. Nike Dunk, Ralph Lauren, Trapstar, AirPods, luxusmárkák) esetén magas replika-veszély áll fenn.
2. Eladó hitelessége: Ha 0 értékeléses, véletlenszerű nevű új profil hirdet drága terméket, az azonnali MAGAS kockázat. Ha sok jó értékelése van, az csökkenti a kockázatot.
3. Képek minősége és száma: A pontos képszám (${data.imageCount} db). Ha drága márkánál csak 1-2 kép van belső címkék nélkül, az red flag.
4. Gyanús kifejezések: "nem tudom eredeti-e", "ajándék volt", "számla nincs de garantált", kamu StockX kiegészítők.

Kizárólag érvényes JSON formátumban válaszolj az alábbi mezőkkel:
{
  "score": (0 és 100 közötti egész szám: 100 teljesen biztonságos, 0 biztos csalás),
  "risk": ("Alacsony" | "Közepes" | "Magas"),
  "red_flags": ["3-4 konkrét megállapítás az adatok és az eladó alapján"],
  "advice": "1-2 mondatos gyakorlati tanács a vevőnek"
}
`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json' }
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`API hiba: ${res.status} - ${errorBody}`);
  }

  const jsonResponse = await res.json();
  const rawText = jsonResponse.candidates?.[0]?.content?.parts?.[0]?.text;
  return { success: true, result: JSON.parse(rawText) };
}