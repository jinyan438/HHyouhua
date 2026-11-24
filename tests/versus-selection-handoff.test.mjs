import assert from 'node:assert/strict';
import test from 'node:test';
import { selectionFixture } from './helpers/selection-dom.mjs';

function fixture() {
	const h = selectionFixture({ mode: 'versus', count: 12 });
	h._status.mode = 'two';
	h.game.players.forEach((player, index) => { player.side = index < 2; });
	h.parent.finish = () => {};
	h.parent.handlers = []; h.event.handlers = [];
	for (const event of [h.parent, h.event]) {
		event.pushHandler = handler => event.handlers.push(handler);
		event.getHandler = () => event.handlers;
	}
	h.ui.arena = h.document.createElement('div');
	h.ui.arena.classList.add('choose-character'); h.ui.window.appendChild(h.ui.arena);
	const frames = new Map(); let sequence = 0;
	h.context.requestAnimationFrame = callback => { const id = ++sequence; frames.set(id, callback); return id; };
	h.context.cancelAnimationFrame = id => frames.delete(id);
	h.frame = () => { const pending = [...frames]; frames.clear(); pending.forEach(([, callback]) => callback()); };
	h.frames = frames;
	h.covers = () => h.ui.window.querySelectorAll('.hh-identity-viewport');
	h.end = (event = h.parent) => event.handlers.forEach(handler => handler(event, { state: 'end' }));
	h.initialize = () => h.game.players.forEach((player, index) => { player.name1 = 'general' + index; });
	h.result = { bool: true, links: ['general0'] };
	return h;
}

test('confirmed Happy selection stays covered through slow native initialization and reveals a painted arena', async () => {
	const h = fixture(), root = h.open(), candidates = h.dialog.buttons.map(button => button.link);
	h.dialog.buttons[0].emit('click'); h.dialog.buttons[0].emit('click');
	h.event.result = h.result;
	h.ui.selected.buttons.length = 0; h.observers[1].callback();
	assert.equal(root.querySelector('.hh-versus-self')._hhButton, h.dialog.buttons[0]);
	h.end(h.event);
	assert.equal(root.isConnected, false); assert.equal(h.dialog._hhSelection, undefined);
	assert.equal(h.covers().length, 1);
	const cover = h.covers()[0];
	assert.equal(cover.inert, true); assert.equal(cover.style.pointerEvents, 'none');
	assert.equal(cover.getAttribute('aria-hidden'), 'true');
	assert.equal(cover.querySelectorAll('.hh-versus-name').length, 12);
	assert.equal(cover.querySelector('.hh-versus-self').querySelector('.hh-card-name').textContent, 'general0');
	assert.deepEqual(h.dialog.buttons.map(button => button.link), candidates);
	h.dialog.close(); assert.equal(h.covers().length, 1);
	h.advance(1500); h.frame(); assert.equal(cover.isConnected, true);
	h.initialize();
	h.parent.handlers.forEach(handler => handler(h.parent, { state: 'begin' }));
	assert.equal(h.frames.size, 0);
	let following = 0; h.parent.pushHandler(() => following++);
	h.end(); assert.equal(following, 1);
	assert.equal(h.ui.arena.classList.contains('choose-character'), false);
	h.frame(); assert.equal(cover.isConnected, true);
	h.frame(); assert.equal(cover.isConnected, false);
	await Promise.resolve();
	assert.equal(h.parent.handlers.length, 1); assert.equal(h.event.handlers.length, 0);
	assert.equal(h.timers.size, 0); assert.equal(h.frames.size, 0);
	assert.ok(h.observers.every(observer => observer.disconnected));
});

test('native presentation completion also releases the cover when the parent end hook is unavailable', async () => {
	const h = fixture(); h.open(); h.event.result = h.result; h.dialog.close();
	h.initialize(); h.ui.arena.classList.remove('choose-character');
	h.observers.at(-1).callback(); h.frame(); h.frame();
	await Promise.resolve();
	assert.equal(h.covers().length, 0); assert.equal(h.parent.handlers.length, 0);
	assert.equal(h.timers.size, 0);
});

test('cancelled choices and native free-selection switches clean up without a transition cover', () => {
	for (const result of [undefined, 'ai', { bool: false, links: ['general0'] }]) {
		const h = fixture(); h.open(); h.event.result = result; h.dialog.close();
		assert.equal(h.covers().length, 0); assert.equal(h.parent.handlers.length, 0);
		assert.equal(h.timers.size, 0);
	}
});

test('aborted setup, arena replacement and stalled initialization cannot leave a frozen cover', async () => {
	for (const abort of [
		h => h.end(),
		h => { h.ui.arena.remove(); h.observers.at(-1).callback(); },
		h => { h.initialize(); h.end(); h.ui.arena = h.document.createElement('div'); h.observers.at(-1).callback(); },
		h => h.advance(3000),
	]) {
		const h = fixture(); h.open(); h.event.result = h.result; h.dialog.close();
		assert.equal(h.covers().length, 1);
		abort(h); await Promise.resolve();
		assert.equal(h.covers().length, 0); assert.equal(h.parent.handlers.length, 0);
		assert.equal(h.timers.size, 0); assert.equal(h.frames.size, 0);
		assert.ok(h.observers.every(observer => observer.disconnected));
	}
});
