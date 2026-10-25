import type { Snapshot } from '@burgwacht/shared';
import type { World } from '../render/scene';

const THEME_BG: Record<string, string> = { meadow: '#8fc46a', forest: '#6aa957', valley: '#b2c262' };

/** corner map: terrain, roads, castle, units and the camera's view; click or drag to jump */
export class Minimap {
  private cv = document.createElement('canvas');
  private g = this.cv.getContext('2d')!;
  private bg = document.createElement('canvas');
  private dragging = false;
  private mapId = '';
  el: HTMLElement;

  constructor(private world: World, root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'panel minimap';
    this.el.appendChild(this.cv);
    root.appendChild(this.el);
    const jump = (e: PointerEvent) => {
      const r = this.cv.getBoundingClientRect(), m = this.world.map;
      this.world.focus(((e.clientX - r.left) / r.width) * m.width, ((e.clientY - r.top) / r.height) * m.depth);
    };
    this.cv.addEventListener('pointerdown', e => { this.dragging = true; this.cv.setPointerCapture(e.pointerId); jump(e); });
    this.cv.addEventListener('pointermove', e => { if (this.dragging) jump(e); });
    this.cv.addEventListener('pointerup', () => { this.dragging = false; });
  }

  private paintBackground() {
    const m = this.world.map, W = this.cv.width, H = this.cv.height;
    this.bg.width = W; this.bg.height = H;
    const g = this.bg.getContext('2d')!;
    g.fillStyle = THEME_BG[m.theme]; g.fillRect(0, 0, W, H);
    const sx = W / m.width, sy = H / m.depth;
    // the road: spawn → outer gate → inner gate → keep
    const [o, i] = m.barriers;
    g.strokeStyle = 'rgba(224,188,140,0.95)'; g.lineWidth = 3; g.lineCap = 'round'; g.lineJoin = 'round';
    for (const sp of m.spawns) { g.beginPath(); g.moveTo(sp.x * sx, sp.y * sy); g.lineTo(o.x * sx, o.gateY * sy); g.lineTo(i.x * sx, i.gateY * sy); g.lineTo(m.castle.x * sx, m.castle.y * sy); g.stroke(); }
    // capture points
    m.zones.forEach(zn => { g.fillStyle = 'rgba(255,243,196,0.22)'; g.beginPath(); g.arc(zn.x * sx, zn.y * sy, zn.r * sx, 0, 7); g.fill(); g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 1; g.stroke(); });
    // wall lines with gaps for the gates
    g.lineWidth = 3; g.lineCap = 'butt';
    for (const [bi, b] of m.barriers.entries()) {
      g.strokeStyle = '#7d7a76';
      const ys = [0, ...m.walls.filter(w => w.bar === bi && w.kind === 'gate').flatMap(w => [w.y - 4.5, w.y + 4.5]), m.depth];
      for (let k = 0; k < ys.length; k += 2) { g.beginPath(); g.moveTo(b.x * sx, ys[k] * sy); g.lineTo(b.x * sx, ys[k + 1] * sy); g.stroke(); }
      g.fillStyle = '#c9a25a'; g.fillRect(b.x * sx - 2, (b.gateY - 4) * sy, 4, 8 * sy);
    }
    g.fillStyle = '#ee6b6b';
    for (const sp of m.spawns) { g.beginPath(); g.arc(sp.x * sx, sp.y * sy, 4, 0, 7); g.fill(); }
    this.mapId = m.id;
  }

  draw(s: Snapshot | undefined, you: number) {
    const m = this.world.map;
    const W = 230, H = Math.round((230 * m.depth) / m.width);
    if (this.cv.width !== W || this.cv.height !== H) { this.cv.width = W; this.cv.height = H; this.mapId = ''; }
    if (this.mapId !== m.id) this.paintBackground();
    const g = this.g, sx = W / m.width, sy = H / m.depth;
    g.drawImage(this.bg, 0, 0);
    if (s) {
      s.zones?.forEach((z, k) => { const zn = m.zones[k]; if (!zn || z.o === 0 && z.p < 0.02) return; g.fillStyle = z.o ? 'rgba(238,107,107,0.4)' : `rgba(238,107,107,${0.15 + z.p * 0.3})`; g.beginPath(); g.arc(zn.x * sx, zn.y * sy, zn.r * sx, 0, 7); g.fill(); });
      for (const u of s.units) {
        if (u.type === 'wall' || u.type === 'gate' || u.type === 'tower') { // damaged / fallen pieces show as gaps via missing dots
          if (u.hp < u.maxHp * 0.5) { g.fillStyle = '#ee6b6b'; g.fillRect(u.x * sx - 1.5, u.y * sy - 1.5, 3, 3); }
          continue;
        }
        if (u.type === 'castle') {
          g.fillStyle = '#4a94d9'; g.fillRect(u.x * sx - 5, u.y * sy - 5, 10, 10);
          g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.strokeRect(u.x * sx - 5, u.y * sy - 5, 10, 10);
          continue;
        }
        g.fillStyle = u.side === 'enemy' ? '#8a1f3f' : u.owner === you ? '#2f7fd0' : '#e0507a';
        g.fillRect(u.x * sx - 1, u.y * sy - 1, 2.4, 2.4);
      }
    }
    // camera footprint
    const c = this.world.canvas.getBoundingClientRect();
    const pts = [[0, 0], [c.width, 0], [c.width, c.height], [0, c.height]].map(([x, y]) => this.world.screenToGround(c.left + x, c.top + y));
    if (pts.every(Boolean)) {
      g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 1.5; g.beginPath();
      pts.forEach((p, i) => { const x = Math.min(m.width, Math.max(0, p!.x)) * sx, y = Math.min(m.depth, Math.max(0, p!.y)) * sy; i ? g.lineTo(x, y) : g.moveTo(x, y); });
      g.closePath(); g.stroke();
    }
  }
}
