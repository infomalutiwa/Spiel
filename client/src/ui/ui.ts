import {
  MAX_ARMY, MAX_WALL_LEVEL, REBUILD_COST, REPAIR_COST, SLOT_WEIGHT, SQUAD_SIZE, TROOP_ORDER, TROOPS, UNIT_DEFS, UPGRADE_COST, WAVES,
  canManWalls, squadCost, unitPrice,
  type AbilityId, type Formation, type MapDef, type PlayerId, type Snapshot, type TroopType,
} from '@burgwacht/shared';
import type { Controls } from '../input/controls';
import type { Connection } from '../net/connection';
import { renderPortraits } from '../render/portraits';
import { MAPS } from '@burgwacht/shared';
import { mountInstall } from '../pwa';
const REASONS: Record<string, string> = {
  not_enough_gold: 'Nicht genug Gold', outside_zone: 'Hier darfst du nicht aufstellen – nimm die helle Fläche oder die goldene Mauerkrone', army_full: 'Armee voll (30 Plätze pro Spielerin)', squad_full: 'Der Trupp ist schon vollzählig', max_level: 'Höchste Stufe erreicht',
  not_prep: 'Nur in der Aufstellphase', not_battle: 'Nur im Kampf', cooldown: 'Fähigkeit lädt noch',
  bad_command: 'Das geht so nicht', room_full: 'Der Raum ist schon voll', room_not_found: 'Diesen Raum gibt es nicht',
  connection_failed: 'Keine Verbindung zum Server', too_many_rooms: 'Zu viele neue Spiele in kurzer Zeit – kurz warten', server_full: 'Der Server ist gerade voll – versucht es gleich nochmal', bad_message: 'Das hat nicht geklappt',
};
export const reasonText = (r: string) => REASONS[r] ?? r;

const INFO: Record<TroopType, { role: string; strong: string; weak: string }> = {
  knight: { role: 'Robust im Nahkampf – hält das Tor. Im Block (3) nimmt er 15 % weniger Schaden.', strong: 'Fußvolk, Bogen', weak: 'Magie, Armbrust' },
  archer: { role: 'Auf der Mauerkrone +30 % Reichweite und Deckung; Nahkämpfer erreichen sie dort nicht.', strong: 'Leichte Ziele, Magier, Heiler', weak: 'Schwere Rüstung, Reiter' },
  spearman: { role: 'Hält er die Stellung (H), prallen Reiter fast wirkungslos ab – Speerwall am Tor.', strong: 'Reiter (doppelt)', weak: 'Schwere Rüstung' },
  cavalry: { role: 'Sturmangriff aus dem Anlauf: über 2× Schaden. Die Reserve, wenn der Feind im Hof steht.', strong: 'Fernkämpfer, Leichte', weak: 'Speerwall, Eisenwachen' },
  crossbowman: { role: 'Durchschlägt Rüstung – der Konter gegen Eisenwachen. Stark auf der Mauer.', strong: 'Schwere Rüstung', weak: 'Belagerung, Nahkampf' },
  mage: { role: 'Flächenschaden, bricht dicke Rüstung. Gut auf Türmen; braucht Schutz.', strong: 'Gruppen, Schwere', weak: 'Reiter' },
  healer: { role: 'Heilt Verbündete in der Nähe. Stell sie hinter die Frontlinie.', strong: 'Hält den Trupp am Leben', weak: 'Alles – gut beschützen' },
  catapult: { role: 'Reichweite 30: steht hinter der Mauer und beschießt Rammen und Gruppen vor dem Tor.', strong: 'Rammen, Katapulte, Gruppen', weak: 'Schnelle Truppen' },
};
const FORM: Record<Formation, string> = { line: 'Linie', wedge: 'Keil', block: 'Block' };

const $ = <T extends HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
const el = (html: string) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild as HTMLElement; };

export interface LobbyHandlers { create(mapId: string): Promise<void>; join(code: string): Promise<void>; preview(mapId: string): void }

const SWATCH: Record<string, string> = {
  meadow: 'linear-gradient(135deg,#9fd078,#7db860 55%,#e0bd8b)', forest: 'linear-gradient(135deg,#5f9e50,#3f7d3f 55%,#c9ad84)', valley: 'linear-gradient(135deg,#d9bb68,#a8c862 55%,#e1c18e)',
};

