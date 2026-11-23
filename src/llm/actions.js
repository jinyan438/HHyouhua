import { plain } from './perspective.js';

export const actionTool = { type: 'function', function: {
	name: 'game_action', description: '操作当前玩家的原生选择界面。每次返回最新合法选项。选牌/目标/按钮为切换选择；依次选择技能、牌、目标后 confirm。control/bool/skill_choice 直接提交；排序使用 move/swap 后 confirm。cancel 放弃响应或结束出牌；reset 退回技能选择。只使用 state 中的 id。',
	parameters: { type: 'object', properties: {
		action: { type: 'string', enum: ['inspect', 'card', 'target', 'button', 'skill', 'control', 'bool', 'skill_choice', 'numbers', 'move', 'swap', 'tap', 'confirm', 'cancel', 'reset'] },
		id: { type: 'string' }, other: { type: 'string' }, index: { type: 'integer' }, to: { type: 'integer' },
		value: { type: 'boolean' }, values: { type: 'array', items: { type: 'number' } },
	}, required: ['action'], additionalProperties: false },
} };

export function createActions(context, perspective, event, kind = 'selection') {
	const { lib, game, ui, get } = context;
	const player = event.player;
	const refs = new Map(), ids = new Map();
	let serial = 0, done = false, finalResult;
	const actions = [];
	const ref = (object, type) => {
		if (!ids.has(object)) { const id = type + ':' + (++serial); ids.set(object, id); refs.set(id, { object, type }); }
		return ids.get(object);
	};
	const range = value => (get.select?.(value) || [value ?? 1, value ?? 1]).map(number => Number.isFinite(number) ? number : 'unlimited');
	const selected = type => ui.selected[type + 's'] || [];
	const selectable = object => object?.classList?.contains('selectable') === true;
	const cards = () => event.filterCard ? player.getCards(event.position || 'h') : [];
	const buttons = () => event.filterButton ? event.dialog?.buttons || [] : [];
	const targets = () => event.filterTarget ? perspective.players() : [];
	const skills = () => !event.skill && !['cards', 'targets', 'buttons'].some(key => ui.selected[key]?.length) ?
		[...new Set([...(ui.skills?.skills || []), ...(ui.skills2?.skills || []), ...(ui.skills3?.skills || [])])] : [];
	const groups = kind === 'move' ? (event.name === 'chooseToMove_new' ? (event.list || []).flatMap(row => Array.isArray(row[0]) ? row : [row]) : event.list || []) : [];
	const links = row => get.itemtype?.(row[1]) === 'cards' || !Array.isArray(row[1]?.[0]) && row[1]?.[1] !== 'vcard' ? row[1] || [] : row[1][0];
	const moved = groups.map(row => [...links(row)]);
	const initial = moved.map(row => [...row]);
	const moveButtons = new Map(moved.flat().map(link => [link, { link }]));
	const skillChoices = kind === 'skill' ? typeof event.target === 'string' ? get.gainableSkillsName(event.target, event.func) : event.target.getGainableSkills(event.func) : [];
	function itemView(link, granted = false) {
		if (get.itemtype?.(link) === 'card' || link?.cardid) return perspective.cardView(link, player, granted);
		if (perspective.players().includes(link)) return { player: perspective.id(link) };
		if (Array.isArray(link)) return link.map(value => typeof value === 'string' ? { name: value, text: perspective.text(value), info: plain(lib.translate?.[value + '_info'] || '') } : value);
		return typeof link === 'string' ? { name: link, text: perspective.text(link), info: plain(lib.translate?.[link + '_info'] || '') } : null;
	}
	function state() {
		const base = { kind, event: event.name, type: event.type, prompt: plain(typeof event.prompt === 'function' ? event.prompt(event) : event.prompt || ''),
			prompt2: plain(event.prompt2 || ''), forced: !!event.forced,
			respondTo: event.respondTo ? { player: perspective.id(event.respondTo[0]), card: perspective.cardInfo(event.respondTo[1]) } : undefined,
			sourceCard: event._get_card ? perspective.cardInfo(event._get_card) : undefined };
		if (kind === 'control') return { ...base, controls: (event.controls || []).map((name, index) => ({ index, name, text: perspective.text(name), info: plain(event.choiceList?.[index] || lib.translate?.[name + '_info'] || '') })) };
		if (kind === 'bool') return { ...base, choices: [true, false] };
		if (kind === 'beatmap') return { ...base, beatmap: { name: plain(event.beatmap.name), timeleap: event.beatmap.timeleap, speed: event.beatmap.speed || 25,
			range1: event.beatmap.range1 || [90, 110], range2: event.beatmap.range2 || [93, 107], range3: event.beatmap.range3 || [96, 104] },
			input: '用 tap 的 values 提交按谱面毫秒坐标递增的点击时刻。每个音符在 timeleap[i] 出现，经过 speed*100 毫秒到达判定线；按原生时间窗口计算分数。' };
		if (kind === 'skill') return { ...base, skills: skillChoices.map(name => ({ id: name, ...perspective.skillDefinitions([name])[name] })) };
		if (kind === 'numbers') return { ...base, list: (event.list || []).map(spec => Array.isArray(spec) ? spec.filter(item => ['string', 'number'].includes(typeof item)) : { min: spec.min, max: spec.max, base: spec.base, prompt: plain(spec.prompt || '') }), values: event.numbers || [], optionSum: event.optionSum,
			filterSelect: event.filterSelect?.toString(), filterOk: event.filterOk?.toString() };
		if (kind === 'move') return { ...base, groups: moved.map((row, index) => ({ index, title: plain(groups[index][0]), items: row.map(link => ({ id: ref(link, 'item'), ...itemView(link, true) })) })),
			filterMove: event.filterMove?.toString(), filterOk: event.filterOk?.toString(), canConfirm: !event.filterOk || !!event.filterOk(moved) };
		const ok = game.check();
		return { ...base, currentSkill: event.skill, canConfirm: !!ok,
			selectCard: event.filterCard ? range(event.selectCard) : undefined,
			selectTarget: event.filterTarget ? range(event.selectTarget) : undefined,
			selectButton: event.filterButton ? range(event.selectButton) : undefined,
			cards: cards().map(card => ({ id: ref(card, 'card'), ...perspective.cardView(card, player), selected: selected('card').includes(card), available: selectable(card) })),
			targets: targets().map(target => ({ id: ref(target, 'target'), player: perspective.id(target), selected: selected('target').includes(target), available: selectable(target) })),
			buttons: buttons().map(button => ({ id: ref(button, 'button'),
				...(button.classList?.contains('blank') || button.classList?.contains('infohidden') ? { hidden: true } : { item: itemView(button.link, true) }),
				selected: selected('button').includes(button), available: selectable(button) })),
			skills: skills().map(name => ({ id: name, text: perspective.text(name), info: plain(lib.translate?.[name + '_info'] || '') })),
		};
	}
	function finish(result) { finalResult = result; done = true; }
	function reset() {
		if (kind === 'selection') {
			if (event.skill && !event.norestore) ui.click.cancel();
			game.uncheck();
			game.check();
		} else if (kind === 'move') moved.splice(0, moved.length, ...initial.map(row => [...row]));
	}
	function act(input) {
		if (done) throw new Error('此操作已经提交');
		if (!input || typeof input.action !== 'string') throw new Error('缺少 action');
		const { action } = input;
		if (action === 'inspect') return;
		if (action === 'reset') { reset(); actions.push({ action }); return; }
		if (action === 'cancel') {
			if (event.forced) throw new Error('此处必须完成选择');
			if (kind === 'control' && !event.controls.includes('cancel2')) throw new Error('此处没有取消选项');
			if (kind === 'selection') { if (event.skill && !event.norestore) ui.click.cancel(); ui.click.cancel(); finish(event.result); }
			else finish({ bool: false, ...(kind === 'control' ? { control: 'cancel2', index: event.controls.indexOf('cancel2') } : {}) });
		} else if (kind === 'control' && action === 'control') {
			if (!Number.isInteger(input.index) || !event.controls?.[input.index]) throw new Error('无效选项');
			finish({ bool: event.controls[input.index] !== 'cancel2', control: event.controls[input.index], index: input.index });
		} else if (kind === 'bool' && action === 'bool') {
			if (typeof input.value !== 'boolean') throw new Error('value 应为布尔值');
			finish({ bool: input.value });
		} else if (kind === 'beatmap' && action === 'tap') {
			finish(scoreBeatmap(event.beatmap, input.values));
		} else if (kind === 'skill' && action === 'skill_choice') {
			if (!skillChoices.includes(input.id)) throw new Error('此技能不可选');
			finish({ bool: true, skill: input.id });
		} else if (kind === 'numbers' && action === 'numbers') {
			const values = input.values;
			if (!Array.isArray(values) || values.length !== event.list.length) throw new Error('数值数量不正确');
			const previous = event.numbers;
			event.numbers = [...values];
			try {
				values.forEach((value, index) => {
					const spec = event.list[index];
					const legal = Array.isArray(spec) ? spec.filter(item => typeof item === 'number').includes(value) :
						Number.isFinite(value) && value >= (spec.min || 0) && value <= (spec.max || 9) && (value - (spec.min || 0)) % (spec.base || 1) === 0;
					if (!legal || event.filterSelect && !event.filterSelect(value, index, event)) throw new Error('数值不符合当前限制');
				});
				if (event.filterOk && !event.filterOk(event)) throw new Error('数值组合不合法');
				finish({ bool: true, numbers: [...values] });
			} finally { event.numbers = previous; }
		} else if (kind === 'move' && ['move', 'swap'].includes(action)) {
			const item = refs.get(input.id)?.object;
			const from = moved.findIndex(row => row.includes(item));
			if (from < 0) throw new Error('无效排序项');
			const at = moved[from].indexOf(item);
			if (action === 'swap') {
				const other = refs.get(input.other)?.object, to = moved.findIndex(row => row.includes(other));
				if (to < 0 || event.filterMove && !event.filterMove(moveButtons.get(item), moveButtons.get(other), moved)) throw new Error('不能交换这两项');
				const otherAt = moved[to].indexOf(other);
				moved[from][at] = other; moved[to][otherAt] = item;
			} else {
				const to = input.to, index = input.index ?? moved[to]?.length;
				if (!Number.isInteger(to) || !moved[to] || !Number.isInteger(index) || index < 0 || index > moved[to].length) throw new Error('无效位置');
				if (event.filterMove && !event.filterMove(moveButtons.get(item), to, moved)) throw new Error('不能移动到该区域');
				moved[from].splice(at, 1); moved[to].splice(index, 0, item);
			}
		} else if (kind === 'move' && action === 'confirm') {
			if (event.filterOk && !event.filterOk(moved)) throw new Error('排序尚未满足条件');
			finish({ bool: true, moved: moved.map(row => [...row]) });
		} else if (kind === 'selection') {
			game.check();
			if (action === 'skill') {
				if (!skills().includes(input.id)) throw new Error('此技能当前不可发动');
				ui.click.skill(input.id);
			} else if (['card', 'target', 'button'].includes(action)) {
				const entry = refs.get(input.id);
				if (!entry || entry.type !== action || !selectable(entry.object)) throw new Error('此选项当前不可选');
				const object = entry.object, list = selected(action), index = list.indexOf(object);
				if (typeof event.custom?.replace?.[action] === 'function') event.custom.replace[action](object);
				else {
					if (index >= 0) { list.splice(index, 1); object.classList.remove('selected'); }
					else { list.push(object); object.classList.add('selected'); }
					if (index >= 0 && (event.complexSelect || event.complexTarget || context._status.multitarget)) game.uncheck();
					object.updateTransform?.(index < 0);
					if (typeof event.custom?.add?.[action] === 'function') event.custom.add[action]();
				}
				game.check();
			} else if (action === 'confirm') {
				if (!game.check()) throw new Error('尚未满足选牌或目标条件');
				ui.click.ok(); finish(event.result);
			} else throw new Error('当前不支持该操作');
		} else throw new Error('当前不支持该操作');
		actions.push({ ...input });
	}
	return { state, act, reset, actions, get done() { return done; }, get result() { return finalResult; } };
}

