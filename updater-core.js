export const repository = 'jinyan438/HHyouhua';
const api = `https://api.github.com/repos/${repository}`;
const journalPath = '.hh-update/transaction.json';
const statePath = '.hh-update-state.json';

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
	await fs.write(statePath, JSON.stringify({ commit: remote.commit, branch: remote.branch, files: remote.files }));
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
	throw new Error(`下载失败：${path}（${lastError?.message || '网络异常'}）`);
}

export async function readRemoteInfo(remote, fetcher = fetch) {
	const info = JSON.parse(new TextDecoder().decode(await downloadFile(fetcher, remote, 'info.json')));
	if (info.name !== 'HH优化' || typeof info.version !== 'string') throw new Error('远程扩展信息无效。');
	return info;
}

async function restore(fs, journal) {
	for (const item of journal.changes) {
		if (!isManagedPath(item.path) || typeof item.existed !== 'boolean') throw new Error('更新恢复清单无效。');
	}
	for (const item of journal.changes) {
		if (item.existed) await fs.write(item.path, await fs.read(`.hh-update/backup/${item.path}`));
		else if (await fs.exists(item.path)) await fs.remove(item.path);
	}
	if (journal.hadState) await fs.write(statePath, await fs.read('.hh-update/previous-state.json'));
	else if (await fs.exists(statePath)) await fs.remove(statePath);
	await fs.clean();
}

export async function recoverUpdate(fs) {
	const journal = await readJSON(fs, journalPath, null);
	if (!journal) return false;
	if (journal.phase === 'complete') { await fs.clean(); return false; }
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
				await fs.write(`.hh-update/stage/${path}`, await downloadFile(fetcher, remote, path));
				onProgress({ phase: 'download', done: ++completed, total: plan.changed.length, path });
			}
		});
		const results = await Promise.allSettled(workers);
		const failed = results.find(result => result.status === 'rejected');
		if (failed) throw failed.reason;
		journal = { phase: 'prepared', changes: [], hadState: await fs.exists(statePath) };
		if (journal.hadState) await fs.write('.hh-update/previous-state.json', await fs.read(statePath));
		for (const path of [...plan.changed, ...plan.removed]) {
			const existed = await fs.exists(path);
			if (existed) await fs.write(`.hh-update/backup/${path}`, await fs.read(path));
			journal.changes.push({ path, existed });
		}
		await fs.write(journalPath, JSON.stringify(journal));
		const rank = path => path === 'extension.js' ? 3 : path === 'updater.js' || path === 'updater-core.js' ? 2 : path === 'info.json' ? 1 : 0;
		const ordered = [...plan.changed].sort((a, b) => rank(a) - rank(b));
		completed = 0;
		for (const path of ordered) {
			await fs.write(path, await fs.read(`.hh-update/stage/${path}`));
			onProgress({ phase: 'install', done: ++completed, total: ordered.length, path });
		}
		for (const path of plan.removed) if (await fs.exists(path)) await fs.remove(path);
		await markInstalled(fs, remote);
		await fs.write(journalPath, JSON.stringify({ ...journal, phase: 'complete' }));
		committed = true;
		try { await fs.clean(); } catch { /* A completed journal can be cleaned on the next launch. */ }
		return plan;
	} catch (error) {
		if (journal && !committed && await fs.exists(journalPath)) {
			try { await restore(fs, journal); }
			catch (recoveryError) { throw new Error(`${error.message}\n恢复尚未完成，请重启游戏重试：${recoveryError.message}`); }
		} else if (!journal) {
			try { await fs.clean(); } catch { /* Staged downloads never modify installed files. */ }
		}
		throw error;
	}
}
