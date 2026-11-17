import assert from 'node:assert/strict';
import test from 'node:test';
import { actionHarness } from './helpers/player-action-harness.mjs';

const gone = h => {
	assert.equal(!!h.ui.confirm, false);
	assert.equal(h.document.body.querySelectorAll('.confirm').length, 0);
};

test('every ordinary response, rescue, skill, card and target timeout removes its own confirmation', () => {
	for (const name of ['chooseToUse', 'chooseToRespond', 'chooseBool', 'chooseControl', 'chooseCard', 'chooseTarget', 'chooseButton',
		'chooseCardTarget', 'chooseButtonTarget', 'chooseToDiscard', 'chooseToGive', 'choosePlayerCard', 'discardPlayerCard', 'gainPlayerCard', 'chooseToCompare']) {
		const h = actionHarness(), evt = h.event(name, name === 'chooseControl' ? { controls: ['draw', 'cancel2'] } : {});
		h.wait(evt); h.ui.create.confirm('oc'); h.advance(15100);
		gone(h); assert.equal(h.timer.consecutive, 1, name); h.stop();
	}
});

test('custom skill timeout cleans its controls even when the resolver switches to a system event before resuming', () => {
	const h = actionHarness();
	const evt = h.event('customSkill', { switchToAuto() { evt._result = { bool: false }; h.status.event = h.event('damage'); h.game.resume(); } });
	h.wait(evt); h.ui.create.confirm('oc'); h.advance(15100);
	assert.equal(evt._result.bool, false); gone(h); h.stop();
});

test('replacement confirm callbacks that resolve their own pause without game.resume still release the buttons', () => {
	const h = actionHarness(), evt = h.event('chooseBool');
	evt.custom = { replace: { confirm(value) { evt.result = { bool: value }; h.status.paused = false; } } };
	h.wait(evt); h.ui.create.confirm('oc'); h.advance(15100);
	assert.equal(evt.result.bool, false); gone(h); h.stop();
});

test('confirm buttons rebuilt by a delayed timeout callback are collected without needing another resume', () => {
	const h = actionHarness();
	const evt = h.event('customSkill', { switchToAuto() {
		evt._result = { bool: false }; h.game.resume();
		h.environment.setTimer(() => h.ui.create.confirm('oc'), 0);
	} });
	h.wait(evt); h.ui.create.confirm('oc'); h.advance(15100);
	gone(h); h.stop();
});

test('timeout cleanup includes an earlier orphaned confirm container as well as the current pointer', () => {
	const h = actionHarness(); let orphan;
	const evt = h.event('customSkill', { switchToAuto() {
		orphan = h.ui.confirm; h.ui.confirm = null; h.ui.create.confirm('oc'); h.game.resume();
	} });
	h.wait(evt); h.ui.create.confirm('oc'); h.advance(15100);
	assert.equal(orphan.isConnected, false); gone(h); h.stop();
});

test('standalone skill confirm controls without a ui.confirm pointer are released on timeout', () => {
	for (const links of [['ok', 'cancel'], ['确定', '取消']]) {
		const h = actionHarness(), evt = h.event('customSkill', { switchToAuto() { h.status.event = h.event('damage'); h.game.resume(); } });
		h.wait(evt); const control = h.ui.create.control(...links); h.advance(15100);
		assert.equal(control.isConnected, false); h.stop();
	}
});

test('a new pending choice may reuse the same confirm container without being removed by the previous timeout', () => {
	const h = actionHarness(); let fresh;
	const evt = h.event('customSkill', { switchToAuto() {
		h.status.event = h.event('chooseBool'); h.ui.create.confirm('oc'); fresh = h.ui.confirm;
	} });
	h.wait(evt); h.ui.create.confirm('oc'); const reused = h.ui.confirm; h.advance(15100);
	assert.equal(fresh, reused); assert.equal(h.ui.confirm, fresh); assert.equal(fresh.isConnected, true);
	assert.equal(h.status.paused, true); assert.equal(h.timer.current.event, h.status.event); h.stop();
});

