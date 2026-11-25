import assert from 'node:assert/strict';
import test from 'node:test';
import { checkRemote, gitBlobHash, installUpdate, isManagedPath, planUpdate, recoverUpdate } from '../updater-core.js';

const bytes = value => new TextEncoder().encode(value);
const text = value => new TextDecoder().decode(value);
function memoryFS(initial = {}) {
	const files = new Map(Object.entries(initial).map(([path, value]) => [path, bytes(value)]));
	const fs = {
		files, writes: [], fail: null,
		exists: async path => files.has(path),
		async read(path) { if (!files.has(path)) throw Error('Missing: ' + path); return files.get(path).slice(); },
		async write(path, data) {
			if (fs.fail?.(path, data)) { fs.fail = null; throw Error('simulated write failure'); }
			fs.writes.push(path); files.set(path, typeof data === 'string' ? bytes(data) : data.slice());
		},
		async remove(path) { files.delete(path); },
		async clean() { for (const path of files.keys()) if (path.startsWith('.hh-update/')) files.delete(path); },
	};
	return fs;
}
async function revision(contents, commit = 'a'.repeat(40)) {
	return { commit, branch: 'codex/hh-updater', files: Object.fromEntries(await Promise.all(Object.entries(contents).map(async ([path, data]) => [path, await gitBlobHash(bytes(data))]))) };
}
const transport = contents => async url => {
	const path = decodeURIComponent(url.slice(url.indexOf('/' + 'a'.repeat(40) + '/') + 42));
	const value = contents[path];
	return { ok: value !== undefined, status: value !== undefined ? 200 : 404, arrayBuffer: async () => bytes(value).buffer };
};

test('Git blob校验与GitHub一致，路径限制保护Git目录和恢复记录', async () => {
	assert.equal(await gitBlobHash(bytes('hello\n')), 'ce013625030ba8dba906f756967f9e9ca394464a');
	for (const path of ['../outside', 'src/../../outside', '/absolute', 'C:/outside', 'src\\outside', '.git/config', '.hh-update/x', 'tests/a.mjs', 'update-manifest.json']) assert.equal(isManagedPath(path), false, path);
	assert.equal(isManagedPath('image/武将/a.png'), true);
});

test('检查更新使用远程默认分支和固定提交，拒绝截断清单', async () => {
	const sha = 'a'.repeat(40), calls = [];
	let truncated = false;
	const fetcher = async url => {
		calls.push(url);
		const data = url.includes('/git/trees/') ? { truncated, tree: ['extension.js', 'info.json', 'updater-core.js'].map(path => ({ path, sha, mode: '100644', type: 'blob' })) } : url.includes('/commits/') ? { sha } : { default_branch: 'codex/hh-updater' };
		return { ok: true, json: async () => data };
	};
	const remote = await checkRemote(fetcher);
	assert.equal(remote.commit, sha);
	assert.ok(calls[1].endsWith('/commits/codex%2Fhh-updater'));
	assert.ok(calls[2].includes('/git/trees/' + sha));
	truncated = true;
	await assert.rejects(checkRemote(fetcher), /不完整/);
});

test('只下载变化文件，删除已移除的托管文件，保留自定义文件和Git目录', async () => {
	const old = await revision({ 'extension.js': 'old entry', 'src/keep.js': 'keep', 'src/obsolete.js': 'old module' });
	const contents = { 'extension.js': 'new entry', 'src/keep.js': 'keep', 'src/new.js': 'new module' };
	const remote = await revision(contents);
	const fs = memoryFS({ ...{ 'extension.js': 'old entry', 'src/keep.js': 'keep', 'src/obsolete.js': 'old module' }, 'image/custom.png': 'personal', '.git/config': 'git config', 'update-manifest.json': JSON.stringify(old) });
	const downloads = [];
	const fetcher = async url => { downloads.push(url); return transport(contents)(url); };
	const plan = await installUpdate(fs, remote, { fetcher });
	assert.equal(downloads.length, 2);
	assert.equal(text(fs.files.get('extension.js')), 'new entry');
	assert.equal(text(fs.files.get('src/new.js')), 'new module');
	assert.equal(fs.files.has('src/obsolete.js'), false);
	assert.equal(text(fs.files.get('image/custom.png')), 'personal');
	assert.equal(text(fs.files.get('.git/config')), 'git config');
	assert.deepEqual(plan.removed, ['src/obsolete.js']);
	assert.equal(fs.writes.filter(path => !path.startsWith('.hh-update/') && path !== '.hh-update-state.json').at(-1), 'extension.js');
	assert.equal(JSON.parse(text(fs.files.get('.hh-update-state.json'))).commit, remote.commit);
	assert.equal([...fs.files.keys()].some(path => path.startsWith('.hh-update/')), false);
});

