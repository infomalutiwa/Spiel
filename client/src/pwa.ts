/** install-as-app support: service worker, Android install prompt, iPhone hint */
interface InstallEvent extends Event { prompt(): Promise<void> }
let deferred: InstallEvent | undefined;
const listeners = new Set<() => void>();

export const standalone = () => matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches
  || (navigator as unknown as { standalone?: boolean }).standalone === true;

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => { /* optional */ }); });
}
addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e as InstallEvent; listeners.forEach(f => f()); });
addEventListener('appinstalled', () => { deferred = undefined; listeners.forEach(f => f()); });

/** puts an install button (Android/desktop Chrome) or a how-to line (iPhone/iPad) under the lobby */
export function mountInstall(card: HTMLElement) {
  if (standalone()) return;
  const box = document.createElement('div');
  box.className = 'install';
  card.appendChild(box);
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const render = () => {
    box.innerHTML = '';
    if (deferred) {
      const b = document.createElement('button');
      b.className = 'btn ghost small'; b.textContent = '📲 Als App installieren';
      b.onclick = async () => { await deferred?.prompt(); deferred = undefined; render(); };
      box.appendChild(b);
    } else if (ios) {
      box.innerHTML = '<p class="hint">📲 Als App: in Safari auf <b>Teilen</b> (□↑) tippen → <b>Zum Home-Bildschirm</b></p>';
    }
  };
  listeners.add(render);
  render();
}
