import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { setupSourceCardAnimations } from '../src/effects/sourceCardAnimations.js';
import { setupRescueFlow } from '../src/features/rescueFlow.js';

function engineHarness() {
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
	return { ...context, actor, target, calls, compiler, run };
}

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
