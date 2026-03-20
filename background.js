chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Képek betöltése
    if (request.action === "downloadImage") {
        fetch(request.url)
            .then(response => response.blob())
            .then(blob => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    sendResponse({ success: true, data: reader.result });
                };
                reader.readAsDataURL(blob);
            })
            .catch(error => {
                sendResponse({ success: false, error: error.toString() });
            });
        return true; 
    }

    // Lap bezárása kérésre
    if (request.action === "closeTab") {
        if (sender.tab && sender.tab.id) {
            chrome.tabs.remove(sender.tab.id);
        }
    }
});