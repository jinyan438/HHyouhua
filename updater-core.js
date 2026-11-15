export const repository = 'jinyan438/HHyouhua';
const api = `https://api.github.com/repos/${repository}`;
const journalPath = '.hh-update/transaction.json';
const statePath = '.hh-update-state.json';

export function formatUpdateError(error) {
	const detail = error?.target?.error || error?.error || error;
	if (typeof detail?.message === 'string' && detail.message) return detail.message;
	if (typeof detail === 'string' && detail && detail !== 'undefined') return detail;
	const reasons = { 1: '文件不存在', 2: '没有文件访问权限', 3: '操作已中断', 4: '文件无法读取', 5: '文件编码错误',
		6: '文件不可写', 7: '文件正在写入或状态无效', 8: '文件路径无效', 9: '不允许修改此文件', 10: '存储空间不足', 11: '文件类型不匹配', 12: '文件已存在' };
	if (detail?.code !== undefined) return `${reasons[detail.code] || '文件操作失败'}（代码 ${detail.code}）`;
	return '文件操作失败，请检查存储空间和文件访问权限。';
}

async function writeVerified(fs, path, data) {
	await fs.write(path, data);
	const expected = typeof data === 'string' ? new TextEncoder().encode(data) : data;
	const actual = await fs.read(path);
	if (actual.length !== expected.length || actual.some((byte, index) => byte !== expected[index])) {
		throw new Error(`写入校验失败：${path}，文件内容与预期不一致。`);
	}
}

export function isManagedPath(path) {
	if (typeof path !== 'string' || !path || /[\\:\x00-\x1f]/.test(path)) return false;
	const parts = path.split('/');
	if (parts.some(part => !part || part.startsWith('.') || /[. ]$/.test(part))) return false;
	if (['tools', 'tests', 'docs', 'node_modules'].includes(parts[0])) return false;
	return path !== 'update-manifest.json';
}

export async function gitBlobHash(data) {
	const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
	const header = new TextEncoder().encode(`blob ${bytes.byteLength}\0`);
	const blob = new Uint8Array(header.length + bytes.length);
	blob.set(header); blob.set(bytes, header.length);
	return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-1', blob)), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function request(fetcher, url, options, timeout, consume) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeout);
	try { return await consume(await fetcher(url, { ...options, signal: controller.signal })); }
	finally { clearTimeout(timer); }
}

async function getJSON(fetcher, url) {
	return request(fetcher, url, { cache: 'no-store', headers: { Accept: 'application/vnd.github+json' } }, 30000, async response => {
		if (!response.ok) throw new Error(response.status === 403 || response.status === 429 ? 'GitHub 请求次数受限，请稍后重试。' : `读取远程仓库失败（HTTP ${response.status}）。`);
		return response.json();
	});
}

export async function checkRemote(fetcher = fetch) {
	const repo = await getJSON(fetcher, api);
	if (!repo.default_branch) throw new Error('远程仓库还没有默认分支。');
	const head = await getJSON(fetcher, `${api}/commits/${encodeURIComponent(repo.default_branch)}`);
	if (!/^[a-f0-9]{40}$/.test(head.sha)) throw new Error('远程提交信息无效。');
	const tree = await getJSON(fetcher, `${api}/git/trees/${head.sha}?recursive=1`);
	if (tree.truncated || !Array.isArray(tree.tree)) throw new Error('远程文件清单不完整，已停止更新。');
	const files = {};
	for (const item of tree.tree) {
		if (item.type !== 'blob' || !isManagedPath(item.path)) continue;
		if (!['100644', '100755'].includes(item.mode) || !/^[a-f0-9]{40}$/.test(item.sha)) throw new Error(`不支持的远程文件：${item.path}`);
		files[item.path] = item.sha;
	}
	if (!files['extension.js'] || !files['info.json'] || !files['updater-core.js']) throw new Error('远程仓库缺少HH优化扩展入口。');
	return { commit: head.sha, branch: repo.default_branch, message: head.commit?.message?.split('\n')[0] || '', files };
}

async function readJSON(fs, path, fallback) {
	return await fs.exists(path) ? JSON.parse(new TextDecoder().decode(await fs.read(path))) : fallback;
}

export async function loadInstalled(fs) {
	return await readJSON(fs, statePath, null) || await readJSON(fs, 'update-manifest.json', { files: {} });
}

export function planUpdate(installed, remote) {
	const previous = installed.files || {};
	return {
		changed: Object.keys(remote.files).filter(path => isManagedPath(path) && previous[path] !== remote.files[path]),
		removed: Object.keys(previous).filter(path => isManagedPath(path) && !Object.hasOwn(remote.files, path)),
	};
}

export async function markInstalled(fs, remote) {
	await writeVerified(fs, statePath, JSON.stringify({ commit: remote.commit, branch: remote.branch, files: remote.files }));
}

async function downloadFile(fetcher, remote, path) {
	const suffix = `${remote.commit}/${path.split('/').map(encodeURIComponent).join('/')}`;
	const urls = [`https://raw.githubusercontent.com/${repository}/${suffix}`, `https://cdn.jsdelivr.net/gh/${repository}@${suffix}`];
	let lastError;
	for (const url of urls) {
		try {
			const bytes = await request(fetcher, url, { cache: 'no-store' }, 60000, async response => {
				if (!response.ok) throw new Error(`HTTP ${response.status}`);
				return new Uint8Array(await response.arrayBuffer());
			});
			if (await gitBlobHash(bytes) !== remote.files[path]) throw new Error('文件校验失败');
			return bytes;
		} catch (error) { lastError = error; }
	}
	throw new Error(`下载失败：${path}（${formatUpdateError(lastError)}）`);
}

