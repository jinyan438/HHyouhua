import { checkRemote, formatUpdateError, installUpdate, loadInstalled, markInstalled, planUpdate, readRemoteInfo, recoverUpdate } from './updater-core.js';
import { createGameFileSystem } from './updater-fs.js';
export { createGameFileSystem } from './updater-fs.js';

export async function recoverPendingUpdate(game, environment = globalThis) {
	if (typeof game.readFile !== 'function' || typeof game.writeFile !== 'function') return;
	try { await recoverUpdate(createGameFileSystem(game, environment)); }
	catch (error) { return new Error(formatUpdateError(error)); }
}

export function createRecoveryExtension(lib, game, ui, status, error) {
	const info = { name: 'HH优化', version: '恢复模式', intro: '更新恢复未完成，HH优化已暂停加载。请用离线完整包修复。' };
	console.error('[HH优化] 更新恢复失败，已暂停扩展加载：', error);
	return {
		name: 'HH优化', editable: false, package: info,
		config: {
			recovery_notice: { name: info.intro, clear: true },
			...updateConfig(lib, game, ui, status, info),
		},
	};
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
		message.textContent = formatUpdateError(error);
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
				await installUpdate(fs, remote, { onProgress({ phase, done, total, path }) {
					progress.max = total || 1; progress.value = done;
					message.textContent = `${phase === 'download' ? '正在下载' : '正在安装'} ${done}/${total}\n${path.split('/').pop()}`;
				} });
				progress.hidden = true; message.textContent = `已更新到 ${remoteInfo.version}，重启游戏后生效。`;
				button('重启游戏', () => game.reload()); button('稍后', close);
			} catch (error) { showError(error); }
		});
		button('暂不更新', close);
	} catch (error) { if (overlay.isConnected) showError(error); }
}
