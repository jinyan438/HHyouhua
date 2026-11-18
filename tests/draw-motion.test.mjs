import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { setupDrawMotion } from '../src/features/drawMotion.js';
import { nativeDrawMotion as native, deckDrawPoints, seatDrawPoints, drawControlPoint, drawMotionFrames, drawPosition, sineOut } from '../src/ui/sourceDrawMotion.js';

function harness({ zoom = 1 } = {}) {
	let now = 0, next = 0;
	const timers = new Map(), animations = [], observers = [], copies = [], videos = [], broadcasts = [], logs = [], fallback = [];
	const env = { setTimer(fn, ms) { const id = ++next; timers.set(id, { fn, time: now + ms }); return id; }, clearTimer(id) { timers.delete(id); },
		Observer: class { constructor(fn) { this.fn = fn; observers.push(this); } observe() {} } };
	function advance(ms) { const end = now + ms; while (true) { const n = [...timers].filter(([, t]) => t.time <= end).sort((a, b) => a[1].time - b[1].time)[0]; if (!n) break; timers.delete(n[0]); now = n[1].time; n[1].fn(); } now = end; }
	function node(box = {}, names = []) {
		const classes = new Set(names), listeners = new Map();
		const n = { style: { opacity: '', transition: '' }, children: [], offsetWidth: box.width || 108, offsetHeight: box.height || 150,
			box: { left: 0, top: 0, width: 108, height: 150, ...box }, dataset: {},
			classList: { add: (...items) => items.forEach(x => classes.add(x)), remove: (...items) => items.forEach(x => classes.delete(x)), contains: x => classes.has(x) },
			getBoundingClientRect() { const b = this.box; return { left: 20 + b.left * zoom, top: 40 + b.top * zoom, width: b.width * zoom, height: b.height * zoom }; },
			appendChild(child) { if (child.fragment) { for (const c of [...child.children]) this.appendChild(c); return child; } child.remove(); this.children.push(child); child.parentNode = this; return child; },
			remove() { if (this.parentNode) { const a = this.parentNode.children; a.splice(a.indexOf(this), 1); this.parentNode = null; } },
			addEventListener(name, fn) { listeners.set(name, fn); }, removeEventListener(name) { listeners.delete(name); }, interact() { listeners.get('pointerdown')?.(); },
			animate(frames, options) { const a = { frames, options, currentTime: 0, canceled: false, cancel() { this.canceled = true; }, finish() { this.onfinish?.(); } }; animations.push(a); return a; },
		};
		return n;
	}
	const arena = node({ width: 1000, height: 600 }), hand = node({ left: 200, top: 450, width: 600, height: 150 });
	function player(id, left, top) { const p = node({ left, top, width: 136, height: 200 }); p.playerid = id; p.dataset.position = id; p.node = { handcards1: id === 'self' ? hand : node(), handcards2: node() }; p.getCards = () => [...p.node.handcards1.children]; return p; }
	const me = player('self', 20, 380), other = player('other', 760, 80), sender = player('sender', 60, 70);
	const ui = { arena, thrown: [] }, lib = { config: {}, onover: [], element: { player: { directgain(cards) { for (const card of cards) this.node.handcards1.appendChild(card); return this; } } } };
	const game = { me, playerMap: { other, sender, self: me }, broadcast: (...args) => broadcasts.push(args), addVideo: (...args) => videos.push(args), log: (...args) => logs.push(args) };
	const get = { itemtype: v => Array.isArray(v) ? 'cards' : v?.name ? 'card' : undefined, cardsInfo: cards => cards.map(c => c.name), cnNumber: String }, _status = { event: { name: 'gain' } };
	const dui = { boundsCaches: { arena: { cardWidth: 108, cardHeight: 150, cardScale: .7 }, hand: { check() {} } }, element: { create: tags => node({}, tags.split(' ')) },
		layoutDrawCards() { fallback.push('layout'); }, queueNextFrameTick(fn) { fn(); }, delayRemoveCards() { fallback.push('remove'); } };
	env.getDui = () => dui;
	const controller = setupDrawMotion({ lib, game, ui, get, _status }, env);
	function card(name = 'sha', box = {}) {
		const c = node(box, ['card']); c.name = name; c.copy = (...tags) => {
			const clone = node({}, ['card', ...tags.filter(t => typeof t === 'string')]); clone.name = c.name; clone.fixed = true;
			if (!tags.includes(false)) c.clone = clone; copies.push(clone); return clone;
		}; return c;
	}
	const text = fs.readFileSync(new URL('../src/overrides/player/card-movement.js', import.meta.url), 'utf8');
	const hooks = text.slice(text.indexOf('export function playerDraw('), text.indexOf('/**\n * 弃牌动画覆写')).replaceAll('export function', 'function');
	const context = vm.createContext({ lib, game, ui, get, _status, getDui: () => dui, applyCardBorder() {}, getBasePlayerMethods: () => ({ $gain() { fallback.push('gain'); } }),
		document: { createDocumentFragment() { return Object.assign(node(), { fragment: true }); } } });
	vm.runInContext(hooks + ';globalThis.hooks={playerDraw,playerGain,playerGain2,playerGive}', context);
	return { ...context.hooks, lib, game, ui, get, _status, controller, card, node, me, other, sender, hand, timers, animations, copies, advance, observers, videos, broadcasts, logs, fallback };
}

