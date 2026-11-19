import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { setupSourceCardAnimations } from '../src/effects/sourceCardAnimations.js';
import { setupRescueFlow } from '../src/features/rescueFlow.js';
import { setupLordBlindShot } from '../src/features/lordBlindShot.js';

function engineHarness({ localAsync = false } = {}) {
	const calls = [];
	const actor = { isDead: () => false, isOut: () => false };
	const target = { isDead: () => false, isOut: () => false };
	const context = {
		lib: { config: {}, skill: {}, animate: { card: {}, skill: {} } },
		game: { finishSkill() {}, broadcastAll(callback, ...args) { callback(...args); } },
		ui: {}, get: {}, ai: {}, _status: {},
	};
	context.game.hhCardEffects = {
		handles: () => true, wasPlayed: () => false,
		playSteal: (...args) => calls.push(['steal', ...args]),
		playHit: (...args) => calls.push(['hit', ...args]),
		playCard: (...args) => calls.push(['equip', ...args]),
	};
	setupSourceCardAnimations(context);
	const realm = vm.createContext({
		...context,
		AsyncFunction: Object.getPrototypeOf(async function () {}).constructor,
		GeneratorFunction: Object.getPrototypeOf(function* () {}).constructor,
		AsyncGeneratorFunction: Object.getPrototypeOf(async function* () {}).constructor,
	});
	if (localAsync) realm.AsyncFunction = vm.runInContext('Object.getPrototypeOf(async function () {}).constructor', realm);
	const isolatedFunction = vm.runInContext('Function', realm);
	const dependencies = {
		noname: context,
		'@/util/index.js': { AsyncFunction: realm.AsyncFunction, GeneratorFunction: realm.GeneratorFunction, AsyncGeneratorFunction: realm.AsyncGeneratorFunction },
		'@/util/sandbox.js': {
			security: { getIsolatedsFrom: () => [null, null, isolatedFunction], isSandboxRequired: () => false },
			CodeSnippet: class {}, ErrorManager: { setCodeSnippet() {} },
		},
	};
	const modules = new Map();
	function load(url) {
		if (modules.has(url.href)) return modules.get(url.href).exports;
		const module = { exports: {} }; modules.set(url.href, module);
		const code = ts.transpileModule(fs.readFileSync(url, 'utf8'), {
			compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
		}).outputText;
		const factory = vm.runInContext('(function(require, module, exports) {\n' + code + '\n})', realm, { filename: url.pathname });
		factory(specifier => dependencies[specifier] || load(new URL(specifier, url)), module, module.exports);
		return module.exports;
	}
	// Execute the actual Array/Async/Step compiler pipeline. StepCompiler creates
	// an isolated Function, so a synchronous hook cannot access a module closure.
	const compiler = load(new URL('../../../noname/library/element/GameEvent/compilers/ContentCompiler.ts', import.meta.url)).default;
	const eventSource = fs.readFileSync(new URL('../../../noname/library/element/gameEvent.ts', import.meta.url), 'utf8');
	const start = eventSource.indexOf('\t#step:');
	const steps = eventSource.slice(start, eventSource.indexOf('// #endregion', start));
	vm.runInContext(ts.transpileModule('class EngineSteps {\n' + steps + '\n}; globalThis.EngineSteps = EngineSteps;', {
		compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
	}).outputText, realm);
	async function run(name, trigger) {
		const event = Object.assign(new realm.EngineSteps(), {
			name, _trigger: trigger, player: actor, finished: false,
			getDefaultHandlerType: () => 'onContent', callHandler() {}, clearStepCache() {},
			async waitNext() {}, finish() { this.finished = true; },
		});
		const compiled = compiler.compile(context.lib.skill[name].content);
		await compiled.call(event, event);
		assert.equal(event.finished, true);
		return compiled;
	}
	return { ...context, actor, target, calls, compiler, run, realm };
}

