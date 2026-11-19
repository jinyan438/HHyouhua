import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { setupTargetHighlight } from '../src/features/targetHighlight.js';

function deferred() {
	let resolve, reject;
	const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
	return { promise, resolve, reject };
}
function harness({ beforeSetup = () => {} } = {}) {
	const lib = { skill: { sampleSkill: { content() {}, selectTarget: 1 }, activeSkill: { selectTarget: 1 } },
		card: { sha: { selectTarget: 1 }, nanman: { selectTarget: -1 }, wanjian: { selectTarget: -1 }, wuzhong: { selectTarget: -1, toself: true }, shan: { notarget: true } },
		hooks: { checkEnd: [] }, onover: [] }, _status = {};
	const actor = player(); _status.currentPhase = actor;
	const game = { createEvent(name) {
		return { name, player: actor, card: name === 'useCard' ? { name: 'sha' } : undefined, skill: name === 'useSkill' ? 'activeSkill' : undefined,
			handlers: [], pushHandler(handler) { this.handlers.push(handler); },
			start() { return this.body?.call(this); },
			sync() { for (const handler of this.handlers) handler(this); },
		};
	} };
	const get = { info: card => lib.card[card.name], select: value => {
		if (typeof value === 'function') value = value();
		return Array.isArray(value) ? value : [value ?? 1, value ?? 1];
	} };
	const context = { lib, game, get, _status }; beforeSetup(context);
	const controller = setupTargetHighlight(context);
	function player() {
		const classes = new Set(['player']);
		return { classList: { contains: name => classes.has(name), add: name => classes.add(name), remove: name => classes.delete(name) },
			get glowing() { return classes.has('hh-target-resolving'); } };
	}
	return { ...context, controller, player, actor };
}

test('confirmed targets stay red through finished content, child resolution and after events', async () => {
	const h = harness(), target = h.player(), hold = deferred();
	const event = h.game.createEvent('useCard'); event.targets = [target];
	event.body = async function () { this.finished = true; await hold.promise; return 'native-result'; };
	assert.equal(target.glowing, false);
	const completion = event.start();
	assert.equal(event.finished, true); assert.equal(target.glowing, true);
	assert.equal(event.start(), completion);
	hold.resolve(); assert.equal(await completion, 'native-result');
	assert.equal(target.glowing, false); assert.equal(h.controller.activeCount, 0);
});

test('active named skills track late targets; nested events cannot clear an outer target', async () => {
	const h = harness(), target = h.player(), late = h.player(), outerHold = deferred(), innerHold = deferred();
	const outer = h.game.createEvent('useSkill'); outer.targets = [target]; outer.body = () => outerHold.promise;
	const a = outer.start();
	const inner = h.game.createEvent('sampleSkill'); inner.targets = [target]; inner.body = () => innerHold.promise;
	const b = inner.start();
	outer.targets.push(late); outer.sync();
	assert.equal(late.glowing, true); innerHold.resolve(); await b;
	assert.equal(target.glowing, true); assert.equal(late.glowing, true);
	outerHold.resolve(); await a;
	assert.equal(target.glowing, false); assert.equal(late.glowing, false);
});

test('a skill-internal target choice joins the skill until it settles, while cancelled choices stay clear', async () => {
	const h = harness(), target = h.player(), hold = deferred();
	const skill = h.game.createEvent('useSkill'); skill.targets = []; skill.body = () => hold.promise;
	const completion = skill.start();
	const choice = h.game.createEvent('chooseTarget'); choice.parent = skill;
	choice.result = { bool: false, targets: [target] }; await choice.start();
	assert.equal(target.glowing, false);
	const confirmed = h.game.createEvent('chooseTarget'); confirmed.parent = skill;
	confirmed.result = { bool: true, targets: [target] }; await confirmed.start();
	assert.equal(target.glowing, true);
	hold.resolve(); await completion; assert.equal(target.glowing, false);
});

test('combined button/target choices only become red after the outer choice confirms', async () => {
	const h = harness(), target = h.player(), skillHold = deferred(), choiceHold = deferred();
	const skill = h.game.createEvent('sampleSkill'); skill.body = () => skillHold.promise;
	const completion = skill.start();
	const combined = h.game.createEvent('chooseButtonTarget'); combined.parent = skill; combined.body = () => choiceHold.promise;
	const choiceCompletion = combined.start();
	const child = h.game.createEvent('chooseTarget'); child.parent = combined;
	child.result = { bool: true, targets: [target] }; await child.start();
	assert.equal(target.glowing, false);
	combined.result = child.result; choiceHold.resolve(); await choiceCompletion;
	assert.equal(target.glowing, true);
	skillHold.resolve(); await completion; assert.equal(target.glowing, false);
});

