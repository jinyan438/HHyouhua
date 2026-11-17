import assert from 'node:assert/strict';
import test from 'node:test';
import { actionHarness } from './helpers/player-action-harness.mjs';

test('all player bar styles use the same 15-second deadline and share one time source with expiry', () => {
	for (const style of ['1', '2', '3', '4', '5']) {
		const h = actionHarness({ style, config: { extension_HH优化_jindutiaoST: '10' } }), evt = h.event('chooseBool'); h.wait(evt);
		h.advance(7488);
		const bar = h.document.getElementById('jindutiaopl');
		assert.equal(bar.dataset.hhActionTimer, 'true');
		assert.ok(Math.abs(h.timer.current.fraction - .5) < .002);
		h.advance(7520);
		assert.equal(evt.result.bool, false); assert.equal(h.status.auto, undefined);
		assert.equal(h.document.getElementById('jindutiaopl'), undefined); assert.equal(h.timer.consecutive, 1);
		h.stop(); assert.equal(h.intervals.size, 0);
	}
});

test('different choices get fresh deadlines, repeated selection checks and theme refresh cannot extend one choice', () => {
	const h = actionHarness(), first = h.event('chooseBool'); h.wait(first); h.advance(7000);
	const token = h.timer.current;
	h.game.countChoose(); h.timer.refresh(); assert.equal(h.timer.current, token);
	h.advance(8008); assert.equal(first.result.bool, false);
	const next = h.event('chooseControl', { controls: ['draw', 'cancel2'] }); h.wait(next);
	assert.equal(h.timer.current.fraction, 1); h.advance(7000); assert.equal(next.result, undefined);
	h.advance(8040); assert.equal(next.result.control, 'cancel2'); h.stop();
});

test('three consecutive timeouts use the native auto button, and cancelling auto restores a fresh manual countdown', () => {
	const h = actionHarness();
	for (let i = 1; i <= 3; i++) {
		const evt = h.event('chooseBool'); evt.redo = () => { evt.redone = true; };
		h.wait(evt); h.advance(15040);
		assert.equal(h.timer.consecutive, i);
		if (i < 3) { assert.equal(evt.result.bool, false); assert.equal(h.status.auto, undefined); }
		else { assert.equal(h.status.auto, true); assert.equal(evt.redone, true); }
	}
	assert.equal(h.timer.timedOutAuto, true);
	h.ui.click.auto(); h.timer.check();
	assert.equal(h.status.auto, false); assert.equal(h.timer.consecutive, 0); assert.equal(h.timer.timedOutAuto, false);
	h.wait(h.event('chooseBool')); assert.equal(h.timer.current.fraction, 1); h.stop();
});

test('a completed manual decision resets consecutive timeouts; merely clicking or rechecking does not', () => {
	const h = actionHarness(); h.wait(h.event('chooseBool')); h.advance(15040);
	const evt = h.event('chooseBool'); h.wait(evt); h.advance(1000); h.game.countChoose();
	assert.equal(h.timer.consecutive, 1);
	h.ui.click.cancel(); assert.equal(h.timer.consecutive, 0); assert.equal(h.timer.current, null); h.stop();
});

test('a pending skill is first restored and then cancelled so the same timeout really ends the play idle point', () => {
	const h = actionHarness(), evt = h.event('chooseToUse', { skill: 'pendingSkill' });
	h.wait(evt); h.advance(15040);
	assert.equal(evt.skill, undefined); assert.equal(evt.result.bool, false); assert.equal(h.status.paused, false);
	assert.equal(h.timer.consecutive, 1); assert.equal(h.timer.current, null); h.stop();
});

test('pause freezes time, a stale callback cannot resolve a later event, and game over clears everything', () => {
	const h = actionHarness(), evt = h.event('chooseBool'); h.wait(evt); h.advance(6000);
	h.game.pause2(); const remaining = h.timer.current.fraction; h.advance(30000); assert.equal(h.timer.current.fraction, remaining);
	h.game.resume2(); h.advance(5000); assert.equal(evt.result, undefined);
	h.status.event = h.event('damage'); h.advance(20000); assert.equal(evt.result, undefined); assert.equal(h.timer.consecutive, 0);
	h.wait(h.event('chooseBool')); h.status.over = true; h.stop(); h.advance(30000);
	assert.equal(h.timer.current, null); assert.equal(h.intervals.size, 0); assert.equal(h.document.getElementById('jindutiaopl'), undefined);
});

test('network play, AI, opening selection and a disabled bar retain their original timing', () => {
	for (const mode of ['connect', 'online', 'auto', 'opening', 'disabled']) {
		const h = actionHarness(), evt = h.event('chooseBool');
		if (mode === 'connect') h.status.connectMode = true;
		if (mode === 'online') h.game.online = true;
		if (mode === 'auto') h.status.auto = true;
		if (mode === 'opening') evt.parent = { name: 'chooseCharacter' };
		if (mode === 'disabled') h.lib.config.extension_HH优化_jindutiaoYangshi = '0';
		h.wait(evt); h.advance(20000); assert.equal(h.timer.current, null); assert.equal(evt.result, undefined); h.stop();
	}
});

