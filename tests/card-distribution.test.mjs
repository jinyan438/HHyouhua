import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { setupCardDistribution } from '../src/features/cardDistribution.js';

function node(classes = '') {
	const values = new Set(classes.split('.').filter(Boolean));
	return { children: [], style: {}, classList: {
		contains: key => values.has(key), add: key => values.add(key), remove: key => values.delete(key),
		toggle(key, on) { if (on ?? !values.has(key)) values.add(key); else values.delete(key); },
	}, appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
		remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this); this.parentNode = null; },
		close() { this.remove(); },
	};
}
function fixture({ mine = true, online = false } = {}) {
	const ui = { selected: { buttons: [], cards: [], targets: [] }, handcards1: node(), handcards1Container: node(), create: {} }, status = {};
	ui.handcards1Container.appendChild(ui.handcards1);
	ui.handcards1.appendChild(node());
	ui.create.div = (classes, parent) => { const element = node(classes); parent?.appendChild(element); return element; };
	ui.create.dialog = () => Object.assign(node(), { buttons: [] });
	ui.create.button = (link, type, parent) => parent.appendChild(Object.assign(node('card.button'), { link }));
	const questions = [], answers = [];
	class Player {
		chooseButtonTarget(params) {
			const event = { ...params, name: 'chooseButtonTarget', player: this,
				filterButton: params.filterButton || (() => true), filterTarget: typeof params.filterTarget === 'function' ? params.filterTarget : () => true,
				ai1: params.ai1 || (() => 1), ai2: params.ai2 || (() => 1),
				isMine: () => mine, content: 'native', setContent(content) { this.content = content; return this; },
				async forResult() {
					if (this.content !== 'native') { await this.content(this, null, this.player); return this.result; }
					questions.push(this); status.event = this;
					const answer = answers.shift(); assert.ok(answer, 'an unexpected extra question was asked');
					const result = typeof answer === 'function' ? await answer(this) : answer;
					ui.selected.buttons.length = ui.selected.targets.length = 0;
					return result;
				},
			};
			return event;
		}
		getCards() { return ui.handcards1.children.slice(); }
	}
	const get = { itemtype: value => value?.kind === 'card' ? 'card' : undefined, translation: value => value.name, attitude: () => 1,
		event: () => status.event, suit: card => card.suit };
	const game = { online }, lib = { element: { Player }, hooks: { checkEnd: [] } };
	const controller = setupCardDistribution({ lib, game, ui, get, _status: status });
	const cards = ['A', 'B', 'C', 'D'].map((name, index) => ({ name, kind: 'card', suit: index < 2 ? 'heart' : 'spade' }));
	const player = new Player(), targets = [{ name: '甲' }, { name: '乙' }, { name: '丙' }];
	const params = { createDialog: ['分配', cards], forced: true, selectButton: 2, selectTarget: 2,
		filterTarget: true, complexSelect: true, cardx: cards };
	params.filterButton = button => !ui.selected.buttons.length
		? get.event().cardx.filter(card => card.suit === button.link.suit).length > 1
		: button.link.suit === ui.selected.buttons[0].link.suit;
	return { ui, status, get, game, lib, controller, cards, player, targets, params, questions, answers,
		pick(card) { const button = controller.handCards.find(item => item.link === card); ui.selected.buttons.push(button); return button; },
		async run(options = params) { const event = player.chooseButtonTarget(options); await event.forResult(); return event; } };
}

