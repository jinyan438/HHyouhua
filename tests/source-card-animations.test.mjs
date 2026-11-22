import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { spine } from '../src/libs/spine4-core.js';
import { decodeKillCombo, KillComboRenderer } from '../src/effects/killCombo.js';
import { sourceCards, sourceCardAssets, sourceCardNatures, sourceCardSkills } from '../src/effects/sourceCardAssets.js';
import { createSourceCardPlayer, setupSourceCardAnimations, sourceCardEffect, sourceCardPlacement, replacedCardEffectNames } from '../src/effects/sourceCardAnimations.js';
import { setupSettlementOptimization } from '../src/features/settlementOptimization.js';

const assetRoot = new URL('../assets/card-effects/', import.meta.url);
const flush = () => new Promise(resolve => setImmediate(resolve));
function readModel(metadata) {
	const read = name => fs.readFileSync(new URL(metadata.folder + '/' + name, assetRoot));
	const images = Object.fromEntries(metadata.pages.map(name => { const bytes = read(name); return [name, { name: metadata.folder + '/' + name, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }]; }));
	return decodeKillCombo(spine, metadata, read(metadata.name + '.atlas.txt').toString('utf8'), read(metadata.name + '.skel'), images);
}

test('coverage is derived from the actual standard/extra packs: 32 + 10 entity types', () => {
	for (const [pack, count] of [['standard', 32], ['extra', 10]]) {
		const file = new URL(`../../../card/${pack}.js`, import.meta.url);
		const source = ts.createSourceFile(pack + '.js', fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
		const definition = source.statements.find(ts.isExportAssignment).expression;
		const cardNames = new Set(definition.properties.find(prop => prop.name?.getText(source) === 'card').initializer.properties.map(prop => prop.name.getText(source)));
		const list = definition.properties.find(prop => prop.name?.getText(source) === 'list').initializer;
		const entities = [...new Set(list.elements.map(row => row.elements[2].text))].filter(name => cardNames.has(name)).sort();
		const actual = sourceCards.filter(card => card.pack === pack).map(card => card.name).sort();
		assert.equal(actual.length, count); assert.deepEqual(actual, entities);
	}
	for (const card of [{ name: 'sha' }, { name: 'sha', nature: 'fire' }, { name: 'sha', nature: 'thunder' }, { name: 'shan' }]) assert.equal(sourceCardEffect(card), null);
	assert.equal(sourceCardEffect({ name: 'sha', nature: ['ice'] }), sourceCardNatures.ice);
	assert.equal(sourceCardEffect({ name: 'unrelated_card' }), null);
});

test('all 196 original files retain their hashes and all 63 skeletons load every page', () => {
	const provenance = JSON.parse(fs.readFileSync(new URL('sources.json', assetRoot), 'utf8'));
	assert.equal(provenance.files.length, 196);
	for (const file of provenance.files) assert.equal(createHash('sha256').update(fs.readFileSync(new URL(file.file, assetRoot))).digest('hex'), file.sha256, file.file);
	assert.equal(sourceCardAssets.length, 63);
	assert.equal(sourceCardAssets.reduce((total, asset) => total + asset.pages.length, 0), 70);
	for (const metadata of sourceCardAssets) {
		const model = readModel(metadata);
		assert.equal(model.data.version, '4.0.56'); assert.equal(model.animation.duration, metadata.duration);
		assert.equal(model.atlas.pages.length, metadata.pages.length); assert.ok(metadata.bounds.every(Number.isFinite));
	}
});

test('actual card renderer samples all 63 timelines at 30 fps and composes multiple anchors without clearing earlier effects', () => {
	let draws = 0, clears = 0, vertices, texture, meshDraws = 0;
	const gl = new Proxy({
		createShader: () => ({}), createProgram: () => ({}), createBuffer: () => ({}), createTexture: () => ({}),
		getShaderParameter: () => true, getProgramParameter: () => true, getAttribLocation: () => 0, getUniformLocation: () => ({}),
		bindTexture(target, value) { texture = value; },
		texImage2D(...args) { texture.source = args.at(-1); },
		bufferData(target, value) { vertices = value; },
		clear() { clears++; },
		drawArrays(mode, start, count) { assert.ok(vertices.every(Number.isFinite)); assert.equal(vertices.length, count * 4); assert.ok(texture); draws++; if (count > 6) meshDraws++; },
	}, { get: (target, key) => key in target ? target[key] : /^[A-Z_0-9]+$/.test(key) ? key : () => {} });
	const rect = { left: 20, top: 15, width: 1280, height: 720 };
	const renderer = new KillComboRenderer({ getContext: () => gl, getBoundingClientRect: () => rect });
	let poses = 0;
	for (const metadata of sourceCardAssets) {
		const model = readModel(metadata); renderer.upload(model);
		const placement = sourceCardPlacement(metadata, rect, { left: 800, top: 100, width: 140, height: 190 });
		for (let i = 0; i <= Math.ceil(metadata.duration * 30); i++) { renderer.draw(model, i / 30, placement); poses++; }
		const before = clears;
		renderer.draw(model, metadata.duration * .4, { ...placement, clear: false }); assert.equal(clears, before);
		const full = sourceCardPlacement(metadata, rect, null, true); assert.ok(full.scale > 0 && Number.isFinite(full.x));
		renderer.release(model);
	}
	assert.ok(poses > 3000); assert.ok(draws > 10000); assert.ok(meshDraws > 1000);
});

function harness({ fail = false, graphicsFail = false } = {}) {
	let clock = 0, nextId = 0;
	const frames = new Map(), timers = new Map(), uploaded = [], released = [], drawn = [], audio = [], log = [];
	class Element {
		constructor(rect = { left: 0, top: 0, width: 1280, height: 720 }) { this.rect = rect; this.style = {}; this.children = []; this.isConnected = true; this.listeners = {}; }
		setAttribute() {}
		addEventListener(type, callback) { this.listeners[type] = callback; }
		getBoundingClientRect() { return this.rect; }
		appendChild(child) { child.remove(); this.children.push(child); child.parent = this; }
		remove() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; }
		popup(...args) { log.push(args); }
	}
	const parent = new Element(), actor = new Element({ left: 50, top: 400, width: 130, height: 200 });
	const victim = new Element({ left: 900, top: 50, width: 140, height: 190 });
	const document = { body: parent, hidden: false, createElement: () => new Element(), addEventListener() {} };
	const pathFor = url => new URL(url.slice(url.indexOf('assets/card-effects/') + 'assets/card-effects/'.length), assetRoot);
	const lib = { config: { animation: true, show_card_prompt: true }, animate: { card: {}, skill: {} }, skill: {}, onover: [], arenaReady: [] };
	const game = { players: [actor, victim], playAudio: (...args) => audio.push(args), finishSkill() {}, broadcastAll: (callback, ...args) => callback(...args) };
	const context = { lib, game, ui: { window: parent }, get: { nature: card => card.nature, type: () => 'basic' }, _status: {} };
	const player = createSourceCardPlayer(context, {
		document, loadSpine: async () => spine,
		readText: async url => { if (fail) throw new Error('fixture failure'); return fs.readFileSync(pathFor(url), 'utf8'); },
		readBinary: async url => fs.readFileSync(pathFor(url)),
		loadImage: async url => { const data = fs.readFileSync(pathFor(url)); return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) }; },
		createRenderer() {
			if (graphicsFail) throw new Error('fixture no graphics');
			return {
				upload(model) { uploaded.push(model.metadata.id); model.textures = { fixture: {} }; },
				release(model) { released.push(model.metadata.id); model.textures = {}; },
				draw(model, time, placement) { drawn.push({ model, time, placement }); },
			};
		},
		now: () => clock,
		requestFrame(callback) { frames.set(++nextId, callback); return nextId; }, cancelFrame: id => frames.delete(id),
		setTimer(callback, delay) { timers.set(++nextId, { callback, due: clock + delay }); return nextId; }, clearTimer: id => timers.delete(id),
	});
	game.hhCardEffects = player;
	function advance(ms, animate = true) {
		clock += ms;
		if (animate) for (const [id, callback] of [...frames]) { frames.delete(id); callback(clock); }
		for (const [id, timer] of [...timers]) if (timer.due <= clock) { timers.delete(id); timer.callback(); }
	}
	return { context, player, actor, victim, parent, audio, log, uploaded, released, drawn, advance, frames, timers };
}