test('hidden targets, unknown system events and unconfirmed choices never expose a red frame', async () => {
	const h = harness(), target = h.player();
	const hidden = h.game.createEvent('useCard'); hidden.targets = [target]; hidden.hideTargets = true;
	hidden.body = () => { assert.equal(target.glowing, false); }; await hidden.start();
	const system = h.game.createEvent('damage'); system.targets = [target];
	system.start(); assert.equal(target.glowing, false);
	const choice = h.game.createEvent('chooseTarget'); choice.result = { bool: true, targets: [target] };
	await choice.start(); assert.equal(target.glowing, false);
});

test('native failures clean their own frames without removing a still-active parent frame', async () => {
	const h = harness(), shared = h.player(), other = h.player(), hold = deferred();
	const parent = h.game.createEvent('useCard'); parent.targets = [shared]; parent.body = () => hold.promise;
	const completion = parent.start();
	const child = h.game.createEvent('useSkill'); child.targets = [shared, other]; child.body = async () => { throw Error('native failure'); };
	await assert.rejects(child.start(), /native failure/);
	assert.equal(shared.glowing, true); assert.equal(other.glowing, false);
	const sync = h.game.createEvent('sampleSkill'); sync.targets = [other]; sync.body = () => { throw Error('sync failure'); };
	assert.throws(() => sync.start(), /sync failure/); assert.equal(other.glowing, false);
	hold.resolve(); await completion; assert.equal(shared.glowing, false);
});

test('game-over cleanup clears all frames and repeated setup preserves the native event factory', async () => {
	const h = harness(), target = h.player(), hold = deferred(), create = h.game.createEvent;
	assert.equal(setupTargetHighlight(h), h.controller); assert.equal(h.game.createEvent, create);
	const event = h.game.createEvent('useCard'); event.targets = [target]; event.body = () => hold.promise;
	const completion = event.start(); assert.equal(target.glowing, true);
	h._status.over = true; h.lib.onover.forEach(callback => callback());
	event.sync(); assert.equal(target.glowing, false); assert.equal(h.controller.activeCount, 0);
	hold.resolve(); await completion; assert.equal(target.glowing, false);
});

test('the actor itself is excluded, while another actor can explicitly target the local player', async () => {
	const h = harness(), local = h.player(), hold = deferred(); h.game.me = local;
	const event = h.game.createEvent('useCard'); event.targets = [h.actor, local]; event.body = () => hold.promise;
	const completion = event.start(); assert.equal(h.actor.glowing, false); assert.equal(local.glowing, true);
	hold.resolve(); await completion; assert.equal(local.glowing, false);
});

test('automatic all-target, self-only, no-target and equipment definitions never create a current target', async () => {
	for (const info of [{ selectTarget: -1 }, { selectTarget: [1, -1] }, { selectTarget: 0 },
		{ toself: true, selectTarget: 1 }, { notarget: true, selectTarget: 1 }, { type: 'equip', selectTarget: 1 }, { content() {} }]) {
		const h = harness(), target = h.player(); h.lib.card.test = info;
		const event = h.game.createEvent('useCard'); event.card = { name: 'test' }; event.targets = [h.actor, target];
		event.body = () => { assert.equal(target.glowing, false, JSON.stringify(info)); };
		await event.start(); assert.equal(target.glowing, false);
	}
	const h = harness(), target = h.player(); h.lib.skill.noTargetSkill = { content() {} };
	const skill = h.game.createEvent('useSkill'); skill.skill = 'noTargetSkill'; skill.targets = [target];
	skill.body = () => { assert.equal(target.glowing, false); }; await skill.start();
});

test('explicit multi-target choices remain current targets even when they include every other seat', async () => {
	const h = harness(), first = h.player(), second = h.player(), hold = deferred();
	h.game.players = [h.actor, first, second]; h.lib.card.multiple = { selectTarget: [1, Infinity], multitarget: true };
	const event = h.game.createEvent('useCard'); event.card = { name: 'multiple' }; event.targets = [h.actor, first, second]; event.body = () => hold.promise;
	const completion = event.start(); assert.equal(h.actor.glowing, false); assert.equal(first.glowing, true); assert.equal(second.glowing, true);
	hold.resolve(); await completion; assert.equal(first.glowing, false); assert.equal(second.glowing, false);
});

