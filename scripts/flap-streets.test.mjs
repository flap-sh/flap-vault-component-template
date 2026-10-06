import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const cache = new Map();
// Compile the actual package sources with the repository's TypeScript compiler.
// This resolves its extensionless bundler imports without a production loader.
function loadSource(name) {
  const filename = path.resolve('src/vaults/flap-streets', `${name}.ts`);
  if (cache.has(filename)) return cache.get(filename);
  const source = fs.readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', outputText)((specifier) => specifier.startsWith('./') ? loadSource(specifier.slice(2)) : require(specifier), module, module.exports);
  cache.set(filename, module.exports); return module.exports;
}
const { CHECKPOINTS, DURATION, emptyInput, newDrive, stepDrive, isBlocked, scoreDrive, alertPolice } = loadSource('driving');
const { soundMix, createSoundWriter, createDrivingAudio } = loadSource('audioPlayback');
const { MAPS, MAP_IDS, PEDESTRIAN_COUNT, pedestrianAt, pursuitRoute, clearPath } = loadSource('world');
const running = () => ({ ...newDrive(), phase: 'playing' });
const advance = (s, input, seconds) => { for (let i = 0; i < seconds * 60; i++) stepDrive(s, input, 1 / 60); };
test('car accelerates along the street and brake reduces speed', () => {
  const s = running(); advance(s, { ...emptyInput(), forward: true }, 2);
  assert.ok(s.z < 20); assert.ok(s.speed > 10);
  const speed = s.speed; advance(s, { ...emptyInput(), brake: true }, 0.5); assert.ok(s.speed < speed / 2);
});
test('paused and terminal runs do not advance', () => {
  for (const phase of ['briefing', 'paused', 'complete', 'timeout', 'busted']) {
    const s = { ...newDrive(), phase }; const before = { ...s }; advance(s, { ...emptyInput(), forward: true }, 2); assert.deepEqual(s, before);
  }
});
test('steering, reverse and boost respond to input', () => {
  const s = running(); advance(s, { ...emptyInput(), forward: true, right: true }, 0.5); assert.ok(s.yaw < 0);
  const r = running(); advance(r, { ...emptyInput(), reverse: true }, 0.4); assert.ok(r.z > 32);
  const b = running(); advance(b, { ...emptyInput(), forward: true, boost: true }, 2.8); assert.ok(b.speed > 22);
});
test('solid buildings and map bounds prevent tunnelling', () => {
  const s = { ...running(), x: 4, z: 35, yaw: -Math.PI / 2, speed: 30 };
  advance(s, { ...emptyInput(), forward: true, boost: true }, 0.8);
  assert.ok(!isBlocked(s.x, s.z)); assert.ok(s.bumps > 0); assert.equal(isBlocked(200, 0), true);
});
test('checkpoints are sequential and counted once', () => {
  const s = running(); Object.assign(s, CHECKPOINTS[1]); stepDrive(s, emptyInput(), 0.016); assert.equal(s.checkpoint, 0);
  for (const p of CHECKPOINTS) { Object.assign(s, p, { speed: 0 }); stepDrive(s, emptyInput(), 0.016); }
  assert.equal(s.phase, 'complete'); assert.equal(s.checkpoint, 4);
  const score = scoreDrive(s); advance(s, emptyInput(), 1); assert.equal(scoreDrive(s), score);
});
test('deadline ends the run and restarting resets progress', () => {
  const s = { ...running(), elapsed: DURATION - 0.01 }; stepDrive(s, emptyInput(), 0.05); assert.equal(s.phase, 'timeout');
  assert.equal(newDrive().checkpoint, 0); assert.equal(newDrive().elapsed, 0);
});
test('long frame gaps cannot teleport the car', () => {
  const s = running(); stepDrive(s, { ...emptyInput(), forward: true }, 100); assert.ok(s.elapsed <= 0.101); assert.ok(s.distance < 1);
});
test('all shipped languages have matching copy keys', () => {
  const copy = JSON.parse(fs.readFileSync(new URL('../src/vaults/flap-streets/i18n.json', import.meta.url)));
  for (const lang of ['zh', 'ko']) assert.deepEqual(Object.keys(copy[lang]).sort(), Object.keys(copy.en).sort());
});
test('impacts record contact and recover without repeated score penalties', () => {
  const s = { ...running(), x: 7, z: 35, yaw: -Math.PI / 2, speed: 25 };
  for (let i = 0; i < 40 && s.bumps === 0; i++) stepDrive(s, { ...emptyInput(), forward: true }, 1 / 60);
  assert.equal(s.bumps, 1); assert.ok(s.impact > 0.5); assert.ok(s.hitNormalX < 0);
  assert.ok(!isBlocked(s.x, s.z)); assert.ok(s.speed < 0);
  const contact = [s.hitX, s.hitZ];
  advance(s, emptyInput(), 0.3);
  assert.equal(s.bumps, 1); assert.ok(s.impactAge >= 0.3); assert.deepEqual([s.hitX, s.hitZ], contact);
  assert.equal(scoreDrive({ ...s, checkpoint: 1 }), 225);
});
test('braking triggers tire feedback and overrides boost', () => {
  const s = { ...running(), speed: 20 };
  stepDrive(s, { ...emptyInput(), forward: true, boost: true, brake: true }, 0.016);
  assert.equal(s.braking, true); assert.equal(s.boosting, false); assert.ok(s.skid > 0.5);
  const stopped = running(); stepDrive(stopped, { ...emptyInput(), brake: true }, 0.016);
  assert.equal(stopped.skid, 0);
});
test('steering smooths in and recentres after releasing the wheel', () => {
  const s = { ...running(), speed: 10 };
  stepDrive(s, { ...emptyInput(), left: true }, 0.016);
  assert.ok(s.steer > 0 && s.steer < 0.2);
  const steer = s.steer; advance(s, emptyInput(), 0.5); assert.ok(s.steer < steer / 4);
});
test('audio follows vehicle speed and stays silent outside a run', () => {
  const idle = soundMix(running());
  const moving = soundMix({ ...running(), speed: 28, boosting: true, skid: 0.8 });
  assert.ok(moving.engine > idle.engine);
  assert.ok(moving.tires > 0); assert.ok(moving.engine < 0.5);
  for (const phase of ['briefing', 'paused', 'complete', 'timeout', 'busted']) {
    const mix = soundMix({ ...running(), phase, speed: 28, skid: 1 });
    assert.equal(mix.engine, 0); assert.equal(mix.tires, 0);
  }
});
test('restart clears collision and handling feedback', () => {
  const s = newDrive();
  assert.equal(s.bumps, 0); assert.equal(s.impact, 0); assert.equal(s.skid, 0); assert.equal(s.steer, 0);
  assert.equal(s.boosting, false); assert.equal(s.braking, false); assert.ok(s.impactAge > 1);
});

