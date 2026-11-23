import test from 'node:test';
import assert from 'node:assert/strict';
import { complete, fetchModels, requestAPI } from '../src/llm/client.js';
import { requestNative } from '../src/llm/native.js';

const connection = { address: 'https://api.deepseek.com/v1', key: 'TEST_SECRET', model: 'deepseek-chat', timeout: 1000 };
const neverFetch = () => { assert.fail('native requests must not be repeated through fetch'); };
function mockBridge(handle) {
	const calls = [];
	const runtime = { cordova: { exec(success, failure, service, action, args) {
		assert.equal(service, 'HHLLMHttp');
		calls.push({ action, args });
		if (action === 'available') success({ version: 1 });
		else if (action === 'request') handle(success, failure, args[0]);
		else if (action === 'abort') success();
	} } };
	return { runtime, calls, fetch: neverFetch };
}

test('Android fetches DeepSeek models with authentication and caches the service probe', async () => {
	const env = mockBridge((success, failure, options) => {
		assert.equal(options.url, 'https://api.deepseek.com/v1/models');
		assert.equal(options.method, 'GET');
		assert.equal(options.headers.Authorization, 'Bearer TEST_SECRET');
		assert.equal(options.data, undefined);
		assert.equal(options.timeout, 1000);
		success({ status: 200, data: JSON.stringify({ data: [{ id: 'deepseek-reasoner' }, { id: 'deepseek-chat' }] }) });
	});
	assert.deepEqual(await fetchModels(connection, env), ['deepseek-chat', 'deepseek-reasoner']);
	await fetchModels(connection, env);
	assert.deepEqual(env.calls.map(call => call.action), ['available', 'request', 'request']);
	assert.notEqual(env.calls[1].args[0].id, env.calls[2].args[0].id);
});

test('Android sends the full conversation and tool schema as JSON and returns tool calls', async () => {
	const messages = [{ role: 'system', content: '武将技能代码：function 技能() {}' }, { role: 'user', content: '请选择目标' }];
	const tools = [{ type: 'function', function: { name: 'game_action', parameters: { type: 'object', properties: { action: { type: 'string' } } } } }];
	const tool_calls = [{ id: 'call-1', type: 'function', function: { name: 'game_action', arguments: '{"action":"confirm"}' } }];
	const env = mockBridge((success, failure, options) => {
		assert.equal(options.url, 'https://api.deepseek.com/v1/chat/completions');
		assert.equal(options.method, 'POST');
		assert.equal(options.headers['Content-Type'], 'application/json');
		assert.deepEqual(JSON.parse(options.data), { model: 'deepseek-chat', messages, tools, tool_choice: 'auto', stream: false });
		success({ status: 200, data: JSON.stringify({ choices: [{ message: { content: null, tool_calls } }] }) });
	});
	assert.deepEqual(await complete(connection, messages, tools, env), { role: 'assistant', content: null, tool_calls });
});

test('DeepSeek and compatible usage reports normalize cached tokens without retaining provider messages', async () => {
	for (const usage of [
		{ prompt_tokens: 120, completion_tokens: 8, prompt_cache_hit_tokens: 90, total_tokens: 128 },
		{ prompt_tokens: 120, completion_tokens: 8, prompt_tokens_details: { cached_tokens: 90 } },
		{ input_tokens: 120, output_tokens: 8, cache_read_input_tokens: 90 },
	]) {
		let reported;
		const env = mockBridge(success => success({ status: 200, data: JSON.stringify({ usage, choices: [{ message: { content: '{"action":"confirm"}' } }] }) }));
		await complete(connection, [], [], { ...env, onUsage: value => { reported = value; } });
		assert.deepEqual(reported, { input: 120, output: 8, total: 128, cached: 90 });
	}
});

test('native HTTP errors report the status without provider bodies or credentials', async () => {
	const env = mockBridge(success => success({ status: 401, data: 'TEST_SECRET provider error' }));
	await assert.rejects(fetchModels(connection, env), error => error.message === 'API 返回 HTTP 401');
});

