import type { Command, GameState, PlayerId } from '@talwacht/shared';
import { build, repair, sell, upgrade, type Result } from './build';
import { structById } from './state';

export type Handler = (s: GameState, p: PlayerId, cmd: Command) => Result;
/** later systems (training, orders, traps, waves) register their commands here */
export const handlers: Partial<Record<Command['c'], Handler>> = {};

export function applyCommand(s: GameState, p: PlayerId, cmd: Command): Result {
  if (s.phase !== 'play') return { ok: false, reason: 'game_over' };
  if (!cmd || typeof cmd !== 'object') return { ok: false, reason: 'bad_command' };
  switch (cmd.c) {
    case 'build': return build(s, p, cmd.kind, cmd.cells);
    case 'upgrade': case 'repair': case 'sell': {
      const st = structById(s, cmd.id);
      if (!st) return { ok: false, reason: 'not_found' };
      return cmd.c === 'upgrade' ? upgrade(s, p, st) : cmd.c === 'repair' ? repair(s, p, st) : sell(s, p, st);
    }
    case 'preview':
      s.previews[p] = cmd.kind && Array.isArray(cmd.cells) ? { kind: cmd.kind, cells: cmd.cells.slice(0, 80) } : null;
      return { ok: true };
    case 'ping':
      s.pings.push({ p, x: +cmd.x || 0, y: +cmd.y || 0, kind: (cmd.kind | 0) & 3, t: s.time });
      s.events.push({ k: 'ping', p, x: +cmd.x || 0, y: +cmd.y || 0, kind: (cmd.kind | 0) & 3 });
      if (s.pings.length > 6) s.pings.shift();
      return { ok: true };
    default: {
      const h = handlers[cmd.c];
      return h ? h(s, p, cmd) : { ok: false, reason: 'bad_command' };
    }
  }
}
