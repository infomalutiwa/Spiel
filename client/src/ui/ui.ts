import {
  TROOP_ORDER, TROOPS, UNIT_DEFS, WAVES, type AbilityId, type Formation, type PlayerId, type Snapshot, type TroopType,
} from '@burgwacht/shared';
import type { Controls } from '../input/controls';
import type { Connection } from '../net/connection';
import { renderPortraits } from '../render/portraits';
import { MAPS } from '@burgwacht/shared';
import { mountInstall } from '../pwa';
const REASONS: Record<string, string> = {
  not_enough_gold: 'Nicht genug Gold', outside_zone: 'Hier darfst du nicht aufstellen – nimm die helle Fläche',
  not_prep: 'Nur in der Aufstellphase', not_battle: 'Nur im Kampf', cooldown: 'Fähigkeit lädt noch',
  bad_command: 'Das geht so nicht', room_full: 'Der Raum ist schon voll', room_not_found: 'Diesen Raum gibt es nicht',
  connection_failed: 'Keine Verbindung zum Server', too_many_rooms: 'Zu viele neue Spiele in kurzer Zeit – kurz warten', server_full: 'Der Server ist gerade voll – versucht es gleich nochmal', bad_message: 'Das hat nicht geklappt',
};
export const reasonText = (r: string) => REASONS[r] ?? r;

const INFO: Record<TroopType, { role: string; strong: string; weak: string }> = {
  knight: { role: 'Robust im Nahkampf – hält die Linie. Im Block (3) nimmt er 15 % weniger Schaden.', strong: 'Fußvolk, Bogen', weak: 'Magie, Armbrust' },
  archer: { role: 'Weite Reichweite; weicht beim Nachladen zurück, wenn Nahkämpfer nahen. In der Linie (1) +15 % Schaden.', strong: 'Leichte Ziele, Magier, Heiler', weak: 'Schwere Rüstung, Reiter' },
  spearman: { role: 'Hält er die Stellung (H), prallen Reiter fast wirkungslos ab – Speerwall.', strong: 'Reiter (doppelt)', weak: 'Schwere Rüstung' },
  cavalry: { role: 'Sturmangriff aus dem Anlauf: über 2× Schaden, im Keil (2) noch mehr. Jagt Bogenschützen, Magier und Heiler.', strong: 'Fernkämpfer, Leichte', weak: 'Speerwall, Eisenwachen' },
  crossbowman: { role: 'Langsam, aber durchschlägt Rüstung – der Konter gegen Eisenwachen.', strong: 'Schwere Rüstung', weak: 'Belagerung, Nahkampf' },
  mage: { role: 'Flächenschaden, bricht dicke Rüstung. Braucht Schutz.', strong: 'Gruppen, Schwere', weak: 'Reiter' },
  healer: { role: 'Heilt Verbündete in der Nähe.', strong: 'Hält die Armee am Leben', weak: 'Alles – gut beschützen' },
  catapult: { role: 'Riesige Reichweite, zerstört Belagerungsgerät.', strong: 'Rammen, Katapulte', weak: 'Schnelle Truppen' },
};
const FORM: Record<Formation, string> = { line: 'Linie', wedge: 'Keil', block: 'Block' };

