import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { domFixture } from './helpers/catalog-dom.mjs';
import { setupGuozhanHidden } from '../src/ui/guozhanHidden.js';

function fixture() {
	const { document, Element } = domFixture();
	globalThis.MutationObserver = class { constructor(callback) { this.callback = callback; } observe() {} };
	const arena = new Element(); document.body.appendChild(arena);
	const ui = { arena, updates: [] }, lib = { arenaReady: [] }, _status = {};
	let mode = 'guozhan';
	const game = { players: [], dead: [] };
	for (let i = 0; i < 3; i++) {
		const player = new Element(); player.className = 'player unseen unseen2';
		player.node = { avatar: new Element(), avatar2: new Element() };
		player.append(player.node.avatar, player.node.avatar2); arena.appendChild(player);
		// Presentation must not inspect an opponent's hidden identity, group or character.
		for (const name of ['identity', 'group', 'name1', 'name2']) Object.defineProperty(player, name, { get() { throw Error('private character read'); } });
		game.players.push(player);
	}
	game.me = game.players[0];
	const controller = setupGuozhanHidden({ lib, game, ui, get: { mode: () => mode }, _status });
	lib.arenaReady.forEach(fn => fn());
	return { document, Element, ui, lib, game, _status, controller, frame() { ui.updates.forEach(fn => fn()); }, setMode(value) { mode = value; } };
}

test('owner portraits and public unknown backs are separate and do not read hidden character data', () => {
	const h = fixture(), [owner, other] = h.game.players;
	assert.equal(owner.classList.contains('hh-guozhan-local'), true);
	assert.equal(other.classList.contains('hh-guozhan-local'), false);
	assert.equal(h.controller.canView(other), false);
	assert.equal(owner.querySelector('.hh-guozhan-vice-label').style.display, 'none');
	assert.equal(other.querySelector('.hh-guozhan-vice-label').style.display, 'block');
	other.classList.remove('unseen2'); h.controller.update(other);
	assert.equal(other.querySelector('.hh-guozhan-vice-label').style.display, 'none');
	for (const player of h.game.players) {
		assert.equal(player.querySelectorAll('.hh-guozhan-hidden-face').length, 2);
		assert.equal(player.querySelectorAll('.hh-guozhan-latent').length, 2);
		assert.equal(player.querySelector('.hh-guozhan-vice-label').textContent, '副将');
	}
	h.controller.observe(owner); h.controller.refresh();
	assert.equal(owner.querySelectorAll('.hh-guozhan-hidden-face').length, 2);
});

test('replay, observer, control changes and other modes clear owner-only presentation', () => {
	const h = fixture(), [owner, other] = h.game.players;
	for (const flag of ['video', 'observe']) {
		h._status[flag] = true; h.frame();
		assert.equal(h.controller.canView(owner), false);
		assert.equal(owner.classList.contains('hh-guozhan-local'), false);
		delete h._status[flag]; h.frame();
	}
	h.ui.arena.classList.add('observe'); h.frame();
	assert.equal(owner.classList.contains('hh-guozhan-local'), false);
	h.ui.arena.classList.remove('observe'); h.game.me = other; h.frame();
	assert.equal(owner.classList.contains('hh-guozhan-local'), false);
	assert.equal(other.classList.contains('hh-guozhan-local'), true);
	h.setMode('identity'); h.frame();
	assert.equal(other.classList.contains('hh-guozhan-hidden'), false);
	assert.equal(other.classList.contains('hh-guozhan-local'), false);
});

test('reinitialization restores cleared overlays while previews and detached seats are excluded', () => {
	const h = fixture(), player = h.game.players[1];
	player.node.avatar.textContent = ''; h.controller.observe(player);
	assert.equal(player.node.avatar.querySelectorAll('.hh-guozhan-hidden-face').length, 1);
	player.noclick = true; h.controller.update(player);
	assert.equal(player.classList.contains('hh-guozhan-hidden'), false);
	player.noclick = false; player.remove(); h.controller.update(player);
	assert.equal(player.classList.contains('hh-guozhan-hidden'), false);
	h.ui.arena.appendChild(player); h.controller.update(player);
	assert.equal(player.classList.contains('hh-guozhan-hidden'), true);
});

test('all four back, scanline and latent PNGs retain the original client bytes', () => {
	const base = new URL('../assets/guozhan-hidden/', import.meta.url);
	const sources = JSON.parse(fs.readFileSync(new URL('sources.json', base)));
	assert.equal(sources.files.length, 4);
	for (const file of sources.files) assert.equal(createHash('sha256').update(fs.readFileSync(new URL(file.file, base))).digest('hex'), file.sha256);
});
