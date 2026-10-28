/** Icon-only buttons get a screen-reader label from their tooltip. */
const label = (root: ParentNode) =>
  root.querySelectorAll<HTMLElement>('button[title]:not([aria-label])').forEach(b => b.setAttribute('aria-label', b.title));

export function initA11y(): void {
  label(document);
  new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => n instanceof HTMLElement && (n.matches('button[title]') && !n.hasAttribute('aria-label') && n.setAttribute('aria-label', n.title), label(n)))))
    .observe(document.body, { childList: true, subtree: true });
}
