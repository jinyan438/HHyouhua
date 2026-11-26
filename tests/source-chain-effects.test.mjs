import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { spine } from '../src/libs/spine4-core.js';
import { chainAssets, chainDamageNature, chainPlacement, createSourceChainEffects, setupSourceChainEffects } from '../src/effects/sourceChainEffects.js';
import { decodeKillCombo, KillComboRenderer } from '../src/effects/killCombo.js';
import { createSourceCardPlayer } from '../src/effects/sourceCardAnimations.js';

const root = new URL('../assets/chain-effects/', import.meta.url);
const read = file => fs.readFileSync(new URL(file, root));
const flush = () => new Promise(resolve => setImmediate(resolve));

test('original chain files retain hashes; all six source actions render, including the zero-duration persistent pose', () => {
	const manifest = JSON.parse(read('sources.json'));
	assert.equal(manifest.files.length, 15); assert.equal(Object.keys(manifest.sounds).length, 4);
	for (const file of manifest.files) assert.equal(createHash('sha256').update(read(file.file)).digest('hex'), file.sha256, file.file);
	for (const clip of Object.values(manifest.sounds)) {
		assert.equal(createHash('sha256').update(read(clip.file)).digest('hex'), clip.sha256);
		assert.equal(createHash('sha256').update(read(clip.original_file)).digest('hex'), clip.original_sha256);
		assert.equal(clip.streams[0].codec_name, 'mp3'); assert.ok(Number(clip.format.duration) > .1);
	}
	let vertices, draws = 0;
	const gl = new Proxy({ createShader: () => ({}), createProgram: () => ({}), createBuffer: () => ({}), createTexture: () => ({}), getShaderParameter: () => true, getProgramParameter: () => true, getAttribLocation: () => 0, getUniformLocation: () => ({}), bufferData(target, data) { vertices = data; }, drawArrays() { assert.ok(vertices.every(Number.isFinite)); draws++; } }, { get: (o, k) => k in o ? o[k] : /^[A-Z_0-9]+$/.test(k) ? k : () => {} });
	const renderer = new KillComboRenderer({ getContext: () => gl, getBoundingClientRect: () => ({ width: 1000, height: 700 }) });
	for (const [stage, asset] of Object.entries(chainAssets)) {
		const atlas = read(`${asset.name}/${asset.name}.atlas.txt`).toString();
		const images = Object.fromEntries(new spine.TextureAtlas(atlas).pages.map(page => { const b = read(`${asset.name}/${page.name}`); return [page.name, { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }]; }));
		const model = decodeKillCombo(spine, asset, atlas, read(`${asset.name}/${asset.name}.skel`), images);
		assert.equal(model.data.version, '4.0.56'); assert.equal(model.animation.name, asset.action);
		if (stage === 'stay') assert.equal(model.animation.duration, 0);
		renderer.upload(model); const before = draws;
		for (let i = 0; i <= Math.floor(model.animation.duration * 60); i++) renderer.draw(model, i / 60, { x: 200, y: 200, scale: .6, holdLastFrame: stage === 'stay' });
		assert.ok(draws > before, stage); renderer.release(model);
	}
});

