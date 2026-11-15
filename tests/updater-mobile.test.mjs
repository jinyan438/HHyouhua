import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { createGameFileSystem } from '../updater-fs.js';
import { formatUpdateError, gitBlobHash, installUpdate, recoverUpdate } from '../updater-core.js';
import { recoverPendingUpdate } from '../updater.js';

const root = 'extension/HH优化/';
const bytes = value => typeof value === 'string' ? new TextEncoder().encode(value) : value.slice();
const text = value => new TextDecoder().decode(value);
const later = callback => queueMicrotask(callback);

// 模拟 Android Cordova 的回调时序及原生语义：覆盖写不截断，成功回调传事件而非空值。
function androidFS(initial = {}) {
	const files = new Map(Object.entries(initial).map(([name, data]) => [root + name, bytes(data)]));
	const directories = new Set(['', 'extension', 'extension/HH优化']);
	for (const file of files.keys()) {
		const parts = file.split('/'); parts.pop();
		while (parts.length) { directories.add(parts.join('/')); parts.pop(); }
	}
	const state = { files, fail: null, writes: [], truncates: [] };
	const error = (action, name) => state.fail?.(action, name.slice(root.length));
	class Directory {
		constructor(name) { this.name = name; this.isDirectory = true; }
		getDirectory(name, { create }, success, failure) {
			const target = [this.name, name].filter(Boolean).join('/');
			later(() => {
				const fail = error('directory', target);
				if (fail) return failure(fail);
				if (create) directories.add(target);
				directories.has(target) ? success(new Directory(target)) : failure({ code: 1 });
			});
		}
		getFile(name, { create }, success, failure) {
			const target = [this.name, name].filter(Boolean).join('/');
			later(() => {
				const fail = error('get', target);
				if (fail) return failure(fail);
				if (create && !files.has(target)) files.set(target, new Uint8Array());
				files.has(target) ? success(new File(target)) : failure({ code: 1 });
			});
		}
		removeRecursively(success, failure) {
			later(() => {
				const fail = error('clean', this.name);
				if (fail) return failure(fail);
				for (const file of files.keys()) if (file.startsWith(this.name + '/')) files.delete(file);
				success();
			});
		}
	}
	class File {
		constructor(name) { this.name = name; this.isFile = true; }
		file(success, failure) { later(() => { const fail = error('read', this.name); fail ? failure(fail) : success(this); }); }
		remove(success, failure) {
			later(() => { const fail = error('remove', this.name); if (fail) return failure(fail); files.delete(this.name); success(); });
		}
		createWriter(success) {
			const name = this.name;
			const writer = {
				error: null,
				write(data) {
					assert.ok(data instanceof ArrayBuffer, '原生写入必须使用准确范围的 ArrayBuffer');
					state.writes.push(name);
					later(() => {
						const fail = error('write', name);
						if (fail) { writer.error = fail; writer.onerror?.({ type: 'error', target: writer }); }
						else {
							const previous = files.get(name), next = new Uint8Array(Math.max(previous.length, data.byteLength));
							next.set(previous); next.set(new Uint8Array(data)); files.set(name, next);
						}
						writer.onwriteend?.({ type: 'writeend', target: writer });
					});
				},
				truncate(size) {
					state.truncates.push(name);
					later(() => {
						const fail = error('truncate', name);
						if (fail) { writer.error = fail; writer.onerror?.({ type: 'error', target: writer }); }
						else files.set(name, files.get(name).slice(0, size));
						writer.onwriteend?.({ type: 'writeend', target: writer });
					});
				},
			};
			later(() => success(writer));
		}
	}
	class Reader {
		readAsArrayBuffer(file) {
			later(() => {
				const fail = error('reader', file.name);
				if (fail) { this.error = fail; this.onerror({ target: this }); }
				else { this.result = files.get(file.name).slice().buffer; this.onload({ target: this }); }
			});
		}
	}
	const environment = { FileReader: Reader, window: {
		localStorage: { getItem: () => 'file:///android/game/' },
		resolveLocalFileSystemURL: (url, success) => later(() => success(new Directory(''))),
	} };
	const game = { readFile() {}, writeFile() {}, promises: new Proxy({}, { get() { throw Error('不能使用旧版 promises 文件包装'); } }) };
	return { ...state, state, environment, game, fs: createGameFileSystem(game, environment) };
}