test('native transport failures never retry a POST and never expose raw errors', async () => {
	const env = mockBridge((success, failure) => failure({ code: 'NETWORK', message: 'TEST_SECRET raw network details' }));
	await assert.rejects(complete(connection, [], [], env), error => error.message === '原生网络请求失败，请检查设备网络及 API 服务');
	assert.equal(env.calls.filter(call => call.action === 'request').length, 1);
});

test('native malformed responses produce safe errors', async () => {
	for (const response of [{ status: '200', data: '{}' }, { status: 200, data: 'TEST_SECRET not JSON' }]) {
		const env = mockBridge(success => success(response));
		await assert.rejects(fetchModels(connection, env), error => /原生网络请求失败|有效的 JSON/.test(error.message) && !error.message.includes('TEST_SECRET'));
	}
});

test('native DNS, TLS, timeout and origin errors are distinguishable', async () => {
	for (const [code, message] of [['DNS', /解析/], ['TLS', /证书/], ['TIMEOUT', /超时/], ['ORIGIN', /当前页面/]]) {
		const env = mockBridge((success, failure) => failure({ code }));
		await assert.rejects(fetchModels(connection, env), message);
	}
});

test('cancel aborts the native request and ignores late success', async () => {
	const controller = new AbortController();
	let respond;
	const env = mockBridge(success => { respond = success; });
	const pending = fetchModels(connection, { ...env, signal: controller.signal });
	await Promise.resolve();
	controller.abort();
	await assert.rejects(pending, /已取消/);
	assert.deepEqual(env.calls.map(call => call.action), ['available', 'request', 'abort']);
	assert.equal(env.calls[2].args[0], env.calls[1].args[0].id);
	respond({ status: 200, data: '{"data":[{"id":"too-late"}]}' });
});

test('timeout aborts native requests even if no callback arrives', async () => {
	const env = mockBridge(() => {});
	await assert.rejects(fetchModels({ ...connection, timeout: 15 }, env), /超时/);
	assert.deepEqual(env.calls.map(call => call.action), ['available', 'request', 'abort']);
});

test('cancelling while probing prevents a later native request', async () => {
	let probe, requests = 0;
	const runtime = { cordova: { exec(success, failure, service, action) {
		if (action === 'available') probe = success;
		if (action === 'request') requests++;
	} } };
	const controller = new AbortController();
	const pending = fetchModels(connection, { runtime, fetch: neverFetch, signal: controller.signal });
	controller.abort();
	await assert.rejects(pending, /已取消/);
	probe({ version: 1 });
	await Promise.resolve(); await Promise.resolve();
	assert.equal(requests, 0);
});

test('pre-cancelled requests never reach either network channel', async () => {
	const controller = new AbortController(); controller.abort();
	const env = mockBridge(() => assert.fail('must not send'));
	await assert.rejects(fetchModels(connection, { ...env, signal: controller.signal }), /已取消/);
	assert.equal(env.calls.length, 0);
});

test('browsers and older Cordova clients use fetch when native service is absent', async () => {
	for (const runtime of [{}, { cordova: { exec(success, failure) { failure('Class not found'); } } }]) {
		let fetched = 0;
		const env = { runtime, fetch: async (url, options) => {
			fetched++; assert.equal(options.headers.Authorization, 'Bearer TEST_SECRET');
			return { ok: true, json: async () => ({ data: [{ id: 'model' }] }) };
		} };
		assert.deepEqual(await fetchModels(connection, env), ['model']); assert.equal(fetched, 1);
	}
});

test('old Android clients show an actionable error when fetch fails', async () => {
	const runtime = { cordova: { exec(success, failure) { failure('Class not found'); } } };
	await assert.rejects(requestAPI(connection, 'models', undefined, { runtime, fetch: async () => { throw new Error('TEST_SECRET'); } }), /请安装包含大模型原生网络接口的新版客户端/);
	assert.equal(await requestNative({}, {}, undefined), null);
});