test('native source/destination spacing, perpendicular transfer bend and independent fade timing', () => {
	const points = deckDrawPoints({ width: 1000, height: 600 }, 4, 126, 174, 1);
	assert.deepEqual(points.map(p => p.x), [398, 424, 450, 476]); assert.equal(points[0].y, 213);
	const end = seatDrawPoints({ left: 700, top: 100, width: 174, height: 232 }, 4, 126, 174, 1, true);
	assert.deepEqual(end.map(p => p.x), [700, 716, 732, 748]);
	assert.deepEqual(drawControlPoint({ x: 100, y: 100 }, { x: 700, y: 100 }, 600, 1, true), { x: 400, y: 400 });
	assert.deepEqual(drawControlPoint({ x: 700, y: 100 }, { x: 100, y: 100 }, 600, 1, true), { x: 400, y: 400 });
	const below = drawControlPoint({ x: 100, y: 500 }, { x: 700, y: 500 }, 600, 1, true); assert.equal(below.y, 200);
	const control = drawControlPoint(points[0], end[0], 600, 1);
	assert.deepEqual(control, { x: 700, y: 255 });
	const plan = drawMotionFrames({ ...points[0], scale: 1 }, { ...end[0], scale: 1 }, control);
	assert.equal(plan.duration, 1200); assert.equal(plan.frames[30].offset, 700 / 1200); assert.equal(plan.frames[31].offset, 800 / 1200);
	assert.equal(plan.frames[30].opacity, 1); assert.equal(plan.frames.at(-1).opacity, 0);
	assert.ok(Math.abs(plan.frames[46].opacity - (1 - sineOut(.5))) < 1e-12);
});

test('actual draw hooks keep unknown cards as backs, batch them, and preserve broadcast/video and equip interception', () => {
	const h = harness(); h.playerDraw.call(h.other, 4);
	assert.equal(h.controller.activeCount, 4); assert.equal(h.animations.length, 4);
	assert.ok(h.ui.arena.children.every(c => !c.name && c.fixed)); assert.equal(h.animations[0].options.duration, 1200);
	assert.equal(h.broadcasts.length, 1); assert.equal(h.videos[0][0], 'draw'); assert.equal(h.videos[0][2], 4);
	const equipment = h.card('hanbing'); h.game.hhEquipMove = { drawsEquip() { return true; } };
	h.playerDraw.call(h.other, [equipment]); assert.equal(h.controller.activeCount, 4);
	h.controller.clear(); assert.equal(h.timers.size, 0); assert.equal(h.ui.arena.children.length, 0);
});

test('public gain uses current discard geometry and gives use a curved sender-to-target path under arena zoom', () => {
	const h = harness({ zoom: 1.75 }), c = h.card(), old = h.node({ left: 440, top: 220, width: 75.6, height: 105 }); h.ui.arena.appendChild(old); c.clone = old;
	h.playerGain2.call(h.other, [c]);
	assert.equal(h.animations[0].frames[0].transform, 'translate(440px,220px) scale(0.7)'); assert.equal(c.clone, old);
	assert.equal(h.videos[0][0], 'gain2'); h.controller.clear();
	h.playerGive.call(h.sender, 2, h.other, false, false);
	assert.equal(h.controller.activeCount, 2);
	const frames = h.animations.at(-1).frames; assert.equal(frames[0].opacity, 1); assert.notEqual(frames[15].transform, frames[0].transform);
	assert.equal(h.animations.at(-1).options.duration, 1200);
});

