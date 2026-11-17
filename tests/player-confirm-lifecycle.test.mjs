import assert from 'node:assert/strict';
import test from 'node:test';
import { actionHarness } from './helpers/player-action-harness.mjs';

test('confirm rebuilt after timeout during another player turn is collected without another timeout', async () => {
	for (const skin of [null, 'base', 'online', 'shousha']) {
		const h = actionHarness({ nativePause: true }); if (skin) h.skin(skin);
		h.wait(h.event('chooseToRespond')); h.ui.create.confirm('oc'); h.advance(15008); await h.flush();
		h.status.event = h.event('chooseToUse', { player: { name: 'other' }, isMine: () => false });
		h.ui.create.confirm('oc'); const late = h.ui.confirm; h.advance(100);
		assert.equal(late.isConnected, false, String(skin)); assert.equal(!!h.ui.confirm, false); assert.equal(h.timer.current, null);
		h.wait(h.event('chooseBool')); h.ui.create.confirm('oc'); const next = h.ui.confirm; h.advance(100);
		assert.equal(next.isConnected, true); h.stop();
	}
});

test('opening confirmation does not survive into another player turn even though it was never timed', async () => {
	const h = actionHarness({ nativePause: true }); h.skin('online'); h.status.gameStarted = false;
	h.status.event = h.event('chooseButton', { player: undefined }); h.game.pause(); h.ui.create.confirm('oc'); const opening = h.ui.confirm;
	h.game.resume(); await h.flush(); h.status.gameStarted = true;
	h.status.event = h.event('phase', { player: { name: 'other' }, isMine: () => false }); h.advance(100);
	assert.equal(opening.isConnected, false); assert.equal(!!h.ui.confirm, false); h.stop();
});

test('ordinary programmatic confirmation completion also releases buttons after native resume settles', async () => {
	const h = actionHarness({ nativePause: true }); h.wait(h.event('chooseBool')); h.ui.create.confirm('oc'); const old = h.ui.confirm;
	h.ui.click.cancel(); await h.flush(); h.advance(100);
	assert.equal(old.isConnected, false); assert.equal(!!h.ui.confirm, false); assert.equal(h.timer.consecutive, 0); h.stop();
});

test('cleanup preserves untimed opening or custom choices while they are genuinely awaiting input', () => {
	const h = actionHarness();
	for (const name of ['chooseButton', 'gameDraw']) {
		h.status.event = h.event(name, { player: undefined }); h.status.imchoosing = true; h.game.pause(); h.ui.create.confirm('oc');
		const control = h.ui.confirm; h.advance(1000); assert.equal(control.isConnected, true, name);
		h.game.resume(); h.advance(100);
	}
	h.stop();
});

test('a skin close callback cannot leave its retired button node or control registry entry behind', () => {
	const h = actionHarness(); h.wait(h.event('chooseBool')); h.ui.create.confirm('oc'); const old = h.ui.confirm;
	old.close = () => { old.classList.add('closing'); }; h.ui.controls.push(old); h.advance(15008);
	assert.equal(old.isConnected, false); assert.equal(h.ui.controls.includes(old), false); assert.equal(!!h.ui.confirm, false); h.stop();
});
