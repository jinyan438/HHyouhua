import { createMvpEffects } from '../effects/mvpEffects.js';
import { createGameResultFlow } from './gameResultFlow.js';
import { returnToSettlementLobby } from './settlementLobby.js';
import { collectMvpScores, collectBattleRecord } from './battleRecordData.js';
import { createBattleRecord } from './battleRecord.js';

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

// Snapshot once at game over. Reopening never changes player scores or arrays.
export function collectMvpResult(game) {
	return collectMvpScores(game).sort((a, b) => b.score - a.score)[0] || null;
}

export function mvpLayout(width, height) {
	const portrait = width < height;
	const scale = portrait ? Math.min(width / 640, height / 1020) : Math.min(width / 1450, height / 750);
	const center = width / 2, middle = portrait ? 330 * scale : height / 2;
	return {
		width, height,
		scale,
		card: { x: center - 210.5 * scale, y: middle - 270 * scale, width: 421 * scale, height: 540 * scale },
		border: { x: center + scale, y: middle + 7 * scale },
		title: { x: portrait ? center : center + 375 * scale, y: portrait ? 690 * scale : middle - 126 * scale },
		score: { x: portrait ? center - 100 * scale : center + 390 * scale, y: portrait ? 742 * scale : middle - 58 * scale },
		info: { x: portrait ? center - 229 * scale : center + 218 * scale, y: portrait ? 830 * scale : middle + 7 * scale },
	};
}

