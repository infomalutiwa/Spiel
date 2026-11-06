import {
  ENEMIES, MAPS, RES_KEYS, SMITHY, STRUCTURES, TROOPS, isWallish,
  type Res, type Snapshot, type StructId, type StructSnap, type TroopId, type SmithyId,
} from '@talwacht/shared';
import type { Connection } from '../net/connection';
import type { Controls } from '../input/controls';
import type { World } from '../render/scene';

const ICON: Record<keyof Res, string> = { wood: '🪵', stone: '🪨', food: '🌾', gold: '🪙' };
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export const costText = (c: Partial<Res>) => RES_KEYS.filter(k => (c[k] ?? 0) > 0).map(k => `${ICON[k]}${Math.ceil(c[k]!)}`).join(' ') || 'gratis';
const fmt = (n: number) => (n >= 10000 ? `${(n / 1000).toFixed(0)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${Math.floor(n)}`);
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const LANE = ['Mitte', 'links', 'rechts'];

export const REASONS: Record<string, string> = {
  no_resources: 'Nicht genug Rohstoffe', occupied: 'Da steht schon etwas', blocked: 'Dort kann man nicht bauen', outside: 'Außerhalb der Karte',
  enemy_near: 'Gegner stehen im Weg', needs_forest: 'Holzfäller brauchen Wald in der Nähe', needs_rocks: 'Steinbruch braucht Felsen in der Nähe',
  needs_cliff: 'Muss direkt an der Felswand stehen', needs_slope: 'Braucht einen Hang', needs_creek: 'Nur nahe am Bach möglich', needs_wall: 'Nur auf Mauer oder Tor',
  not_ready: 'Wird noch gebaut', locked: 'Noch nicht freigeschaltet (Sterne sammeln)', army_full: 'Armee voll – baut Häuser', queue_full: 'Warteschlange voll',
  needs_level: 'Gebäude muss erst verbessert werden', max_level: 'Höchste Stufe erreicht', not_damaged: 'Nicht beschädigt', cooldown: 'Lädt noch nach',
  spent: 'Erst neu setzen', not_spent: 'Ist noch scharf', rain: 'Bei Regen brennt nichts', no_squad: 'Kein Trupp gewählt', busy: 'Forscht schon',
  room_not_found: 'Spiel nicht gefunden – Code prüfen', room_full: 'Das Spiel ist schon voll', connection_failed: 'Keine Verbindung zum Server',
  save_invalid: 'Spielstand beschädigt', save_version: 'Spielstand von einer älteren Version', save_too_big: 'Spielstand zu groß', no_more_waves: 'Keine Wellen mehr',
  too_many_rooms: 'Zu viele Spiele erstellt – kurz warten', server_full: 'Server voll', game_over: 'Die Runde ist vorbei', cannot_sell: 'Den Bergfried kann man nicht abreißen',
};
export const reasonText = (r: string) => REASONS[r] ?? r;

const CATS: { id: string; icon: string; name: string; items: StructId[] }[] = [
  { id: 'burg', icon: '🧱', name: 'Burg', items: ['wall', 'gate', 'pitch'] },
  { id: 'tuerme', icon: '🏹', name: 'Türme', items: ['tower_bow', 'tower_xbow', 'ballista', 'tower_catapult', 'watchtower'] },
  { id: 'fallen', icon: '🪤', name: 'Fallen', items: ['spikes', 'pitfall', 'pitch_ditch', 'caltrops', 'stakes', 'log_trap', 'rockslide', 'powder', 'moat'] },
  { id: 'wirtschaft', icon: '🌾', name: 'Wirtschaft', items: ['lumber', 'quarry', 'mine', 'farm', 'mill', 'market', 'house', 'well'] },
  { id: 'militaer', icon: '⚔️', name: 'Militär', items: ['barracks', 'range', 'stable', 'infirmary', 'workshop', 'smithy'] },
];
const BUILD_HINT: Partial<Record<StructId, string>> = {
  wall: 'Finger ziehen: Mauerlinie', gate: 'Auf ein Mauerstück tippen', pitch: 'Auf Mauer oder Tor tippen', tower_bow: 'Gern direkt in die Mauerlinie',
  lumber: 'Nahe am Wald', quarry: 'Nahe an Felsen', mine: 'Direkt an der Felswand', farm: 'Auf Wiesen mehr Ertrag', log_trap: 'An einem Hang', rockslide: 'An der Felswand',
  moat: 'Nahe am Bach', spikes: 'Felder antippen/ziehen', caltrops: 'Felder antippen/ziehen',
};

