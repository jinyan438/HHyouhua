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

test('normal UI updates restore opening selection when a skin replaces Dialog.open after arenaReady', () => {
	const h = selectionFixture({ mode: 'identity' });
	h.lib.element.Dialog.prototype.open = function () { h.document.body.append(this); return this; };
	assert.equal(h.open(), undefined);
	for (const update of h.ui.updates) update();
	const root = h.dialog._hhSelection;
	assert.ok(root);
	for (const update of h.ui.updates) update();
	assert.equal(h.document.body.querySelectorAll('.hh-identity-viewport').length, 1);
	assert.equal(h.dialog._hhSelection, root);
	h.dialog.buttons[0].emit('click'); h.dialog.buttons[0].emit('click');
	assert.equal(h.calls.ok, 1); h.dialog.close();
	// Native close animations can keep the old dialog in the DOM briefly.
	h.document.body.append(h.dialog); h.dialog.classList.add('removing');
	for (const update of h.ui.updates) update();
	assert.equal(h.dialog._hhSelection, undefined); h.dialog.remove();
});

test('another character dialog cannot take over the active opening selection', () => {
	const h = selectionFixture({ mode: 'identity' }), root = h.open();
	const other = h.ui.create.dialog(), button = h.document.createElement('div');
	button.className = 'button character'; button.link = 'general20'; other.buttons.push(button); other.content.append(button);
	other.open();
	for (const update of h.ui.updates) update();
	assert.equal(other._hhSelection, undefined);
	assert.equal(h.dialog._hhSelection, root);
	assert.equal(h.document.body.querySelectorAll('.hh-identity-viewport').length, 1);
	other.close(); h.dialog.close();
});

function pointPick(root, id, previewOnly = false) {
	root.querySelector('.hh-point-entry').emit('click');
	const picker = root.querySelector('.hh-point-picker'), search = picker.querySelector('.hh-point-search');
	search.value = id; search.emit('input');
	const card = picker.querySelector('.hh-point-grid').querySelectorAll('.hh-general').find(button => button.link === id);
	assert.ok(card, `Missing free-pick character ${id}`); card.emit('click');
	assert.ok(root.querySelector('.hh-point-picker')); assert.ok(card.classList.contains('hh-pending'));
	assert.equal(card.querySelector('.hh-card-confirm').textContent, '确认选择');
	assert.equal(picker.querySelector('.hh-skill-panel').getAttribute('aria-label'), id + '技能');
	if (previewOnly) return card;
	card.emit('click'); assert.equal(!!root.querySelector('.hh-point-picker'), false);
}

for (const options of [{ mode: 'identity', count: 8 }, { role: 'zhu' }, { role: 'fan' }, { fixed: true, teammate: true, role: 'fan' }]) {
	test(`point-pick adds a real selectable candidate and submits once (${JSON.stringify(options)})`, () => {
		const h = selectionFixture(options), filter = h.event.filterButton, root = h.open(), original = [...h.dialog.buttons];
		assert.ok(root.querySelector('.hh-general-grid').contains(root.querySelector('.hh-point-slot')));
		h.event._buttonChoice = { 0: [...original] };
		const preview = pointPick(root, 'general20', true);
		assert.equal(h.calls.ok, 0); assert.equal(h.dialog.buttons.length, original.length); assert.equal(h.ui.selected.buttons.length, 0);
		preview.emit('click');
		const picked = h.dialog.buttons.at(-1);
		assert.equal(picked.link, 'general20'); assert.equal(h.dialog.buttons.length, original.length + 1);
		assert.equal(h.event._buttonChoice, undefined); assert.equal(h.event.filterButton(picked, h.game.me), true);
		assert.equal(picked.querySelector('.hh-general-swap').hidden, true);
		assert.equal(h.calls.ok, 1); assert.equal(h.ui.selected.buttons[0], picked);
		h.dialog.close(); assert.equal(h.event.filterButton, filter); assert.equal(h.document.body.querySelector('.hh-point-picker'), null);
		assert.equal(h.timers.size, 0); assert.ok(h.observers.every(observer => observer.disconnected));
	});
}

test('point-pick searches names, ids and skills, filters packages and excludes occupied, hidden and teammate characters', () => {
	const h = selectionFixture({ fixed: true, teammate: true, role: 'fan' });
	h.lib.character.general30.isUnseen = true; h.game.players[1].name1 = 'general31';
	h.lib.translate.general20 = '测试武将'; h.lib.translate.rende = '仁德';
	const translate = h.get.translation; h.get.translation = id => h.lib.translate[id] || translate(id);
	h.lib.characterPack = { sample: { general20: h.lib.character.general20 } }; h.lib.translate.sample_character_config = '测试包';
	const root = h.open(); root.querySelector('.hh-point-entry').emit('click');
	const picker = root.querySelector('.hh-point-picker'), search = picker.querySelector('.hh-point-search'), grid = picker.querySelector('.hh-point-grid');
	const ids = () => grid.querySelectorAll('.hh-general').map(button => button.link);
	for (const id of ['general3', 'general4', 'general5', 'general30', 'general31']) assert.equal(ids().includes(id), false);
	for (const query of ['测试武将', '仁德', ' GENERAL20 ']) {
		search.value = query; search.emit('input'); assert.ok(ids().includes('general20'));
	}
	search.value = ''; search.emit('input'); picker.querySelectorAll('.hh-point-pack').find(button => button.textContent === '测试包').emit('click');
	assert.deepEqual(ids(), ['general20']);
	search.value = '没有这个武将'; search.emit('input'); assert.equal(grid.querySelector('.hh-point-empty').textContent, '暂无武将');
	picker.emit('keydown', { key: 'Escape' }); assert.equal(root.querySelector('.hh-point-picker'), null); assert.equal(h.calls.ok, 0);
	h.dialog.close();
});