test('settlement toggle preserves real healing, fire/thunder, trick and equipment Spine timelines until their final frame', async () => {
	const results = [];
	const ids = [...['tao', 'jiu', 'wuzhong', 'huogong', 'tiesuo', 'shandian', 'bagua'].map(name => sourceCards.find(card => card.name === name).effect), sourceCardNatures.fire, sourceCardNatures.thunder];
	for (const enabled of [false, true]) {
		const h = harness(), samples = [];
		h.context.game.delayx = () => 'native-display'; h.context.game.delay = () => 'native-display';
		setupSettlementOptimization(h.context, { enable_settlement_optimize: enabled });
		h.context._status.event = { name: 'useCard' };
		for (const id of ids) {
			assert.equal(await h.player.playAsset(id, h.actor), true);
			assert.equal(h.context.game.delayx(), 'native-display'); h.advance(100);
			const draw = h.drawn.at(-1), duration = draw.model.animation.duration;
			assert.ok(Math.abs(draw.time - .1) < 1e-8); samples.push({ id, duration, time: draw.time });
			h.advance(duration * 1000 - 101); assert.equal(h.player.diagnostics.active, 1, id);
			h.advance(2); assert.equal(h.player.diagnostics.active, 0, id); assert.equal(h.timers.size, 0);
		}
		results.push(samples); h.player.stop();
	}
	assert.deepEqual(results[0], results[1]);
});

