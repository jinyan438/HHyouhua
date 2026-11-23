import test from 'node:test';
import assert from 'node:assert/strict';
import { createLLMConfig } from '../src/llm/settings.js';
import { LLM_PREFIX as P } from '../src/llm/client.js';
import { domFixture } from './helpers/catalog-dom.mjs';

function fixture(t, fetcher, llm = { cancelPending() {} }) {
	const dom = domFixture(), writes = [], requests = [];
	const previousDocument = globalThis.document, previousFetch = globalThis.fetch;
	t.after(() => { globalThis.fetch = previousFetch; if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument; });
	globalThis.document = dom.document;
	dom.document.getElementById = id => dom.document.body.querySelectorAll('*').find(element => element.id === id);
	dom.Element.prototype.showModal = function() { this.open = true; };
	dom.Element.prototype.close = function() { this.open = false; this.onclose?.(); };
	dom.Element.prototype.replaceChildren = function(...children) { this.textContent = ''; this.append(...children); };
	globalThis.fetch = async (url, options) => {
		requests.push({ url, options });
		return fetcher ? fetcher(url, options) : { ok: true, json: async () => ({ data: [{ id: 'model-a' }, { id: 'model-b' }] }) };
	};
	const lib = { config: { touchscreen: true, [P + 'address']: 'https://api.deepseek.com', [P + 'key']: 'TEST_KEY', [P + 'model']: 'model-a' } };
	const game = { players: [], hhLLM: llm, saveConfig(key, value) { writes.push([key, value]); } };
	createLLMConfig({ lib, game, ui: {} }).llm_settings.onclick();
	const dialog = dom.document.getElementById('HH-llm-settings');
	const button = label => dialog.querySelectorAll('button').find(element => element.textContent === label);
	const field = name => dom.document.getElementById('HH-llm-' + name);
	function dispatch(target, type, properties = {}) {
		const promises = [];
		const event = { type, target, detail: 1, touches: [], changedTouches: [], defaultPrevented: false,
			preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, ...properties };
		for (let node = target; node; node = node === dom.document.body ? dom.document : node.parentNode) {
			for (const callback of node.listeners.get(type) || []) promises.push(callback.call(node, event));
			if (node['on' + type]) promises.push(node['on' + type].call(node, event));
			if (event.stopped) break;
		}
		return { event, settled: Promise.all(promises) };
	}
	function tap(target, dx = 0) {
		const point = { identifier: 1, clientX: 20, clientY: 20 };
		dispatch(target, 'touchstart', { touches: [point], changedTouches: [point] });
		if (dx) dispatch(target, 'touchmove', { touches: [{ ...point, clientX: 20 + dx }] });
		return dispatch(target, 'touchend', { changedTouches: [{ ...point, clientX: 20 + dx }] });
	}
	return { ...dom, lib, writes, requests, dialog, button, field, dispatch, tap };
}

test('Android taps fetch models without a synthesized click, and a follow-up click cannot fetch twice', async t => {
	let release;
	const h = fixture(t, () => new Promise(resolve => { release = resolve; })), pull = h.button('拉取模型');
	const action = h.tap(pull);
	assert.equal(h.requests.length, 1);
	assert.equal(h.requests[0].url, 'https://api.deepseek.com/models');
	assert.equal(h.requests[0].options.headers.Authorization, 'Bearer TEST_KEY');
	assert.equal(pull.textContent, '正在拉取…');
	release({ ok: true, json: async () => ({ data: [{ id: 'model-a' }, { id: 'model-b' }] }) });
	await action.settled;
	await h.dispatch(pull, 'click').settled;
	assert.equal(h.requests.length, 1);
	assert.ok(h.dialog.querySelector('[role="status"]').textContent.includes('2'));
	assert.equal(h.field('model-choice').hidden, false);
	assert.equal(h.field('model-choice').children.length, 3);
});

test('Android can select a fetched model, save it, and cancel a later settings dialog', async t => {
	const h = fixture(t);
	await h.tap(h.button('拉取模型')).settled;
	const choice = h.field('model-choice'); choice.value = 'model-b'; await h.dispatch(choice, 'change').settled;
	await h.tap(h.button('保存')).settled;
	assert.equal(h.lib.config[P + 'model'], 'model-b');
	assert.equal(h.dialog.isConnected, false);
	const savedCount = h.writes.length;
	createLLMConfig({ lib: h.lib, game: { players: [], saveConfig() { throw new Error('Cancel must not write'); } }, ui: {} }).llm_settings.onclick();
	const reopened = h.document.getElementById('HH-llm-settings');
	await h.tap(reopened.querySelectorAll('button').find(button => button.textContent === '取消')).settled;
	assert.equal(reopened.isConnected, false); assert.equal(h.writes.length, savedCount);
});

test('scrolling and text editing stay inside the dialog without activating a button', async t => {
	const h = fixture(t), leaked = [];
	for (const type of ['touchstart', 'touchmove', 'touchend']) h.document.addEventListener(type, () => leaked.push(type));
	await h.tap(h.button('拉取模型'), 30).settled;
	assert.equal(h.requests.length, 0); assert.deepEqual(leaked, []);
	const input = h.field('key');
	const touch = h.dispatch(input, 'touchstart', { touches: [{ identifier: 1, clientX: 10, clientY: 10 }] });
	assert.equal(touch.event.defaultPrevented, false);
	const scroll = h.dispatch(h.dialog, 'touchmove', { touches: [{ clientX: 10, clientY: 100 }] });
	assert.equal(scroll.event.defaultPrevented, false); assert.deepEqual(leaked, []);
	await h.dispatch(h.button('拉取模型'), 'click', { detail: 0 }).settled;
	assert.equal(h.requests.length, 1);
});

test('a rejected model request restores the button and displays a useful error', async t => {
	const h = fixture(t, async () => ({ ok: false, status: 401 }));
	await h.tap(h.button('拉取模型')).settled;
	const status = h.dialog.querySelector('[role="status"]');
	assert.ok(status.textContent.includes('401')); assert.ok(!status.textContent.includes('TEST_KEY'));
	assert.equal(h.button('拉取模型').disabled, false);
	assert.equal(h.dialog.isConnected, true);
});

test('settings show actual game usage and label memory as strategy retention', t => {
	const h = fixture(t, undefined, { usage: { requests: 2, reported: 1, input: 1200, output: 80, cached: 900 } });
	const usage = h.document.getElementById('HH-llm-usage').textContent;
	assert.ok(usage.includes('2 次请求')); assert.ok(usage.includes('输入 1200')); assert.ok(usage.includes('输出 80')); assert.ok(usage.includes('缓存命中 900'));
	assert.ok(usage.includes('部分请求未返回用量'));
	assert.ok(h.dialog.querySelectorAll('label').some(label => label.textContent === '保留最近策略'));
});
