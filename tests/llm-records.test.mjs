import test from 'node:test';
import assert from 'node:assert/strict';
import { createLLMJournal } from '../src/llm/journal.js';
import { renderLLMRecords } from '../src/llm/records.js';
import { complete } from '../src/llm/client.js';
import { domFixture } from './helpers/catalog-dom.mjs';
import fs from 'node:fs';
import vm from 'node:vm';
import { bindDialogButton } from '../src/llm/dialog.js';

const player = (seat, name) => ({ seat, name, getSeatNum: () => seat, isUnseen: () => false });
const perspective = { seat: player => player.seat, names: player => [player.name], text: name => name };
function logged(journal, actor, index = 1) {
	const record = journal.begin(actor, { name: 'chooseTarget' }, index, 'mock', 'API_SECRET');
	record.output({ reasoning: 'RETURNED_REASONING_' + index, content: '', tool_calls: [{ function: { name: 'game_action', arguments: '{"action":"target","id":"seat:1"}' } }] });
	record.operation({ action: 'batch', reason: '评估对手选择后的净收益', strategy: '保留防御资源', actions: [{ action: 'target', id: 'target:1' }, { action: 'confirm' }] },
		{ ok: true, submitted: true }, { targets: [{ id: 'target:1', player: 'seat:1' }] }); record.finish('submitted');
	return record;
}

test('journal retains per-seat output and outcomes, redacts credentials, paginates and clears stale request handles', () => {
	const journal = createLLMJournal(perspective), a = player(2, '甲将'), b = player(3, '乙将');
	let notified = 0; const stop = journal.subscribe(() => notified++);
	const pending = journal.begin(a, { name: 'chooseBool' }, 1, 'mock', 'API_SECRET');
	pending.output({ reasoning: 'API_SECRET private', content: '<img src=x onerror=alert(1)>', tool_calls: [] });
	pending.operation({ action: 'bool', value: true, reason: 'API_SECRET' }, { ok: false, error: 'API_SECRET rejected' }, {});
	pending.finish(); journal.resolve(a, 'ai');
	assert.equal(journal.read(2)[0].status, 'repair'); assert.equal(journal.read(2)[0].resolution, 'ai');
	assert.equal(JSON.stringify(journal.read()).includes('API_SECRET'), false);
	for (let index = 0; index < 100; index++) logged(journal, index % 2 ? a : b, index);
	assert.equal(journal.read().length, 101); assert.equal(journal.read(2).length, 51);
	assert.deepEqual(journal.read(2, { before: 9, limit: 2 }).map(entry => entry.id), [5, 7]);
	const copy = journal.read(2); copy[0].reasoning = 'changed'; assert.notEqual(journal.read(2)[0].reasoning, 'changed');
	assert.ok(notified > 100); stop(); const last = notified;
	journal.reset(); pending.output({ reasoning: 'late result' }); assert.deepEqual(journal.read(), []); assert.equal(notified, last);
});

test('actual provider reasoning is observed locally and excluded from the returned conversation message', async () => {
	let observed;
	const message = await complete({ address: 'https://test.example', model: 'mock' }, [], [], {
		onOutput(value) { observed = value; },
		fetch: async () => ({ ok: true, json: async () => ({ choices: [{ message: { reasoning_content: 'PRIVATE_REASONING_OUTPUT',
			content: null, tool_calls: [{ id: 'call', function: { name: 'game_action', arguments: '{"action":"confirm"}' } }] } }] }) }),
	});
	assert.equal(observed.reasoning, 'PRIVATE_REASONING_OUTPUT'); assert.equal(message.reasoning, undefined); assert.equal(message.reasoning_content, undefined);
	assert.equal(JSON.stringify(message).includes('PRIVATE_REASONING_OUTPUT'), false);
});