test('normal/view-as clone hooks deduplicate the same event but preserve independent uses and responses', async () => {
	const h = harness(), card = { name: 'tao' }, event = { name: 'useCard', player: h.actor, card, targets: [h.victim] };
	assert.equal(h.player.playCard(h.actor, card, { event }), true);
	assert.equal(h.player.playCard(h.actor, { ...card }, { event }), true);
	await flush(); assert.equal(h.player.diagnostics.active, 1);
	h.player.playCard(h.actor, card, { event: { ...event } });
	h.player.playCard(h.actor, { name: 'jiu' }, { event: { name: 'respond', player: h.actor, card: { name: 'jiu' } } });
	await flush(); assert.equal(h.player.diagnostics.active, 3);
	h.advance(100); assert.equal(h.drawn.length, 3); assert.equal(h.drawn.filter(draw => draw.placement.clear).length, 1);
	assert.equal(new Set(h.drawn.map(draw => draw.model.skeleton)).size, 3, 'Each concurrent effect has an independent pose');
	assert.equal(h.audio.length, 0, 'Do not replace or duplicate the game card voice');
	h.advance(4000); assert.equal(h.player.diagnostics.active, 0); assert.equal(h.parent.children.length, 0);
});

test('non-delay tricks play once at the displayed used card, follow its layout and retain their individual sizes', async () => {
	const h = harness(); setupSourceCardAnimations(h.context);
	const names = ['wugu', 'taoyuan', 'nanman', 'wuzhong', 'juedou', 'jiedao', 'wuxie', 'huogong', 'tiesuo'];
	const nodes = names.map((name, i) => ({ isConnected: true, rect: { left: 360 + i * 30, top: 280, width: 120, height: 168 }, getBoundingClientRect() { return this.rect; } }));
	for (const [i, name] of names.entries()) {
		const card = { name }, event = { name: 'useCard', player: h.actor, card, targets: [h.actor, h.victim] };
		h.context._status.event = event;
		h.context.lib.animate.card[name].call(h.actor, card);
		assert.equal(h.player.playCard(h.actor, card, { event, cardNode: nodes[i] }), true);
		assert.equal(h.player.playCard(h.actor, card, { event, cardNode: nodes[i] }), true);
	}
	await flush(); h.advance(100); assert.equal(h.player.diagnostics.active, names.length);
	const check = () => {
		for (const [i, name] of names.entries()) {
			const draw = h.drawn.findLast(draw => draw.model.metadata.id === sourceCardEffect({ name }));
			const [left, bottom, right, top] = draw.model.metadata.bounds;
			assert.ok(Math.abs(draw.placement.x + (left + right) / 2 * draw.placement.scale - (nodes[i].rect.left + nodes[i].rect.width / 2)) < 1e-6, name);
			assert.ok(Math.abs(draw.placement.y - (bottom + top) / 2 * draw.placement.scale - (nodes[i].rect.top + nodes[i].rect.height / 2)) < 1e-6, name);
			if (name === 'huogong') assert.equal(draw.placement.scale, sourceCardPlacement(draw.model.metadata, h.parent.rect, null, 'center').scale * .8);
			if (name === 'juedou' || name === 'wuxie') assert.equal(draw.placement.scale, sourceCardPlacement(draw.model.metadata, h.parent.rect, nodes[i].rect).scale * 1.6);
		}
	};
	check();
	for (const node of nodes) node.rect.left += 75;
	h.actor.rect.left += 200; h.victim.rect.left -= 200; h.advance(50); check();
	for (const node of nodes) node.isConnected = false;
	h.advance(50); check();
	h.player.stop(); assert.equal(h.frames.size, 0); assert.equal(h.timers.size, 0);
});