function installBatchGainUI(h) {
	const nativeURL = new URL('../../../noname/library/element/content.ts', import.meta.url);
	const nativeFile = ts.createSourceFile(nativeURL.pathname, fs.readFileSync(nativeURL, 'utf8'), ts.ScriptTarget.Latest, true);
	const content = nativeFile.statements.flatMap(statement => statement.declarationList?.declarations || [])
		.find(declaration => declaration.name.getText(nativeFile) === 'Content').initializer;
	const batch = content.properties.find(property => property.name?.getText(nativeFile) === 'gaincardMultiple');
	vm.runInContext(ts.transpileModule('globalThis.nativeBatch = ({' + batch.getText(nativeFile) + '}).gaincardMultiple;', {
		compilerOptions: { target: ts.ScriptTarget.ES2022 },
	}).outputText, h.realm);
	h.lib.element = {
		content: { gain: [], lose: [], judge: [], gaincardMultiple: h.realm.nativeBatch },
		card: {}, player: {}, event: {}, control: {}, dialog: {},
	};
	h.lib.init = {}; h.ui.create = {}; h.ui.click = {};
	h.realm.window = { addEventListener() {} }; h.realm.decadeModule = {};
	const stub = new Proxy({}, { get: () => () => ({}) });
	function module(relative, dependencies) {
		const code = ts.transpileModule(fs.readFileSync(new URL(relative, import.meta.url), 'utf8'), {
			compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
		}).outputText;
		const result = { exports: {} };
		vm.runInContext('(function(require,module,exports){' + code + '\n})', h.realm)(
			name => name === 'noname' ? h : dependencies[name] || stub, result, result.exports);
		return result.exports;
	}
	const wrappers = module('../src/overrides/content.js', {});
	const core = module('../src/core/decadeUI.js', { '../overrides/content.js': wrappers });
	h.realm.decadeUI = core.createDecadeUIObject();
	// Run the actual initializer: testing the wrapper alone misses an omitted base reference.
	h.realm.decadeUI.initOverride();
}

test('HH initialization keeps named batch gain compilable and preserves native two-recipient transfers', async () => {
	for (const optimize of [false, true]) {
		const h = engineHarness({ localAsync: true }), received = [], animations = [], captures = [], arrivals = [];
		h.get.itemtype = value => Array.isArray(value) ? 'cards' : 'card';
		h.get.delayx = value => value;
		h.game.delay = h.game.delayx = async () => {};
		h.game.hhDrawMotion = { enabled: true, captureGain: event => captures.push(event), waitForGain: async event => { arrivals.push(event); } };
		h.game.hhSettlement = { canOptimize: () => optimize };
		installBatchGainUI(h);
		const batch = h.lib.element.content.gaincardMultiple;
		assert.equal(typeof batch, 'function', 'the initializer must preserve gaincardMultiple');
		assert.notEqual(batch, h.realm.nativeBatch);
		assert.equal(h.compiler.compile('gaincardMultiple').type, 'async');
		const card1 = { name: 'sha' }, card2 = { name: 'shan' };
		function recipient(id) {
			return { $gain2(cards) { animations.push([id, ...cards]); }, gain(cards) {
				const event = { gaintag: [], then(resolve) { received.push({ id, cards: Array.from(cards), giver: this.giver, visible: this.visible, getlx: this.getlx }); resolve(); } };
				return event;
			} };
		}
		const first = recipient('first'), second = recipient('second');
		// The compiler passes event fields through unchanged, as loseAsync does for Fengshang.
		const compiled = h.compiler.compile('gaincardMultiple');
		const event = Object.assign(new h.realm.EngineSteps(), {
			name: 'loseAsync', player: h.actor, giver: h.actor, animate: 'gain2', gain_list: [[first, card1], [second, card2]],
			finished: false, getDefaultHandlerType: () => 'onContent', callHandler() {}, clearStepCache() {},
			async waitNext() {}, finish() { this.finished = true; },
		});
		await compiled.call(event, event);
		assert.equal(event.finished, true); assert.equal(event.visible, true);
		assert.deepEqual(animations, [['first', card1], ['second', card2]]);
		assert.deepEqual(received, [
			{ id: 'first', cards: [card1], giver: h.actor, visible: true, getlx: false },
			{ id: 'second', cards: [card2], giver: h.actor, visible: true, getlx: false },
		]);
		assert.deepEqual(captures, [event]); assert.deepEqual(arrivals, optimize ? [event] : []);
		assert.equal(Object.hasOwn(event, '_HH_gainMotionManaged'), false);
	}
});

test('Shunshou gainAfter survives the actual engine compiler pipeline and deduplicates repeated trigger dispatch', async () => {
	const h = engineHarness(), hook = h.lib.skill._hh_source_card_steal;
	const card = { name: 'shunshou' };
	const effect = { name: 'shunshou', player: h.actor, card };
	const take = { name: 'gainPlayerCard', player: h.actor, getParent: () => effect };
	const gain = { player: h.actor, cards: [{}], getParent: () => take };
	assert.equal(hook.filter(gain), true);
	const compiled = await h.run('_hh_source_card_steal', gain);
	assert.equal(compiled.type, 'async');
	assert.equal(hook.filter(gain), false);
	await h.run('_hh_source_card_steal', gain);
	assert.deepEqual(h.calls, [['steal', h.actor, card]]);
	const nextGain = { ...gain };
	assert.equal(hook.filter(nextGain), true);
	await h.run('_hh_source_card_steal', nextGain);
	assert.equal(h.calls.length, 2);
	assert.equal(hook.filter({ ...gain, cards: [] }), false);
	assert.equal(hook.filter({ ...gain, getParent: () => ({ name: 'draw' }) }), false);
});

