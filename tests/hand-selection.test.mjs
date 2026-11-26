import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { setupHandSelection } from '../src/features/handSelection.js';
import { originalHandRow } from '../src/ui/originalCards.js';
import { domFixture } from './helpers/catalog-dom.mjs';

const read = file => fs.readFileSync(new URL(file, import.meta.url), 'utf8');
const source = JSON.parse(read('./fixtures/original-hand-selection.json'));
const client = vm.runInNewContext('({' + Object.values(source.methods).join(',') + '})');

test('source snapshots still match the local original client', () => {
	if (fs.existsSync(source.source.path)) {
		const bytes = fs.readFileSync(source.source.path), text = bytes.toString();
		assert.equal(createHash('sha256').update(bytes).digest('hex'), source.source.sha256);
		for (const method of Object.values(source.methods)) assert.ok(text.includes(method));
	}
});

function originalPositions(count, width, cardWidth, expandedIndex) {
	const cards = Array.from({ length: count }, (_, i) => ({ Card: { CardId: i + 1 }, Selected: i === expandedIndex }));
	const state = { ...client, ...source.constants, cardUiSize: { width: cardWidth },
		cardUis: cards, muniuCardUis: [], stateCardUis: [], pileCardUis: [], additionalCardUis: [],
		virtualGeneralUis: [], virtualCardUis: [], equipCardUis: [], handCardRect: { x: 0, width },
		expandingCardId: expandedIndex + 1, enabaleExpandedLayout: false,
		updateMuniuBg() {}, updateStateBg() {}, showCrowdedTxt() {}, startHandCardTween() {}, event() {},
	};
	const layout = vm.runInNewContext('({' + source.methods['xvi.invalidateLayoutHandCard'] + '}).invalidateLayoutHandCard',
		{ Laya: { timer: { callLater() {} } }, xvi: {} });
	layout.call(state);
	return cards.map(card => card.EndX);
}

test('every selection position follows executable original layout across card counts, widths and scales', () => {
	for (const scale of [.5, 1, 1.6]) for (const width of [300, 852, 1400]) for (const count of [2, 4, 10, 25, 70]) {
		for (let selected = -1; selected < count; selected++) {
			const cardWidth = 126 * scale, row = originalHandRow(count, width, cardWidth, selected);
			const actual = Array.from({ length: count }, (_, i) => i * row.step + (i > selected ? row.expand : 0));
			if (selected >= 0 && selected < count - 1 && width <= 2 * cardWidth && count > 2) {
				assert.ok(row.width > width && row.step > 0, 'narrow-window scroll fallback keeps every card reachable');
				continue;
			}
			const expected = originalPositions(count, width, cardWidth, selected);
			actual.forEach((x, i) => assert.ok(Math.abs(x - expected[i]) < 1e-8, `${scale}/${width}/${count}/${selected}/${i}`));
		}
	}
	const pictured = originalHandRow(10, 852, 126, 6);
	assert.equal(pictured.step, 75); assert.equal(pictured.expand, 51); assert.equal(pictured.width, 852);
});

function selectionArray(items = []) {
	const array = [...items];
	Object.defineProperties(array, {
		add: { value(item) { if (!this.includes(item)) this.push(item); } },
		remove: { value(item) { const index = this.indexOf(item); if (index >= 0) this.splice(index, 1); } },
	});
	return array;
}

