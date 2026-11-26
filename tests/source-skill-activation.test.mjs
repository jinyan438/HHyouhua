import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import vm from 'node:vm';
import { spine } from '../src/libs/spine4-core.js';
import { decodeKillCombo, KillComboRenderer } from '../src/effects/killCombo.js';
import { activationAssets, activationAsset, activationKind, resolveActivationSkill, createActivationModel, createSourceSkillActivation, setupActivationReplay } from '../src/effects/sourceSkillActivation.js';

const root = new URL('../assets/skill-activation/', import.meta.url);
const read = name => fs.readFileSync(new URL(name, root));
function original(name) {
	const bytes = read(name + '.png');
	return decodeKillCombo(spine, { action: 'play' }, read(name + '.atlas.txt').toString(), read(name + '.skel'),
		{ [name + '.png']: { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) } });
}

test('all four original skeletons and atlases retain their source hashes, actions, slots and timings', () => {
	for (const file of JSON.parse(read('sources.json')).files) {
		const bytes = read(file.file);
		assert.equal(bytes.length, file.bytes);
		assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.file);
	}
	for (const name of activationAssets) {
		const base = original(name);
		assert.equal(base.data.version, '4.0.56');
		for (const action of ['play', 'play2']) {
			const animation = base.data.findAnimation(action);
			assert.ok(animation.duration > 2 && animation.duration < 2.3);
			// Sound is played by the original character voice route, not by these timelines.
			assert.equal(animation.timelines.filter(t => t instanceof spine.EventTimeline).length, 0);
		}
		for (const slot of ['1_4xianding', '1_5juexingzi', '1_7xiandingzi']) assert.ok(base.data.findSlot(slot));
	}
});

test('awakening and limited variants keep independent portrait/text skins and render every frame', () => {
	let draws = 0;
	const gl = new Proxy({}, { get: (_, key) => key === 'getShaderParameter' || key === 'getProgramParameter' ? () => true : key === 'drawArrays' ? () => draws++ : key.startsWith('create') ? () => ({}) : () => {} });
	const renderer = new KillComboRenderer({ getContext: () => gl, getBoundingClientRect: () => ({ width: 1280, height: 720 }) });
	for (const name of activationAssets) {
		const base = original(name), region = base.data.defaultSkin.getAttachment(base.data.findSlot('1_4xianding').index, '1_4xianding').region;
		const first = createActivationModel(base, 'awakening', { '1_4xianding': { width: 512, height: 512 }, '1_5juexingzi': { width: 512, height: 512 } });
		const second = createActivationModel(base, 'limited', { '1_4xianding': { width: 512, height: 512 }, '1_7xiandingzi': { width: 512, height: 512 } });
		assert.equal(first.animation.name, 'play'); assert.equal(second.animation.name, 'play2');
		assert.notEqual(first.skeleton.skin, second.skeleton.skin);
		assert.equal(base.data.defaultSkin.getAttachment(base.data.findSlot('1_4xianding').index, '1_4xianding').region, region);
		for (const model of [first, second]) for (let t = 0; t < model.animation.duration; t += 1 / 30) renderer.draw(model, t);
	}
	assert.ok(draws > 1000);
});

function fixture({ readFailure = false } = {}) {
	const frames = new Map(), timers = new Map(), releases = [], draws = [];
	let now = 0, id = 0;
	class Element {
		constructor() { this.style = {}; this.children = []; this.isConnected = true; }
		setAttribute() {} addEventListener() {}
		appendChild(child) { child.remove(); this.children.push(child); child.parent = this; }
		remove() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; }
		getBoundingClientRect() { return { width: 1280, height: 720 }; }
		getContext() { return new Proxy({}, { get: (_, name) => name === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {} }); }
	}
	const body = new Element(), listeners = {}, lib = { config: { animation: true }, onover: [] };
	const document = { body, head: body, createElement: () => new Element(), addEventListener: (name, fn) => listeners[name] = fn };
	const player = createSourceSkillActivation({ lib, game: {}, ui: { window: body } }, {
		document, loadSpine: async () => spine, now: () => now,
		readText: async url => { if (readFailure) throw Error('fixture missing'); return read(url.split('/').pop()).toString(); },
		readBinary: async url => read(url.split('/').pop()),
		loadImage: async url => { const b = read(url.split('/').pop()); return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }; },
		createRenderer: () => ({ upload(model) { for (const name of Object.keys(model.images)) model.textures[name] = {}; }, release(model) { releases.push(Object.keys(model.textures)); }, draw(model, time) { draws.push({ model, time }); } }),
		requestFrame(fn) { frames.set(++id, fn); return id; }, cancelFrame: key => frames.delete(key),
		setTimer(fn, ms) { timers.set(++id, { fn, ms }); return id; }, clearTimer: key => timers.delete(key),
	});
	return { player, lib, document, listeners, body, frames, timers, releases, draws,
		advance(ms) { now += ms; for (const [id, fn] of [...frames]) { frames.delete(id); fn(now); } } };
}