test('all maps have distinct layouts, routes and clear starting positions', () => {
  assert.equal(new Set(MAP_IDS.map((id) => JSON.stringify(MAPS[id].buildings))).size, 3);
  assert.equal(new Set(MAP_IDS.map((id) => JSON.stringify(MAPS[id].checkpoints))).size, 3);
  for (const map of MAP_IDS) {
    const s = newDrive(map); assert.ok(!isBlocked(s.x, s.z, map));
    for (const p of MAPS[map].checkpoints) assert.ok(!isBlocked(p.x, p.z, map));
    s.phase = 'playing';
    for (const p of MAPS[map].checkpoints) { Object.assign(s, p, { speed: 0 }); stepDrive(s, emptyInput(), 0.016); }
    assert.equal(s.phase, 'complete');
  }
});
test('a collision summons one patrol behind the car and repeated hits keep it', () => {
  const s = running(); alertPolice(s);
  assert.equal(s.police.active, true); assert.ok(s.police.z > s.z);
  assert.ok(!isBlocked(s.police.x, s.police.z, s.map));
  const point = { x: s.police.x, z: s.police.z }; s.police.escape = 4; alertPolice(s);
  assert.deepEqual({ x: s.police.x, z: s.police.z }, point); assert.equal(s.police.escape, 0);
  const hit = { ...running(), x: 7, z: 35, yaw: -Math.PI / 2, speed: 25 };
  advance(hit, { ...emptyInput(), forward: true }, 0.4);
  assert.ok(hit.bumps > 0); assert.equal(hit.police.active, true);
});
test('patrol paths go around buildings with collision-safe edges on every map', () => {
  for (const map of MAP_IDS) {
    const from = { x: 4, z: 33 }; const to = { x: 46, z: 33 };
    assert.equal(clearPath(from, to, map), false);
    const route = pursuitRoute(from, to, map); assert.ok(route.length > 2);
    let previous = from;
    for (const point of route) { assert.ok(clearPath(previous, point, map)); previous = point; }
    assert.deepEqual(route.at(-1), to);
  }
});
test('patrol catches a stationary car without crossing buildings', () => {
  const s = running(); alertPolice(s);
  Object.assign(s.police, { x: 46, z: 32, age: 3 });
  for (let i = 0; i < 1200 && s.phase === 'playing'; i++) {
    stepDrive(s, emptyInput(), 1 / 60);
    assert.ok(!isBlocked(s.police.x, s.police.z, s.map));
  }
  assert.equal(s.phase, 'busted'); assert.equal(s.speed, 0);
});
test('sustained distance escapes pursuit; a close patrol reverses escape progress', () => {
  const s = running(); alertPolice(s); Object.assign(s.police, { x: 104, z: 104, age: 3 });
  advance(s, emptyInput(), 5.2); assert.equal(s.police.active, false); assert.equal(s.escaped, 1);
  const close = running(); alertPolice(close); close.police.escape = 3;
  advance(close, emptyInput(), 0.4); assert.ok(close.police.escape < 3);
});
test('pause freezes pursuit, and a map reset clears all pursuit and contact state', () => {
  const s = running(); alertPolice(s); s.phase = 'paused';
  const before = structuredClone(s); advance(s, emptyInput(), 1); assert.deepEqual(s, before);
  const reset = newDrive('coast'); assert.equal(reset.map, 'coast'); assert.equal(reset.police.active, false);
  assert.equal(reset.escaped, 0); assert.equal(reset.pedestrianHits, 0); assert.equal(reset.lookBack, false);
});
test('walkers patrol sidewalks without entering buildings and dodge nearby cars', () => {
  for (const map of MAP_IDS) for (const time of [0, 4, 18, 90, 179]) for (let i = 0; i < PEDESTRIAN_COUNT; i++) {
    const p = pedestrianAt(time, i, map);
    const laneDistance = Math.min(...[-100, -50, 0, 50, 100].flatMap((r) => [Math.abs(p.x - r), Math.abs(p.z - r)]));
    assert.ok(laneDistance > 7.5); assert.ok(laneDistance < 11);
    if (Math.abs(p.x) < 108 && Math.abs(p.z) < 108) assert.ok(!isBlocked(p.x, p.z, map));
    const dodged = pedestrianAt(time, i, map, p); assert.ok(dodged.alert); assert.ok(Math.hypot(dodged.x - p.x, dodged.z - p.z) > 0.5);
  }
});
test('pedestrian contact produces a non-graphic impact and alerts the patrol', () => {
  const s = running(); const p = pedestrianAt(0, 0, s.map);
  Object.assign(s, { x: p.x - 1.5, z: p.z, yaw: -Math.PI / 2, speed: 8 });
  advance(s, { ...emptyInput(), forward: true }, 0.1);
  assert.ok(s.pedestrianHits > 0); assert.equal(s.police.active, true); assert.ok(s.bumps > 0);
});
test('siren attenuates with distance and all end states are silent', () => {
  const s = running(); alertPolice(s); const near = soundMix(s).siren;
  s.police.z += 60; assert.ok(soundMix(s).siren < near);
  for (const phase of ['briefing', 'paused', 'complete', 'timeout', 'busted']) assert.equal(soundMix({ ...s, phase }).siren, 0);
  s.police.active = false; assert.equal(soundMix(s).siren, 0);
});