test('逐文件完成下载、写入及读回校验，安卓桥接不与下一个下载重叠', async () => {
	const contents = Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`assets/startup/video/${i}.mp4`, `media-${i}`]));
	const fs = memoryFS(), read = fs.read, write = fs.write, active = new Set(), progress = [];
	const turn = () => new Promise(resolve => setImmediate(resolve));
	let peak = 0;
	fs.write = async (path, data) => { await turn(); await write(path, data); };
	fs.read = async path => {
		await turn();
		const result = await read(path);
		if (path.startsWith('.hh-update/stage/')) active.delete(path.slice('.hh-update/stage/'.length));
		return result;
	};
	await installUpdate(fs, await revision(contents), { fetcher: async url => {
		const path = decodeURIComponent(url.split('/' + 'a'.repeat(40) + '/')[1]);
		active.add(path); peak = Math.max(peak, active.size);
		await turn(); return transport(contents)(url);
	}, onProgress: item => progress.push(item) });
	assert.equal(peak, 1, '上一个文件读回校验完成后才下载下一个');
	assert.equal(active.size, 0);
	const downloading = progress.filter(item => item.phase === 'download');
	assert.deepEqual(downloading[0], { phase: 'download', done: 0, total: 6, path: 'assets/startup/video/0.mp4' });
	assert.equal(downloading.at(-1).done, 6);
	assert.deepEqual(Object.keys(contents).map(path => text(fs.files.get(path))), Object.values(contents));
});

test('下载损坏时不修改当前扩展文件', async () => {
	const old = await revision({ 'extension.js': 'old entry' });
	const fs = memoryFS({ 'extension.js': 'old entry', 'update-manifest.json': JSON.stringify(old) });
	const remote = await revision({ 'extension.js': 'valid bytes' });
	await assert.rejects(installUpdate(fs, remote, { fetcher: async () => ({ ok: true, arrayBuffer: async () => bytes('corrupt bytes').buffer }) }), /校验失败/);
	assert.equal(text(fs.files.get('extension.js')), 'old entry');
	assert.equal(fs.files.has('.hh-update-state.json'), false);
	assert.equal([...fs.files.keys()].some(path => path.startsWith('.hh-update/')), false);
});

test('写入中途失败会恢复旧文件、删除新增文件并保留原安装提交', async () => {
	const old = await revision({ 'extension.js': 'old entry', 'src/a.js': 'old source' }, 'b'.repeat(40));
	const oldState = JSON.stringify(old);
	const fs = memoryFS({ 'extension.js': 'old entry', 'src/a.js': 'old source', '.hh-update-state.json': oldState });
	const contents = { 'extension.js': 'new entry', 'src/a.js': 'new source', 'src/b.js': 'new file' };
	fs.fail = path => path === 'extension.js';
	await assert.rejects(installUpdate(fs, await revision(contents), { fetcher: transport(contents) }), /write failure/);
	assert.equal(text(fs.files.get('extension.js')), 'old entry');
	assert.equal(text(fs.files.get('src/a.js')), 'old source');
	assert.equal(fs.files.has('src/b.js'), false);
	assert.equal(text(fs.files.get('.hh-update-state.json')), oldState);
});

test('提交安装状态后失败仍恢复原状态，避免误判更新已完成', async () => {
	const old = await revision({ 'extension.js': 'old entry' }, 'b'.repeat(40));
	const oldState = JSON.stringify(old);
	const fs = memoryFS({ 'extension.js': 'old entry', '.hh-update-state.json': oldState });
	fs.fail = (path, value) => path === '.hh-update/transaction.json' && typeof value === 'string' && value.includes('complete');
	await assert.rejects(installUpdate(fs, await revision({ 'extension.js': 'new entry' }), { fetcher: transport({ 'extension.js': 'new entry' }) }), /write failure/);
	assert.equal(text(fs.files.get('extension.js')), 'old entry');
	assert.equal(text(fs.files.get('.hh-update-state.json')), oldState);
});