test('overlapping plays keep full duration, release only private textures and clean up on game over', async () => {
	const h = fixture(), actor = { isConnected: true }, portrait = { width: 370, height: 370 };
	assert.equal(await h.player.play(actor, '志继', 'awakening', portrait, 'legend'), true);
	assert.equal(await h.player.play(actor, '乱武', 'limited', portrait, 'legend'), true);
	assert.equal(h.player.activeCount, 2); h.advance(1000);
	assert.deepEqual(h.draws.map(d => d.model.animation.name), ['play', 'play2']);
	assert.ok([...h.timers.values()].every(t => t.ms > 2233 && t.ms < 2400));
	h.lib.onover[0](); assert.equal(h.player.activeCount, 0); assert.equal(h.timers.size, 0); assert.equal(h.frames.size, 0);
	assert.ok(h.releases.every(keys => keys.length === 2 && keys.includes('1_4xianding')));
});

test('stopping pending loads, hidden pages, detached players, disabled animation and missing assets are handled', async () => {
	const h = fixture(), actor = { isConnected: true }, portrait = { width: 370, height: 370 };
	const loading = h.player.play(actor, '志继', 'awakening', portrait); h.player.stop();
	assert.equal(await loading, false); assert.equal(h.player.activeCount, 0);
	h.document.hidden = true; assert.equal(await h.player.play(actor, '乱武', 'limited', portrait), false);
	h.document.hidden = false; h.lib.config.animation = false; assert.equal(await h.player.play(actor, '乱武', 'limited', portrait), false);
	h.lib.config.animation = true; actor.isConnected = false; assert.equal(await h.player.play(actor, '乱武', 'limited', portrait), false);
	const failed = fixture({ readFailure: true }); assert.equal(await failed.player.play({}, '乱武', 'limited', portrait), false);
});

test('native activation entry selects the exact skill ID, preserves hooks/video/broadcast, and leaves ordinary skills on their base route', () => {
	const calls = [], lib = { config: { skill_animation_type: 'default' }, skill: { wake: { juexingji: true }, limit: { limited: true }, ordinary: {} }, translate: { wake: '志继', limit: '乱武' } };
	const player = { getSkills: () => ['wake', 'limit'] };
	const source = fs.readFileSync(new URL('../src/overrides/player/animations.js', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
	const game = { callHook: (...args) => calls.push(['hook', ...args]), addVideo: (...args) => calls.push(['video', ...args]), broadcastAll(fn, ...args) { calls.push(['broadcast', ...args]); fn(...args); } };
	const window = { decadeUI: { delay: ms => calls.push(['delay', ms]), effect: { skill: (...args) => calls.push(['effect', ...args]) } } };
	const context = vm.createContext({ lib, game, window, get: {}, _status: {}, activationKind, resolveActivationSkill,
		getBasePlayerMethods: () => ({ trySkillAnimate: (...args) => calls.push(['base', ...args]) }) });
	vm.runInContext(source, context); player.$skill = context.playerSkill;
	context.playerTrySkillAnimate.call(player, 'wake', 'wake', 'vice');
	context.playerTrySkillAnimate.call(player, 'limit', 'limit');
	assert.deepEqual(calls.filter(c => c[0] === 'effect').map(c => [c[2], c[3], c[4]]), [['志继', 'vice', 'wake'], ['乱武', 'main', 'limit']]);
	assert.equal(calls.filter(c => c[0] === 'hook').length, 2);
	assert.deepEqual(calls.filter(c => c[0] === 'video').map(c => c[3][4]), ['wake', 'limit']);
	assert.ok(calls.filter(c => c[0] === 'video').every(c => c[1] === 'hhSkillActivation'));
	game.videoContent = {}; setupActivationReplay({ game }, () => window.decadeUI.effect);
	const before = calls.filter(c => c[0] === 'video' || c[0] === 'broadcast').length;
	game.videoContent.hhSkillActivation(player, ['乱武', 'legend', 'fire', 'vice', 'limit']);
	assert.deepEqual(calls.at(-1).slice(2), ['乱武', 'vice', 'limit']);
	assert.equal(calls.filter(c => c[0] === 'video' || c[0] === 'broadcast').length, before);
	context.playerTrySkillAnimate.call(player, 'ordinary', 'ordinary');
	lib.config.skill_animation_type = 'off'; context.playerTrySkillAnimate.call(player, 'wake', 'wake');
	assert.equal(calls.filter(c => c[0] === 'base').length, 2);
	assert.equal(activationAsset('limited'), activationAssets[3]);
});
