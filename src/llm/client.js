import { requestNative, NativeAPIError } from './native.js';

export const LLM_PREFIX = 'extension_HH优化_llm_';

export function apiRoot(address) {
	const url = new URL(String(address || '').trim());
	if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
		throw new Error('API 地址须为不带账号、查询参数的 HTTP(S) 地址');
	}
	return url.href.replace(/\/+$/, '').replace(/\/(?:chat\/completions|models)$/, '');
}

export function readConnection(lib) {
	const value = key => lib.config[LLM_PREFIX + key];
	return { address: value('address') || '', key: value('key') || '', model: value('model') || '',
		timeout: Math.max(5, Math.min(600, Number(value('timeout')) || 120)) * 1000 };
}

export async function requestAPI(connection, path, body, { fetch: fetcher = globalThis.fetch, signal, runtime = globalThis } = {}) {
	const controller = new AbortController();
	const abort = () => controller.abort();
	if (signal?.aborted) controller.abort();
	signal?.addEventListener('abort', abort, { once: true });
	let timer;
	try {
		const aborted = new Promise((_, reject) => {
			if (controller.signal.aborted) reject(new Error('请求已取消'));
			else controller.signal.addEventListener('abort', () => reject(new Error('请求已取消')), { once: true });
		});
		const timeout = new Promise((_, reject) => {
			timer = setTimeout(() => { controller.abort(); reject(new Error('API 请求超时')); }, connection.timeout || 120000);
		});
		const request = async () => {
			if (controller.signal.aborted) throw new Error('请求已取消');
			const url = apiRoot(connection.address) + '/' + path, method = body ? 'POST' : 'GET';
			const headers = { ...(connection.key ? { Authorization: 'Bearer ' + connection.key } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) };
			const data = body ? JSON.stringify(body) : undefined;
			const native = typeof runtime.cordova?.exec === 'function'
				? await requestNative(runtime, { url, method, headers, ...(data ? { data } : {}), timeout: Math.ceil(connection.timeout || 120000) }, controller.signal) : null;
			const response = native || await fetcher(url, {
				method, signal: controller.signal, redirect: 'error', headers,
				...(data ? { body: data } : {}),
			});
			if (!response.ok) throw new Error('API 返回 HTTP ' + response.status);
			return response.json();
		};
		return await Promise.race([request(), timeout, aborted]);
	} catch (error) {
		if (controller.signal.aborted) throw new Error(signal?.aborted ? '请求已取消' : 'API 请求超时');
		if (error instanceof NativeAPIError) throw error;
		// Do not repeat response bodies, request headers or provider messages containing credentials.
		if (/^API 返回 HTTP \d+$/.test(error.message)) throw error;
		if (typeof runtime.cordova?.exec === 'function') throw new Error('当前客户端无法通过网页连接 API，请安装包含大模型原生网络接口的新版客户端');
		throw new Error('无法连接 API，请检查地址、网络及服务的跨域设置');
	} finally {
		clearTimeout(timer);
		signal?.removeEventListener('abort', abort);
	}
}

export async function fetchModels(connection, environment) {
	const result = await requestAPI(connection, 'models', undefined, environment);
	const models = [...new Set((Array.isArray(result.data) ? result.data : Array.isArray(result.models) ? result.models : [])
		.map(model => typeof model === 'string' ? model : model.id || model.name).filter(id => typeof id === 'string' && id.length))].sort();
	if (!models.length) throw new Error('接口未返回模型列表，可手动填写模型名称');
	return models;
}

export async function complete(connection, messages, tools, environment) {
	if (!connection.model) throw new Error('请先选择或填写模型');
	const result = await requestAPI(connection, 'chat/completions', {
		model: connection.model, messages, tools, tool_choice: 'auto', stream: false,
	}, environment);
	if (result.usage && environment?.onUsage) {
		const value = number => Number.isFinite(number) && number >= 0 ? number : 0;
		const input = value(result.usage.prompt_tokens ?? result.usage.input_tokens);
		const output = value(result.usage.completion_tokens ?? result.usage.output_tokens);
		environment.onUsage({ input, output, total: value(result.usage.total_tokens ?? input + output),
			cached: value(result.usage.prompt_cache_hit_tokens ?? result.usage.prompt_tokens_details?.cached_tokens ?? result.usage.cache_read_input_tokens) });
	}
	const message = result.choices?.[0]?.message;
	if (!message || (typeof message.content !== 'string' && !message.tool_calls?.length)) throw new Error('模型未返回可用的操作');
	return { role: 'assistant', content: message.content || null,
		...(message.tool_calls?.length ? { tool_calls: message.tool_calls.map(call => ({ id: call.id, type: 'function', function: { name: call.function?.name, arguments: call.function?.arguments } })) } : {}) };
}