export function createMvpSettlement({ lib, game, ui, get, _status }, environment = {}) {
	const env = {
		document: globalThis.document, window: globalThis.window, now: () => performance.now(),
		setTimer: (callback, ms) => setTimeout(callback, ms), clearTimer: id => clearTimeout(id),
		createEffects: createMvpEffects, ...environment,
	};
	const assetPath = `${lib.assetURL || ''}extension/HH优化/assets/mvp-fullscreen/`;
	let session = null, result, record, started = env.now();
	const records = createBattleRecord({ lib, game, ui, get, _status }, { document: env.document, window: env.window });
	let leaving = false;
	function returnToLobby() {
		if (leaving) return;
		leaving = true;
		try { (env.returnToLobby || returnToSettlementLobby)({ lib, game, ui, _status }, env.window); }
		catch (error) { leaving = false; console.error('[HH优化] 返回大厅失败', error); show(); }
	}
	const resultFlow = createGameResultFlow({ lib, game, ui, _status }, {
		onContinue() { if (!show()) returnToLobby(); }, onGameOver: onover,
		onViewRecords(root) { records.show(record, root); },
	}, { document: env.document, window: env.window, now: env.now, ...environment.resultEnvironment });
	function element(tag, className, parent, text) {
		const node = env.document.createElement(tag); node.className = className;
		if (text !== undefined) node.textContent = text;
		parent?.appendChild(node); return node;
	}
	function close() {
		records.close();
		if (!session) { _status.showHHMvp = false; return; }
		const current = session; session = null;
		env.clearTimer(current.voiceTimer); current.effects?.stop();
		for (const audio of current.audio) { audio?.pause?.(); audio?.remove?.(); }
		env.window?.removeEventListener('resize', current.resize);
		current.root.remove(); _status.showHHMvp = false;
		if (current.focus?.isConnected) current.focus.focus?.({ preventScroll: true });
	}
	function updateMonthlyCount(player) {
		if (player !== game.me || _status.video) return null;
		const date = new Date(), month = `${date.getFullYear()}-${date.getMonth() + 1}`;
		const saved = lib.config.extension_HH优化_mvp_month;
		const count = (saved?.month === month ? Math.max(0, Math.trunc(finite(saved.count))) : 0) + 1;
		const value = { month, count }; lib.config.extension_HH优化_mvp_month = value;
		Promise.resolve(game.saveConfig?.('extension_HH优化_mvp_month', value)).catch(error => console.warn('[HH优化] MVP 次数保存失败', error));
		return count;
	}
	function show() {
		if (session || _status.showHHMvp || !result || resultFlow.active || leaving) return false;
		const { player, rating } = result;
		const focus = env.document.activeElement;
		const root = element('div', 'hh-mvp-screen', env.document.body);
		root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', '全场最佳'); root.tabIndex = -1;
		const current = session = { root, audio: [], focus, opened: env.now() };
		const viewRecords = element('button', 'hh-result-records', root, '查看战绩'); viewRecords.type = 'button';
		viewRecords.addEventListener('click', event => { event.stopPropagation(); records.show(record, root); });
		viewRecords.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') event.stopPropagation(); });
		_status.showHHMvp = true;
		const card = element('div', 'hh-mvp-portrait', root);
		const id = player.name1 || player.name;
		const avatar = player.node?.avatar;
		// The live portrait preserves extension skins and DB/blob images.
		card.style.backgroundImage = avatar?.style?.backgroundImage || '';
		if (!card.style.backgroundImage) card.setBackground?.(player.skin?.name || id, 'character');
		card.setAttribute('role', 'img'); card.setAttribute('aria-label', get.translation(id));
		const border = element('div', 'hh-mvp-border-fallback', root);
		const title = element('div', 'hh-mvp-title-fallback', root); title.setAttribute('aria-hidden', 'true');
		const score = element('div', 'hh-mvp-score', root);
		element('span', 'hh-mvp-score-label', score, '总评分'); element('span', 'hh-mvp-score-value', score, rating);
		const info = element('div', 'hh-mvp-user', root);
		const head = element('div', 'hh-mvp-head', info); head.style.backgroundImage = card.style.backgroundImage;
		const nickname = player === game.me ? lib.config.connect_nickname || get.translation(id) : player.nickname || get.translation(id);
		element('div', 'hh-mvp-name', info, nickname);
		if (nickname !== get.translation(id)) element('div', 'hh-mvp-general', info, get.translation(id));
		if (result.monthlyCount) element('div', 'hh-mvp-month', root, `本月第${result.monthlyCount}次`);
		element('div', 'hh-mvp-continue', root, '点击继续');
		const canvas = element('canvas', 'hh-mvp-effects', root); canvas.setAttribute('aria-hidden', 'true');
		let layout;
		const place = (node, x, y, width, height) => Object.assign(node.style, { left: `${x}px`, top: `${y}px`, ...(width === undefined ? {} : { width: `${width}px`, height: `${height}px` }) });
		current.resize = () => {
			// HH scales body with CSS zoom. DOM positions use local CSS pixels,
			// whereas getBoundingClientRect() already includes that zoom.
			const bounds = root.getBoundingClientRect();
			layout = mvpLayout(root.clientWidth || bounds.width, root.clientHeight || bounds.height); const s = layout.scale;
			root.style.setProperty('--mvp-unit', `${s}px`);
			place(card, layout.card.x, layout.card.y, layout.card.width, layout.card.height);
			place(border, layout.border.x - 512 * s, layout.border.y - 512 * s, 1024 * s, 1024 * s);
			place(title, layout.title.x - 159 * s, layout.title.y - 77 * s, 320 * s, 157 * s);
			place(score, layout.score.x, layout.score.y);
			place(info, layout.info.x, layout.info.y, 458 * s, 118 * s);
		};
		current.resize(); env.window?.addEventListener('resize', current.resize);
		const continueGame = event => {
			event.stopPropagation();
			if (session !== current || leaving || records.active) return;
			if (event.type === 'keydown' && !['Escape', 'Enter', ' '].includes(event.key)) return;
			if (env.now() - current.opened >= 1500) { event.preventDefault(); close(); returnToLobby(); }
		};
		root.addEventListener('click', continueGame); root.addEventListener('keydown', continueGame); root.focus?.({ preventScroll: true });
		try {
			current.effects = env.createEffects(canvas, assetPath, () => layout);
			Promise.resolve(current.effects.start()).catch(error => console.warn('[HH优化] MVP 动画启动失败', error));
		} catch (error) { console.warn('[HH优化] MVP 使用静态结算', error); }
		current.audio.push(game.playAudio({ path: 'ext:HH优化/assets/mvp-fullscreen/ui_quanchangzuijia.ogg', addVideo: false, video: true }));
		current.voiceTimer = env.setTimer(() => {
			if (session !== current) return;
			const skills = (player.getSkills?.() || player.skills || []).filter(skill => lib.skill[skill]?.audio);
			if (skills.length) current.audio.push(game.trySkillAudio(skills[Math.floor(Math.random() * skills.length)], player, true, true));
		}, 1400);
		return true;
	}
	function onover(outcome) {
		if (lib.config.test_game) return;
		if (record) return false;
		const scores = collectMvpScores(game);
		record = collectBattleRecord({ lib, game, get, _status }, outcome, env.now() - started, scores);
		result = scores.sort((a, b) => b.score - a.score)[0] || null;
		if (result) result.monthlyCount = updateMonthlyCount(result.player);
		return resultFlow.show(outcome);
	}
	lib.onover.push(onover);
	return { show, close() { close(); resultFlow.stop(); }, onover,
		reset() { close(); resultFlow.reset(); records.reset(); result = null; record = null; leaving = false; started = env.now(); } };
}