function panel(t, journal) {
	const dom = domFixture(), previous = globalThis.document; globalThis.document = dom.document;
	t.after(() => { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; });
	const div = (selector, parent) => { const node = dom.document.createElement('div'); node.className = selector.slice(1).replaceAll('.', ' '); parent?.appendChild(node); return node; };
	const node = div('.pausedbg', dom.document.body), bigbg = div('.bigbgjilu', node), historybg = div('.historybg', node), columnbox = div('.content', bigbg);
	const context = { lib: { translate: {} }, game: { players: [player(1, '玩家'), player(2, '甲将'), player(3, '乙将')], dead: [], hhLLM: { journal } },
		ui: { create: { div } }, get: { translation: name => name, cnNumber: number => number === 1 ? '一' : '三' } };
	renderLLMRecords(context, { node, bigbg, historybg, columnbox });
	return { ...dom, node, columnbox, list: node.querySelector('.hh-llm-record-list') };
}

test('record panel filters seats, preserves live history and displays provider text safely', t => {
	const journal = createLLMJournal(perspective), a = player(2, '甲将'), b = player(3, '乙将');
	const record = logged(journal, a); logged(journal, b, 2);
	record.output({ reasoning: '<img src=x onerror="bad">', content: '模型说明', tool_calls: [] });
	const h = panel(t, journal);
	assert.equal(h.list.querySelectorAll('.hh-llm-record-entry').length, 2);
	assert.equal(h.list.querySelector('img'), null); assert.ok(h.list.textContent.includes('<img src=x'));
	assert.ok(h.list.textContent.includes('目标：玩家（一号位）')); assert.ok(h.list.textContent.includes('保留防御资源'));
	const choose = name => h.columnbox.children.find(row => row.textContent === name);
	choose('甲将（二号位）').emit('click', { detail: 0 });
	assert.equal(h.list.querySelectorAll('.hh-llm-record-entry').length, 1); assert.equal(h.columnbox.querySelectorAll('.gou').length, 1);
	logged(journal, a, 3); assert.equal(h.list.querySelectorAll('.hh-llm-record-entry').length, 2);
	logged(journal, b, 4); assert.equal(h.list.querySelectorAll('.hh-llm-record-entry').length, 2);
	const point = { identifier: 1, clientX: 10, clientY: 10 }, row = choose('乙将（三号位）');
	row.emit('touchstart', { touches: [point] }); row.emit('touchend', { touches: [], changedTouches: [point] }); row.emit('click', { detail: 1 });
	assert.equal(row.getAttribute('aria-pressed'), 'true'); assert.equal(h.list.querySelectorAll('.hh-llm-record-entry').length, 2);
	const before = h.list.textContent; h.node._hhLLMCleanup(); logged(journal, b, 5); assert.equal(h.list.textContent, before);
});

test('record panel shows recent output first, can load all earlier entries, and resets on a new game', t => {
	const journal = createLLMJournal(perspective), a = player(2, '甲将');
	for (let index = 1; index <= 85; index++) logged(journal, a, index);
	const h = panel(t, journal);
	assert.equal(h.list.querySelectorAll('.hh-llm-record-entry').length, 40);
	h.list.querySelector('button').emit('click', { detail: 0 }); assert.equal(h.list.querySelectorAll('.hh-llm-record-entry').length, 80);
	h.list.querySelector('button').emit('click', { detail: 0 }); assert.equal(h.list.querySelectorAll('.hh-llm-record-entry').length, 85);
	assert.equal(h.list.querySelector('button'), null);
	journal.reset(); assert.ok(h.list.textContent.includes('暂无LLM记录')); assert.equal(h.list.querySelectorAll('.hh-llm-record-entry').length, 0);
	h.node._hhLLMCleanup();
});