async function remote(contents) {
	return { commit: 'a'.repeat(40), branch: 'codex/hh-updater', files: Object.fromEntries(await Promise.all(
		Object.entries(contents).map(async ([path, data]) => [path, await gitBlobHash(bytes(data))]))) };
}
const transport = contents => async url => {
	const name = decodeURIComponent(url.split('/' + 'a'.repeat(40) + '/')[1]);
	return { ok: true, arrayBuffer: async () => bytes(contents[name]).buffer };
};

test('安卓原生接口：二进制和视图范围保持不变，长文件改短和反复覆盖均无旧尾部', async () => {
	const h = androidFS({ 'src/a.js': 'long old source that must disappear' });
	const storage = new Uint8Array([77, 0, 255, 128, 13, 10, 88]);
	await h.fs.write('src/a.js', storage.subarray(1, 6));
	assert.deepEqual(await h.fs.read('src/a.js'), storage.slice(1, 6));
	await h.fs.write('src/a.js', '短');
	assert.equal(text(await h.fs.read('src/a.js')), '短');
	await h.fs.write('src/a.js', '');
	assert.equal((await h.fs.read('src/a.js')).length, 0);
	assert.equal(h.truncates.length, 3);
});

test('安卓完整更新：下载、备份、安装、状态提交都能处理成功事件并保留二进制', async () => {
	const old = await remote({ 'extension.js': 'long original entry' });
	const h = androidFS({ 'extension.js': 'long original entry', '.hh-update-state.json': JSON.stringify(old) });
	const contents = { 'extension.js': 'new', 'image/a.bin': new Uint8Array([0, 255, 128, 13, 10]) };
	await installUpdate(h.fs, await remote(contents), { fetcher: transport(contents) });
	assert.equal(text(await h.fs.read('extension.js')), 'new');
	assert.deepEqual(await h.fs.read('image/a.bin'), contents['image/a.bin']);
	assert.equal(await h.fs.exists('.hh-update/transaction.json'), false);
	assert.equal(JSON.parse(text(await h.fs.read('.hh-update-state.json'))).files['extension.js'], await gitBlobHash(bytes('new')));
});

for (const action of ['write', 'truncate']) {
	test(`安卓 ${action} 错误后仍触发 writeend：必须识别失败，并恢复旧文件`, async () => {
		const h = androidFS({ 'extension.js': 'original', 'src/a.js': 'old source' });
		let failed = false;
		h.state.fail = (operation, path) => {
			if (!failed && operation === action && path === 'extension.js') { failed = true; return { code: 10 }; }
		};
		const contents = { 'extension.js': 'new source', 'src/a.js': 'new', 'src/new.js': 'added' };
		await assert.rejects(installUpdate(h.fs, await remote(contents), { fetcher: transport(contents) }), /存储空间不足.*代码 10/);
		assert.equal(text(await h.fs.read('extension.js')), 'original');
		assert.equal(text(await h.fs.read('src/a.js')), 'old source');
		assert.equal(await h.fs.exists('src/new.js'), false);
		assert.equal(await h.fs.exists('.hh-update/transaction.json'), false);
	});
}

test('目录、读取和删除错误保留操作、路径和安卓错误码；不可读文件不能当成不存在', async () => {
	for (const [action, run] of [
		['get', fs => fs.exists('src/a.js')], ['directory', fs => fs.write('src/a.js', 'new')],
		['reader', fs => fs.read('src/a.js')], ['remove', fs => fs.remove('src/a.js')],
	]) {
		const h = androidFS({ 'src/a.js': 'old' });
		h.state.fail = operation => operation === action && { code: 2 };
		await assert.rejects(run(h.fs), /src\/a.js.*访问权限.*代码 2/);
		assert.equal(text(h.files.get(root + 'src/a.js')), 'old');
	}
});

