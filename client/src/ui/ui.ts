import {
  BARRACKS, MAX_BARRACKS, MAX_TROOP_LEVEL, MAX_WALL_LEVEL, QUEUE_MAX, REBUILD_COST, REPAIR_COST, SLOT_WEIGHT, SQUAD_SIZE, STONE_LOT, STONE_PER_SHOT,
  TECH, TECH_COST, TROOP_ORDER, groupCount, TROOPS, UNIT_DEFS, UPGRADE_COST, WAVES, waveAt, armyCap, canManWalls, gemReward, squadCost, stoneLotCost, stoneReward,
  unitPrice, waveReward,
  type AbilityId, type Formation, type MapDef, type PlayerId, type Snapshot, type TroopType,
} from '@burgwacht/shared';
import type { Controls } from '../input/controls';
import type { Connection } from '../net/connection';
import { renderPortraits } from '../render/portraits';
import { MAPS } from '@burgwacht/shared';
import { mountInstall } from '../pwa';
const REASONS: Record<string, string> = {
  not_enough_gold: 'Nicht genug Gold', not_enough_gems: 'Nicht genug Edelsteine 💎 – es gibt nur wenige pro Welle', need_branch: 'Wähle erst einen Zweig', outside_zone: 'Hier darfst du nicht aufstellen – nimm die helle Fläche oder die goldene Mauerkrone', army_full: 'Armee voll – baut die Kaserne aus für mehr Plätze', squad_full: 'Der Trupp ist schon vollzählig', max_level: 'Höchste Stufe erreicht',
  not_prep: 'Gerade nicht möglich', queue_full: 'Die Kaserne hat schon genug Aufträge – gleich nochmal', not_battle: 'Nur im Kampf', cooldown: 'Das lädt noch – gleich nochmal versuchen',
  bad_command: 'Das geht so nicht', room_full: 'Der Raum ist schon voll', room_not_found: 'Diesen Raum gibt es nicht',
  connection_failed: 'Keine Verbindung zum Server', too_many_rooms: 'Zu viele neue Spiele in kurzer Zeit – kurz warten', server_full: 'Der Server ist gerade voll – versucht es gleich nochmal', bad_message: 'Das hat nicht geklappt',
};
export const reasonText = (r: string) => REASONS[r] ?? r;

const INFO: Record<TroopType, { role: string; strong: string; weak: string }> = {
  knight: { role: 'Der Fels der Truppe: zieht mit Spott die Gegner auf sich (Nahkämpfer greifen lieber ihn an). Im Block −15 % Schaden.', strong: 'Fußvolk, Pfeile', weak: 'Magie, Armbrust' },
  archer: { role: 'Reichweite 17, hält Abstand zu Nahkämpfern und schießt auf Schwache zuerst. Auf der Mauerkrone +20 % Reichweite und Deckung.', strong: 'Leichte Ziele, Magier, Heiler', weak: 'Schwere Rüstung, Reiter' },
  spearman: { role: 'Hält er die Stellung, prallen Reiter fast wirkungslos ab. Sucht sich Reiter als Ziel.', strong: 'Reiter (doppelt)', weak: 'Schwere Rüstung' },
  cavalry: { role: 'Schwingt aus der Flanke aus und stürzt sich auf Bogenschützen und Magier: Sturmangriff aus dem Anlauf.', strong: 'Fernkämpfer, Leichte', weak: 'Speerwall, Eisenwachen' },
  crossbowman: { role: 'Durchschlägt Rüstung – der Konter gegen Eisenwachen. Stark auf der Mauer.', strong: 'Schwere Rüstung', weak: 'Belagerung, Nahkampf' },
  mage: { role: 'Flächenzauber auf die dichteste Gruppe, bricht dicke Rüstung. Braucht Schutz.', strong: 'Gruppen, Schwere', weak: 'Reiter' },
  healer: { role: 'Heilt zuerst den am stärksten Verwundeten in Reichweite, Umstehende ein bisschen mit. Hinter die Frontlinie!', strong: 'Hält den Trupp am Leben', weak: 'Alles – gut beschützen' },
  catapult: { role: 'Wirft Steine (3 pro Schuss) mit Flächenschaden auf die dichteste Gruppe, Reichweite 34. Trifft nichts, was näher als 12 ist.', strong: 'Gruppen, Rammen, Katapulte', weak: 'Schnelle Truppen, Nahkampf' },
};
const FORM: Record<Formation, string> = { line: 'Linie', wedge: 'Keil', block: 'Block' };