function harness({ defer = false, fail = false } = {}) {
	let time = 0, id = 0, resolveLoad;
	const gate = defer ? new Promise(resolve => { resolveLoad = resolve; }) : Promise.resolve();
	const frames = new Map(), timers = new Map(), listeners = {}, sounds = [], drawn = [];
	class Element {
		constructor(rect = { left: 0, top: 0, width: 1000, height: 700 }) {
			this.rect = rect; this.children = []; this.style = {}; this.isConnected = true;
			const values = new Set(); this.classList = { add: value => values.add(value), remove: value => values.delete(value), contains: value => values.has(value), toggle(value) { if (values.has(value)) { values.delete(value); return false; } values.add(value); return true; } };
		}
		setAttribute() {} addEventListener() {}
		appendChild(node) { node.remove(); node.parentNode = this; this.children.push(node); }
		remove() { if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; }
		getBoundingClientRect() { return this.rect; }
		isLinked() { return this.classList.contains('linked2'); }
	}
	const parent = new Element(), player = new Element({ left: 100, top: 100, width: 174, height: 232 }), other = new Element({ left: 500, top: 100, width: 87, height: 116 });
	const document = { body: parent, hidden: false, createElement: () => new Element(), addEventListener: (name, fn) => { listeners[name] = fn; } };
	const lib = { config: { animation: true, background_audio: true }, element: { content: {} }, arenaReady: [], onover: [] };
	const game = { players: [player, other], playAudio: (...args) => sounds.push(args) }, ui = { window: parent, updatej() {}, updatem() {} }, get = { is: { linked2: () => true } };
	const filename = url => url.slice(url.indexOf('assets/chain-effects/') + 'assets/chain-effects/'.length);
	const environment = {
		document, now: () => time, loadSpine: async () => { await gate; return spine; },
		readText: async url => { if (fail) throw Error('fixture'); return read(filename(url)).toString(); }, readBinary: async url => read(filename(url)),
		loadImage: async url => { const b = read(filename(url)); return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }; },
		createRenderer: () => ({ upload() {}, draw(model, elapsed, placement) { drawn.push({ model, elapsed, placement }); } }),
		requestFrame(fn) { frames.set(++id, fn); return id; }, cancelFrame: handle => frames.delete(handle),
		setTimer(fn, ms) { timers.set(++id, { fn, due: time + ms }); return id; }, clearTimer: handle => timers.delete(handle),
	};
	const context = { lib, game, ui, get }, manager = createSourceChainEffects(context, environment);
	function advance(ms) {
		time += ms;
		for (const [id, timer] of [...timers]) if (timer.due <= time) { timers.delete(id); timer.fn(); }
		for (const [id, fn] of [...frames]) { frames.delete(id); fn(time); }
	}
	return { ...context, context, environment, manager, player, other, parent, document, listeners, sounds, drawn, frames, timers, advance, resolveLoad };
}

test('enter runs at source 1.2 speed and switches at 1800 ms to a persistent pose that follows player resizing', async () => {
	const h = harness(); assert.equal(await h.manager.setLinked(h.player, true), true);
	h.advance(500); assert.equal(h.drawn.at(-1).elapsed, .6); assert.equal(h.drawn.at(-1).model.animation.name, 'play2');
	h.advance(1299); assert.equal(h.drawn.at(-1).model.animation.name, 'play2');
	h.advance(1); assert.equal(h.drawn.at(-1).model.animation.name, 'play4'); assert.equal(h.drawn.at(-1).placement.holdLastFrame, true);
	h.player.rect = { left: 400, top: 300, width: 87, height: 116 }; h.advance(100000);
	assert.equal(h.manager.diagnostics.active, 1); assert.deepEqual(h.drawn.at(-1).placement, { x: 443.5, y: 353, scale: .5, clear: true, holdLastFrame: true });
	assert.equal(h.sounds.length, 1); assert.match(h.sounds[0][0].path, /3d_85_spell2.mp3$/); h.manager.stop();
	assert.equal(h.frames.size + h.timers.size, 0); assert.equal(h.parent.children.length, 0);
});

test('normal release and fire/thunder/ice breaks replace the chain independently on each affected player', async () => {
	const h = harness();
	for (const nature of ['', 'fire', 'thunder', 'ice']) {
		await h.manager.setLinked(h.player, true); await h.manager.setLinked(h.other, true); h.advance(1800);
		await h.manager.setLinked(h.player, false, nature); h.advance(200);
		const effect = h.drawn.findLast(draw => draw.model.metadata.name !== chainAssets.stay.name);
		assert.equal(effect.model.metadata.name, chainAssets[nature || 'clear'].name);
		assert.equal(h.drawn.at(-1).placement.clear, false); assert.equal(h.manager.diagnostics.active, 2);
		assert.match(h.sounds.at(-1)[0].path, nature ? /3d_85_broken_fire.mp3$/ : /3d_85_spell4.mp3$/);
		h.advance(1600); assert.equal(h.manager.diagnostics.active, 1); assert.equal(h.player.classList.contains('hh-source-chain'), false);
	}
	h.manager.stop(); assert.equal(h.manager.diagnostics.active, 0);
});

