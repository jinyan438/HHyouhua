import { formatUpdateError } from './updater-core.js';

const root = 'extension/HH优化/';
const bytesOf = data => typeof data === 'string' ? new TextEncoder().encode(data) :
	ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : new Uint8Array(data);
const bufferOf = data => {
	const bytes = bytesOf(data);
	return bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes.buffer : bytes.slice().buffer;
};

function path(value) {
	if (typeof value !== 'string' || /[\\:\x00-\x1f]/.test(value) || value.split('/').some(part => !part || part === '..' || part === '.')) throw new Error('无效的更新文件路径。');
	return root + value;
}

async function operation(action, value, run) {
	try { return await run(); }
	catch (error) { throw new Error(`${action}失败：${value}（${formatUpdateError(error)}）`); }
}

export function createGameFileSystem(game, environment = globalThis) {
	const browser = environment.window || environment;
	const directory = browser.localStorage?.getItem('noname_inited');
	if (directory && typeof browser.resolveLocalFileSystemURL === 'function') {
		return createCordovaFileSystem(browser, directory, environment.FileReader || browser.FileReader);
	}
	if (!['readFile', 'writeFile', 'checkFile', 'checkDir', 'removeFile', 'removeDir'].every(key => typeof game[key] === 'function')) {
		throw new Error('当前环境未开放文件读写，无法安装更新。请使用支持文件访问的无名杀客户端。');
	}
	// 不使用旧版 game.promises.writeFile：它可能把成功的 writeend 事件当成错误。
	const call = (method, ...args) => new Promise((resolve, reject) => game[method](...args, resolve, reject));
	const removeFile = target => new Promise((resolve, reject) => game.removeFile(target, error => error ? reject(error) : resolve(), reject));
	return {
		exists: value => operation('检查文件', value, async () => await call('checkFile', path(value)) === 1),
		read: value => operation('读取文件', value, async () => bytesOf(await call('readFile', path(value)))),
		write: (value, data) => operation('写入文件', value, async () => {
			const target = path(value), split = target.lastIndexOf('/');
			// 统一文件接口会替换内容；APK内置资源通过可写覆盖层更新，不能先删除。
			const buffer = bufferOf(data);
			await new Promise((resolve, reject) => game.writeFile(buffer, target.slice(0, split), target.slice(split + 1), result => {
				if (!result || (['write', 'writeend'].includes(result.type) && !result.target?.error)) resolve();
				else reject(result.target?.error || result);
			}));
		}),
		remove: value => operation('删除文件', value, () => removeFile(path(value))),
		clean: () => operation('清理更新缓存', '.hh-update', async () => {
			if (await call('checkDir', root + '.hh-update') === 1) await call('removeDir', root + '.hh-update');
		}),
	};
}

function createCordovaFileSystem(browser, directory, Reader) {
	const call = (target, method, ...args) => new Promise((resolve, reject) => target[method](...args, resolve, reject));
	let rootEntry;
	const getRoot = () => rootEntry ||= new Promise((resolve, reject) => browser.resolveLocalFileSystemURL(directory, resolve, reject));
	const missing = error => Number(error?.code) === 1;
	const getFile = async (value, create = false) => {
		const parts = path(value).split('/'), name = parts.pop();
		let parent = await getRoot();
		if (create) {
			for (const part of parts) parent = await call(parent, 'getDirectory', part, { create: true });
			return call(parent, 'getFile', name, { create: true });
		}
		return call(parent, 'getFile', [...parts, name].join('/'), { create: false });
	};
	return {
		exists: value => operation('检查文件', value, async () => {
			try { return (await getFile(value)).isFile !== false; }
			catch (error) { if (missing(error)) return false; throw error; }
		}),
		read: value => operation('读取文件', value, async () => {
			const file = await call(await getFile(value), 'file');
			return new Promise((resolve, reject) => {
				const reader = new Reader();
				reader.onload = () => resolve(bytesOf(reader.result));
				reader.onerror = event => reject(reader.error || event);
				reader.onabort = event => reject(reader.error || event);
				reader.readAsArrayBuffer(file);
			});
		}),
		write: (value, data) => operation('写入文件', value, async () => {
			const writer = await call(await getFile(value, true), 'createWriter');
			const bytes = bytesOf(data);
			const write = run => new Promise((resolve, reject) => {
				writer.onerror = event => reject(writer.error || event);
				writer.onabort = event => reject(writer.error || event);
				writer.onwriteend = () => writer.error ? reject(writer.error) : resolve();
				run();
			});
			// Reuse complete buffers; only subviews need a copy to preserve their exact range.
			await write(() => writer.write(bufferOf(bytes)));
			// 原生覆盖写入不保证截断旧尾部，必须等待 truncate 完成。
			await write(() => writer.truncate(bytes.byteLength));
		}),
		remove: value => operation('删除文件', value, async () => call(await getFile(value), 'remove')),
		clean: () => operation('清理更新缓存', '.hh-update', async () => {
			let entry;
			try { entry = await call(await getRoot(), 'getDirectory', root + '.hh-update', { create: false }); }
			catch (error) { if (missing(error)) return; throw error; }
			await call(entry, 'removeRecursively');
		}),
	};
}