export class Hud {
  root: HTMLElement;
  private els: Record<string, HTMLElement> = {};
  private cat = 'burg';
  private lastSnap?: Snapshot;
  private toasts: HTMLElement;
  private spentOpen = false;
  private scoutOpen = -1;
  onEnd: (s: Snapshot) => void = () => {};
  onMenu: () => void = () => {};
  private ended = false;

  constructor(private conn: Connection, private ctl: Controls, private world: World) {
    this.root = document.createElement('div');
    this.root.id = 'hud';
    this.root.innerHTML = `
      <div class="tl panel" id="res"></div>
      <div class="tc"><div class="panel" id="wave"></div><div id="boss" class="panel hidden"></div><div id="toasts"></div></div>
      <div class="tr"><canvas id="mini" width="200" height="200" class="panel"></canvas><div class="row"><button class="btn small ghost" id="menuBtn" title="Menü">☰</button></div></div>
      <div class="left" id="squads"></div>
      <div class="right" id="side"></div>
      <div class="bottom"><div id="buildbar" class="panel"></div></div>
      <div id="popover" class="panel hidden"></div>
      <div id="overlay" class="hidden"></div>`;
    document.getElementById('ui')!.appendChild(this.root);
    for (const id of ['res', 'wave', 'boss', 'squads', 'side', 'buildbar', 'popover', 'overlay', 'mini']) this.els[id] = this.root.querySelector(`#${id}`)!;
    this.toasts = this.root.querySelector('#toasts')!;
    this.root.querySelector('#menuBtn')!.addEventListener('click', () => this.onMenu());
    this.els.res.addEventListener('click', () => { this.spentOpen = !this.spentOpen; this.renderRes(); });
    this.els.mini.addEventListener('pointerdown', e => this.miniJump(e));
    ctl.onChange = () => { this.renderBuild(); this.renderSide(); this.renderSquads(); };
    ctl.onToast = (m, w) => this.toast(m, w);
    this.renderBuild();
  }

  toast(text: string, warn = false) {
    const t = document.createElement('div');
    t.className = `toast ${warn ? 'warn' : ''}`; t.textContent = text;
    this.toasts.prepend(t);
    while (this.toasts.children.length > 3) this.toasts.lastChild!.remove();
    setTimeout(() => t.classList.add('out'), 2600); setTimeout(() => t.remove(), 3200);
  }

  update(s: Snapshot) {
    this.lastSnap = s;
    this.renderRes(); this.renderWave(); this.renderSquads(); this.renderSide(); this.renderOverlay();
    if (this.ctl.mode.k === 'build') this.renderBuildTip();
    for (const e of s.events) {
      if (e.k === 'toast') this.toast(e.text, e.warn);
      if (e.k === 'wave') this.banner(e.boss ? `👑 Welle ${e.n} – der Kriegsfürst!` : `⚔️ Welle ${e.n}${e.special === 'night' ? ' – Nacht' : e.special === 'rain' ? ' – Regen' : ''}`);
      if (e.k === 'ping' && e.p !== this.conn.you) this.toast('💗 Deine Mitspielerin hat etwas markiert');
    }
    if (s.result && !this.ended) { this.ended = true; this.onEnd(s); }
  }

  private banner(text: string) {
    const b = document.createElement('div'); b.className = 'banner'; b.textContent = text;
    this.root.appendChild(b); setTimeout(() => b.remove(), 2600);
  }