export class Ui {
  root = document.getElementById('ui')!;
  private hud?: HTMLElement;
  private lobby?: HTMLElement;
  private waiting?: HTMLElement;
  private overlay?: HTMLElement;
  private portraits: Record<string, string> = {};
  private lastPhase = '';
  private lastWave = -1;
  private toastT = 0;
  private cardEls = new Map<TroopType, HTMLElement>();
  private controls?: Controls;
  private conn?: Connection;
  private snap?: Snapshot;
  private squadSig = '';
  private knownSquads = new Map<number, TroopType>();

  /* ---------- lobby ---------- */
  showLobby(h: LobbyHandlers, presetCode?: string) {
    this.lobby = el(`
      <div id="lobby"><div class="panel lobbycard">
        <h1 class="title">Burgwacht</h1>
        <p class="subtitle">Verteidigt gemeinsam eure Burg – Seite an Seite.</p>
        <div class="maps" id="maps">${Object.values(MAPS).map((m, i) => `<button class="mapcard${i === 0 ? ' on' : ''}" data-map="${m.id}"><div class="sw" style="background:${SWATCH[m.id]}"></div><b>${m.name}</b><span>${m.blurb}</span></button>`).join('')}</div>
        <div class="row"><button class="btn green" id="create">Neues Spiel starten</button></div>
        <p class="hint" style="margin:18px 0 8px">oder einem Raum beitreten</p>
        <div class="row"><input class="codeinput" id="code" maxlength="4" placeholder="ABCD" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" inputmode="text" enterkeyhint="go" />
          <button class="btn" id="join">Beitreten</button></div>
        <div class="err" id="err"></div>
      </div></div>`);
    this.root.appendChild(this.lobby);
    const err = $('#err', this.lobby), code = $<HTMLInputElement>('#code', this.lobby);
    if (presetCode) code.value = presetCode.replace(/[^A-Z]/gi, '').slice(0, 4).toUpperCase();
    code.oninput = () => { code.value = code.value.replace(/[^a-z]/gi, '').toUpperCase().slice(0, 4); };
    const wrap = (p: Promise<void>, btn: HTMLButtonElement) => {
      btn.disabled = true; err.textContent = '';
      p.catch(e => { err.textContent = reasonText(String(e.message ?? e)); btn.disabled = false; });
    };
    let mapId = Object.keys(MAPS)[0];
    $('#maps', this.lobby).onclick = ev => {
      const b = (ev.target as HTMLElement).closest<HTMLElement>('.mapcard'); if (!b) return;
      mapId = b.dataset.map!;
      this.lobby!.querySelectorAll('.mapcard').forEach(c => c.classList.toggle('on', c === b));
      h.preview(mapId);
    };
    $<HTMLButtonElement>('#create', this.lobby).onclick = ev => wrap(h.create(mapId), ev.currentTarget as HTMLButtonElement);
    $<HTMLButtonElement>('#join', this.lobby).onclick = ev => wrap(h.join(code.value.trim()), ev.currentTarget as HTMLButtonElement);
    mountInstall($('.lobbycard', this.lobby));
    code.onkeydown = ev => { if (ev.key === 'Enter') $<HTMLButtonElement>('#join', this.lobby!).click(); };
  }
  hideLobby() { this.lobby?.remove(); this.lobby = undefined; }

  /* ---------- waiting for partner ---------- */
  showWaiting(code: string) {
    const link = `${location.origin}${location.pathname}?room=${code}`;
    this.waiting = el(`
      <div class="overlay"><div class="panel">
        <h2>Warte auf deine Mitspielerin<span class="dots"></span></h2>
        <p class="hint">Schick ihr diesen Code oder den Link:</p>
        <div class="bigcode">${code}</div>
        <div class="row"><button class="btn" id="copy">Link kopieren</button></div>
      </div></div>`);
    this.root.appendChild(this.waiting);
    $<HTMLButtonElement>('#copy', this.waiting).onclick = async ev => {
      const b = ev.currentTarget as HTMLButtonElement;
      try { await navigator.clipboard.writeText(link); b.textContent = 'Kopiert!'; }
      catch { b.textContent = link; }
    };
  }
  hideWaiting() { this.waiting?.remove(); this.waiting = undefined; }


