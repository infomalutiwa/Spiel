# Burgwacht Stages 1+2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A playable two-player online co-op castle defense in the browser: 8 troop types with counter logic, formations/orders, mixed enemy waves, cozy 3D look.

**Architecture:** npm-workspaces monorepo. `shared` holds data tables and types. `server` runs a deterministic fixed-tick simulation (pure functions over a plain `GameState`) behind a `ws` room server; clients send commands and render interpolated snapshots. `client` is Three.js + Vite with a thin DOM UI.

**Tech Stack:** TypeScript 5, Node 22, `ws`, Three.js, Vite, Vitest, Playwright (two-window smoke test).

**Spec:** `docs/superpowers/specs/2026-10-25-burgwacht-design.md`

## Global Constraints

- Troop types (exactly 8): knight, archer, spearman, cavalry, crossbowman, mage, healer, catapult.
- Unit stats: hp, armor, damage, range, speed, cost, morale. Counter multipliers live in `shared/src/data/counters.ts`, never hard-coded in sim logic.
- Server is authoritative; clients only send commands and render snapshots.
- Sim is pure (no `Date.now`, no `Math.random`; seeded RNG passed in) and runs without any graphics.
- Tick rate 20 Hz; snapshots at 10 Hz; client interpolates.
- Visual style: cozy — warm palette, soft shadows, golden-hour light, rounded low-poly, friendly animation. CC0 assets only (Kenney, Quaternius); record each used pack in `client/public/assets/CREDITS.md`.
- Two players per room, joined by a 4-letter room code or link.

## Review Focus

- Player disconnects mid-wave: room pauses and the player can rejoin by the same code; the sim must not crash.
- Command for a unit the player does not own, or with unaffordable cost: rejected, state unchanged.
- Dead or removed target during a tick: attackers retarget, no exception.
- Healer with no wounded allies, catapult with no building in range: idle, no NaN positions.
- Two units at identical position: separation must not divide by zero.
- Third client tries to join a full room: clear error, existing game unaffected.

---

## File Structure

```
package.json                      workspaces: shared, server, client
tsconfig.base.json
shared/src/types.ts               GameState, Unit, Command, Snapshot, enums
shared/src/data/troops.ts         TROOPS: Record<TroopType, TroopDef>
shared/src/data/enemies.ts        ENEMIES: Record<EnemyType, TroopDef>
shared/src/data/counters.ts       DAMAGE_VS_ARMOR table
shared/src/data/waves.ts          WAVES: WaveDef[]
shared/src/data/maps.ts           MAPS: MapDef (castle, spawns, terrain zones)
server/src/sim/state.ts           createGame(mapId, seed): GameState
server/src/sim/combat.ts          resolveDamage, step attacks
server/src/sim/movement.ts        steering, separation, formations
server/src/sim/orders.ts          applyCommand
server/src/sim/abilities.ts       healer, mage AoE, catapult siege, crossbow pierce, player abilities
server/src/sim/waves.ts           wave spawner, phase machine, win/lose
server/src/sim/tick.ts            tick(state, dt): GameState
server/src/net/room.ts            Room: join, commands, tick loop, snapshots
server/src/net/server.ts          ws entry point
client/src/net/connection.ts      ws client, snapshot buffer, interpolation
client/src/render/scene.ts        lights, sky, terrain, castle, camera
client/src/render/units.ts        unit meshes, animation, health bars
client/src/render/assets.ts       GLTF loading with procedural fallback
client/src/input/controls.ts      selection, box-select, orders, placement
client/src/ui/*.ts                lobby, HUD, shop, wave banner
e2e/smoke.spec.ts                 two browser windows play a wave
```

---

### Task 1: Monorepo scaffold

**Files:** Create root `package.json`, `tsconfig.base.json`, per-workspace `package.json`/`tsconfig.json`, `vitest.workspace.ts`, `.gitignore`.

**Interfaces:** Produces: `npm test` (vitest all workspaces), `npm run dev` (server + vite concurrently), `npm run build`.

- [ ] **Step 1:** Create the workspace layout and install `typescript vitest ws three vite @types/ws @types/three concurrently tsx playwright`.
- [ ] **Step 2:** Add `shared/src/smoke.test.ts` asserting `1+1===2`; run `npm test` → PASS.
- [ ] **Step 3:** Commit `chore: scaffold workspaces`.

### Task 2: Shared types and data tables

