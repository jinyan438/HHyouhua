import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { setupEquipMove } from '../src/features/equipMove.js';

const movement = readFileSync(new URL('../src/overrides/player/card-movement.js', import.meta.url), 'utf8');
const throws = movement.slice(movement.indexOf('export function playerThrow('), movement.indexOf('export function playerPhaseJudge(')).replaceAll('export function', 'function');
const draws = movement.slice(movement.indexOf('export function playerDraw('), movement.indexOf('export function playerGive(')).replaceAll('export function', 'function');
const actions = readFileSync(new URL('../src/overrides/player/card-actions.js', import.meta.url), 'utf8');
const equips = actions.slice(actions.indexOf('export function playerEquip('), actions.indexOf('export function playerUseCard(')).replaceAll('export function', 'function');
const nativePlayers = readFileSync(new URL('../../../noname/library/element/player.js', import.meta.url), 'utf8');
const nativeEquipStart = nativePlayers.indexOf('\tequip(card, draw) {');
const nativeEquip = nativePlayers.slice(nativeEquipStart, nativePlayers.indexOf('\n\t/**', nativeEquipStart));
const nativeContent = readFileSync(new URL('../../../noname/library/element/content.ts', import.meta.url), 'utf8');
const nativeEquipContent = nativeContent.slice(nativeContent.indexOf('\tasync equip(event, trigger, player) {'), nativeContent.indexOf('\t//装备栏 END'));