test('select one displayed card and recipient per confirmation; keep real hands and pool cards untouched', async () => {
	const h = fixture(), [a, b, c] = h.cards, [first, second] = h.targets, hand = h.player.getCards();
	h.answers.push(event => {
		assert.equal(event.selectButton, 1); assert.equal(event.selectTarget, 1);
		assert.equal(event.canHidden, false); assert.equal(event.complexSelect, false);
		assert.equal(event.filterTarget(null, h.player, first), false);
		assert.equal(event.filterButton(h.controller.handCards[2], h.player), true, 'both suits are initially legal');
		h.pick(b); assert.equal(event.filterTarget(null, h.player, first), true);
		assert.deepEqual(h.player.getCards(), hand); assert.deepEqual(h.controller.handCards.map(button => button.link), h.cards);
		return { bool: true, links: [b], targets: [first] };
	}, event => {
		const [buttonA, buttonB, buttonC] = h.controller.handCards;
		assert.equal(buttonB.children[0].textContent, '甲'); assert.equal(buttonB.classList.contains('unselectable'), true);
		assert.equal(event.filterButton(buttonB, h.player), false);
		assert.equal(event.filterButton(buttonA, h.player), true);
		assert.equal(event.filterButton(buttonC, h.player), false, 'first confirmed card locks its suit');
		h.pick(a); assert.equal(event.filterTarget(null, h.player, first), false);
		assert.equal(event.filterTarget(null, h.player, second), true);
		assert.deepEqual(h.player.getCards(), hand);
		return { bool: true, links: [a], targets: [second] };
	});
	const event = await h.run();
	assert.deepEqual(event.result.links, [b, a]); assert.deepEqual(event.result.targets, [first, second]);
	assert.equal(h.questions.length, 2); assert.equal(h.answers.length, 0);
	assert.deepEqual(h.controller.handCards, []); assert.deepEqual(h.player.getCards(), hand);
	assert.equal(h.ui.handcards1Container.children.length, 1); assert.equal(c.parentNode, undefined);
});

test('cancelling the current pair retains earlier recipient labels and suit constraint', async () => {
	const h = fixture(), [a, b] = h.cards, [first, second] = h.targets;
	h.answers.push(event => { h.pick(a); return { bool: false }; }, event => {
		assert.equal(event.filterButton(h.controller.handCards[2], h.player), true, 'cancelled pair does not lock a suit');
		h.pick(b); return { bool: true, links: [b], targets: [first] };
	}, event => { h.pick(a); return { bool: false }; }, event => {
		assert.equal(h.controller.handCards[1].children[0].textContent, '甲');
		assert.equal(event.filterButton(h.controller.handCards[2], h.player), false);
		h.pick(a); return { bool: true, links: [a], targets: [second] };
	});
	const event = await h.run();
	assert.deepEqual(event.result.links, [b, a]); assert.deepEqual(event.result.targets, [first, second]);
});

test('original filters and AI receive confirmed pairs plus current selection, with context restored after errors', async () => {
	const h = fixture(), [a, b] = h.cards, [first, second] = h.targets, selection = h.ui.selected;
	h.params.filterTarget = (_, actor) => actor === h.player && h.get.event().cardx.includes(selection.buttons[selection.targets.length].link);
	h.params.ai2 = () => selection.buttons[selection.targets.length].link === b ? 8 : 3;
	h.answers.push(event => {
		h.pick(b); assert.equal(event.ai2(first), 8); assert.equal(event.filterTarget(null, h.player, first), true);
		return { bool: true, links: [b], targets: [first] };
	}, event => {
		const buttons = selection.buttons, targets = selection.targets;
		h.pick(a); assert.equal(event.ai2(second), 3); assert.equal(event.filterTarget(null, h.player, second), true);
		assert.equal(selection.buttons, buttons); assert.equal(selection.targets, targets);
		return { bool: true, links: [a], targets: [second] };
	});
	await h.run(); assert.deepEqual(selection.buttons, []); assert.deepEqual(selection.targets, []);
	const failed = fixture(), before = failed.ui.selected.buttons;
	failed.params.filterButton = () => { throw Error('callback error'); };
	failed.answers.push(event => { assert.throws(() => event.filterButton(failed.controller.handCards[0]), /callback error/); assert.equal(failed.ui.selected.buttons, before); throw Error('choice failed'); });
	await assert.rejects(failed.run(), /choice failed/); assert.deepEqual(failed.controller.handCards, []);
	assert.equal(failed.ui.handcards1Container.children.length, 1);
});