function fixture(count = 10, max = 1) {
	const { Element } = domFixture(), hand = new Element(), container = new Element(), me = new Element();
	me.appendChild(container); container.appendChild(hand);
	const cards = Array.from({ length: count }, (_, index) => {
		const card = new Element(); card.className = 'card'; card.name = index % 2 ? 'sha' : 'shan';
		card.suit = index % 2 ? 'heart' : 'spade'; card.number = index + 1;
		card.updateTransform = selected => { card.lifted = !!selected; }; hand.appendChild(card); return card;
	});
	const ui = { selected: { cards: selectionArray(), buttons: selectionArray(), targets: selectionArray() },
		handcards1: hand, handcards1Container: container, me, click: {}, arena: new Element() };
	const player = { getCards: () => cards, isOut: () => false, node: { equips: new Element() } };
	const event = { name: 'chooseToUse', player, position: 'h', selectCard: max,
		filterCard: () => true, isMine: () => true, custom: { replace: {}, add: {} } };
	const status = { event }, hooks = { checkCard: [], checkEnd: [], uncheckCard: [], uncheckEnd: [] };
	const lib = { config: {}, hooks, filter: { cardAiIncluded: () => true, cardRespondable: () => true } };
	const get = { select: value => { value = typeof value === 'function' ? value() : value; return Array.isArray(value) ? value : [value, value]; }, info: () => undefined };
	const game = { me: player, callHook(name, args) { for (const hook of hooks[name] || []) hook(...args); },
		uncheck(type) {
			assert.equal(type, 'target'); for (const target of ui.selected.targets) target.classList.remove('selected');
			ui.selected.targets.length = 0; game.callHook('uncheckEnd', [event, [type]]);
		},
		check() { check.card(event, false); game.callHook('checkEnd', [event, {}]); },
	};
	const context = { lib, game, ui, get, _status: status, decadeUI: { layout: { invalidateHand() {} } } };
	const check = vm.runInNewContext(read('../../../noname/game/check.js').replace(/^import .*;\r?$/gm, '')
		.replace('export class Check', 'class Check') + '; new Check()', context);
	game.Check = check;
	const click = vm.runInNewContext(read('../src/overrides/ui/click.js').replace(/^import .*;\r?$/gm, '')
		.replace(/export function /g, 'function ') + '; uiClickCard', context);
	const controller = setupHandSelection({ lib, game, ui, get, _status: status });
	game.check();
	return { cards, ui, event, game, lib, get, status, controller, check, Element,
		click(index) { status.clicked = false; click.call(cards[index]); },
	};
}

test('native click switches directly between every pair of hand cards and deselects on a second click', () => {
	const h = fixture();
	const owned = [...h.cards];
	for (const index of [6, 0, 9, 4, 1, 8, 2, 7, 3, 5]) {
		h.click(index);
		assert.deepEqual([...h.ui.selected.cards], [h.cards[index]]);
		assert.equal(h.cards.filter(card => card.classList.contains('selected')).length, 1);
		assert.equal(h.cards[index].lifted, true);
		assert.equal(h.cards.filter(card => card.classList.contains('hh-hand-switchable')).length, 9);
		assert.deepEqual(h.cards, owned, 'selection never reorders or moves owned cards');
	}
	h.click(5); assert.equal(h.ui.selected.cards.length, 0);
	assert.ok(h.cards.every(card => !card.classList.contains('hh-hand-switchable') && !card.lifted));
});

test('selection at a finite multi-card limit evicts the oldest card, preserving the other selections', () => {
	const h = fixture(8, [2, 3]);
	for (const index of [1, 3, 5, 7]) h.click(index);
	assert.deepEqual([...h.ui.selected.cards], [h.cards[3], h.cards[5], h.cards[7]]);
	assert.equal(h.cards[1].classList.contains('selected'), false);
	h.click(3); assert.deepEqual([...h.ui.selected.cards], [h.cards[5], h.cards[7]]);
	h.click(0); assert.deepEqual([...h.ui.selected.cards], [h.cards[5], h.cards[7], h.cards[0]]);
});

test('same-suit complex filters are re-evaluated after removing the oldest card', () => {
	const h = fixture(6, 2);
	h.event.complexCard = true;
	h.event.filterCard = card => !h.ui.selected.cards.length || h.ui.selected.cards[0].suit === card.suit;
	h.game.check(); h.click(1); h.click(3);
	h.click(0); assert.deepEqual([...h.ui.selected.cards], [h.cards[1], h.cards[3]]);
	h.click(5); assert.deepEqual([...h.ui.selected.cards], [h.cards[3], h.cards[5]]);
	assert.equal(h.cards[0].classList.contains('hh-hand-switchable'), false);
	const single = fixture(4);
	single.event.complexCard = true;
	single.event.filterCard = card => !single.ui.selected.cards.length || single.ui.selected.cards[0].suit === card.suit;
	single.click(0); single.click(1);
	assert.deepEqual([...single.ui.selected.cards], [single.cards[1]], 'single-card filter sees the empty replacement slot');
});

test('illegal replacements leave the current card, target and selection array identities intact', () => {
	for (const reject of [h => { h.cards[2].classList.add('uncheck'); },
		h => { h.event.filterCard = card => card !== h.cards[2]; },
		h => { h.lib.filter.cardRespondable = card => card !== h.cards[2]; },
		h => { h.lib.filter.cardAiIncluded = card => card !== h.cards[2]; },
		h => { h.event.player.getCards = () => h.cards.slice(0, 2); }]) {
		const h = fixture(4); h.click(0); reject(h);
		const target = new h.Element(); target.classList.add('selected'); h.ui.selected.targets.push(target);
		const selected = h.ui.selected.cards, targets = h.ui.selected.targets;
		h.game.check(); h.click(2);
		assert.equal(h.ui.selected.cards, selected); assert.equal(h.ui.selected.targets, targets);
		assert.deepEqual([...selected], [h.cards[0]]); assert.deepEqual([...targets], [target]);
		assert.equal(h.cards[0].classList.contains('selected'), true);
	}
});

