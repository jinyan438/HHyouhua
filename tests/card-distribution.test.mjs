import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { setupCardDistribution } from '../src/features/cardDistribution.js';

function fixture({ mine = true, online = false } = {}) {
	const ui = { selected: { buttons: [], cards: [], targets: [] } }, status = {};
	class Player {
		chooseButtonTarget(params) {
			return { ...params, name: 'chooseButtonTarget', player: this,
				filterButton: params.filterButton || (() => true), filterTarget: typeof params.filterTarget === 'function' ? params.filterTarget : () => true,
				isMine: () => mine, content: 'native', setContent(content) { this.content = content; return this; },
			};
		}
		chooseButton(params) { return question('button', params); }
		chooseTarget(params) { return question('target', params); }
	}
	const get = { itemtype: value => value?.kind === 'card' ? 'card' : undefined, translation: value => value.name, attitude: () => 1,
		event: () => status.event, suit: card => card.suit };
	const game = { online }, lib = { element: { Player } }, questions = [], answers = [];
	function question(type, params) { return { forResult: async () => {
		questions.push({ type, params }); status.event = params;
		const answer = answers.shift(); assert.ok(answer, 'an unexpected extra question was asked');
		return typeof answer === 'function' ? answer(params, questions) : answer;
	} }; }
	const controller = setupCardDistribution({ lib, game, ui, get, _status: status });
	const cards = ['A', 'B', 'C'].map((name, index) => ({ name, kind: 'card', suit: index < 2 ? 'heart' : 'spade' }));
	const player = new Player(), targets = [{ name: '甲' }, { name: '乙' }, { name: '丙' }];
	const params = { createDialog: ['分配', cards], forced: true, selectButton: 2, selectTarget: 2,
		filterTarget: true, complexSelect: true, cardx: cards };
	return { ui, status, get, game, lib, controller, cards, player, targets, params, questions, answers,
		async run(options = params) { const event = player.chooseButtonTarget(options); await event.content(event, null, player); return event; } };
}

test('confirm the legal pool before pairing cards with distinct recipients; preserve reversed card order', async () => {
	const h = fixture(), [a, b] = h.cards, [first, second] = h.targets;
	h.answers.push(params => {
		assert.equal(params.filterTarget, undefined); assert.equal(params.selectButton, 2);
		return { bool: true, links: [a, b] };
	}, { bool: true, links: [b] }, params => {
		assert.deepEqual(params.createDialog[1], [b]); assert.equal(params.filterTarget(null, h.player, first), true);
		return { bool: true, targets: [first] };
	}, params => {
		assert.deepEqual(params.createDialog[1], [a]); return { bool: true, links: [a] };
	}, params => {
		assert.equal(params.filterTarget(null, h.player, first), false);
		assert.equal(params.filterTarget(null, h.player, second), true);
		return { bool: true, targets: [second] };
	});
	const event = await h.run();
	assert.deepEqual(event.result.links, [b, a]); assert.deepEqual(event.result.targets, [first, second]);
	assert.deepEqual(h.questions.map(q => q.type), ['button', 'button', 'target', 'button', 'target']);
	assert.deepEqual(h.params.createDialog, ['分配', h.cards]); assert.equal(h.answers.length, 0);
});

test('cancelling either recipient retains the locked pool and previously confirmed pair', async () => {
	const h = fixture(), [a, b] = h.cards, [first, second] = h.targets;
	h.answers.push({ bool: true, links: [a, b] }, { bool: true, links: [a] }, { bool: false }, params => {
		assert.deepEqual(params.createDialog[1], [a, b]); return { bool: true, links: [b] };
	}, { bool: true, targets: [first] }, { bool: true, links: [a] }, { bool: false }, params => {
		assert.deepEqual(params.createDialog[1], [a]); return { bool: true, links: [a] };
	}, { bool: true, targets: [second] });
	const event = await h.run();
	assert.deepEqual(event.result.links, [b, a]); assert.deepEqual(event.result.targets, [first, second]);
	assert.equal(h.questions.filter(q => q.params.selectButton === 2).length, 1);
});

