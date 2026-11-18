import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { setupSettlementOptimization } from '../src/features/settlementOptimization.js';

function harness({ enabled = true, yieldTask = () => Promise.resolve() } = {}) {
	let now = 0; const calls = [], saves = [], registered = [];
	const lib = { config: { game_speed: 'mid', duration: 500, animation: true, extension_HH优化_speed_multiplier: 2.5,
		extension_HH优化_enable_ai_think_delay: true, extension_HH优化_ai_think_delay_min: '250', extension_HH优化_ai_think_delay_max: '2600' },
		card: { sha: { content() {} } }, skill: { testSkill: { content() {} } } };
	const _status = { event: { name: 'useCard' }, pauseManager: { setDelay(promise) { registered.push(promise); return promise; } } };
	const game = { delay(...args) { const result = { method: 'delay', owner: this, args }; calls.push(result); return result; },
		delayx(...args) { const result = { method: 'delayx', owner: this, args }; calls.push(result); return result; },
		saveConfig(key, value) { saves.push([key, value]); } };
	const get = { delayx: (ms, max = Infinity) => Math.min(ms * 2.5, max) };
	const controller = setupSettlementOptimization({ lib, game, get, _status }, { enable_settlement_optimize: enabled }, { now: () => now, yieldTask });
	return { lib, game, get, _status, controller, calls, saves, registered, setNow(value) { now = value; } };
}

test('only settlement padding is removed; medium game speed, explicit durations, animation and AI settings stay intact', async () => {
	const h = harness(), before = { ...h.lib.config };
	await h.game.delayx(); await h.game.delay(); await h.game.delayx(.5);
	assert.equal(h.calls.length, 0);
	h._status.event = { name: 'sha' }; await h.game.delayx();
	h._status.event = { name: 'testSkill' }; await h.game.delay();
	h._status.event = { name: 'testSkillContentBefore', skill: 'testSkill' }; await h.game.delayx();
	const receiver = {}; const result = h.game.delay.call(receiver, .5, 17);
	assert.equal(result.owner, receiver); assert.deepEqual(result.args, [.5, 17]);
	h.game.delayx(2); assert.equal(h.calls.length, 2);
	assert.deepEqual(h.lib.config, before);
	assert.equal(h.controller.snapshot().defaultWaits, 5); assert.equal(h.controller.snapshot().targetWaits, 1);
});

test('choices, AI decisions, rescue, judge, phase pacing, requested waits and custom animation callbacks remain native', () => {
	const h = harness();
	for (const name of ['chooseToUse', 'chooseToRespond', 'chooseBool', 'gainPlayerCard', 'discardPlayerCard', '_wuxie', '_save', 'dying', 'judge', 'pindian', 'gameDraw', 'phaseUse']) {
		h._status.event = { name, type: 'card' }; h.game.delayx(); assert.equal(h.calls.at(-1).method, 'delayx', name);
	}
	for (const overrides of [{ delay: 2 }, { autodelay: .5 }, { delay_time: 300 }, { dialog: {} }, { animate() {} }, { forceWait: true }, { waitingForTransition: 10 }]) {
		h._status.event = { name: 'gain', ...overrides }; const count = h.calls.length; h.game.delay(); assert.equal(h.calls.length, count + 1);
	}
	assert.equal(h.controller.snapshot().defaultWaits, 0);
});

test('pause ownership, online rooms, replay, live disabling and repeated setup are preserved', async () => {
	const h = harness();
	for (const flag of ['paused', 'paused2', 'paused3', 'imchoosing', 'waitingForTransition', 'connectMode', 'video', 'over']) {
		h._status[flag] = true; assert.equal(h.controller.canOptimize(), false, flag); delete h._status[flag];
	}
	h.game.online = true; assert.equal(h.controller.canOptimize(), false); h.game.online = false;
	h.controller.setEnabled(false); const result = h.game.delayx(); assert.equal(result.method, 'delayx');
	h.controller.setEnabled(true); await h.game.delayx(); assert.equal(h.calls.length, 1);
	const wrapped = h.game.delayx; assert.equal(setupSettlementOptimization(h), h.controller); assert.equal(h.game.delayx, wrapped);
	assert.equal(h._status.paused, undefined);
});