test('active effects are cancellable, hidden-frame cleanup works, and cache is bounded by 6 models/16M atlas pixels', async () => {
	const h = harness();
	for (const card of sourceCards) {
		h.player.playCard(h.actor, card);
		await flush(); h.advance(4000, false);
		assert.equal(h.player.diagnostics.active, 0);
		assert.ok(h.player.diagnostics.cached <= 6); assert.ok(h.player.diagnostics.pixels <= 16 * 1024 * 1024);
	}
	const pending = h.player.playAsset(sourceCardNatures.fire, h.actor); h.player.stop();
	assert.equal(await pending, false); assert.equal(h.parent.children.length, 0);
	h.actor.isConnected = false;
	assert.equal(await h.player.playAsset(sourceCardNatures.thunder, h.actor), false);
});

test('load/graphics failures fall back once without changing card audio or gameplay', async t => {
	t.mock.method(console, 'warn', () => {});
	for (const options of [{ fail: true }, { graphicsFail: true }]) {
		const h = harness(options); let fallback = 0;
		h.player.playCard(h.actor, { name: 'tao' }, { onFallback: () => fallback++ });
		await flush(); assert.equal(fallback, 1); assert.equal(h.audio.length, 0); assert.equal(h.parent.children.length, 0);
		assert.equal(h.player.playCard(h.actor, { name: 'tao' }), false);
	}
});

test('registration preserves Shan and installs the other 41 hooks without touching card rule objects', async () => {
	const h = harness(), calls = [];
	const legacy = function (...args) { calls.push({ actor: this, args }); };
	h.context.lib.animate.card.nanman = legacy;
	const rules = { sha: { damage: 1 }, bingliang: { effect: () => 'original skip logic' } };
	h.context.lib.card = rules;
	setupSourceCardAnimations(h.context);
	assert.equal(Object.keys(h.context.lib.animate.card).length, 41);
	assert.equal(h.context.lib.animate.card.shan, undefined);
	assert.ok(Object.keys(sourceCardSkills).every(name => h.context.lib.animate.skill[name]._hhSourceCard));
	assert.equal(h.context.lib.card, rules);
	const wrapper = h.context.lib.animate.card.nanman; setupSourceCardAnimations(h.context); assert.equal(h.context.lib.animate.card.nanman, wrapper);
	h.context.lib.config.animation = false;
	wrapper.call(h.actor, { name: 'nanman' }); assert.equal(calls.length, 1); assert.equal(calls[0].actor, h.actor);
	h.context.lib.animate.card.sha.call(h.actor, { name: 'sha' }, 'sha', 'metal'); assert.deepEqual(h.log.at(-1), ['sha', 'metal', false]);
	const hit = h.context.lib.skill._hh_source_card_hit;
	assert.equal(hit.filter({ card: { name: 'sha' } }), false);
	h.context.lib.config.animation = true; assert.equal(hit.filter({ card: { name: 'sha' } }), false);
	assert.equal(hit.filter({ card: { name: 'sha', nature: 'ice' } }), true);
});