test('patrol route points do not retain the mutable driving state', () => {
  const s = running(); alertPolice(s); advance(s, emptyInput(), 0.1);
  for (const point of s.police.route) assert.deepEqual(Object.keys(point).sort(), ['x', 'z']);
  assert.doesNotThrow(() => JSON.stringify(s));
});

test('music ducks for pursuit and impacts, and stops in every inactive phase', () => {
  const s = running(); const normal = soundMix(s).music;
  assert.ok(normal > 0 && normal <= 0.2);
  assert.ok(soundMix({ ...s, impactAge: 0.1 }).music < normal);
  alertPolice(s); assert.ok(soundMix(s).music < normal);
  for (const phase of ['briefing', 'paused', 'complete', 'timeout', 'busted']) assert.equal(soundMix({ ...s, phase }).music, 0);
});
test('renamed artifact identity, registration and package route agree', () => {
  const manifest = JSON.parse(fs.readFileSync('src/vaults/flap-streets/manifest.json'));
  assert.match(manifest.artifactId, /^vaultui_flap-streets_[0-9A-HJKMNP-TV-Z]{26}$/);
  const index = fs.readFileSync('src/vaults/index.ts', 'utf8');
  assert.ok(index.includes('"flap-streets"')); assert.ok(!index.includes('flap-taipei-drive'));
});

