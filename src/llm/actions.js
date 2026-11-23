import { plain } from './perspective.js';

const stepProperties = {
	action: { type: 'string', enum: ['inspect', 'card', 'target', 'button', 'skill', 'control', 'bool', 'skill_choice', 'numbers', 'move', 'swap', 'tap', 'confirm', 'cancel', 'reset'] },
	id: { type: 'string' }, other: { type: 'string' }, index: { type: 'integer' }, to: { type: 'integer' },
	value: { type: 'boolean' }, values: { type: 'array', items: { type: 'number' } },
	reason: { type: 'string', maxLength: 160, description: '必须使用简体中文。少选、放弃或发动技能的简短权衡。发动须说明成本、后续由谁选择及净收益。可在 batch 顶层填写，由步骤继承；不保存进策略历史。' },
};
export const actionTool = { type: 'function', function: {
	name: 'game_action', description: '操作当前原生选择。优先 batch 一次提交有序步骤（选技能/牌、目标、confirm），逐步原生校验，出错停在该步；技能生成新按钮时再查看 state。目标也可用场面中的 seat:N。rules+id 按需查询可见技能代码；history 按 from（记录编号）、limit（1至8）、player、type 查询本座位完整历史。不要重复查询已在对话中的资料。',
	parameters: { type: 'object', properties: {
		...stepProperties,
		action: { type: 'string', enum: [...stepProperties.action.enum, 'batch', 'rules', 'history'] },
		actions: { type: 'array', minItems: 1, maxItems: 24, items: { type: 'object', properties: stepProperties, required: ['action'], additionalProperties: false } },
		from: { type: 'integer', minimum: 1 }, limit: { type: 'integer', minimum: 1, maximum: 8 }, player: { type: 'string' }, type: { type: 'string' },
		strategy: { type: 'string', maxLength: 400, description: '必须使用简体中文。可选的本座位后续策略摘要。仅记录目标、倾向和计划，不复述操作、代码或场面；策略未变可省略。' },
	}, required: ['action'], additionalProperties: false },
} };

