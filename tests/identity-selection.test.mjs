import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { captureSelectionPlayerLayout } from '../src/ui/selectionPlayer.js';
import { selectionFixture } from './helpers/selection-dom.mjs';

test('swap control, corner offsets and sprite retain their card proportions across viewport and game zoom changes', () => {
	const css = fs.readFileSync(new URL('../identity-selection.css', import.meta.url), 'utf8');
	const rule = selector => css.slice(css.indexOf(selector + ' {') + selector.length + 2).split('}')[0];
	const swap = rule('.hh-use-player-style .hh-general-swap'), hint = rule('.hh-use-player-style .hh-variant-hint');
	const declaration = (block, name) => {
		const raw = block.match(new RegExp('(?:^|;)\\s*' + name + ':([^;]+)'))?.[1];
		assert.ok(raw, `Missing ${name}`); return raw;
	};
	function evaluate(raw, variables) {
		const expression = raw.trim().replace(/var\((--[\w-]+)\)/g, (_, key) => String(variables[key])).replace(/calc\(/g, '(').replace(/px/g, '');
		assert.match(expression, /^[\d\s.()+*/-]+$/);
		return vm.runInNewContext(expression);
	}
	const value = (block, name, variables) => evaluate(declaration(block, name), variables);
	const pair = (block, name, variables) => {
		const raw = declaration(block, name).replace(/var\((--[\w-]+)\)/g, (_, key) => String(variables[key]));
		const parts = raw.match(/calc\([^)]*\)|-?[\d.]+px/g);
		assert.equal(parts.length, 2); return parts.map(part => evaluate(part, variables));
	};
	// Include the existing enlarged hit area when measuring the displayed circle.
	const transform = Number(rule('.hh-general-swap').match(/transform:scale\(([^)]+)\)/)[1]);
	let baseline;
	for (const [stageScale, gameZoom] of [[1, 1], [.5, 1], [.586, 1], [.87, 1], [.87, .8], [.4, 1.25]]) {
		const width = 176 * gameZoom, height = 233 * gameZoom;
		const template = { offsetWidth: 136, offsetHeight: 180, getBoundingClientRect: () => ({ width, height }) };
		const layout = captureSelectionPlayerLayout(template, stageScale);
		const variables = { '--hh-card-width': layout.width };
		// Custom units are lengths, so nested calc() works on older Android WebViews too.
		if (css.includes('--hh-card-unit:')) variables['--hh-card-unit'] = value(rule('.hh-use-player-style'), '--hh-card-unit', variables);
		const metrics = [value(swap, 'width', variables) * transform, value(swap, 'height', variables) * transform, value(swap, 'right', variables), value(swap, 'top', variables), value(hint, 'width', variables), value(hint, 'height', variables), value(hint, 'right', variables), ...pair(swap, 'background-size', variables), ...pair(swap, 'background-position', variables), ...pair(hint, 'background-size', variables), ...pair(hint, 'background-position', variables)].map(size => size * stageScale / width);
		if (!baseline) baseline = metrics;
		for (let i = 0; i < metrics.length; i++) assert.ok(Math.abs(metrics[i] - baseline[i]) < 1e-9, `Control/card ratio changed at stage scale ${stageScale}, game zoom ${gameZoom}`);
		assert.equal(metrics[0], metrics[1], 'Swap button must stay circular');
	}
});

for (const role of ['zhu', 'fan']) test(`landlord selection reuses native dialog and candidate buttons for ${role}`, () => {
	const h = selectionFixture({ role }), original = [...h.dialog.buttons], root = h.open();
	assert.equal(root.dataset.mode, 'doudizhu'); assert.ok(root.classList.contains('hh-doudizhu-selection'));
	assert.deepEqual(h.dialog.buttons, original); assert.equal(root.querySelectorAll('.hh-general').length, role === 'zhu' ? 6 : 3);
	assert.equal(root.querySelector('.hh-selection-prompt').textContent, role === 'zhu' ? '您是地主，请选择武将' : '您是农民，请选择武将');
	const seats = root.querySelectorAll('.hh-seat'); assert.equal(seats.length, 3);
	assert.deepEqual(seats.map(seat => seat.textContent), ['一', '二', '三']); assert.equal(seats.filter(seat => seat.classList.contains('hh-seat-lord')).length, 1);
	assert.ok(seats[0].classList.contains('hh-seat-lord')); assert.equal(root.querySelector('.hh-identity-reveal'), null);
	const first = h.dialog.buttons[0]; first.emit('click');
	assert.equal(h.ui.selected.buttons.length, 0); assert.equal(h.calls.ok, 0); assert.ok(root.querySelector('.hh-skill-panel'));
	first.emit('click'); assert.equal(h.ui.selected.buttons[0], first); assert.equal(h.calls.ok, 1); assert.equal(h.calls.nativeClicks, 0);
	h.dialog.close(); assert.equal(h.dialog._hhSelection, undefined); assert.equal(h.ui.control.parentNode, h.document.body);
	assert.equal(h.calls.close, 1); assert.equal(h.timers.size, 0); assert.ok(h.observers.every(observer => observer.disconnected));
	first.emit('click'); assert.equal(h.calls.nativeClicks, 1); assert.equal(h.calls.ok, 1);
});