const { streetParts, streetBatches } = loadSource('streetGeometry');
test('batched scenery preserves every building volume and all static pieces on each map', () => {
  for (const map of MAP_IDS) {
    const parts = streetParts(map);
    for (const b of MAPS[map].buildings) {
      assert.ok(parts.some((p) => p.position[0] === b.x && p.position[1] === b.height / 2 && p.position[2] === b.z && p.size[0] === b.width && p.size[1] === b.height && p.size[2] === b.depth), `${map}: building must still align with its collider`);
    }
    const batches = streetBatches(map);
    const all = batches.flatMap((b) => b.parts);
    assert.equal(all.length, parts.length);
    assert.deepEqual(all.map(JSON.stringify).sort(), parts.map(JSON.stringify).sort());
    assert.ok(batches.length < 100, `${map}: static scenery must stay below 100 draws before culling`);
    assert.ok(parts.length / batches.length > 10, `${map}: must reduce static draw submissions by over 90%`);
    for (const part of all) {
      assert.ok(part.position.every(Number.isFinite)); assert.ok(part.size.every((n) => n > 0));
    }
  }
});
// Throw on media getters and pitch/rate access so the test exercises the
// actual hot path without silently permitting expensive media round trips.
function audioFixture(playResult = () => Promise.resolve()) {
  const names = ['music', 'engine', 'tires', 'siren', 'impact', 'checkpoint'];
  const log = [], state = {}, players = {};
  let enabled = false, failed = false;
  for (const name of names) {
    state[name] = { paused: true, volume: 1, muted: false, currentTime: 0 };
    players[name] = new Proxy({}, {
      get(_, key) {
        if (key === 'play') return () => {
          state[name].paused = false; log.push([name, 'play']);
          return playResult(name);
        };
        if (key === 'pause') return () => { state[name].paused = true; log.push([name, 'pause']); };
        assert.fail(`unexpected media read: ${String(key)}`);
      },
      set(_, key, value) {
        assert.ok(['volume', 'muted', 'currentTime'].includes(key), `unexpected media write: ${String(key)}`);
        state[name][key] = value; log.push([name, key, value]); return true;
      },
    });
  }
  const control = createDrivingAudio((name) => players[name], (value) => { enabled = value; }, (value) => { failed = value; });
  return { control, players, state, log, enabled: () => enabled, failed: () => failed };
}
const settled = async () => { await Promise.resolve(); await Promise.resolve(); };
const calls = (fixture, name, operation) => fixture.log.filter(([n, op]) => n === name && op === operation).length;