/** where a wave group comes from, as a compass direction relative to the castle */
function compass(map: (typeof MAPS)[string], lane: number): string {
  const sp = map.spawns[lane % map.spawns.length];
  const dx = sp.x - map.castle.x, dy = sp.y - map.castle.y;
  const ns = Math.abs(dy) > Math.abs(dx) * 0.45 ? (dy < 0 ? 'Nord' : 'Süd') : '', ew = Math.abs(dx) > Math.abs(dy) * 0.45 ? (dx < 0 ? 'west' : 'ost') : '';
  return ns && ew ? `${ns}${ew}en` : ns ? `${ns}en` : `${ew[0].toUpperCase()}${ew.slice(1)}en`;
}

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
    const tip = el(`<div class="panel tip" style="display:none"></div>`);
    document.body.appendChild(tip);
    this.hud = el(`
      <div id="hud">
        <div class="topbar">
          <div class="pill castle">🏰<div class="bar"><i id="castleHp" style="width:100%"></i></div><span id="castleTxt"></span></div>
          <div class="center"><div class="pill"><span class="wave" id="waveTxt"></span></div>
            <div class="timer" id="timer"></div><div class="sub" id="phaseSub"></div>
            <div class="sub preview" id="preview"></div></div>
          <div class="players" id="players"></div>
        </div>
        <div class="toast" id="toast"></div>
        <div class="banner" id="banner"><h2></h2><p></p></div>
        <div class="hintbar" id="hint" style="display:none"></div>
        <div class="panel sel" id="sel"></div>
        <div class="bottom">
          <div class="panel shop" id="shop"></div>
          <div class="panel orders" id="orders" style="display:none"></div>
          <div class="panel orders" id="side"></div>
        </div>
      </div>`);
    this.root.appendChild(this.hud);

    const shop = $('#shop', this.hud);
    TROOP_ORDER.forEach((t, i) => {
      const d = TROOPS[t];
      const c = el(`<button class="card"><kbd>${i + 1 > 3 ? '' : ''}</kbd><img alt="${d.name}" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" />
        <div class="nm">${d.name}</div><div class="cost"><span class="coin"></span>${d.cost}</div></button>`);
      c.querySelector('kbd')?.remove();
      c.onclick = () => {
        const active = controls.mode.k === 'buy' && controls.mode.troop === t;
        controls.setMode(active ? { k: 'select' } : { k: 'buy', troop: t });
      };
      c.onmouseenter = () => {
        const inf = INFO[t];
        tip.innerHTML = `<b>${d.name}</b><div>${inf.role}</div><div class="st">
          <span>Leben</span><span>${d.hp}</span><span>Schaden</span><span>${d.damage || '–'}</span>
          <span>Reichweite</span><span>${d.range}</span><span>Tempo</span><span>${d.speed}</span></div>
          <div class="good">Stark: ${inf.strong}</div><div class="bad">Schwach: ${inf.weak}</div>`;
        tip.style.display = 'block';
        const r = c.getBoundingClientRect();
        tip.style.left = `${Math.min(innerWidth - 270, Math.max(8, r.left + r.width / 2 - 125))}px`;
        tip.style.top = `${r.top - tip.offsetHeight - 12}px`;
      };
      c.onmouseleave = () => { tip.style.display = 'none'; };
      shop.appendChild(c); this.cardEls.set(t, c);
    });

    void renderPortraits(conn.you, (t, url) => { const im = this.cardEls.get(t)?.querySelector('img'); if (im) im.src = url; });

    const orders = $('#orders', this.hud);
    orders.innerHTML = `
      <button class="ob" data-a="attack"><span class="ic">⚔️</span>Angriff<span class="key" style="position:static;display:inline-block;margin-left:4px">A</span></button>
      <button class="ob" data-a="hold"><span class="ic">🛡️</span>Halten<span class="key" style="position:static;display:inline-block;margin-left:4px">H</span></button>
      <button class="ob" data-a="retreat"><span class="ic">🏃</span>Rückzug<span class="key" style="position:static;display:inline-block;margin-left:4px">X</span></button>
      <div class="sep"></div>
      ${(['line', 'wedge', 'block'] as Formation[]).map((f, i) => `<button class="ob" data-f="${f}" title="${({ line: 'Feuerlinie: Fernkämpfer +15 % Schaden', wedge: 'Sturmkeil: Reiter-Angriff noch stärker', block: 'Schildwall: Nahkämpfer −15 % Schaden' } as Record<string, string>)[f]}"><span class="ic">${['▬', '▲', '▦'][i]}</span>${FORM[f]}<span class="key" style="position:static;display:inline-block;margin-left:4px">${i + 1}</span></button>`).join('')}
      <div class="sep"></div>
      <div class="sep touchonly"></div>
      <button class="ob touchonly" data-a="all"><span class="ic">👥</span>Alle</button>
      <button class="ob touchonly" data-a="none"><span class="ic">✖️</span>Abwählen</button>
      <div class="sep"></div>
      <button class="ob abil" data-ab="arrowRain"><span class="ic">🏹</span>Pfeilregen<span class="key" style="position:static;display:inline-block;margin-left:4px">Q</span><div class="cd"></div><div class="cdt"></div></button>
      <button class="ob abil" data-ab="rally"><span class="ic">📯</span>Anfeuern<span class="key" style="position:static;display:inline-block;margin-left:4px">E</span><div class="cd"></div><div class="cdt"></div></button>`;
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
    const text = c.mode.k === 'buy' ? `${TROOPS[c.mode.troop].name} platzieren: ${tap.toLowerCase()} auf die helle Fläche (${c.isTouch ? 'Karte nochmal antippen = fertig' : 'Esc = fertig'})`
      : c.mode.k === 'attackMove' ? `${tap} auf das Ziel für den Angriffsmarsch`
        : c.mode.k === 'ability' ? `${tap} auf die Stelle für die Fähigkeit` : '';
    hint.style.display = text ? 'block' : 'none'; hint.textContent = text;
    // selection panel
    const sel = $('#sel', this.hud);
    const s = c.selected.size;
    sel.style.display = s ? 'block' : 'none';
    if (s) {
      const snap = (this as unknown as { snap?: Snapshot }).snap;
      const us = snap?.units.filter(u => c.selected.has(u.id)) ?? [];
      const counts = new Map<string, number>();
      us.forEach(u => counts.set(u.type, (counts.get(u.type) ?? 0) + 1));
      sel.innerHTML = `<b>${s} ausgewählt</b><div>${[...counts].map(([t, n]) => `${n}× ${UNIT_DEFS[t as keyof typeof UNIT_DEFS].name}`).join(', ')}</div>
        <div class="sub">${c.isTouch ? 'Tippen' : 'Rechtsklick'}: ${snap?.phase === 'prep' ? 'platzieren' : 'bewegen / angreifen'}</div>`;
    }
  }

  toast(msg: string, err = false) {
    const t = $('#toast', this.hud!);
    t.textContent = msg; t.classList.toggle('err', err); t.classList.add('show');
    clearTimeout(this.toastT); this.toastT = window.setTimeout(() => t.classList.remove('show'), 2200);
  }

  banner(title: string, sub = '') {
    const b = $('#banner', this.hud!);
    $('h2', b).textContent = title; $('p', b).textContent = sub;
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  }

  /* ---------- per-snapshot update ---------- */
  update(s: Snapshot, conn: Connection, controls: Controls) {
    if (!this.hud) return;
    (this as unknown as { snap?: Snapshot }).snap = s;
    const you = conn.you, me = s.players[you];
    const castle = s.units.find(u => u.type === 'castle');
    if (castle) {
      $('#castleHp', this.hud).style.width = `${Math.max(0, (castle.hp / castle.maxHp) * 100)}%`;
      $('#castleTxt', this.hud).textContent = `${castle.hp}`;
    }
    const waveName = WAVES[Math.min(s.wave, WAVES.length - 1)].name;
    $('#waveTxt', this.hud).textContent = `Welle ${Math.min(s.wave + 1, s.waveCount)} / ${s.waveCount}`;
    const timer = $('#timer', this.hud), sub = $('#phaseSub', this.hud);
    if (s.phase === 'prep') { timer.textContent = `${Math.max(0, Math.ceil(s.timer))}s`; sub.textContent = 'Aufstellphase – kauft und platziert Truppen'; }
    else if (s.phase === 'battle') {
      timer.textContent = ''; sub.textContent = `Kampf: ${waveName}`;
    } else { timer.textContent = ''; sub.textContent = ''; }

    const map = MAPS[conn.mapId] ?? MAPS.meadow;
    $('#preview', this.hud).textContent = s.phase === 'prep'
      ? 'Als Nächstes: ' + WAVES[Math.min(s.wave, WAVES.length - 1)].groups
        .map(g => `${Math.max(1, Math.round(g.count * map.waveScale))}× ${UNIT_DEFS[g.type].name} (${compass(map, g.lane)})`).join(', ')
      : '';
    $('#players', this.hud).innerHTML = ([0, 1] as PlayerId[]).map(p => {
      const colors = ['#4a94d9', '#ee7f9b'];
      const st = s.players[p];
      return `<div class="pill pl"><span class="dot" style="background:${colors[p]}"></span>${p === you ? 'Du' : 'Partnerin'}
        <span class="coin"></span>${Math.floor(st.gold)}${s.phase === 'prep' ? (st.ready ? ' <span class="ok">✔ bereit</span>' : '') : ''}</div>`;
    }).join('');

    const prep = s.phase === 'prep';
    $('#shop', this.hud).style.display = prep ? 'flex' : 'none';
    $('#orders', this.hud).style.display = s.phase === 'battle' ? 'flex' : 'none';
    const side = $('#side', this.hud);
    side.style.display = prep ? 'flex' : 'none';
    const ready = $<HTMLButtonElement>('#ready', this.hud);
    ready.textContent = me.ready ? 'Warte auf Partnerin…' : controls.isTouch ? 'Bereit!' : 'Bereit! (Leertaste)';
    ready.classList.toggle('green', !me.ready); ready.classList.toggle('ghost', me.ready);
    for (const [t, c] of this.cardEls) c.classList.toggle('poor', TROOPS[t].cost > me.gold);

    this.hud.querySelectorAll<HTMLElement>('.abil').forEach(b => {
      const id = b.dataset.ab as AbilityId, cd = me.abilityCd[id];
      const max = id === 'arrowRain' ? 22 : 38;
      ($('.cd', b)).style.height = `${Math.min(100, (cd / max) * 100)}%`;
      ($('.cdt', b)).textContent = cd > 0 ? String(Math.ceil(cd)) : '';
    });

    // phase / wave announcements
    if (s.phase !== this.lastPhase || s.wave !== this.lastWave) {
      if (s.phase === 'battle') this.banner(`Welle ${s.wave + 1}`, waveName);
      else if (s.phase === 'prep' && this.lastPhase !== '') this.banner('Geschafft!', 'Neue Truppen kaufen und aufstellen');
      else if (s.phase === 'prep') this.banner('Aufstellphase', 'Kauft Truppen und platziert sie auf der hellen Fläche');
      if (s.phase === 'won') this.endScreen(true);
      if (s.phase === 'lost') this.endScreen(false);
      this.lastPhase = s.phase; this.lastWave = s.wave;
      this.refreshStatic(controls);
    }
    if (controls.selected.size) this.refreshStatic(controls);

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
      <p class="hint">${won ? 'Ihr habt alle Wellen gemeinsam überstanden.' : 'Beim nächsten Mal klappt es – probiert andere Truppen aus.'}</p>
      <div class="row"><button class="btn green" id="again">Nochmal spielen</button></div></div></div>`);
    this.root.appendChild(this.overlay);
    $<HTMLButtonElement>('#again', this.overlay).onclick = () => { location.href = location.pathname; };
  }
}
