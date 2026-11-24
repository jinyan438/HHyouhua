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
	h.context.performance = { now: h.environment.now };
	h.context.getComputedStyle = node => ({ backgroundImage: node.style.backgroundImage || 'none' });
	h.images = [];
	h.context.Image = class { constructor() { h.images.push(this); } decode() { return Promise.resolve(); } };
	h.waits = [];
	h._status.pauseManager = { setDelay(promise) { const wait = { done: false, promise }; h.waits.push(wait); return promise.then(() => { wait.done = true; }); } };
	h.flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
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
	assert.equal(root.querySelector('.hh-selection-progress').hidden, false);
	assert.equal(root.querySelector('.hh-selection-progress').firstChild.style.width, '100%');
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
	assert.equal(cover.querySelector('.hh-selection-progress').hidden, false);
	assert.equal(cover.querySelector('.hh-selection-progress').firstChild.style.width, '100%');
	assert.equal(cover.querySelector('.hh-versus-self').querySelector('.hh-card-name').textContent, 'general0');
	assert.deepEqual(h.dialog.buttons.map(button => button.link), candidates);
	h.dialog.close(); assert.equal(h.covers().length, 1);
	h.advance(1000); h.frame(); assert.equal(cover.isConnected, true);
	assert.equal(cover.querySelector('.hh-selection-progress').firstChild.style.width, '50%');
	h.initialize();
	h.parent.handlers.forEach(handler => handler(h.parent, { state: 'begin' }));
	assert.equal(h.waits.length, 0);
	let following = 0; h.parent.pushHandler(() => following++);
	h.end(); assert.equal(following, 1);
	await h.flush();
	assert.equal(h.waits.length, 1); assert.equal(h.waits[0].done, false);
	assert.equal(h.ui.arena.classList.contains('choose-character'), false);
	h.advance(999); h.frame(); assert.equal(cover.isConnected, true);
	h.advance(1); h.frame();
	assert.equal(cover.querySelector('.hh-selection-progress').firstChild.style.width, '0%');
	assert.equal(h.waits[0].done, false);
	h.frame(); assert.equal(cover.isConnected, false);
	await h.flush(); assert.equal(h.waits[0].done, false);
	h.observers.at(-1).callback(); await h.flush(); assert.equal(h.waits[0].done, false);
	h.frame(); await h.flush(); assert.equal(h.waits[0].done, false);
	h.frame();
	await h.flush(); assert.equal(h.waits[0].done, true);
	assert.equal(h.parent.handlers.length, 1); assert.equal(h.event.handlers.length, 0);
	assert.equal(h.timers.size, 0); assert.equal(h.frames.size, 0);
	assert.ok(h.observers.every(observer => observer.disconnected));
});