test('point-pick batches a large pool, replaces a preview and keeps both native and freely picked first generals in double-character games', () => {
	for (const firstFree of [false, true]) {
		const h = selectionFixture({ select: 2 }), root = h.open();
		for (let i = 40; i < 110; i++) h.lib.character['general' + i] = h.lib.character.general20;
		root.querySelector('.hh-point-entry').emit('click');
		const grid = root.querySelector('.hh-point-grid'); assert.equal(grid.children.length, 40);
		grid.scrollTop = grid.scrollHeight; grid.emit('scroll'); assert.equal(grid.children.length, 80);
		root.querySelector('.hh-point-picker').emit('keydown', { key: 'Escape' });
		pointPick(root, 'general20', true);
		const picker = root.querySelector('.hh-point-picker'), search = picker.querySelector('.hh-point-search');
		search.value = 'general21'; search.emit('input'); assert.equal(!!picker.querySelector('.hh-skill-panel'), false);
		const preview = picker.querySelector('.hh-general'); preview.emit('click');
		assert.ok(preview.classList.contains('hh-pending')); assert.equal(h.dialog.buttons.length, 6);
		assert.equal(h.dialog.buttons.some(button => button.link === 'general20'), false);
		if (firstFree) preview.emit('click'); else picker.emit('keydown', { key: 'Escape' });
		const first = firstFree ? h.dialog.buttons.at(-1) : h.dialog.buttons[0];
		if (!firstFree) { first.emit('click'); first.emit('click'); }
		assert.equal(h.ui.selected.buttons[0], first); assert.equal(h.calls.ok, 0);
		pointPick(root, 'general22'); const second = h.dialog.buttons.at(-1);
		assert.equal(h.ui.selected.buttons[0], first); assert.equal(first.isConnected, true);
		assert.equal(second.link, 'general22'); assert.equal(h.calls.ok, 1); assert.equal(h.ui.selected.buttons.length, 2);
		h.dialog.close();
	}
});

test('point-picking an existing candidate previews its skills before submitting without duplicating it', () => {
	const h = selectionFixture(), root = h.open(), count = h.dialog.buttons.length;
	const preview = pointPick(root, 'general0', true); assert.equal(h.dialog.buttons.length, count); assert.equal(h.calls.ok, 0);
	preview.emit('click'); assert.equal(h.dialog.buttons.length, count); assert.equal(h.calls.ok, 1);
	root.querySelector('.hh-point-entry').emit('click'); h.dialog.close();
	assert.equal(h.document.body.querySelector('.hh-point-picker'), null); assert.equal(h.event.filterButton(h.dialog.buttons[0]), true);
});

const engineCheck = new URL('../../../noname/game/check.js', import.meta.url);
test('native engine Check rebuilds its cached candidate list for a free pick and preserves the first confirmed general', { skip: !fs.existsSync(engineCheck) }, () => {
	const h = selectionFixture({ select: 2, fixed: true, teammate: true, role: 'fan' });
	h.lib.filter.cardAiIncluded = () => true; h.lib.filter.buttonIncluded = () => true; h.game.callHook = () => {};
	const source = fs.readFileSync(engineCheck, 'utf8').replace(/^import[^\n]*\n/gm, '').replace('export class Check', 'class Check');
	vm.runInContext(source + '\ngame.Check = new Check();', h.context);
	h.game.check = () => h.game.Check.button(h.event, true).ok;
	const root = h.open(), first = h.dialog.buttons[0]; first.emit('click'); first.emit('click');
	assert.equal(h.ui.selected.buttons[0], first); assert.equal(h.event._buttonChoice[0].includes(first), true);
	pointPick(root, 'general20'); const picked = h.dialog.buttons.at(-1);
	assert.equal(h.event._buttonChoice[0].includes(picked), true); assert.equal(h.ui.selected.buttons[0], first);
	assert.equal(h.dialog.buttons[3].classList.contains('selectable'), false);
	assert.equal(h.calls.ok, 1); assert.equal(h.ui.selected.buttons.length, 2); h.dialog.close();
});