  // ---------- resources ----------
  private renderRes() {
    const s = this.lastSnap; if (!s) return;
    const you = this.conn.you;
    const cells = RES_KEYS.map(k => `<span class="r ${s.res[k] < 20 ? 'low' : ''}"><i>${ICON[k]}</i><b>${fmt(s.res[k])}</b><small class="${s.rate[k] < 0 ? 'neg' : ''}">${s.rate[k] >= 0 ? '+' : ''}${Math.round(s.rate[k])}</small></span>`).join('');
    const army = `<span class="army" title="Armee"><b class="p0">${you === 0 ? 'Du' : '💙'} ${s.army[0]}/${s.cap[0]}</b><b class="p1">${you === 1 ? 'Du' : '💗'} ${s.army[1]}/${s.cap[1]}</b></span>`;
    const hunger = s.hunger ? '<span class="hunger">🍖 Hunger!</span>' : '';
    const spent = this.spentOpen ? `<div class="spent">${s.spent.slice().reverse().map(e => `<div><b class="p${e.p}">${e.p === you ? 'Du' : 'Sie'}</b> ${esc(e.what)}</div>`).join('') || '<div>Noch nichts ausgegeben</div>'}</div>` : '';
    this.els.res.innerHTML = `<div class="resrow">${cells}${army}${hunger}</div><div class="sub">Gemeinsame Kasse · pro Minute · antippen für Ausgaben</div>${spent}`;
  }

  // ---------- wave timeline ----------
  private renderWave() {
    const s = this.lastSnap; if (!s) return;
    const chips = s.timeline.map((w, i) => `<button class="chip ${w.boss ? 'boss' : ''} ${this.scoutOpen === i ? 'on' : ''}" data-i="${i}">
      <b>${w.wave}</b><span>${w.icons.join('')}</span><small>${mmss(w.in)} · ${LANE[w.lane]}${w.special === 'night' ? ' 🌙' : w.special === 'rain' ? ' 🌧️' : ''}</small></button>`).join('');
    const scout = this.scoutOpen >= 0 && s.timeline[this.scoutOpen] ? `<div class="scout">${(s.timeline[this.scoutOpen].scout.length ? s.timeline[this.scoutOpen].scout : ['Baut einen Wachturm für genauere Späherberichte']).map(l => `<div>${esc(l)}</div>`).join('')}</div>` : '';
    const left = s.wave >= s.waveCount ? 'Letzte Welle!' : `nächste in <b>${mmss(s.nextWaveIn)}</b>`;
    this.els.wave.innerHTML = `<div class="wtop"><span>🌊 Welle <b>${s.wave}</b>/${s.waveCount} · ${left}</span>${s.wave < s.waveCount ? `<button class="btn small gold" id="call" title="Nächste Welle sofort – Gold für jede gesparte Sekunde">⏩ +${s.nextWaveIn}🪙</button>` : ''}</div><div class="chips">${chips}</div>${scout}`;
    this.els.wave.querySelector('#call')?.addEventListener('click', () => this.conn.cmd({ c: 'callWave' }));
    this.els.wave.querySelectorAll<HTMLElement>('.chip').forEach(c => c.addEventListener('click', () => { const i = Number(c.dataset.i); this.scoutOpen = this.scoutOpen === i ? -1 : i; this.renderWave(); }));
    if (s.boss) { this.els.boss.classList.remove('hidden'); this.els.boss.innerHTML = `👑 Kriegsfürst <div class="bar"><i style="width:${(100 * s.boss[0]) / s.boss[1]}%"></i></div>`; }
    else this.els.boss.classList.add('hidden');
  }