const $ = <T extends HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
const el = (html: string) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild as HTMLElement; };

export interface LobbyHandlers { create(mapId: string, endless: boolean): Promise<void>; join(code: string): Promise<void>; preview(mapId: string): void }

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
  /** in battle the bottom bar shows either the orders or the barracks shop */
  private battleTab: 'orders' | 'train' = 'orders';
  private knownSquads = new Map<number, TroopType>();

  /* ---------- lobby ---------- */
  showLobby(h: LobbyHandlers, presetCode?: string) {
    this.lobby = el(`
      <div id="lobby"><div class="panel lobbycard">
        <h1 class="title">Burgwacht</h1>
        <p class="subtitle">Verteidigt gemeinsam eure Burg – Seite an Seite.</p>
        <div class="seg" id="modes"><button class="on" data-mode="campaign">Kampagne (25 Wellen)</button><button data-mode="endless">Endlos</button></div>
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
    let mapId = Object.keys(MAPS)[0], endless = false;
    const modes = $('#modes', this.lobby);
    modes.onclick = ev => {
      const b = (ev.target as HTMLElement).closest<HTMLElement>('button'); if (!b) return;
      endless = b.dataset.mode === 'endless';
      modes.querySelectorAll('button').forEach(c => c.classList.toggle('on', c === b));
    };
    $('#maps', this.lobby).onclick = ev => {
      const b = (ev.target as HTMLElement).closest<HTMLElement>('.mapcard'); if (!b) return;
      mapId = b.dataset.map!;
      this.lobby!.querySelectorAll('.mapcard').forEach(c => c.classList.toggle('on', c === b));
      h.preview(mapId);
    };
    $<HTMLButtonElement>('#create', this.lobby).onclick = ev => wrap(h.create(mapId, endless), ev.currentTarget as HTMLButtonElement);
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
          <div class="tl"><div class="pill castle">🏰<div class="bar"><i id="castleHp" style="width:100%"></i></div><span id="castleTxt"></span></div>
            <div class="pill queue" id="queue" style="display:none"></div></div>
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
        <div class="rightcol" id="rightcol"><div class="panel wallp" id="wallp" style="display:none"></div></div>
        <div class="panel sheet" id="sheet" style="display:none"></div>
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
      const canHover = matchMedia('(hover: hover)').matches; // iOS answers the first tap with a hover instead of a click when a hover handler changes the page
      if (canHover) c.onmouseenter = () => {
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
      if (canHover) c.onmouseleave = () => { tip.style.display = 'none'; };
      shop.appendChild(c); this.cardEls.set(t, c);
    });

    const util = (id: string, ico: string, nm: string, extra = '') => {
      const c = el(`<button class="card util" data-u="${id}"><span class="cnt" data-x></span><div class="ico">${ico}</div><div class="nm">${nm}</div><div class="cost" data-c>${extra}</div></button>`);
      shop.appendChild(c); return c;
    };
    util('stone', '🪨', 'Stein');
    util('barracks', '🏰', 'Kaserne');
    util('tech', '⚒️', 'Ausbau');
    shop.onclick = ev => {
      const u = (ev.target as HTMLElement).closest<HTMLElement>('[data-u]'); if (!u) return;
      if (u.dataset.u === 'stone') conn.cmd({ c: 'trade', lots: 1 });
      else if (u.dataset.u === 'barracks') conn.cmd({ c: 'barracks' });
      else if (u.dataset.u === 'tech') this.toggleSheet();
    };

    void renderPortraits(conn.you, (t, url) => {
      this.portraits[t] = url;
      const im = this.cardEls.get(t)?.querySelector('img'); if (im) im.src = url;
      this.squadSig = ''; // chips pick the portrait up on the next update
    });

    const key = (k: string) => `<kbd>${k}</kbd>`;
    const orders = $('#orders', this.hud);
    const fTip: Record<string, string> = { line: 'Feuerlinie: Fernkämpfer +15 % Schaden', wedge: 'Sturmkeil: Reiter-Angriff noch stärker', block: 'Schildwall: Nahkämpfer −15 % Schaden' };
    orders.innerHTML = `
      <div class="dsel" id="dsel"></div>
      <div class="dgrp dcmds">
        <button class="cmd" data-a="attack" title="Greift den nächsten Gegner an – ohne Ziel antippen"><i>⚔️</i><span>Angriff</span>${key('A')}</button>
        <button class="cmd" data-a="hold" title="Bleibt dauerhaft stehen und rückt nicht nach"><i>🛡️</i><span>Halten</span>${key('H')}</button>
        <button class="cmd" data-a="retreat"><i>🏃</i><span>Rückzug</span>${key('X')}</button>
      </div>
      <div class="dgrp dform"><span class="dl">Formation</span><div class="seg">
        ${(['line', 'wedge', 'block'] as Formation[]).map((f, i) => `<button data-f="${f}" title="${fTip[f]}"><i>${['▬', '▲', '▦'][i]}</i><span>${FORM[f]}</span></button>`).join('')}
      </div></div>
      <div class="dgrp dabil">
        <button class="abil" data-ab="arrowRain" title="Pfeilregen: Schaden in einem Bereich"><i>🏹</i><span>Pfeilregen</span>${key('Q')}<b class="cdt"></b></button>
        <button class="abil" data-ab="rally" title="Anfeuern: heilt und beruhigt Truppen"><i>📯</i><span>Anfeuern</span>${key('E')}<b class="cdt"></b></button>
      </div>`;
    orders.onclick = ev => {
      const b = (ev.target as HTMLElement).closest('button'); if (!b) return;
      const ids = [...controls.selected];
      if (b.dataset.a === 'attack' && ids.length) controls.attackNow();
      else if (b.dataset.a === 'hold' && ids.length) conn.cmd({ c: 'hold', ids });
      else if (b.dataset.a === 'retreat' && ids.length) conn.cmd({ c: 'retreat', ids });
      else if (b.dataset.a === 'all') controls.selectAll();
      else if (b.dataset.a === 'none') controls.clearSelection();
      else if (b.dataset.f) { controls.formation = b.dataset.f as Formation; controls.onChange(); }
      else if (b.dataset.ab) controls.setMode({ k: 'ability', id: b.dataset.ab as AbilityId });
    };

    const side = $('#side', this.hud);
    side.innerHTML = `<button class="btn green ready" id="ready">Bereit!</button><button class="btn ghost ready" id="tabtog" style="display:none">🏰 Ausbilden</button>`;
    $<HTMLButtonElement>('#tabtog', side).onclick = () => { this.battleTab = this.battleTab === 'orders' ? 'train' : 'orders'; if (this.battleTab === 'orders' && controls.mode.k === 'buy') controls.cancel(); this.applyTabs(); };
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
    $('#sheet', this.hud).onclick = ev => {
      const b = (ev.target as HTMLElement).closest<HTMLElement>('[data-sh]'); if (!b) return;
      const [what, troop, branch] = b.dataset.sh!.split(':');
      if (what === 'close') this.toggleSheet(false);
      else if (what === 'barracks') conn.cmd({ c: 'barracks' });
      else if (what === 'tech') conn.cmd({ c: 'tech', troop: troop as TroopType, branch: branch ? Number(branch) : undefined });
    };
    controls.onChange = () => this.refreshStatic(controls);
    this.refreshStatic(controls);
  }

  private sheetOpen = false;
  private sheetSig = '';
  private toggleSheet(open = !this.sheetOpen) {
    this.sheetOpen = open;
    const sh = $('#sheet', this.hud!);
    sh.style.display = open ? 'block' : 'none';
    this.sheetSig = '';
    if (open && this.snap) this.renderSheet(this.snap.players[this.conn!.you]);
  }

  /** the upgrade sheet: barracks level and, per troop type, level 2 (branch choice) and level 3 – paid with gold and gems */
  private renderSheet(me: Snapshot['players'][number]) {
    const sig = JSON.stringify([me.gold > 99999 ? 0 : Math.floor(me.gold / 10), me.gems, me.barracks, me.tech]);
    if (sig === this.sheetSig) return;
    this.sheetSig = sig;
    const sh = $('#sheet', this.hud!);
    const cost = (c: { gold: number; gems: number }) => `<span class="coin"></span>${c.gold}${c.gems ? ` 💎${c.gems}` : ''}`;
    const can = (c: { gold: number; gems: number }) => c.gold <= me.gold && c.gems <= me.gems;
    const nextB = me.barracks < MAX_BARRACKS ? BARRACKS[me.barracks] : undefined;
    const rows = TROOP_ORDER.map(t => {
      const tc = me.tech[t], d = TROOPS[t], br = TECH[t];
      const stars = '★'.repeat(tc.level) + '☆'.repeat(MAX_TROOP_LEVEL - tc.level);
      let act: string;
      if (tc.level === 1) act = br.map((b, i) => `<button class="tb" data-sh="tech:${t}:${i + 1}" ${can(TECH_COST[0]) ? '' : 'disabled'} title="${b.blurb}"><b>${b.name}</b><span class="bl">${b.blurb}</span><span class="wc">${cost(TECH_COST[0])}</span></button>`).join('');
      else if (tc.level < MAX_TROOP_LEVEL) act = `<div class="tbcur"><b>${br[tc.branch - 1].name}</b><span class="bl">${br[tc.branch - 1].blurb}</span></div><button class="tb" data-sh="tech:${t}" ${can(TECH_COST[1]) ? '' : 'disabled'}><b>Stufe 3</b><span class="bl">Zweig verstärkt, mehr Leben und Schaden</span><span class="wc">${cost(TECH_COST[1])}</span></button>`;
      else act = `<div class="tbcur max"><b>${br[tc.branch - 1].name} – Stufe 3</b><span class="bl">${br[tc.branch - 1].blurb}</span></div>`;
      return `<div class="trow"><div class="th"><img alt="" src="${this.portraits[t] ?? ''}" /><b>${d.name}</b><span class="stars">${stars}</span></div><div class="tacts">${act}</div></div>`;
    }).join('');
    sh.innerHTML = `<button class="x" data-sh="close" aria-label="Schließen">✕</button>
      <h3>Ausbau <span class="sub">Edelsteine 💎 ${me.gems} · Gold ${Math.floor(me.gold)}</span></h3>
      <div class="trow"><div class="th"><b>🏰 Kaserne</b><span class="stars">Stufe ${me.barracks}/${MAX_BARRACKS}</span></div><div class="tacts">
        <div class="tbcur"><b>${BARRACKS[me.barracks - 1].cap} Plätze · Ausbildung ×${BARRACKS[me.barracks - 1].speed}</b></div>
        ${nextB ? `<button class="tb" data-sh="barracks" ${can(nextB) ? '' : 'disabled'}><b>Stufe ${me.barracks + 1}</b><span class="bl">${nextB.cap} Plätze · Ausbildung ×${nextB.speed}</span><span class="wc">${cost(nextB)}</span></button>` : '<div class="tbcur max"><b>Höchste Stufe</b></div>'}
      </div></div>${rows}`;
  }

  private updateUtilCards(me: Snapshot['players'][number]) {
    const shop = $('#shop', this.hud!);
    const set = (id: string, cnt: string, cost: string, poor: boolean) => {
      const c = shop.querySelector<HTMLElement>(`[data-u="${id}"]`); if (!c) return;
      $('[data-x]', c).textContent = cnt; $('[data-c]', c).innerHTML = cost; c.classList.toggle('poor', poor);
    };
    set('stone', `+${STONE_LOT}`, `<span class="coin"></span>${stoneLotCost()}`, me.gold < stoneLotCost());
    const nb = me.barracks < MAX_BARRACKS ? BARRACKS[me.barracks] : undefined;
    set('barracks', `Stf ${me.barracks}`, nb ? `<span class="coin"></span>${nb.gold}${nb.gems ? ` 💎${nb.gems}` : ''}` : 'max', !nb || nb.gold > me.gold || nb.gems > me.gems);
    set('tech', `💎${me.gems}`, 'Stufen', false);
  }

  /** the barracks queue of the player: what is being trained and how long it takes */
  private renderQueue(s: Snapshot, you: PlayerId) {
    const q = s.players[you].queue ?? [], box = $('#queue', this.hud!);
    const levy = s.zones.some(z => (z.h ?? 0) > 0), speed = BARRACKS[s.players[you].barracks - 1]?.speed ?? 1;
    box.style.display = q.length ? 'flex' : 'none';
    box.innerHTML = q.length ? '🏰 ' + q.map((it, i) => `<span class="qi${i === 0 ? ' now' : ''}">${TROOPS[it.troop].name}${it.squad ? ' +' + it.count : ''} ${Math.ceil(i === 0 ? it.t / (speed * (levy ? 2.5 : 1)) : it.t / speed)}s</span>`).join('') + (levy ? '<span class="qi levy">Notaufgebot!</span>' : '') : '';
  }

  /** which bottom panels are visible for the current phase / tab */
  private applyTabs(s: Snapshot | undefined = this.snap) {
    if (!this.hud || !s) return;
    const prep = s.phase === 'prep', battle = s.phase === 'battle';
    $('#shop', this.hud).style.display = prep || (battle && this.battleTab === 'train') ? 'flex' : 'none';
    $('#orders', this.hud).style.display = battle && this.battleTab === 'orders' ? 'flex' : 'none';
    $('#side', this.hud).style.display = prep || battle ? 'flex' : 'none';
    $('#ready', this.hud).style.display = prep ? '' : 'none';
    const tog = $('#tabtog', this.hud);
    tog.style.display = battle ? '' : 'none';
    tog.textContent = this.battleTab === 'orders' ? '🏰 Ausbilden' : '⚔️ Befehle';
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
      ? `${TROOPS[c.mode.troop].name}-Trupp: ${tap.toLowerCase()} ${canManWalls(c.mode.troop) ? 'auf die goldene Mauerkrone oder in den Hof' : 'in den Hof (nicht auf die Mauer)'}${this.snap?.phase === 'battle' ? ' – er wird in der Kaserne ausgebildet und marschiert dorthin' : ''} · ${c.isTouch ? 'Karte nochmal antippen = fertig' : 'Esc = fertig'}`
      : c.mode.k === 'ability' ? `${tap} auf die Stelle für die Fähigkeit` : '';
    hint.style.display = text ? 'block' : 'none'; hint.textContent = text;
    this.squadSig = ''; // selection changed: redraw chips
    this.updateWallPanel();
    this.updateSquads();
    this.updateDeck();
  }

  /** the card on the left of the command bar: what is selected right now */
  private updateDeck() {
    if (!this.hud || !this.controls || !this.snap) return;
    const c = this.controls, box = $('#dsel', this.hud), orders = $('#orders', this.hud);
    const us = this.snap.units.filter(u => c.selected.has(u.id));
    orders.classList.toggle('nosel', us.length === 0);
    const tools = '<span class="dtools"><button data-a="all" title="Alle Trupps wählen">👥</button><button data-a="none" title="Auswahl aufheben">✖</button></span>';
    if (!us.length) { box.innerHTML = '<span class="dtx"><span class="dh">Nichts gewählt</span><span class="dsub">' + (c.isTouch ? 'Tippe einen Trupp an' : 'Klick auf einen Trupp') + ' – oder zieh einen Rahmen</span></span>' + tools; return; }
    const by = new Map<string, number>(); us.forEach(u => by.set(u.type, (by.get(u.type) ?? 0) + 1));
    const squads = new Set(us.map(u => u.squad)).size, hp = us.reduce((a, u) => a + u.hp, 0) / us.reduce((a, u) => a + u.maxHp, 0);
    const first = [...by.keys()][0] as TroopType;
    const title = by.size === 1 ? `${UNIT_DEFS[first].name}` : `${squads} Trupps`;
    let sub = [...by].map(([t, n]) => `${n}× ${UNIT_DEFS[t as TroopType].name}`).join(' · ');
    if (by.has('catapult')) { const sh = Math.floor(this.snap.players[this.conn!.you].stone / STONE_PER_SHOT); sub = `Munition: ${sh} Schuss (${STONE_PER_SHOT} Stein je Schuss)${sh ? '' : ' – leer!'}`; }
    box.innerHTML = `<img alt="" src="${this.portraits[first] ?? ''}" /><div class="dtx"><span class="dh">${title}</span><span class="dsub">${by.size > 1 || by.has('catapult') ? sub : us.length + ' Mann'}</span><i class="hpb"><b style="width:${Math.round(hp * 100)}%"></b></i></div>${tools}`;
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
    const prep = this.snap.phase === 'prep' || this.snap.phase === 'battle', gold = this.snap.players[you].gold;
    const queue = this.snap.players[you].queue ?? [];
    const rows = [...this.knownSquads].map(([id, type]) => {
      const g = groups.get(id), size = SQUAD_SIZE[type];
      const waiting = queue.reduce((a, it) => a + (it.squad === id ? it.count : 0), 0), n = (g?.n ?? 0) + waiting;
      const sel = c.selected.has([...this.snap!.units].find(u => u.squad === id)?.id ?? -1);
      return { id, type, n, size, f: g ? g.hp / g.max : 0, sel, waiting, cost: unitPrice(type) * (size - n) };
    });
    const ammo = Math.floor(this.snap.players[you].stone / STONE_PER_SHOT);
    const sig = rows.map(r => `${ammo}:${r.id}:${r.n}:${r.waiting}:${r.sel ? 1 : 0}:${prep ? (r.cost <= gold ? 2 : 1) : 0}`).join('|');
    const box = $('#squads', this.hud);
    if (sig !== this.squadSig) {
      this.squadSig = sig;
      box.innerHTML = rows.map(r => `<button class="chip${r.sel ? ' on' : ''}${r.n === 0 ? ' gone' : ''}" data-sq="${r.id}" title="${TROOPS[r.type].name}">
        <img alt="" src="${this.portraits[r.type] ?? ''}" /><span class="n">${r.n - r.waiting}${r.waiting ? `+${r.waiting}` : ''}/${r.size}</span>${r.type === 'catapult' ? `<span class="ammo${ammo ? '' : ' empty'}" title="Munition">🪨${ammo}</span>` : ''}<i class="hpb"><b style="width:${Math.round(r.f * 100)}%"></b></i>
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
    if (kind === 'dry') { if (Number(a) === this.conn?.you) this.toast('Kein Stein mehr – das Katapult schweigt! Tausche Gold gegen Stein (Ausbilden → Stein).', true); return; }
    if (kind === 'breach') {
      if (a === 'gate') this.banner('Das Tor ist gefallen!', 'Sie stürmen herein – haltet den Hof!');
      else this.toast(a === 'tower' ? 'Ein Turm ist gefallen!' : 'Mauer durchbrochen!', true);
    } else if (kind === 'zone') {
      const name = map.zones[Number(a)]?.name ?? 'Zone';
      if (b === 'enemy') this.banner(`${name} verloren!`, Number(a) >= map.zones.length - 1 ? 'Der König ist in Gefahr!' : 'Sie sammeln sich – bildet jetzt Verstärkung aus (Notaufgebot)!');
      else this.toast(`${name} zurückerobert! 🎉`);
    }
  }

  /* ---------- per-snapshot update ---------- */
  update(s: Snapshot, conn: Connection, controls: Controls) {
    if (!this.hud) return;
    this.snap = s;
    const you = conn.you;
    const waveName = waveAt(s.wave).name;
    $('#waveTxt', this.hud).textContent = s.waveCount ? `Welle ${Math.min(s.wave + 1, s.waveCount)} / ${s.waveCount}` : `Welle ${s.wave + 1} · Endlos`;
    const timer = $('#timer', this.hud), sub = $('#phaseSub', this.hud);
    if (s.phase === 'prep') { timer.textContent = `${Math.max(0, Math.ceil(s.timer))}s`; sub.textContent = 'Aufstellphase'; }
    else if (s.phase === 'battle') { timer.textContent = ''; sub.textContent = `Kampf: ${waveName}`; }
    else { timer.textContent = ''; sub.textContent = ''; }

    const map = MAPS[conn.mapId] ?? MAPS.meadow;
    $('#preview', this.hud).textContent = s.phase === 'prep'
      ? 'Als Nächstes: ' + waveAt(s.wave).groups
        .map(g => `${groupCount(map.waveScale, s.wave, g)}× ${UNIT_DEFS[g.type].name}`).join(', ')
      : '';

    // capture points
    $('#zones', this.hud).querySelectorAll<HTMLElement>('.zone').forEach((z, i) => {
      const st = s.zones?.[i]; if (!st) return;
      z.classList.toggle('lost', st.o === 1);
      z.classList.toggle('contested', st.o === 0 && st.p > 0.02);
      z.classList.toggle('besieged', (st.h ?? 0) > 0);
      ($('.zb u', z)).style.width = `${Math.round(st.p * 100)}%`;
    });

    const used = (p: PlayerId) => s.units.reduce((n, u) => n + (u.owner === p && u.type in SLOT_WEIGHT ? SLOT_WEIGHT[u.type as TroopType] : 0), 0);
    $('#players', this.hud).innerHTML = ([0, 1] as PlayerId[]).map(p => {
      const colors = ['#4a94d9', '#ee7f9b'];
      const st = s.players[p];
      return `<div class="pill pl"><span class="dot" style="background:${colors[p]}"></span>${p === you ? 'Du' : 'Partnerin'}
        <span class="res" title="Gold"><span class="coin"></span>${Math.floor(st.gold)}</span><span class="res" title="Stein (Katapult-Munition)">🪨${Math.floor(st.stone)}</span><span class="res gem" title="Edelsteine">💎${st.gems}</span><span class="army" title="Armee-Plätze">👥${used(p)}/${armyCap(st.barracks)}</span>${s.phase === 'prep' ? (st.ready ? ' <span class="ok">✔</span>' : '') : ''}</div>`;
    }).join('');

    const prep = s.phase === 'prep';
    this.renderQueue(s, you);
    if (s.phase !== this.lastPhase) this.battleTab = 'orders';
    this.applyTabs(s);
    const me = s.players[you];
    const keep = s.units.find(u => u.type === 'castle');
    if (keep) {
      ($('#castleHp', this.hud)).style.width = `${Math.max(0, (keep.hp / keep.maxHp) * 100)}%`;
      $('#castleTxt', this.hud).textContent = String(Math.max(0, Math.ceil(keep.hp)));
    }
    const ready = $<HTMLButtonElement>('#ready', this.hud);
    ready.textContent = me.ready ? 'Warte auf Partnerin…' : controls.isTouch ? 'Bereit!' : 'Bereit! (Leertaste)';
    ready.classList.toggle('green', !me.ready); ready.classList.toggle('ghost', me.ready);
    const queued = me.queue.reduce((n, it) => n + it.count * SLOT_WEIGHT[it.troop], 0);
    for (const [t, c] of this.cardEls) c.classList.toggle('poor', squadCost(t) > me.gold || used(you) + queued + SQUAD_SIZE[t] * SLOT_WEIGHT[t] > armyCap(me.barracks));
    this.updateUtilCards(me);
    if (this.sheetOpen) this.renderSheet(me);

    this.hud.querySelectorAll<HTMLElement>('.abil').forEach(b => {
      const id = b.dataset.ab as AbilityId, cd = me.abilityCd[id];
      const max = id === 'arrowRain' ? 22 : 38;
      b.style.setProperty('--p', `${Math.min(100, (cd / max) * 100)}%`);
      b.classList.toggle('cool', cd > 0);
      ($('.cdt', b)).textContent = cd > 0 ? String(Math.ceil(cd)) : '';
    });

    // phase / wave announcements
    if (s.phase !== this.lastPhase || s.wave !== this.lastWave) {
      if (s.phase === 'battle') this.banner(`Welle ${s.wave + 1}`, waveName);
      else if (s.phase === 'prep' && this.lastPhase !== '') this.banner('Geschafft!', `+${waveReward(s.wave - 1)} Gold · +${stoneReward(s.wave - 1)} Stein · +${gemReward(s.wave - 1, s.waveCount || 9999)} 💎 – repariert, füllt auf, baut aus`);
      else if (s.phase === 'prep') this.banner('Aufstellphase', 'Bogenschützen auf die Mauerkrone, Ritter ans Tor, Katapulte dahinter');
      if (s.phase === 'won') this.endScreen(true);
      if (s.phase === 'lost') this.endScreen(false);
      this.lastPhase = s.phase; this.lastWave = s.wave;
      this.refreshStatic(controls);
    }
    this.updateSquads();
    this.updateDeck();
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
