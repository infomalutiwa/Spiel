import { DIFFICULTY, MAP_ORDER, MAPS, TALENTS, UNLOCKS, type Difficulty } from '@talwacht/shared';
import { exportMeta, importMeta, loadRound, mapUnlocked, saveMeta, talentUnlocked, toggleTalent, totalStars, type Meta } from './meta';
import { reasonText } from './hud';

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export interface LobbyActions {
  create(map: string, diff: Difficulty): Promise<void>;
  join(code: string): Promise<void>;
  resume(save: string): Promise<void>;
  preview(map: string): void;
}

export function showLobby(meta: Meta, act: LobbyActions, preset?: string) {
  const ui = document.getElementById('ui')!;
  const el = document.createElement('div');
  el.id = 'lobby';
  ui.appendChild(el);
  let tab: 'new' | 'join' | 'more' = preset ? 'join' : 'new';
  const render = (err = '') => {
    const stars = totalStars(meta), saved = loadRound();
    const maps = MAP_ORDER.map(id => {
      const m = MAPS[id], open = mapUnlocked(meta, id), need = UNLOCKS.find(u => u.id === id)?.stars ?? 0;
      const st = (['easy', 'normal', 'hard'] as Difficulty[]).map(d => meta.stars[`${id}:${d}`] ?? 0);
      return `<button class="map ${meta.map === id ? 'on' : ''} ${open ? '' : 'locked'}" data-map="${id}" ${open ? '' : 'disabled'}>
        <b>${esc(m.name)}</b><small>${open ? esc(m.blurb) : `🔒 ab ${need} ⭐`}</small><span class="stars">${'★'.repeat(Math.max(...st))}${'☆'.repeat(3 - Math.max(...st))}</span></button>`;
    }).join('');
    const diffs = (Object.keys(DIFFICULTY) as Difficulty[]).map(d => `<button class="seg ${meta.diff === d ? 'on' : ''}" data-diff="${d}">${DIFFICULTY[d].name}<small>${DIFFICULTY[d].waves} Wellen</small></button>`).join('');
    const talents = TALENTS.map(t => {
      const open = talentUnlocked(meta, t.id), on = meta.talents.includes(t.id);
      return `<button class="tal ${on ? 'on' : ''} ${open ? '' : 'locked'}" data-tal="${t.id}" ${open ? '' : 'disabled'} title="${esc(t.blurb)}"><b>${esc(t.name)}</b><small>${open ? esc(t.blurb) : `🔒 ${t.stars} ⭐`}</small></button>`;
    }).join('');
    el.innerHTML = `<div class="card panel">
      <h1>Talwacht</h1><p class="sub">Verschanzt euch zu zweit im Tal – haltet ${DIFFICULTY[meta.diff].waves} Wellen. ⭐ ${stars}</p>
      <div class="tabs3"><button class="seg ${tab === 'new' ? 'on' : ''}" data-tab="new">🏰 Neues Spiel</button><button class="seg ${tab === 'join' ? 'on' : ''}" data-tab="join">🤝 Beitreten</button><button class="seg ${tab === 'more' ? 'on' : ''}" data-tab="more">⭐ Fortschritt</button></div>
      ${tab === 'new' ? `
        <div class="maps">${maps}</div>
        <div class="segs">${diffs}</div>
        <div class="tals"><div class="hint">Talente (bis zu 3):</div>${talents}</div>
        <div class="go"><button class="btn gold big" id="create">Spiel erstellen</button>${saved ? `<button class="btn" id="resume">↻ Fortsetzen: ${esc(MAPS[saved.mapId]?.name ?? '')}, Welle ${saved.wave}</button>` : ''}</div>
        <p class="hint">Du bekommst einen Code. Deine Mitspielerin tritt damit bei – jede auf ihrem eigenen Handy.</p>` : ''}
      ${tab === 'join' ? `
        <div class="join"><input id="code" maxlength="4" placeholder="CODE" value="${esc(preset ?? '')}" autocomplete="off" autocapitalize="characters"><button class="btn gold big" id="joinBtn">Beitreten</button></div>
        <p class="hint">Den 4-stelligen Code zeigt das Handy, auf dem das Spiel erstellt wurde.</p>` : ''}
      ${tab === 'more' ? `
        <div class="unl">${UNLOCKS.map(u => `<div class="${u.stars <= stars ? 'ok' : ''}">${u.stars <= stars ? '✔' : '🔒'} ${esc(u.name)} <small>${u.stars} ⭐</small></div>`).join('')}</div>
        <p class="hint">★ = gewonnen · ★★ = Bergfried nie unter 50 % · ★★★ = auf Schwer gewonnen. Sterne gelten pro Karte und Schwierigkeit.</p>
        <div class="join"><input id="imp" placeholder="Fortschritts-Code einfügen"><button class="btn" id="impBtn">Übernehmen</button><button class="btn ghost" id="expBtn">Code kopieren</button></div>` : ''}
      <div class="err">${esc(err)}</div></div>`;
    el.querySelectorAll<HTMLElement>('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab as typeof tab; render(); });
    el.querySelectorAll<HTMLElement>('[data-map]').forEach(b => b.onclick = () => { meta.map = b.dataset.map!; saveMeta(meta); act.preview(meta.map); render(); });
    el.querySelectorAll<HTMLElement>('[data-diff]').forEach(b => b.onclick = () => { meta.diff = b.dataset.diff as Difficulty; saveMeta(meta); render(); });
    el.querySelectorAll<HTMLElement>('[data-tal]').forEach(b => b.onclick = () => { toggleTalent(meta, b.dataset.tal as never); render(); });
    const busy = async (fn: () => Promise<void>) => { el.querySelectorAll('button').forEach(b => (b.disabled = true)); try { await fn(); el.remove(); } catch (e) { render(reasonText((e as Error).message)); } };
    el.querySelector('#create')?.addEventListener('click', () => busy(() => act.create(meta.map, meta.diff)));
    el.querySelector('#resume')?.addEventListener('click', () => busy(() => act.resume(loadRound()!.data)));
    const code = el.querySelector<HTMLInputElement>('#code');
    const join = () => busy(() => act.join((code?.value ?? '').trim().toUpperCase()));
    el.querySelector('#joinBtn')?.addEventListener('click', join);
    code?.addEventListener('keydown', e => { if (e.key === 'Enter') join(); });
    el.querySelector('#expBtn')?.addEventListener('click', () => { navigator.clipboard?.writeText(exportMeta(meta)).catch(() => {}); render('Code kopiert – auf dem anderen Handy einfügen'); });
    el.querySelector('#impBtn')?.addEventListener('click', () => render(importMeta(meta, el.querySelector<HTMLInputElement>('#imp')!.value) ? 'Fortschritt übernommen' : 'Code ungültig'));
  };
  render();
  act.preview(meta.map);
  return { close: () => el.remove(), error: (r: string) => render(reasonText(r)) };
}