test('direct equips get the new animation; the equipAfter hook does not replay a card already shown by useCard', async () => {
	const h = harness(); setupSourceCardAnimations(h.context);
	const card = { name: 'chitu' }, event = { name: 'useCard', player: h.actor, card };
	h.player.playCard(h.actor, card, { event }); await flush();
	const hook = h.context.lib.skill._hh_source_card_equip;
	assert.equal(hook.filter({ card }), true); assert.equal(hook.filter({ card: { name: 'sha' } }), false);
	await hook.content({}, { card, player: h.actor, getParent: () => event }); await flush();
	assert.equal(h.player.diagnostics.active, 1);
	await hook.content({}, { card: { name: 'dilu' }, player: h.victim, getParent: () => null }); await flush();
	assert.equal(h.player.diagnostics.active, 2);
	h.context.lib.skill._hh_source_card_hit.content({}, { card: { name: 'sha' }, player: h.victim, nature: 'ice' }); await flush();
	assert.equal(h.player.diagnostics.active, 3);
	h.player.stop();
});

test('the actual thrown-card hook routes view-as cards to the new player while preserving labels and event context', () => {
	const source = fs.readFileSync(new URL('../src/ui/card-utils.js', import.meta.url), 'utf8');
	const start = source.indexOf('function handleDefaultTag');
	const current = {}, event = { name: 'respond', card: { name: 'tao' } }, plays = [], legacy = [];
	const context = vm.createContext({
		lib: { config: { cardtempname: 'off' } }, _status: { event: current },
		get: { cardsetion: () => '原有标签', nature: () => '', number: () => 7, suit: () => 'spade' },
		game: { hhCardEffects: { handles: card => card.name === 'tao', playCard: (...args) => { plays.push(args); return true; } } },
	});
	vm.runInContext(source.slice(start) + '\nglobalThis.routeCard = handleDefaultTag;', context);
	const card = { name: 'sha', dataset: { views: '1' } }, actor = {};
	const label = context.routeCard(card, actor, event, { animation: { cap: { playSpineTo: (...args) => legacy.push(args) } } });
	assert.equal(label, '原有标签'); assert.equal(context._status.event, current);
	assert.equal(plays.length, 1); assert.equal(plays[0][0], actor); assert.equal(plays[0][1], event.card); assert.equal(plays[0][2].event, event);
	assert.equal(plays[0][2].cardNode, card);
	assert.equal(legacy.length, 0);
});

