import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { createPublicHandView, getPublicHand, getPublicHandLayout, getPublicHandSummary } from '../src/ui/publicHand.js';
import { domFixture } from './helpers/catalog-dom.mjs';

test('layout agrees with the executable original tooltip for zero through forty cards', () => {
	const snapshot = JSON.parse(fs.readFileSync(new URL('fixtures/original-public-hand.json', import.meta.url)));
	const Original = vm.runInNewContext(snapshot.classes.Sns + ';Sns', { VOi: class {}, ZP: { M_CARD_SIZE: { width: 126, height: 174 } } });
	const original = Object.create(Original.prototype);
	for (let count = 0; count <= 40; count++) {
		const layout = getPublicHandLayout(count);
		assert.equal(layout.width, original.calculateWidth(count));
		assert.equal(layout.height, original.calculateHeight(count));
	}
	const sources = JSON.parse(fs.readFileSync(new URL('../assets/public-hand/sources.json', import.meta.url)));
	for (const file of sources.files) assert.equal(createHash('sha256').update(fs.readFileSync(new URL('../assets/public-hand/' + file.file, import.meta.url))).digest('hex'), file.sha256);
});

function fixture() {
	const h = domFixture(), { document, Element } = h;
	const arena = new Element(); arena.clientWidth = 1000; arena.clientHeight = 750;
	arena.offsetWidth = 1000; arena.offsetHeight = 750; document.body.appendChild(arena);
	const makePlayer = (left = 800) => {
		const player = new Element(); arena.appendChild(player);
		player.offsetLeft = left; player.offsetTop = 220; player.offsetWidth = 146; player.offsetHeight = 232;
		const rect = player.getBoundingClientRect.bind(player);
		player.getBoundingClientRect = () => { const r = rect(); return { ...r, right: r.left + r.width, bottom: r.top + r.height }; };
		player.node = { count: new Element(), handcards1: new Element(), handcards2: new Element() }; player.appendChild(player.node.count);
		player.hand = Array.from({ length: 4 }, (_, i) => ({ name: 'sha', number: i + 1, shown: true }));
		player.getCards = () => [...player.hand]; player.isUnderControl = () => false; player.isDead = () => false;
		return player;
	};
	const me = makePlayer(), player = makePlayer(), other = makePlayer(80);
	let full = false;
	me.hasSkillTag = () => full;
	const context = { game: { me }, lib: { config: {} }, get: { is: { shownCard: c => c.shown }, translation: () => '曹昂' }, ui: { arena, create: {
		button(card) { const node = new Element(); node.className = 'card'; node.link = card; return node; },
		card() { const node = new Element(); node.className = 'card'; return node; },
	} } };
	const observers = [];
	class Observer { constructor(callback) { this.callback = callback; observers.push(this); } observe() {} disconnect() { this.disconnected = true; } }
	const environment = { document, setTimeout: h.environment.setTimer, clearTimeout: h.environment.clearTimer, MutationObserver: Observer, ResizeObserver: Observer };
	const view = createPublicHandView(context, environment); view.attach(player); view.attach(other);
	return { ...h, arena, player, other, context, view, observers, full(value) { full = value; }, panel: () => arena.querySelector('.hh-public-hand') };
}

test('view permission preserves partial public cards and never exports hidden card objects', () => {
	const h = fixture(), hidden = h.player.hand[1]; hidden.shown = false;
	assert.equal(getPublicHand(h.player, h.context).cards.includes(hidden), false);
	h.view.open(h.player);
	assert.equal(h.panel().querySelectorAll('.infohidden').length, 1);
	assert.ok(h.panel().querySelectorAll('.card').every(node => node.link !== hidden));
	h.full(true); h.view.refresh();
	assert.equal(h.panel().querySelectorAll('.infohidden').length, 0);
	h.full(false); h.player.hand.forEach(c => c.shown = false); h.view.refresh();
	assert.equal(h.panel(), null);
	assert.equal(h.player.node.count.classList.contains('hh-public-hand-available'), false);
	assert.equal(h.view.open(h.context.game.me), false);
});

test('a single anchored panel refreshes on hand changes, and switching never moves real cards', () => {
	const h = fixture(), original = [...h.player.hand];
	h.view.open(h.player); const panel = h.panel();
	assert.equal(panel.querySelectorAll('.card').length, 4);
	assert.equal(panel.style['--hh-hand-origin'], '100% 50%');
	h.player.hand.push({ name: 'tao', shown: true }); h.observers[0].callback();
	assert.equal(panel.querySelectorAll('.card').length, 5);
	assert.deepEqual(h.player.hand.slice(0, 4), original);
	h.view.open(h.other);
	assert.equal(h.arena.querySelectorAll('.hh-public-hand').length, 1);
	assert.equal(h.player.node.count.getAttribute('aria-expanded'), 'false');
	assert.equal(h.panel().style['--hh-hand-origin'], '0% 50%');
	h.view.detach(h.other); assert.equal(h.panel(), null);
});

