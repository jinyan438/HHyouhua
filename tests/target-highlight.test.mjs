import assert from 'node:assert/strict';
import test from 'node:test';
import { setupTargetHighlight } from '../src/features/targetHighlight.js';

function deferred() {
	let resolve, reject;
	const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
	return { promise, resolve, reject };
}
function harness() {
	const lib = { skill: { sampleSkill: { content() {} } }, onover: [] }, _status = {};
	const game = { createEvent(name) {
		return { name, handlers: [], pushHandler(handler) { this.handlers.push(handler); },
			start() { return this.body?.call(this); },
			sync() { for (const handler of this.handlers) handler(this); },
		};
	} };
	const context = { lib, game, _status }, controller = setupTargetHighlight(context);
	function player() {
		const classes = new Set(['player']);
		return { classList: { contains: name => classes.has(name), add: name => classes.add(name), remove: name => classes.delete(name) },
			get glowing() { return classes.has('hh-target-resolving'); } };
	}
	return { ...context, controller, player };
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

test('active and triggered skills track late targets; nested cards cannot clear an outer target', async () => {
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