test('event-specific native time limits override the configured manual duration', () => {
	const h = actionHarness({ seconds: '30' }); h.player.forceCountChoose = { phaseUse: 20, chooseBool: 10 };
	h.wait(h.event('chooseToUse')); assert.equal(h.timer.current.duration, 20000);
	h.wait(h.event('chooseBool')); assert.equal(h.timer.current.duration, 10000); h.stop();
});

test('custom promise choices use their own switchToAuto resolver without entering global auto', async () => {
	const h = actionHarness(); let resolve;
	const promise = new Promise(done => { resolve = done; });
	const evt = h.event('customSkill', { switchToAuto() { evt._result = { bool: false }; resolve(evt._result); } });
	h.wait(evt); h.advance(15040);
	assert.equal((await promise).bool, false); assert.equal(h.status.paused, false); assert.equal(h.status.auto, undefined); h.stop();
});

test('native play, response, boolean and control events resume with passive results and do not use cards', async () => {
	for (const [name, options] of [['chooseToUse', {}], ['chooseToUse', { type: 'dying', dying: { hp: 0 } }], ['chooseToUse', { type: 'wuxie' }], ['chooseToRespond', { parent: {} }], ['chooseBool', {}], ['chooseControl', { controls: ['draw', 'cancel2'], choice: 0 }]]) {
		const h = actionHarness(), evt = h.event(name, options), pending = h.run(evt);
		await h.flush(); assert.equal(h.status.paused, true, name);
		h.advance(15040); await pending;
		if (name === 'chooseControl') assert.equal(evt.result.control, 'cancel2'); else assert.equal(evt.result.bool, false);
		assert.equal(h.calls.uses.length, 0); assert.equal(h.calls.responses.length, 0); assert.equal(h.status.auto, undefined); h.stop();
	}
});

test('native mandatory discard finishes its legal choice and executes the normal discard stage', async () => {
	const h = actionHarness(); h.hand[0].protected = true;
	const evt = h.event('chooseToDiscard', { forced: true, selectCard: 1 }), pending = h.run(evt);
	await h.flush(); assert.equal(h.status.paused, true);
	h.advance(15040); await pending;
	assert.equal(evt.result.bool, true); assert.deepEqual(Array.from(evt.result.cards), [h.hand[1]]);
	assert.equal(h.calls.discards.length, 1); assert.equal(h.calls.discards[0][0], h.hand[1]); assert.equal(h.status.auto, undefined); h.stop();
});

test('a timed-out native play idle point closes its confirm buttons and preserves the next response controls', async () => {
	for (const skill of [undefined, 'pendingSkill']) {
		const h = actionHarness(), evt = h.event('chooseToUse'), pending = h.run(evt);
		await h.flush(); h.ui.create.confirm('oc');
		const old = h.ui.confirm; evt.skill = skill;
		h.advance(15040); await pending;
		assert.equal(old.isConnected, false, 'The timed-out confirmation must leave the DOM');
		assert.equal(h.ui.confirm, null); assert.equal(h.document.body.querySelectorAll('.confirm').length, 0);
		const next = h.event('chooseBool'); h.wait(next); h.ui.create.confirm('oc');
		const fresh = h.ui.confirm; h.advance(500);
		assert.equal(h.ui.confirm, fresh); assert.equal(fresh.isConnected, true, 'Keep the new decision usable'); h.stop();
	}
});

test('native mandatory auto-selection also removes the confirm it creates after the timeout', async () => {
	const h = actionHarness(), evt = h.event('chooseToDiscard', { forced: true, selectCard: 1 }), pending = h.run(evt);
	await h.flush(); h.ui.create.confirm('o'); h.advance(15040); await pending;
	assert.equal(evt.result.bool, true); assert.equal(h.calls.discards.length, 1);
	assert.equal(h.ui.confirm, null); assert.equal(h.document.body.querySelectorAll('.confirm').length, 0); h.stop();
});

test('native Nanman and Wanjian still apply damage and finish their card effect after a response timeout', async () => {
	for (const name of ['nanman', 'wanjian']) {
		const h = actionHarness(), order = [], attacker = { hasSkillTag: () => false };
		h.get.name = card => card.name; h.get.damageEffect = () => -1;
		h.lib.filter.cardRespondable = () => true; h.lib.filter.autoRespondSha = () => false; h.lib.filter.autoRespondShan = () => false;
		Object.assign(h.player, { hujia: 0, hasSkillTag: () => false, hasSkill: () => false, damage() { order.push('damage'); } });
		const parent = { name: 'useCard', type: 'card', card: { name }, player: attacker };
		h.player.chooseToRespond = () => {
			const evt = h.event('chooseToRespond', { parent });
			evt.set = (key, value) => { evt[key] = value; return evt; };
			evt.forResult = async () => { await h.run(evt); return evt.result; };
			return evt;
		};
		const pending = h.card(name).content({ target: h.player, card: parent.card }, undefined, attacker).then(() => order.push('after-card'));
		await h.flush(); assert.equal(h.status.paused, true);
		h.advance(15040); await pending;
		assert.deepEqual(order, ['damage', 'after-card']); assert.equal(h.calls.responses.length, 0); h.stop();
	}
});