export function createActions(context, perspective, event, kind = 'selection') {
	const { lib, game, ui, get } = context;
	const player = event.player;
	const decisionContext = perspective.choiceContext(event);
	const refs = new Map(), ids = new Map();
	let serial = 0, done = false, finalResult;
	const actions = [];
	const reviewedRules = new Set();
	function skillDescription(name) {
		const seen = new Set();
		for (; typeof name === 'string' && !seen.has(name) && seen.size < 12; name = lib.skill[name]?.sourceSkill) {
			seen.add(name);
			if (typeof lib.dynamicTranslate?.[name] === 'function') {
				try { const info = plain(lib.dynamicTranslate[name](player, name)); if (info.trim()) return info; } catch {}
			}
			const info = plain(lib.translate?.[name + '_info'] || '');
			if (info.trim()) return info;
		}
		return '';
	}
	function activation(skill) {
		if (skill === undefined) {
			if (['chooseToUse', 'chooseToRespond'].includes(event.name)) skill = event.skill;
			else if (!event.forced && decisionContext.skill?.owner === perspective.id(player)
				&& (['activation', 'cost'].includes(decisionContext.stage) || lib.skill[decisionContext.skill.id]?.direct === true)) skill = decisionContext.skill.id;
		}
		const chain = [], seen = new Set();
		for (let name = skill; typeof name === 'string' && lib.skill[name] && !seen.has(name) && chain.length < 12; name = lib.skill[name].sourceSkill) {
			seen.add(name); chain.push(name);
		}
		const limited = chain.find(name => lib.skill[name].limited === true);
		return chain.length ? { skill, ...(limited ? { limited } : {}),
			requiresRuleReview: limited || !skillDescription(skill) ? [...new Set([skill, limited].filter(Boolean))].filter(name => !reviewedRules.has(name)) : [], requiresReason: true } : undefined;
	}
	function requireActivation(input) {
		const check = activation();
		if (!check) return;
		if (check.requiresRuleReview.length) throw new Error('技能发动前须先用 rules+id 查询实现并在下一次请求阅读后再确认：' + check.requiresRuleReview.join('、'));
		requireReason(input, '技能发动须说明付出的资源、后续选择权归属及对手按自身利益选择后的净收益，并与不发动比较');
	}
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
	function selectionDetails(type, items) {
		const raw = get.select(event['select' + type[0].toUpperCase() + type.slice(1)]);
		const count = selected(type).length, maximum = raw[1];
		return { min: raw[0], max: maximum < 0 ? 'all' : Number.isFinite(maximum) ? maximum : 'unlimited', selected: count,
			additionalAvailable: items.filter(item => selectable(item) && !selected(type).includes(item)).length,
			remainingCapacity: maximum < 0 ? 0 : Number.isFinite(maximum) ? Math.max(0, maximum - count) : 'unlimited' };
	}
	function partialSelection() {
		return [['card', cards()], ['target', targets()], ['button', buttons()]].filter(([type]) => event['filter' + type[0].toUpperCase() + type.slice(1)])
			.map(([type, items]) => ({ type, ...selectionDetails(type, items) }))
			.filter(item => item.additionalAvailable > 0 && (item.remainingCapacity === 'unlimited' || item.remainingCapacity > 0));
	}
	function requireReason(input, message) {
		if (typeof input.reason !== 'string' || !input.reason.trim()) throw new Error(message + '；如已权衡并有意这样选择，请在 reason 写明简短原因');
	}
	const skills = () => !event.skill && !['cards', 'targets', 'buttons'].some(key => ui.selected[key]?.length) ?
		[...new Set([...(ui.skills?.skills || []), ...(ui.skills2?.skills || []), ...(ui.skills3?.skills || [])])] : [];
	function skillView(name) {
		const check = activation(name);
		return { id: name, text: perspective.text(name), info: skillDescription(name), ...(check ? { activation: check } : {}) };
	}
	const groups = kind === 'move' ? (event.name === 'chooseToMove_new' ? (event.list || []).flatMap(row => Array.isArray(row[0]) ? row : [row]) : event.list || []) : [];
	const links = row => get.itemtype?.(row[1]) === 'cards' || !Array.isArray(row[1]?.[0]) && row[1]?.[1] !== 'vcard' ? row[1] || [] : row[1][0];
	const moved = groups.map(row => [...links(row)]);
	const initial = moved.map(row => [...row]);
	const moveButtons = new Map(moved.flat().map(link => [link, { link }]));
	const skillChoices = kind === 'skill' ? typeof event.target === 'string' ? get.gainableSkillsName(event.target, event.func) : event.target.getGainableSkills(event.func) : [];
	// Native AI checks and submits within one tick. Keep the same presentation
	// across model requests: selection arrays retain the decision, DOM classes do not.
	const selectionNodes = () => new Set([
		...perspective.players(), ...player.getCards('hejsx'), ...(event.dialog?.buttons || []),
		...Object.values(ui.selected).flat(), ...ids.keys(),
	]);
	function withoutSelectionUI(callback) {
		if (kind !== 'selection') return callback();
		const nodes = selectionNodes();
		for (const list of Object.values(ui.selected)) for (const item of list) item.classList?.add('selected');
		try { return callback(); }
		finally {
			for (const item of selectionNodes()) nodes.add(item);
			for (const item of nodes) item.classList?.remove('selected', 'selectable', 'un-selectable');
		}
	}
	function itemView(link, granted = false) {
		if (get.itemtype?.(link) === 'card' || link?.cardid) return perspective.cardView(link, player, granted);
		if (perspective.players().includes(link)) return { player: perspective.id(link) };
		if (Array.isArray(link)) return link.map(value => typeof value === 'string' ? { name: value, text: perspective.text(value), info: plain(lib.translate?.[value + '_info'] || '') } : value);
		return typeof link === 'string' ? { name: link, text: perspective.text(link), info: plain(lib.translate?.[link + '_info'] || '') } : null;
	}
	function state() {
		const base = { kind, event: event.name, type: event.type, prompt: plain(typeof event.prompt === 'function' ? event.prompt(event) : event.prompt || ''),
			prompt2: plain(event.prompt2 || ''), forced: !!event.forced,
			context: decisionContext, declineRequiresReason: !!decisionContext.skill && !event.forced,
			activation: activation(),
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
		const currentCard = get.card?.();
		return { ...base, activation: activation(), currentSkill: event.skill, currentSkillInfo: event.skill ? skillView(event.skill) : undefined,
			currentCard: currentCard ? perspective.cardInfo(currentCard) : undefined, canConfirm: !!ok,
			partialConfirmRequiresReason: !!ok && partialSelection().length > 0,
			selection: Object.fromEntries([['card', cards()], ['target', targets()], ['button', buttons()]]
				.filter(([type]) => event['filter' + type[0].toUpperCase() + type.slice(1)])
				.map(([type, items]) => [type + 's', selectionDetails(type, items)])),
			selectCard: event.filterCard ? range(event.selectCard) : undefined,
			selectTarget: event.filterTarget ? range(event.selectTarget) : undefined,
			selectButton: event.filterButton ? range(event.selectButton) : undefined,
			cards: cards().map(card => ({ id: ref(card, 'card'), ...perspective.cardView(card, player), selected: selected('card').includes(card), available: selectable(card) })),
			targets: targets().map(target => ({ id: ref(target, 'target'), player: perspective.id(target), selected: selected('target').includes(target), available: selectable(target) })),
			buttons: buttons().map(button => ({ id: ref(button, 'button'),
				...(get.itemtype?.(button.link) === 'card' || button.link?.cardid ? { owner: perspective.id(get.owner?.(button.link)), zone: get.position?.(button.link, true) } : {}),
				...(button.classList?.contains('blank') || button.classList?.contains('infohidden') ? { hidden: true } : { item: itemView(button.link, true) }),
				selected: selected('button').includes(button), available: selectable(button) })),
			skills: skills().map(skillView),
		};
	}
	function finish(result, input) {
		if (result?.bool !== false) requireActivation(input);
		finalResult = result; done = true;
	}
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
		if (input.reason !== undefined && (typeof input.reason !== 'string' || input.reason.length > 160)) throw new Error('reason 应为不超过 160 字的简短原因');
		const { action } = input;
		if (action === 'batch') {
			if (!Array.isArray(input.actions) || !input.actions.length || input.actions.length > 24 || input.actions.some(step => !step || !stepProperties.action.enum.includes(step.action))) throw new Error('batch 需要 1 至 24 个普通操作步骤');
			let applied = 0;
			for (const step of input.actions) {
				if (done) break;
				try { act({ ...step, reason: step.reason ?? input.reason }); applied++; }
				catch (error) { throw new Error(`第 ${applied + 1} 步失败，前 ${applied} 步已执行：${error.message}。请依据最新 state 继续`); }
			}
			return { applied, submitted: done };
		}
		if (action === 'inspect') return;
		if (action === 'reset') { reset(); actions.push({ action }); return; }
		if (action === 'cancel') {
			if (event.forced) throw new Error('此处必须完成选择');
			if (decisionContext.skill) requireReason(input, '当前是技能相关选择，取消会放弃这次机会');
			if (kind === 'control' && !event.controls.includes('cancel2')) throw new Error('此处没有取消选项');
			if (kind === 'selection') { if (event.skill && !event.norestore) ui.click.cancel(); ui.click.cancel(); finish(event.result, input); }
			else finish({ bool: false, ...(kind === 'control' ? { control: 'cancel2', index: event.controls.indexOf('cancel2') } : {}) }, input);
		} else if (kind === 'control' && action === 'control') {
			if (!Number.isInteger(input.index) || !event.controls?.[input.index]) throw new Error('无效选项');
			if (decisionContext.skill && !event.forced && /^cancel/.test(event.controls[input.index])) requireReason(input, '此选项将放弃当前技能机会');
			finish({ bool: event.controls[input.index] !== 'cancel2', control: event.controls[input.index], index: input.index }, input);
		} else if (kind === 'bool' && action === 'bool') {
			if (typeof input.value !== 'boolean') throw new Error('value 应为布尔值');
			if (decisionContext.skill && input.value === false && !event.forced) requireReason(input, '此选择将放弃当前技能机会');
			finish({ bool: input.value }, input);
		} else if (kind === 'beatmap' && action === 'tap') {
			finish(scoreBeatmap(event.beatmap, input.values), input);
		} else if (kind === 'skill' && action === 'skill_choice') {
			if (!skillChoices.includes(input.id)) throw new Error('此技能不可选');
			finish({ bool: true, skill: input.id }, input);
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
				finish({ bool: true, numbers: [...values] }, input);
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
			finish({ bool: true, moved: moved.map(row => [...row]) }, input);
		} else if (kind === 'selection') {
			game.check();
			if (action === 'skill') {
				if (!skills().includes(input.id)) throw new Error('此技能当前不可发动');
				ui.click.skill(input.id);
			} else if (['card', 'target', 'button'].includes(action)) {
				const target = action === 'target' && targets().find(target => perspective.id(target) === input.id);
				const entry = refs.get(input.id) || (target ? { type: 'target', object: target } : null);
				if (!entry || entry.type !== action || !selectable(entry.object)) throw new Error('此选项当前不可选');
				const object = entry.object, list = selected(action), index = list.indexOf(object);
				if (typeof event.custom?.replace?.[action] === 'function') event.custom.replace[action](object);
				else {
					if (index >= 0) { list.splice(index, 1); object.classList.remove('selected'); }
					else { list.push(object); object.classList.add('selected'); }
					if (index >= 0 && (event.complexSelect || event.complexTarget || context._status.multitarget)) game.uncheck();
					if (typeof event.custom?.add?.[action] === 'function') event.custom.add[action]();
				}
				game.check();
			} else if (action === 'confirm') {
				if (!game.check()) throw new Error('尚未满足选牌或目标条件');
				requireActivation(input);
				const remaining = partialSelection();
				if (remaining.length) requireReason(input, '已满足最低数量，但仍可继续选择：' + remaining.map(item => `${item.type} 已选 ${item.selected}，上限 ${item.max}，另有 ${item.additionalAvailable} 个可选项`).join('；'));
				ui.click.ok(); finish(event.result, input);
			} else throw new Error('当前不支持该操作');
		} else throw new Error('当前不支持该操作');
		actions.push({ ...input });
	}
	return { state: () => withoutSelectionUI(state), act: input => withoutSelectionUI(() => act(input)),
		reviewRules: names => { for (const name of names) reviewedRules.add(name); },
		reset: () => withoutSelectionUI(reset), actions, get done() { return done; }, get result() { return finalResult; } };
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
