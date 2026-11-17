import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/features/autoSelect.js', import.meta.url), 'utf8');
const hookCode = source.slice(source.indexOf('lib.hooks?.checkEnd?.add('), source.lastIndexOf('\n}'));

function fixture() {
	const event = {}, status = { event, paused: true, imchoosing: true }, jobs = [];
	const calls = { selections: 0, rebuilt: 0 };
	const ui = { confirm: { str: 'o' }, create: { confirm() { calls.rebuilt++; } } };
	const game = { check() {} };
	let hook;
	vm.runInNewContext(hookCode, { _status: status, ui, game,
		lib: { hooks: { checkEnd: { add(_name, callback) { hook = callback; } } } },
		setTimeout: callback => jobs.push(callback), performAutoSelectCard() { calls.selections++; return true; }, performAutoSelectTarget: () => false,
	});
	return { event, status, calls, ui, game, schedule() { hook(event, { ok: false }); }, flush() { while (jobs.length) jobs.shift()(); } };
}

test('queued auto-selection cannot recreate confirm buttons after the current choice has resumed', () => {
	const h = fixture(); h.schedule(); h.status.paused = false; h.status.imchoosing = false; h.flush();
	assert.equal(h.calls.selections, 0); assert.equal(h.calls.rebuilt, 0);
});

test('an auto-confirm during game.check cannot reopen the cancel button afterward', () => {
	const h = fixture(); h.game.check = () => { h.status.paused = false; h.status.imchoosing = false; };
	h.schedule(); h.flush();
	assert.equal(h.calls.selections, 1); assert.equal(h.calls.rebuilt, 0);
});

test('a live pending choice still receives auto-selection and its cancel button', () => {
	const h = fixture(); h.schedule(); h.flush();
	assert.equal(h.calls.selections, 1); assert.equal(h.calls.rebuilt, 1);
});