export async function readRemoteInfo(remote, fetcher = fetch) {
	const info = JSON.parse(new TextDecoder().decode(await downloadFile(fetcher, remote, 'info.json')));
	if (info.name !== 'HH优化' || typeof info.version !== 'string') throw new Error('远程扩展信息无效。');
	return info;
}

async function restore(fs, journal) {
	for (const item of journal.changes) {
		if (!item || !isManagedPath(item.path) || typeof item.existed !== 'boolean') throw new Error('更新恢复清单无效。');
	}
	// 先检查全部备份，避免缺少某一备份时已经覆盖了一部分可用文件。
	for (const item of journal.changes) {
		if (!item.existed) continue;
		const backup = await fs.read(`.hh-update/backup/${item.path}`);
		if (item.hash && await gitBlobHash(backup) !== item.hash) throw new Error(`恢复备份校验失败：${item.path}`);
	}
	if (journal.hadState) await fs.read('.hh-update/previous-state.json');
	for (const item of journal.changes) {
		if (item.existed) await writeVerified(fs, item.path, await fs.read(`.hh-update/backup/${item.path}`));
		else if (await fs.exists(item.path)) await fs.remove(item.path);
	}
	if (journal.hadState) await writeVerified(fs, statePath, await fs.read('.hh-update/previous-state.json'));
	else if (await fs.exists(statePath)) await fs.remove(statePath);
	await fs.clean();
}

export async function recoverUpdate(fs) {
	const journal = await readJSON(fs, journalPath, null);
	if (!journal) return false;
	if (journal.phase === 'complete') {
		try { await fs.clean(); } catch { /* 已验证安装成功，缓存清理失败不应阻止游戏启动。 */ }
		return false;
	}
	if (journal.phase !== 'prepared' || !Array.isArray(journal.changes)) throw new Error('更新恢复记录无效。');
	await restore(fs, journal);
	return true;
}

export async function installUpdate(fs, remote, { fetcher = fetch, onProgress = () => {} } = {}) {
	await recoverUpdate(fs);
	const installed = await loadInstalled(fs);
	const plan = planUpdate(installed, remote);
	if (!plan.changed.length && !plan.removed.length) { await markInstalled(fs, remote); return plan; }
	let completed = 0, cursor = 0, journal, committed = false;
	try {
		// Finish every download and verify its pinned Git blob before touching installed files.
		const workers = Array.from({ length: Math.min(4, plan.changed.length) }, async () => {
			while (cursor < plan.changed.length) {
				const path = plan.changed[cursor++];
				await writeVerified(fs, `.hh-update/stage/${path}`, await downloadFile(fetcher, remote, path));
				onProgress({ phase: 'download', done: ++completed, total: plan.changed.length, path });
			}
		});
		const results = await Promise.allSettled(workers);
		const failed = results.find(result => result.status === 'rejected');
		if (failed) throw failed.reason;
		journal = { phase: 'prepared', changes: [], hadState: await fs.exists(statePath) };
		if (journal.hadState) await writeVerified(fs, '.hh-update/previous-state.json', await fs.read(statePath));
		for (const path of [...plan.changed, ...plan.removed]) {
			const existed = await fs.exists(path);
			let hash;
			if (existed) {
				const original = await fs.read(path);
				hash = await gitBlobHash(original);
				await writeVerified(fs, `.hh-update/backup/${path}`, original);
			}
			journal.changes.push({ path, existed, ...(hash ? { hash } : {}) });
		}
		await writeVerified(fs, journalPath, JSON.stringify(journal));
		const rank = path => path === 'extension.js' ? 3 : path === 'updater.js' || path === 'updater-core.js' ? 2 : path === 'info.json' ? 1 : 0;
		const ordered = [...plan.changed].sort((a, b) => rank(a) - rank(b));
		completed = 0;
		for (const path of ordered) {
			const staged = await fs.read(`.hh-update/stage/${path}`);
			if (await gitBlobHash(staged) !== remote.files[path]) throw new Error(`暂存文件校验失败：${path}`);
			await writeVerified(fs, path, staged);
			onProgress({ phase: 'install', done: ++completed, total: ordered.length, path });
		}
		for (const path of plan.removed) if (await fs.exists(path)) await fs.remove(path);
		await markInstalled(fs, remote);
		await writeVerified(fs, journalPath, JSON.stringify({ ...journal, phase: 'complete' }));
		committed = true;
		try { await fs.clean(); } catch { /* A completed journal can be cleaned on the next launch. */ }
		return plan;
	} catch (error) {
		if (journal && !committed && await fs.exists(journalPath)) {
			try { await restore(fs, journal); }
			catch (recoveryError) { throw new Error(`${formatUpdateError(error)}\n恢复尚未完成：${formatUpdateError(recoveryError)}。请使用离线完整包修复扩展。`); }
		} else if (!journal) {
			try { await fs.clean(); } catch { /* Staged downloads never modify installed files. */ }
		}
		throw new Error(formatUpdateError(error));
	}
}