// The same windows and weights as native chooseToPlayBeatmap. The model supplies
// input timestamps, never an accuracy or a result to write into the game.
export function scoreBeatmap(beatmap, taps) {
	const notes = beatmap.timeleap || [], speed = beatmap.speed || 25;
	if (!Array.isArray(taps) || taps.some((time, index) => !Number.isFinite(time) || index && time < taps[index - 1]) || taps.length > Math.max(1, notes.length) * 10) throw new Error('点击时刻必须为递增的有限数值');
	const range1 = beatmap.range1 || [90, 110], range2 = beatmap.range2 || [93, 107], range3 = beatmap.range3 || [96, 104];
	let index = 0, score = 0;
	for (const time of taps) {
		while (index < notes.length && (time - notes[index]) / speed > range1[1]) index++;
		if (index >= notes.length) break;
		const top = (time - notes[index]) / speed;
		if (top < range1[0]) continue;
		score += top >= range3[0] && top < range3[1] ? 5 : top >= range2[0] && top < range2[1] ? 3 : 1;
		index++;
	}
	const accuracy = notes.length ? Math.floor(score / (notes.length * 5) * 100) : 0;
	const rank = accuracy === 100 ? ['SS', 'metal'] : accuracy >= 94 ? ['S', 'orange'] : accuracy >= 87 ? ['A', 'wood'] : accuracy >= 80 ? ['B', 'water'] : accuracy >= 65 ? ['C', 'thunder'] : ['D', 'fire'];
	return { bool: true, accuracy, rank };
}
