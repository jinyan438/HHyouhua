import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { domFixture } from './helpers/catalog-dom.mjs';
import { setupGuozhanIdentity } from '../src/ui/guozhanIdentity.js';

function fixture(beforeArena = false) {
	const { document, Element } = domFixture();
	Element.prototype.removeAttribute = function (name) { delete this.attributes[name]; if (name === 'tabindex') delete this.tabIndex; };
	const observers = [];
	globalThis.MutationObserver = class {
		constructor(callback) { this.callback = callback; observers.push(this); }
		observe() {} disconnect() { this.disconnected = true; }
	};
	const lib = { assetURL: '', arenaReady: [], onover: [] }, _status = {};
	let mode = 'guozhan';
	const get = { mode: () => mode, population: () => 0, is: { jun: () => false }, translation: group => group };
	const game = { players: [], dead: [], hasPlayer: () => false };
	const native = fs.readFileSync(new URL('../../../mode/guozhan/src/patch/game.js', import.meta.url), 'utf8');
	const start = native.indexOf('\tgetIdentityList(player) {'), end = native.indexOf('\n\t/**', start);
	game.getIdentityList = vm.runInNewContext('({' + native.slice(start, end) + '})', { game, get, _status }).getIdentityList;
	const ui = beforeArena ? {} : { window: document.body };
	if (beforeArena) globalThis.document = document;
	const controller = setupGuozhanIdentity({ lib, game, ui, get, _status });
	ui.window = document.body;
	for (let i = 0; i < 3; i++) {
		const player = new Element();
		player.className = 'player unseen unseen2';
		player.identity = 'unknown'; player.identityShown = false;
		player.node = { identity: new Element() }; player.node.identity.className = 'identity guessing';
		player.node.identity.appendChild(new Element()); player.appendChild(player.node.identity);
		player.isUnseen = () => player.classList.contains('unseen') && player.classList.contains('unseen2');
		player.isDead = () => !!player.dead;
		// Rendering a guess must never read private character/group data.
		Object.defineProperty(player, 'group', { get() { throw Error('private group read'); }, set() { throw Error('gameplay group write'); } });
		document.body.appendChild(player); game.players.push(player); controller.observe(player);
	}
	game.me = game.players[0];
	const menu = () => document.body.querySelector('.hh-guozhan-force-menu');
	const click = player => player.node.identity.emit('click', { stopImmediatePropagation() {} });
	function toggle(player, group) {
		click(player); const button = menu()?.querySelector(`[data-group="${group}"]`);
		assert.ok(button, group + ' is offered'); button.emit('click'); assert.equal(menu(), null);
	}
	return { document, lib, game, get, _status, controller, menu, click, toggle, observers, setMode(value) { mode = value; } };
}

test('installs before arena creation; native hidden-seat rules and per-player exclusions never mutate gameplay identity', () => {
	const h = fixture(true), [, player, other] = h.game.players;
	h.click(h.game.me); assert.equal(h.menu(), null);
	h.click(player); assert.equal(h.menu().children.length, 5); h.controller.close();
	for (const group of ['wu', 'qun', 'shu', 'wei']) h.toggle(player, group);
	assert.deepEqual(player._guozhanguess, ['jin']); assert.equal(player.identity, 'unknown');
	assert.equal(player.node.identity.dataset.color, 'jin');
	assert.match(player.node.identity.querySelector('.hh-guozhan-force-badge').style.backgroundImage, /countrywarforceshow_jin/);
	assert.equal(other._guozhanguess, undefined);
	h.toggle(player, 'jin'); assert.deepEqual(player._guozhanguess, []);
	assert.match(player.node.identity.querySelector('.hh-guozhan-force-badge').style.backgroundImage, /conic-gradient/);
	h.toggle(player, 'jin'); assert.deepEqual(player._guozhanguess, ['jin']);
	h.click(player); assert.equal(h.menu().querySelector('[data-group="wei"]').getAttribute('aria-pressed'), 'true');
	h.controller.close(); h.toggle(other, 'jin');
	assert.deepEqual(other._guozhanguess, ['wu', 'qun', 'shu', 'wei']); assert.deepEqual(player._guozhanguess, ['jin']);
});

test('a public reveal restores the HH faction display and dismisses the popup; replay and other modes keep their native behavior', () => {
	const h = fixture(), player = h.game.players[1];
	h.toggle(player, 'wu'); h.click(player); assert.ok(h.menu());
	player.identity = 'wei'; player.identityShown = true; h.controller.update(player);
	assert.equal(h.menu(), null);
	assert.equal(player.node.identity.querySelector('.hh-guozhan-force-badge').hidden, true);
	assert.equal(player.node.identity.classList.contains('hh-guozhan-identity'), false);
	assert.equal(player.node.identity.getAttribute('role'), null);
	assert.equal(player.node.identity.getAttribute('tabindex'), null);
	h.click(player); assert.equal(h.menu(), null);
	player.identityShown = false; player.identity = 'unknown'; h.controller.update(player);
	assert.equal(player.node.identity.querySelector('.hh-guozhan-force-badge').hidden, false);
	assert.equal(player.node.identity.classList.contains('hh-guozhan-identity'), true);
	h._status.video = true; h.click(player); assert.equal(h.menu(), null); h._status.video = false;
	h._status.dragged = true; h.click(player); assert.equal(h.menu(), null); h._status.dragged = false;
	h.setMode('identity'); h.controller.update(player);
	assert.equal(h.click(player).defaultPrevented, undefined);
	assert.equal(player.node.identity.classList.contains('hh-guozhan-identity'), false);
});

test('banned countries use the original four slots; dismissal, duplicate touch and removed seats clean up', () => {
	const h = fixture(), player = h.game.players[1];
	h._status.bannedGroup = 'group_wu'; h.controller.refresh(); h.click(player);
	assert.deepEqual(h.menu().children.map(button => button.dataset.group), ['jin', 'qun', 'shu', 'wei']);
	h.document.emit('keydown', { key: 'Escape' }); assert.equal(h.menu(), null);
	player.node.identity.emit('touchend', { stopImmediatePropagation() {} }); assert.ok(h.menu());
	h.click(player); assert.ok(h.menu(), 'synthetic click does not toggle the menu a second time');
	player.remove(); h.observers.at(-1).callback(); assert.equal(h.menu(), null);
	assert.equal(h.observers.at(-1).disconnected, true);
	h.lib.onover.forEach(callback => callback());
});

test('all faction sprites, including Jin, retain the original client bytes', () => {
	const base = new URL('../assets/guozhan-force/', import.meta.url);
	const manifest = JSON.parse(fs.readFileSync(new URL('sources.json', base)));
	for (const file of manifest.files) assert.equal(createHash('sha256').update(fs.readFileSync(new URL(file.file, base))).digest('hex'), file.sha256);
	assert.ok(manifest.files.some(file => file.file === 'countrywarforce_jin1.png'));
});