test('native delay events inherit settlement scope; only the known batch-gain padding matches fixed durations', async () => {
	const h = harness(); h._status.event = { name: 'delayx', _args: [], parent: { name: 'useCard' } }; await h.game.delayx();
	h._status.event = { name: 'delayx', _args: [2], parent: { name: 'useCard' } }; h.game.delayx(2); assert.equal(h.calls.length, 1);
	h._status.event = { name: 'loseAsync', gain_list: [], animate: 'giveAuto' }; await h.game.delay(0, 500); await h.game.delay(0, 700);
	h.game.delay(0, 600); assert.equal(h.calls.length, 2);
	h._status.event.animate = () => {}; h.game.delay(0, 500); assert.equal(h.calls.length, 3);
	assert.equal(h.controller.snapshot().batchHolds, 2);
});

test('long automatic chains yield through the native pause manager even when the delay return is not awaited', async () => {
	let release; const task = new Promise(resolve => release = resolve), h = harness({ yieldTask: () => task });
	for (let i = 0; i < 64; i++) h.game.delayx();
	assert.equal(h.registered.length, 1); assert.equal(h.controller.snapshot().yields, 1);
	const later = h.game.delayx(); assert.equal(h.registered.length, 1); assert.equal(h._status.paused, undefined);
	release(); await later; await h.game.delayx(); assert.equal(h.controller.snapshot().yields, 1);
	assert.equal(h.calls.length, 0);
	h._status.event = { name: 'gain', animate: 'draw' };
	for (let i = 0; i < 63; i++) assert.equal(h.controller.fastGain(h._status.event), true);
	assert.equal(h.registered.length, 2, 'consecutive gains also yield when they have no default delay call');
});

function gainHarness(enabled) {
	const h = harness({ enabled }), timers = [], visual = [], updates = [];
	function node() { return { childNodes: [], appendChild(child) { if (child.fragment) { for (const c of [...child.childNodes]) this.appendChild(c); return; } this.childNodes.push(child); child.parentNode = this; } }; }
	const hand = node(), player = { node: { handcards1: hand }, getCards: () => [], update: () => updates.push('update'), $draw: count => visual.push(count) };
	const cards = [{ style: {}, vanishtag: [], fix() {}, addGaintag() {}, addKnower() {} }], event = { name: 'gain', animate: 'draw', cards, gaintag: [] };
	h._status.event = event; h.game.me = null; h.game.pause = () => { h._status.paused = true; }; h.game.resume = () => { h._status.paused = false; };
	h.game.broadcast = () => {}; h.game.addVideo = () => {}; h.lib.config.sort_card = () => 0;
	Object.assign(h.get, { position: () => 'c', cardsInfo: cards => cards });
	const source = fs.readFileSync(new URL('../src/overrides/content.js', import.meta.url), 'utf8');
	const begin = source.indexOf('export function createContentGain('), end = source.indexOf('\n/**', begin);
	const context = vm.createContext({ ...h, ui: { cardPile: { childNodes: [] } }, window: { decadeUI: {} },
		document: { createDocumentFragment: () => Object.assign(node(), { fragment: true }) }, setTimeout: (fn, ms, ...args) => timers.push({ fn, ms, args }) });
	vm.runInContext(source.slice(begin, end).replace('export function', 'function') + ';globalThis.gain=createContentGain([])[0]', context);
	return { ...h, context, player, cards, event, hand, timers, visual, updates };
}

test('actual HH gain inserts and displays the same cards without its 466ms pause, and disabling restores that exact hold', async () => {
	const fast = gainHarness(true); await fast.context.gain(fast.event, null, fast.player);
	assert.equal(fast.hand.childNodes[0], fast.cards[0]); assert.deepEqual(fast.visual, [1]); assert.deepEqual(fast.updates, ['update']);
	assert.equal(fast.timers.length, 0); assert.equal(fast._status.paused, undefined);
	const original = gainHarness(false); await original.context.gain(original.event, null, original.player);
	assert.equal(original.hand.childNodes[0], original.cards[0]); assert.deepEqual(original.visual, [1]); assert.equal(original._status.paused, true);
	assert.equal(original.timers[0].ms, 466); assert.equal(original.updates.length, 0);
	original.controller.setEnabled(true); original.timers[0].fn(...original.timers[0].args);
	assert.equal(original._status.paused, false); assert.equal(original.updates.length, 1);
});