test('elemental link content holds the native chain loop until each current break ends; later players stay chained', async () => {
	const h = harness(), manager = setupSourceChainEffects(h.context, h.environment), starts = [];
	h.game.log = () => {}; h.game.addVideo = () => {}; h.game.broadcastAll = (fn, ...args) => fn(...args);
	for (const player of [h.player, h.other]) { player.classList.add('linked2'); await manager.setLinked(player, true, '', { silent: true, restore: true }); }
	let complete = false;
	const sequence = (async () => {
		for (const player of [h.player, h.other]) {
			starts.push(player);
			const damage = { name: 'damage', player, nature: 'fire' };
			await h.lib.element.content.link({ getParent: () => ({ name: '_lianhuan4', getTrigger: () => ({ getParent: () => damage }) }) }, null, player);
		}
		complete = true;
	})();
	await flush(); h.advance(1232); await flush();
	assert.deepEqual(starts, [h.player]); assert.equal(h.player.isLinked(), false); assert.equal(h.other.isLinked(), true); assert.equal(complete, false);
	h.advance(2); await flush();
	assert.deepEqual(starts, [h.player, h.other]); assert.equal(h.other.isLinked(), false); assert.equal(complete, false);
	h.advance(1232); await flush(); assert.equal(complete, false);
	h.advance(2); await sequence; assert.equal(manager.diagnostics.active, 0); assert.equal(complete, true);
	assert.equal(h.sounds.length, 2);
});

test('break completion releases its waiter on cancellation and failed/disabled graphics, without delaying ordinary unlocks', async () => {
	const h = harness(); const loading = h.manager.setLinked(h.player, false, 'thunder');
	let finished = false; const waiting = h.manager.waitForBreak(h.player).then(() => { finished = true; });
	await loading; h.advance(400); await flush(); assert.equal(finished, false);
	h.manager.stop(); await waiting; assert.equal(finished, true);
	await h.manager.setLinked(h.player, false); await h.manager.waitForBreak(h.player);
	assert.equal(h.manager.diagnostics.active, 1, 'ordinary release is cosmetic and does not hold settlement'); h.manager.stop();
	h.lib.config.animation = false; await h.manager.setLinked(h.player, false, 'fire'); await h.manager.waitForBreak(h.player);
	assert.equal(h.manager.diagnostics.active, 0);
	const failed = harness({ fail: true }), warn = console.warn; console.warn = () => {};
	try { await failed.manager.setLinked(failed.player, false, 'ice'); await failed.manager.waitForBreak(failed.player); assert.equal(failed.manager.diagnostics.active, 0); }
	finally { console.warn = warn; }
});

test('only an actual elemental chain reset chooses a damage break; native state, log and video broadcasts stay intact', async () => {
	const h = harness(), calls = [];
	const installed = setupSourceChainEffects(h.context, h.environment);
	installed.setLinked = (...args) => calls.push(args); h.game.log = (...args) => calls.push(['log', ...args]);
	h.game.addVideo = (...args) => calls.push(['video', ...args]); h.game.broadcastAll = (fn, ...args) => fn(...args);
	const damage = { name: 'damage', player: h.player, nature: ['thunder'] }, reset = { name: '_lianhuan4', getTrigger: () => ({ getParent: () => damage }) };
	const event = { getParent: () => reset };
	assert.equal(chainDamageNature(event, h.player), 'thunder'); assert.equal(chainDamageNature(event, h.other), '');
	assert.equal(chainDamageNature({ getParent: () => ({ name: 'manual_skill', getParent: () => damage }) }, h.player), '');
	h.player.classList.add('target'); await h.lib.element.content.link({}, null, h.player);
	assert.equal(h.player.isLinked(), true); assert.equal(h.player.classList.contains('target'), false);
	assert.deepEqual(calls.at(-1), ['video', 'link', h.player, true]);
	await h.lib.element.content.link(event, null, h.player);
	assert.equal(h.player.isLinked(), false); assert.deepEqual(calls.at(-3), [h.player, false, 'thunder']);
	assert.deepEqual(calls.at(-2), ['video', 'hhChainNature', h.player, 'thunder']);
	assert.deepEqual(calls.at(-1), ['video', 'link', h.player, false]);
	assert.equal(setupSourceChainEffects(h.context), installed);
});