test('下次启动恢复意外中断的更新', async () => {
	const fs = memoryFS({ 'extension.js': 'partially updated', 'src/new.js': 'new', '.hh-update/backup/extension.js': 'original', '.hh-update/transaction.json': JSON.stringify({ phase: 'prepared', hadState: false, changes: [{ path: 'extension.js', existed: true }, { path: 'src/new.js', existed: false }] }) });
	assert.equal(await recoverUpdate(fs), true);
	assert.equal(text(fs.files.get('extension.js')), 'original');
	assert.equal(fs.files.has('src/new.js'), false);
	assert.equal([...fs.files.keys()].some(path => path.startsWith('.hh-update/')), false);
});

test('相同文件清单不下载文件', async () => {
	const remote = await revision({ 'extension.js': 'same' });
	const fs = memoryFS({ 'extension.js': 'same', 'update-manifest.json': JSON.stringify(remote) });
	assert.deepEqual(planUpdate(remote, remote), { changed: [], removed: [] });
	await installUpdate(fs, remote, { fetcher: () => { throw Error('should not download'); } });
	assert.equal(text(fs.files.get('extension.js')), 'same');
});

test('暂存写入静默损坏时校验失败，不碰当前扩展文件', async () => {
	const fs = memoryFS({ 'extension.js': 'original' });
	const write = fs.write;
	fs.write = async (path, data) => write(path, path.startsWith('.hh-update/stage/') ? 'damaged' : data);
	await assert.rejects(installUpdate(fs, await revision({ 'extension.js': 'new' }), { fetcher: transport({ 'extension.js': 'new' }) }), /写入校验失败/);
	assert.equal(text(fs.files.get('extension.js')), 'original');
	assert.equal(fs.files.has('.hh-update-state.json'), false);
});

test('备份写入静默损坏时停止安装，原文件保持完整', async () => {
	const fs = memoryFS({ 'extension.js': 'original' });
	const write = fs.write;
	fs.write = async (path, data) => write(path, path.startsWith('.hh-update/backup/') ? 'damaged' : data);
	await assert.rejects(installUpdate(fs, await revision({ 'extension.js': 'new' }), { fetcher: transport({ 'extension.js': 'new' }) }), /写入校验失败/);
	assert.equal(text(fs.files.get('extension.js')), 'original');
	assert.equal(fs.files.has('.hh-update/transaction.json'), false);
});

test('安装覆盖静默损坏时恢复旧文件，不能报告安装成功', async () => {
	const fs = memoryFS({ 'extension.js': 'original' });
	const write = fs.write;
	let corrupt = true;
	fs.write = async (path, data) => {
		if (corrupt && path === 'extension.js') { corrupt = false; return write(path, 'damaged'); }
		return write(path, data);
	};
	await assert.rejects(installUpdate(fs, await revision({ 'extension.js': 'new' }), { fetcher: transport({ 'extension.js': 'new' }) }), /写入校验失败/);
	assert.equal(text(fs.files.get('extension.js')), 'original');
	assert.equal(fs.files.has('.hh-update-state.json'), false);
});

test('重启恢复前校验备份哈希，拒绝损坏备份且保留可用文件', async () => {
	const fs = memoryFS({ 'extension.js': 'still usable', '.hh-update/backup/extension.js': 'damaged',
		'.hh-update/transaction.json': JSON.stringify({ phase: 'prepared', hadState: false,
			changes: [{ path: 'extension.js', existed: true, hash: await gitBlobHash(bytes('original')) }] }),
	});
	await assert.rejects(recoverUpdate(fs), /恢复备份校验失败/);
	assert.equal(text(fs.files.get('extension.js')), 'still usable');
});

test('安装及恢复均失败时保留事务和备份供下次重试，显示普通 FileError 的原因', async () => {
	const fs = memoryFS({ 'extension.js': 'original' });
	const write = fs.write;
	fs.write = async (path, data) => {
		if (path === 'extension.js') throw { code: 6 };
		return write(path, data);
	};
	await assert.rejects(installUpdate(fs, await revision({ 'extension.js': 'new' }), { fetcher: transport({ 'extension.js': 'new' }) }), /文件不可写.*恢复尚未完成.*文件不可写/s);
	assert.equal(text(fs.files.get('.hh-update/backup/extension.js')), 'original');
	assert.equal(fs.files.has('.hh-update/transaction.json'), true);
	fs.write = write;
	assert.equal(await recoverUpdate(fs), true);
	assert.equal(text(fs.files.get('extension.js')), 'original');
});
