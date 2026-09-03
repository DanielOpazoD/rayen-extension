async function checkSession() {
  const status = document.getElementById('status');
  try {
    const tabs = await chrome.tabs.query({ url: 'https://clinicohangaroa.eloisa.cl/*' });
    if (!tabs.length) {
      status.className = 'err';
      status.textContent = 'Abre clinicohangaroa.eloisa.cl e inicia sesión primero.';
      return;
    }
    const res = await chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      world: 'MAIN',
      func: () => {
        try { return !!JSON.parse(localStorage.getItem('userSession') || '{}').accessToken; }
        catch { return false; }
      }
    });
    if (res?.[0]?.result) {
      status.className = 'ok';
      status.textContent = 'Sesión activa detectada ✓';
    } else {
      status.className = 'err';
      status.textContent = 'Sin sesión activa en Eloisa. Inicia sesión primero.';
    }
  } catch {
    status.textContent = 'Error verificando sesión.';
  }
}

document.getElementById('btnOpen').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('app.html') });
});

checkSession();