test('own hand follows native 300ms sineOut into its settled slot and suppresses a second gain clone', () => {
	const h = harness(), c = h.card('tao', { left: 420, top: 460, width: 75.6, height: 105 }); c.offsetWidth = 108;
	assert.equal(h.controller.prepareHand([c], null, { animate: 'giveAuto', losing_map: { sender: [[c], [c], []] } }), true);
	h.hand.appendChild(c); c.style.transform = 'the real sorted slot'; h.controller.settleHand(c);
	assert.equal(h.animations[0].options.duration, 300); assert.equal(h.animations[0].frames[0].transform, 'translate(90.2px,82px) scale(0.7)');
	assert.equal(h.animations[0].frames.at(-1).transform, 'translate(420px,460px) scale(0.7)');
	assert.equal(c.style.opacity, '0'); assert.equal(c.style.transform, 'the real sorted slot');
	h.playerGain2.call(h.me, [c]); assert.equal(h.animations.length, 1); assert.equal(h.copies.length, 1);
	h.animations[0].finish(); assert.equal(c.style.opacity, ''); assert.equal(c.style.transition, ''); assert.equal(c.parentNode, h.hand); assert.equal(h.timers.size, 0);
	assert.equal(h.controller.activeCount, 0); h.controller.settleHand(c); assert.equal(h.animations.length, 1);
});

test('rapid reflow, interaction, removal and game over restore real cards without changing their zone', () => {
	const h = harness(), c = h.card('sha', { left: 400, top: 460, width: 75.6, height: 105 }); c.offsetWidth = 108;
	h.controller.prepareHand([c], null, { animate: 'draw' }); h.hand.appendChild(c); h.controller.settleHand(c);
	const old = h.animations[0]; old.currentTime = 100; c.box.left = 450; h.controller.settleHand(c);
	assert.equal(old.canceled, true); assert.equal(h.animations.at(-1).options.duration, 200);
	c.interact(); assert.equal(c.style.opacity, ''); assert.equal(h.controller.activeCount, 0);
	h.controller.prepareHand([c], null, { animate: 'draw' }); h.controller.settleHand(c); c.remove(); h.observers.forEach(o => o.fn());
	assert.equal(c.style.opacity, ''); assert.equal(h.controller.activeCount, 0);
	h.controller.prepareHand([c], null, { animate: 'draw' }); for (const fn of h.lib.onover) fn();
	assert.equal(c.style.transition, ''); assert.equal(h.timers.size, 0);
});

test('public gain2 prefers a visible table card over its previous owner and failures never hide real cards', () => {
	const h = harness(), c = h.card('sha', { left: 420, top: 460, width: 75.6, height: 105 }); c.offsetWidth = 108;
	const old = h.node({ left: 350, top: 200, width: 75.6, height: 105 }); h.ui.arena.appendChild(old); c.clone = old;
	h.controller.prepareHand([c], null, { animate: 'gain2', source: h.sender }); h.hand.appendChild(c); h.controller.settleHand(c);
	assert.equal(h.animations[0].frames[0].transform, 'translate(350px,200px) scale(0.7)');
	assert.equal(h.copies[0].fixed, true); h.advance(native.watchdogMs);
	assert.equal(c.style.opacity, ''); assert.equal(c.style.transition, ''); assert.equal(c.clone, old); assert.equal(h.controller.activeCount, 0);
	const copy = c.copy; c.copy = (...args) => { const clone = copy(...args); clone.animate = () => { throw Error('browser animation unavailable'); }; return clone; };
	h.controller.prepareHand([c], null, { animate: 'draw' }); h.controller.settleHand(c);
	assert.equal(c.style.opacity, ''); assert.equal(c.style.transition, ''); assert.equal(h.controller.activeCount, 0); assert.equal(h.timers.size, 0);
});

test('initial deals and hand exchanges animate, snapshot restoration stays still, and generic gain preserves native fallback', () => {
	const h = harness(), c = h.card(); h._status.event = { name: 'gameDraw' };
	h.lib.element.player.directgain.call(h.me, [c]); assert.equal(h.controller.handlesHand([c], h.me), true);
	h.lib.element.player.directgain.call(h.me, [c]); h.controller.clear(); assert.equal(h.timers.size, 0);
	h._status.event = { name: 'reconnect' }; const d = h.card(); h.lib.element.player.directgain.call(h.me, [d]);
	assert.equal(h.controller.handlesHand([d], h.me), false); assert.equal(h.animations.length, 0);
	h.playerGain.call(h.other, 3, false); assert.equal(h.controller.activeCount, 3); assert.equal(h.videos.at(-1)[0], 'gain');
	h.controller.clear(); h.lib.config.animation = false; h.playerGain.call(h.other, 1, false);
	assert.deepEqual(h.fallback, ['gain']); assert.equal(h.controller.prepareHand([d]), false); assert.equal(setupDrawMotion(h), h.controller);
});
