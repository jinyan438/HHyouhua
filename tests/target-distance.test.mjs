import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { domFixture } from './helpers/catalog-dom.mjs';
import { setupTargetDistance } from '../src/ui/targetDistance.js';

function fixture() {
	const { document, Element } = domFixture(), arena = new Element(); document.body.append(arena);
	const ui = { arena, selected: { cards: [], targets: [] } };
	ui.selected.targets.add = function (target) { if (!this.includes(target)) this.push(target); };
	ui.selected.targets.remove = function (target) { const index = this.indexOf(target); if (index >= 0) this.splice(index, 1); };
	const lib = { hooks: { checkBegin: [], checkTarget: [], uncheckTarget: [] }, onover: [], filter: { cardAiIncluded: () => true },
		card: { sha: { range: { attack: 1 } }, shunshou: { range: { global: 1 } }, guohe: {}, huogong: {} } };
	const game = { players: [], dead: [], callHook(name, args) { lib.hooks[name]?.forEach(fn => fn(...args)); }, checkMod(...args) {
		const kind = args.at(-2), value = args.at(-3), owner = args.at(-1);
		return kind === 'globalFrom' ? value + (owner.distanceMod || 0)
			: kind === 'targetInRange' && owner.ignoreRange ? true : value;
	} };
	let card = { name: 'sha' };
	const get = { card: () => card, info: item => lib.card[item?.name],
		select: value => typeof value === 'function' ? get.select(value()) : Array.isArray(value) ? value : [value ?? 1, value ?? 1] };
	const native = name => fs.readFileSync(new URL('../../../noname/' + name, import.meta.url), 'utf8');
	const getSource = native('get/index.js'), distanceStart = getSource.indexOf('\tdistance(from, to, method) {');
	get.distance = vm.runInNewContext('({' + getSource.slice(distanceStart, getSource.indexOf('\n\t/**', distanceStart)) + '})', { game, ui, get }).distance;
	const libSource = native('library/index.js'), rangeStart = libSource.indexOf('\t\ttargetInRange(card, player, target) {');
	lib.filter.targetInRange = vm.runInNewContext('({' + libSource.slice(rangeStart, libSource.indexOf('\n\t\t/**', rangeStart)) + '})', { game, get }).targetInRange;
	const Check = vm.runInNewContext(native('game/check.js').replace(/^import[^\n]*\n/, '').replace('export class Check', 'class Check') + '\nCheck', { game, lib, get, ui });
	game.Check = new Check();
	for (let i = 0; i < 6; i++) {
		const target = Object.assign(new Element(), { equips: [], skills: new Set(), attackRange: 1,
			isDead() { return !!this.dead; }, isAlive() { return !this.dead; }, isOut() { return !!this.out; }, isMin: () => false,
			hasSkill(skill) { return this.skills.has(skill); }, hasSkillTag: () => false,
			getVCards(area, filter) { return this.equips.filter(filter); }, getAttackRange() { return this.attackRange; },
		});
		target.className = 'player'; arena.append(target); game.players.push(target);
	}
	game.players.forEach((target, i) => target.nextSeat = game.players[(i + 1) % 6]);
	game.me = game.players[0];
	let mine = true;
	const event = { name: 'chooseToUse', player: game.me, selectTarget: 1, isMine: () => mine,
		filterTarget: (card, player, target) => target !== player && target.hasCards !== false && lib.filter.targetInRange(card, player, target) };
	const _status = { event }, controller = setupTargetDistance({ lib, game, ui, get, _status });
	function check() { lib.hooks.checkBegin.forEach(fn => fn(event)); return game.Check.target(event, false); }
	function uncheck() { for (const target of game.players) { target.classList.remove('selected', 'selectable'); lib.hooks.uncheckTarget.forEach(fn => fn(target, event)); } ui.selected.targets.length = 0; }
	return { lib, game, ui, get, event, _status, controller, check, uncheck, setCard(value) { card = value; }, setMine(value) { mine = value; },
		label: i => game.players[i]._distanceDisplay, red: i => game.players[i]._distanceDisplay?.classList.contains('hh-distance-out-of-range') };
}

