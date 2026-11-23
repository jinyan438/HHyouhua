const capabilities = new WeakMap();
let sequence = 0;
const service = 'HHLLMHttp';

export class NativeAPIError extends Error {
	constructor(code) {
		const messages = {
			TIMEOUT: 'API 请求超时', ABORT: '请求已取消', DNS: '原生网络无法解析 API 域名，请检查地址和网络',
			TLS: 'API 证书验证失败，请检查设备时间和服务证书', CONNECT: '原生网络无法连接 API，请检查网络或服务状态',
			INVALID_REQUEST: '原生 API 请求参数无效，请更新客户端与扩展', ORIGIN: '当前页面不能使用原生 API 接口',
			JSON: 'API 未返回有效的 JSON 数据', NETWORK: '原生网络请求失败，请检查设备网络及 API 服务',
		};
		super(messages[code] || messages.NETWORK); this.code = code;
	}
}

// Probe the optional client service once. Older clients and ordinary browsers
// continue to use fetch; a failed POST is never silently sent a second time.
export async function requestNative(runtime, options, signal) {
	const bridge = runtime.cordova;
	if (typeof bridge?.exec !== 'function') return null;
	if (!capabilities.has(bridge)) capabilities.set(bridge, new Promise(resolve => {
		try { bridge.exec(value => resolve(value?.version >= 1), () => resolve(false), service, 'available', []); }
		catch { resolve(false); }
	}));
	const supported = await capabilities.get(bridge);
	if (signal?.aborted) throw new NativeAPIError('ABORT');
	if (!supported) return null;
	return new Promise((resolve, reject) => {
		const id = 'hh-llm-' + Date.now().toString(36) + '-' + (++sequence);
		let settled = false;
		const finish = (callback, value) => {
			if (settled) return;
			settled = true; signal?.removeEventListener('abort', abort); callback(value);
		};
		const abort = () => {
			finish(reject, new NativeAPIError('ABORT'));
			try { bridge.exec(() => {}, () => {}, service, 'abort', [id]); } catch {}
		};
		signal?.addEventListener('abort', abort, { once: true });
		try {
			bridge.exec(response => {
				if (!Number.isInteger(response?.status) || response.status < 100 || response.status > 599) { finish(reject, new NativeAPIError('NETWORK')); return; }
				finish(resolve, { ok: response.status >= 200 && response.status < 300, status: response.status,
					async json() { try { return JSON.parse(response.data); } catch { throw new NativeAPIError('JSON'); } } });
			}, error => finish(reject, new NativeAPIError(error?.code)), service, 'request', [{ id, ...options }]);
		} catch { finish(reject, new NativeAPIError('NETWORK')); }
	});
}
