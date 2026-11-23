import { bindDialogButton, isolateDialogInput } from './dialog.js';

const EVENT_NAMES = { chooseToUse: '出牌 / 用牌', chooseToRespond: '响应', chooseBool: '是否发动', chooseControl: '选择效果',
	chooseToDiscard: '弃牌', chooseTarget: '选择目标', chooseCard: '选牌', chooseButton: '选择', choosePlayerCard: '选择角色的牌',
	discardPlayerCard: '弃置角色的牌', gainPlayerCard: '获得角色的牌', chooseToGive: '交牌', chooseCardTarget: '选牌与目标',
	chooseButtonTarget: '选项与目标', chooseToMove: '移牌', chooseToMove_new: '移牌', chooseNumbers: '选择数值', chooseSkill: '选择技能', chooseToPlayBeatmap: '演奏' };
const STATUS_NAMES = { pending: '等待模型…', received: '已返回', complete: '继续选择', submitted: '已提交', repair: '待修正', cancelled: '已取消', error: '请求失败' };
const RESOLUTIONS = { ai: '本次由原生AI完成', retry: '已重试', disable: '已关闭接管', cancelled: '已取消' };

export function renderLLMRecords({ lib, game, ui, get }, { node, bigbg, historybg, columnbox }) {
	const journal = game.hhLLM?.journal;
	node.classList.add('hh-llm-records');
	const title = ui.create.div('.hh-llm-record-title', bigbg); title.textContent = 'LLM记录';
	const content = ui.create.div('.hh-llm-record-list', historybg);
	content.setAttribute('role', 'log'); content.setAttribute('aria-label', '大模型输出记录');
	isolateDialogInput(columnbox); isolateDialogInput(historybg);
	let selected = null, firstId = 0;
	const seatButtons = new Map();
	const seatNames = new Map();
	function seatLabel(seat) { return seatNames.get(seat) || `${seat}号位`; }
	function textBlock(parent, label, text, className = '') {
		if (!text) return;
		const block = ui.create.div('.hh-llm-record-text', parent);
		if (className) block.classList.add(className);
		if (label) { const heading = ui.create.div('.hh-llm-record-label', block); heading.textContent = label; }
		const value = ui.create.div('.hh-llm-record-value', block); value.textContent = text;
	}
	function operationText(input, labels) {
		if (!input || typeof input !== 'object') return '无效操作';
		const label = value => {
			const name = labels[value] || value;
			return typeof name === 'string' && /^seat:\d+$/.test(name) ? seatLabel(Number(name.slice(5))) : name || '未知选项';
		};
		const translate = name => lib.translate?.[name] || name || '未知技能';
		switch (input.action) {
			case 'batch': return (input.actions || []).map(step => operationText(step, labels)).join(' → ');
			case 'card': return '选牌：' + label(input.id);
			case 'target': return '目标：' + label(input.id);
			case 'button': return '选项：' + label(input.id);
			case 'skill': case 'skill_choice': return '技能：' + translate(input.id);
			case 'control': return '选择：' + (labels['control:' + input.index] || input.index);
			case 'bool': return input.value ? '同意 / 发动' : '拒绝 / 不发动';
			case 'confirm': return '确认';
			case 'cancel': return '取消 / 结束出牌';
			case 'reset': return '重选';
			case 'inspect': return '查看当前选择';
			case 'rules': return '核查技能：' + translate(input.id);
			case 'history': return '查阅牌局记录' + (input.from ? `（从第${input.from}条）` : '');
			case 'numbers': return '数值：' + (input.values || []).join('、');
			case 'move': return '移动：' + label(input.id) + ` → 第${Number(input.to) + 1}组`;
			case 'swap': return '交换：' + label(input.id) + ' ↔ ' + label(input.other);
			case 'tap': return '演奏：' + (input.values || []).length + '次点击';
			default: return input.action || '模型输出';
		}
	}
	function renderEntry(entry) {
		const item = ui.create.div('.hh-llm-record-entry', content); item.dataset.recordId = String(entry.id);
		const heading = ui.create.div('.hh-llm-record-heading', item);
		heading.textContent = `第${entry.round}轮 · #${entry.request} · ${seatLabel(entry.seat)} · ${EVENT_NAMES[entry.event] || '选择'}`;
		let jsonOutput = false;
		try { jsonOutput = typeof JSON.parse(entry.content).action === 'string'; } catch {}
		if (!jsonOutput) textBlock(item, '输出', entry.content);
		const reasons = new Set(), strategies = new Set();
		function collect(input) {
			if (typeof input?.reason === 'string' && input.reason.trim()) reasons.add(input.reason.trim());
			if (typeof input?.strategy === 'string' && input.strategy.trim()) strategies.add(input.strategy.trim());
			if (Array.isArray(input?.actions)) input.actions.forEach(collect);
		}
		entry.operations.forEach(operation => collect(operation.input));
		textBlock(item, '判断', [...reasons].join('\n'));
		for (const operation of entry.operations) {
			const suffix = operation.outcome.ok ? operation.outcome.submitted ? '（已提交）' : '（成功）' : '（未完成）';
			textBlock(item, '操作', operationText(operation.input, operation.labels) + suffix);
			textBlock(item, '', operation.outcome.error, 'hh-llm-record-error');
		}
		textBlock(item, '策略', [...strategies].join('\n'));
		textBlock(item, '', entry.error, 'hh-llm-record-error');
		const status = ui.create.div('.hh-llm-record-status', item);
		status.textContent = RESOLUTIONS[entry.resolution] || STATUS_NAMES[entry.status] || entry.status;
		if (entry.output?.length || entry.content) {
			const details = document.createElement('details'); details.className = 'hh-llm-record-raw';
			const summary = document.createElement('summary'); summary.textContent = '原始输出'; details.appendChild(summary);
			const raw = document.createElement('pre'); raw.textContent = entry.output?.length ? JSON.stringify(entry.output, null, 2) : entry.content;
			details.appendChild(raw); item.appendChild(details);
		}
	}
	function render(reset = false, earlier = false) {
		const oldTop = content.scrollTop, oldHeight = content.scrollHeight;
		const follow = reset || oldHeight - oldTop - content.clientHeight < 48;
		const entries = journal?.read(selected, firstId ? earlier ? { before: firstId, limit: 40 } : { after: firstId - 1 } : { limit: 40 }) || [];
		if (earlier && entries.length) firstId = entries[0].id;
		else if (!firstId) firstId = entries[0]?.id || 0;
		const visible = earlier ? journal.read(selected, { after: firstId - 1 }) : entries;
		const open = new Set(Array.from(content.querySelectorAll('details')).filter(details => details.open).map(details => details.parentNode.dataset.recordId));
		content.textContent = '';
		if (firstId && journal.read(selected, { before: firstId, limit: 1 }).length) {
			const more = document.createElement('button'); more.className = 'hh-llm-record-more'; more.textContent = '更早记录';
			bindDialogButton(more, () => render(false, true)); content.appendChild(more);
		}
		if (!visible.length) textBlock(content, '', '暂无LLM记录');
		visible.forEach(renderEntry);
		for (const details of content.querySelectorAll('details')) details.open = open.has(details.parentNode.dataset.recordId);
		content.scrollTop = follow ? content.scrollHeight : earlier ? oldTop + content.scrollHeight - oldHeight : oldTop;
	}
	function option(seat, label) {
		const row = ui.create.div('.namebg', columnbox), background = ui.create.div('.namebgbg', row);
		const checkbox = ui.create.div('.jiluanniu', row), name = ui.create.div('.name', background); name.textContent = label;
		row.setAttribute('role', 'button'); row.tabIndex = 0; seatButtons.set(seat, { row, checkbox });
		const select = () => {
			selected = seat; firstId = 0;
			for (const [id, item] of seatButtons) { item.checkbox.textContent = ''; item.row.setAttribute('aria-pressed', String(id === seat)); }
			ui.create.div('.gou', checkbox); render(true);
		};
		bindDialogButton(row, select);
		row.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); } });
		return select;
	}
	const all = option(null, '全部');
	const seats = new Map((journal?.seats() || []).map(item => [item.seat, item.generals.join(' / ')]));
	for (const player of [...(game.players || []), ...(game.dead || [])]) {
		const seat = Number(player.getSeatNum?.());
		const names = [player.name1 || player.name, player.name2].filter((name, index) => name && (player === game.me || !player.isUnseen?.(index)));
		if (seat) seats.set(seat, names.map(name => get.translation(name)).join(' / ') || '未知武将');
	}
	for (const [seat, name] of [...seats].sort(([a], [b]) => a - b)) {
		const number = seat === 2 ? '二' : get.cnNumber?.(seat) || seat;
		seatNames.set(seat, `${name}（${number}号位）`); option(seat, seatLabel(seat));
	}
	all();
	node._hhLLMCleanup = journal?.subscribe(() => { const latest = journal.read(selected, { limit: 1 })[0]; if (!latest || latest.id < firstId) firstId = 0; render(); });
}