test('online record button follows takeover enablement and touch opens, filters and closes through the existing pause panel', t => {
	const dom = domFixture(), previous = globalThis.document; globalThis.document = dom.document;
	t.after(() => { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; });
	dom.Element.prototype.closest = function(selector) { for (let node = this; node; node = node.parentNode) {
		if (selector.split(',').some(item => item.trim().startsWith('.') && node.classList.contains(item.trim().slice(1)))) return node;
	} return null; };
	dom.Element.prototype.addTempClass = function() {};
	const div = (selector, ...args) => { const node = dom.document.createElement('div'); node.className = selector.slice(1).replaceAll('.', ' ');
		for (const value of args) { if (typeof value === 'string') node.innerHTML = value; else if (value?.appendChild) value.appendChild(node); else if (typeof value === 'function') node.addEventListener('click', value); } return node; };
	const window = div('.window', dom.document.body), arena = div('.arena', window), identityShow = div('.identityShow', window);
	const journal = createLLMJournal(perspective), players = [player(1, '玩家'), player(2, '甲将')];
	players.forEach(item => { item.nickname = '玩家'; item.identity = item.seat === 1 ? 'fan' : 'zhu'; });
	logged(journal, players[1]);
	const _status = { gameStarted: true }, lib = { config: { mode: 'doudizhu' }, translate: {} };
	let paused = 0, resumed = 0;
	const game = { players, dead: [], me: players[0], hhLLM: { enabled: false, journal }, countPlayer: fn => players.filter(fn).length,
		pause2() { _status.paused2 = true; paused++; }, resume2() { _status.paused2 = false; resumed++; } };
	const ui = { window, arena, identityShow, historybar: div('.historybar', window), create: { div }, click: { shortcut() {} },
		system: { show() {}, hide() {} }, time: { show() {}, hide() {} } };
	const get = { translation: value => value, cnNumber: String };
	const source = fs.readFileSync(new URL('../ui/lbtn/skins/online.js', import.meta.url), 'utf8').replace(/^import[^\n]*\n/gm, '').replace('export function', 'function');
	const context = vm.createContext({ lib, game, ui, get, ai: {}, _status, document: dom.document, bindDialogButton, renderLLMRecords,
		createBaseLbtnPlugin: () => ({}), getBackgroundImage() {} });
	vm.runInContext(source + '\nglobalThis.plugin=createOnlineLbtnPlugin(lib,game,ui,get,ai,_status,{});', context);
	const plugin = context.plugin; plugin.initPauseOverride(); plugin.updateIdentityShow();
	assert.equal(identityShow.querySelector('.hh-llm-record-button'), null);
	game.hhLLM.enabled = true; ui.hhLLMRecordsRefresh();
	const button = identityShow.querySelector('.hh-llm-record-button'); assert.equal(button.textContent, 'LLM记录');
	ui.hhLLMRecordsRefresh(); assert.equal(identityShow.querySelectorAll('.hh-llm-record-button').length, 1);
	const point = { identifier: 1, clientX: 10, clientY: 10 };
	button.emit('touchstart', { touches: [point] }); button.emit('touchend', { touches: [], changedTouches: [point] }); button.emit('click', { detail: 1 });
	assert.equal(paused, 1); const panel = window.querySelector('.hh-llm-records'); assert.ok(panel); assert.equal(arena.classList.contains('paused'), true);
	const row = panel.querySelector('.namebg'); panel.emit('touchend', { target: row, cancelable: true }); assert.equal(panel.isConnected, true);
	row.emit('click', { detail: 0 }); assert.equal(panel.querySelectorAll('.hh-llm-record-entry').length, 1);
	const list = panel.querySelector('.hh-llm-record-list'), oldText = list.textContent;
	panel.emit('touchend', { target: panel.querySelector('.resumedbg'), cancelable: true });
	assert.equal(panel.isConnected, false); assert.equal(resumed, 1); assert.equal(arena.classList.contains('paused'), false);
	logged(journal, players[1], 2); assert.equal(list.textContent, oldText, 'Closed panels unsubscribe from journal updates');
	game.hhLLM.enabled = false; ui.hhLLMRecordsRefresh(); assert.equal(identityShow.querySelector('.hh-llm-record-button'), null);
	button.emit('click', { detail: 0 }); assert.equal(paused, 1, 'Stale button cannot reopen a panel after disabling takeover');
});
