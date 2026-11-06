// ASCII preview of a map: npx tsx talwacht/server/scripts/asc.ts <mapId>
import { MAPS } from '../../shared/src/maps';
import { buildTerrain } from '../../shared/src/terrain';
const t = buildTerrain(MAPS[process.argv[2]]);
const ch = '.=TRw#m';
for (let y = 0; y < t.ch; y += 5) { let s = ''; for (let x = 0; x < t.cw; x += 3) s += t.bridge[y*t.cw+x] ? 'B' : ch[t.kind[y * t.cw + x]]; console.log(s); }