test('each pair requires explicit confirmation, including the only remaining card or recipient', async () => {
	const h = fixture(), [a, b] = h.cards, [first, second] = h.targets;
	h.answers.push(event => {
		const check = { auto: true, autoConfirm: true, auto_confirm: true };
		assert.equal(event.noAutoSelect, true);
		h.lib.hooks.checkEnd[0](event, check); assert.deepEqual(check, { auto: false, autoConfirm: false, auto_confirm: false });
		h.pick(a); return { bool: true, links: [a], targets: [first] };
	}, event => { assert.equal(event.noAutoSelect, true); h.pick(b); return { bool: true, links: [b], targets: [second] }; });
	await h.run();
	const check = { auto: true, autoConfirm: true }; h.lib.hooks.checkEnd[0]({}, check);
	assert.deepEqual(check, { auto: true, autoConfirm: true });
});

test('game over removes display cards without completing a partial assignment', async () => {
	const h = fixture(), [a] = h.cards, [first] = h.targets;
	h.answers.push(() => { h.status.over = true; h.lib.onover[0](); return { bool: true, links: [a], targets: [first] }; });
	const event = await h.run(); assert.equal(event.result.bool, false); assert.deepEqual(h.controller.handCards, []);
	assert.equal(h.ui.handcards1Container.children.length, 1);
});

test('unrelated combined choices, AI, online and unavailable hand areas keep native content', () => {
	const h = fixture();
	for (const override of [{ selectTarget: 1 }, { selectButton: [1, 2] }, { createDialog: ['选项', ['甲', '乙']] },
		{ filterOk() {} }, { custom: {} }]) assert.equal(h.player.chooseButtonTarget({ ...h.params, ...override }).content, 'native');
	for (const options of [{ mine: false }, { online: true }]) {
		const other = fixture(options); assert.equal(other.player.chooseButtonTarget(other.params).content, 'native');
	}
	h.status.connectMode = true; assert.equal(h.player.chooseButtonTarget(h.params).content, 'native');
	h.status.connectMode = false; delete h.ui.handcards1; assert.equal(h.player.chooseButtonTarget(h.params).content, 'native');
	const factory = h.lib.element.Player.prototype.chooseButtonTarget;
	assert.equal(setupCardDistribution({ lib: h.lib, game: h.game, ui: h.ui, get: h.get, _status: h.status }), h.controller);
	assert.equal(h.lib.element.Player.prototype.chooseButtonTarget, factory);
});

test('both actual Fengshang skill contents settle one batch only after all hand-area pairs are confirmed', async () => {
	for (const [filename, skillName] of [['../../../extension/hh_林/extension.js', 'hfengshang'], ['../../../character/onlyOL/skill.js', 'olfengshang']]) {
		const h = fixture(), [a, b] = h.cards, [first, second] = h.targets, batches = [];
		const code = fs.readFileSync(new URL(filename, import.meta.url), 'utf8');
		const start = code.indexOf('async content(event, trigger, player)', code.indexOf(skillName + ': {'));
		const end = code.indexOf('\n' + (skillName === 'hfengshang' ? '        ' : '\t\t') + 'ai: {', start);
		const contentText = code.slice(start, end).trim().replace(/,$/, '');
		const get = { ...h.get, player: () => h.player, attitude: () => 1, value: () => 1 };
		const game = { ...h.game, log() {}, loseAsync(data) {
			assert.equal(h.answers.length, 0, 'no cards move before all pairs have been confirmed');
			assert.deepEqual(h.controller.handCards, [], 'display copies are removed before settlement');
			batches.push(data); return { setContent(name) { assert.equal(name, 'gaincardMultiple'); return Promise.resolve(); } };
		}, delayx: async () => {} };
		Object.assign(h.player, { storage: {}, addTempSkill() {}, changeSkin() {}, line() {}, addTip() {}, getUseValue: () => 1,
			markAuto(name, suits) { this.storage[name] = suits; }, getStorage(name) { return this.storage[name]; }, hasHistory: () => true });
		const content = vm.runInNewContext('({' + contentText + '}).content', { game, get, ui: h.ui, lib: { suit: [] }, _status: h.status });
		h.answers.push({ bool: false }, { bool: true, links: [b], targets: [first] },
			{ bool: false }, { bool: true, links: [a], targets: [second] });
		await content({ name: skillName, getParent: () => ({ [skillName + '_cards']: h.cards }) }, null, h.player);
		assert.equal(batches.length, 1); assert.deepEqual(Array.from(batches[0].gain_list, pair => Array.from(pair)), [[first, b], [second, a]]);
	}
});
