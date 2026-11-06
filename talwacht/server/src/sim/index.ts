// importing the systems registers their command handlers
import './squads';
import './towers';
import './traps';
import './siege';
import './waves';

export { createGame, terrainOf, terrainFor, structById } from './state';
export { applyCommand } from './commands';
export { tick, DT } from './tick';
export { serialize, deserialize } from './save';
export { production, rate, armyCap, soldiers } from './economy';
export { timeline } from './waves';
export { slotPos } from './squads';
