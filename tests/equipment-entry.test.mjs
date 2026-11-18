import assert from 'node:assert/strict';
import test from 'node:test';
import { setupEquipmentEntry } from '../src/ui/equipmentEntry.js';
import { setupSettlementOptimization } from '../src/features/settlementOptimization.js';

function harness({ waiting = false, animation = true } = {}) {
	let now = 0, nextId = 0, arrival, removedWaits = 0;
	const timers = new Map(), observers = [], animations = [];
	const lib = { config: { animation }, onover: [], arenaReady: [] };
	const game = { players: [] };
	if (waiting) game.hhEquipMove = { afterArrival(card, player, callback) { arrival = callback; return () => removedWaits++; } };
	class Observer { constructor(callback) { this.callback = callback; observers.push(this); } observe(container) { this.container = container; } }
	const controller = setupEquipmentEntry({ lib, game }, { Observer,
		setTimer(fn, ms) { const id = ++nextId; timers.set(id, { fn, time: now + ms }); return id; }, clearTimer(id) { timers.delete(id); } });
	function advance(ms) {
		const end = now + ms;
		while (true) {
			const next = [...timers].filter(([, t]) => t.time <= end).sort((a, b) => a[1].time - b[1].time)[0];
			if (!next) break;
			now = next[1].time; timers.delete(next[0]); next[1].fn();
		}
		now = end;
	}
	const player = () => ({ node: { equips: { childNodes: [] } } });
	function card(name = 'hanbing', classes = ['card']) {
		const label = { offsetWidth: 130, style: { visibility: '' }, ownerDocument: { hidden: false }, animate(frames, options) {
			const a = { frames, options, canceled: false, cancel() { this.canceled = true; }, finish() { this.onfinish?.(); } };
			animations.push(a); return a;
		} };
		return { name, node: { name2: label }, style: { clipPath: 'none', transform: 'translateX(10px)' }, classList: { contains: value => classes.includes(value) }, offsetWidth: 130 };
	}
	function put(card, p) { if (card.parentNode) card.parentNode.childNodes = card.parentNode.childNodes.filter(c => c !== card); p.node.equips.childNodes.push(card); card.parentNode = p.node.equips; }
	function remove(card) { card.parentNode.childNodes = card.parentNode.childNodes.filter(c => c !== card); card.parentNode = null; }
	const flush = () => observers.forEach(o => o.callback());
	return { lib, game, controller, animations, timers, observers, advance, player, card, put, remove, flush, arrive: () => arrival?.(), get removedWaits() { return removedWaits; } };
}

test('settlement toggle preserves equipment arrival ordering and the full 300ms strip slide', () => {
	const results = [];
	for (const enabled of [false, true]) {
		const h = harness({ waiting: true }), p = h.player(), c = h.card();
		h.game.delayx = () => 'native-display';
		setupSettlementOptimization({ lib: h.lib, game: h.game, get: {}, _status: { event: { name: 'equip' } } }, { enable_settlement_optimize: enabled });
		h.controller.observe(p); h.put(c, p); h.flush(); assert.equal(h.animations.length, 0);
		assert.equal(h.game.delayx(), 'native-display'); h.arrive(); const a = h.animations[0];
		results.push({ frames: a.frames, options: a.options }); assert.equal(a.options.duration, 300);
		h.advance(299); assert.equal(h.controller.activeCount, 1); a.finish(); assert.equal(h.controller.activeCount, 0); assert.equal(h.timers.size, 0);
	}
	assert.deepEqual(results[0], results[1]);
});

test('waits for the card arrival callback, then slides the full strip for the native 300 ms', () => {
	const h = harness({ waiting: true }), p = h.player(), c = h.card(); h.controller.observe(p); h.put(c, p); h.flush();
	assert.equal(c.node.name2.style.visibility, 'hidden'); assert.equal(h.animations.length, 0);
	h.arrive(); const a = h.animations[0];
	assert.equal(c.node.name2.style.visibility, '');
	assert.equal(a.options.duration, 300); assert.equal(a.options.easing, 'linear');
	assert.equal(a.frames[0].transform, `translateX(${-130 * 173 / 146}px)`);
	assert.equal(c.style.transform, 'translateX(10px)', 'selection transform stays on the real card');
	assert.equal(c.style.clipPath, 'inset(0px -2px)');
	a.finish();
	assert.equal(c.style.clipPath, 'none'); assert.equal(h.controller.activeCount, 0); assert.equal(h.timers.size, 0);
});