  // ---------- squads ----------
  private squadKey = '';
  private renderSquads() {
    const s = this.lastSnap; if (!s) return;
    const mine = s.squads.filter(q => q.owner === this.conn.you), theirs = s.squads.filter(q => q.owner !== this.conn.you);
    const key = mine.map(q => `${q.id}:${q.n}:${Math.round(q.hp / 10)}:${q.order}:${q.stars}:${this.ctl.selected.has(q.id)}`).join('|') + `#${theirs.length}`;
    if (key === this.squadKey) return;
    this.squadKey = key;
    const ORDER: Record<string, string> = { idle: '', move: '➜', attack: '⚔️', hold: '✋', retreat: '↩️', wall: '🏰', gate: '🚪', breach: '🛡️', sortie: '🐎', tower: '🗼' };
    this.els.squads.innerHTML = mine.map(q => `<button class="sq panel ${this.ctl.selected.has(q.id) ? 'sel' : ''}" data-id="${q.id}">
      <span class="ic">${TROOPS[q.type].icon}</span><span class="nm">${TROOPS[q.type].name} ×${q.n}${'⭐'.repeat(q.stars)}<i class="hp"><i style="width:${q.hp}%"></i></i></span><span class="ord">${ORDER[q.order] ?? ''}</span></button>`).join('')
      + (mine.length ? `<button class="sq panel all" id="selAll">Alle wählen</button>` : `<div class="hint panel nosq">Truppen bildet ihr in Kaserne, Schießplatz und Stall aus (Militär ⚔️)</div>`)
      + (theirs.length ? `<div class="partner">💗 Mitspielerin: ${theirs.length} Trupps</div>` : '');
    this.els.squads.querySelectorAll<HTMLElement>('.sq[data-id]').forEach(b => b.addEventListener('click', () => {
      const id = Number(b.dataset.id);
      if (this.ctl.selected.has(id) && this.ctl.selected.size === 1) this.focusSquad(id); else this.ctl.selectSquads([id]);
    }));
    this.root.querySelector('#selAll')?.addEventListener('click', () => this.ctl.selectSquads(mine.map(q => q.id)));
  }
  private focusSquad(id: number) {
    const s = this.lastSnap; if (!s) return;
    const us = s.units.filter(u => u.squad === id);
    if (!us.length) return;
    this.world.target.set(us.reduce((a, u) => a + u.x, 0) / us.length, 0, us.reduce((a, u) => a + u.y, 0) / us.length);
    this.world.dist = Math.min(this.world.dist, 120);
  }

  // ---------- right side: stances or structure panel ----------
  private sideKey = '';
  private renderSide() {
    const s = this.lastSnap; if (!s) return;
    const st = this.ctl.selStruct >= 0 ? this.conn.structs.get(this.ctl.selStruct) : undefined;
    if (this.ctl.selected.size && !st) {
      const k = `st:${[...this.ctl.selected].join(',')}`;
      if (k === this.sideKey) return; this.sideKey = k;
      this.els.side.innerHTML = `<div class="stances">${[['attack', '⚔️', 'Angriff'], ['hold', '✋', 'Halten'], ['wall', '🏰', 'Mauer'], ['retreat', '↩️', 'Rückzug']].map(([k2, i, n]) => `<button class="btn st" data-k="${k2}">${i}<span>${n}</span></button>`).join('')}
        <button class="btn st ghost" data-k="none">✕<span>Abwählen</span></button></div>
        <div class="hint panel tip">Tippe Boden = hingehen · Gegner = angreifen · Mauer/Turm = Schützen verteilen sich auf die Zinnen · Tor = Nahkämpfer sperren / Reiter machen Ausfall</div>`;
      this.els.side.querySelectorAll<HTMLElement>('.st').forEach(b => b.addEventListener('click', () => {
        const k2 = b.dataset.k!;
        if (k2 === 'none') { this.ctl.cancel(); return; }
        this.ctl.stance(k2 as 'hold');
      }));
      return;
    }
    if (!st) { if (this.sideKey !== '') { this.sideKey = ''; this.els.side.innerHTML = ''; } return; }
    const q = s.queues.find(x => x.id === st.id);
    const k = `s:${st.id}:${st.level}:${Math.round(st.hp / 50)}:${st.build > 0}:${st.pitch}:${st.spent}:${JSON.stringify(q ?? '')}:${Math.floor(s.res.gold / 20)}:${Math.floor(s.res.wood / 20)}:${Math.floor(s.res.stone / 20)}:${s.research.length}`;
    if (k === this.sideKey) return; this.sideKey = k;
    this.els.side.innerHTML = this.structPanel(st, s);
    this.els.side.querySelectorAll<HTMLElement>('[data-act]').forEach(b => b.addEventListener('click', () => this.act(st, b.dataset.act!, b.dataset.arg)));
  }