test('a custom resolver may resume once and then open another step on the same event with a fresh deadline', () => {
	const h = actionHarness(); let fresh;
	const evt = h.event('customSkill', { switchToAuto() {
		h.game.resume(); h.ui.create.confirm('oc'); fresh = h.ui.confirm; h.game.pause();
	} });
	h.wait(evt); h.ui.create.confirm('oc'); h.advance(15100);
	assert.equal(h.status.paused, true); assert.equal(h.ui.confirm, fresh); assert.equal(fresh.isConnected, true);
	assert.equal(h.timer.current.event, evt); assert.ok(h.timer.current.fraction > .99); h.stop();
});

test('a later step on the same event may open a standalone skill confirmation', () => {
	const h = actionHarness(); let next;
	const evt = h.event('customSkill', { switchToAuto() {
		h.game.resume(); next = h.ui.create.control('ok', 'cancel'); h.game.pause();
	} });
	h.wait(evt); const old = h.ui.create.control('ok', 'cancel'); h.advance(15100);
	assert.equal(old.isConnected, false); assert.equal(next.isConnected, true);
	assert.equal(h.status.paused, true); assert.ok(h.timer.current.fraction > .99); h.stop();
});

test('the third timeout enters auto and leaves no confirmation, and returning to manual allows new controls', () => {
	const h = actionHarness();
	for (let i = 0; i < 3; i++) {
		const evt = h.event('chooseBool', { redo() {} }); h.wait(evt); h.ui.create.confirm('oc'); h.advance(15100); gone(h);
	}
	assert.equal(h.status.auto, true); h.ui.click.auto(); h.timer.check();
	h.wait(h.event('chooseBool')); h.ui.create.confirm('oc'); h.advance(100);
	assert.ok(h.ui.confirm?.isConnected); h.stop();
});

test('disabling local timing after a timeout leaves later native controls usable', () => {
	const h = actionHarness(), evt = h.event('chooseBool'); h.wait(evt); h.ui.create.confirm('oc'); h.advance(15100); gone(h);
	h.lib.config.extension_HH优化_jindutiaoYangshi = '0'; h.ui.create.confirm('oc'); const native = h.ui.confirm;
	h.game.pause(); h.advance(100);
	assert.equal(h.timer.current, null); assert.equal(h.ui.confirm === native, true); assert.equal(native.isConnected, true); h.stop();
});

test('late-loaded base, OL and shousha skin factories track orphaned confirmation containers', () => {
	for (const skin of ['base', 'online', 'shousha']) {
		const h = actionHarness(); h.skin(skin); h.wait(h.event('chooseBool'));
		h.ui.create.confirm('oc'); const orphan = h.ui.confirm;
		h.ui.confirm = null; h.ui.create.confirm('oc'); h.advance(15100);
		assert.equal(orphan.isConnected, false, skin);
		assert.equal(h.document.body.querySelectorAll('.lbtn-confirm').length, 0, skin); gone(h); h.stop();
	}
});

test('each skin can reuse its confirm for the next choice during the previous timeout', () => {
	for (const skin of ['base', 'online', 'shousha']) {
		const h = actionHarness(); h.skin(skin); let fresh;
		const evt = h.event('customSkill', { switchToAuto() {
			h.status.event = h.event('chooseBool'); h.ui.create.confirm('oc'); fresh = h.ui.confirm;
		} });
		h.wait(evt); h.ui.create.confirm('oc'); const reused = h.ui.confirm; h.advance(15100);
		assert.equal(fresh, reused, skin); assert.equal(h.ui.confirm, fresh, skin); assert.equal(fresh.isConnected, true, skin);
		assert.equal(h.status.paused, true); h.stop();
	}
});

test('timeout abandons unsubmitted play selections instead of triggering the skin cancel-to-reselect action', () => {
	for (const skin of ['base', 'online', 'shousha']) {
		const h = actionHarness(); h.skin(skin); const evt = h.event('chooseToUse');
		h.wait(evt); h.ui.create.confirm('oc'); h.ui.selected.cards.push(h.hand[0]); h.advance(15100);
		assert.equal(evt.result?.bool, false, skin); assert.equal(h.status.paused, false, skin);
		assert.equal(h.document.body.querySelectorAll('.lbtn-confirm').length, 0, skin); gone(h); h.stop();
	}
});
