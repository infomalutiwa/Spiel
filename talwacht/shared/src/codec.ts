import { ENEMY_IDS } from './data/enemies';
import { TROOP_IDS } from './data/troops';
import type { Snapshot, Structure, UnitSnap, UnitType, WireSnapshot } from './types';

/** stable index <-> type table for the binary unit records */
export const UNIT_TYPES: UnitType[] = [...TROOP_IDS, ...ENEMY_IDS];
const TYPE_INDEX = new Map(UNIT_TYPES.map((t, i) => [t, i]));
const REC = 19;

const toB64 = (u8: Uint8Array): string => {
  if (typeof Buffer !== 'undefined') return Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength).toString('base64');
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromB64 = (b: string): Uint8Array => {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b, 'base64'));
  const bin = atob(b), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
const u16 = (v: number) => Math.min(65535, Math.max(0, Math.round(v)));

/** 19 bytes per unit */
export function encodeUnits(units: UnitSnap[]): string {
  const buf = new ArrayBuffer(units.length * REC), dv = new DataView(buf);
  units.forEach((u, i) => {
    const o = i * REC, owner = u.owner === null ? 2 : u.owner;
    dv.setUint32(o, u.id);
    dv.setUint8(o + 4, TYPE_INDEX.get(u.type) ?? 0);
    dv.setUint8(o + 5, (u.side === 'e' ? 1 : 0) | (owner << 1) | ((u.anim & 3) << 3));
    dv.setUint16(o + 6, u16(u.x * 50));
    dv.setUint16(o + 8, u16(u.y * 50));
    dv.setUint8(o + 10, Math.min(255, Math.max(0, Math.round(u.z * 16))));
    dv.setUint16(o + 11, u16(u.hp));
    dv.setUint16(o + 13, Math.max(1, u16(u.maxHp)));
    const f = ((u.facing % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    dv.setUint8(o + 15, Math.round((f / (Math.PI * 2)) * 255));
    dv.setUint16(o + 16, u.squad & 0xffff);
    dv.setUint8(o + 18, (u.burning ? 1 : 0) | (u.slowed ? 2 : 0) | (u.stunned ? 4 : 0) | (u.shielded ? 8 : 0));
  });
  return toB64(new Uint8Array(buf));
}

export function decodeUnits(b64: string): UnitSnap[] {
  const u8 = fromB64(b64), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const out: UnitSnap[] = [];
  for (let o = 0; o + REC <= u8.length; o += REC) {
    const fl = dv.getUint8(o + 5), owner = (fl >> 1) & 3, f2 = dv.getUint8(o + 18);
    out.push({
      id: dv.getUint32(o), type: UNIT_TYPES[dv.getUint8(o + 4)] ?? 'e_raider',
      side: fl & 1 ? 'e' : 'p', owner: owner === 2 ? null : (owner as 0 | 1), anim: ((fl >> 3) & 3) as 0 | 1 | 2 | 3,
      x: dv.getUint16(o + 6) / 50, y: dv.getUint16(o + 8) / 50, z: dv.getUint8(o + 10) / 16,
      hp: dv.getUint16(o + 11), maxHp: dv.getUint16(o + 13),
      facing: (dv.getUint8(o + 15) / 255) * Math.PI * 2, squad: dv.getUint16(o + 16),
      burning: !!(f2 & 1), slowed: !!(f2 & 2), stunned: !!(f2 & 4), shielded: !!(f2 & 8),
    });
  }
  return out;
}

/** [id, hp, state, build progress left (s, 1 decimal), burning 0/1] for structures that changed since `prev` */
export function structDeltas(structs: Pick<Structure, 'id' | 'hp' | 'state' | 'build' | 'burning' | 'pitch'>[], prev: Map<number, string>) {
  const out: [number, number, number, number, number][] = [];
  for (const s of structs) {
    const rec: [number, number, number, number, number] = [s.id, Math.max(0, Math.round(s.hp)), s.state, Math.round(s.build * 10) / 10, s.burning > 0 ? 1 : 0];
    const key = rec.join(',') + ',' + s.pitch;
    if (prev.get(s.id) !== key) { prev.set(s.id, key); out.push(rec); }
  }
  return out;
}

export const toWire = (s: Snapshot): WireSnapshot => { const { units, ...rest } = s; return { ...rest, u: encodeUnits(units) }; };
export const fromWire = (w: WireSnapshot): Snapshot => { const { u, ...rest } = w; return { ...rest, units: decodeUnits(u) }; };