function harness({ zoom = 1, enabled = true } = {}) {
	let now = 0, serial = 0;
	const timers = new Map(), normal = [], frames = [], copies = [], videos = [];
	const env = {
		setTimeout(fn, delay) { const id = ++serial; timers.set(id, { fn, time: now + delay }); return id; },
		clearTimeout(id) { timers.delete(id); },
	};
	function advance(ms) {
		const end = now + ms;
		while (true) {
			const next = [...timers].filter(([, timer]) => timer.time <= end).sort((a, b) => a[1].time - b[1].time)[0];
			if (!next) break;
			now = next[1].time; timers.delete(next[0]); next[1].fn();
		}
		now = end;
	}
	function node(rect = {}) {
		const classes = new Set();
		return {
			style: {}, children: [], offsetWidth: rect.width || 108, offsetHeight: rect.height || 150,
			rect: { left: 0, top: 0, width: 108, height: 150, ...rect },
			classList: { add: (...names) => names.forEach(name => classes.add(name)), contains: name => classes.has(name) },
			getBoundingClientRect() { return this.rect; },
			get isConnected() { return !!this.parentNode; },
			appendChild(child) {
				if (child.fragment) { for (const item of [...child.children]) this.appendChild(item); return child; }
				child.remove(); this.children.push(child); child.parentNode = this; return child;
			},
			remove() { if (this.parentNode) { const list = this.parentNode.children; list.splice(list.indexOf(this), 1); this.parentNode = null; } },
			querySelector() { return null; },
		};
	}
	const arena = node({ left: 20, top: 40, width: 1000 * zoom, height: 600 * zoom });
	arena.offsetWidth = 1000; arena.offsetHeight = 600;
	const visual = rect => ({ left: arena.rect.left + rect.left * zoom, top: arena.rect.top + rect.top * zoom, width: rect.width * zoom, height: rect.height * zoom });
	const target = node(visual({ left: 700, top: 100, width: 136, height: 200 }));
	target.node = { equips: node(visual({ left: 724, top: 250, width: 104, height: 40 })) };
	const actor = node(visual({ left: 30, top: 350, width: 136, height: 200 }));
	actor.checkBoundsCache = () => {};
	Object.assign(actor, { cacheWidth: 136, cacheHeight: 200, cacheLeft: 30, cacheTop: 350 });
	const lib = { onover: [], commonArea: [], config: {}, element: { card: {}, content: {} } }, ui = { arena, thrown: [] }, _status = {};
	const game = { me: actor, broadcast() {}, broadcastAll(fn, ...args) { fn(...args); }, addVideo: (...args) => videos.push(args), delayx: async () => {}, delay: async () => {} };
	const get = { type: card => card?.type || 'equip', itemtype: value => Array.isArray(value) ? 'cards' : value?.virtual ? 'vcard' : value ? 'card' : undefined,
		cardsInfo: cards => cards, owner: () => null, position: () => 'o', subtype: () => 'equip1', info: () => ({}),
		autoViewAs: card => ({ name: card.name, isCard: true, virtual: true, cards: [card] }) };
	const dui = { element: { create: () => node() }, boundsCaches: { hand: { check() {} }, arena: { updated: true, cardWidth: 108, cardHeight: 150, cardScale: .7 } },
		tryAddPlayerCardUseTag: card => normal.push(card), queueNextFrameTick: fn => frames.push(fn), layoutDiscard() {},
		layoutDrawCards(cards) { for (const card of cards) card.style.transform = 'old gain animation'; },
		delayRemoveCards(cards, delay, duration) { env.setTimeout(() => cards.forEach(card => card.remove()), delay + duration); } };
	const base = { $addVirtualEquip(equip, cards) {
		const card = cards[0] || game.createCard(equip.name);
		card.rect = visual({ left: 724, top: 266, width: 104, height: 16 }); target.node.equips.appendChild(card);
	} };
	const context = vm.createContext({ lib, ui, game, get, _status, refreshPlayerEquipment() {}, getBasePlayerMethods: () => base, getDui: () => dui, applyCardBorder() {}, decadeUI: { config: {} },
		document: { createDocumentFragment() { return Object.assign(node(), { fragment: true }); } } });
	vm.runInContext(`Array.prototype.add = function(x) { if (!this.includes(x)) this.push(x); return this; };
		Array.prototype.addArray = function(list) { for (const x of list) this.add(x); return this; };
		Array.prototype.remove = function(x) { const i = this.indexOf(x); if (i >= 0) this.splice(i, 1); return this; };
		Array.prototype.randomGet = function() { return this[0]; };`, context);
	vm.runInContext(draws + throws + equips + '\nglobalThis.throwCard = playerThrow; globalThis.ordered = playerThrowordered2; globalThis.equipCard = playerEquip; globalThis.addVirtualEquip = playerAddVirtualEquip; globalThis.drawCard = playerDraw; globalThis.gainCard = playerGain2;', context);
	base.equip = vm.runInContext('({' + nativeEquip + '}).equip', context);
	lib.element.content.equip = vm.runInContext('({' + nativeEquipContent + '}).equip', context);
	game.createEvent = name => {
		if (name === 'replaceEquip') return { setContent() {}, async forResult() { return {}; } };
		const event = { name, parent: _status.event, log: false, finished: false,
			setContent(content) { this.content = content; },
			getParent(name) { let parent = this.parent; while (parent && parent.name !== name) parent = parent.parent; return parent; },
			then(resolve, reject) {
				const previous = _status.event; _status.event = this;
				this.content(this, null, this.player).then(() => { this.finished = true; _status.event = previous; resolve({}); }, reject);
			} };
		return event;
	};
	actor.$throwordered2 = context.ordered;
	target.equip = context.equipCard; target.$draw = context.drawCard; target.$gain2 = context.gainCard;
	target.addVirtualEquip = function (equip, cards) { return context.addVirtualEquip.call(this, equip, cards); };
	target.canEquip = () => true; target.isMin = () => false;
	const controller = enabled ? setupEquipMove({ lib, game, ui, get, _status }, env) : null;
	function source(name = 'hanbing', id = 'card-1') {
		const card = node(); Object.assign(card, { name, cardid: id, throwWith: 'h', original: 'h', isCard: true, willBeDestroyed: () => false, addKnower() {} });
		card.copy = (...tags) => {
			const clone = node(); Object.assign(clone, { name, _cardid: id });
			clone.classList.add(...tags.filter(tag => typeof tag === 'string'));
			clone.delete = () => { throw Error('transition-dependent delete must not be called'); };
			if (!tags.includes(false)) card.clone = clone;
			copies.push(clone); return clone;
		};
		return card;
	}
	game.createCard = name => source(name, 'generated-' + copies.length);
	function use(cards, options = {}) {
		_status.event = { name: 'useCard', card: cards[0], cards, player: actor, targets: [target], ...options };
		return _status.event;
	}
	function equipSlot(card, rect = { left: 724, top: 266, width: 104, height: 16 }) {
		const slot = node(visual(rect)); slot.name = card.name; slot.cardid = card.cardid;
		target.node.equips.appendChild(slot); return slot;
	}
	function throwCards(cards) { return context.throwCard.call(actor, cards, 0, false); }
	function transform(card) {
		const [, x, y, scale] = card.style.transform.match(/translate\(([^p]+)px,([^p]+)px\) scale\(([^)]+)\)/);
		return { x: Number(x), y: Number(y), scale: Number(scale) };
	}
	function flushFrames() { for (const fn of frames.splice(0)) fn(); }
	return { lib, game, ui, get, _status, context, controller, env, timers, advance, source, use, equipSlot, throwCards, transform, target, actor, normal, frames, copies, videos, flushFrames, node, visual };
}