test('new recordings retain elemental breaks while old boolean link recordings still replay', () => {
	const h = harness(), calls = [];
	h.game.videoContent = { link(player, linked) { player.classList[linked ? 'add' : 'remove']('linked2'); return 'native'; } };
	const manager = setupSourceChainEffects(h.context, h.environment); manager.setLinked = (...args) => calls.push(args);
	assert.equal(h.game.videoContent.link(h.player, true), 'native'); assert.equal(h.player.isLinked(), true);
	h.game.videoContent.hhChainNature(h.player, 'fire'); h.game.videoContent.link(h.player, false);
	assert.deepEqual(calls.at(-1), [h.player, false, 'fire', { silent: true }]); assert.equal(h.player.isLinked(), false);
	h.game.videoContent.link(h.player, true); h.game.videoContent.link(h.player, false);
	assert.deepEqual(calls.at(-1), [h.player, false, '', { silent: true }]);
});

test('rapid toggles, late loads, hidden tabs and dead players cannot resurrect stale chains', async () => {
	const h = harness({ defer: true });
	const enter = h.manager.setLinked(h.player, true), release = h.manager.setLinked(h.player, false, 'fire');
	h.resolveLoad(); assert.equal(await enter, false); assert.equal(await release, true); h.advance(100);
	assert.equal(h.drawn.at(-1).model.metadata.name, chainAssets.fire.name); assert.equal(h.manager.diagnostics.active, 1);
	h.document.hidden = true; h.listeners.visibilitychange(); h.advance(3000); assert.equal(h.manager.diagnostics.active, 0);
	h.player.classList.add('linked2'); h.document.hidden = false; h.listeners.visibilitychange(); await flush(); h.advance(20);
	assert.equal(h.drawn.at(-1).model.animation.name, 'play4'); assert.equal(h.sounds.length, 2, 'restoration is silent');
	h.player.classList.add('dead'); h.advance(20); assert.equal(h.manager.diagnostics.active, 0); assert.equal(h.frames.size + h.timers.size, 0);
	const stopped = harness({ defer: true }), loading = stopped.manager.setLinked(stopped.player, true);
	stopped.manager.stop(); stopped.resolveLoad(); assert.equal(await loading, false); assert.equal(stopped.manager.diagnostics.active, 0);
});

test('asset failures preserve the static chain; audio settings, fallback and cast deduplication work without graphics', async () => {
	const h = harness({ fail: true }), warn = console.warn; console.warn = () => {};
	try { assert.equal(await h.manager.setLinked(h.player, true), false); } finally { console.warn = warn; }
	assert.equal(h.player.classList.contains('hh-source-chain'), false); assert.equal(h.manager.diagnostics.active, 0);
	h.lib.config.animation = false; await h.manager.setLinked(h.player, false, 'thunder'); assert.equal(h.sounds.length, 2);
	h.sounds.at(-1)[0].onError(); h.sounds.at(-2)[0].onError(); assert.deepEqual(h.sounds.at(-1), ['effect', 'link_clear']);
	h.lib.config.extension_HH优化_enable_audio_replace = false; await h.manager.setLinked(h.player, true); assert.deepEqual(h.sounds.at(-1), ['effect', 'link']);
	h.lib.config.background_audio = false; const count = h.sounds.length; h.manager.playCast(); await h.manager.setLinked(h.player, false); assert.equal(h.sounds.length, count);
	h.lib.config.background_audio = true; h.lib.config.extension_HH优化_enable_audio_replace = true; h.game.hhChainEffects = h.manager;
	const cards = createSourceCardPlayer(h.context, { document: h.document }), card = { name: 'tiesuo' }, event = { name: 'useCard', player: h.player, card };
	cards.playCard(h.player, card, { event }); cards.playCard(h.player, card, { event }); assert.equal(h.sounds.length, count + 1); assert.match(h.sounds.at(-1)[0].path, /3d_85_spell1.mp3$/);
	assert.equal(chainPlacement({}, { width: 0, height: 0 }), null);
});
