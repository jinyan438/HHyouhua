import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import vm from 'node:vm';
import { spine } from '../src/libs/spine4-core.js';
import { decodeKillCombo, KillComboRenderer } from '../src/effects/killCombo.js';
import { damageAssets, damageEffectName, damageNumberAction, damagePlacement, createDamageNumberModel, createSourceDamageEffects } from '../src/effects/sourceDamageEffects.js';

const root = new URL('../assets/damage-effects/', import.meta.url);
const read = name => fs.readFileSync(new URL(name, root));
const flush = () => new Promise(resolve => setImmediate(resolve));
function model(name) {
	const atlas = read(`${name}/${name}.atlas.txt`).toString();
	const pages = new spine.TextureAtlas(atlas).pages.map(page => { const b = read(`${name}/${page.name}`); return [page.name, { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }]; });
	return decodeKillCombo(spine, { name }, atlas, read(`${name}/${name}.skel`), Object.fromEntries(pages));
}
function digits() {
	const atlas = new spine.TextureAtlas(read('digits.atlas.txt').toString());
	atlas.pages[0].setTexture({ setFilters() {}, setWraps() {}, getImage: () => ({ width: 500, height: 70 }) }); return atlas;
}

test('all imported assets retain their recorded hashes and every damage timeline renders at native speed', () => {
	for (const file of JSON.parse(read('sources.json')).files) assert.equal(createHash('sha256').update(read(file.file)).digest('hex'), file.sha256, file.file);
	let draws = 0, vertices;
	const gl = new Proxy({ createShader: () => ({}), createProgram: () => ({}), createBuffer: () => ({}), createTexture: () => ({}), getShaderParameter: () => true, getProgramParameter: () => true, getAttribLocation: () => 0, getUniformLocation: () => ({}), bufferData(target, value) { vertices = value; }, drawArrays() { assert.ok(vertices.every(Number.isFinite)); draws++; } }, { get: (object, key) => key in object ? object[key] : /^[A-Z_0-9]+$/.test(key) ? key : () => {} });
	const renderer = new KillComboRenderer({ getContext: () => gl, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) });
	for (const name of damageAssets) {
		const m = model(name); assert.equal(m.data.version, '4.0.56');
		renderer.upload(m);
		for (const animation of m.data.animations) {
			m.animation = animation;
			for (let i = 0; i < Math.ceil(animation.duration * 60); i++) renderer.draw(m, i / 60, { x: 200, y: 200, scale: 1 });
		}
		renderer.release(m);
	}
	assert.ok(draws > 1000);
});

test('normal hit tiers and elemental hits match the source; two and three digit values get independent slot skins', () => {
	assert.deepEqual([1, 2, 3, 4, 12].map(n => damageEffectName(n)), [damageAssets[0], damageAssets[1], damageAssets[1], damageAssets[2], damageAssets[2]]);
	assert.equal(damageEffectName(1, 'fire'), damageAssets[3]); assert.equal(damageEffectName(2, ['thunder']), damageAssets[4]); assert.equal(damageEffectName(4, 'ice'), damageAssets[5]);
	const base = model('baojishuzhi'), atlas = digits();
	for (const n of [2, 3, 4, 9, 10, 27, 99, 100, 258, 999]) {
		const m = createDamageNumberModel(base, n, atlas), values = String(n).split('').map(Number);
		assert.equal(m.animation.name, damageNumberAction(n));
		const slots = values.length === 1 ? [[3, 7]] : values.length === 2 ? [[3, 7], [4, 8]] : [[3, 7], [4, 8], [5, 9]];
		for (let i = 0; i < slots.length; i++) for (const slot of slots[i]) {
			const entry = m.skeleton.skin.getAttachments().find(a => a.slotIndex === slot);
			assert.equal(entry.attachment.region.name, 'baoji_' + values[i]); assert.equal(entry.attachment.width, 50);
		}
		assert.equal(base.data.defaultSkin.getAttachments().find(a => a.slotIndex === 3).attachment.region.name, '1shuzi/1shuzi_00010');
	}
	assert.deepEqual(damagePlacement({ left: 10, top: 20 }, { left: 100, top: 200, width: 87, height: 116 }), { x: 133.5, y: 238, scale: .5 });
});

function harness({ fail = false, defer = false } = {}) {
	let time = 0, id = 0, resolveLoad;
	const gate = defer ? new Promise(resolve => { resolveLoad = resolve; }) : Promise.resolve();
	const timers = new Map(), frames = new Map(), listeners = {}, drawn = [];
	class Element {
		constructor(rect = { left: 0, top: 0, width: 800, height: 600 }) { this.rect = rect; this.style = {}; this.children = []; this.isConnected = true; }
		getBoundingClientRect() { return this.rect; }
		setAttribute() {} addEventListener() {}
		appendChild(node) { node.remove(); node.parentNode = this; this.children.push(node); }
		remove() { if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; }
		animate(keyframes, options) { const result = { cancelled: false, cancel() { this.cancelled = true; } }; this.motion = { keyframes, options, result }; return result; }
	}
	const parent = new Element(), player = new Element({ left: 200, top: 100, width: 174, height: 232 });
	const document = { body: parent, hidden: false, createElement: () => new Element(), addEventListener(name, fn) { listeners[name] = fn; } };
	const lib = { config: { animation: true }, arenaReady: [], onover: [] }, game = {}, context = { lib, game, ui: { window: parent } };
	const filename = url => url.slice(url.indexOf('assets/damage-effects/') + 'assets/damage-effects/'.length);
	const manager = createSourceDamageEffects(context, {
		document, now: () => time, loadSpine: async () => { await gate; return spine; },
		readText: async url => { if (fail) throw Error('load fixture'); return read(filename(url)).toString(); }, readBinary: async url => read(filename(url)),
		loadImage: async url => { const b = read(filename(url)); return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }; },
		createRenderer: () => ({ upload() {}, draw(model, elapsed, placement) { drawn.push({ model, elapsed, placement }); } }),
		setTimer(fn, ms) { timers.set(++id, { fn, due: time + ms }); return id; }, clearTimer(handle) { timers.delete(handle); },
		requestFrame(fn) { frames.set(++id, fn); return id; }, cancelFrame(handle) { frames.delete(handle); },
	});
	function advance(ms) {
		time += ms;
		for (const [id, timer] of [...timers]) if (timer.due <= time) { timers.delete(id); timer.fn(); }
		for (const [id, fn] of [...frames]) { frames.delete(id); fn(time); }
	}
	return { manager, lib, game, player, parent, document, listeners, timers, frames, drawn, advance, resolveLoad, context };
}