for (const input of ['mouse', 'touch', 'touch-only']) test(`long press and version switch leave the next confirmation usable (${input})`, () => {
	const h = selectionFixture(), root = h.open(), button = h.dialog.buttons[0];
	h.lib.characterReplace.general0 = ['general0', 'general20']; button._link = 'general0';
	if (input !== 'touch-only') button.emit('pointerdown');
	if (input !== 'mouse') button.emit('touchstart', { touches: [{ clientX: 0, clientY: 0 }] });
	h.advance(500); assert.ok(root.querySelector('.hh-variant-panel'));
	if (input !== 'touch-only') button.emit('pointerup');
	if (input !== 'mouse') button.emit('touchend');
	button.emit('click'); assert.equal(h.calls.ok, 0);
	const variant = root.querySelector('.hh-variant-panel').querySelectorAll('.hh-general').find(card => card.link === 'general20');
	h._status.dragged = true; h._status.justdragged = true;
	h.event._buttonChoice = { 0: [] }; variant.emit('click');
	assert.equal(button.link, 'general20'); assert.equal(h.event._buttonChoice, undefined);
	assert.ok(button.classList.contains('hh-pending')); assert.ok(root.querySelector('.hh-skill-panel')); assert.equal(h.calls.ok, 0);
	if (input !== 'touch-only') { button.emit('pointerdown'); button.emit('pointerup'); }
	if (input !== 'mouse') { button.emit('touchstart', { touches: [{ clientX: 0, clientY: 0 }] }); button.emit('touchend'); }
	button.emit('click'); assert.equal(h.calls.ok, 1); assert.equal(h.ui.selected.buttons[0], button); h.dialog.close();
});

test('dragging and pointer cancellation never confirm a card and do not block the following taps', () => {
	const h = selectionFixture(), root = h.open(), button = h.dialog.buttons[0];
	button.emit('pointerdown'); button.emit('pointermove', { clientX: 50 }); button.emit('pointerup'); button.emit('click');
	assert.equal(!!root.querySelector('.hh-skill-panel'), false); assert.equal(h.calls.ok, 0);
	button.emit('pointerdown'); button.emit('pointercancel'); button.emit('touchcancel'); button.emit('click');
	assert.equal(h.calls.ok, 0);
	for (let i = 0; i < 2; i++) { button.emit('pointerdown'); button.emit('pointerup'); button.emit('click'); }
	assert.equal(h.calls.ok, 1); h.dialog.close();
});

test('point-pick touch gestures preview once, suppress their synthetic click and confirm on the next tap', () => {
	const h = selectionFixture(), root = h.open(); root.querySelector('.hh-point-entry').emit('click');
	const picker = root.querySelector('.hh-point-picker'), search = picker.querySelector('.hh-point-search');
	search.value = 'general20'; search.emit('input'); const card = picker.querySelector('.hh-general');
	const tap = () => { card.emit('pointerdown'); card.emit('touchstart', { touches: [{ clientX: 0, clientY: 0 }] }); card.emit('pointerup'); card.emit('touchend'); card.emit('click'); };
	tap(); assert.equal(h.calls.ok, 0); assert.ok(picker.querySelector('.hh-skill-panel')); assert.ok(card.classList.contains('hh-pending'));
	tap(); assert.equal(h.calls.ok, 1); assert.equal(!!root.querySelector('.hh-point-picker'), false); h.dialog.close();
});

for (const area of ['picker', 'outside']) test(`clicking non-card space cancels the point-pick preview (${area})`, () => {
	const h = selectionFixture(), root = h.open(), card = pointPick(root, 'general20', true);
	const picker = root.querySelector('.hh-point-picker'), target = area === 'picker' ? picker : root;
	for (const type of area === 'picker' ? ['pointerdown', 'touchstart', 'click'] : ['pointerdown']) {
		target.emit(type, { target });
		assert.equal(card.classList.contains('hh-pending'), false); assert.equal(card.getAttribute('aria-pressed'), 'false');
		assert.equal(!!picker.querySelector('.hh-skill-panel'), false); assert.equal(h.calls.ok, 0);
		card.emit('click'); assert.ok(card.classList.contains('hh-pending')); assert.ok(picker.querySelector('.hh-skill-panel'));
		assert.equal(h.calls.ok, 0);
	}
	h.dialog.close();
});

for (const reason of ['bidding', 'ai', 'connect', 'online', 'brawl', 'free-pick', 'other-mode', 'in-game-skill']) test(`opening hook leaves ${reason} dialogs alone`, () => {
	const h = selectionFixture();
	if (reason === 'bidding') h.event.name = 'chooseControl';
	if (reason === 'ai') h.event.player = h.game.players[1];
	if (reason === 'connect') h._status.connectMode = true;
	if (reason === 'online') h.game.online = true;
	if (reason === 'brawl') h._status.brawl = {};
	if (reason === 'free-pick') h.parent.dialogxx = h.dialog;
	if (reason === 'other-mode') h.get.mode = () => 'guozhan';
	// Native getParent returns an empty object when no chooseCharacter ancestor exists.
	if (reason === 'in-game-skill') h.event.getParent = () => ({});
	assert.equal(h.open(), undefined); assert.equal(h.document.body.querySelector('.hh-identity-viewport'), null);
});