test('normal/fire/thunder Sha and Shan use the actual original clone effects without imported cast or hit overlays', async () => {
	const h = harness(), originals = [], legacy = [];
	const shan = function (...args) { originals.push({ actor: this, args }); };
	h.context.lib.animate.card.shan = shan;
	setupSourceCardAnimations(h.context);
	assert.equal(h.context.lib.animate.card.shan, shan);
	Object.assign(h.context.lib.config, { cardtempname: 'off' });
	Object.assign(h.context.get, { cardsetion: () => '原有标签', number: () => 7, suit: () => 'spade', color: card => card.color });
	const source = fs.readFileSync(new URL('../src/ui/card-utils.js', import.meta.url), 'utf8')
		.replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
	const context = vm.createContext(h.context);
	vm.runInContext(source + '\nglobalThis.routeCard = handleDefaultTag;', context);
	const cases = [
		[{ name: 'sha', color: 'black' }, 'effect_heisha'],
		[{ name: 'sha', color: 'red' }, 'effect_hongsha'],
		[{ name: 'sha', nature: 'fire' }, 'effect_huosha'],
		[{ name: 'sha', nature: 'thunder' }, 'effect_leisha'],
		[{ name: 'shan' }, 'effect_shan'],
	];
	for (const [card, key] of cases) {
		assert.equal(h.player.handles(card), false);
		assert.equal(replacedCardEffectNames.has(key), false, 'Original effect remains eligible for preloading');
		for (const name of ['useCard', 'respond']) {
			const event = { name, card: { ...card, cards: [{}] }, player: h.actor, targets: [h.victim] };
			h.context._status.event = event;
			h.context.lib.animate.card[card.name].call(h.actor, event.card, card.name, 'metal');
			assert.equal(h.player.playCard(h.actor, event.card, { event }), false);
			const clone = { name: 'sha', color: card.color, dataset: { views: '1' } };
			const label = context.routeCard(clone, h.actor, event, { animation: { cap: { playSpineTo: (...args) => legacy.push(args) } } });
			assert.equal(label, '原有标签');
			assert.equal(legacy.at(-1)[0], clone); assert.equal(legacy.at(-1)[1], key);
		}
		if (card.name === 'sha') {
			assert.equal(h.context.lib.skill._hh_source_card_hit.filter({ card }), false);
			assert.equal(await h.player.playHit(h.victim, card.nature), false);
		}
	}
	await flush();
	assert.equal(legacy.length, 10); assert.equal(originals.length, 2);
	assert.ok(originals.every(call => call.actor === h.actor));
	assert.equal(h.player.diagnostics.active, 0); assert.equal(h.uploaded.length, 0);
	assert.equal(h.player.handles({ name: 'sha', nature: 'ice' }), true);
	assert.equal(h.context.lib.skill._hh_source_card_hit.filter({ card: { name: 'sha', nature: 'ice' }, nature: 'fire' }), false);
	assert.equal(await h.player.playHit(h.victim, 'ice'), true);
	h.player.stop();
});