  /* ---------- HUD ---------- */
  buildHud(conn: Connection, controls: Controls) {
    this.controls = controls; this.conn = conn;
    const map = MAPS[conn.mapId] ?? MAPS.meadow;
    const tip = el(`<div class="panel tip" style="display:none"></div>`);
    document.body.appendChild(tip);
    this.hud = el(`
      <div id="hud">
        <div class="topbar">
          <div class="tl"><div class="pill castle">🏰<div class="bar"><i id="castleHp" style="width:100%"></i></div><span id="castleTxt"></span></div></div>
          <div class="center"><div class="pill"><span class="wave" id="waveTxt"></span></div>
            <div class="timer" id="timer"></div>
            <div class="zones" id="zones">${map.zones.map(z => `<div class="zone"><span class="zf">⚑</span><b>${z.name}</b><i class="zb"><u></u></i></div>`).join('')}</div>
            <div class="sub" id="phaseSub"></div>
            <div class="sub preview" id="preview"></div></div>
          <div class="players" id="players"></div>
        </div>
        <div class="toast" id="toast"></div>
        <div class="banner" id="banner"><h2></h2><p></p></div>
        <div class="hintbar" id="hint" style="display:none"></div>
        <div class="squads" id="squads"></div>
        <div class="panel wallp" id="wallp" style="display:none"></div>
        <div class="bottom">
          <div class="panel shop" id="shop"></div>
          <div class="panel orders" id="orders" style="display:none"></div>
          <div class="panel orders" id="side"></div>
        </div>
      </div>`);
    this.root.appendChild(this.hud);

    const shop = $('#shop', this.hud);
    TROOP_ORDER.forEach(t => {
      const d = TROOPS[t], n = SQUAD_SIZE[t];
      const c = el(`<button class="card"><span class="cnt">×${n}</span><img alt="${d.name}" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" />
        <div class="nm">${d.name}</div><div class="cost"><span class="coin"></span>${squadCost(t)}</div></button>`);
      c.onclick = () => {
        const active = controls.mode.k === 'buy' && controls.mode.troop === t;
        controls.setMode(active ? { k: 'select' } : { k: 'buy', troop: t });
      };
      c.onmouseenter = () => {
        const inf = INFO[t];
        tip.innerHTML = `<b>${d.name}-Trupp ×${n}</b><div>${inf.role}</div><div class="st">
          <span>Leben</span><span>${d.hp}</span><span>Schaden</span><span>${d.damage || '–'}</span>
          <span>Reichweite</span><span>${d.range}</span><span>Armee-Plätze</span><span>${n * SLOT_WEIGHT[t]}</span></div>
          <div class="good">Stark: ${inf.strong}</div><div class="bad">Schwach: ${inf.weak}</div>${canManWalls(t) ? '<div class="good">⛰ Kann auf die Mauerkrone</div>' : ''}`;
        tip.style.display = 'block';
        const r = c.getBoundingClientRect();
        tip.style.left = `${Math.min(innerWidth - 270, Math.max(8, r.left + r.width / 2 - 125))}px`;
        tip.style.top = `${r.top - tip.offsetHeight - 12}px`;
      };
      c.onmouseleave = () => { tip.style.display = 'none'; };
      shop.appendChild(c); this.cardEls.set(t, c);
    });

    void renderPortraits(conn.you, (t, url) => {
      this.portraits[t] = url;
      const im = this.cardEls.get(t)?.querySelector('img'); if (im) im.src = url;
      this.squadSig = ''; // chips pick the portrait up on the next update
    });

    const key = (k: string) => `<span class="key" style="position:static;display:inline-block;margin-left:4px">${k}</span>`;
    const orders = $('#orders', this.hud);
    orders.innerHTML = `
      <button class="ob" data-a="attack"><span class="ic">⚔️</span>Angriff${key('A')}</button>
      <button class="ob" data-a="hold"><span class="ic">🛡️</span>Halten${key('H')}</button>
      <button class="ob" data-a="retreat"><span class="ic">🏃</span>Rückzug${key('X')}</button>
      <div class="sep"></div>
      ${(['line', 'wedge', 'block'] as Formation[]).map((f, i) => `<button class="ob" data-f="${f}" title="${({ line: 'Feuerlinie: Fernkämpfer +15 % Schaden', wedge: 'Sturmkeil: Reiter-Angriff noch stärker', block: 'Schildwall: Nahkämpfer −15 % Schaden' } as Record<string, string>)[f]}"><span class="ic">${['▬', '▲', '▦'][i]}</span>${FORM[f]}${key(String(i + 1))}</button>`).join('')}
      <div class="sep touchonly"></div>
      <button class="ob touchonly" data-a="all"><span class="ic">👥</span>Alle</button>
      <button class="ob touchonly" data-a="none"><span class="ic">✖️</span>Abwählen</button>
      <div class="sep"></div>
      <button class="ob abil" data-ab="arrowRain"><span class="ic">🏹</span>Pfeilregen${key('Q')}<div class="cd"></div><div class="cdt"></div></button>
      <button class="ob abil" data-ab="rally"><span class="ic">📯</span>Anfeuern${key('E')}<div class="cd"></div><div class="cdt"></div></button>`;
    orders.onclick = ev => {
      const b = (ev.target as HTMLElement).closest('button'); if (!b) return;
      const ids = [...controls.selected];
      if (b.dataset.a === 'attack' && ids.length) controls.setMode({ k: 'attackMove' });
      else if (b.dataset.a === 'hold' && ids.length) conn.cmd({ c: 'hold', ids });
      else if (b.dataset.a === 'retreat' && ids.length) conn.cmd({ c: 'retreat', ids });
      else if (b.dataset.a === 'all') controls.selectAll();
      else if (b.dataset.a === 'none') controls.clearSelection();
      else if (b.dataset.f) { controls.formation = b.dataset.f as Formation; controls.onChange(); }
      else if (b.dataset.ab) controls.setMode({ k: 'ability', id: b.dataset.ab as AbilityId });
    };

    const side = $('#side', this.hud);
    side.innerHTML = `<button class="btn green ready" id="ready">Bereit!</button>`;
    $<HTMLButtonElement>('#ready', side).onclick = () => {
      const me = conn.latest()?.players[conn.you];
      if (me) conn.cmd({ c: 'ready', ready: !me.ready });
    };
    $('#squads', this.hud).onclick = ev => {
      const b = (ev.target as HTMLElement).closest<HTMLElement>('[data-sq]'); if (!b) return;
      const id = Number(b.dataset.sq);
      if ((ev.target as HTMLElement).closest('.fill')) { conn.cmd({ c: 'refill', squad: id }); return; }
      controls.selectSquad(id, true);
    };
    $('#wallp', this.hud).onclick = ev => {
      const b = (ev.target as HTMLElement).closest<HTMLElement>('[data-op]'); if (!b) return;
      if (b.dataset.op === 'close') { controls.wallSel = -1; controls.onChange(); return; }
      conn.cmd({ c: 'wall', op: b.dataset.op as 'upgrade' | 'repair' | 'rebuild', slot: controls.wallSel });
    };
    controls.onChange = () => this.refreshStatic(controls);
    this.refreshStatic(controls);
  }