test('actual throw hooks show equipment at its target upper-left, then shrink to the left edge of the newly inserted slot', () => {
	const h = harness(), card = h.source(); h.use([card]);
	const clone = h.throwCards([card]);
	assert.equal(h.ui.thrown.length, 0); assert.equal(h.normal.length, 0); assert.equal(h.frames.length, 0);
	assert.equal(clone.parentNode, h.ui.arena); assert.equal(card.fixed, undefined);
	const start = h.transform(clone);
	assert.equal(start.x, 706.8); assert.equal(start.y, 106);
	assert.ok(Math.abs(start.scale * 108 - 136 * .66) < 1e-8);
	h.advance(290); h.equipSlot(card); assert.deepEqual(h.transform(clone), start);
	h.advance(10);
	const end = h.transform(clone);
	assert.ok(end.scale < start.scale);
	assert.ok(Math.abs(end.x - 724) < 1e-8);
	assert.ok(Math.abs(end.y + 150 * end.scale / 2 - 274) < 1e-8);
	assert.match(clone.style.transition, /450ms/);
	h.advance(480); assert.equal(clone.isConnected, false); assert.equal(card.clone, undefined);
	assert.equal(h.controller.activeCount, 0); assert.equal(h.timers.size, 0);
});

test('a canceled equipment use with no moveDelete callback cannot leave a fixed clone on the general', () => {
	const h = harness(), card = h.source(); h.use([card]);
	const hand = h.node(); hand.appendChild(card);
	const clone = h.throwCards([card]); h._status.event = { name: 'phaseUse' };
	h.advance(2000);
	assert.equal(clone.isConnected, false); assert.equal(card.parentNode, hand);
	assert.equal(card.throwWith, 'h'); assert.equal(card.original, 'h');
	assert.equal(h.controller.activeCount, 0); assert.equal(h.timers.size, 0);
});

test('duplicate and late native moveDelete calls neither restart the animation nor reinsert its clone', () => {
	const h = harness(), card = h.source(); h.use([card]); h.equipSlot(card);
	const clone = h.throwCards([card]); clone.moveDelete(h.target);
	h.advance(370); const end = clone.style.transform; clone.moveDelete(h.target); clone.moveTo(h.target);
	assert.equal(clone.style.transform, end);
	h.advance(410); assert.equal(clone.isConnected, false);
	clone.moveDelete(h.target); h.advance(1000);
	assert.equal(clone.isConnected, false); assert.equal(h.timers.size, 0);
});

test('ordinary discards, removed equipment and unrelated equipment during replacement keep the native throw path', () => {
	for (const kind of ['ordinary', 'throwWith', 'original', 'parent', 'unrelated']) {
		const h = harness(), card = h.source();
		if (kind === 'ordinary') h._status.event = { name: 'discard' };
		else h.use([kind === 'unrelated' ? h.source('bagua', 'other') : card]);
		if (kind === 'throwWith') card.throwWith = 'e';
		if (kind === 'original') card.original = 'e';
		if (kind === 'parent') { card.parentNode = h.node(); card.parentNode.classList.add('equips'); }
		const clone = h.throwCards([card]);
		assert.deepEqual(h.ui.thrown, [clone], kind); assert.equal(h.normal.length, 1, kind);
		assert.equal(h.controller.activeCount, 0, kind);
	}
});

test('slow nested useCard and transformed multi-card equipment use event identity instead of a 500 ms card ID flag', () => {
	const h = harness(), first = h.source('sha'), second = h.source('shan', 'card-2');
	const event = h.use([first, second], { card: { name: 'zhangba', type: 'equip' } });
	h._status.event = { name: 'lose', getParent: () => event }; h.advance(1200);
	h.throwCards([first, second]);
	assert.equal(h.controller.activeCount, 2); assert.equal(h.ui.thrown.length, 0);
	h.advance(780); assert.equal(h.controller.activeCount, 0); assert.equal(h.ui.arena.children.length, 0);
});

test('arena CSS zoom and offsets preserve both the upper-left origin and equipment slot destination', () => {
	const h = harness({ zoom: 1.6 }), card = h.source(); h.use([card]); h.equipSlot(card);
	const clone = h.throwCards([card]);
	assert.ok(Math.abs(h.transform(clone).x - 706.8) < 1e-8);
	assert.ok(Math.abs(h.transform(clone).y - 106) < 1e-8);
	h.advance(300); const end = h.transform(clone);
	assert.ok(Math.abs(end.x - 724) < 1e-8);
	assert.ok(Math.abs(end.y + 150 * end.scale / 2 - 274) < 1e-8);
	h.controller.clear();
});