test('original button constraints and recipient callbacks keep their native selection context', async () => {
	const h = fixture(), [a, b, c] = h.cards, [first, second] = h.targets;
	h.params.filterButton = button => !h.ui.selected.buttons.length
		? h.get.event().cardx.filter(card => card.suit === button.link.suit).length > 1
		: button.link.suit === h.ui.selected.buttons[0].link.suit;
	h.params.filterTarget = (_, actor, target) => h.get.event().cardx.includes(h.ui.selected.buttons[h.ui.selected.targets.length].link) && target !== actor;
	h.params.ai2 = target => h.ui.selected.buttons[h.ui.selected.targets.length].link === b ? 8 : 3;
	const before = h.ui.selected;
	h.answers.push(params => {
		assert.equal(params.filterButton({ link: a }), true); assert.equal(params.filterButton({ link: c }), false);
		h.ui.selected.buttons.push({ link: a }); assert.equal(params.filterButton({ link: b }), true); assert.equal(params.filterButton({ link: c }), false);
		h.ui.selected.buttons.length = 0; return { bool: true, links: [a, b] };
	}, { bool: true, links: [b] }, params => {
		assert.equal(params.filterTarget(null, h.player, first), true); assert.equal(params.ai(first), 8);
		assert.equal(h.ui.selected, before); assert.deepEqual(before.buttons, []); assert.deepEqual(before.targets, []);
		return { bool: true, targets: [first] };
	}, { bool: true, links: [a] }, params => {
		assert.equal(params.filterTarget(null, h.player, first), false); assert.equal(params.ai(second), 3);
		return { bool: true, targets: [second] };
	});
	await h.run(); assert.deepEqual(before.buttons, []); assert.deepEqual(before.targets, []);
});

test('unrelated combined choices, AI and online choices keep the original content', () => {
	const h = fixture();
	for (const override of [{ selectTarget: 1 }, { selectButton: [1, 2] }, { createDialog: ['选项', ['甲', '乙']] },
		{ filterOk() {} }, { custom: {} }]) assert.equal(h.player.chooseButtonTarget({ ...h.params, ...override }).content, 'native');
	for (const options of [{ mine: false }, { online: true }]) {
		const other = fixture(options); assert.equal(other.player.chooseButtonTarget(other.params).content, 'native');
	}
	h.status.connectMode = true; assert.equal(h.player.chooseButtonTarget(h.params).content, 'native');
	const factory = h.lib.element.Player.prototype.chooseButtonTarget;
	assert.equal(setupCardDistribution({ lib: h.lib, game: h.game, ui: h.ui, get: h.get, _status: h.status }), h.controller);
	assert.equal(h.lib.element.Player.prototype.chooseButtonTarget, factory);
});

test('both actual Fengshang skill contents settle exactly one complete batch in chosen pair order', async () => {
	for (const [filename, skillName] of [['../../../extension/hh_林/extension.js', 'hfengshang'], ['../../../character/onlyOL/skill.js', 'olfengshang']]) {
		const h = fixture(), [a, b] = h.cards, [first, second] = h.targets, batches = [];
		const code = fs.readFileSync(new URL(filename, import.meta.url), 'utf8');
		const marker = skillName + ': {', start = code.indexOf('async content(event, trigger, player)', code.indexOf(marker));
		const end = code.indexOf('\n' + (skillName === 'hfengshang' ? '        ' : '\t\t') + 'ai: {', start);
		const contentText = code.slice(start, end).trim().replace(/,$/, '');
		const get = { ...h.get, player: () => h.player, attitude: () => 1, value: () => 1 };
		const game = { ...h.game, log() {}, loseAsync(data) {
			assert.equal(h.answers.length, 0, 'no cards move before all pairs have been confirmed');
			batches.push(data); return { setContent(name) { assert.equal(name, 'gaincardMultiple'); return Promise.resolve(); } };
		}, delayx: async () => {} };
		Object.assign(h.player, { storage: {}, addTempSkill() {}, changeSkin() {}, line() {}, addTip() {}, getUseValue: () => 1,
			markAuto(name, suits) { this.storage[name] = suits; }, getStorage(name) { return this.storage[name]; }, hasHistory: () => true });
		const content = vm.runInNewContext('({' + contentText + '}).content', { game, get, ui: h.ui, lib: { suit: [] }, _status: h.status });
		h.answers.push({ bool: true, links: [a, b] }, { bool: true, links: [b] }, { bool: false },
			{ bool: true, links: [b] }, { bool: true, targets: [first] }, { bool: true, links: [a] }, { bool: true, targets: [second] });
		h.player.chooseButtonTarget = function (...args) {
			const next = h.lib.element.Player.prototype.chooseButtonTarget.apply(this, args);
			next.forResult = async () => { await next.content(next, null, this); return next.result; }; return next;
		};
		await content({ name: skillName, getParent: () => ({ [skillName + '_cards']: h.cards }) }, null, h.player);
		assert.equal(batches.length, 1); assert.deepEqual(Array.from(batches[0].gain_list, pair => Array.from(pair)), [[first, b], [second, a]]);
	}
});