  private refreshStatic(c: Controls) {
    if (!this.hud) return;
    for (const [t, el_] of this.cardEls) el_.classList.toggle('active', c.mode.k === 'buy' && c.mode.troop === t);
    this.hud.querySelectorAll<HTMLElement>('[data-f]').forEach(b => b.classList.toggle('active', b.dataset.f === c.formation));
    this.hud.querySelectorAll<HTMLElement>('[data-ab]').forEach(b => b.classList.toggle('active', c.mode.k === 'ability' && c.mode.id === b.dataset.ab));
    this.hud.querySelector('[data-a="attack"]')?.classList.toggle('active', c.mode.k === 'attackMove');
    const hint = $('#hint', this.hud);
    const tap = c.isTouch ? 'Tippe' : 'Klicke';
    const text = c.mode.k === 'buy'
      ? `${TROOPS[c.mode.troop].name}-Trupp: ${tap.toLowerCase()} ${canManWalls(c.mode.troop) ? 'auf die goldene Mauerkrone oder in den Hof' : 'in den Hof (nicht auf die Mauer)'} · ${c.isTouch ? 'Karte nochmal antippen = fertig' : 'Esc = fertig'}`
      : c.mode.k === 'attackMove' ? `${tap} auf das Ziel für den Angriffsmarsch`
        : c.mode.k === 'ability' ? `${tap} auf die Stelle für die Fähigkeit` : '';
    hint.style.display = text ? 'block' : 'none'; hint.textContent = text;
    this.squadSig = ''; // selection changed: redraw chips
    this.updateWallPanel();
    this.updateSquads();
  }