test('the local player can shrink equipment into a separate equipment panel outside the general', () => {
	const h = harness(), card = h.source(); h.use([card]);
	h.equipSlot(card, { left: 50, top: 540, width: 130, height: 27 });
	const clone = h.throwCards([card]); h.advance(300); const end = h.transform(clone);
	assert.ok(Math.abs(end.x - 50) < 1e-8);
	assert.ok(Math.abs(end.y + 150 * end.scale / 2 - 553.5) < 1e-8);
	h.controller.clear();
});

test('an old clone expiring cannot delete the next clone reference for the same physical card', () => {
	const h = harness(), card = h.source(); h.use([card]);
	const old = h.throwCards([card]); h.advance(300);
	const current = h.throwCards([card]); h.advance(480);
	assert.equal(old.isConnected, false); assert.equal(card.clone, current); assert.equal(current.isConnected, true);
	h.advance(300); assert.equal(current.isConnected, false); assert.equal(card.clone, undefined);
});

test('watchdog removes prepared clones even if the ordered throw never runs', () => {
	const h = harness(), card = h.source(); h.use([card]);
	const clone = card.copy(); h.ui.arena.appendChild(clone);
	h.controller.prepareClone(card, clone, h.actor); h.advance(1000);
	assert.equal(clone.isConnected, false); assert.equal(h.controller.activeCount, 0); assert.equal(h.timers.size, 0);
});

test('missing general bounds, slot read errors and a removed clone all finish without transition events', () => {
	for (const failure of ['general', 'slot', 'removed']) {
		const h = harness(), card = h.source(); h.use([card]);
		if (failure === 'general') h.target.rect.width = 0;
		const clone = h.throwCards([card]);
		if (failure === 'slot') h.target.node.equips.getBoundingClientRect = () => { throw Error('slot removed'); };
		if (failure === 'removed') clone.remove();
		h.advance(2000);
		assert.equal(clone.isConnected, false, failure); assert.equal(h.controller.activeCount, 0, failure); assert.equal(h.timers.size, 0, failure);
	}
});

test('game over clears every pending equipment clone and installation is idempotent', () => {
	const h = harness(), card = h.source(); h.use([card]); const clone = h.throwCards([card]);
	assert.equal(setupEquipMove(h), h.controller); assert.equal(h.lib.onover.length, 1);
	h.lib.onover[0](); assert.equal(clone.isConnected, false); assert.equal(h.timers.size, 0);
});

test('with the option disabled, even equipment uses keep the original discard layout', () => {
	const h = harness({ enabled: false }), card = h.source(); h.use([card]);
	const clone = h.throwCards([card]);
	assert.deepEqual(h.ui.thrown, [clone]); assert.equal(h.normal.length, 1); assert.equal(h.frames.length, 1);
});

const sp3 = readFileSync(new URL('../../hh_sp3/extension.js', import.meta.url), 'utf8');
for (const name of ['shufazijinguan', 'linglongshimandai', 'hongmianbaihuapao', 'wushuangfangtianji']) {
	test(`actual hh_sp3 Zhuangrong inserts ${name} through native equip with one new animation`, async () => {
		const h = harness();
		h.lib.filter = { targetEnabled2() {}, cardDiscardable() {} };
		h.lib.suit = vm.runInContext('["spade"]', h.context);
		h.get.poptip = name => name; h.get.rand = () => 1;
		h.game.import = (_, factory) => { h.context.sp3 = factory(h.lib, h.game, h.ui, h.get, {}, h._status); };
		vm.runInContext(sp3, h.context);
		const skill = h.context.sp3.package.skill.skill.hzhuangrong;
		h.get.info = value => value === 'hzhuangrong' ? skill : {};
		h.target.canEquip = card => (typeof card === 'string' ? card : card.name) === name;
		let created;
		h.game.createCard2 = cardName => { created = h.source(cardName); return created; };
		h._status.event = { name: 'hzhuangrong' };
		assert.equal(skill.filter({}, h.target), true);
		await skill.content({}, {}, h.target);
		assert.equal(created.name, name); assert.equal(created.parentNode, h.target.node.equips);
		assert.equal(h._status.hzhuangrong_map.get(h.target).includes(name), false);
		assert.equal(h.controller.activeCount, 1); assert.equal(h.copies.length, 2);
		const [oldGain, newEquip] = h.copies, start = newEquip.style.transform;
		assert.equal(oldGain.isConnected, false); assert.equal(newEquip.isConnected, true);
		assert.ok(Math.abs(h.transform(newEquip).x - 706.8) < 1e-8);
		h.flushFrames(); assert.equal(newEquip.style.transform, start, 'queued old gain frame cannot move the new clone');
		h.advance(300); assert.equal(h.transform(newEquip).x, 724);
		assert.match(newEquip.style.transition, /450ms/);
		h.advance(400); assert.equal(newEquip.isConnected, true, 'old gain removal timer cannot delete the new clone');
		h.advance(80); assert.equal(newEquip.isConnected, false); assert.equal(h.controller.activeCount, 0);
		assert.equal(created.parentNode, h.target.node.equips); assert.equal(h.timers.size, 0);
	});
}