test('hit impact starts the number after 180 ms; overlapping players and independent numbers survive through their final frame', async () => {
	const h = harness(); h.manager.play(h.player, 2, 'fire'); await flush(); h.advance(179); await flush();
	assert.equal(h.drawn.at(-1).model.metadata.name, damageAssets[3]); assert.equal(h.drawn.some(d => d.model.metadata.name === 'baojishuzhi'), false);
	h.advance(1); await flush(); h.advance(100);
	assert.equal(h.drawn.filter(d => d.model.metadata.name === 'baojishuzhi').at(-1).model.animation.name, 'play');
	assert.equal(h.player.motion.options.duration, 160);
	assert.equal(await h.manager.number(h.player, 27), true); assert.equal(await h.manager.number(h.player, 258), true);
	h.advance(100); assert.equal(h.manager.diagnostics.active, 4);
	const numbers = h.drawn.filter(d => d.model.metadata.name === 'baojishuzhi');
	assert.equal(new Set(numbers.map(d => d.model.skeleton)).size, 3);
	h.advance(2000); assert.equal(h.manager.diagnostics.active, 0); assert.equal(h.frames.size, 0); assert.equal(h.parent.children.length, 0);
});

test('single damage has no big number; thunder impact uses 160 ms for 2–3 damage; animation switches and cancellation suppress late loads', async () => {
	const h = harness(); h.manager.play(h.player, 1); await flush(); h.advance(180); await flush(); assert.equal(h.manager.diagnostics.active, 1);
	h.manager.stop(); h.manager.play(h.player, 3, 'thunder'); await flush(); h.advance(159); await flush(); assert.equal(h.manager.diagnostics.active, 1);
	h.advance(1); await flush(); assert.equal(h.manager.diagnostics.active, 2);
	h.document.hidden = true; h.listeners.visibilitychange(); assert.equal(h.manager.diagnostics.active, 0); assert.equal(h.manager.diagnostics.waits, 0); assert.equal(h.timers.size + h.frames.size, 0); assert.equal(h.player.motion.result.cancelled, true);
	h.document.hidden = false; h.lib.config.animation = false; assert.equal(h.manager.play(h.player, 2), false);
	const late = harness({ defer: true }); late.manager.play(late.player, 4); late.manager.stop(); late.resolveLoad(); await flush(); late.advance(2000); await flush(); assert.equal(late.manager.diagnostics.active + late.manager.diagnostics.waits, 0);
});

test('asset failure preserves the damage value and game over removes its fallback', async () => {
	const h = harness({ fail: true }), warn = console.warn; console.warn = () => {};
	try { assert.equal(await h.manager.number(h.player, 27), true); assert.equal(h.player.children[0].textContent, '-27'); h.lib.onover[0](); assert.equal(h.player.children.length, 0); assert.equal(h.timers.size, 0); }
	finally { console.warn = warn; }
});

test('actual override records and broadcasts once, suppresses the old hit/shake, and leaves healing and independent flame calls intact', () => {
	const log = [], status = { event: { name: 'damage' } };
	const game = { addVideo: (...args) => log.push(['video', ...args]), broadcast: (...args) => log.push(['broadcast', ...args]) };
	const source = fs.readFileSync(new URL('../src/overrides/player/animations.js', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
	const realm = vm.createContext({ game, lib: {}, ui: {}, _status: status, get: { itemtype: () => '' }, setupSourceDamageEffects: () => ({ play: (...args) => log.push(['damage', ...args]) }), getDui: () => ({ animation: { playSpine: (...args) => log.push(['legacy', ...args]) } }), getBasePlayerMethods: () => ({ $fire: () => log.push(['fire']), $thunder: () => log.push(['thunder']) }) });
	vm.runInContext(source, realm); const player = {};
	realm.playerDamage.call(player); realm.playerDamagepop.call(player, -2, 'fire'); realm.playerDamageFire.call(player); realm.playerDamageThunder.call(player);
	assert.equal(log.filter(r => r[0] === 'damage').length, 1); assert.equal(log.filter(r => r[0] === 'legacy' || r[0] === 'fire' || r[0] === 'thunder').length, 0);
	assert.equal(log.filter(r => r[0] === 'broadcast').length, 2); assert.equal(log.filter(r => r[0] === 'video').length, 2);
	log.length = 0; realm.playerDamagepop.call(player, -27, 'ice', false, false); assert.equal(log.some(r => r[0] === 'broadcast'), false);
	status.event.unreal = true; log.length = 0; realm.playerDamagepop.call(player, -2); assert.equal(log.some(r => r[0] === 'damage'), false);
	realm.playerDamagepop.call(player, 1, 'wood'); assert.equal(log.filter(r => r[0] === 'legacy').length, 1);
	status.event = {}; realm.playerDamageFire.call(player); realm.playerDamageThunder.call(player); assert.equal(log.filter(r => r[0] === 'fire' || r[0] === 'thunder').length, 2);
});
