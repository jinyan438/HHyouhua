import { checkRemote, installUpdate, loadInstalled, markInstalled, planUpdate, readRemoteInfo, recoverUpdate } from './updater-core.js';

export function createGameFileSystem(game) {
	if (!['readFile', 'writeFile', 'checkFile', 'removeFile', 'removeDir'].every(key => typeof game[key] === 'function')) {
		throw new Error('当前环境未开放文件读写，无法安装更新。请使用支持文件访问的无名杀客户端。');
	}
	const root = 'extension/HH优化/';
	const path = value => {
		if (typeof value !== 'string' || /[\\:\x00-\x1f]/.test(value) || value.split('/').some(part => !part || part === '..' || part === '.')) throw new Error('无效的更新文件路径。');
		return root + value;
	};
	return {
		exists: async value => await game.promises.checkFile(path(value)) === 1,
		read: async value => new Uint8Array(await game.promises.readFile(path(value))),
		write: async (value, data) => {
			const target = path(value), split = target.lastIndexOf('/');
			await game.promises.writeFile(data, target.slice(0, split), target.slice(split + 1));
		},
		remove: value => game.promises.removeFile(path(value)),
		clean: async () => {
			if (await game.promises.checkDir(root + '.hh-update') === 1) await game.promises.removeDir(root + '.hh-update');
		},
	};
}

export async function recoverPendingUpdate(game) {
	if (typeof game.readFile !== 'function' || typeof game.writeFile !== 'function') return;
	await recoverUpdate(createGameFileSystem(game));
}

let activePanel;
export function updateConfig(lib, game, ui, status, info) {
	return {
		remote_update: {
			name: '检查扩展更新',
			clear: true,
			onclick() { showUpdater(lib, game, ui, status, info); },
		},
	};
}

export async function showUpdater(lib, game, ui, status, localInfo) {
	if (activePanel?.isConnected) return;
	if (!document.getElementById('hh-updater-style')) {
		const link = document.createElement('link');
		link.id = 'hh-updater-style'; link.rel = 'stylesheet';
		link.href = `${lib.assetURL}extension/HH优化/updater.css`;
		document.head.appendChild(link);
	}
	const overlay = document.createElement('div');
	overlay.className = 'hh-updater-overlay';
	overlay.innerHTML = '<div class="hh-updater" role="dialog" aria-label="HH优化更新"><div class="hh-updater-title">HH优化更新</div><div class="hh-updater-status" role="status" aria-live="polite">正在检查更新…</div><progress class="hh-updater-progress"></progress><div class="hh-updater-actions"></div></div>';
	activePanel = overlay;
	(ui.window || document.body).appendChild(overlay);
	const message = overlay.querySelector('.hh-updater-status');
	const progress = overlay.querySelector('progress');
	const actions = overlay.querySelector('.hh-updater-actions');
	const paused = !!status.paused2;
	if (!paused) game.pause2?.();
	const close = () => { overlay.remove(); if (!paused) game.resume2?.(); };
	const button = (label, action) => {
		const node = document.createElement('button');
		node.type = 'button'; node.textContent = label; node.addEventListener('click', action);
		actions.appendChild(node); return node;
	};
	const showError = error => {
		message.textContent = error.message || String(error);
		progress.hidden = true; actions.replaceChildren(); button('关闭', close);
	};
	button('关闭', close);
	try {
		const fs = createGameFileSystem(game);
		await recoverUpdate(fs);
		const remote = await checkRemote();
		const remoteInfo = await readRemoteInfo(remote);
		const plan = planUpdate(await loadInstalled(fs), remote);
		if (!overlay.isConnected) return;
		progress.hidden = true; actions.replaceChildren();
		if (!plan.changed.length && !plan.removed.length) {
			await markInstalled(fs, remote);
			message.textContent = `已是最新版本 ${remoteInfo.version}`;
			button('关闭', close); return;
		}
		message.textContent = `发现可用更新\n${localInfo.version} → ${remoteInfo.version}\n需要下载 ${plan.changed.length} 个文件`;
		button('现在更新', async () => {
			actions.replaceChildren(); progress.hidden = false; progress.removeAttribute('value');
			message.textContent = '准备下载更新…';
			try {
				await installUpdate(fs, remote, { onProgress({ phase, done, total }) {
					progress.max = total || 1; progress.value = done;
					message.textContent = `${phase === 'download' ? '正在下载' : '正在安装'} ${done}/${total}`;
				} });
				progress.hidden = true; message.textContent = `已更新到 ${remoteInfo.version}，重启游戏后生效。`;
				button('重启游戏', () => game.reload()); button('稍后', close);
			} catch (error) { showError(error); }
		});
		button('暂不更新', close);
	} catch (error) { if (overlay.isConnected) showError(error); }
}