test('direct equipment with draw=true suppresses the native draw clone while preserving insertion', async () => {
	const h = harness(), card = h.source(); h._status.event = { name: 'skill' };
	const event = h.target.equip(card, true), clone = card.clone;
	await event;
	assert.equal(card.parentNode, h.target.node.equips); assert.equal(h.controller.activeCount, 1);
	assert.equal(h.copies.length, 1); assert.equal(h.frames.length, 0);
	assert.equal(h.videos.some(([type]) => type === 'drawCard'), true);
	h.advance(780); assert.equal(clone.isConnected, false); assert.equal(h.timers.size, 0);
});

test('direct addVirtualEquip and physical-card-free equipment use the new animation', async () => {
	for (const direct of [true, false]) {
		const h = harness(), equip = { name: 'virtual-weapon', virtual: true, cards: [] };
		h._status.event = { name: 'skill' };
		if (direct) h.target.addVirtualEquip(equip, []);
		else await h.target.equip(equip);
		assert.equal(h.target.node.equips.children.length, 1);
		assert.equal(h.controller.activeCount, 1); assert.equal(h.copies.length, 1);
		h.advance(780); assert.equal(h.controller.activeCount, 0); assert.equal(h.timers.size, 0);
	}
});

test('moving an equipped card to another player uses the new animation despite its original=e marker', async () => {
	const h = harness(), card = h.source(), oldEquips = h.node(); oldEquips.classList.add('equips'); oldEquips.appendChild(card);
	card.throwWith = card.original = 'e';
	const previousOwner = { playerid: 'old-owner', lose(cards) {
		for (const item of cards) item.remove();
		return { set() { return this; } };
	} };
	h.game.playerMap = { 'old-owner': previousOwner };
	h.get.owner = item => item.parentNode === oldEquips ? previousOwner : null;
	h.get.position = item => item.parentNode === oldEquips ? 'e' : 'o';
	h._status.event = { name: 'moveCard' };
	await h.target.equip(card);
	assert.equal(oldEquips.children.length, 0); assert.equal(card.parentNode, h.target.node.equips);
	assert.equal(h.controller.activeCount, 1); assert.equal(h.copies.length, 1);
	h.advance(780); assert.equal(h.controller.activeCount, 0);
});

test('ordinary useCard and its later equip event share one animation even after a long skill delay', async () => {
	for (const delay of [0, 1000]) {
		const h = harness(), card = h.source(); h.use([card]); const clone = h.throwCards([card]);
		h.advance(delay); await h.target.equip(card);
		assert.equal(h.copies.length, 1); assert.equal(card.parentNode, h.target.node.equips);
		assert.equal(h.controller.activeCount, delay ? 0 : 1);
		h.advance(780); assert.equal(clone.isConnected, false); assert.equal(h.timers.size, 0);
	}
});

test('a rejected direct equip retains the engine discard rule and removes the animation clone', async () => {
	const h = harness(), card = h.source(), discarded = [];
	h.target.canEquip = () => false; h.game.cardsDiscard = async cards => discarded.push(...cards);
	h._status.event = { name: 'skill' }; await h.target.equip(card);
	assert.deepEqual(discarded, [card]); assert.equal(h.target.node.equips.children.length, 0);
	h.advance(780); assert.equal(h.controller.activeCount, 0); assert.equal(h.timers.size, 0);
});

test('normal equipment gain into hand keeps its gain animation and disabling the option preserves native direct equip', async () => {
	const h = harness(), card = h.source(); h._status.event = { name: 'gain' };
	h.target.$gain2(card); assert.equal(h.frames.length, 1); assert.equal(h.controller.activeCount, 0);
	h.flushFrames(); h.advance(680);
	const disabled = harness({ enabled: false }), direct = disabled.source();
	disabled._status.event = { name: 'skill' }; await disabled.target.equip(direct);
	assert.equal(direct.parentNode, disabled.target.node.equips); assert.equal(disabled.copies.length, 0);
});