test('out-of-turn, response and asked trigger contexts do not mark new targets', async () => {
	for (const context of ['outside-turn', 'respondTo', 'wuxie', 'dying', 'trigger', 'nested-trigger', 'other-actor']) {
		const h = harness(), target = h.player(), event = h.game.createEvent('useCard'); event.targets = [target];
		if (context === 'outside-turn') h._status.currentPhase = h.player();
		if (context === 'respondTo') event.respondTo = [{}, {}];
		if (context === 'wuxie') event.parent = { name: 'chooseToUse', type: 'wuxie' };
		if (context === 'dying') event.parent = { name: 'dying' };
		if (context === 'trigger') { event.name = 'sampleSkill'; event._trigger = { name: 'damage' }; }
		if (context === 'nested-trigger') event.parent = { name: 'sampleSkill', player: h.actor, _trigger: { name: 'phaseBegin' } };
		if (context === 'other-actor') event.parent = { name: 'useSkill', player: h.player() };
		event.body = () => { assert.equal(target.glowing, false, context); }; await event.start();
	}
});

test('dead, removed and out-of-play seats are excluded without affecting legal targets', async () => {
	const h = harness(), dead = h.player(), out = h.player(), removed = h.player(), target = h.player();
	dead.isDead = () => true; out.isOut = () => true; removed.removed = true;
	const event = h.game.createEvent('useCard'); event.targets = [dead, out, removed, target];
	event.body = () => { assert.equal(dead.glowing, false); assert.equal(out.glowing, false); assert.equal(removed.glowing, false); assert.equal(target.glowing, true); };
	await event.start(); assert.equal(target.glowing, false);
});

test('dynamic choice ranges are refreshed during selection and retained after leaving the choice context', async () => {
	const h = harness(), target = h.player(), choice = { name: 'chooseToUse', type: 'phase', player: h.actor, filterTarget: true };
	let maximum = -1;
	choice.selectTarget = () => { assert.equal(h._status.event, choice); return [1, maximum]; };
	h._status.event = choice; h.lib.hooks.checkEnd.forEach(hook => hook(choice));
	maximum = 2; h.lib.hooks.checkEnd.forEach(hook => hook(choice));
	h._status.event = {};
	const event = h.game.createEvent('useCard'); event.targets = [target]; event.parent = choice;
	event.body = () => { assert.equal(target.glowing, true); }; await event.start();
	maximum = -1; h._status.event = choice; h.lib.hooks.checkEnd.forEach(hook => hook(choice)); h._status.event = {};
	const automatic = h.game.createEvent('useCard'); automatic.targets = [target]; automatic.parent = choice;
	automatic.body = () => { assert.equal(target.glowing, false); }; await automatic.start();
});

test('automatic internal choices and another player response cannot add targets to an active skill', async () => {
	const h = harness(), target = h.player(), hold = deferred();
	const skill = h.game.createEvent('useSkill'); skill.body = () => hold.promise; const completion = skill.start();
	for (const otherPlayer of [false, true]) {
		const choice = h.game.createEvent('chooseTarget'); choice.parent = skill;
		choice.selectTarget = otherPlayer ? 1 : -1;
		if (otherPlayer) choice.player = h.player();
		choice.result = { bool: true, targets: [target] }; await choice.start(); assert.equal(target.glowing, false);
	}
	hold.resolve(); await completion;
});

test('native auto-confirm cannot turn cleared AOE selection into a one-target snapshot', async () => {
	const source = fs.readFileSync(new URL('../../../noname/library/hooks/index.ts', import.meta.url), 'utf8');
	const from = source.indexOf('function autoConfirm('), to = source.indexOf('function createChooseAll(', from);
	const code = source.slice(from, to).trim().replace(/,$/, '');
	for (const name of ['nanman', 'wanjian', 'sha']) {
		let selected = { name }, choice, target;
		const h = harness({ beforeSetup(context) {
			const autoConfirm = vm.runInNewContext('(' + code + ')', { ...context,
				get: { info: () => ({}) }, ui: { click: { ok() {
					choice.result = { bool: true, card: selected, targets: [target] };
					selected = undefined;
				} } },
			});
			context.lib.hooks.checkEnd.push(autoConfirm);
		} });
		target = h.player();
		choice = { name: 'chooseToUse', type: 'phase', player: h.actor, filterTarget: true, isMine: () => true,
			selectTarget: () => selected && h.lib.card[selected.name].selectTarget };
		h._status.event = choice;
		for (const hook of h.lib.hooks.checkEnd) hook(choice, { ok: true, auto: true, autoConfirm: true });
		assert.equal(selected, undefined, 'the actual native hook confirmed and cleared selection');
		const event = h.game.createEvent('useCard'); event.card = choice.result.card; event.targets = [target]; event.parent = choice;
		event.body = () => { assert.equal(target.glowing, name === 'sha', name + ' must keep its pre-confirm target semantics'); };
		await event.start(); assert.equal(target.glowing, false);
	}
});