**Files:** Create `shared/src/types.ts`, `shared/src/data/{troops,enemies,counters,waves,maps}.ts`; Test `shared/src/data/data.test.ts`.

**Interfaces:** Produces: `type TroopType`, `type EnemyType`, `interface TroopDef {hp, armor:'light'|'heavy'|'mounted'|'siege'|'structure', damage, damageType:'pierce'|'blunt'|'magic'|'siege', range, speed, cost, morale, cooldown}`, `DAMAGE_VS_ARMOR[damageType][armor]: number`, `WaveDef {at:number; groups:{type:EnemyType;count:number;lane:number}[]}`, `MapDef`.

- [ ] **Step 1:** Tests: `Object.keys(TROOPS)` equals the 8 spec names; every def has all stat fields > 0; spearman vs mounted multiplier > 1; cavalry vs light-armored archer multiplier > 1; crossbow vs heavy ≥ archer vs heavy; every `DAMAGE_VS_ARMOR` row covers all armor kinds; every wave group references an existing enemy.
- [ ] **Step 2:** Run → FAIL. Implement the tables with balanced starter numbers (knight hp 200/heavy, archer hp 60/light range 9, etc.). Run → PASS.
- [ ] **Step 3:** Commit.

### Task 3: Sim state, movement, separation

**Files:** Create `server/src/sim/{state,movement}.ts`; Test `server/src/sim/movement.test.ts`.

**Interfaces:** Consumes Task 2 types. Produces: `createGame(mapId: string, seed: number): GameState`, `stepMovement(s: GameState, dt: number): void`.

- [ ] **Step 1:** Tests: unit with move target arrives within 0.1 of it; two units at identical position separate without NaN; unit never exceeds `speed*dt` per step; units never leave map bounds.
- [ ] **Step 2:** Implement steering + separation (epsilon-jitter from seeded RNG when distance is 0). Run → PASS. Commit.

### Task 4: Combat and counters

**Files:** Create `server/src/sim/combat.ts`; Test `combat.test.ts`.

**Interfaces:** Produces: `resolveDamage(attacker: Unit, target: Unit): number`, `stepCombat(s: GameState, dt: number): void`.

- [ ] **Step 1:** Tests: spearman deals more to cavalry than knight does per hit; attack respects `cooldown`; target out of range is not damaged; dead target is removed and attacker retargets next tick without throwing; killing a unit awards gold only to the player side.
- [ ] **Step 2:** Implement nearest-enemy targeting with range check and cooldown. Run → PASS. Commit.

### Task 5: Special troop behaviors

**Files:** Create `server/src/sim/abilities.ts`; Test `abilities.test.ts`.

**Interfaces:** Produces: `stepAbilities(s: GameState, dt: number): void`, `castAbility(s: GameState, player: PlayerId, id: 'arrowRain'|'rally', at: Vec2): boolean`.

- [ ] **Step 1:** Tests: healer heals the lowest-hp ally in radius and idles (no NaN) with none wounded; mage damages all enemies within AoE radius; catapult only targets structures/siege and deals structure bonus; crossbow ignores a fraction of heavy armor and has long reload; `castAbility` fails during cooldown and succeeds after it.
- [ ] **Step 2:** Implement. Run → PASS. Commit.

### Task 6: Orders and formations

**Files:** Create `server/src/sim/orders.ts`; Test `orders.test.ts`.

**Interfaces:** Produces: `applyCommand(s: GameState, player: PlayerId, c: Command): {ok: boolean; reason?: string}` with commands `buy`, `place`, `move`, `attack`, `hold`, `retreat`, `formation`, `ability`.

- [ ] **Step 1:** Tests: buying with insufficient gold → `ok:false`, gold unchanged; ordering a unit owned by the other player → rejected; `formation` line/wedge/block yields distinct slot offsets and the squad keeps shape while moving; `hold` stops chasing; `retreat` heads to castle; place only allowed in the placement zone during the prep phase.
- [ ] **Step 2:** Implement. Run → PASS. Commit.

### Task 7: Waves, phases, win/lose

**Files:** Create `server/src/sim/{waves,tick}.ts`; Test `waves.test.ts`.

**Interfaces:** Produces: `tick(s: GameState, dt: number): void` (phases `prep` → `battle` → `reward` → … → `won`|`lost`).

- [ ] **Step 1:** Tests: battle starts when both players press ready or the prep timer ends; wave spawns the counts in `WAVES`; clearing all enemies pays gold and returns to `prep`; castle hp 0 → `lost`; last wave cleared → `won`; same seed yields identical state after 1000 ticks (determinism).
- [ ] **Step 2:** Implement the phase machine and spawner; enemy AI marches to the castle, attacks nearest unit/structure in range. Run → PASS. Commit.