test('sound writer caches desired gain without reading media properties or touching pitch', () => {
  const f = audioFixture(), write = createSoundWriter(), audio = f.players.engine;
  write(audio, 0.2); const count = f.log.length;
  for (let i = 0; i < 100; i++) write(audio, 0.2);
  assert.equal(f.log.length, count);
  write(audio, 0); assert.equal(f.state.engine.muted, true); assert.equal(f.state.engine.volume, 0);
  write(audio, 0.3); assert.equal(f.state.engine.muted, false); assert.equal(f.state.engine.volume, 0.3);
});
test('Start enables sound and unlocks cues, but only music and engine keep playing', async () => {
  const f = audioFixture(); f.control.start(); await settled();
  assert.equal(f.enabled(), true); assert.equal(f.failed(), false);
  for (const name of Object.keys(f.state)) {
    assert.equal(calls(f, name, 'play'), 1);
    assert.equal(f.state[name].paused, !['music', 'engine'].includes(name));
  }
});
test('accelerating at 120 FPS uses bounded gain changes and never changes playback rate', async () => {
  const f = audioFixture(); f.control.start(); await settled();
  const s = running();
  for (let frame = 0; frame <= 1200; frame++) {
    s.elapsed = frame / 120; s.speed = frame / 1200 * 32;
    f.control.tick(s, 0, 0);
  }
  assert.ok(f.state.engine.volume > 0.25);
  assert.ok(calls(f, 'engine', 'volume') <= 6, 'gain should change only on acceleration bands');
  assert.equal(calls(f, 'engine', 'play'), 1);
  assert.equal(calls(f, 'music', 'volume'), 1);
  assert.equal(f.state.tires.paused, true); assert.equal(f.state.siren.paused, true);
});
test('rapid changing effects are mixed at most five times per simulation second', async () => {
  const f = audioFixture(); f.control.start(); await settled(); f.log.length = 0;
  const s = running();
  for (let frame = 0; frame < 120; frame++) {
    s.elapsed = frame / 120; s.boosting = frame % 2 === 0;
    s.skid = frame % 2 === 0 ? 1 : 0; f.control.tick(s, 0, 0);
  }
  assert.ok(calls(f, 'engine', 'volume') <= 5);
  assert.ok(calls(f, 'tires', 'volume') <= 5);
});
test('tire and pursuit loops start once per active interval and stop when no longer needed', async () => {
  const f = audioFixture(); f.control.start(); await settled();
  const s = running(); alertPolice(s); s.skid = 0.9;
  for (let i = 0; i < 20; i++) { s.elapsed = i / 10; f.control.tick(s, 0, 0); }
  await settled();
  for (const name of ['tires', 'siren']) {
    assert.equal(calls(f, name, 'play'), 2); assert.equal(f.state[name].paused, false);
  }
  s.skid = 0; s.police.active = false; s.elapsed = 3; f.control.tick(s, 0, 0);
  for (const name of ['tires', 'siren']) {
    assert.equal(f.state[name].paused, true); assert.equal(f.state[name].muted, true);
  }
});
test('collision and checkpoint cues bypass the mix throttle and completion stops loops', async () => {
  const f = audioFixture(); f.control.start(); await settled();
  const s = running(); f.control.tick(s, 0, 0);
  s.elapsed = 0.01; s.bumps = 1; s.impact = 0.8; f.control.tick(s, 0, 0);
  assert.equal(calls(f, 'impact', 'play'), 2);
  s.elapsed = 0.02; s.checkpoint = 4; s.phase = 'complete'; f.control.tick(s, 1, 3);
  await settled();
  assert.equal(calls(f, 'checkpoint', 'play'), 2); assert.equal(f.state.checkpoint.paused, false);
  for (const name of ['music', 'engine', 'tires', 'siren']) assert.equal(f.state[name].paused, true);
  const count = f.log.length; f.control.tick(s, 1, 4); assert.equal(f.log.length, count);
});
test('pause/mute preserve music position, resume respects mute, and restart resets it', async () => {
  const f = audioFixture(); f.control.start(); await settled();
  f.state.music.currentTime = 9; f.control.pause(); f.control.begin(); await settled();
  assert.equal(f.state.music.currentTime, 9); assert.equal(f.state.music.paused, false);
  f.control.toggle(true); f.control.begin();
  assert.equal(f.enabled(), false); assert.ok(Object.values(f.state).every((p) => p.paused));
  f.control.toggle(true); await settled(); assert.equal(f.state.music.currentTime, 9);
  f.control.start(); assert.equal(f.state.music.currentTime, 0);
});
test('late play promises cannot restart muted audio and stale failures do not disable a new run', async () => {
  const pending = [];
  const f = audioFixture(() => new Promise((resolve, reject) => pending.push({ resolve, reject })));
  f.control.start(); f.control.toggle(true);
  for (const p of pending.splice(0)) p.resolve(); await settled();
  assert.ok(Object.values(f.state).every((p) => p.paused)); assert.equal(f.enabled(), false);
  f.control.start(); const stale = pending.splice(0); f.control.start();
  for (const p of stale) p.reject(new Error('old request')); await settled();
  assert.equal(f.failed(), false); assert.equal(f.enabled(), true);
  for (const p of pending) p.resolve(); await settled();
  assert.equal(f.state.music.paused, false); assert.equal(f.state.siren.paused, true);
});
test('a current playback failure stops all audio and a new Start can recover', async () => {
  let reject = true;
  const f = audioFixture((name) => reject && name === 'engine' ? Promise.reject(new Error('media unavailable')) : Promise.resolve());
  f.control.start(); await settled();
  assert.equal(f.failed(), true); assert.equal(f.enabled(), false);
  assert.ok(Object.values(f.state).every((p) => p.paused));
  reject = false; f.control.start(); await settled();
  assert.equal(f.failed(), false); assert.equal(f.enabled(), true); assert.equal(f.state.engine.paused, false);
});