test('successful switching clears previous targets and virtual display hooks before a single final check', () => {
	const h = fixture(4); h.click(0);
	const target = new h.Element(); target.classList.add('selected'); h.ui.selected.targets.push(target);
	h.event.filterTarget = () => true; h.event._cardChoice = {}; h.event._targetChoice = {};
	h.cards[0]._tempName = new h.Element();
	h.lib.hooks.uncheckCard.push(card => { card._tempName?.remove(); delete card._tempName; });
	let checks = 0; const check = h.game.check; h.game.check = () => { checks++; check(); };
	h.click(1);
	assert.equal(checks, 1); assert.equal(h.ui.selected.targets.length, 0);
	assert.equal(target.classList.contains('selected'), false);
	assert.equal(h.cards[0]._tempName, undefined); assert.equal(h.event._targetChoice, undefined);
	assert.deepEqual([...h.ui.selected.cards], [h.cards[1]]);
});

test('filter failures restore speculative state and do not run confirmation or custom callbacks', () => {
	const h = fixture(4); h.click(0);
	const selected = h.ui.selected.cards, targets = h.ui.selected.targets;
	let callbacks = 0; h.event.custom.add.card = () => { callbacks++; };
	h.event.filterCard = () => { throw Error('third-party filter'); };
	assert.doesNotThrow(() => h.controller.replaceOldest(h.cards[1]));
	assert.equal(h.ui.selected.cards, selected); assert.equal(h.ui.selected.targets, targets);
	assert.equal(h.cards[0].classList.contains('selected'), true); assert.equal(callbacks, 0);
});

test('AI, playback, foreign choices, custom replacement, unlimited and automatic-all selectors keep native behavior', () => {
	for (const change of [h => { h.status.auto = true; }, h => { h.status.video = true; },
		h => { h.status.over = true; }, h => { h.event.result = { bool: true }; },
		h => { h.event.isMine = () => false; }, h => { h.game.me = {}; },
		h => { h.event.custom.replace.card = () => {}; },
		h => { h.event.selectCard = [0, Infinity]; }, h => { h.event.selectCard = -1; }]) {
		const h = fixture(4); h.click(0); change(h);
		assert.equal(h.controller.replaceOldest(h.cards[1]), undefined);
		assert.deepEqual([...h.ui.selected.cards], [h.cards[0]]);
	}
});

test('uncheck, game over and repeat installation clean switch highlights without duplicating hooks', () => {
	const h = fixture(4); h.click(0);
	assert.equal(setupHandSelection({ lib: h.lib, game: h.game }), h.controller);
	assert.equal(h.lib.hooks.checkEnd.length, 1);
	h.game.callHook('uncheckEnd', [h.event, ['card']]);
	assert.ok(h.cards.every(card => !card.classList.contains('hh-hand-switchable')));
	h.game.check(); assert.equal(h.cards[1].classList.contains('hh-hand-switchable'), true);
	h.lib.onover[0](); assert.ok(h.cards.every(card => !card.classList.contains('hh-hand-switchable')));
});

test('actual HH layout opens the last selected card including distribution copies and recovers after removal', () => {
	const h = fixture(10, 2), distribution = new h.Element(); distribution.className = 'card selected';
	distribution.updateTransform = () => {};
	const all = [...h.cards, distribution];
	const context = { game: { ...h.game, hhCardDistribution: { handCards: [distribution], updateHandWidth() {} } },
		ui: h.ui, originalHandRow, decadeUI: { boundsCaches: { hand: { check() {}, width: 600, cardWidth: 126, cardHeight: 174, cardScale: 1 } } } };
	const code = read('../src/core/layout.js').replace(/^import .*;\r?$/gm, '').replace('export function createLayoutModule', 'function createLayoutModule');
	const layout = vm.runInNewContext(code + '; createLayoutModule()', context);
	h.ui.selected.buttons.push(distribution); layout.updateHand();
	assert.equal(distribution.tx + 126, 600);
	h.ui.selected.buttons.length = 0; distribution.classList.remove('selected');
	h.click(6); layout.updateHand();
	assert.equal(all[7].tx - all[6].tx, 126, 'selected card fully visible before its right neighbor');
	assert.equal(all.at(-1).tx + 126, 600);
	h.cards[6].classList.add('removing'); layout.updateHand();
	assert.equal(h.cards[6].scaled, false); assert.equal(all.at(-1).tx + 126, 600);
});
