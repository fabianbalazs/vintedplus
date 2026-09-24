document.addEventListener('DOMContentLoaded', async () => {
  const apiKeyInput = document.getElementById('apiKey');
  const saveBtn = document.getElementById('saveBtn');
  const statusDiv = document.getElementById('status');

  const { geminiApiKey } = await chrome.storage.local.get('geminiApiKey');
  if (geminiApiKey) {
    apiKeyInput.value = geminiApiKey;
    statusDiv.className = 'status-success';
    statusDiv.textContent = 'API kulcs beállítva.';
  }

  saveBtn.addEventListener('click', async () => {
    const key = apiKeyInput.value.trim();
    if (!key) {
      statusDiv.className = 'status-error';
      statusDiv.textContent = 'A mező nem lehet üres!';
      return;
    }

    await chrome.storage.local.set({ geminiApiKey: key });
    statusDiv.className = 'status-success';
    statusDiv.textContent = 'Sikeresen mentve!';
    setTimeout(() => window.close(), 1200);
  });
});