import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import vm from 'node:vm';
import { createKillComboPlayer, decodeKillCombo, KillComboRenderer, normalizeKillComboCount } from '../src/effects/killCombo.js';
import { killComboAssets } from '../src/effects/killComboAssets.js';
import { spine } from '../src/libs/spine4-core.js';

const assetRoot = new URL('../assets/kill-combo/', import.meta.url);
const bytes = (metadata, name) => readFileSync(new URL(metadata.folder + '/' + name, assetRoot));
function imagesFor(metadata) {
	return Object.fromEntries(metadata.pages.map(name => {
		const data = bytes(metadata, name);
		return [name, { width: data.readUInt32BE(16), height: data.readUInt32BE(20), name }];
	}));
}
function modelFor(metadata) {
	return decodeKillCombo(spine, metadata, bytes(metadata, metadata.name + '.atlas.txt').toString('utf8'), bytes(metadata, metadata.name + '.skel'), imagesFor(metadata));
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('seven original skeletons, all 16 atlas pages and all seven OGG voices retain their hashes', () => {
	const sources = JSON.parse(readFileSync(new URL('sources.json', assetRoot), 'utf8'));
	assert.equal(sources.files.length, 37);
	for (const file of sources.files) {
		assert.equal(createHash('sha256').update(readFileSync(new URL(file.file, assetRoot))).digest('hex'), file.sha256, file.file);
	}
	assert.equal(killComboAssets.length, 7);
	assert.equal(killComboAssets.reduce((sum, item) => sum + item.pages.length, 0), 16);
	for (const metadata of killComboAssets) {
		assert.equal(bytes(metadata, metadata.sound).subarray(0, 4).toString(), 'OggS');
		assert.ok(metadata.audio.endsWith(`/kill_${metadata.count}.ogg`));
		const model = modelFor(metadata);
		assert.equal(model.data.version, '4.0.56');
		assert.equal(model.animation.duration, metadata.duration);
		assert.equal(model.atlas.pages.length, metadata.pages.length);
	}
	assert.deepEqual([0, 1, 2, 7, 8, NaN].map(normalizeKillComboCount), [1, 1, 2, 7, 7, 1]);
});

test('the 4.0 runtime does not assign window.spine or replace the dynamic-skin runtime', async () => {
	const original = globalThis.window;
	const sentinel = {};
	globalThis.window = { spine: sentinel };
	try {
		await import('../src/libs/spine4-core.js?namespace-check');
		assert.equal(globalThis.window.spine, sentinel);
	} finally {
		if (original === undefined) delete globalThis.window;
		else globalThis.window = original;
	}
});

test('actual renderer evaluates all seven tracks at 30 fps with finite region/weighted-mesh geometry', () => {
	let draws = [], blend, pending, meshDraws = 0, poses = 0;
	const gl = new Proxy({
		createShader: () => ({}), createProgram: () => ({}), createBuffer: () => ({}), createTexture: () => ({}),
		getShaderParameter: () => true, getProgramParameter: () => true, getAttribLocation: () => 0, getUniformLocation: () => ({}),
		clear() { draws = []; },
		bufferData(target, vertices) { pending = Array.from(vertices); },
		blendFuncSeparate(source, dest) { blend = dest; },
		drawArrays(mode, start, count) {
			assert.ok(pending.every(Number.isFinite)); assert.equal(pending.length, count * 4);
			if (count > 6) meshDraws++;
			draws.push({ count, blend });
		},
	}, { get: (target, key) => key in target ? target[key] : /^[A-Z_0-9]+$/.test(key) ? key : () => {} });
	let width = 1920, height = 1080;
	const renderer = new KillComboRenderer({ getContext: () => gl, getBoundingClientRect: () => ({ width, height }) });
	for (const metadata of killComboAssets) {
		const model = modelFor(metadata);
		renderer.upload(model);
		for (let frame = 0; frame <= Math.ceil(model.animation.duration * 30); frame++) {
			renderer.draw(model, frame / 30); poses++;
		}
		renderer.draw(model, metadata.duration + .01); assert.equal(draws.length, 0);
		width = 960; height = 540; renderer.draw(model, 1.15); assert.ok(draws.length > 0);
		width = 640; height = 900; renderer.draw(model, 1.15); assert.ok(draws.length > 0);
		width = 1920; height = 1080;
		renderer.release(model); assert.deepEqual(model.textures, {});
	}
	assert.equal(poses, 622);
	assert.ok(meshDraws > 1000);
});

function playerHarness({ noWebGL = false, failAssets = false } = {}) {
	let time = 0, id = 0;
	const frames = new Map(), timers = new Map(), voices = [], uploads = [], released = [], painted = [];
	class Element {
		constructor() { this.style = {}; this.children = []; this.listeners = {}; }
		setAttribute() {}
		addEventListener(type, handler) { this.listeners[type] = handler; }
		appendChild(child) { child.remove(); this.children.push(child); child.parent = this; }
		remove() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; }
	}
	const parent = new Element(), document = { createElement: () => new Element(), body: parent };
	const game = { playAudio(options) { const audio = { path: options.path, pause() { this.paused = true; }, remove() { this.removed = true; } }; voices.push(audio); return audio; } };
	const renderer = {
		upload(model) { uploads.push(model.metadata.count); },
		release(model) { released.push(model.metadata.count); },
		draw(model, elapsed) { painted.push([model.metadata.count, elapsed]); },
	};
	const pathFor = url => new URL(url.slice(url.indexOf('assets/kill-combo/') + 'assets/kill-combo/'.length), assetRoot);
	const player = createKillComboPlayer({ lib: { assetURL: '' }, game, ui: { window: parent } }, {
		document, loadSpine: async () => spine,
		readText: async url => { if (failAssets) throw new Error('fixture read failure'); return readFileSync(pathFor(url), 'utf8'); },
		readBinary: async url => readFileSync(pathFor(url)),
		loadImage: async url => { const data = readFileSync(pathFor(url)); return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) }; },
		createRenderer() { if (noWebGL) throw new Error('fixture WebGL unavailable'); return renderer; },
		now: () => time,
		requestFrame(callback) { frames.set(++id, callback); return id; }, cancelFrame: key => frames.delete(key),
		setTimer(callback, delay) { timers.set(++id, { callback, due: time + delay }); return id; }, clearTimer: key => timers.delete(key),
	});
	function advance(ms, animate = true) {
		time += ms;
		if (animate) for (const [key, callback] of [...frames]) { frames.delete(key); callback(time); }
		for (const [key, timer] of [...timers]) if (timer.due <= time) { timers.delete(key); timer.callback(); }
	}
	return { player, parent, voices, uploads, released, painted, advance, frames, timers };
}

