import assert from 'node:assert/strict';
import test from 'node:test';
import { actionHarness } from './helpers/player-action-harness.mjs';

test('native deferred resume never rearms the expired decision or retains its confirm', async () => {
	for (const skin of [null, 'base', 'online', 'shousha']) {
		for (const name of ['chooseToUse', 'chooseToRespond', 'chooseBool', 'chooseTarget']) {
			const h = actionHarness({ nativePause: true }); if (skin) h.skin(skin);
			const evt = h.event(name); h.wait(evt); h.ui.create.confirm('oc'); const old = h.ui.confirm;
			h.advance(15008);
			assert.equal(h.status.paused, true, 'Native Deferred.resolve releases the flag in a later microtask');
			assert.equal(evt.result.bool, false);
			assert.equal(h.timer.current, null, `${skin}/${name}: do not mistake a pending resume for a new choice`);
			assert.equal(old.isConnected, false, `${skin}/${name}: retire the old confirmation`);
			assert.equal(!!h.ui.confirm, false);
			await h.flush(); h.advance(100);
			assert.equal(h.status.paused, false); assert.equal(h.timer.consecutive, 1); h.stop();
		}
	}
});

test('polling while native resume is pending cannot count the same timeout repeatedly', async () => {
	const h = actionHarness({ nativePause: true }); h.wait(h.event('chooseBool')); h.ui.create.confirm('oc');
	h.advance(61000);
	assert.equal(h.timer.consecutive, 1); assert.equal(h.status.auto, undefined); assert.equal(h.timer.current, null);
	await h.flush(); assert.equal(h.status.paused, false); h.stop();
});

test('a genuine later pause on the same event opens a fresh decision after native resume settles', async () => {
	const h = actionHarness({ nativePause: true }); h.skin('online'); const evt = h.event('chooseBool');
	h.wait(evt); h.ui.create.confirm('oc'); h.advance(15008); await h.flush();
	h.wait(evt); h.ui.create.confirm('oc'); const next = h.ui.confirm;
	assert.equal(h.status.paused, true); assert.equal(h.timer.current.fraction, 1);
	h.advance(1000); assert.equal(next.isConnected, true); assert.equal(h.ui.confirm, next);
	h.advance(14008); await h.flush(); assert.equal(next.isConnected, false); assert.equal(h.timer.consecutive, 2); h.stop();
});

test('native forced discard finishes normally after the deferred timeout resume', async () => {
	const h = actionHarness({ nativePause: true }); h.skin('shousha');
	const evt = h.event('chooseToDiscard', { forced: true, selectCard: 1 }), pending = h.run(evt);
	await h.flush(); h.ui.create.confirm('o'); h.advance(15008); await pending;
	assert.equal(evt.result.bool, true); assert.equal(h.calls.discards.length, 1);
	assert.equal(h.document.body.querySelectorAll('.lbtn-confirm').length, 0); assert.equal(h.timer.current, null); h.stop();
});

test('a manual decision resets consecutive timeouts even while native resume is still pending', async () => {
	const h = actionHarness({ nativePause: true }); h.wait(h.event('chooseBool')); h.advance(15008); await h.flush();
	assert.equal(h.timer.consecutive, 1);
	h.wait(h.event('chooseBool')); h.ui.create.confirm('oc'); h.ui.click.cancel();
	assert.equal(h.status.paused, true); assert.equal(h.timer.consecutive, 0);
	await h.flush(); h.advance(100); assert.equal(!!h.ui.confirm, false); h.stop();
});