test('double-character selection preserves native limits and lets the first selection be changed', () => {
	const h = selectionFixture({ select: () => 2 }), root = h.open(), [a, b] = h.dialog.buttons;
	assert.equal(root.querySelector('.hh-selection-prompt').textContent, '您是地主，请选择二名武将');
	a.emit('click'); a.emit('click'); assert.equal(h.calls.ok, 0); assert.deepEqual(h.ui.selected.buttons, Object.assign([a], { add: h.ui.selected.buttons.add, remove: h.ui.selected.buttons.remove }));
	a.emit('click'); assert.equal(h.ui.selected.buttons.length, 0);
	for (const button of [a, b]) { button.emit('click'); button.emit('click'); }
	assert.equal(h.calls.ok, 1); assert.equal(h.ui.selected.buttons.length, 2); h.dialog.close();
});

test('standard landlord reroll uses the native legal pool and updates the actual dialog button', () => {
	const h = selectionFixture(), root = h.open(), old = h.dialog.buttons[0], oldLink = old.link, swap = old.querySelector('.hh-general-swap');
	old.emit('pointerdown', { target: swap }); old.emit('pointerup', { target: swap });
	const next = h.dialog.buttons[0]; assert.notEqual(next, old); assert.notEqual(next.link, oldLink); assert.ok(h.parent.list.includes(next.link));
	assert.equal(old.isConnected, false); assert.ok(root.contains(next)); assert.equal(h.dialog.buttons.length, 6);
	next.emit('click'); next.emit('click'); assert.equal(h.calls.ok, 1); h.dialog.close();
});

for (const name of ['kaihei', 'binglin']) test(`${name} keeps teammate candidates visible and outside the legal selection`, () => {
	const h = selectionFixture({ role: 'fan', fixed: true, teammate: true }), root = h.open();
	assert.equal(root.querySelectorAll('.hh-general').length, 6); assert.equal(root.querySelector('.caption').textContent, '队友的武将');
	for (const button of h.dialog.buttons) assert.equal(button.querySelector('.hh-general-swap').hidden, true);
	const teammate = h.dialog.buttons.at(-1); assert.equal(teammate.classList.contains('selectable'), false);
	teammate.emit('click'); teammate.emit('click'); assert.equal(h.ui.selected.buttons.length, 0); assert.equal(root.querySelector('.hh-skill-panel'), null);
	const own = h.dialog.buttons[0]; own.emit('click'); own.emit('click'); assert.equal(h.calls.ok, 1); h.dialog.close();
});

test('zhidou preserves the bottom card pile and requires two landlord characters', () => {
	const h = selectionFixture({ count: 4, fixed: true, cards: true, select: 2 }), root = h.open();
	assert.equal(root.querySelectorAll('.hh-general').length, 4); assert.equal(h.dialog.buttons.length, 6);
	for (const button of h.dialog.buttons.slice(4)) { assert.equal(button.classList.contains('hh-general'), false); assert.equal(button.querySelector('.hh-general-swap'), null); }
	for (const button of h.dialog.buttons.slice(0, 2)) { button.emit('click'); button.emit('click'); }
	assert.equal(h.calls.ok, 1); assert.equal(h.ui.selected.buttons.length, 2); h.dialog.close();
});

test('huanle retains assigned seven-character landlord candidates without inventing a reroll pool', () => {
	const h = selectionFixture({ count: 7, fixed: true }), root = h.open();
	assert.equal(root.querySelectorAll('.hh-general').length, 7); assert.equal(h.parent.list, undefined);
	assert.ok(h.dialog.buttons.every(button => button.querySelector('.hh-general-swap').hidden)); h.dialog.close();
});

test('identity still uses the same hook with its identity sidebar and single submit behavior', () => {
	const h = selectionFixture({ mode: 'identity' }), root = h.open();
	assert.equal(root.classList.contains('hh-doudizhu-selection'), false); assert.equal(root.querySelector('.hh-my-identity').textContent, '我（主公）');
	assert.equal(root.querySelector('.hh-selection-prompt').textContent, '请选择武将');
	const first = h.dialog.buttons[0]; first.emit('click'); first.emit('click'); assert.equal(h.calls.ok, 1); h.dialog.close();
});

for (const reason of ['bidding', 'ai', 'connect', 'online', 'brawl', 'free-pick', 'other-mode', 'in-game-skill']) test(`opening hook leaves ${reason} dialogs alone`, () => {
	const h = selectionFixture();
	if (reason === 'bidding') h.event.name = 'chooseControl';
	if (reason === 'ai') h.event.player = h.game.players[1];
	if (reason === 'connect') h._status.connectMode = true;
	if (reason === 'online') h.game.online = true;
	if (reason === 'brawl') h._status.brawl = {};
	if (reason === 'free-pick') h.parent.dialogxx = h.dialog;
	if (reason === 'other-mode') h.get.mode = () => 'versus';
	// Native getParent returns an empty object when no chooseCharacter ancestor exists.
	if (reason === 'in-game-skill') h.event.getParent = () => ({});
	assert.equal(h.open(), undefined); assert.equal(h.document.body.querySelector('.hh-identity-viewport'), null);
});
