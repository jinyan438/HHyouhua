import { battleRecordRules, exportBattleReplay } from './battleRecordData.js';

export function createBattleRecord(context, environment = {}) {
	const { lib, game } = context;
	const env = { document: globalThis.document, window: globalThis.window, ...environment };
	const path = `${lib.assetURL || ''}extension/HH优化/assets/battle-record/`;
	let session, savedRecord;
	const likes = new Set();
	function element(tag, className, parent, text) {
		const node = env.document.createElement(tag); node.className = className;
		if (text !== undefined) node.textContent = text;
		parent.appendChild(node); return node;
	}
	function image(name, className, parent, label = '') {
		const node = element('img', className, parent); node.src = path + name + '.png'; node.alt = label;
		if (!label) node.setAttribute('aria-hidden', 'true');
		return node;
	}
	function close() {
		if (!session) return;
		const current = session; session = null;
		env.window?.removeEventListener('resize', current.resize); current.root.remove();
		if (current.underlay?.isConnected) {
			current.underlay.inert = current.wasInert;
			if (current.wasHidden === null) current.underlay.removeAttribute('aria-hidden');
			else current.underlay.setAttribute('aria-hidden', current.wasHidden);
		}
		if (current.focus?.isConnected) current.focus.focus?.({ preventScroll: true });
	}
	function show(record, underlay) {
		if (session || !record) return false;
		if (record !== savedRecord) { likes.clear(); savedRecord = record; }
		const focus = env.document.activeElement;
		const root = element('div', 'hh-battle-record', env.document.body);
		root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', '战绩'); root.tabIndex = -1;
		const current = session = { root, focus, underlay, wasInert: underlay?.inert, wasHidden: underlay?.getAttribute('aria-hidden') ?? null };
		if (underlay) { underlay.inert = true; underlay.setAttribute('aria-hidden', 'true'); }
		const stage = element('div', 'hh-record-stage', root);
		image('zhanji_title', 'hh-record-title', stage);
		const sheet = element('div', 'hh-record-sheet', stage);
		const header = element('div', 'hh-record-header', sheet); header.setAttribute('role', 'row');
		const summary = element('div', 'hh-record-summary', header);
		element('span', '', summary, record.modeName); element('span', '', summary, `轮数:${record.rounds}`);
		const time = element('span', 'hh-record-duration', summary);
		image('zhanji_time', '', time);
		element('span', '', time, `${String(Math.floor(record.duration / 60)).padStart(2, '0')}:${String(record.duration % 60).padStart(2, '0')}`);
		for (const text of ['击杀数', '伤害分', '治疗分', '辅助分']) element('span', 'hh-record-heading', header, text);
		const rulesButton = element('button', 'hh-record-heading hh-record-rules-button', header, '总评分'); rulesButton.type = 'button'; rulesButton.title = '查看 HH 本地计分规则';
		const table = element('div', 'hh-record-table', sheet); table.setAttribute('role', 'table'); table.setAttribute('aria-label', '本局战绩'); sheet.tabIndex = 0;
		const likeButtons = [];
		function refreshLikes() {
			for (const { row, button } of likeButtons) {
				button.classList.toggle('hh-record-liked', likes.has(row.id)); button.setAttribute('aria-pressed', String(likes.has(row.id)));
				button.title = likes.has(row.id) ? '已在本局点赞' : '本局本地点赞';
			}
		}
		for (const result of ['win', 'lose', 'tie', 'unknown']) {
			const rows = record.rows.filter(row => row.result === result); if (!rows.length) continue;
			const group = element('div', `hh-record-group hh-record-${result}`, table);
			const banner = element('div', 'hh-record-banner', group);
			banner.setAttribute('aria-label', { win: '胜利方', lose: '失败方', tie: '平局', unknown: '胜负未定' }[result]);
			if (result === 'win' || result === 'lose') image(`zhanji_left_img_${result}`, '', banner);
			else element('span', '', banner, result === 'tie' ? '平' : '—');
			const body = element('div', 'hh-record-rows', group);
			for (const row of rows) {
				const line = element('div', `hh-record-row${row.self ? ' hh-record-self' : ''}`, body); line.setAttribute('role', 'row');
				const player = element('div', 'hh-record-player', line); player.setAttribute('role', 'cell');
				const avatar = element('div', 'hh-record-avatar', player); avatar.style.backgroundImage = row.avatar;
				if (!row.avatar) avatar.setBackground?.(row.character, 'character');
				element('div', `hh-record-name${row.mvp ? ' hh-record-best' : ''}`, player, row.name);
				element('div', 'hh-record-general', player, row.general);
				const badge = record.mode === 'doudizhu' ? { zhu: 'figure_fightlord_1_new', fan: 'figure_fightlord_3_new' }[row.identity]
					: record.mode === 'identity' ? { zhu: 'figure_1_new', zhong: 'figure_2_new', fan: 'figure_3_new', nei: 'figure_4_new' }[row.identity]
					: record.mode === 'guozhan' && ['wei', 'shu', 'wu', 'qun', 'jin'].includes(row.group) ? `zj_gz_country_${{ wei: 1, shu: 2, wu: 3, qun: 4, jin: 6 }[row.group]}` : null;
				if (badge) image(badge, 'hh-record-identity', player, row.identityName);
				else element('span', 'hh-record-identity-text', player, row.identityName);
				for (const value of [row.kills, row.damage, row.heal, row.assist]) {
					const cell = element('div', 'hh-record-number', line, String(value)); cell.setAttribute('role', 'cell');
				}
				const rating = element('div', `hh-record-number hh-record-rating${row.mvp ? ' hh-record-mvp' : ''}`, line); rating.setAttribute('role', 'cell');
				if (row.mvp) { image('zhanji_mvp', '', rating); element('span', '', rating, row.rating); rating.setAttribute('aria-label', `MVP 总评分 ${row.rating}`); }
				else rating.textContent = row.rating;
				if (!row.self) {
					const button = element('button', 'hh-record-like', line); button.type = 'button'; button.setAttribute('aria-label', `点赞 ${row.name}`);
					button.addEventListener('click', event => { event.stopPropagation(); likes.add(row.id); refreshLikes(); }); likeButtons.push({ row, button });
				}
			}
		}
		const hint = element('button', 'hh-record-continue', stage, '点击空白处继续'); hint.type = 'button';
		const status = element('div', 'hh-record-status', stage); status.setAttribute('role', 'status');
		const actions = element('div', 'hh-record-actions', stage);
		if (likeButtons.length) {
			const all = element('button', 'hh-record-action hh-record-like-all', actions); all.type = 'button'; all.setAttribute('aria-label', '一键点赞'); all.title = '本局本地点赞';
			all.addEventListener('click', () => { for (const { row } of likeButtons) likes.add(row.id); refreshLikes(); });
		}
		const canSave = typeof game.export === 'function' && typeof lib.init?.encode === 'function' && lib.video?.length && !context._status?.video;
		if (canSave) {
			const save = element('button', 'hh-record-action hh-record-save', actions); save.type = 'button'; save.setAttribute('aria-label', '保存录像');
			save.addEventListener('click', () => {
				try { status.textContent = exportBattleReplay(context, record) ? '已导出本局录像' : '本局录像不可用'; }
				catch (error) { status.textContent = '录像导出失败，请重试'; console.warn('[HH优化] 战绩录像导出失败', error); }
			});
		}
		let rules;
		function closeRules() { rules?.remove(); rules = null; rulesButton.focus?.(); }
		rulesButton.addEventListener('click', () => {
			if (rules) return closeRules();
			rules = element('div', 'hh-record-rules', stage); rules.setAttribute('role', 'dialog'); rules.setAttribute('aria-label', 'HH 本地计分规则');
			rules.addEventListener('click', event => event.stopPropagation());
			const dismiss = element('button', 'hh-record-rules-close', rules, '关闭'); dismiss.type = 'button'; dismiss.addEventListener('click', closeRules);
			for (const text of battleRecordRules) element('p', '', rules, text);
			dismiss.focus?.();
		});
		for (const node of [sheet, actions]) node.addEventListener('click', event => event.stopPropagation());
		stage.addEventListener('click', event => { if (rules?.contains(event.target)) event.stopPropagation(); });
		root.addEventListener('click', () => { if (rules) closeRules(); else close(); });
		root.addEventListener('keydown', event => {
			event.stopPropagation();
			if (event.key === 'Escape') { event.preventDefault(); if (rules) closeRules(); else close(); }
			else if ((event.key === 'Enter' || event.key === ' ') && event.target === root) { event.preventDefault(); close(); }
		});
		current.resize = () => {
			const rect = root.getBoundingClientRect(), width = root.clientWidth || rect.width, height = root.clientHeight || rect.height;
			root.classList.toggle('hh-record-portrait', width < height);
			const scale = Math.min(width / (width < height ? 700 : 1650), height / 750);
			stage.style.setProperty('--record-scale', String(scale));
			stage.style.setProperty('--record-height', `${height / scale}px`);
		};
		current.resize(); refreshLikes(); env.window?.addEventListener('resize', current.resize); root.focus?.({ preventScroll: true });
		return true;
	}
	return { show, close, get active() { return !!session; }, reset() { close(); savedRecord = null; likes.clear(); } };
}