  private updateWallPanel() {
    if (!this.hud || !this.controls || !this.conn) return;
    const p = $('#wallp', this.hud), c = this.controls, slot = c.wallSel;
    const map = MAPS[this.conn.mapId] ?? MAPS.meadow, def = map.walls[slot];
    if (!def || !this.snap) { p.style.display = 'none'; return; }
    const st = c.fortress?.slotUnit(slot), gold = this.snap.players[this.conn.you].gold, prep = this.snap.phase === 'prep';
    const name = ({ wall: 'Mauer', gate: 'Tor', tower: 'Turm' })[def.kind] + (def.bar === 0 ? ' (außen)' : ' (innen)');
    const btn = (op: string, label: string, cost: number, ok: boolean) =>
      `<button class="ob wb" data-op="${op}" ${ok && cost <= gold ? '' : 'disabled'}><span class="ic">${op === 'upgrade' ? '⬆️' : op === 'repair' ? '🔧' : '🧱'}</span>${label}<span class="wc"><span class="coin"></span>${cost}</span></button>`;
    let body: string;
    if (st) {
      const lvl = st.level, up = lvl < MAX_WALL_LEVEL ? UPGRADE_COST[def.kind][lvl - 1] : 0;
      const missing = 1 - st.hp / st.maxHp, rep = Math.max(20, Math.round((REPAIR_COST[def.kind] * missing) / 5) * 5);
      body = `<div class="wh"><b>${name}</b><span class="stars">${'★'.repeat(lvl)}${'☆'.repeat(MAX_WALL_LEVEL - lvl)}</span></div>
        <div class="wbar"><i style="width:${Math.max(0, Math.min(100, (st.hp / st.maxHp) * 100))}%"></i><span>${Math.round(st.hp)} / ${Math.round(st.maxHp)}</span></div>
        <div class="wbtns">${lvl < MAX_WALL_LEVEL ? btn('upgrade', 'Verbessern', up, true) : '<span class="hint">Höchste Stufe</span>'}${missing > 0.005 ? btn('repair', 'Reparieren', rep, true) : ''}</div>`;
    } else {
      body = `<div class="wh"><b>${name}</b><span class="stars bad">zerstört</span></div>
        <div class="wbtns">${prep ? btn('rebuild', 'Wiederaufbauen', REBUILD_COST[def.kind], true) : '<span class="hint">Wiederaufbau in der Aufstellphase</span>'}</div>`;
    }
    p.innerHTML = `<button class="x" data-op="close">✕</button>${body}`;
    p.style.display = 'block';
  }

  /** chips for the player's squads: tap to select, "+" refills fallen men in preparation */
  private updateSquads() {
    if (!this.hud || !this.controls || !this.conn || !this.snap) return;
    const you = this.conn.you, c = this.controls;
    const groups = new Map<number, { type: TroopType; n: number; hp: number; max: number }>();
    for (const u of this.snap.units) {
      if (u.owner !== you || u.squad <= 0) continue;
      const g = groups.get(u.squad) ?? { type: u.type as TroopType, n: 0, hp: 0, max: 0 };
      g.n++; g.hp += u.hp; g.max += u.maxHp; groups.set(u.squad, g);
      this.knownSquads.set(u.squad, u.type as TroopType);
    }
    const prep = this.snap.phase === 'prep', gold = this.snap.players[you].gold;
    const rows = [...this.knownSquads].map(([id, type]) => {
      const g = groups.get(id), n = g?.n ?? 0, size = SQUAD_SIZE[type];
      const sel = c.selected.has([...this.snap!.units].find(u => u.squad === id)?.id ?? -1);
      return { id, type, n, size, f: g ? g.hp / g.max : 0, sel, cost: unitPrice(type) * (size - n) };
    });
    const sig = rows.map(r => `${r.id}:${r.n}:${r.sel ? 1 : 0}:${prep ? (r.cost <= gold ? 2 : 1) : 0}`).join('|');
    const box = $('#squads', this.hud);
    if (sig !== this.squadSig) {
      this.squadSig = sig;
      box.innerHTML = rows.map(r => `<button class="chip${r.sel ? ' sel' : ''}${r.n === 0 ? ' gone' : ''}" data-sq="${r.id}" title="${TROOPS[r.type].name}">
        <img alt="" src="${this.portraits[r.type] ?? ''}" /><span class="n">${r.n}/${r.size}</span><i class="hpb"><b style="width:${Math.round(r.f * 100)}%"></b></i>
        ${prep && r.n < r.size ? `<span class="fill${r.cost <= gold ? '' : ' poor'}" title="Auffüllen">＋${r.cost}</span>` : ''}</button>`).join('');
    } else {
      box.querySelectorAll<HTMLElement>('.chip').forEach((chip, i) => { const b = chip.querySelector<HTMLElement>('.hpb b'); if (b && rows[i]) b.style.width = `${Math.round(rows[i].f * 100)}%`; });
    }
  }