test('hit and equip triggers use the actual engine compilers without losing their required state', async () => {
	const h = engineHarness();
	const hit = await h.run('_hh_source_card_hit', { card: { name: 'sha', nature: 'ice' }, player: h.target });
	const card = { name: 'chitu' };
	const equip = await h.run('_hh_source_card_equip', { card, player: h.actor, getParent: () => null });
	assert.equal(hit.type, 'step'); assert.equal(equip.type, 'async');
	assert.deepEqual(h.calls, [['hit', h.target, 'ice'], ['equip', h.actor, card]]);
	h.game.hhCardEffects.wasPlayed = () => true;
	await h.run('_hh_source_card_equip', { card, player: h.actor, getParent: () => ({ name: 'useCard' }) });
	assert.equal(h.calls.length, 2);
});

test('compiled equipAfter emits one equipment sound even when the use animation was already played', async () => {
	const h = engineHarness(), sounds = [];
	h.game.hhCardAudio = { playEquip: card => sounds.push(card) };
	h.game.hhCardEffects.wasPlayed = () => true;
	const event = { card: { name: 'bagua' }, player: h.actor, getParent: () => ({ name: 'useCard' }) };
	const hook = h.lib.skill._hh_source_card_equip;
	assert.equal(hook.filter(event), true);
	await h.run('_hh_source_card_equip', event);
	assert.equal(hook.filter(event), false);
	await h.run('_hh_source_card_equip', event);
	assert.deepEqual(sounds, [event.card]); assert.equal(h.calls.length, 0);
});

test('sequential rescue runs through the actual AsyncCompiler and preserves its prompt/controller closure', async () => {
	const h = engineHarness(), turns = [];
	h.lib.element = { content: { _save: async () => {} } };
	h.lib.config.mode = 'identity'; h.get.translation = () => '濒死角色';
	h.actor.isIn = () => true; h.actor.canSave = () => false; h.actor.next = h.actor;
	h.actor.chooseToUse = () => ({ forResult: async () => ({ bool: false }) });
	const dying = { hp: 0, isDead: () => false, isAlive: () => true, isOut: () => false };
	setupRescueFlow(h, { getThinkDelay: () => 700, prompt: {
		beginRound(target) { turns.push(['dying', target]); return target; }, endRound(target) { turns.push(['ended', target]); },
		begin(player) { turns.push(player); return { wait: async () => true }; }, end() {},
	} });
	h.lib.skill._hh_test_rescue = { content: h.lib.element.content._save };
	const compiled = await h.run('_hh_test_rescue', { player: dying });
	assert.equal(compiled.type, 'async'); assert.deepEqual(turns, [['dying', dying], h.actor, ['ended', dying]]);
});

test('blind-target public skill observations retain state through the actual AsyncCompiler', async () => {
	const h = engineHarness();
	h.lib.config.mode = 'identity'; h.game.zhu = h.actor; h.game.players = [h.actor, h.target];
	h.actor.isZhu = h.actor.identityShown = true; h.actor.isIn = h.target.isIn = () => true;
	Object.assign(h.get, { threaten: () => 1, distance: () => 1, result: item => ({ target: item?.name === 'hit' ? -1 : 1 }), info: () => ({ ai: {} }) });
	const controller = setupLordBlindShot(h);
	const compiled = await h.run('_hh_lord_blind_shot', { name: 'useSkill', player: h.target, skill: 'rescue_skill', targets: [h.actor] });
	assert.equal(compiled.type, 'async'); assert.equal(controller.attitude(h.actor, h.target), 4);
	assert.equal(controller.state.target, null); assert.equal(controller.state.paused, false);
	const enemy = { isIn: () => true }, unknown = { isIn: () => true };
	h.game.players.push(enemy, unknown);
	await h.run('_hh_lord_blind_shot', { name: 'useCard', player: enemy, card: { name: 'hit' }, targets: [h.actor] });
	assert.equal(controller.state.paused, true); assert.equal(controller.state.target, null);
	enemy.isIn = () => false;
	await h.run('_hh_lord_blind_shot', { name: 'die', player: enemy });
	assert.equal(controller.state.paused, false); assert.equal(controller.state.target, unknown);
});