### Task 8: Room server

**Files:** Create `server/src/net/{room,server}.ts`; Test `room.test.ts`.

**Interfaces:** Produces: `class Room { code: string; join(ws): PlayerId | Error; handle(player, msg); tick(): void; snapshot(): Snapshot }`; `node server` listens on `PORT` (default 2567).

- [ ] **Step 1:** Tests with a fake socket: third join rejected with `room_full`; invalid JSON message ignored; disconnect pauses sim and rejoin by code restores the same `PlayerId`; snapshot omits nothing the client needs and contains no server-only fields.
- [ ] **Step 2:** Implement room registry, 20 Hz loop, 10 Hz snapshots. Run → PASS. Commit.

### Task 9: Client scene and cozy look

**Files:** Create `client/index.html`, `client/src/main.ts`, `client/src/render/scene.ts`.

**Interfaces:** Produces: `createScene(canvas): {scene, camera, render(dt), setSnapshot(s)}`.

- [ ] **Step 1:** Build terrain (rolling meadow, path lanes from `MapDef`), castle with walls and towers, trees/flowers/rocks scattered by seeded RNG, golden-hour directional light with soft shadows, warm hemisphere light, gentle fog, subtle bloom-free color grade via tone mapping. Camera: top-down tilted RTS camera with edge-pan, WASD, wheel zoom, clamped to map.
- [ ] **Step 2:** Verify with Playwright screenshot at 1280×720: canvas non-blank and FPS ≥ 50 in headless. Commit.

### Task 10: Assets and unit rendering

**Files:** Create `client/src/render/{assets,units}.ts`, `client/public/assets/CREDITS.md`.

**Interfaces:** Produces: `loadAssets(): Promise<AssetMap>`, `UnitView.sync(units: UnitSnapshot[], alpha: number)`.

- [ ] **Step 1:** Download CC0 packs (Kenney, Quaternius) for castle/nature/characters into `client/public/assets/`, record in CREDITS. Where a GLTF is unavailable, build a rounded procedural low-poly mesh per troop type with a distinct silhouette and team color.
- [ ] **Step 2:** Implement idle/walk/attack animation (bob, lunge), health bars, selection ring, hit flash, floating damage numbers, death puff. Verify visually via screenshot. Commit.

### Task 11: Network client, input and HUD

**Files:** Create `client/src/net/connection.ts`, `client/src/input/controls.ts`, `client/src/ui/{lobby,hud,shop}.ts`.

**Interfaces:** Consumes Task 8 protocol. Produces: `connect(code?): Promise<Connection>`, `Connection.send(cmd: Command)`, `Connection.latest(): Snapshot`.

- [ ] **Step 1:** Tests (vitest, jsdom): snapshot interpolation returns midpoint at alpha 0.5; controls convert a box-drag into the right unit id set; shop disables unaffordable troops.
- [ ] **Step 2:** Implement lobby (create/join by code, shareable link), shop bar with 8 troop cards, ready button, wave banner, castle hp bar, gold, ability buttons, squad panel with formation/hold/retreat buttons, right-click move/attack. Commit.

### Task 12: Two-window smoke test

**Files:** Create `e2e/smoke.spec.ts`, `playwright.config.ts`.

- [ ] **Step 1:** Test: window A creates a room, window B joins by code, both buy a knight and an archer, press ready, wave 1 spawns, at least one enemy dies, no console errors. Run → expect PASS.
- [ ] **Step 2:** Commit; update README with run instructions (`npm install && npm run dev`).

### Task 13: Balance and polish pass

- [ ] **Step 1:** Add a headless balance test that simulates a scripted mixed army against waves 1–5 and asserts the castle survives with sensible army, and dies with no army.
- [ ] **Step 2:** Tune numbers until both hold, take final screenshots for review, commit.

---

## Self-Review

Spec coverage: 8 troops (T2,5), counters (T2,4), formations/orders (T6), phases/economy/win-lose (T7), authoritative server and rooms (T8), cozy visuals/assets (T9,10), RTS controls/UI (T11), tests incl. multiplayer (T12). Stages 3–5 (factions, bosses, weather, extra maps, upgrades, sound) are intentionally excluded and get their own plans. Names (`applyCommand`, `tick`, `Snapshot`) are used consistently across tasks.