  private structPanel(st: StructSnap, s: Snapshot) {
    const d = STRUCTURES[st.kind];
    const maxLv = d.up.length + 1;
    const hpPct = Math.round((100 * st.hp) / st.maxHp);
    const tier = st.kind === 'wall' ? ['Holzpalisade', 'Steinmauer', 'Verstärkte Mauer'][st.level - 1] : st.kind === 'gate' ? ['Holztor', 'Beschlagenes Tor', 'Torhaus mit Fallgitter'][st.level - 1] : d.name;
    let html = `<div class="sp panel"><div class="sph"><span class="ic">${d.icon}</span><div><b>${esc(tier)}</b><small>Stufe ${st.level}/${maxLv}${st.build > 0 ? ' · im Bau' : ''}</small></div><button class="x" data-act="close">✕</button></div>
      <div class="bar"><i style="width:${hpPct}%" class="${hpPct < 35 ? 'low' : ''}"></i></div><p class="blurb">${esc(d.blurb)}</p><div class="acts">`;
    if (st.level < maxLv) html += `<button class="btn small" data-act="upgrade">⬆️ Verbessern<br><small>${costText(d.up[st.level - 1])}</small></button>`;
    if (st.hp < st.maxHp - 1 && st.kind !== 'moat') html += `<button class="btn small" data-act="repair">🔧 Reparieren</button>`;
    if ((st.kind === 'wall' || st.kind === 'gate') && !st.pitch) html += `<button class="btn small" data-act="pitch">🫕 Pechnase<br><small>${costText(STRUCTURES.pitch.cost)}</small></button>`;
    if (st.pitch === 1 && st.level >= maxLv) html += `<button class="btn small" data-act="upgrade">🫕 Pechnase ⬆️<br><small>${costText(STRUCTURES.pitch.up[0])}</small></button>`;
    if (d.trap?.trigger === 'manual' && !st.spent) html += `<button class="btn small gold" data-act="trigger">🔥 Auslösen</button>`;
    if (st.spent && d.trap?.reset) html += `<button class="btn small" data-act="reset">♻️ Neu setzen<br><small>${costText(d.trap.reset)}</small></button>`;
    if (st.kind !== 'keep') html += `<button class="btn small ghost" data-act="sell">↩️ Abreißen</button>`;
    html += '</div>';
    if (d.trains && st.build <= 0) {
      const queue = s.queues.find(x => x.id === st.id);
      html += `<div class="train">${d.trains.map(t => {
        const td = TROOPS[t], locked = !!td.unlock && !this.unlocks.includes(td.unlock), lv = st.level < td.needs;
        return `<button class="btn small tr ${locked || lv ? 'dis' : ''}" data-act="train" data-arg="${t}" ${locked || lv ? 'disabled' : ''} title="${esc(td.blurb)}">${td.icon} ${esc(td.name)} ×${td.squad}<br><small>${locked ? '🔒 Sterne' : lv ? `ab Stufe ${td.needs}` : costText(td.cost)}</small></button>`;
      }).join('')}</div>`;
      if (queue?.jobs.length) html += `<div class="queue">${queue.jobs.map(([t, o, f]) => `<span class="p${o}">${TROOPS[t as TroopId].icon}<i style="width:${Math.round(f * 100)}%"></i></span>`).join('')}<button class="btn small ghost" data-act="cancel">✕</button></div>`;
      html += `<div class="hint">Neue Trupps laufen zum Sammelpunkt vor dem Gebäude.</div>`;
    }
    if (st.kind === 'smithy' && st.build <= 0) {
      const q = s.queues.find(x => x.id === st.id);
      html += `<div class="train">${(Object.keys(SMITHY) as SmithyId[]).map(r => {
        const done = s.research.includes(r), busy = q?.research?.[0] === r;
        return `<button class="btn small tr ${done ? 'dis' : ''}" data-act="research" data-arg="${r}" ${done ? 'disabled' : ''}>${SMITHY[r].icon} ${esc(SMITHY[r].name)}<br><small>${done ? '✔ erforscht' : busy ? `${Math.round((q!.research![1]) * 100)} %` : costText(SMITHY[r].cost)}</small></button>`;
      }).join('')}</div>`;
    }
    if (STRUCTURES[st.kind].tower && st.kind !== 'pitch') {
      const q = s.queues.find(x => x.id === st.id);
      const t = STRUCTURES[st.kind].tower!, l = Math.min(st.level, t.shooters.length) - 1;
      html += `<div class="hint">Besatzung ${t.shooters[l]} · Reichweite ${t.range[l]} m · Schaden ${t.dmg[l]}${t.radius ? ` · Fläche ${t.radius} m` : ''}${t.maxTargets ? ` · bis ${t.maxTargets[l]} Ziele` : ''}${q?.dry ? ' · <b class="neg">Kein Stein!</b>' : ''}</div>`;
    }
    return html + '</div>';
  }