test('native presentation completion also releases the cover when the parent end hook is unavailable', async () => {
	const h = fixture(); h.open(); h.event.result = h.result; h.dialog.close();
	h.initialize(); h.ui.arena.classList.remove('choose-character');
	h.observers.at(-1).callback(); await h.flush();
	h.advance(2000); h.frame(); h.frame(); h.frame(); h.frame(); await h.flush();
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

test('aborted setup and arena replacement release the cover and their own game delay', async () => {
	for (const abort of [
		h => h.end(),
		h => { h.ui.arena.remove(); h.observers.at(-1).callback(); },
		h => { h.initialize(); h.end(); h.ui.arena = h.document.createElement('div'); h.observers.at(-1).callback(); },
		h => { h.initialize(); h.end(); h._status.over = true; h.observers.at(-1).callback(); },
	]) {
		const h = fixture(); h.open(); h.event.result = h.result; h.dialog.close();
		assert.equal(h.covers().length, 1);
		abort(h); await h.flush();
		assert.equal(h.covers().length, 0); assert.equal(h.parent.handlers.length, 0);
		assert.equal(h.timers.size, 0); assert.equal(h.frames.size, 0);
		assert.ok(h.observers.every(observer => observer.disconnected));
		assert.ok(h.waits.every(wait => wait.done));
	}
});

test('the empty two-second bar keeps covering native setup until every seat is initialized', async () => {
	const h = fixture(); h.open(); h.event.result = h.result; h.dialog.close();
	h.advance(3500); h.frame();
	assert.equal(h.covers().length, 1);
	assert.equal(h.covers()[0].querySelector('.hh-selection-progress').firstChild.style.width, '0%');
	h.initialize(); h.end(); await h.flush(); h.frame(); h.frame(); h.frame(); await h.flush();
	assert.equal(h.covers().length, 0); assert.equal(h.waits[0].done, true);
});

test('portrait and background decoding must complete even after the two-second bar is empty', async () => {
	const h = fixture();
	h.ui.background = h.document.createElement('div');
	h.ui.background.style.backgroundImage = 'url("table.png")';
	h.game.me.node = { avatar: h.document.createElement('div') };
	h.game.me.node.avatar.style.backgroundImage = 'url("portrait.jpg"), url("silhouette.jpg")';
	h.open(); h.event.result = h.result; h.dialog.close(); h.initialize(); h.end();
	assert.deepEqual(h.images.map(image => image.src).sort(), ['portrait.jpg', 'silhouette.jpg', 'table.png']);
	h.advance(2000); h.frame();
	assert.equal(h.covers().length, 1); assert.equal(h.waits[0].done, false);
	let decoded;
	h.images[0].decode = () => new Promise(resolve => { decoded = resolve; });
	h.images[0].onload(); h.images[1].onerror(); h.images[2].onload();
	await h.flush(); h.frame(); assert.equal(h.covers().length, 1);
	decoded(); await h.flush(); h.frame(); h.frame(); h.frame(); await h.flush();
	assert.equal(h.covers().length, 0); assert.equal(h.waits[0].done, true);
	assert.ok(h.images.every(image => image.onload === null && image.onerror === null));
	assert.equal(h.frames.size, 0);
});

test('leaving during portrait loading releases the independent delay without waiting for the image', async () => {
	const h = fixture();
	h.ui.background = h.document.createElement('div'); h.ui.background.style.backgroundImage = 'url("pending.png")';
	h.open(); h.event.result = h.result; h.dialog.close(); h.initialize(); h.end();
	assert.equal(h.images.length, 1); assert.equal(h.waits[0].done, false);
	h.ui.arena.remove(); h.observers.at(-1).callback(); await h.flush();
	assert.equal(h.covers().length, 0); assert.equal(h.waits[0].done, true);
	assert.equal(h.images[0].onload, null); assert.equal(h.images[0].onerror, null);
	assert.equal(h.frames.size, 0); assert.equal(h.parent.handlers.length, 0);
});

test('gameStart can resume only after the arena is uncovered and has had a visible paint', async () => {
	const h = fixture();
	h.game.globalEventHandlers = { pushHandler() { assert.fail('must not wait for opening triggers or phaseLoop'); } };
	h.open(); h.event.result = h.result; h.dialog.close(); h.initialize(); h.end(); await h.flush();
	let gameStarted = false;
	h.waits[0].promise.then(() => { assert.equal(h.covers().length, 0); gameStarted = true; });
	h.advance(2000); h.frame(); await h.flush();
	assert.equal(h.covers().length, 1); assert.equal(gameStarted, false);
	h.frame(); h.observers.at(-1).callback(); await h.flush();
	assert.equal(h.covers().length, 0); assert.equal(gameStarted, false);
	h.frame(); await h.flush(); assert.equal(gameStarted, false);
	h.frame(); await h.flush(); assert.equal(gameStarted, true);
	assert.equal(h.frames.size, 0); assert.equal(h.parent.handlers.length, 0);
});

test('selection preloads deduplicated card-pile artwork without drawing or reordering cards', async () => {
	const h = fixture(); h.ui.cardPile = h.document.createElement('div');
	const cards = [h.document.createElement('div'), h.document.createElement('div')];
	for (const card of cards) { card.style.backgroundImage = 'url("sha.png")'; h.ui.cardPile.appendChild(card); }
	const suit = h.document.createElement('div'); suit.style.backgroundImage = 'url("suit.png")'; cards[0].appendChild(suit);
	h.game.gameDraw = () => assert.fail('must not deal cards while selecting');
	h.open(); h.event.result = h.result; h.dialog.close(); h.initialize(); h.end();
	assert.deepEqual(h.images.map(image => image.src).sort(), ['sha.png', 'suit.png']);
	h.advance(2500); h.frame(); assert.equal(h.covers().length, 1);
	h.images.forEach(image => image.onload()); await h.flush();
	h.frame(); h.frame(); h.frame(); await h.flush();
	assert.equal(h.covers().length, 0); assert.equal(h.waits[0].done, true);
	assert.deepEqual(h.ui.cardPile.children, cards);
});