test('Guohe and Wanjian suppress both imported and legacy effects even when graphics or animations are disabled', async t => {
	t.mock.method(console, 'warn', () => {});
	const h = harness({ graphicsFail: true }), legacy = [];
	for (const name of ['guohe', 'wanjian']) h.context.lib.animate.card[name] = () => legacy.push(name);
	setupSourceCardAnimations(h.context);
	Object.assign(h.context.lib.config, { cardtempname: 'off' });
	Object.assign(h.context.get, { cardsetion: () => '', number: () => 7, suit: () => 'spade' });
	const source = fs.readFileSync(new URL('../src/ui/card-utils.js', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
	const context = vm.createContext(h.context);
	vm.runInContext(source + '\nglobalThis.routeCard = handleDefaultTag;', context);
	assert.equal(await h.player.playAsset(sourceCardNatures.ice, h.actor), false);
	for (const animation of [true, false]) {
		h.context.lib.config.animation = animation;
		for (const name of ['guohe', 'wanjian']) {
			const card = { name }, event = { name: 'useCard', player: h.actor, card };
			assert.equal(h.player.handles(card), true);
			h.context.lib.animate.card[name].call(h.actor, card);
			context.routeCard({ name, dataset: { views: '1' } }, h.actor, event, { animation: { cap: { playSpineTo: (...args) => legacy.push(args) } } });
		}
	}
	await flush(); assert.deepEqual(legacy, []); assert.equal(h.uploaded.length, 0); assert.equal(h.player.diagnostics.active, 0);
});

test('actual Shunshou content stays silent on cast and plays at its used card only after a direct successful gain', async () => {
	const h = harness(); setupSourceCardAnimations(h.context);
	const hook = h.context.lib.skill._hh_source_card_steal;
	const card = { name: 'shunshou', cards: [{ cardid: 'used-shunshou' }] };
	const event = { name: 'useCard', card, player: h.actor };
	const node = { isConnected: true, getBoundingClientRect: () => ({ left: 540, top: 270, width: 120, height: 168 }) };
	h.player.playCard(h.actor, card, { event, cardNode: node });
	await flush(); assert.equal(h.player.diagnostics.active, 0); assert.equal(h.uploaded.length, 0);
	const pack = ts.createSourceFile('standard.js', fs.readFileSync(new URL('../../../card/standard.js', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
	const definition = pack.statements.find(ts.isExportAssignment).expression;
	const cards = definition.properties.find(prop => prop.name?.getText(pack) === 'card').initializer;
	const shunshou = cards.properties.find(prop => prop.name.getText(pack) === 'shunshou').initializer;
	const content = shunshou.properties.find(prop => prop.name.getText(pack) === 'content').getText(pack).replace(/^async\s+content\s*\(/, 'async function(');
	h.context.get.is = { single: () => false };
	h.context.lib.card = { shunshou: { ai: { button: () => 0 } } };
	const effect = { name: 'shunshou', card, player: h.actor, target: h.victim };
	const take = { name: 'gainPlayerCard', player: h.actor, target: h.victim, getParent: () => effect };
	const gained = { name: 'gain', player: h.actor, cards: [{ cardid: 'gained' }], getParent: () => take };
	let attempts = 0;
	h.victim.countGainableCards = () => 1;
	h.actor.gainPlayerCard = (position, target, forced) => {
		assert.equal(position, 'hej'); assert.equal(target, h.victim); assert.equal(forced, true); attempts++;
		return { set() { return this; }, then(resolve, reject) {
			Promise.resolve().then(async () => { if (hook.filter(gained)) await hook.content({}, gained); resolve(); }).catch(reject);
		} };
	};
	const context = vm.createContext(h.context);
	vm.runInContext('globalThis.useShunshou = (' + content + ');', context);
	const resolution = context.useShunshou(effect, null, h.actor);
	assert.equal(h.player.diagnostics.active, 0, 'Selecting the card does not animate yet');
	await resolution; await flush(); h.advance(40);
	assert.equal(attempts, 1); assert.equal(h.player.diagnostics.active, 1);
	const draw = h.drawn.at(-1), expected = sourceCardPlacement(draw.model.metadata, h.parent.rect, node.getBoundingClientRect());
	assert.equal(draw.model.metadata.id, sourceCardEffect(card)); assert.equal(draw.placement.x, expected.x); assert.equal(draw.placement.y, expected.y);
	assert.equal(hook.filter(gained), false); await hook.content({}, gained); await flush(); assert.equal(h.player.diagnostics.active, 1);
	assert.equal(hook.filter({ ...gained, cards: [] }), false);
	assert.equal(hook.filter({ ...gained, getParent: () => ({ ...take, getParent: () => ({ ...effect, name: 'guohe' }) }) }), false);
	assert.equal(hook.filter({ ...gained, getParent: () => ({ name: 'draw', getParent: () => effect }) }), false);
	assert.equal(hook.filter({ ...gained, player: h.victim }), false);
	h.player.stop();
	h.victim.countGainableCards = () => 0;
	await context.useShunshou(effect, null, h.actor); await flush();
	assert.equal(attempts, 1); assert.equal(h.player.diagnostics.active, 0, 'No obtainable card means no effect');
});

function judgmentHarness(h, changban = false) {
	const source = fs.readFileSync(new URL('../src/animation/configs/cardTriggers.js', import.meta.url), 'utf8')
		.replace(/^import .*;\r?\n/gm, '').replace('export const cardTriggers', 'const cardTriggers');
	const actions = [];
	h.victim.skip = phase => actions.push(['skip', phase]);
	h.victim.damage = (...args) => actions.push(['damage', ...args]);
	h.victim.addJudgeNext = card => actions.push(['transfer', card]);
	h.victim.addTempSkill = skill => actions.push(['tempSkill', skill]);
	h.context.get.is = { changban: () => changban };
	const context = vm.createContext({ ...h.context, result: { bool: true }, player: h.victim, card: null });
	vm.runInContext(source + '\nglobalThis.delayedEffects = cardTriggers;', context);
	return { context, actions };
}

test('delay tricks do not animate on use/respond and play only after the actual successful judgment branch', async () => {
	for (const name of ['lebu', 'bingliang', 'shandian']) {
		const h = harness(); setupSourceCardAnimations(h.context);
		const card = { name }, event = { name: 'useCard', player: h.actor, card, targets: [h.victim] };
		h.context._status.event = event;
		h.context.lib.animate.card[name].call(h.actor, card, name, 'metal');
		assert.equal(h.player.playCard(h.actor, card, { event }), true);
		assert.equal(h.player.playCard(h.actor, card, { event: { ...event, name: 'respond' } }), true);
		await flush(); assert.equal(h.player.diagnostics.active, 0); assert.equal(h.uploaded.length, 0);
		const judgment = judgmentHarness(h); judgment.context.card = card;
		judgment.context.delayedEffects[name].effect();
		await flush(); assert.equal(h.player.diagnostics.active, 0, name + ' ineffective judgment must not animate');
		if (name === 'shandian') assert.deepEqual(judgment.actions, [['transfer', card]]);
		else assert.deepEqual(judgment.actions, []);
		judgment.actions.length = 0; judgment.context.result = { bool: false };
		judgment.context.delayedEffects[name].effect();
		await flush(); assert.equal(h.player.diagnostics.active, 1, name + ' effective judgment plays one animation');
		h.advance(30);
		const draw = h.drawn.at(-1);
		assert.equal(draw.model.metadata.id, sourceCardSkills[name]);
		const expected = sourceCardPlacement(draw.model.metadata, h.parent.rect, h.victim.rect, false, { size: name === 'lebu' ? .8 : 1 });
		assert.equal(draw.placement.x, expected.x);
		assert.equal(draw.placement.y, expected.y);
		assert.equal(draw.placement.scale, expected.scale);
		assert.deepEqual(judgment.actions, name === 'lebu' ? [['skip', 'phaseUse']] : name === 'bingliang' ? [['skip', 'phaseDraw']] : [['damage', 3, 'thunder', 'nosource']]);
		h.player.stop();
	}
});

test('Changban supply-shortage judgment plays its effect while retaining its original temporary skill', async () => {
	const h = harness(); setupSourceCardAnimations(h.context);
	const judgment = judgmentHarness(h, true); judgment.context.result = { bool: false };
	judgment.context.delayedEffects.bingliang.effect(); await flush();
	assert.equal(h.player.diagnostics.active, 1);
	assert.deepEqual(judgment.actions, [['tempSkill', 'bingliang_changban']]);
	h.player.stop();
});

test('fire attack falls back to the arena center when no used-card node is available and adapts to resizing', async () => {
	const h = harness(), card = { name: 'huogong' };
	h.player.playCard(h.actor, card, { event: { name: 'useCard', player: h.actor, card, targets: [h.victim] } });
	await flush(); h.advance(50);
	const check = rect => {
		const draw = h.drawn.at(-1), [left, bottom, right, top] = draw.model.metadata.bounds;
		assert.ok(Math.abs(draw.placement.x + (left + right) / 2 * draw.placement.scale - rect.width / 2) < 1e-6);
		assert.ok(Math.abs(draw.placement.y - (bottom + top) / 2 * draw.placement.scale - rect.height / 2) < 1e-6);
		assert.ok((right - left) * draw.placement.scale <= rect.width * .64 * .8 + 1e-6);
		assert.ok((top - bottom) * draw.placement.scale <= rect.height * .66 * .8 + 1e-6);
	};
	check(h.parent.rect);
	h.actor.rect.left = 700; h.victim.rect.left = 20; h.advance(50); check(h.parent.rect);
	const resized = { left: 0, top: 0, width: 800, height: 450 };
	h.parent.rect = resized;
	h.parent.children[0].children[0].rect = resized;
	h.advance(50); check(resized); h.player.stop();
});