test('actual HH animation transition sync remains native with settlement optimization both on and off', () => {
	const h = harness(), text = fs.readFileSync(new URL('../src/overrides/content.js', import.meta.url), 'utf8');
	const start = text.indexOf('if (lib.config.sync_speed &&'), end = text.indexOf('\n\t\t\tgame.addVideo("lose"', start);
	let callback; const evt = { name: 'useCard', delay: true }, clone = { listenTransition(fn) { callback = fn; } };
	h.lib.config.sync_speed = true; h.get.time = () => 123; h.game.resume = () => { h._status.paused = false; };
	const block = text.slice(start, end).replace(/\n\t\t\t\}\s*$/, '');
	const context = vm.createContext({ ...h, cards: [{ clone }], evt });
	for (const enabled of [true, false]) {
		h.controller.setEnabled(enabled); vm.runInContext(block, context);
		assert.equal(evt.waitingForTransition, 123); assert.equal(typeof callback, 'function');
		assert.equal(h.controller.canOptimize(evt), false, 'a visible transition must reach the native completion callback');
		h._status.waitingForTransition = 123; h._status.paused = true; callback(); assert.equal(h._status.paused, false); assert.equal(evt.waitingForTransition, undefined);
		delete h._status.waitingForTransition;
	}
});

test('the requested extension toggle is enabled by default, persists clicks and switches immediately', () => {
	const h = harness(), text = fs.readFileSync(new URL('../hh-features.js', import.meta.url), 'utf8');
	const context = vm.createContext({ ...h, ui: {}, ai: {} });
	vm.runInContext(text.replace(/^import .*;\r?\n/gm, '').replace('export function ', 'function ') + ';globalThis.options=createHHFeatures(lib,game,ui,get,ai,_status).config;', context);
	const option = context.options.enable_settlement_optimize;
	assert.equal(option.name, '优化结算速度'); assert.equal(option.init, true);
	option.onclick(false); assert.equal(h.controller.enabled, false); option.onclick(true); assert.equal(h.controller.enabled, true);
	assert.deepEqual(h.saves, [['extension_HH优化_enable_settlement_optimize', false], ['extension_HH优化_enable_settlement_optimize', true]]);
	assert.equal(h.lib.config.game_speed, 'mid'); assert.equal(h.lib.config.extension_HH优化_speed_multiplier, 2.5);
});

test('the actual frame queue coalesces only duplicate hand/discard layouts and preserves callback identity, context and order', () => {
	const h = harness(), seen = [], timers = []; let frame;
	const decadeUI = { layoutHand() { seen.push(['hand', this]); }, layoutDiscard() { seen.push(['discard', this]); } };
	const source = fs.readFileSync(new URL('../src/core/utility.js', import.meta.url), 'utf8');
	const begin = source.indexOf('decadeUI.queueNextFrameTick ='), end = source.indexOf('\n\tdecadeUI.layoutHand =', begin);
	vm.runInNewContext(source.slice(begin, end), { decadeUI, game: h.game, requestAnimationFrame: fn => frame = fn, setTimeout: fn => timers.push(fn) });
	const queue = decadeUI.queueNextFrameTick, otherContext = {};
	for (let i = 0; i < 20; i++) { queue(decadeUI.layoutHand, decadeUI); queue(decadeUI.layoutDiscard, decadeUI); }
	queue(decadeUI.layoutHand, otherContext); queue(() => seen.push(['first']), decadeUI); queue(() => seen.push(['second']), decadeUI);
	frame(); timers.shift()(); assert.deepEqual(seen.map(x => x[0]), ['hand', 'discard', 'hand', 'first', 'second']);
	assert.equal(seen[2][1], otherContext); assert.equal(h.controller.snapshot().layoutPassesSaved, 38);
	h.controller.setEnabled(false); for (let i = 0; i < 3; i++) queue(decadeUI.layoutHand, decadeUI); frame(); timers.shift()();
	assert.equal(seen.length, 8);
	h.controller.setEnabled(true); h.game.online = true; for (let i = 0; i < 3; i++) queue(decadeUI.layoutHand, decadeUI); frame(); timers.shift()();
	assert.equal(seen.length, 11);
});
