/**
 * iOS Safari: 100vh includes the area under the address / tool bars and `innerHeight` lags behind during rotation.
 * We mirror the *visual* viewport into CSS variables (--vw, --vh) so canvas and HUD always fit what the player sees,
 * and measure the HUD clusters (--tl-b, --tc-b, --tr-b, --bot-h) so side panels are placed relative to them
 * instead of at fixed pixel offsets.
 */
const root = document.documentElement;
const listeners = new Set<() => void>();

export const viewportSize = () => {
  const vv = window.visualViewport;
  return { w: Math.round(vv?.width ?? innerWidth), h: Math.round(vv?.height ?? innerHeight) };
};
export const onViewport = (fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn); };

const setVar = (k: string, v: number) => root.style.setProperty(k, `${Math.round(v)}px`);

export function measureHud(): void {
  const { h } = viewportSize();
  const bottom = (sel: string) => {
    const e = document.querySelector<HTMLElement>(sel);
    if (!e || !e.offsetParent) return 0;
    let b = 0;
    for (const c of [e, ...Array.from(e.children) as HTMLElement[]]) { const r = c.getBoundingClientRect(); if (r.height) b = Math.max(b, r.bottom); }
    return b;
  };
  setVar('--tl-b', bottom('#hud .tl'));
  setVar('--tc-b', bottom('#hud .topbar .center'));
  setVar('--tr-b', bottom('#hud #players'));
  const bar = document.querySelector<HTMLElement>('#hud .bottom');
  let top = h;
  if (bar) for (const c of Array.from(bar.children) as HTMLElement[]) { const r = c.getBoundingClientRect(); if (r.height && getComputedStyle(c).display !== 'none') top = Math.min(top, r.top); }
  setVar('--bot-h', h - top);
}

export function initViewport(): void {
  const apply = () => {
    const { w, h } = viewportSize();
    setVar('--vw', w); setVar('--vh', h);
    if (scrollX || scrollY) scrollTo(0, 0);
    measureHud();
    listeners.forEach(f => f());
  };
  apply();
  addEventListener('resize', apply);
  addEventListener('orientationchange', () => { apply(); setTimeout(apply, 250); setTimeout(apply, 700); }); // iOS reports the old size at first
  window.visualViewport?.addEventListener('resize', apply);
  window.visualViewport?.addEventListener('scroll', () => { if (scrollX || scrollY) scrollTo(0, 0); });
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => measureHud());
    const watch = () => document.querySelectorAll('#hud .tl, #hud #players, #hud .bottom, #hud .topbar .center').forEach(e => ro.observe(e));
    new MutationObserver(watch).observe(document.getElementById('ui') ?? document.body, { childList: true });
    watch();
  }
}