test('非 Cordova 客户端：直接包装回调，兼容 writeend 成功事件、普通错误及短文件替换', async () => {
	const files = new Map([[root + 'a.js', bytes('long original source')]]);
	const game = {
		checkFile: (name, success) => success(files.has(name) ? 1 : -1), checkDir: (name, success) => success(-1),
		readFile: (name, success) => success(files.get(name)),
		writeFile(data, dir, name, callback) { files.set(dir + '/' + name, new Uint8Array(data)); callback({ type: 'writeend', target: { error: null } }); },
		removeFile(name, callback) { later(() => { files.delete(name); callback(); }); }, removeDir() {},
	};
	const fs = createGameFileSystem(game, {});
	await fs.write('a.js', 'short');
	assert.equal(text(await fs.read('a.js')), 'short');
	game.writeFile = (data, dir, name, callback) => callback({ code: 6 });
	await assert.rejects(fs.write('a.js', 'new'), /文件不可写.*代码 6/);
	for (const path of ['../outside', '/outside', 'C:/outside', 'a\\b', '']) await assert.rejects(fs.write(path, 'x'), /无效.*路径/);
});

test('APK内置资源更新写入可写覆盖层，不尝试删除只读的内置文件', async () => {
	const asset = bytes('original built-in source'), overlay = new Map();
	const game = {
		checkFile: (name, success) => success(name === root + 'extension.js' || overlay.has(name) ? 1 : -1),
		checkDir: (name, success) => success(-1),
		readFile: (name, success) => success(overlay.get(name) || asset),
		writeFile(data, dir, name, callback) { overlay.set(dir + '/' + name, new Uint8Array(data)); callback(); },
		removeFile(name, callback) { callback(Error('内置资源只读')); }, removeDir() {},
	};
	const fs = createGameFileSystem(game, {});
	await fs.write('extension.js', 'new');
	assert.equal(text(await fs.read('extension.js')), 'new');
	assert.equal(text(asset), 'original built-in source');
});

test('旧事务恢复失败不会再向扩展启动抛异常，错误内容不再是 undefined', async () => {
	const h = androidFS({ 'extension.js': 'unchanged', '.hh-update/transaction.json': JSON.stringify({
		phase: 'prepared', hadState: false, changes: [{ path: 'extension.js', existed: true }],
	}) });
	const error = await recoverPendingUpdate(h.game, h.environment);
	assert.ok(error instanceof Error);
	assert.match(error.message, /backup\/extension.js.*文件不存在.*代码 1/);
	assert.equal(text(await h.fs.read('extension.js')), 'unchanged');
	const source = readFileSync(new URL('../extension.js', import.meta.url), 'utf8')
		.replace(/^import .*;\r?\n/gm, '').replace("export const type = 'extension';", '')
		.replace('export default async function', 'globalThis.start = async function');
	const recoveryPack = { name: 'HH优化', config: {} };
	const context = vm.createContext({ lib: {}, game: h.game, ui: {}, _status: {},
		recoverPendingUpdate: async () => error, createRecoveryExtension: () => recoveryPack });
	vm.runInContext(source, context);
	assert.equal(await context.start(), recoveryPack, '返回修复模式，不能继续导入可能不完整的功能模块');
});

test('旧事务备份缺失或损坏时先停止，不覆盖任何现有文件；已完成事务清理失败不影响启动', async () => {
	const h = androidFS({ 'extension.js': 'still usable', 'src/a.js': 'still usable', '.hh-update/backup/extension.js': 'backup',
		'.hh-update/transaction.json': JSON.stringify({ phase: 'prepared', hadState: false,
			changes: [{ path: 'extension.js', existed: true }, { path: 'src/a.js', existed: true }] }),
	});
	await assert.rejects(recoverUpdate(h.fs), /文件不存在/);
	assert.equal(text(await h.fs.read('extension.js')), 'still usable');
	await h.fs.write('.hh-update/transaction.json', JSON.stringify({ phase: 'complete' }));
	h.state.fail = action => action === 'clean' && { code: 6 };
	assert.equal(await recoverUpdate(h.fs), false);
});

test('原生 FileError 和 ProgressEvent 都转换成可读原因', () => {
	assert.match(formatUpdateError({ code: 10 }), /空间不足.*10/);
	assert.match(formatUpdateError({ target: { error: { code: 6 } } }), /不可写.*6/);
	assert.doesNotMatch(formatUpdateError(undefined), /undefined/);
});
