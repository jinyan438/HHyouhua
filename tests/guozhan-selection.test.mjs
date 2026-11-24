import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { selectionFixture } from './helpers/selection-dom.mjs';

function fixture(options = {}) {
	return selectionFixture({ mode: 'guozhan', count: 7, select: 2, ...options, setup(h) {
		h._status.mode = 'free'; h.event.forceAuto = true; h.event.custom = { add: {} };
		for (const [index, info] of Object.values(h.lib.character).entries()) info.group = index < 2 ? 'wei' : index < 4 ? 'wu' : index === 4 ? 'ye' : 'shu';
		// Native-like asymmetric rule, intentionally supplied by the fixture.
		const compatible = (a, b) => h.lib.character[a].group === 'ye' ? h.lib.character[b].group !== 'ye' : h.lib.character[a].group === h.lib.character[b].group;
		h.event.filterButton = button => h.ui.selected.buttons.length ? compatible(h.ui.selected.buttons[0].link, button.link) : h.dialog.buttons.some(other => other !== button && compatible(button.link, other.link));
		options.setup?.(h);
	} });
}

test('free country-war uses native candidates, ordered main/vice slots and explicit confirmation', () => {
	const h = fixture(), original = [...h.dialog.buttons], filter = h.event.filterButton, root = h.open();
	assert.ok(root.classList.contains('hh-guozhan-selection'));
	assert.equal(root.querySelector('.hh-identity-reveal'), null);
	assert.equal(root.querySelector('.hh-point-slot'), null);
	assert.equal(root.querySelector('.hh-guozhan-confirm').disabled, true);
	assert.equal(h.event.forceAuto, false);
	const [a, b, invalid] = original, confirm = root.querySelector('.hh-guozhan-confirm');
	a.emit('click');
	assert.equal(h.ui.selected.buttons[0], a); assert.equal(h.calls.ok, 0);
	assert.equal(root.querySelectorAll('.hh-guozhan-preview').length, 1);
	assert.ok(a.classList.contains('hh-guozhan-picked')); assert.ok(root.querySelector('.hh-skill-panel'));
	assert.equal(invalid.classList.contains('selectable'), false);
	invalid.emit('click'); assert.equal(h.ui.selected.buttons.length, 1);
	confirm.emit('click'); assert.equal(h.calls.ok, 0);
	b.emit('click'); assert.equal(h.calls.ok, 0); assert.equal(confirm.disabled, false);
	assert.equal(root.querySelectorAll('.hh-guozhan-preview').length, 2);
	assert.deepEqual(h.dialog.buttons, original); assert.ok(h.dialog.contains(a));
	confirm.emit('click'); confirm.emit('click'); assert.equal(h.calls.ok, 1);
	assert.equal(h.ui.selected.buttons[0], a); assert.equal(h.ui.selected.buttons[1], b);
	h.dialog.close();
	assert.equal(h.event.filterButton, filter); assert.equal(h.event.forceAuto, true); assert.equal(h.event.complexSelect, undefined);
	assert.equal(h.event.custom.add.button, undefined); assert.equal(a.classList.contains('hh-guozhan-picked'), false);
	assert.equal(h.ui.control.parentNode, h.document.body); assert.ok(h.observers.every(observer => observer.disconnected));
});

test('returning a main preserves the vice slot and tests the new main with the native asymmetric rule', () => {
	const h = fixture(), root = h.open(), [a, b, , , wild] = h.dialog.buttons;
	a.emit('click'); b.emit('click');
	root.querySelectorAll('.hh-guozhan-preview')[0].emit('click');
	assert.equal(h.ui.selected.buttons.length, 1); assert.equal(h.ui.selected.buttons[0], b);
	const slots = root.querySelectorAll('.hh-guozhan-slot');
	assert.equal(slots[0].querySelector('.hh-guozhan-preview'), null);
	assert.equal(slots[1].querySelector('.hh-guozhan-preview').link, b.link);
	assert.equal(wild.classList.contains('selectable'), true);
	wild.emit('click');
	assert.equal(h.ui.selected.buttons[0], wild); assert.equal(h.ui.selected.buttons[1], b);
	root.querySelector('.hh-guozhan-confirm').emit('click'); assert.equal(h.calls.ok, 1); h.dialog.close();
});

test('native reroll clears slot previews and native callbacks are restored on close', () => {
	let checks = 0;
	const h = fixture({ setup: h => { h.event.custom.add.button = () => checks++; } }), native = h.event.custom.add.button;
	const root = h.open(); h.dialog.buttons[0].emit('click');
	h.ui.selected.buttons.splice(0); h.event.custom.add.button();
	assert.equal(checks, 1); assert.equal(root.querySelectorAll('.hh-guozhan-preview').length, 0);
	assert.equal(root.querySelector('.hh-guozhan-confirm').disabled, true);
	h.dialog.close(); assert.equal(h.event.custom.add.button, native);
});

test('repainting a complete pair never runs a native filter that mutates captions', () => {
	let filters = 0;
	const h = fixture({ setup(h) {
		const native = h.event.filterButton;
		h.event.filterButton = function (button, ...args) {
			filters++; button.appendChild(h.document.createElement('span'));
			return native.call(this, button, ...args);
		};
	} }), root = h.open();
	h.dialog.buttons[0].emit('click'); h.dialog.buttons[1].emit('click');
	const before = filters;
	// The content mutation observer must only repaint, or native caption writes
	// continually enqueue another observer callback and freeze the browser.
	for (const observer of h.observers) observer.callback();
	assert.equal(filters, before); assert.equal(root.querySelector('.hh-guozhan-confirm').disabled, false);
	h.dialog.close();
});

for (const variant of ['normal', 'yingbian', 'jiubian', 'old']) test(`country-war ${variant} retains its native interface`, () => {
	const h = fixture({ setup: h => { h._status.mode = variant; } }); assert.equal(h.open(), undefined); h.dialog.close();
});

test('country-war online, brawl and native full-catalog dialogs are excluded', () => {
	for (const setup of [h => { h._status.connectMode = true; }, h => { h.game.online = true; }, h => { h._status.brawl = {}; }]) {
		const h = fixture({ setup }); assert.equal(h.open(), undefined); h.dialog.close();
	}
	const h = fixture(); h.parent.dialogxx = h.dialog; assert.equal(h.open(), undefined); h.dialog.close();
});

test('country-war original sprites retain their recorded hashes', () => {
	const base = new URL('../assets/guozhan-selection/', import.meta.url), manifest = JSON.parse(fs.readFileSync(new URL('sources.json', base)));
	for (const file of manifest.files) assert.equal(createHash('sha256').update(fs.readFileSync(new URL(file.file, base))).digest('hex'), file.sha256);
	assert.equal(manifest.animation.duration, 300);
});