  unlocks: string[] = [];
  private act(st: StructSnap, a: string, arg?: string) {
    const c = this.conn;
    switch (a) {
      case 'close': this.ctl.selStruct = -1; this.ctl.onChange(); break;
      case 'upgrade': case 'repair': case 'sell': case 'trigger': case 'reset': c.cmd({ c: a, id: st.id }); if (a === 'sell') { this.ctl.selStruct = -1; this.ctl.onChange(); } break;
      case 'pitch': c.cmd({ c: 'build', kind: 'pitch', cells: [[st.cx, st.cy]] }); break;
      case 'train': c.cmd({ c: 'train', building: st.id, troop: arg as TroopId }); break;
      case 'research': c.cmd({ c: 'research', building: st.id, what: arg as SmithyId }); break;
      case 'cancel': c.cmd({ c: 'cancel', building: st.id }); break;
    }
  }

  // ---------- build bar ----------
  private renderBuild() {
    const mode = this.ctl.mode;
    const cat = CATS.find(c => c.id === this.cat)!;
    const tabs = CATS.map(c => `<button class="tab ${c.id === this.cat ? 'on' : ''}" data-cat="${c.id}">${c.icon}<span>${c.name}</span></button>`).join('');
    const items = cat.items.map(k => {
      const d = STRUCTURES[k], locked = !!d.unlock && !this.unlocks.includes(d.unlock);
      return `<button class="item ${mode.k === 'build' && mode.kind === k ? 'on' : ''} ${locked ? 'dis' : ''}" data-k="${k}" ${locked ? 'disabled' : ''}>${d.icon}<span>${esc(d.name)}</span><small>${locked ? '🔒' : costText(d.cost)}</small></button>`;
    }).join('');
    const confirm = mode.k === 'build' ? `<div class="confirm"><button class="btn gold" id="ok">✔</button><button class="btn ghost" id="no">✕</button></div>` : '';
    this.els.buildbar.innerHTML = `<div class="tabs">${tabs}</div><div class="items">${items}</div>${confirm}<div id="btip"></div>`;
    this.els.buildbar.querySelectorAll<HTMLElement>('.tab').forEach(b => b.addEventListener('click', () => { this.cat = b.dataset.cat!; this.renderBuild(); }));
    this.els.buildbar.querySelectorAll<HTMLElement>('.item').forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.k as StructId;
      this.ctl.setBuild(this.ctl.mode.k === 'build' && this.ctl.mode.kind === k ? null : k);
    }));
    this.els.buildbar.querySelector('#ok')?.addEventListener('click', () => this.ctl.confirmBuild());
    this.els.buildbar.querySelector('#no')?.addEventListener('click', () => this.ctl.setBuild(null));
    this.renderBuildTip();
  }
  private renderBuildTip() {
    const tip = this.els.buildbar.querySelector('#btip') as HTMLElement | null;
    if (!tip) return;
    const mode = this.ctl.mode;
    if (mode.k !== 'build') { tip.innerHTML = ''; return; }
    const d = STRUCTURES[mode.kind], n = this.ctl.preview.length;
    const ok = this.ctl.preview.filter(([x, y]) => this.ctl.cellOk(x, y, mode.kind)).length;
    const mult = mode.kind === 'wall' || d.cat === 'trap' ? ok : 1;
    const cost = mode.kind === 'wall' || d.cat === 'trap' ? Object.fromEntries(RES_KEYS.map(k => [k, d.cost[k] * mult])) : d.cost;
    tip.innerHTML = `<b>${d.icon} ${esc(d.name)}</b> ${n ? `· ${mult}${mode.kind === 'wall' ? ' Felder' : ''} · ${costText(cost)} · ${Math.round(d.build)} s` : ''}${n && ok < n ? ` · <span class="neg">${n - ok} blockiert</span>` : ''}<br><small>${esc(BUILD_HINT[mode.kind] ?? 'Ort antippen, dann ✔')}</small>`;
  }

  // ---------- overlays ----------
  private renderOverlay() {
    const s = this.lastSnap!;
    const o = this.els.overlay;
    if (s.paused && !s.result) {
      o.classList.remove('hidden');
      o.innerHTML = this.conn.peerConnected ? '<div class="panel msg">⏸️ Pause – deine Mitspielerin hat das Spiel gerade nicht offen</div>' : `<div class="panel msg">⏳ Warte auf deine Mitspielerin …<br>Code <b class="code">${esc(this.conn.code)}</b><br><button class="btn gold" id="share">🔗 Einladung teilen</button></div>`;
      o.querySelector('#share')?.addEventListener('click', () => shareInvite(this.conn.code));
    } else o.classList.add('hidden');
    document.body.classList.toggle('rain', s.rain);
  }

  // ---------- minimap ----------
  drawMini() {
    const s = this.lastSnap, cv = this.els.mini as HTMLCanvasElement;
    if (!s) return;
    const g = cv.getContext('2d')!, map = MAPS[s.mapId], W = cv.width, H = cv.height;
    const k = Math.min(W / map.w, H / map.d), ox = (W - map.w * k) / 2, oy = (H - map.d * k) / 2;
    g.fillStyle = '#5b5348'; g.fillRect(0, 0, W, H);
    g.fillStyle = map.theme === 'snow' ? '#dfe8f0' : '#7fa94e';
    g.beginPath();
    for (let y = 0; y <= map.d; y += 20) g.lineTo(ox + this.edge(map, y, true) * k, oy + y * k);
    for (let y = map.d; y >= 0; y -= 20) g.lineTo(ox + this.edge(map, y, false) * k, oy + y * k);
    g.fill();
    if (map.creek) { g.strokeStyle = '#3f8fbf'; g.lineWidth = 3; g.beginPath(); map.creek.forEach(([x, y], i) => (i ? g.lineTo(ox + x * k, oy + y * k) : g.moveTo(ox + x * k, oy + y * k))); g.stroke(); }
    for (const st of this.conn.structs.values()) {
      g.fillStyle = st.kind === 'keep' ? '#ffd75e' : isWallish(st.kind) ? '#f2e6cc' : STRUCTURES[st.kind].cat === 'trap' ? '#8a6a4a' : '#c9b48a';
      g.fillRect(ox + st.cx * 4 * k, oy + st.cy * 4 * k, Math.max(2, st.w * 4 * k), Math.max(2, st.h * 4 * k));
    }
    for (const u of s.units) {
      if (u.hp <= 0) continue;
      g.fillStyle = u.side === 'e' ? '#ff4a3a' : u.owner === 0 ? '#5aa8ff' : '#ff8fb0';
      g.fillRect(ox + u.x * k - 1.5, oy + u.y * k - 1.5, 3, 3);
    }
    // camera frame
    const t = this.world.target, half = this.world.dist * 0.75;
    g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.strokeRect(ox + (t.x - half) * k, oy + (t.z - half * 0.6) * k, half * 2 * k, half * 1.2 * k);
  }
  private edge(map: (typeof MAPS)[string], y: number, left: boolean) {
    const e = map.edges; let i = 0; while (i < e.length - 2 && e[i + 1].y < y) i++;
    const a = e[i], b = e[i + 1], t = Math.min(1, Math.max(0, (y - a.y) / (b.y - a.y)));
    return left ? a.left + (b.left - a.left) * t : a.right + (b.right - a.right) * t;
  }
  private miniJump(e: PointerEvent) {
    const s = this.lastSnap; if (!s) return;
    const cv = this.els.mini as HTMLCanvasElement, r = cv.getBoundingClientRect(), map = MAPS[s.mapId];
    const W = cv.width, H = cv.height, k = Math.min(W / map.w, H / map.d), ox = (W - map.w * k) / 2, oy = (H - map.d * k) / 2;
    const px = ((e.clientX - r.left) / r.width) * W, py = ((e.clientY - r.top) / r.height) * H;
    this.world.target.set((px - ox) / k, 0, (py - oy) / k);
  }
}

export function shareInvite(code: string) {
  const url = `${location.origin}${location.pathname}?room=${code}`;
  const text = `Komm mit in mein Tal! Talwacht – Code ${code}`;
  if (navigator.share) navigator.share({ title: 'Talwacht', text, url }).catch(() => { /* cancelled */ });
  else navigator.clipboard?.writeText(url).catch(() => { /* blocked */ });
}

export const enemyName = (t: string) => ENEMIES[t as keyof typeof ENEMIES]?.name ?? t;
