import type { Snapshot, UnitSnap, UnitType, WireSnapshot } from './types';
import { TROOP_ORDER } from './data/index';
import { ENEMIES } from './data/enemies';
import { BUILDING_TYPES, STRUCTURE_TYPES } from './data/structures';

/** stable index <-> type table for the compact wire format */
export const UNIT_TYPE_LIST: UnitType[] = [
  ...TROOP_ORDER, ...(Object.keys(ENEMIES) as UnitType[]), 'castle', ...STRUCTURE_TYPES, ...BUILDING_TYPES,
];
const TYPE_INDEX = new Map(UNIT_TYPE_LIST.map((t, i) => [t, i]));
const REC = 18;

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

/** 18 bytes per unit instead of ~120 bytes of JSON (byte 17: upgrade branch, burning, slowed) */
export function encodeUnits(units: UnitSnap[]): string {
  const buf = new ArrayBuffer(units.length * REC), dv = new DataView(buf);
  units.forEach((u, i) => {
    const o = i * REC;
    dv.setUint32(o, u.id);
    dv.setUint8(o + 4, TYPE_INDEX.get(u.type) ?? 0);
    const owner = u.owner === null ? 2 : u.owner;
    dv.setUint8(o + 5, (u.side === 'enemy' ? 1 : 0) | (owner << 1) | ((u.anim & 3) << 3) | (((u.level - 1) & 3) << 5));
    dv.setUint16(o + 6, Math.min(65535, Math.max(0, Math.round(u.x * 100))));
    dv.setUint16(o + 8, Math.min(65535, Math.max(0, Math.round(u.y * 100))));
    dv.setUint16(o + 10, Math.min(65535, Math.max(0, Math.round(u.hp))));
    dv.setUint16(o + 12, Math.min(65535, Math.max(1, Math.round(u.maxHp))));
    const f = ((u.facing % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    dv.setUint8(o + 14, Math.round((f / (Math.PI * 2)) * 255));
    dv.setUint16(o + 15, u.squad & 0xffff);
    dv.setUint8(o + 17, (u.branch & 3) | (u.burning ? 4 : 0) | (u.slowed ? 8 : 0));
  });
  return toB64(new Uint8Array(buf));
}

export function decodeUnits(b64: string): UnitSnap[] {
  const u8 = fromB64(b64), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const out: UnitSnap[] = [];
  for (let o = 0; o + REC <= u8.length; o += REC) {
    const fl = dv.getUint8(o + 5), owner = (fl >> 1) & 3;
    out.push({
      id: dv.getUint32(o), type: UNIT_TYPE_LIST[dv.getUint8(o + 4)] ?? 'footman',
      side: fl & 1 ? 'enemy' : 'player', owner: owner === 2 ? null : (owner as 0 | 1),
      anim: (fl >> 3) & 3, level: ((fl >> 5) & 3) + 1,
      x: dv.getUint16(o + 6) / 100, y: dv.getUint16(o + 8) / 100,
      hp: dv.getUint16(o + 10), maxHp: dv.getUint16(o + 12),
      facing: (dv.getUint8(o + 14) / 255) * Math.PI * 2, squad: dv.getUint16(o + 15),
      branch: dv.getUint8(o + 17) & 3, burning: !!(dv.getUint8(o + 17) & 4), slowed: !!(dv.getUint8(o + 17) & 8),
    });
  }
  return out;
}

export const toWire = (s: Snapshot): WireSnapshot => {
  const { units, ...rest } = s;
  return { ...rest, u: encodeUnits(units) };
};
export const fromWire = (w: WireSnapshot): Snapshot => {
  const { u, ...rest } = w;
  return { ...rest, units: decodeUnits(u) };
};