  toast(msg: string, err = false) {
    const t = $('#toast', this.hud!);
    t.textContent = msg; t.classList.toggle('err', err); t.classList.add('show');
    clearTimeout(this.toastT); this.toastT = window.setTimeout(() => t.classList.remove('show'), 2400);
  }

  banner(title: string, sub = '') {
    const b = $('#banner', this.hud!);
    $('h2', b).textContent = title; $('p', b).textContent = sub;
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  }

  /** gate / wall / zone events from the simulation */
  fortressBanner(t: string, map: MapDef) {
    if (!this.hud) return;
    const [kind, a, b] = t.split(':');
    if (kind === 'breach') {
      if (a === 'gate') this.banner('Das Tor ist gefallen!', 'Sie stürmen herein – haltet den Hof!');
      else this.toast(a === 'tower' ? 'Ein Turm ist gefallen!' : 'Mauer durchbrochen!', true);
    } else if (kind === 'zone') {
      const name = map.zones[Number(a)]?.name ?? 'Zone';
      if (b === 'enemy') this.banner(`${name} verloren!`, Number(a) >= map.zones.length - 1 ? 'Der König ist in Gefahr!' : 'Zieht euch zurück oder haltet die Linie!');
      else this.toast(`${name} zurückerobert! 🎉`);
    }
  }