test('playback queues successive kills and starts each matching voice only after resources load', async () => {
	const h = playerHarness();
	const first = h.player.play(1), second = h.player.play(2);
	assert.equal(h.voices.length, 0);
	await flush();
	assert.deepEqual(h.uploads, [1]); assert.equal(h.parent.children.length, 1);
	assert.ok(h.voices[0].path.endsWith('kill_1.ogg')); assert.equal(h.voices.length, 1);
	h.advance(2500); await flush();
	assert.equal(await first, true); assert.deepEqual(h.uploads, [1, 2]);
	assert.ok(h.voices[1].path.endsWith('kill_2.ogg'));
	h.advance(3000); assert.equal(await second, true); assert.equal(h.parent.children.length, 0);
	assert.equal(h.frames.size, 0); assert.equal(h.timers.size, 0);
});

test('stop removes the overlay/audio and cancels queued announcements', async () => {
	const h = playerHarness();
	const first = h.player.play(7), queued = h.player.play(2);
	await flush(); h.player.stop();
	assert.equal(await first, false); assert.equal(await queued, false);
	assert.equal(h.parent.children.length, 0); assert.equal(h.voices.length, 1);
	assert.ok(h.voices[0].paused); assert.equal(h.frames.size, 0); assert.equal(h.timers.size, 0);
});

test('hidden views still finish via the watchdog, and cached textures remain bounded', async () => {
	const h = playerHarness();
	for (const count of [1, 2, 3, 7]) {
		const playing = h.player.play(count); await flush();
		h.advance(4000, false); assert.equal(await playing, true);
	}
	assert.equal(h.parent.children.length, 0);
	assert.equal(h.uploads.length - h.released.length, 2);
});

test('missing graphics or resources preserves the new voice and never blocks the game indefinitely', async t => {
	t.mock.method(console, 'warn', () => {});
	for (const options of [{ noWebGL: true }, { failAssets: true }]) {
		const h = playerHarness(options);
		const playing = h.player.play(3); await flush();
		assert.equal(h.voices.length, 1); assert.ok(h.voices[0].path.endsWith('kill_3.ogg'));
		h.advance(4000, false); await playing;
		assert.equal(h.parent.children.length, 0); assert.equal(h.frames.size, 0);
	}
	assert.equal(console.warn.mock.calls.length, 2);
});

test('actual HH kill hook still awaits playback with native kill effects disabled, guards duplicate deaths and keeps the existing turn reset', async () => {
	const source = readFileSync(new URL('../hh-features.js', import.meta.url), 'utf8');
	const code = source.slice(source.indexOf('// ========== 连斩特效功能'), source.indexOf('// 音频替换功能'));
	const plays = [], popups = [], lib = { config: { extension_HH优化_disable_native_kill_effect: true }, skill: {}, onover: [] };
	const player = { storage: {}, popup: text => popups.push(text) };
	const game = { players: [player], dead: [] };
	let release;
	const broadcaster = { preload: async () => {}, stop() {}, play: count => { plays.push(count); return new Promise(resolve => { release = resolve; }); } };
	const context = vm.createContext({ lib, game, ui: {}, config: {}, console, HH_getConfig: () => true, HH_finishSkills() {}, createKillComboPlayer: () => broadcaster });
	vm.runInContext(code, context);
	const hook = lib.skill._HH_lianzhan_;
	const death = { source: player }, event = { finish() {} };
	assert.equal(hook.filter(death, player), true);
	let done = false;
	const running = hook.content(event, death, player).then(() => { done = true; });
	await flush(); assert.equal(done, false); assert.deepEqual(plays, [1]);
	release(true); await running;
	assert.equal(hook.filter(death, player), false);
	await hook.content(event, death, player); assert.deepEqual(plays, [1]);
	for (let count = 2; count <= 8; count++) {
		const job = hook.content(event, { source: player }, player); release(true); await job;
	}
	assert.deepEqual(plays, [1, 2, 3, 4, 5, 6, 7, 7]);
	assert.equal(popups.at(-1), '七连');
	context.player = player; lib.skill._HH_lianzhan_delete_.content();
	assert.equal(player.storage._HH_lianzhan_, undefined); assert.equal(player.storage._HH_lianzhan_triggered, undefined);
});