test('native selection shows all other living seats, distinguishes distance failures, and preserves selected targets', () => {
	const h = fixture(); h.game.players[1].hasCards = false;
	h.check();
	assert.equal(h.label(0), undefined);
	assert.equal(h.label(1).textContent, '距离1'); assert.equal(h.red(1), false, 'missing cards is not a distance failure');
	assert.equal(h.label(2).textContent, '距离2'); assert.equal(h.red(2), true);
	assert.equal(h.label(3).textContent, '距离3'); assert.equal(h.red(3), true);
	const selected = h.game.players[5]; selected.classList.add('selected'); h.ui.selected.targets.add(selected);
	h.check(); assert.equal(h.label(5).textContent, '距离1'); assert.equal(h.red(5), false);
	assert.deepEqual([...h.ui.selected.targets], [selected]); assert.equal(h.game.players[2].classList.contains('selectable'), false);
	h.uncheck(); assert.equal(h.game.players.some(p => p._distanceDisplay), false);
});

test('native horses, weapon range, skill distance mods and selected equipment update the displayed distance', () => {
	const h = fixture(), actor = h.game.me, target = h.game.players[2];
	const horse = { name: 'horse', cards: [{}] }; h.lib.card.horse = { distance: { globalFrom: -1 } }; actor.equips.push(horse);
	h.check(); assert.equal(h.label(2).textContent, '距离1'); assert.equal(h.red(2), false);
	h.ui.selected.cards.push(horse.cards[0]); h.check(); assert.equal(h.label(2).textContent, '距离2'); assert.equal(h.red(2), true);
	actor.attackRange = 3; h.check(); assert.equal(h.label(2).textContent, '距离2'); assert.equal(h.red(2), false, 'a weapon changes range, not the printed distance');
	h.lib.card.defensiveHorse = { distance: { globalTo: 1 } }; target.equips.push({ name: 'defensiveHorse' });
	h.check(); assert.equal(h.label(2).textContent, '距离3');
	actor.distanceMod = -9; h.check(); assert.equal(h.label(2).textContent, '距离1');
});

test('virtual ranged cards, unlimited cards, no-distance use and non-card skills follow native range rules', () => {
	const h = fixture(); h.setCard({ name: 'shunshou', isCard: true }); h.check(); assert.equal(h.red(3), true);
	h.game.me.ignoreRange = true; h.check(); assert.equal(h.red(3), false);
	h.game.me.ignoreRange = false; h.event.nodistance = true; h.check(); assert.equal(h.red(3), false);
	h.event.nodistance = false; h.setCard({ name: 'huogong' }); h.check(); assert.equal(h.red(3), false);
	h.event.name = 'chooseTarget'; h.event.filterTarget = (card, player, target) => target !== player; h.check();
	assert.equal(h.label(3).textContent, '距离3'); assert.equal(h.red(3), false);
});

test('cancel, AI control, spectator choices, automatic targets, death, removal and game over clear labels', () => {
	const h = fixture(); h.check();
	h.setMine(false); h.check(); assert.equal(h.label(1), undefined);
	h.setMine(true); h._status.auto = true; h.check(); assert.equal(h.label(1), undefined);
	h._status.auto = false; h.event.selectTarget = -1; h.check(); assert.equal(h.label(1), undefined);
	h.event.selectTarget = 1; h.uncheck(); h.game.players[1].dead = true; h.game.players[2].out = true;
	h.game.players[3].skills.add('undist'); h.game.players[4].remove(); h.check();
	for (const i of [1, 2, 3, 4]) assert.equal(h.label(i), undefined);
	assert.equal(h.label(5).parentNode, h.game.players[5]); h.lib.onover.forEach(fn => fn()); assert.equal(h.label(5), undefined);
	h.check(); h.event.filterTarget = undefined; h.lib.hooks.checkBegin.forEach(fn => fn(h.event)); assert.equal(h.label(5), undefined);
});