  /* ---------- per-snapshot update ---------- */
  update(s: Snapshot, conn: Connection, controls: Controls) {
    if (!this.hud) return;
    this.snap = s;
    const you = conn.you;
    const waveName = WAVES[Math.min(s.wave, WAVES.length - 1)].name;
    $('#waveTxt', this.hud).textContent = `Welle ${Math.min(s.wave + 1, s.waveCount)} / ${s.waveCount}`;
    const timer = $('#timer', this.hud), sub = $('#phaseSub', this.hud);
    if (s.phase === 'prep') { timer.textContent = `${Math.max(0, Math.ceil(s.timer))}s`; sub.textContent = 'Aufstellphase'; }
    else if (s.phase === 'battle') { timer.textContent = ''; sub.textContent = `Kampf: ${waveName}`; }
    else { timer.textContent = ''; sub.textContent = ''; }

    const map = MAPS[conn.mapId] ?? MAPS.meadow;
    $('#preview', this.hud).textContent = s.phase === 'prep'
      ? 'Als Nächstes: ' + WAVES[Math.min(s.wave, WAVES.length - 1)].groups
        .map(g => `${Math.max(1, Math.round(g.count * map.waveScale * (0.8 + 0.055 * s.wave)))}× ${UNIT_DEFS[g.type].name}`).join(', ')
      : '';

    // capture points
    $('#zones', this.hud).querySelectorAll<HTMLElement>('.zone').forEach((z, i) => {
      const st = s.zones?.[i]; if (!st) return;
      z.classList.toggle('lost', st.o === 1);
      z.classList.toggle('contested', st.o === 0 && st.p > 0.02);
      ($('.zb u', z)).style.width = `${Math.round(st.p * 100)}%`;
    });

    const used = (p: PlayerId) => s.units.reduce((n, u) => n + (u.owner === p && u.type in SLOT_WEIGHT ? SLOT_WEIGHT[u.type as TroopType] : 0), 0);
    $('#players', this.hud).innerHTML = ([0, 1] as PlayerId[]).map(p => {
      const colors = ['#4a94d9', '#ee7f9b'];
      const st = s.players[p];
      return `<div class="pill pl"><span class="dot" style="background:${colors[p]}"></span>${p === you ? 'Du' : 'Partnerin'}
        <span class="coin"></span>${Math.floor(st.gold)}<span class="army" title="Armee-Plätze">👥${used(p)}/${MAX_ARMY}</span>${s.phase === 'prep' ? (st.ready ? ' <span class="ok">✔</span>' : '') : ''}</div>`;
    }).join('');

    const prep = s.phase === 'prep';
    $('#shop', this.hud).style.display = prep ? 'flex' : 'none';
    $('#orders', this.hud).style.display = s.phase === 'battle' ? 'flex' : 'none';
    const side = $('#side', this.hud);
    side.style.display = prep ? 'flex' : 'none';
    const me = s.players[you];
    const keep = s.units.find(u => u.type === 'castle');
    if (keep) {
      ($('#castleHp', this.hud)).style.width = `${Math.max(0, (keep.hp / keep.maxHp) * 100)}%`;
      $('#castleTxt', this.hud).textContent = String(Math.max(0, Math.ceil(keep.hp)));
    }
    const ready = $<HTMLButtonElement>('#ready', this.hud);
    ready.textContent = me.ready ? 'Warte auf Partnerin…' : controls.isTouch ? 'Bereit!' : 'Bereit! (Leertaste)';
    ready.classList.toggle('green', !me.ready); ready.classList.toggle('ghost', me.ready);
    for (const [t, c] of this.cardEls) c.classList.toggle('poor', squadCost(t) > me.gold || used(you) + SQUAD_SIZE[t] * SLOT_WEIGHT[t] > MAX_ARMY);

    this.hud.querySelectorAll<HTMLElement>('.abil').forEach(b => {
      const id = b.dataset.ab as AbilityId, cd = me.abilityCd[id];
      const max = id === 'arrowRain' ? 22 : 38;
      ($('.cd', b)).style.height = `${Math.min(100, (cd / max) * 100)}%`;
      ($('.cdt', b)).textContent = cd > 0 ? String(Math.ceil(cd)) : '';
    });

    // phase / wave announcements
    if (s.phase !== this.lastPhase || s.wave !== this.lastWave) {
      if (s.phase === 'battle') this.banner(`Welle ${s.wave + 1}`, waveName);
      else if (s.phase === 'prep' && this.lastPhase !== '') this.banner('Geschafft!', 'Repariert die Mauern, füllt die Trupps auf, kauft Verstärkung');
      else if (s.phase === 'prep') this.banner('Aufstellphase', 'Bogenschützen auf die Mauerkrone, Ritter ans Tor, Katapulte dahinter');
      if (s.phase === 'won') this.endScreen(true);
      if (s.phase === 'lost') this.endScreen(false);
      this.lastPhase = s.phase; this.lastWave = s.wave;
      this.refreshStatic(controls);
    }
    this.updateSquads();
    if (controls.wallSel >= 0) this.updateWallPanel();

    if ((s.paused || !conn.peerConnected) && s.phase !== 'won' && s.phase !== 'lost' && !this.waiting && !this.overlay) {
      this.overlay = el(`<div class="overlay"><div class="panel"><h2>Pause</h2><p class="hint">Es geht weiter, sobald ihr beide wieder im Spiel seid<span class="dots"></span></p>
        <div class="bigcode" style="font-size:44px">${conn.code}</div></div></div>`);
      this.root.appendChild(this.overlay);
    } else if (!s.paused && conn.peerConnected && this.overlay && this.lastPhase !== 'won' && this.lastPhase !== 'lost') {
      this.overlay.remove(); this.overlay = undefined;
    }
  }

  private endScreen(won: boolean) {
    this.overlay?.remove();
    this.overlay = el(`<div class="overlay"><div class="panel">
      <h2>${won ? 'Sieg! 🎉' : 'Die Burg ist gefallen 😢'}</h2>
      <p class="hint">${won ? 'Ihr habt alle Wellen gemeinsam überstanden.' : 'Beim nächsten Mal klappt es – baut die Mauern aus und füllt die Trupps zwischen den Wellen auf.'}</p>
      <div class="row"><button class="btn green" id="again">Nochmal spielen</button></div></div></div>`);
    this.root.appendChild(this.overlay);
    $<HTMLButtonElement>('#again', this.overlay).onclick = () => { location.href = location.pathname; };
  }
}
