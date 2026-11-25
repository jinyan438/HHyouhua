import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { createLeaveDialog } from '../ui/lbtn/leaveDialog.js';
import { domFixture } from './helpers/catalog-dom.mjs';

function fixture(status = {}) {
	const dom = domFixture(), calls = { pause: 0, resume: 0, reload: 0, confirmed: 0 }, _status = { ...status };
	dom.document.defaultView = { innerWidth: 1650, innerHeight: 750, location: { reload() { assert.equal(_status.reloading, true); calls.reload++; } } };
	const game = { pause2() { calls.pause++; _status.paused2 = true; }, resume2() { calls.resume++; _status.paused2 = false; }, playAudio() {} };
	const opener = dom.document.createElement('button'); dom.document.body.appendChild(opener); opener.focus();
	const dialog = createLeaveDialog({ game, ui: { window: dom.document.body }, _status }, { returnFocus: opener, onConfirm() { calls.confirmed++; } });
	return { ...dom, calls, _status, dialog, opener };
}

test('opening the leave dialog is idempotent and cancel preserves the current game', () => {
	const h = fixture(), root = h.dialog.open();
	assert.equal(h.dialog.open(), root); assert.equal(h.calls.pause, 1);
	assert.equal(root.querySelector('[role="alertdialog"]').getAttribute('aria-modal'), 'true');
	assert.equal(root.querySelector('.hh-leave-title').textContent, '离开牌局');
	assert.equal(h.document.activeElement, root.querySelector('.hh-leave-cancel'));
	root.querySelector('.hh-leave-cancel').emit('click');
	assert.deepEqual(h.calls, { pause: 1, resume: 1, reload: 0, confirmed: 0 });
	assert.equal(h.document.body.querySelector('.hh-leave-dialog-backdrop'), null);
	assert.equal(h.document.activeElement, h.opener); assert.equal(h._status.reloading, undefined);
});

test('the close icon, backdrop and Escape only dismiss and release their own pause', () => {
	for (const kind of ['close', 'backdrop', 'escape']) {
		const h = fixture(), root = h.dialog.open();
		if (kind === 'close') root.querySelector('.hh-leave-close').emit('click');
		else if (kind === 'backdrop') root.emit('click', { target: root });
		else h.document.emit('keydown', { key: 'Escape' });
		assert.equal(h.calls.resume, 1); assert.equal(h.calls.reload, 0);
		assert.equal(h.document.listeners.get('keydown').length, 0);
		assert.equal(h.document.body.querySelector('.hh-leave-dialog-backdrop'), null);
	}
});

test('closing a dialog cannot resume an existing pause or pause an online game', () => {
	for (const status of [{ paused2: true }, { connectMode: true }]) {
		const h = fixture(status); h.dialog.open(); h.dialog.close();
		assert.equal(h.calls.pause, 0); assert.equal(h.calls.resume, 0);
		if (status.paused2) assert.equal(h._status.paused2, true);
	}
});

test('confirmation reloads exactly once with the engine unload-confirmation bypass set', () => {
	const h = fixture(), root = h.dialog.open(), confirm = root.querySelector('.hh-leave-confirm');
	confirm.emit('click'); confirm.emit('click');
	assert.deepEqual(h.calls, { pause: 1, resume: 0, reload: 1, confirmed: 1 });
	assert.equal(h._status.reloading, true);
	assert.equal(h.document.body.querySelector('.hh-leave-dialog-backdrop'), null);
});

test('keyboard focus remains in the dialog and destroy releases listeners and pause', () => {
	const h = fixture(), root = h.dialog.open();
	h.document.emit('keydown', { key: 'Tab', shiftKey: true }); assert.equal(h.document.activeElement, root.querySelector('.hh-leave-close'));
	h.document.emit('keydown', { key: 'Tab', shiftKey: true }); assert.equal(h.document.activeElement, root.querySelector('.hh-leave-confirm'));
	h.document.emit('keydown', { key: 'Tab' }); assert.equal(h.document.activeElement, root.querySelector('.hh-leave-close'));
	h.dialog.destroy(); h.dialog.destroy();
	assert.equal(h.calls.resume, 1); assert.equal(h.document.listeners.get('keydown').length, 0);
});

test('a failed reload restores the unload guard and leaves cancellation available', () => {
	const h = fixture(), root = h.dialog.open();
	h.document.defaultView.location.reload = () => { throw new Error('reload blocked'); };
	assert.throws(() => root.querySelector('.hh-leave-confirm').emit('click'), /reload blocked/);
	assert.equal(h._status.reloading, undefined);
	root.querySelector('.hh-leave-cancel').emit('click'); assert.equal(h.calls.resume, 1);
});

test('the paper panel, close icon and button images retain original extracted resource hashes', () => {
	const root = new URL('../assets/leave-dialog/', import.meta.url), sources = JSON.parse(fs.readFileSync(new URL('sources.json', root), 'utf8'));
	assert.equal(sources.files.length, 4);
	for (const file of sources.files) assert.equal(createHash('sha256').update(fs.readFileSync(new URL(file.file, root))).digest('hex'), file.sha256);
});