test('outside dismissal, rapid reopen, death and teardown release cards and observers', () => {
	const h = fixture(); h.view.open(h.player);
	h.document.emit('pointerdown', { target: h.arena });
	assert.equal(h.panel().querySelectorAll('.card').length, 0);
	h.advance(149); assert.ok(h.panel()); h.view.open(h.other); h.advance(1); assert.ok(h.panel());
	h.other.isDead = () => true; h.view.refresh(); assert.equal(h.panel(), null);
	h.view.open(h.player); h.document.hidden = true; h.document.emit('visibilitychange'); assert.equal(h.panel(), null);
	h.view.clear(); assert.ok(h.observers.every(o => o.disconnected));
	assert.equal(h.player.node.count.getAttribute('role'), null);
});

test('touch opens directly, suppresses its synthetic click and ignores a swipe', () => {
	const h = fixture(), count = h.player.node.count;
	const tap = (type, x = 5) => count.emit(type, { touches: [{ clientX: 5, clientY: 5 }], changedTouches: [{ clientX: x, clientY: 5 }], stopImmediatePropagation() {} });
	tap('touchstart'); tap('touchend'); assert.ok(h.panel());
	tap('click'); assert.ok(h.panel()); assert.equal(h.panel().classList.contains('hh-public-hand-closing'), false);
	h.view.close(true); tap('touchstart'); tap('touchend', 60); assert.equal(h.panel(), null);
});

test('visible hand names remain beside the player before opening and after dismissing the full hand', () => {
	const h = fixture(), summary = h.player.node.showCards;
	assert.equal(h.panel(), null); assert.equal(summary.hidden, false);
	assert.equal(summary.querySelector('.hh-public-hand-summary-names').textContent.split('\n').length, 4);
	assert.equal(summary.querySelector('.hh-public-hand-summary-more').hidden, true);
	summary.emit('click', { stopImmediatePropagation() {} }); assert.equal(h.panel().querySelectorAll('.card').length, 4);
	h.document.emit('pointerdown', { target: h.arena }); h.advance(150);
	assert.equal(h.panel(), null); assert.equal(summary.hidden, false);
	h.player.hand.push({ name: 'tao', shown: true }); h.view.update(h.player);
	assert.equal(summary.querySelector('.hh-public-hand-summary-more').hidden, false);
	h.player.hand.splice(1); h.view.update(h.player);
	assert.equal(summary.querySelector('.hh-public-hand-summary-names').textContent.split('\n').length, 1);
	assert.equal(summary.querySelector('.hh-public-hand-summary-more').hidden, true);
	h.player.hand[0].shown = false; h.view.update(h.player);
	assert.equal(summary.hidden, true); assert.equal(summary.querySelector('.hh-public-hand-summary-names').textContent, '');
	h.view.detach(h.player); assert.equal(summary.parentNode, null); assert.equal(h.player.node.showCards, undefined);
});

test('summary keeps elemental Sha names, abbreviates weapons and only lists authorized cards', () => {
	const context = { lib: { translate: {} }, get: { translation: name => ({ sha: '杀', tao: '桃', shan: '闪' })[name] || name } };
	assert.deepEqual(getPublicHandSummary([{ name: 'sha', nature: 'thunder' }, { name: 'sha', nature: ['fire'] }, { name: 'sha', nature: 'ice' }, { name: 'zhuge' }, { name: 'tao' }], context), ['雷杀', '火杀', '冰杀', '连弩']);
	const h = fixture(); h.player.hand.forEach(c => c.shown = false); h.view.refresh();
	assert.equal(h.player.node.showCards.hidden, true);
	h.full(true); h.view.refresh(); assert.equal(h.player.node.showCards.hidden, false);
	h.context.game.me = h.player; h.view.refresh(); assert.equal(h.player.node.showCards.hidden, true);
});

test('refresh attaches a player initialized before the hand manager and reuses the same summary', () => {
	const h = fixture(); h.view.detach(h.player); h.context.game.players = [h.player];
	h.view.refresh(); const summary = h.player.node.showCards;
	assert.equal(summary.hidden, false); h.view.refresh(); h.view.attach(h.player);
	assert.equal(h.player.querySelectorAll('.hh-public-hand-summary').length, 1);
	assert.equal(h.player.node.showCards, summary);
});

test('switching native player control preserves both skill-display refreshes alongside the public hand', () => {
	const before = { name: 'before' }, after = { name: 'after' }, refreshed = [];
	let hands = 0, layouts = 0;
	const game = { me: before, players: [before, after], dead: [], hhPublicHand: { refresh() { hands++; } }, hhDoudizhuLayout: { refresh() { layouts++; } } };
	const source = fs.readFileSync(new URL('../src/overrides/game.js', import.meta.url), 'utf8')
		.replace(/^import .*from "noname";\r?$/m, '').replace(/\bexport (?=function)/g, '');
	const swap = vm.runInNewContext(source + '\nsetBaseGameMethods(baseMethods);gameSwapPlayer;', {
		game, lib: { config: {}, refreshPlayerSkills(player) { refreshed.push(player); } }, ui: {},
		baseMethods: { swapPlayer(player) { game.me = player; return 'swapped'; } },
	});
	assert.equal(swap.call(game, after), 'swapped');
	assert.deepEqual(refreshed, [before, after, before, after]);
	assert.equal(hands, 1); assert.equal(layouts, 1);
});