test('half horse strips share the native off-seat start and include the right-lane offset in their travel', () => {
	for (const left of [0, 73]) {
		const h = harness(), p = h.player(), c = h.card();
		Object.assign(p.node.equips, { offsetWidth: 146, classList: { contains: name => name === 'hh-source-equipment-layout' }, parentNode: { classList: { contains: name => name === 'player' } } });
		c.offsetLeft = left; c.offsetWidth = 73; c.node.name2.offsetWidth = 73;
		h.controller.observe(p); h.put(c, p); h.flush();
		const a = h.animations[0], travel = Number(a.frames[0].transform.match(/translateX\(([-\d.]+)px\)/)[1]);
		assert.ok(Math.abs(travel + 173 + left) < 1e-8); assert.equal(a.options.duration, 300);
		assert.equal(c.style.clipPath, `inset(0px ${-(75 - left)}px 0px ${-(left + 2)}px)`); a.finish();
		assert.equal(c.style.clipPath, 'none');
	}
});

test('existing equipment, placeholders, text updates and in-column sorting do not replay entry', () => {
	const h = harness(), p = h.player(), old = h.card(); h.put(old, p); h.controller.observe(p); h.flush();
	for (const c of [h.card('empty_equip1', ['card', 'emptyequip']), h.card('feichu_equip2', ['card', 'feichu'])]) h.put(c, p);
	h.flush(); assert.equal(h.animations.length, 0);
	const c = h.card(); h.put(c, p); h.flush(); assert.equal(h.animations.length, 1);
	p.node.equips.childNodes.reverse(); h.flush(); assert.equal(h.animations.length, 1);
	h.animations[0].finish(); h.flush(); assert.equal(h.animations.length, 1);
});

test('removing a pending card restores it and a late arrival cannot animate a discarded card', () => {
	const h = harness({ waiting: true }), p = h.player(), c = h.card(); h.controller.observe(p); h.put(c, p); h.flush();
	h.remove(c); h.flush(); h.arrive(); h.advance(2000);
	assert.equal(c.node.name2.style.visibility, ''); assert.equal(h.animations.length, 0);
	assert.equal(h.removedWaits, 1); assert.equal(h.controller.activeCount, 0); assert.equal(h.timers.size, 0);
});

test('transfer restarts entry for its new column without an old observer canceling it', () => {
	const h = harness(), p = h.player(), q = h.player(), c = h.card(); h.controller.observe(p); h.controller.observe(q);
	h.put(c, p); h.flush(); const first = h.animations[0];
	h.put(c, q); h.observers[1].callback(); h.observers[0].callback();
	assert.equal(first.canceled, true); assert.equal(h.animations.length, 2); assert.equal(h.controller.activeCount, 1);
	h.animations[1].finish(); assert.equal(h.controller.activeCount, 0); assert.equal(c.style.clipPath, 'none');
});

test('animation setting, game over, missing events and duplicate setup all leave no hidden strip', () => {
	const off = harness({ animation: false }), p = off.player(), c = off.card(); off.controller.observe(p); off.put(c, p); off.flush();
	assert.equal(off.animations.length, 0); assert.equal(c.node.name2.style.visibility, '');
	const h = harness({ waiting: true }), q = h.player(), d = h.card(); h.controller.observe(q); h.put(d, q); h.flush();
	for (const callback of h.lib.onover) callback(); h.arrive();
	assert.equal(d.node.name2.style.visibility, ''); assert.equal(h.controller.activeCount, 0); assert.equal(h.timers.size, 0);
	const e = h.card(); h.put(e, q); h.flush(); h.advance(1500); assert.equal(h.animations.length, 1);
	h.advance(380); assert.equal(e.style.clipPath, 'none'); assert.equal(h.controller.activeCount, 0); assert.equal(h.timers.size, 0);
	assert.equal(setupEquipmentEntry({ lib: h.lib, game: h.game }), h.controller);
});
