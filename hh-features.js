import { originalCardStylePriority } from "./src/ui/originalCards.js";
import { createKillComboPlayer } from './src/effects/killCombo.js';
import { setupSourceCardAudio } from './src/audio/sourceCardAudio.js';
import { setupRescueFlow } from './src/features/rescueFlow.js';
import { setupLordBlindShot } from './src/features/lordBlindShot.js';
import { setupEquipMove } from './src/features/equipMove.js';
import { setupSettlementOptimization } from './src/features/settlementOptimization.js';
import { getPlayerStyleSizing } from './src/ui/playerStyleSizing.js';

export function createHHFeatures(lib, game, ui, get, ai, _status) {
	const HH_finishSkill = function(skill) {
		if (!lib.skill[skill]) return;
		try {
			if (typeof game.finishSkill == 'function') {
				game.finishSkill(skill);
			} else if (skill[0] == '_' && typeof game.addGlobalSkill == 'function') {
				game.addGlobalSkill(skill);
			}
		} catch (e) {
			console.warn('[HH优化] 注册技能失败:', skill, e);
		}
	};
	const HH_finishSkills = function(skills) {
		skills.forEach(HH_finishSkill);
	};
	const HH_getConfig = function(config, key, defaultValue) {
		if (config && config[key] !== undefined) return config[key];
		const savedValue = lib.config[`extension_HH优化_${key}`];
		return savedValue !== undefined ? savedValue : defaultValue;
	};
	return {
		name: "HH优化",
		editable: false,
		content: function (config, pack) {
			// 获取用户设置的速度倍率
			const getSpeedMultiplier = function() {
				const multiplier = lib.config.extension_HH优化_speed_multiplier;
				// 如果是数字直接返回，如果是字符串则解析
				if (typeof multiplier === 'number') {
					return multiplier;
				}
				return multiplier ? parseFloat(multiplier) : 1;
			};

			// 扩展游戏速度的 delayx 函数
			const originalDelayx = game.delayx;
			game.delayx = function(time = 1, time2 = 0) {
				const multiplier = getSpeedMultiplier();
				time *= multiplier;
				return game.delay(time, time2);
			};

			// 扩展 get 函数中的速度计算
			const originalGetDelayx = get.delayx;
			if (originalGetDelayx) {
				get.delayx = function(num, max) {
					const multiplier = getSpeedMultiplier();
					if (max === undefined) {
						max = Infinity;
					}
					return Math.min(max, multiplier * num);
				};
			}
			setupSettlementOptimization({ lib, game, get, _status }, config);

			// ========== AI模拟真人思考延迟 ==========
			const HH_parseNumberConfig = function(key, defaultValue, min, max) {
				let value = lib.config['extension_HH优化_' + key];
				if (typeof value === 'string') value = value.replace(/<br>/g, '').trim();
				value = parseFloat(value);
				if (isNaN(value)) value = defaultValue;
				return Math.max(min, Math.min(max, value));
			};
			const HH_sleep = function(time) {
				return new Promise(resolve => setTimeout(resolve, time));
			};
			const HH_AI_THINK_EVENTS = [
				'chooseToUse',
				'chooseUseTarget',
				'chooseToRespond',
				'chooseCard',
				'chooseTarget',
				'chooseButton',
				'choosePlayerCard',
				'discardPlayerCard',
				'gainPlayerCard',
				'chooseToDiscard',
				'chooseCardTarget',
				'chooseButtonTarget',
				'chooseControl',
				'chooseBool',
				'chooseToGive',
				'chooseToMove',
				'chooseToMove_new',
				'chooseNumbers',
				'chooseSkill',
				'chooseDrawRecover',
				'chooseToEnable',
				'chooseToDisable'
			];
			const HH_AI_THINK_EVENT_PROFILE = {
				chooseToUse: [1400, 2600],
				chooseUseTarget: [1400, 2600],
				chooseToRespond: [1100, 2200],
				chooseCard: [1100, 2200],
				chooseTarget: [1300, 2400],
				chooseButton: [1200, 2400],
				choosePlayerCard: [1200, 2400],
				discardPlayerCard: [1300, 2500],
				gainPlayerCard: [1300, 2500],
				chooseToDiscard: [1100, 2300],
				chooseCardTarget: [1600, 2600],
				chooseButtonTarget: [1500, 2600],
				chooseControl: [1000, 1900],
				chooseBool: [950, 1800],
				chooseToGive: [1300, 2400],
				chooseToMove: [1700, 2600],
				chooseToMove_new: [1700, 2600],
				chooseNumbers: [1300, 2300],
				chooseSkill: [1400, 2500],
				chooseDrawRecover: [1200, 2200],
				chooseToEnable: [1200, 2200],
				chooseToDisable: [1200, 2200]
			};
			const HH_stageResults = new WeakMap(), HH_preThoughts = new WeakMap();
			const HH_getDecisionResult = event => event.result && typeof event.result == 'object' ? event.result : HH_stageResults.get(event) || {};
			const HH_clamp = function(value, min, max) {
				return Math.max(min, Math.min(max, value));
			};
			const HH_randHumanDelay = function(min, max) {
				if (max <= min) return min;
				return min + Math.pow(Math.random(), 1.8) * (max - min);
			};
			const HH_getSelectRange = function(select) {
				if (typeof select == 'number') return [select, select];
				if (Array.isArray(select)) return select;
				return null;
			};
			const HH_getEventOptionCount = function(event) {
				if (!event) return 0;
				if (Array.isArray(event.controls) && event.controls.length) return event.controls.length;
				if (Array.isArray(event.choiceList)) return event.choiceList.length;
				if (event.dialog && event.dialog.buttons) return event.dialog.buttons.length || 0;
				if (event.createDialog && Array.isArray(event.createDialog)) {
					const list = event.createDialog[1];
					if (Array.isArray(list)) return Array.isArray(list[0]) ? list[0].length : list.length;
				}
				return 0;
			};
			const HH_getAIThinkProfile = function(player) {
				if (!player) return { speed: 1, decisive: 0.5, risk: 0.5, phaseThinkCount: 0, comboCount: 0 };
				if (!player._HH_aiThinkProfile) {
					player._HH_aiThinkProfile = {
						speed: 0.85 + Math.random() * 0.5,
						decisive: Math.random(),
						risk: Math.random(),
						phaseThinkCount: 0,
						comboCount: 0,
						lastThink: 0,
						lastEventName: '',
						phaseUseToken: null,
						phaseHandCount: 0,
						phaseGainCount: 0,
						phaseBoard: ''
					};
				}
				return player._HH_aiThinkProfile;
			};
			const HH_isPhaseUseDecision = function(event, player) {
				// 自己回合中的无懈、决斗响应等也会 chooseToUse，不能当成主动出牌。
				return !!event && event.name == 'chooseToUse' && event.type == 'phase';
			};
			const HH_getPhaseUseToken = function(event, player) {
				if (!HH_isPhaseUseDecision(event, player)) return null;
				return event.getParent && event.getParent('phaseUse', true, true) || event;
			};
			const HH_getAIThinkCard = function(event) {
				if (!['chooseToUse', 'chooseUseTarget', 'chooseToRespond'].includes(event.name)) return null;
				const result = HH_getDecisionResult(event);
				// 技能的消耗牌不等于最终使用的牌（例如丈八、武圣、各类转化技）。
				return result.card || (event.name == 'chooseUseTarget' && event.card) || (!result.skill && result.cards && result.cards[0]) || null;
			};
			const HH_getAIThinkCardName = function(event, player) {
				const card = HH_getAIThinkCard(event);
				return card && (typeof get.name == 'function' ? get.name(card, player) : card.name);
			};
			const HH_getAIThinkSourceCardName = function(event) {
				// 借刀要求出杀是“出杀还是交武器”的取舍，不是普通出杀响应。
				if (event.respondTo && event.respondTo[1]) return event.respondTo[1].name;
				const seen = new Set([event]);
				let parent = event.getParent && event.getParent();
				while (parent && !seen.has(parent)) {
					seen.add(parent);
					if (parent.name == 'useCard' || parent.type == 'card') return parent.card && parent.card.name;
					if (parent.name == 'phaseUse' || parent.name == 'useSkill') break;
					parent = parent.getParent && parent.getParent();
				}
				return null;
			};
			const HH_isWuxieQuestion = function(event) {
				const seen = new Set();
				while (event && !seen.has(event)) {
					seen.add(event);
					if (event.type == 'wuxie' || event.name == '_wuxie') return true;
					if (['useCard', 'useSkill', 'respond', 'phaseUse'].includes(event.name)) break;
					event = event.getParent && event.getParent();
				}
				return false;
			};
			// A Sha can skip chooseToUse entirely when skip_shan finds no Dodge.
			// Track each required Dodge separately so a later missing Dodge still gets its own pause.
			const HH_shanThoughts = new WeakMap();
			const HH_noteResponseThought = function(event, player) {
				let response = false;
				const seen = new Set();
				while (event && !seen.has(event)) {
					seen.add(event);
					if (['chooseToUse', 'chooseToRespond'].includes(event.name) && event.player === player) response = true;
					if (response && event.name == 'sha' && event.target === player) {
						if (!HH_shanThoughts.has(event)) HH_shanThoughts.set(event, new Set());
						HH_shanThoughts.get(event).add(event.shanRequired);
						return;
					}
					if (['useCard', 'useSkill', 'respond', 'phaseUse'].includes(event.name)) break;
					event = event.getParent && event.getParent();
				}
			};
			const HH_isCriticalAIThinkEvent = function(event, player) {
				if (!event) return false;
				const name = HH_getAIThinkCardName(event, player);
				const targets = HH_getDecisionResult(event).targets || [];
				if (event.type == 'wuxie' || name == 'wuxie') return true;
				if (event.name == 'chooseToUse' && HH_getAIThinkSourceCardName(event) == 'jiedao') return true;
				if (event.dying && event.dying != player) return true;
				if (name == 'tao' && targets.some(target => target != player)) return true;
				if (['juedou', 'huogong', 'jiedao', 'tiesuo'].includes(name)) return true;
				if (HH_isPhaseUseDecision(event, player) && targets.some(target => target != player && target.hp <= 1)) return true;
				// 不再因为手里有桃/酒/无懈，或提示中出现“体力”，让普通操作长考。
				return false;
			};
			const HH_getAIThinkPace = function(player, event) {
				const result = HH_getDecisionResult(event);
				if (event._HH_rescueQuestion) return event.dying === player ? 'quick' : 'deliberate';
				if (event.responded) return 'instant';
				// 代选、唯一选项和预选牌仍留出观察及确认时间。
				if (event.directresult) return 'quick';
				if (result.autochoose) return 'quick';
				if (event.name == 'chooseBool' && event.frequentSkill) return 'quick';
				const optionCount = HH_getEventOptionCount(event);
				if (event.name == 'chooseControl' && (event.forceDirect || optionCount == 1)) return 'quick';
				// 全选/唯一选项只缩短操作时间；不额外调用 autochoose/filter/AI 回调。
				if (event.forced && !event.complexCard && !event.complexSelect && !event.filterOk) {
					if (['chooseCard', 'chooseToDiscard'].includes(event.name) && player.getCards && result.cards) {
						const cards = player.getCards(event.position || 'h');
						const range = HH_getSelectRange(event.selectCard);
						if (range && (range[0] >= cards.length || range[1] == -1) && cards.every(card => result.cards.includes(card))) return 'quick';
					}
					if (['chooseButton', 'choosePlayerCard', 'discardPlayerCard', 'gainPlayerCard'].includes(event.name) && optionCount == 1) return 'quick';
					if (event.name == 'chooseTarget' && game.players && result.targets) {
						const range = HH_getSelectRange(event.selectTarget);
						if (range && (range[0] >= game.players.length || range[1] == -1) && game.players.every(target => result.targets.includes(target))) return 'quick';
					}
				}
				const isUse = ['chooseToUse', 'chooseUseTarget'].includes(event.name);
				const isRespond = event.name == 'chooseToRespond';
				if (isUse || isRespond) {
					if (result.bool === false) {
						// 无牌与主动放弃都先观察再提交；无懈沿用原来的快速跳过。
						if (isUse && HH_getAIThinkSourceCardName(event) == 'jiedao') return 'deliberate';
						if (HH_isPhaseUseDecision(event, player)) return 'quick';
						if (HH_isWuxieQuestion(event)) return 'instant';
						return HH_isCriticalAIThinkEvent(event, player) ? 'deliberate' : 'response';
					}
					const name = HH_getAIThinkCardName(event, player);
					const targets = result.targets || [];
					const toSelf = targets.every(target => target == player) && (!event.dying || event.dying == player);
					if (isUse && toSelf) {
						if (name == 'wuzhong' || name == 'tao') return 'quick';
						if (name == 'jiu' && event.dying == player) return 'quick';
						const card = HH_getAIThinkCard(event);
						const info = card && typeof get.info == 'function' && get.info(card);
						if (!result.skill && info && info.type == 'equip' && info.subtype && player.getEquips && !player.getEquips(info.subtype).length) return 'quick';
					}
					if (HH_isCriticalAIThinkEvent(event, player)) return 'deliberate';
					if ((isRespond || !HH_isPhaseUseDecision(event, player)) && ['shan', 'sha'].includes(name) && !result.skill && !event.complexCard && !event.complexSelect && !event.complexTarget && (!result.cards || result.cards.length <= 1)) return 'response';
				}
				if (HH_isCriticalAIThinkEvent(event, player)) return 'deliberate';
				return 'normal';
			};
			const HH_calcAIThinkComplexity = function(player, event) {
				if (!event) return 0;
				let score = 0;
				if (player && typeof player.countCards == 'function' && ['chooseToUse', 'chooseCard', 'chooseToDiscard', 'chooseCardTarget'].includes(event.name)) {
					const handCount = player.countCards('h');
					score += Math.min(12, handCount) * 30;
				}
				const targets = HH_getDecisionResult(event).targets || [];
				if (targets.length > 1) score += Math.min(400, (targets.length - 1) * 100);
				const selectCard = HH_getSelectRange(event.selectCard);
				const selectTarget = HH_getSelectRange(event.selectTarget);
				const selectButton = HH_getSelectRange(event.selectButton);
				if (selectCard && selectCard[0] != selectCard[1]) score += 220;
				if (selectTarget && selectTarget[0] != selectTarget[1]) score += 260;
				if (selectButton && selectButton[0] != selectButton[1]) score += 220;
				if (event.complexCard || event.complexSelect || event.filterOk) score += 220;
				const optionCount = HH_getEventOptionCount(event);
				if (optionCount > 1) score += Math.min(520, optionCount * 55);
				if (event.name == 'chooseCardTarget' || event.name == 'chooseButtonTarget') score += 320;
				if (event.name == 'chooseControl' || event.name == 'chooseBool') score -= event.forced ? 120 : 0;
				if (HH_isPhaseUseDecision(event, player)) score += 180;
				if (HH_isCriticalAIThinkEvent(event, player)) score += 360;
				return Math.max(-400, score);
			};
			const HH_isAIPlayDecision = function(event) {
				const result = HH_getDecisionResult(event);
				return ['chooseToUse', 'chooseUseTarget', 'chooseToRespond'].includes(event.name) && result.bool === true
					&& !!(result.card || result.skill || result.cards?.length || event.name == 'chooseUseTarget' && event.card);
			};
			const HH_calcAIThinkDelay = function(player, event) {
				const configMin = HH_parseNumberConfig('ai_think_delay_min', 250, 0, 10000);
				const configMax = Math.max(configMin, HH_parseNumberConfig('ai_think_delay_max', 2600, 0, 15000));
				const pace = HH_getAIThinkPace(player, event);
				const profile = HH_getAIThinkProfile(player);
				const eventProfile = pace == 'deliberate' ? [1600, 2600] : HH_AI_THINK_EVENT_PROFILE[event && event.name] || [configMin, configMax];
				let min = HH_clamp(eventProfile[0], configMin, configMax);
				let max = HH_clamp(eventProfile[1], min, configMax);
				const now = Date.now();
				const inPhaseUse = HH_isPhaseUseDecision(event, player);
				let reviewPlan = false;
				if (inPhaseUse) {
					const phaseUseToken = HH_getPhaseUseToken(event, player);
					const handCount = player?.countCards?.('h') || 0;
					const gainCount = player?.actionHistory?.at(-1)?.gain?.length || 0;
					// 只看公开场面和自己的得牌记录，不重跑选牌、目标或技能 AI。
					const board = (game.players || []).map(target => `${target.hp}:${target.hujia || 0}:${target.node?.equips?.childElementCount || 0}:${target.node?.judges?.childElementCount || 0}`).join('|');
					if (profile.phaseUseToken !== phaseUseToken) {
						profile.phaseUseToken = phaseUseToken;
						profile.phaseThinkCount = 0;
						profile.comboCount = 0;
					}
					reviewPlan = profile.phaseThinkCount == 0 || handCount > profile.phaseHandCount
						|| gainCount !== profile.phaseGainCount || board !== profile.phaseBoard || profile.lastEventName !== 'chooseToUse';
					if (!reviewPlan && profile.lastThink && now - profile.lastThink < 5000) {
						profile.comboCount++;
					} else {
						profile.comboCount = 0;
					}
					// 摸牌/吃桃等顺手操作不消耗本阶段首次规划的停顿。
					if (pace == 'normal' || pace == 'deliberate') profile.phaseThinkCount++;
					profile.phaseHandCount = handCount;
					profile.phaseGainCount = gainCount;
					profile.phaseBoard = board;
				} else if (event && event.name != profile.lastEventName) {
					profile.comboCount = 0;
				}
				profile.lastThink = now;
				profile.lastEventName = event && event.name || '';
				// 出杀/闪也需要观察并点击，独立于结算速度和游戏倍率。
				if (pace == 'instant' || configMax == 0) return 0;
				if (pace == 'quick' || pace == 'response') {
					const play = HH_isAIPlayDecision(event);
					const range = pace == 'response' ? [1100, 2300] : play ? [1100, 2100] : [900, 1800];
					const floor = Math.max(configMin, pace == 'response' || play ? 1000 : 900);
					const low = Math.min(configMax, Math.max(floor, range[0] * profile.speed));
					const high = Math.min(configMax, Math.max(low, range[1] * profile.speed));
					const delay = Math.round(HH_randHumanDelay(low, high));
					profile.lastThink = now + delay;
					return delay;
				}
				let delay = HH_randHumanDelay(min, max);
				delay += HH_calcAIThinkComplexity(player, event);
				if (inPhaseUse && reviewPlan) delay += 350 + Math.random() * 450;
				// 熟悉的连招偶尔顺手接续，几张之后重新观察；不随连招次数不断加速。
				if (inPhaseUse && !reviewPlan && profile.comboCount > 0 && profile.comboCount % 3 != 0
					&& Math.random() < 0.45 + profile.decisive * 0.2) delay *= 0.84 + Math.random() * 0.12;
				delay *= profile.speed;
				delay *= 1 - profile.decisive * 0.16;
				if (HH_isCriticalAIThinkEvent(event, player)) delay *= 1 + profile.risk * 0.22;
				// 只在关键取舍时偶尔长考，普通操作严格遵守配置的上限。
				const longThink = pace == 'deliberate' && Math.random() < 0.06;
				if (longThink) delay += 500 + Math.random() * 1000;
				const hardMax = longThink ? Math.min(15000, configMax + 1500) : configMax;
				const floor = Math.min(configMax, Math.max(configMin, inPhaseUse && HH_isAIPlayDecision(event) ? 1200 : 900));
				// 平滑接近上限，避免复杂操作都被截成完全一样的固定时长。
				if (hardMax > floor && delay > floor) delay = floor + (hardMax - floor) * -Math.expm1(-(delay - floor) / (hardMax - floor));
				delay = Math.round(HH_clamp(delay, floor, hardMax));
				profile.lastThink = now + delay;
				return delay;
			};
			const HH_shouldDelayAI = function(event, player) {
				if (!lib.config.extension_HH优化_enable_ai_think_delay) return false;
				if (_status.connectMode || game.online || _status.video || _status.over) return false;
				// 只处理交互选择，摸牌/伤害/获得牌等系统结算不增加思考。
				if (!event || !HH_AI_THINK_EVENTS.includes(event.name) || event._HH_aiThinkDelayed || event.responded) return false;
				player = player || event.player;
				if (!player) return false;
				let rescueParent = event;
				const seenRescueParents = new Set();
				while (rescueParent && !seenRescueParents.has(rescueParent)) {
					seenRescueParents.add(rescueParent);
					if (HH_preThoughts.get(rescueParent)?.has(player)) return false;
					if (rescueParent._HH_rescueThought && rescueParent.player === player) return false;
					if (['useCard', 'useSkill', 'respond', 'phaseUse'].includes(rescueParent.name)) break;
					rescueParent = rescueParent.getParent && rescueParent.getParent();
				}
				if (player.isUnderControl && player.isUnderControl() && !_status.auto) return false;
				if (event.isMine && event.isMine()) return false;
				if (event.isOnline && event.isOnline()) return false;
				return !(player.isMine && player.isMine()) && !(player.isOnline && player.isOnline());
			};
			const HH_getAIThinkParents = function(event, player) {
				const parents = [];
				const seen = new Set([event]);
				let parent = event.getParent && event.getParent();
				while (parent && !seen.has(parent)) {
					seen.add(parent);
					// 出牌开始结算后的新响应/技能是另一项决策，不能沿用之前的停顿。
					if (['useCard', 'useSkill', 'respond', 'phaseUse'].includes(parent.name)) break;
					if (HH_AI_THINK_EVENTS.includes(parent.name)) {
						if (parent.player != player) break;
						// 仅合并等待技能子选择结果的出牌包装；其他独立选择各自计时。
						if (['chooseToUse', 'chooseUseTarget', 'chooseToRespond'].includes(parent.name) && !parent._HH_aiThinkDelayed) parents.push(parent);
					}
					parent = parent.getParent && parent.getParent();
				}
				return parents;
			};
			const HH_aiThinkDelay = async function(event, player) {
				if (!HH_shouldDelayAI(event, player)) return;
				// 等引擎给出真实结果再判断。技能按钮/取消重选还不是最终出牌。
				const result = HH_getDecisionResult(event);
				if (!result || typeof result != 'object' || result.cancel || result.cancelled) return;
				if (result.bool === undefined && result.control === undefined && !['cards', 'targets', 'links', 'moved', 'numbers', 'skill'].some(key => result[key] !== undefined)) return;
				const skillInfo = result.skill && typeof get.info == 'function' && get.info(result.skill);
				if (['chooseToUse', 'chooseToRespond'].includes(event.name) && skillInfo && skillInfo.chooseButton && !result.card) return;
				event._HH_aiThinkDelayed = true;
				player = player || event.player;
				const parents = HH_getAIThinkParents(event, player);
				if (event._HH_aiThinkChildDelayed) return;
				const delay = HH_calcAIThinkDelay(player, event);
				if (delay <= 0) return;
				HH_noteResponseThought(event, player);
				parents.forEach(parent => { parent._HH_aiThinkChildDelayed = true; });
				const progress = game.hhAIThinkProgress;
				const thinking = progress?.begin(player, delay, delay >= 600 && lib.config.extension_HH优化_ai_think_delay_popup !== false, event);
				try {
					await HH_sleep(delay);
				} finally {
					progress?.end(thinking);
				}
				return delay;
			};
			// These native contents commit inside the same function that computes the result.
			// Observe before entering, then share that pause with their delegated choices.
			const HH_thinkBeforeContent = async function(event, player, extra = {}) {
				if (event._HH_aiThinkDelayed || event._HH_aiThinkChildDelayed) return;
				const question = { name: event.name, type: event.type, player, result: { bool: true },
					forced: event.forced, controls: event.controls, choiceList: event.choiceList, dialog: event.dialog,
					selectCard: event.selectCard, selectTarget: event.selectTarget, selectButton: event.selectButton,
					complexCard: event.complexCard, complexSelect: event.complexSelect, complexTarget: event.complexTarget,
					card: event.card, getParent: () => event,
					isMine: () => player === event.player ? event.isMine?.() : player?.isMine?.(),
					isOnline: () => player === event.player ? event.isOnline?.() : player?.isOnline?.(), ...extra };
				if (await HH_aiThinkDelay(question, player) > 0) {
					if (!HH_preThoughts.has(event)) HH_preThoughts.set(event, new Set());
					HH_preThoughts.get(event).add(player);
				}
			};
			const HH_inlineChoices = new Set(['chooseDrawRecover', 'chooseToEnable', 'chooseToDisable']);
			const HH_hookAIThinkDelay = function() {
				if (!lib.element) return;
				const wrapContentMap = function(contentMap) {
					if (!contentMap) return;
					HH_AI_THINK_EVENTS.forEach(name => {
						let original = contentMap[name];
						if (!original || original._HH_aiThinkDelayHooked) return;
						if (typeof original === 'function' && original.constructor.name !== 'AsyncFunction' && !original.compiled && lib.element.GameEvent) {
							original = new lib.element.GameEvent(name, false).setContent(original).content;
						}
						if (original.compiled && Array.isArray(original.originals)) {
							// Reuse the native step compiler's sandboxed bodies and original step indices.
							original = original.originals.map(body => function(event, trigger, player) {
								return body.call(this, { _status, ai, game, get, lib, ui }, event, trigger, player);
							});
						} else if (original.compiled && Array.isArray(original.original)) original = original.original;
						else if (original.compiled && original.original?.constructor?.name === 'AsyncFunction') original = original.original;
						if (Array.isArray(original)) {
							// 逐步包装而非插入新步骤，保留 goto(0)、redo() 及第四参数 result。
							contentMap[name] = original.map((step, index) => async function(event, trigger, player) {
								if (HH_inlineChoices.has(name)) {
									if (index == 0) await HH_thinkBeforeContent(event, ['chooseToEnable', 'chooseToDisable'].includes(name) ? event.source || player : player);
									return step.apply(this, arguments);
								}
								if (arguments[3] && typeof arguments[3] == 'object') HH_stageResults.set(event, arguments[3]);
								if (index > 0) await HH_aiThinkDelay(event, player);
								if (name == 'chooseButton' && index == original.length - 1 && typeof event.callback == 'function') await HH_thinkBeforeContent(event, player);
								const result = await step.apply(this, arguments);
								if (result && typeof result == 'object') HH_stageResults.set(event, result);
								if (event.finished || index == original.length - 1) await HH_aiThinkDelay(event, player);
								return result;
							});
						} else if (typeof original == 'function' && original.constructor.name == 'AsyncFunction' && !original.compiled) {
							// 单体异步选择在返回结果前等待；旧式 step 函数留给原编译器处理。
							contentMap[name] = async function(event, trigger, player) {
								if (HH_inlineChoices.has(name)) {
									await HH_thinkBeforeContent(event, ['chooseToEnable', 'chooseToDisable'].includes(name) ? event.source || player : player);
									return original.apply(this, arguments);
								}
								const result = await original.apply(this, arguments);
								if (result && typeof result == 'object') HH_stageResults.set(event, result);
								await HH_aiThinkDelay(event, player);
								return result;
							};
						} else if (typeof original === 'function' && original.compiled) {
							// Opaque extension compilers cannot expose a final-result boundary: think before entering.
							const wrapped = async function(event, trigger, player) {
								if (HH_inlineChoices.has(name)) {
									await HH_thinkBeforeContent(event, ['chooseToEnable', 'chooseToDisable'].includes(name) ? event.source || player : player);
									return original.apply(this, arguments);
								}
								const question = { name: event.name, type: event.type, player: player || event.player,
									result: event.result || { bool: true }, responded: event.responded,
									_HH_aiThinkDelayed: event._HH_aiThinkDelayed, _HH_aiThinkChildDelayed: event._HH_aiThinkChildDelayed,
									_HH_rescueThought: event._HH_rescueThought,
									getParent: (...args) => event.getParent?.(...args), isMine: () => event.isMine?.(), isOnline: () => event.isOnline?.() };
								await HH_aiThinkDelay(question, player);
								if (question._HH_aiThinkDelayed) event._HH_aiThinkDelayed = true;
								return original.apply(this, arguments);
							};
							Object.assign(wrapped, { compiled: true, type: original.type, original: original.original });
							contentMap[name] = wrapped;
						}
						if (contentMap[name] !== original || Array.isArray(original)) contentMap[name]._HH_aiThinkDelayHooked = true;
					});
				};
				wrapContentMap(lib.element.content);
				wrapContentMap(lib.element.contents);
			};
			HH_hookAIThinkDelay();
			game.hhAIThink = { refreshHooks: HH_hookAIThinkDelay };
			(lib.arenaReady ||= []).push(HH_hookAIThinkDelay);
			const HH_missingShanQuestion = (trigger, player) => ({
				name: 'chooseToUse', type: 'respondShan', player, result: { bool: false },
				respondTo: [trigger.player, trigger.card], getParent: () => trigger,
			});
			lib.skill._HH_ai_missing_shan = {
				trigger: { target: 'shaHit' }, firstDo: true, priority: 10000,
				silent: true, charlotte: true, forced: true, popup: false,
				filter(trigger, player) {
					return !trigger.directHit && !trigger.directHit2 && !trigger.skipShan
						&& !HH_shanThoughts.get(trigger)?.has(trigger.shanRequired)
						&& HH_shouldDelayAI(HH_missingShanQuestion(trigger, player), player);
				},
				async content(event, trigger, player) {
					await HH_aiThinkDelay(HH_missingShanQuestion(trigger, player), player);
				},
			};
			game.finishSkill?.('_HH_ai_missing_shan');
			if (!game.finishSkill) game.addGlobalSkill?.('_HH_ai_missing_shan');
			lib.skill._HH_ai_jiedao_think = {
				trigger: { target: 'jiedaoBegin' }, lastDo: true,
				silent: true, charlotte: true, forced: true, popup: false,
				filter(trigger, player) {
					return !trigger.directHit && !!trigger.addedTarget
						&& HH_shouldDelayAI({ name: 'chooseToUse', player, getParent: () => trigger }, player);
				},
				async content(event, trigger, player) {
					await HH_thinkBeforeContent(trigger, player, { name: 'chooseToUse', type: 'jiedao',
						respondTo: [trigger.player, trigger.card], complexSelect: true, complexTarget: true });
				},
			};
			game.finishSkill?.('_HH_ai_jiedao_think');
			if (!game.finishSkill) game.addGlobalSkill?.('_HH_ai_jiedao_think');
			setupLordBlindShot({ lib, game, get, _status });

			// ========== 濒死逐人求桃 ==========
			setupRescueFlow({ lib, game, ui, get, _status }, {
				getThinkDelay(player, dying, parent) {
					const question = { name: 'chooseToUse', type: 'dying', player, dying, _HH_rescueQuestion: true, getParent: () => parent };
					return HH_shouldDelayAI(question, player) ? HH_calcAIThinkDelay(player, question) : 0;
				},
			});

			// ========== HH优化样式覆盖功能 ==========
			// 创建或获取自定义样式标签 - 添加到body末尾确保最高优先级
			let customStyleEl = document.getElementById('speed_control_custom_style');
			if (!customStyleEl) {
				customStyleEl = document.createElement('style');
				customStyleEl.id = 'speed_control_custom_style';
				// 添加到body末尾，确保在所有其他样式之后加载
				if (document.body) {
					document.body.appendChild(customStyleEl);
				} else {
					document.head.appendChild(customStyleEl);
				}
			}

			// 更新自定义样式的函数
			const updateCustomStyle = function() {
				// 获取所有配置值，使用默认值作为后备
				// 注意：使用 ?? 运算符而不是 ||，避免 0 被错误替换
				const getConfigValue = (key, defaultVal) => {
					const val = lib.config['extension_HH优化_' + key];
					const parsed = parseInt(val);
					return isNaN(parsed) ? defaultVal : parsed;
				};
				const getConfigFloat = (key, defaultVal) => {
					const val = lib.config['extension_HH优化_' + key];
					const parsed = parseFloat(val);
					return isNaN(parsed) ? defaultVal : parsed;
				};
				const sizing = getPlayerStyleSizing(lib.config.extension_HH优化_player_width, lib.config.extension_HH优化_newDecadeStyle, lib.config.extension_HH优化_player_height);
				const { width: widthValue, height: heightValue, borderWidth: borderWidthValue, hpRight: hpRightValue,
					borderLeft: borderLeftValue, factionLeft: factionLeftValue, nameInset: nameInsetValue } = sizing;
				

				
				// 护甲保留右侧间距
				const hujiaLeftValue = sizing.armorLeft;
				
				let css = '';
				
				// 始终应用所有样式（不再判断是否等于默认值）
				// 界面裁剪配置
				const enableCrop = lib.config.extension_HH优化_enable_ui_crop;
				const cropLeft = getConfigValue('crop_left', 0);
				const cropRight = getConfigValue('crop_right', 0);

				css += `
					.player {
						--hh-configured-player-width: ${widthValue}px;
						--hh-configured-player-height: ${heightValue}px;
						--hh-source-glow-width: ${sizing.sourceGlowWidth}px;
						--hh-source-glow-left: ${sizing.sourceGlowLeft}px;
						--hh-source-glow-height: ${sizing.sourceGlowHeight}px;
						--hh-source-glow-top: ${sizing.sourceGlowTop}px;
						--hh-target-glow-height: ${sizing.targetGlowHeight}px;
						--hh-target-glow-top: ${sizing.targetGlowTop}px;
						--hh-configured-hp-right: ${hpRightValue}px;
					}
					/* 覆盖HH优化所有样式的武将宽度 */
					#arena[data-new-decade-style="onlineUI"] > .player {
						--w: ${widthValue}px !important;
					}
					#arena[data-new-decade-style="on"] > .player,
					#arena[data-new-decade-style="off"] > .player,
					#arena[data-new-decade-style="othersOff"] > .player,
					#arena[data-new-decade-style="babysha"] > .player,
					#arena[data-new-decade-style="codename"] > .player {
						--w: ${widthValue}px !important;
					}
					/* 武将牌宽高独立设置，覆盖各主题及人数布局 */
					#arena.fewplayer > .player:not(.minskin),
					#arena:not(.fewplayer) > .player:not(.minskin),
					#arena:not(.fewplayer):not(*[data-player_height=""]) > .player:not(.minskin) {
						width: ${widthValue}px !important;
						height: ${heightValue}px !important;
					}
					/* 武将头像使用cover填充，保持图片不变形 */
					.player > .primary-avatar,
					.player > .deputy-avatar {
						background-size: cover !important;
						background-position: center top !important;
						background-repeat: no-repeat !important;
					}
					/* Fixed portrait insets; percentage widths otherwise leave a gap when widened. */
					.player:not(.fullskin2):not(.double-character):not(.double):not([data-double="1"]):not([data-mode="guozhan"]) > .primary-avatar {
						width: auto !important;
						right: ${sizing.portraitRight}px !important;
					}
					/* 调整HP勾玉位置 */
					.player > .hp-wrap {
						right: ${hpRightValue}px !important;
					}
					.player[data-position="0"] > .hp-wrap {
						right: ${hpRightValue}px !important;
					}
					/* 调整护甲位置 */
					.hujia {
						left: ${hujiaLeftValue}px !important;
					}
					/* 覆盖HH优化 online样式的边框图片宽度和位置 */
					.player > .camp-wrap > .camp-border {
						width: calc(${borderWidthValue}% + ${sizing.borderGrow}px) !important;
						left: ${borderLeftValue + sizing.borderShift}px !important;
						transform: scaleY(${sizing.frameHeightScale}) !important;
						transform-origin: 0 ${sizing.frameHeightOrigin}px !important;
					}
					body[data-style="onlineUI"] .player > .camp-wrap > .camp-back {
						bottom: calc(1% - ${sizing.heightDelta}px) !important;
					}
					#arena.decadeUI[data-border-level="one"] .player > .camp-wrap > .camp-border,
					#arena.decadeUI[data-border-level="two"] .player > .camp-wrap > .camp-border,
					#arena.decadeUI[data-border-level="three"] .player > .camp-wrap > .camp-border,
					#arena.decadeUI[data-border-level="four"] .player > .camp-wrap > .camp-border {
						width: calc(${borderWidthValue}% + ${sizing.borderGrow}px) !important;
						left: ${borderLeftValue + sizing.borderShift}px !important;
					}
					/* 调整势力标志位置 */
					.player > .camp-wrap > .camp-name {
						left: ${factionLeftValue}px !important;
					}
					/* Share the same text column; image-based factions keep their theme geometry. */
					body[data-style="onlineUI"] .player > .camp-wrap > .camp-name,
					.player > .camp-wrap > .avatar-name,
					.player > .camp-wrap > .avatar-name-default {
						left: ${nameInsetValue}% !important;
						right: ${nameInsetValue}% !important;
						width: auto !important;
						align-items: center !important;
						writing-mode: vertical-rl !important;
					}
					.player > .camp-wrap > .avatar-name,
					.player > .camp-wrap > .avatar-name-default {
						transform: none !important;
					}
				`;

				// 卡牌花色颜色加深样式
				if (!originalCardStylePriority && lib.config.extension_HH优化_enable_card_suit_color) {
					const suitNumTop = getConfigValue('suit_num_top', 0);
					const suitNumLeft = getConfigValue('suit_num_left', 0);
					const redSuitColor = '#cb1d14';
					const blackSuitColor = '#130f06';
					css += `
					/* 覆盖HH优化和原版卡牌左上角红色扑克字母、数字、花色 */
					.card > .info.red:not(.gaintag),
					.card > .info.red:not(.gaintag) > span,
					.card[data-suit="heart"] > .suit-num,
					.card[data-suit="heart"] > .suit-num > .num,
					.card[data-suit="heart"] > .suit-num > .suit,
					.card[data-suit="diamond"] > .suit-num,
					.card[data-suit="diamond"] > .suit-num > .num,
					.card[data-suit="diamond"] > .suit-num > .suit,
					.card[data-tempsn="heart"] > .tempsuitnum,
					.card[data-tempsn="heart"] > .tempsuitnum > .num,
					.card[data-tempsn="heart"] > .tempsuitnum > .suit,
					.card[data-tempsn="diamond"] > .tempsuitnum,
					.card[data-tempsn="diamond"] > .tempsuitnum > .num,
					.card[data-tempsn="diamond"] > .tempsuitnum > .suit,
					#arena .card > .info.red:not(.gaintag),
					#arena .card > .info.red:not(.gaintag) > span,
					#arena .card[data-suit="heart"] > .suit-num,
					#arena .card[data-suit="heart"] > .suit-num > .num,
					#arena .card[data-suit="heart"] > .suit-num > .suit,
					#arena .card[data-suit="diamond"] > .suit-num,
					#arena .card[data-suit="diamond"] > .suit-num > .num,
					#arena .card[data-suit="diamond"] > .suit-num > .suit,
					#arena .card[data-tempsn="heart"] > .tempsuitnum,
					#arena .card[data-tempsn="heart"] > .tempsuitnum > .num,
					#arena .card[data-tempsn="heart"] > .tempsuitnum > .suit,
					#arena .card[data-tempsn="diamond"] > .tempsuitnum,
					#arena .card[data-tempsn="diamond"] > .tempsuitnum > .num,
					#arena .card[data-tempsn="diamond"] > .tempsuitnum > .suit,
					#window .card > .info.red:not(.gaintag),
					#window .card > .info.red:not(.gaintag) > span,
					#window .card[data-suit="heart"] > .suit-num,
					#window .card[data-suit="heart"] > .suit-num > .num,
					#window .card[data-suit="heart"] > .suit-num > .suit,
					#window .card[data-suit="diamond"] > .suit-num,
					#window .card[data-suit="diamond"] > .suit-num > .num,
					#window .card[data-suit="diamond"] > .suit-num > .suit,
					#window .card[data-tempsn="heart"] > .tempsuitnum,
					#window .card[data-tempsn="heart"] > .tempsuitnum > .num,
					#window .card[data-tempsn="heart"] > .tempsuitnum > .suit,
					#window .card[data-tempsn="diamond"] > .tempsuitnum,
					#window .card[data-tempsn="diamond"] > .tempsuitnum > .num,
					#window .card[data-tempsn="diamond"] > .tempsuitnum > .suit,
					.dialog .card > .info.red:not(.gaintag),
					.dialog .card > .info.red:not(.gaintag) > span,
					.dialog .card[data-suit="heart"] > .suit-num,
					.dialog .card[data-suit="heart"] > .suit-num > .num,
					.dialog .card[data-suit="heart"] > .suit-num > .suit,
					.dialog .card[data-suit="diamond"] > .suit-num,
					.dialog .card[data-suit="diamond"] > .suit-num > .num,
					.dialog .card[data-suit="diamond"] > .suit-num > .suit,
					.dialog .card[data-tempsn="heart"] > .tempsuitnum,
					.dialog .card[data-tempsn="heart"] > .tempsuitnum > .num,
					.dialog .card[data-tempsn="heart"] > .tempsuitnum > .suit,
					.dialog .card[data-tempsn="diamond"] > .tempsuitnum,
					.dialog .card[data-tempsn="diamond"] > .tempsuitnum > .num,
					.dialog .card[data-tempsn="diamond"] > .tempsuitnum > .suit,
					.popup .card > .info.red:not(.gaintag),
					.popup .card > .info.red:not(.gaintag) > span,
					.popup .card[data-suit="heart"] > .suit-num,
					.popup .card[data-suit="heart"] > .suit-num > .num,
					.popup .card[data-suit="heart"] > .suit-num > .suit,
					.popup .card[data-suit="diamond"] > .suit-num,
					.popup .card[data-suit="diamond"] > .suit-num > .num,
					.popup .card[data-suit="diamond"] > .suit-num > .suit,
					.popup .card[data-tempsn="heart"] > .tempsuitnum,
					.popup .card[data-tempsn="heart"] > .tempsuitnum > .num,
					.popup .card[data-tempsn="heart"] > .tempsuitnum > .suit,
					.popup .card[data-tempsn="diamond"] > .tempsuitnum,
					.popup .card[data-tempsn="diamond"] > .tempsuitnum > .num,
					.popup .card[data-tempsn="diamond"] > .tempsuitnum > .suit,
					.handcards > .card > .info.red:not(.gaintag),
					.handcards > .card > .info.red:not(.gaintag) > span,
					.handcards > .card[data-suit="heart"] > .suit-num,
					.handcards > .card[data-suit="heart"] > .suit-num > .num,
					.handcards > .card[data-suit="heart"] > .suit-num > .suit,
					.handcards > .card[data-suit="diamond"] > .suit-num,
					.handcards > .card[data-suit="diamond"] > .suit-num > .num,
					.handcards > .card[data-suit="diamond"] > .suit-num > .suit,
					.handcards > .card[data-tempsn="heart"] > .tempsuitnum,
					.handcards > .card[data-tempsn="heart"] > .tempsuitnum > .num,
					.handcards > .card[data-tempsn="heart"] > .tempsuitnum > .suit,
					.handcards > .card[data-tempsn="diamond"] > .tempsuitnum,
					.handcards > .card[data-tempsn="diamond"] > .tempsuitnum > .num,
					.handcards > .card[data-tempsn="diamond"] > .tempsuitnum > .suit,
					.buttons .card > .info.red:not(.gaintag),
					.buttons .card > .info.red:not(.gaintag) > span,
					.buttons .card[data-suit="heart"] > .suit-num,
					.buttons .card[data-suit="heart"] > .suit-num > .num,
					.buttons .card[data-suit="heart"] > .suit-num > .suit,
					.buttons .card[data-suit="diamond"] > .suit-num,
					.buttons .card[data-suit="diamond"] > .suit-num > .num,
					.buttons .card[data-suit="diamond"] > .suit-num > .suit,
					.buttons .card[data-tempsn="heart"] > .tempsuitnum,
					.buttons .card[data-tempsn="heart"] > .tempsuitnum > .num,
					.buttons .card[data-tempsn="heart"] > .tempsuitnum > .suit,
					.buttons .card[data-tempsn="diamond"] > .tempsuitnum,
					.buttons .card[data-tempsn="diamond"] > .tempsuitnum > .num,
					.buttons .card[data-tempsn="diamond"] > .tempsuitnum > .suit {
						color: ${redSuitColor} !important;
					}
					/* 覆盖HH优化和原版卡牌左上角黑色扑克字母、数字、花色 */
					.card > .info:not(.red):not(.gaintag),
					.card > .info:not(.red):not(.gaintag) > span,
					.card[data-suit="spade"] > .suit-num,
					.card[data-suit="spade"] > .suit-num > .num,
					.card[data-suit="spade"] > .suit-num > .suit,
					.card[data-suit="club"] > .suit-num,
					.card[data-suit="club"] > .suit-num > .num,
					.card[data-suit="club"] > .suit-num > .suit,
					.card[data-tempsn="spade"] > .tempsuitnum,
					.card[data-tempsn="spade"] > .tempsuitnum > .num,
					.card[data-tempsn="spade"] > .tempsuitnum > .suit,
					.card[data-tempsn="club"] > .tempsuitnum,
					.card[data-tempsn="club"] > .tempsuitnum > .num,
					.card[data-tempsn="club"] > .tempsuitnum > .suit,
					#arena .card > .info:not(.red):not(.gaintag),
					#arena .card > .info:not(.red):not(.gaintag) > span,
					#arena .card[data-suit="spade"] > .suit-num,
					#arena .card[data-suit="spade"] > .suit-num > .num,
					#arena .card[data-suit="spade"] > .suit-num > .suit,
					#arena .card[data-suit="club"] > .suit-num,
					#arena .card[data-suit="club"] > .suit-num > .num,
					#arena .card[data-suit="club"] > .suit-num > .suit,
					#arena .card[data-tempsn="spade"] > .tempsuitnum,
					#arena .card[data-tempsn="spade"] > .tempsuitnum > .num,
					#arena .card[data-tempsn="spade"] > .tempsuitnum > .suit,
					#arena .card[data-tempsn="club"] > .tempsuitnum,
					#arena .card[data-tempsn="club"] > .tempsuitnum > .num,
					#arena .card[data-tempsn="club"] > .tempsuitnum > .suit,
					#window .card > .info:not(.red):not(.gaintag),
					#window .card > .info:not(.red):not(.gaintag) > span,
					#window .card[data-suit="spade"] > .suit-num,
					#window .card[data-suit="spade"] > .suit-num > .num,
					#window .card[data-suit="spade"] > .suit-num > .suit,
					#window .card[data-suit="club"] > .suit-num,
					#window .card[data-suit="club"] > .suit-num > .num,
					#window .card[data-suit="club"] > .suit-num > .suit,
					#window .card[data-tempsn="spade"] > .tempsuitnum,
					#window .card[data-tempsn="spade"] > .tempsuitnum > .num,
					#window .card[data-tempsn="spade"] > .tempsuitnum > .suit,
					#window .card[data-tempsn="club"] > .tempsuitnum,
					#window .card[data-tempsn="club"] > .tempsuitnum > .num,
					#window .card[data-tempsn="club"] > .tempsuitnum > .suit,
					.dialog .card > .info:not(.red):not(.gaintag),
					.dialog .card > .info:not(.red):not(.gaintag) > span,
					.dialog .card[data-suit="spade"] > .suit-num,
					.dialog .card[data-suit="spade"] > .suit-num > .num,
					.dialog .card[data-suit="spade"] > .suit-num > .suit,
					.dialog .card[data-suit="club"] > .suit-num,
					.dialog .card[data-suit="club"] > .suit-num > .num,
					.dialog .card[data-suit="club"] > .suit-num > .suit,
					.dialog .card[data-tempsn="spade"] > .tempsuitnum,
					.dialog .card[data-tempsn="spade"] > .tempsuitnum > .num,
					.dialog .card[data-tempsn="spade"] > .tempsuitnum > .suit,
					.dialog .card[data-tempsn="club"] > .tempsuitnum,
					.dialog .card[data-tempsn="club"] > .tempsuitnum > .num,
					.dialog .card[data-tempsn="club"] > .tempsuitnum > .suit,
					.popup .card > .info:not(.red):not(.gaintag),
					.popup .card > .info:not(.red):not(.gaintag) > span,
					.popup .card[data-suit="spade"] > .suit-num,
					.popup .card[data-suit="spade"] > .suit-num > .num,
					.popup .card[data-suit="spade"] > .suit-num > .suit,
					.popup .card[data-suit="club"] > .suit-num,
					.popup .card[data-suit="club"] > .suit-num > .num,
					.popup .card[data-suit="club"] > .suit-num > .suit,
					.popup .card[data-tempsn="spade"] > .tempsuitnum,
					.popup .card[data-tempsn="spade"] > .tempsuitnum > .num,
					.popup .card[data-tempsn="spade"] > .tempsuitnum > .suit,
					.popup .card[data-tempsn="club"] > .tempsuitnum,
					.popup .card[data-tempsn="club"] > .tempsuitnum > .num,
					.popup .card[data-tempsn="club"] > .tempsuitnum > .suit,
					.handcards > .card > .info:not(.red):not(.gaintag),
					.handcards > .card > .info:not(.red):not(.gaintag) > span,
					.handcards > .card[data-suit="spade"] > .suit-num,
					.handcards > .card[data-suit="spade"] > .suit-num > .num,
					.handcards > .card[data-suit="spade"] > .suit-num > .suit,
					.handcards > .card[data-suit="club"] > .suit-num,
					.handcards > .card[data-suit="club"] > .suit-num > .num,
					.handcards > .card[data-suit="club"] > .suit-num > .suit,
					.handcards > .card[data-tempsn="spade"] > .tempsuitnum,
					.handcards > .card[data-tempsn="spade"] > .tempsuitnum > .num,
					.handcards > .card[data-tempsn="spade"] > .tempsuitnum > .suit,
					.handcards > .card[data-tempsn="club"] > .tempsuitnum,
					.handcards > .card[data-tempsn="club"] > .tempsuitnum > .num,
					.handcards > .card[data-tempsn="club"] > .tempsuitnum > .suit,
					.buttons .card > .info:not(.red):not(.gaintag),
					.buttons .card > .info:not(.red):not(.gaintag) > span,
					.buttons .card[data-suit="spade"] > .suit-num,
					.buttons .card[data-suit="spade"] > .suit-num > .num,
					.buttons .card[data-suit="spade"] > .suit-num > .suit,
					.buttons .card[data-suit="club"] > .suit-num,
					.buttons .card[data-suit="club"] > .suit-num > .num,
					.buttons .card[data-suit="club"] > .suit-num > .suit,
					.buttons .card[data-tempsn="spade"] > .tempsuitnum,
					.buttons .card[data-tempsn="spade"] > .tempsuitnum > .num,
					.buttons .card[data-tempsn="spade"] > .tempsuitnum > .suit,
					.buttons .card[data-tempsn="club"] > .tempsuitnum,
					.buttons .card[data-tempsn="club"] > .tempsuitnum > .num,
					.buttons .card[data-tempsn="club"] > .tempsuitnum > .suit {
						color: ${blackSuitColor} !important;
					}
					/* 卡牌花色数字字体和位置偏移 */
					.card > .suit-num,
					.card > .tempsuitnum,
					.card > .info,
					#arena .card > .suit-num,
					#arena .card > .tempsuitnum,
					#arena .card > .info,
					#window .card > .suit-num,
					#window .card > .info,
					.dialog .card > .suit-num,
					.dialog .card > .info,
					.handcards > .card > .suit-num,
					.handcards > .card > .info,
					.popup .card > .suit-num,
					.popup .card > .info,
					.buttons .card > .suit-num,
					.buttons .card > .info {
						font-family: "Times New Roman", Times, serif !important;
						margin-top: ${suitNumTop}px !important;
						margin-left: ${suitNumLeft}px !important;
					}
					/* 数字字母非粗体 */
					.card > .suit-num > .num,
					.card > .tempsuitnum > .num,
					.card > .info > span:first-child,
					#arena .card > .suit-num > .num,
					#arena .card > .tempsuitnum > .num,
					#window .card > .suit-num > .num,
					.dialog .card > .suit-num > .num,
					.handcards > .card > .suit-num > .num,
					.popup .card > .suit-num > .num,
					.buttons .card > .suit-num > .num {
						font-weight: normal !important;
					}
					/* 花色粗体 */
					.card > .suit-num > .suit,
					.card > .tempsuitnum > .suit,
					.card > .info > span:last-child,
					#arena .card > .suit-num > .suit,
					#arena .card > .tempsuitnum > .suit,
					#window .card > .suit-num > .suit,
					.dialog .card > .suit-num > .suit,
					.handcards > .card > .suit-num > .suit,
					.popup .card > .suit-num > .suit,
					.buttons .card > .suit-num > .suit {
						font-weight: bold !important;
					}
					`;
				}

				// 卡牌左上角扑克数字和花色柔化，优先覆盖HH优化的锐利阴影
				if (!originalCardStylePriority && lib.config.extension_HH优化_enable_card_suit_blur !== false) {
					const suitBlurValue = Math.max(0, Math.min(2, getConfigFloat('card_suit_blur', 0.35)));
					const suitShadowBlur = Math.max(0.2, suitBlurValue * 1.8).toFixed(2);
					const suitImageEnabled = lib.config.extension_HH优化_enable_card_suit_image !== false;
					css += `
					/* 柔化卡牌左上角扑克数字、字母；图片花色开启时不模糊图片本身 */
					.card > .suit-num > .num,
					.card > .tempsuitnum > .num,
					.card > .info:not(.gaintag),
					#arena .card > .suit-num > .num,
					#arena .card > .tempsuitnum > .num,
					#arena .card > .info:not(.gaintag),
					#window .card > .suit-num > .num,
					#window .card > .tempsuitnum > .num,
					#window .card > .info:not(.gaintag),
					.dialog .card > .suit-num > .num,
					.dialog .card > .tempsuitnum > .num,
					.dialog .card > .info:not(.gaintag),
					.popup .card > .suit-num > .num,
					.popup .card > .tempsuitnum > .num,
					.popup .card > .info:not(.gaintag),
					.handcards > .card > .suit-num > .num,
					.handcards > .card > .tempsuitnum > .num,
					.handcards > .card > .info:not(.gaintag),
					.buttons .card > .suit-num > .num,
					.buttons .card > .tempsuitnum > .num,
					.buttons .card > .info:not(.gaintag) {
						-webkit-filter: blur(${suitBlurValue}px) !important;
						filter: blur(${suitBlurValue}px) !important;
						text-shadow: 0 0 ${suitShadowBlur}px currentColor !important;
						-webkit-font-smoothing: antialiased !important;
						text-rendering: geometricPrecision !important;
					}
					`;
					if (!suitImageEnabled) {
						css += `
						/* 未启用图片花色时，继续柔化字体花色 */
						.card > .suit-num > .suit,
						.card > .tempsuitnum > .suit,
						#arena .card > .suit-num > .suit,
						#arena .card > .tempsuitnum > .suit,
						#window .card > .suit-num > .suit,
						#window .card > .tempsuitnum > .suit,
						.dialog .card > .suit-num > .suit,
						.dialog .card > .tempsuitnum > .suit,
						.popup .card > .suit-num > .suit,
						.popup .card > .tempsuitnum > .suit,
						.handcards > .card > .suit-num > .suit,
						.handcards > .card > .tempsuitnum > .suit,
						.buttons .card > .suit-num > .suit,
						.buttons .card > .tempsuitnum > .suit {
							-webkit-filter: blur(${suitBlurValue}px) !important;
							filter: blur(${suitBlurValue}px) !important;
							text-shadow: 0 0 ${suitShadowBlur}px currentColor !important;
							-webkit-font-smoothing: antialiased !important;
							text-rendering: geometricPrecision !important;
						}
						`;
					}
				}

				// 用图片替换卡牌左上角花色字体
				if (!originalCardStylePriority && lib.config.extension_HH优化_enable_card_suit_image !== false) {
					const suitImageSize = Math.max(8, Math.min(40, getConfigFloat('card_suit_image_size', 16)));
					const suitImageBase = lib.assetURL + 'extension/HH优化/card suit/';
					const suitImageVersion = '?hh_suit_image=1';
					const suitImageCss = {
						heart: suitImageBase + 'fanjian_hongtao.png' + suitImageVersion,
						diamond: suitImageBase + 'fanjian_fangpian.png' + suitImageVersion,
						spade: suitImageBase + 'fanjian_heitao.png' + suitImageVersion,
						club: suitImageBase + 'fanjian_meihua.png' + suitImageVersion
					};
					css += `
					/* 用图片替换卡牌花色字体，优先覆盖HH优化 */
					.card > .suit-num > .suit,
					.card > .tempsuitnum > .suit,
					#arena .card > .suit-num > .suit,
					#arena .card > .tempsuitnum > .suit,
					#window .card > .suit-num > .suit,
					#window .card > .tempsuitnum > .suit,
					.dialog .card > .suit-num > .suit,
					.dialog .card > .tempsuitnum > .suit,
					.popup .card > .suit-num > .suit,
					.popup .card > .tempsuitnum > .suit,
					.handcards > .card > .suit-num > .suit,
					.handcards > .card > .tempsuitnum > .suit,
					.buttons .card > .suit-num > .suit,
					.buttons .card > .tempsuitnum > .suit {
						display: inline-block !important;
						width: ${suitImageSize}px !important;
						height: ${suitImageSize}px !important;
						color: transparent !important;
						font-size: 0 !important;
						line-height: 0 !important;
						text-shadow: none !important;
						background-repeat: no-repeat !important;
						background-position: center center !important;
						background-size: contain !important;
						vertical-align: top !important;
					}
					.card[data-suit="heart"] > .suit-num > .suit,
					.card[data-tempsn="heart"] > .tempsuitnum > .suit,
					#arena .card[data-suit="heart"] > .suit-num > .suit,
					#arena .card[data-tempsn="heart"] > .tempsuitnum > .suit,
					#window .card[data-suit="heart"] > .suit-num > .suit,
					#window .card[data-tempsn="heart"] > .tempsuitnum > .suit,
					.dialog .card[data-suit="heart"] > .suit-num > .suit,
					.dialog .card[data-tempsn="heart"] > .tempsuitnum > .suit,
					.popup .card[data-suit="heart"] > .suit-num > .suit,
					.popup .card[data-tempsn="heart"] > .tempsuitnum > .suit,
					.handcards > .card[data-suit="heart"] > .suit-num > .suit,
					.handcards > .card[data-tempsn="heart"] > .tempsuitnum > .suit,
					.buttons .card[data-suit="heart"] > .suit-num > .suit,
					.buttons .card[data-tempsn="heart"] > .tempsuitnum > .suit {
						background-image: url("${suitImageCss.heart}") !important;
					}
					.card[data-suit="diamond"] > .suit-num > .suit,
					.card[data-tempsn="diamond"] > .tempsuitnum > .suit,
					#arena .card[data-suit="diamond"] > .suit-num > .suit,
					#arena .card[data-tempsn="diamond"] > .tempsuitnum > .suit,
					#window .card[data-suit="diamond"] > .suit-num > .suit,
					#window .card[data-tempsn="diamond"] > .tempsuitnum > .suit,
					.dialog .card[data-suit="diamond"] > .suit-num > .suit,
					.dialog .card[data-tempsn="diamond"] > .tempsuitnum > .suit,
					.popup .card[data-suit="diamond"] > .suit-num > .suit,
					.popup .card[data-tempsn="diamond"] > .tempsuitnum > .suit,
					.handcards > .card[data-suit="diamond"] > .suit-num > .suit,
					.handcards > .card[data-tempsn="diamond"] > .tempsuitnum > .suit,
					.buttons .card[data-suit="diamond"] > .suit-num > .suit,
					.buttons .card[data-tempsn="diamond"] > .tempsuitnum > .suit {
						background-image: url("${suitImageCss.diamond}") !important;
					}
					.card[data-suit="spade"] > .suit-num > .suit,
					.card[data-tempsn="spade"] > .tempsuitnum > .suit,
					#arena .card[data-suit="spade"] > .suit-num > .suit,
					#arena .card[data-tempsn="spade"] > .tempsuitnum > .suit,
					#window .card[data-suit="spade"] > .suit-num > .suit,
					#window .card[data-tempsn="spade"] > .tempsuitnum > .suit,
					.dialog .card[data-suit="spade"] > .suit-num > .suit,
					.dialog .card[data-tempsn="spade"] > .tempsuitnum > .suit,
					.popup .card[data-suit="spade"] > .suit-num > .suit,
					.popup .card[data-tempsn="spade"] > .tempsuitnum > .suit,
					.handcards > .card[data-suit="spade"] > .suit-num > .suit,
					.handcards > .card[data-tempsn="spade"] > .tempsuitnum > .suit,
					.buttons .card[data-suit="spade"] > .suit-num > .suit,
					.buttons .card[data-tempsn="spade"] > .tempsuitnum > .suit {
						background-image: url("${suitImageCss.spade}") !important;
					}
					.card[data-suit="club"] > .suit-num > .suit,
					.card[data-tempsn="club"] > .tempsuitnum > .suit,
					#arena .card[data-suit="club"] > .suit-num > .suit,
					#arena .card[data-tempsn="club"] > .tempsuitnum > .suit,
					#window .card[data-suit="club"] > .suit-num > .suit,
					#window .card[data-tempsn="club"] > .tempsuitnum > .suit,
					.dialog .card[data-suit="club"] > .suit-num > .suit,
					.dialog .card[data-tempsn="club"] > .tempsuitnum > .suit,
					.popup .card[data-suit="club"] > .suit-num > .suit,
					.popup .card[data-tempsn="club"] > .tempsuitnum > .suit,
					.handcards > .card[data-suit="club"] > .suit-num > .suit,
					.handcards > .card[data-tempsn="club"] > .tempsuitnum > .suit,
					.buttons .card[data-suit="club"] > .suit-num > .suit,
					.buttons .card[data-tempsn="club"] > .tempsuitnum > .suit {
						background-image: url("${suitImageCss.club}") !important;
					}
					`;
				}

				// 用图片替换卡牌左上角点数字母
				if (!originalCardStylePriority && lib.config.extension_HH优化_enable_card_rank_image !== false) {
					const rankImageHeight = Math.max(12, Math.min(60, getConfigFloat('card_rank_image_height', 24)));
					const rankImageWidth = Math.round(rankImageHeight * 45 / 60);
					const rankImageBase = lib.assetURL + 'extension/HH优化/card shuzi/';
					const rankImageVersion = '?hh_rank_image=1';
					const rankImageKeys = [];
					['red', 'black'].forEach(function(color) {
						['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'].forEach(function(rank) {
							rankImageKeys.push(color + '-' + rank);
						});
					});
					const rankImageRules = rankImageKeys.map(function(key) {
						return `.card [data-hh-rank-image="${key}"] { background-image: url("${rankImageBase + key + '.png' + rankImageVersion}") !important; }`;
					}).join('\n');
					css += `
					/* 点数字母使用图片，优先覆盖HH优化 */
					.card > .suit-num > span[data-hh-rank-image],
					.card .num[data-hh-rank-image],
					.card > .info:not(.gaintag) > span[data-hh-rank-image],
					#arena .card > .suit-num > span[data-hh-rank-image],
					#arena .card .num[data-hh-rank-image],
					#arena .card > .info:not(.gaintag) > span[data-hh-rank-image],
					#window .card > .suit-num > span[data-hh-rank-image],
					#window .card .num[data-hh-rank-image],
					#window .card > .info:not(.gaintag) > span[data-hh-rank-image],
					.dialog .card > .suit-num > span[data-hh-rank-image],
					.dialog .card .num[data-hh-rank-image],
					.dialog .card > .info:not(.gaintag) > span[data-hh-rank-image],
					.popup .card > .suit-num > span[data-hh-rank-image],
					.popup .card .num[data-hh-rank-image],
					.popup .card > .info:not(.gaintag) > span[data-hh-rank-image],
					.handcards > .card > .suit-num > span[data-hh-rank-image],
					.handcards > .card .num[data-hh-rank-image],
					.handcards > .card > .info:not(.gaintag) > span[data-hh-rank-image],
					.buttons .card > .suit-num > span[data-hh-rank-image],
					.buttons .card .num[data-hh-rank-image],
					.buttons .card > .info:not(.gaintag) > span[data-hh-rank-image] {
						display: inline-block !important;
						width: ${rankImageWidth}px !important;
						height: ${rankImageHeight}px !important;
						color: transparent !important;
						font-size: 0 !important;
						line-height: 0 !important;
						text-shadow: none !important;
						background-repeat: no-repeat !important;
						background-position: center center !important;
						background-size: contain !important;
						vertical-align: top !important;
						-webkit-filter: none !important;
						filter: none !important;
					}
					.card > .info:not(.gaintag)[data-hh-rank-image-info],
					#arena .card > .info:not(.gaintag)[data-hh-rank-image-info],
					#window .card > .info:not(.gaintag)[data-hh-rank-image-info],
					.dialog .card > .info:not(.gaintag)[data-hh-rank-image-info],
					.popup .card > .info:not(.gaintag)[data-hh-rank-image-info],
					.handcards > .card > .info:not(.gaintag)[data-hh-rank-image-info],
					.buttons .card > .info:not(.gaintag)[data-hh-rank-image-info] {
						-webkit-filter: none !important;
						filter: none !important;
					}
					${rankImageRules}
					`;
				}

				// 界面裁剪样式 - 不缩放，只裁剪左右区域
				if (enableCrop) {
					const totalCrop = cropLeft + cropRight;
					if (totalCrop > 0) {
						css += `
						/* 界面裁剪 - 裁掉左右空白区域，不缩放保持比例 */
						html, body {
							overflow: hidden !important;
						}
						#window {
							margin-left: ${-cropLeft}px !important;
							margin-right: ${-cropRight}px !important;
							width: calc(100% + ${totalCrop}px) !important;
						}
						/* 左上角按钮往右移动，避免被裁剪 */
						#system > #system1 {
							margin-left: ${cropLeft}px !important;
						}
						/* 右上角按钮往左移动，避免被裁剪 */
						#system > #system2 {
							margin-right: ${cropRight}px !important;
						}
						`;
					}
				}
				
				customStyleEl.textContent = css;
				
				// 发光边框使用insertRule方式插入高优先级规则
				// 清除之前插入的规则
				if (window._speedControlGlowRules) {
					window._speedControlGlowRules.forEach(sheet => {
						try {
							while (sheet.cssRules.length > 0) {
								sheet.deleteRule(0);
							}
						} catch (e) {}
					});
				}
				window._speedControlGlowRules = [];
				
				// 创建新的style元素并使用insertRule
				let glowStyleEl = document.getElementById('speed_control_glow_style');
				if (!glowStyleEl) {
					glowStyleEl = document.createElement('style');
					glowStyleEl.id = 'speed_control_glow_style';
					document.body.appendChild(glowStyleEl);
				}
				
				const sheet = glowStyleEl.sheet;
				if (sheet) {
					window._speedControlGlowRules.push(sheet);
					// 清除现有规则
					while (sheet.cssRules.length > 0) {
						sheet.deleteRule(0);
					}
					
					// Clear legacy sprite transforms; source-player-glow.css uses the live rail geometry.
					const rules = [
						'#arena > .player::before { transform: none !important; }',
						'#arena > .player::after { transform: none !important; }'
					];
					rules.forEach(rule => {
						try {
							sheet.insertRule(rule, sheet.cssRules.length);
						} catch (e) {
							console.log('[HH优化] 插入CSS规则失败:', rule, e);
						}
					});
				}
			};

			// 初始化时应用样式
			updateCustomStyle();

			// 将更新函数挂载到全局，供配置项调用
			window._speedControlUpdateStyle = updateCustomStyle;

			const updateCardRankImages = function(root) {
				const enabled = !originalCardStylePriority && lib.config.extension_HH优化_enable_card_rank_image !== false;
				const scope = root && root.querySelectorAll ? root : document;
				const rankSelector = '.card > .suit-num > span:first-child, .card > .suit-num > .num, .card > .tempsuitnum > .num, .card > .info:not(.gaintag) > span:last-child';
				const cleanupSelector = '[data-hh-rank-image], [data-hh-rank-image-info]';
				const nodes = [];
				const validRanks = {
					A: true,
					'2': true,
					'3': true,
					'4': true,
					'5': true,
					'6': true,
					'7': true,
					'8': true,
					'9': true,
					'10': true,
					J: true,
					Q: true,
					K: true
				};
				const normalizeRankText = function(text) {
					return (text || '').replace(/\s+/g, '').replace(/[Ａ-Ｚ０-９]/g, function(ch) {
						return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
					}).toUpperCase();
				};
				if (!window._HH_cardRankImageReady) {
					window._HH_cardRankImageReady = {};
				}
				const ensureRankImageReady = function(key) {
					const cache = window._HH_cardRankImageReady;
					if (cache[key] !== undefined) return cache[key] === true;
					cache[key] = 'loading';
					const image = new Image();
					image.onload = function() {
						cache[key] = true;
						if (window._HH_updateCardRankImages) {
							window._HH_updateCardRankImages();
						}
					};
					image.onerror = function() {
						cache[key] = false;
					};
					image.src = lib.assetURL + 'extension/HH优化/card shuzi/' + key + '.png?hh_rank_probe=1';
					return false;
				};
				const pushNode = function(node) {
					if (node && node.nodeType === 1) nodes.push(node);
				};
				if (scope.nodeType === 1 && scope.matches && scope.matches(rankSelector)) {
					pushNode(scope);
				}
				if (scope.querySelectorAll) {
					scope.querySelectorAll(rankSelector).forEach(pushNode);
				}
				if (!enabled) {
					if (scope.nodeType === 1 && scope.matches && scope.matches(cleanupSelector)) {
						scope.removeAttribute('data-hh-rank-image');
						scope.removeAttribute('data-hh-rank-image-info');
					}
					if (scope.querySelectorAll) {
						scope.querySelectorAll(cleanupSelector).forEach(function(node) {
							node.removeAttribute('data-hh-rank-image');
							node.removeAttribute('data-hh-rank-image-info');
						});
					}
					return;
				}
				nodes.forEach(function(node) {
					const card = node.closest && node.closest('.card');
					const info = node.parentNode && node.parentNode.classList && node.parentNode.classList.contains('info') ? node.parentNode : null;
					const suit = card && card.dataset ? (card.dataset.suit || card.dataset.tempsn || '') : '';
					const isRed = suit === 'heart' || suit === 'diamond' || !!(info && info.classList.contains('red'));
					const isBlack = suit === 'spade' || suit === 'club' || !!(info && !info.classList.contains('red'));
					const rankText = normalizeRankText(node.textContent);
					const color = isRed ? 'red' : (isBlack ? 'black' : '');
					const imageKey = color && validRanks[rankText] ? color + '-' + rankText : '';
					if (imageKey && ensureRankImageReady(imageKey)) {
						node.dataset.hhRankImage = imageKey;
						if (info) info.dataset.hhRankImageInfo = imageKey;
					} else {
						node.removeAttribute('data-hh-rank-image');
						if (info) info.removeAttribute('data-hh-rank-image-info');
					}
				});
			};
			const scheduleCardRankImageUpdate = function() {
				if (window._HH_cardRankImageTimer) return;
				const run = function() {
					window._HH_cardRankImageTimer = null;
					updateCardRankImages(document);
				};
				window._HH_cardRankImageTimer = true;
				if (typeof requestAnimationFrame == 'function') {
					requestAnimationFrame(run);
				} else {
					setTimeout(run, 16);
				}
			};
			window._HH_updateCardRankImages = function() {
				updateCardRankImages(document);
			};
			updateCardRankImages(document);
			if (window._HH_cardRankImageObserver && window._HH_cardRankImageObserver.disconnect) {
				window._HH_cardRankImageObserver.disconnect();
			}
			if (!originalCardStylePriority && document.body && typeof MutationObserver == 'function') {
				window._HH_cardRankImageObserver = new MutationObserver(function(mutations) {
					for (let i = 0; i < mutations.length; i++) {
						const mutation = mutations[i];
						if (mutation.type === 'childList' || mutation.type === 'characterData' || mutation.attributeName === 'data-suit' || mutation.attributeName === 'data-tempsn' || mutation.attributeName === 'class') {
							scheduleCardRankImageUpdate();
							break;
						}
					}
				});
				window._HH_cardRankImageObserver.observe(document.body, {
					childList: true,
					subtree: true,
					characterData: true,
					attributes: true,
					attributeFilter: ['data-suit', 'data-tempsn', 'class']
				});
			}
			if (!lib.arenaReady) lib.arenaReady = [];
			lib.arenaReady.push(function() {
				updateCardRankImages(document);
			});

			// 监听窗口大小变化，更新裁剪缩放比例
			if (!window._speedControlResizeListener) {
				window._speedControlResizeListener = true;
				let resizeTimeout;
				window.addEventListener('resize', function() {
					clearTimeout(resizeTimeout);
					resizeTimeout = setTimeout(function() {
						if (window._speedControlUpdateStyle) {
							window._speedControlUpdateStyle();
						}
					}, 100);
				});
			}

			// ========== 强制覆盖卡背样式 ==========
			// 使用与HH优化完全相同的方式设置卡背
			const applyCardbackStyle = function() {
				// 移除之前的卡背样式
				const oldStyle = document.getElementById('speed_control_cardback');
				if (oldStyle) oldStyle.remove();
				
				// 使用扩展名 "HH优化" 作为目录名
				const extName = 'HH优化';
				const cardBackUrl = `${lib.assetURL}extension/${extName}/assets/image/kb1.png`;
				
				// 创建样式 - 使用与HH优化完全相同的格式
				const style = document.createElement('style');
				style.id = 'speed_control_cardback';
				style.innerHTML = `.card:empty,.card.infohidden{background:url('${cardBackUrl}');background-size:100% 100% !important;}`;
				document.head.appendChild(style);
			};
			
			// 立即应用
			applyCardbackStyle();
			
			// 在 arenaReady 时再次应用
			if (!lib.arenaReady) lib.arenaReady = [];
			lib.arenaReady.push(function() {
				applyCardbackStyle();
			});

			// ========== 覆盖HH优化 online卡牌皮肤 ==========
			if (!originalCardStylePriority && HH_getConfig(config, 'enable_online_card_replace', true)) {
				const hhOnlineCardSkinNames = [
					'bagua', 'baiyin', 'bingliang', 'sha_ice', 'chitu', 'cixiong', 'dawan', 'dilu',
					'fangtian', 'guanshi', 'guding', 'guohe', 'hanbing', 'hualiu', 'huogong', 'sha_fire',
					'jiedao', 'jiu', 'juedou', 'jueying', 'lebu', 'sha_thunder', 'muniu', 'nanman',
					'qilin', 'qinggang', 'qinglong', 'renwang', 'sha', 'shan', 'shandian', 'shunshou',
					'tao', 'taoyuan', 'tengjia', 'tiesuo', 'wanjian', 'wugu', 'wuxie', 'wuzhong',
					'zhangba', 'zhuahuang', 'zhuge', 'zhuque', 'zixin'
				];
				const hhOnlineCardSkinSet = {};
				hhOnlineCardSkinNames.forEach(function(name) {
					hhOnlineCardSkinSet[name] = true;
				});
				const hhOnlineCardSkinBase = lib.assetURL + 'extension/HH优化/image/card-skins/online/';
				const hhOnlineCardSkinVersion = '?hh_opaque=1';
				const getHHOnlineCardSkinName = function(card) {
					if (!card || !card.name) return null;
					let name = card.name;
					if (name === 'sha' && card.nature && !Array.isArray(card.nature)) {
						try {
							const natures = get.natureList(card.nature).sort(lib.sort.nature);
							name += '_' + natures.join('_');
						} catch (e) {}
					}
					return hhOnlineCardSkinSet[name] ? name : null;
				};
				const refreshHHOnlineCardSkin = function(card) {
					if (!card || !card.classList || card.classList.contains('infohidden')) return;
					const name = getHHOnlineCardSkinName(card);
					if (!name) return;
					card.style.background = 'url("' + hhOnlineCardSkinBase + name + '.png' + hhOnlineCardSkinVersion + '")';
					card.classList.add('decade-card');
				};
				const applyHHOnlineCardSkinReplace = function(refreshVisible) {
					const decadeCards = window.decadeUI && window.decadeUI.statics && window.decadeUI.statics.cards;
					if (!decadeCards) return false;
					const onlineCache = decadeCards.online || (decadeCards.online = {});
					hhOnlineCardSkinNames.forEach(function(name) {
						onlineCache[name] = {
							name: name,
							url: hhOnlineCardSkinBase + name + '.png' + hhOnlineCardSkinVersion,
							loaded: true
						};
					});
					if (refreshVisible && lib.config.extension_HH优化_cardPrettify === 'online') {
						document.querySelectorAll('.card').forEach(refreshHHOnlineCardSkin);
					}
					return true;
				};
				window._HH_applyOnlineCardSkinReplace = function() {
					return applyHHOnlineCardSkinReplace(true);
				};
				let hhOnlineCardSkinTries = 0;
				const tryApplyHHOnlineCardSkinReplace = function() {
					hhOnlineCardSkinTries++;
					const applied = applyHHOnlineCardSkinReplace(true);
					if (!applied && hhOnlineCardSkinTries < 80) {
						setTimeout(tryApplyHHOnlineCardSkinReplace, 500);
					}
				};
				tryApplyHHOnlineCardSkinReplace();
				if (!lib.arenaReady) lib.arenaReady = [];
				lib.arenaReady.push(function() {
					applyHHOnlineCardSkinReplace(true);
				});
			}

			// ========== 覆盖HH优化阵亡图片 ==========
			if (config.enable_dead_image_override) {
				// HH优化扩展中存在的阵亡图片列表
				const deadImageList = ['dead4_fan', 'dead4_nei', 'dead4_zhong'];
				const hhDeadPath = lib.assetURL + 'extension/HH优化/image/decorationo/';
				
				// 替换阵亡图片URL的函数
				const replaceDeadImageUrl = function(url) {
					if (typeof url !== 'string') return url;
					for (const img of deadImageList) {
						// 匹配HH优化的阵亡图片路径
						if (url.includes('decorationo/' + img + '.png')) {
							return 'url("' + hhDeadPath + img + '.png")';
						}
					}
					return null;
				};
				
				// 检查并替换元素的背景图片
				const checkAndReplaceDeadImage = function(element) {
					if (!element || !element.style) return;
					const bgImage = element.style.backgroundImage;
					if (bgImage) {
						const newUrl = replaceDeadImageUrl(bgImage);
						if (newUrl) {
							element.style.backgroundImage = newUrl;
						}
					}
				};
				
				// 使用MutationObserver监听DOM变化
				const observer = new MutationObserver(function(mutations) {
					mutations.forEach(function(mutation) {
						// 检查新添加的节点
						if (mutation.addedNodes) {
							mutation.addedNodes.forEach(function(node) {
								if (node.nodeType === 1) { // Element节点
									checkAndReplaceDeadImage(node);
									// 检查子元素
									if (node.querySelectorAll) {
										node.querySelectorAll('.died-identity').forEach(checkAndReplaceDeadImage);
									}
								}
							});
						}
						// 检查属性变化
						if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
							checkAndReplaceDeadImage(mutation.target);
						}
					});
				});
				
				// 开始监听
				observer.observe(document.body, {
					childList: true,
					subtree: true,
					attributes: true,
					attributeFilter: ['style']
				});
				
				// 定期检查已存在的阵亡图片元素
				setInterval(function() {
					document.querySelectorAll('.died-identity').forEach(checkAndReplaceDeadImage);
				}, 500);
			}

			// ========== 连斩特效功能 ==========
			if (HH_getConfig(config, 'enable_kill_combo', false)) {
				game.hhKillCombo?.stop();
				game.hhKillCombo = createKillComboPlayer({ lib, game, ui });
				game.hhKillCombo.preload(1).catch(error => console.warn('[HH优化] 连斩预加载失败，将在触发时重试', error));
				if (Array.isArray(lib.onover)) lib.onover.push(() => game.hhKillCombo.stop());
				// 连斩击杀特效
				lib.skill._HH_lianzhan_ = {
					trigger: {
						source: "dieBegin",
					},
					silent: true,
					charlotte: true,
					forced: true,
					priority: 2022,
					filter: function (event, player) {
						return event && event.source === player && !event._HH_lianzhan_done;
					},
					content: async function (event, trigger, player) {
						if (trigger._HH_lianzhan_done) return;
						trigger._HH_lianzhan_done = true;
						if (!player.storage._HH_lianzhan_) player.storage._HH_lianzhan_ = 0;
						player.storage._HH_lianzhan_++;
						
						const count = player.storage._HH_lianzhan_;
						const names = ['一破', '双连', '三连', '四连', '五连', '六连', '七连'];
						const index = Math.min(count, 7);

						// 一破时检查是否已有人触发过
						if (count == 1) {
							if (player.storage._HH_lianzhan_triggered) { event.finish(); return; }
							for (var i of game.players.concat(game.dead || [])) i.storage._HH_lianzhan_triggered = true;
						}
						
						if (lib.config.extension_HH优化_show_combo_text !== false) {
							player.popup(names[index - 1], 'fire');
						}
						// Both the original track and its voice start after the atlases are ready.
						await game.hhKillCombo.play(index);
					},
				};
				
				// 回合结束清除连斩计数
				lib.skill._HH_lianzhan_delete_ = {
					trigger: {
						player: "phaseJieshuBegin",
					},
					silent: true,
					charlotte: true,
					forced: true,
					content: function () {
						delete player.storage._HH_lianzhan_;
						delete player.storage._HH_lianzhan_triggered;
					},
				};
				
				// 癫狂屠戮 - 造成3点伤害时触发
				lib.skill._HH_diankuangtulu_ = {
					trigger: {
						source: 'damageBegin4',
					},
					charlotte: true,
					forced: true,
					silent: true,
					filter: function (event, player) {
						return event.num == 3;
					},
					content: function () {
						game.playAudio('../extension/HH优化/audio/diankuangtulu.mp3');
						if (lib.config.extension_HH优化_show_combo_text !== false) {
							player.popup('癫狂屠戮', 'thunder');
						}
					},
				};
				
				// 无双万军取首 - 造成4点及以上伤害时触发
				lib.skill._HH_wanjunqushou_ = {
					trigger: {
						source: 'damageBegin4',
					},
					charlotte: true,
					forced: true,
					silent: true,
					filter: function (event, player) {
						return event.num >= 4;
					},
					content: function () {
						game.playAudio('../extension/HH优化/audio/wanjunqushou.mp3');
						if (lib.config.extension_HH优化_show_combo_text !== false) {
							player.popup('万军取首', 'metal');
						}
					},
				};
				HH_finishSkills(['_HH_lianzhan_', '_HH_lianzhan_delete_', '_HH_diankuangtulu_', '_HH_wanjunqushou_']);
			}

			// 音频替换功能
			if (config.enable_audio_replace) {
				const extName = 'HH优化';
				
				// 硬编码白名单 - 这些是扩展目录下存在的音频文件
				const audioWhitelist = new Set([
					'damage.mp3', 'damage2.mp3',
					'damage_fire.mp3', 'damage_fire2.mp3',
					'damage_thunder.mp3', 'damage_thunder2.mp3',
					'equip1.mp3', 'equip2.mp3', 'equip3.mp3', 'equip4.mp3', 'equip5.mp3',
					'loseHp.mp3', 'hpLossSund.mp3'
				]);
				
				// 防止重复包装
				if (!game._HHAudioWrapped) {
					game._HHAudioWrapped = true;
					
					// 保存原始的 playAudio
					const originalPlayAudio = game.playAudio;
					
					// 覆盖 playAudio 函数
					game.playAudio = function(...args) {
						// 解析参数，获取路径
						let path = '';
						if (args.length === 1 && typeof args[0] === 'object' && args[0].path) {
							path = args[0].path;
						} else {
							path = args.filter(arg => typeof arg === 'string' || typeof arg === 'number').join('/');
						}
						
						// 提取音频文件名（包含扩展名）
						let audioName = '';
						if (path.includes('/')) {
							const parts = path.split('/');
							audioName = parts[parts.length - 1];
						} else {
							audioName = path;
						}
						
						// 如果文件名没有扩展名，添加 .mp3
						if (audioName && !audioName.includes('.')) {
							audioName = audioName + '.mp3';
						}
						
						// 检查是否在白名单中
						if (audioWhitelist.has(audioName)) {
							// 使用扩展目录下的音频
							// ext: 前缀会被游戏转换为 extension/ 路径
							const newPath = `ext:${extName}/effect/${audioName}`;
							
							if (args.length === 1 && typeof args[0] === 'object') {
								args[0].path = newPath;
							} else {
								// 重新构建参数
								return originalPlayAudio.call(game, newPath);
							}
						}
						
						return originalPlayAudio.apply(game, args);
					};
				}
			}

			setupSourceCardAudio({ lib, game, get, _status }, config);

			// ========== 装备牌移动优化 ==========
			if (config.enable_equip_move_optimize) {
				setupEquipMove({ lib, game, ui, get, _status });
			}
		},
		precontent: async function () {
			if (HH_getConfig(null, 'identity_fullscreen', true)) {
				const selection = await import(/* @vite-ignore */ new URL(lib.assetURL + 'extension/HH优化/identity-selection.js', document.baseURI).href);
				lib.init.css(lib.assetURL + 'extension/HH优化', 'identity-selection');
				selection.installIdentitySelection(lib, game, ui, get, _status);
			}
			// 配置值由扩展菜单系统自动管理
			// 不在这里设置默认值，避免覆盖用户保存的配置
			
			// 强制禁用HH优化的卡背设置，让它不添加卡背样式
			if (!originalCardStylePriority) lib.config.extension_HH优化_cardbj = "kb1";
			
			// ========== 手杀MVP结算画面 ==========
			if (lib.config.extension_HH优化_enable_mvp) {
				const extPath = lib.assetURL + 'extension/HH优化/assets/';
				
				// 加载MVP样式
				lib.init.css(lib.assetURL + 'extension/HH优化/assets', 'mvp');
				
				// 播放MVP音效的函数
				game.playMvpAudio = function(file) {
					game.playAudio('../extension/HH优化/assets/mvp/' + file);
				};
				
				// 注册游戏结束回调
				lib.onover.push(resultbool => {
					var showMVP = function () {
						if (_status.showHHMvp) return false;
						_status.showHHMvp = true;
						
						setTimeout(function() {
							var dialog = Array.from(ui.arena.querySelectorAll(".dialog"));
							dialog.forEach(value => value.hide());
							
							// 播放MVP音效
							game.playMvpAudio('asqx.mp3');
							
							var players = game.players.slice(0);
							game.players = game.players.concat(game.dead);
							
							// 计算局势分数
							if (!_status.showHH局势) {
								game.players.forEach(value => {
									if (game.dead.includes(value)) {
										value.局势分数 -= 20;
									}
									value.getEnemies().forEach(current => {
										if (game.dead.includes(current) || current.isDead()) {
											value.局势分数 += 2;
										}
									});
									value.getFriends().forEach(current => {
										if (current.isDead() || game.dead.includes(current)) {
											value.局势分数 -= 2;
										}
									});
								});
							}
							_status.showHH局势 = true;
							game.players = players;
							
							// 排序找出MVP
							var sorts = game.players.concat(game.dead).sort((a, b) => (b.mvpCount || 0) - (a.mvpCount || 0));
							var player = sorts[0];
							
							// 创建MVP界面
							var popuperContainer = ui.create.div('.popup-container', {background: "rgb(0,0,0,.7)"}, ui.window);
							popuperContainer.addEventListener('click', event => {
								event.stopPropagation();
								popuperContainer.delete(200);
								dialog.forEach(value => value.show());
								_status.showHHMvp = false;
							});
							
							// 播放MVP武将技能语音
							var skills = player.skills.filter(value => lib.skill[value] && lib.skill[value].audio);
							if (skills.length) game.trySkillAudio(skills.randomGet(), player, true);
							
							var qycontainer = ui.create.div('.qy-mvp-container', popuperContainer);
							var backgroundRight = ui.create.div('.qy-mvp-piaodai-right', qycontainer);
							var container = ui.create.div('.qy-center-container', qycontainer);
							var backgroundLeft = ui.create.div('.qy-mvp-piaodai-left', qycontainer);
							
							var avatarbox = ui.create.div('.qy-mvp-avatarbox', container);
							if (navigator.userAgent.match(/(Android|iPhone|SymbianOS|Windows Phone|iPad|iPod)/i) !== null) {
								avatarbox.style.height = '120%';
								avatarbox.style.top = '-4%';
							}
							
							var avatarborder = ui.create.div('.qy-mvp-avatarborder', avatarbox);
							avatarborder.dataset.name = get.translation(player.name);
							avatarborder.setBackgroundImage('extension/HH优化/assets/mvp/border_' + player.group + '.png');
							
							// 边框图片加载失败时使用默认
							var image = new Image();
							image.src = extPath + 'mvp/border_' + player.group + '.png';
							image.onerror = function () {
								avatarborder.setBackgroundImage('extension/HH优化/assets/mvp/border_qun.png');
							};
							
							// 星星评级
							var xing = ui.create.div(avatarbox, '.qy-mvp-xing');
							var rarity = game.getRarity ? game.getRarity(player.name) : 'common';
							var num = 1;
							switch (rarity) {
								case 'legend': num = 5; break;
								case 'epic': num = 4; break;
								case 'rare': num = 3; break;
								case 'junk': num = 2; break;
								default: num = 1; break;
							}
							for (var i = 0; i < num; i++) ui.create.div('.item.on', xing);
							for (var i = 0; i < 5 - num; i++) ui.create.div('.item.off', xing);
							
							// 武将头像
							var avatar = ui.create.div('.qy-mvp-avatar', avatarbox);
							avatar.style.backgroundImage = player.node.avatar.style.backgroundImage;
							avatar.style.top = '23.6%';
							avatar.style.height = '54%';
							
							// 信息面板
							var qyInfo = ui.create.div('.qy-mvp-qyInfo', container);
							ui.create.div('.qy-mvp-title', qyInfo);
							var qycenter = ui.create.div('.qy-mvp-center', qyInfo);
							ui.create.div('.qy-mvp-icon', qycenter);
							var qyPlayerInfo = ui.create.div('.qy-player-info', qycenter);
							ui.create.div(qyPlayerInfo, '.qy-mvp-name-title', '玩家昵称');
							
							var nickname = ui.create.div('.qy-mvp-player-nickname', qyPlayerInfo, 
								player === game.me ? (lib.config.connect_nickname || get.translation(player.name)) : get.translation(player.name));
							if (game.me === player) {
								var meTag = ui.create.node('img', nickname);
								meTag.src = extPath + 'mvp/mvp_me_tag.png';
							}
							
							ui.create.div(qyPlayerInfo, '.qy-mvp-name-title', '技术分：' + (player.mvpCount || 0));
							
							// 分数详情
							var qyScoreInfo = ui.create.div('.qy-mvp-scoreInfo', qyInfo);
							var table = ui.create.node('table', qyScoreInfo, {width: "100%"});
							var list = ['攻击分数', '治疗分数', '辅助分数', '局势分数', '惩罚扣分'];
							list.forEach(value => {
								var tr = ui.create.node('tr', table);
								tr.style.color = 'rgb(234, 138, 76)';
								var td = ui.create.node('td', tr, value);
								var num = (player[value] || 0);
								var num2 = sorts[1] ? (sorts[1][value] || 0) : 0;
								ui.create.node('td', tr).innerHTML = num + (num - num2 >= 30 ? '(遥遥领先)' : '');
							});
							
							// 分享按钮（占位）
							ui.create.div('.qy-mvp-share-button', popuperContainer).addEventListener('click', event => {
								event.stopPropagation();
							});
						}, 2000);
					};
					
					ui.create.control("全场最佳", showMVP);
					showMVP();
				});
				
				// 初始化分数属性
				['攻击分数', '治疗分数', '辅助分数', '惩罚扣分'].forEach(value => {
					HTMLDivElement.prototype[value] = 0;
				});
				HTMLDivElement.prototype.局势分数 = 100;
				Object.defineProperty(HTMLDivElement.prototype, 'mvpCount', {
					get: function () {
						return (this.攻击分数 || 0) + (this.治疗分数 || 0) + (this.辅助分数 || 0) + (this.局势分数 || 0) - (this.惩罚扣分 || 0);
					},
					set: function () {},
					configurable: true
				});
				
				// MVP计分技能
				lib.skill['_HH_mvp_damage'] = {
					trigger: { player: 'useCard', source: 'damageSource' },
					direct: true, forced: true, firstDo: true, silent: true, popup: false,
					filter: function (event, player, name) {
						if (name === 'useCard') {
							if (!event.card) return false;
							if (get.tag({name: event.card.name}, 'damage')) return true;
							if (event.card.name === 'wuxie') return true;
							if (get.info(event.card).toself || get.type(event.card) !== 'trick') return false;
							if (get.info(event.card).selectTarget === -1 || get.info(event.card).selectTarget > 1) return true;
							return false;
						}
						if (event.player == event.source) return false;
						if (event.source.identity == 'nei') return true;
						return get.attitude(event.source, event.player) < 0;
					},
					content: function () {
						if (event.triggername === 'damageSource') {
							if (get.attitude(trigger.source, trigger.player) < 0 || trigger.source.identity == 'nei') {
								trigger.source.攻击分数 += Math.min(trigger.num * 3, 15);
							}
						} else if (trigger.card) {
							if (get.tag({name: trigger.card.name}, 'damage')) player.攻击分数 += 2;
							if (trigger.card.name === 'wuxie') player.辅助分数 += 2;
							if ((get.info(trigger.card).selectTarget === -1 || get.info(trigger.card).selectTarget > 1) && 
								(!get.info(trigger.card).toself && get.type(trigger.card) === 'trick')) player.辅助分数 += 1;
						}
					}
				};
				
				lib.skill['_HH_mvp_assist'] = {
					trigger: { player: ['gainEnd', 'discardEnd'] },
					direct: true, forced: true, firstDo: true, silent: true, popup: false,
					filter: function (event, player, name) {
						if (!event.source || event.source == player || !event.source.isIn()) return false;
						if (!event.cards || event.cards.length == 0) return false;
						if (event.source.identity == 'nei') return true;
						return event.player.getEnemies().includes(event.source);
					},
					content: function () {
						if (event.triggername == 'gainEnd') trigger.player.辅助分数 += trigger.cards.length;
						if (event.triggername == 'discardEnd') trigger.source.辅助分数 += trigger.cards.length;
					}
				};
				
				lib.skill['_HH_mvp_heal'] = {
					trigger: { player: 'recoverEnd' },
					direct: true, forced: true, firstDo: true, silent: true, popup: false,
					filter: function (event, player) {
						if (!event.source || !event.source.isIn()) return false;
						if (event.source.identity == 'nei') return true;
						return event.player.getFriends().includes(event.source) || event.player == event.source;
					},
					content: function () {
						trigger.source.治疗分数 += Math.min(trigger.num * 2, 10);
					}
				};
				
				lib.skill['_HH_mvp_kill'] = {
					trigger: { source: 'dieBegin' },
					direct: true, forced: true, firstDo: true, silent: true, popup: false,
					filter: function (event, player) {
						return event.source && event.source.isIn();
					},
					content: function () {
						if (trigger.player.getFriends().includes(trigger.source)) {
							trigger.source.惩罚扣分 += 5;
							if (trigger.source.identity == 'nei' && trigger.player.identity != 'zhu') {
								trigger.source.惩罚扣分 -= 5;
								trigger.source.攻击分数 += 3;
							}
						}
						if (trigger.player.getEnemies().includes(trigger.source)) {
							trigger.source.攻击分数 += 3;
						}
					}
				};
				HH_finishSkills(['_HH_mvp_damage', '_HH_mvp_assist', '_HH_mvp_heal', '_HH_mvp_kill']);
			}
		},
		config: {
			identity_fullscreen: {
				name: "全屏选将",
				init: true,
				intro: "身份及斗地主共用全屏选将界面；点击武将查看技能，再点同一张牌确认。换将遵守各玩法的候选范围，固定候选玩法保留原限制。适用于本地标准身份、明忠及斗地主，重启生效。"
			},
			disable_native_kill_effect: {
				name: "关闭原生破敌特效",
				init: false,
				intro: "跳过原生破敌画面、音效及等待时间，不影响连斩特效和死亡结算，即时生效"
			},
			enable_kill_combo: {
				name: "启用连斩特效",
				init: false,
				intro: "开启后，击杀敌人时播放一破至七连的全屏播报动画及对应音效；造成3点伤害触发癫狂屠戮，4点及以上触发万军取首"
			},
			show_combo_text: {
				name: "显示连斩文字",
				init: true,
				intro: "开启后，触发连斩时在角色头上显示文字提示；不影响全屏播报动画"
			},
			enable_mvp: {
				name: "启用MVP结算画面",
				init: false,
				intro: "开启后，游戏结束时显示手杀风格的MVP结算画面，展示全场最佳玩家及各项分数统计"
			},
			enable_dead_image_override: {
				name: "覆盖阵亡图片",
				init: false,
				intro: "开启后，使用内置的阵亡替换图片"
			},
			enable_online_card_replace: {
				name: "替换OL卡牌皮肤",
				init: true,
				intro: "开启后，用自定义卡牌图片替换“卡牌美化”中的OL卡牌样式",
				onclick: function(item) {
					game.saveConfig('extension_HH优化_enable_online_card_replace', item);
					lib.config.extension_HH优化_enable_online_card_replace = item;
					if (item && window._HH_applyOnlineCardSkinReplace) {
						window._HH_applyOnlineCardSkinReplace();
					}
				}
			},
			enable_audio_replace: {
				name: "启用音频替换",
				init: false,
				intro: "替换顺手牵羊顺走牌时及装备入槽时的音效，并保留原有受伤等音效替换"
			},
			enable_equip_move_optimize: {
				name: "装备牌移动优化",
				init: true,
				intro: "装备牌先在目标武将牌左上角展示，再缩小移入装备栏左侧"
			},
			enable_card_suit_color: {
				name: "加深卡牌花色颜色",
				init: false,
				intro: "开启后，卡牌左上角的红色扑克字母数字花色改为#cb1d14，黑色改为#130f06，并优先覆盖HH优化样式",
				onclick: function(item) {
					game.saveConfig('extension_HH优化_enable_card_suit_color', item);
					lib.config.extension_HH优化_enable_card_suit_color = item;
					if (window._speedControlUpdateStyle) {
						window._speedControlUpdateStyle();
					}
				}
			},
			enable_card_suit_blur: {
				name: "柔化扑克字母花色",
				init: true,
				intro: "开启后，轻微模糊卡牌左上角的扑克字母、数字和花色，并覆盖HH优化偏锐利的阴影效果",
				onclick: function(item) {
					game.saveConfig('extension_HH优化_enable_card_suit_blur', item);
					lib.config.extension_HH优化_enable_card_suit_blur = item;
					if (window._speedControlUpdateStyle) {
						window._speedControlUpdateStyle();
					}
				}
			},
			card_suit_blur: {
				name: "扑克字母花色模糊(px)",
				init: "0.35",
				intro: "设置卡牌左上角扑克字母、数字和花色的模糊强度，建议0.25~0.6，默认0.35",
				input: true,
				onblur: function() {
					this.innerHTML = this.innerHTML.replace(/<br>/g, '').trim();
					let value = parseFloat(this.innerHTML);
					if (isNaN(value)) value = 0.35;
					value = Math.max(0, Math.min(2, value));
					this.innerHTML = value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
					game.saveConfig('extension_HH优化_card_suit_blur', this.innerHTML);
					lib.config.extension_HH优化_card_suit_blur = this.innerHTML;
					if (window._speedControlUpdateStyle) {
						window._speedControlUpdateStyle();
					}
				}
			},
			enable_card_suit_image: {
				name: "花色使用图片",
				init: true,
				intro: "开启后，用HH优化/card suit目录下的图片替换卡牌左上角花色字体，优先覆盖HH优化样式",
				onclick: function(item) {
					game.saveConfig('extension_HH优化_enable_card_suit_image', item);
					lib.config.extension_HH优化_enable_card_suit_image = item;
					if (window._speedControlUpdateStyle) {
						window._speedControlUpdateStyle();
					}
				}
			},
			card_suit_image_size: {
				name: "花色图片大小(px)",
				init: "16",
				intro: "设置卡牌左上角花色图片的显示大小，默认16像素",
				input: true,
				onblur: function() {
					this.innerHTML = this.innerHTML.replace(/<br>/g, '').trim();
					let value = parseFloat(this.innerHTML);
					if (isNaN(value)) value = 16;
					value = Math.max(8, Math.min(40, value));
					this.innerHTML = value.toFixed(1).replace(/0+$/, '').replace(/\.$/, '');
					game.saveConfig('extension_HH优化_card_suit_image_size', this.innerHTML);
					lib.config.extension_HH优化_card_suit_image_size = this.innerHTML;
					if (window._speedControlUpdateStyle) {
						window._speedControlUpdateStyle();
					}
				}
			},
			enable_card_rank_image: {
				name: "点数字母使用图片",
				init: true,
				intro: "开启后，用HH优化/card shuzi目录下的red-A到red-K、black-A到black-K图片替换卡牌左上角点数字母，优先覆盖HH优化样式",
				onclick: function(item) {
					game.saveConfig('extension_HH优化_enable_card_rank_image', item);
					lib.config.extension_HH优化_enable_card_rank_image = item;
					if (window._speedControlUpdateStyle) {
						window._speedControlUpdateStyle();
					}
					if (window._HH_updateCardRankImages) {
						window._HH_updateCardRankImages();
					}
				}
			},
			card_rank_image_height: {
				name: "点数字母图片高度(px)",
				init: "24",
				intro: "设置卡牌左上角点数字母图片的显示高度，默认24像素；宽度会按素材比例自动计算",
				input: true,
				onblur: function() {
					this.innerHTML = this.innerHTML.replace(/<br>/g, '').trim();
					let value = parseFloat(this.innerHTML);
					if (isNaN(value)) value = 24;
					value = Math.max(12, Math.min(60, value));
					this.innerHTML = value.toFixed(1).replace(/0+$/, '').replace(/\.$/, '');
					game.saveConfig('extension_HH优化_card_rank_image_height', this.innerHTML);
					lib.config.extension_HH优化_card_rank_image_height = this.innerHTML;
					if (window._speedControlUpdateStyle) {
						window._speedControlUpdateStyle();
					}
					if (window._HH_updateCardRankImages) {
						window._HH_updateCardRankImages();
					}
				}
			},
			suit_num_top: {
				name: "花色数字上下偏移(px)",
				init: "0",
				intro: "设置卡牌左上角花色和数字的上下偏移（像素），正值向下，负值向上，默认0",
				input: true,
				onblur: function() {
					this.innerHTML = this.innerHTML.replace(/<br>/g, '').trim();
					let value = parseInt(this.innerHTML);
					if (isNaN(value)) value = 0;
					value = Math.max(-50, Math.min(50, value));
					this.innerHTML = value;
					game.saveConfig('extension_HH优化_suit_num_top', String(value));
					lib.config.extension_HH优化_suit_num_top = String(value);
					if (window._speedControlUpdateStyle) {
						window._speedControlUpdateStyle();
					}
				}
			},
			suit_num_left: {
				name: "花色数字左右偏移(px)",
				init: "0",
				intro: "设置卡牌左上角花色和数字的左右偏移（像素），正值向右，负值向左，默认0",
				input: true,
				onblur: function() {
					this.innerHTML = this.innerHTML.replace(/<br>/g, '').trim();
					let value = parseInt(this.innerHTML);
					if (isNaN(value)) value = 0;
					value = Math.max(-50, Math.min(50, value));
					this.innerHTML = value;
					game.saveConfig('extension_HH优化_suit_num_left', String(value));
					lib.config.extension_HH优化_suit_num_left = String(value);
					if (window._speedControlUpdateStyle) {
						window._speedControlUpdateStyle();
					}
				}
			},
			speed_multiplier: {
				name: "游戏速度",
				init: "x1",
				item: {
					"x5": "特慢 (×5)",
					"x3.5": "很慢 (×3.5)",
					"x2.5": "慢 (×2.5)",
					"x1.5": "较慢 (×1.5)",
					"x1": "正常 (×1)",
					"x0.7": "较快 (×0.7)",
					"x0.4": "快 (×0.4)",
					"x0.2": "很快 (×0.2)",
					"x0.1": "超快 (×0.1)"
				},
				intro: "调整游戏速度：倍率越大越慢，倍率越小越快",
				onclick: function(item) {
					// 去掉前缀 'x' 获取数值
					const multiplier = parseFloat(item.substring(1));
					game.saveConfig('extension_HH优化_speed_multiplier', multiplier);
					
					// 立即应用速度
					lib.config.extension_HH优化_speed_multiplier = multiplier;
				}
			},
			enable_settlement_optimize: {
				name: "优化结算速度",
				init: true,
				intro: "减少重复布局和移牌停顿，立即生效；保留卡牌、技能、多目标及其他特效的展示时间，不改变游戏速度、动画时长和AI思考设置",
				onclick: function(value) {
					game.saveConfig('extension_HH优化_enable_settlement_optimize', value);
					lib.config.extension_HH优化_enable_settlement_optimize = value;
					game.hhSettlement?.setEnabled(value);
				}
			},
			enable_lord_blind_shot: {
				name: "开局AI主公盲狙",
				init: true,
				intro: "离线身份局中，AI主公按仇恨90%、距离10%锁定盲狙目标，卡牌与技能共同生效；目标偏忠后重选，有存活明反时优先打明反，明反死光后重新盲狙"
			},
			ai_think_delay_separator: {
				name: '<span style="color:#ffcc00;">━━━ AI模拟真人思考 ━━━</span>',
				clear: true,
				intro: "玩家出牌和选择时模拟点击与思考；摸牌、伤害等纯系统结算不增加思考等待"
			},
			enable_ai_think_delay: {
				name: "启用AI思考延迟",
				init: true,
				intro: "出牌、杀闪、借刀出杀或交武器、技能直接用牌及各类选择分别留出思考时间；无牌响应、唯一选项、强制选择及频繁技能也保留停顿。无懈可击沿用原节奏，思考上下限继续生效"
			},
			ai_think_delay_popup: {
				name: "显示思考提示",
				init: true,
				intro: "开启后，预计思考时长达到600毫秒时持续显示“出牌 思考中”提示；进度条满条固定代表15秒，按实际耗时缩短，思考结束后移除；不足600毫秒时只显示进度条"
			},
			ai_think_delay_min: {
				name: "最短思考时间(ms)",
				init: "250",
				intro: "所有实际AI选择均遵守此下限，默认250毫秒；默认节奏下简单确认通常0.9～2秒，出牌及杀闪通常1～2.6秒，复杂取舍更久；最长时间仍可进一步限制等待",
				input: true,
				onblur: function() {
					this.innerHTML = this.innerHTML.replace(/<br>/g, '').trim();
					let value = parseInt(this.innerHTML);
					if (isNaN(value)) value = 250;
					value = Math.max(0, Math.min(10000, value));
					this.innerHTML = value;
					game.saveConfig('extension_HH优化_ai_think_delay_min', String(value));
					lib.config.extension_HH优化_ai_think_delay_min = String(value);
				}
			},
			ai_think_delay_max: {
				name: "普通最长思考时间(ms)",
				init: "2600",
				intro: "普通思考的最长等待时间，默认2600毫秒；仅关键取舍有6%概率长考，最多额外1500毫秒。最短和最长均设为0可取消等待",
				input: true,
				onblur: function() {
					this.innerHTML = this.innerHTML.replace(/<br>/g, '').trim();
					let value = parseInt(this.innerHTML);
					if (isNaN(value)) value = 2600;
					value = Math.max(0, Math.min(15000, value));
					this.innerHTML = value;
					game.saveConfig('extension_HH优化_ai_think_delay_max', String(value));
					lib.config.extension_HH优化_ai_think_delay_max = String(value);
				}
			},
			ui_style_separator: {
				name: '<span style="color:#ffcc00;">━━━ 武将牌样式 ━━━</span>',
				clear: true,
				intro: "调整武将宽高，边框、发光、勾玉和文字位置自动适配"
			},
			player_width: {
				name: "武将宽度(px)",
				init: "136",
				intro: "设置武将卡牌的宽度（80-200像素），默认136，修改后立即生效。",
				input: true,
				onblur: function() {
					this.innerHTML = this.innerHTML.replace(/<br>/g, '').trim();
					let value = parseInt(this.innerHTML);
					if (isNaN(value)) value = 136;
					value = Math.max(80, Math.min(200, value));
					this.innerHTML = value;
					if (String(value) !== String(lib.config.extension_HH优化_player_width)) delete game.hhSelectionCardLayout;
					game.saveConfig('extension_HH优化_player_width', String(value));
					lib.config.extension_HH优化_player_width = String(value);
					if (window._speedControlUpdateStyle) {
						window._speedControlUpdateStyle();
					}
				}
			},
			player_height: {
				name: "武将高度(px)",
				init: "180",
				intro: "设置武将卡牌的高度（120-300像素），默认180，修改后立即生效。",
				input: true,
				onblur: function() {
					this.innerHTML = this.innerHTML.replace(/<br>/g, '').trim();
					let value = parseInt(this.innerHTML);
					if (isNaN(value)) value = 180;
					value = Math.max(120, Math.min(300, value));
					this.innerHTML = value;
					if (String(value) !== String(lib.config.extension_HH优化_player_height)) delete game.hhSelectionCardLayout;
					game.saveConfig('extension_HH优化_player_height', String(value));
					lib.config.extension_HH优化_player_height = String(value);
					if (window._speedControlUpdateStyle) {
						window._speedControlUpdateStyle();
					}
				}
			},
			ui_crop_separator: {
				name: '<span style="color:#ff6600;">━━━ 界面裁剪设置 ━━━</span>',
				clear: true,
				intro: "裁剪游戏界面左右两侧的空白区域"
			},
			enable_ui_crop: {
				name: "启用界面裁剪",
				init: false,
				intro: "开启后裁剪游戏界面左右两侧的空白区域，让游戏内容更紧凑",
				onclick: function(item) {
					game.saveConfig('extension_HH优化_enable_ui_crop', item);
					lib.config.extension_HH优化_enable_ui_crop = item;
					if (window._speedControlUpdateStyle) {
						window._speedControlUpdateStyle();
					}
				}
			},
			crop_left: {
				name: "左侧裁剪(px)",
				init: "0",
				intro: "裁剪左侧的像素数，默认0。数值越大裁剪越多。",
				input: true,
				onblur: function() {
					this.innerHTML = this.innerHTML.replace(/<br>/g, '').trim();
					let value = parseInt(this.innerHTML);
					if (isNaN(value)) value = 0;
					value = Math.max(0, Math.min(500, value));
					this.innerHTML = value;
					game.saveConfig('extension_HH优化_crop_left', String(value));
					lib.config.extension_HH优化_crop_left = String(value);
					if (window._speedControlUpdateStyle) {
						window._speedControlUpdateStyle();
					}
				}
			},
			crop_right: {
				name: "右侧裁剪(px)",
				init: "0",
				intro: "裁剪右侧的像素数，默认0。数值越大裁剪越多。",
				input: true,
				onblur: function() {
					this.innerHTML = this.innerHTML.replace(/<br>/g, '').trim();
					let value = parseInt(this.innerHTML);
					if (isNaN(value)) value = 0;
					value = Math.max(0, Math.min(500, value));
					this.innerHTML = value;
					game.saveConfig('extension_HH优化_crop_right', String(value));
					lib.config.extension_HH优化_crop_right = String(value);
					if (window._speedControlUpdateStyle) {
						window._speedControlUpdateStyle();
					}
				}
			}
		},
		help: {
			"HH优化扩展": '<ul>' +
				'<li>本扩展提供滑块式速度控制，可自由调节游戏速度' +
				'<li><strong>速度倍率说明（从慢到快）：</strong>' +
				'<li>• 特慢 (×5) - 时间延长5倍，适合仔细观察' +
				'<li>• 很慢 (×3.5) - 时间延长3.5倍' +
				'<li>• 慢 (×2.5) - 时间延长2.5倍' +
				'<li>• 较慢 (×1.5) - 时间延长1.5倍' +
				'<li>• 正常 (×1) - 默认速度' +
				'<li>• 较快 (×0.7) - 时间缩短到70%' +
				'<li>• 快 (×0.4) - 时间缩短到40%' +
				'<li>• 很快 (×0.2) - 时间缩短到20%' +
				'<li>• 超快 (×0.1) - 时间缩短到10%，快速测试' +
				'<li><strong>使用方法：</strong>在扩展设置中选择速度，立即生效' +
				'<li><hr>' +
				'<li><strong>音频替换功能：</strong>' +
				'<li>• 开启"启用音频替换"后，扩展会优先使用 extension/speed_control/effect/ 目录下的音频文件' +
				'<li>• 将自定义音频文件放入该目录，文件名需与原音效文件名相同' +
				'<li>• 如果扩展目录下没有对应音频，会自动使用游戏原音效' +
				'<li>• 支持的音频格式：mp3, ogg, wav 等' +
				'<li><hr>' +
				'<li><strong>HH优化样式覆盖：</strong>' +
				'<li>• 武将宽高：宽度80-200像素，高度120-300像素，默认136×180，图片用cover填充不变形' +
				'<li>• 边框、发光、勾玉和文字位置随武将牌尺寸自动适配' +
				'<li>• 这些设置会覆盖HH优化扩展的默认样式' +
				'<li>• 修改后实时生效，无需重启游戏' +
				'<li><hr>' +
				'<li><strong>界面裁剪功能：</strong>' +
				'<li>• 启用界面裁剪：开启后可裁剪游戏界面左右两侧的空白区域' +
				'<li>• 左侧裁剪：设置左侧裁剪的像素数（0-500像素）' +
				'<li>• 右侧裁剪：设置右侧裁剪的像素数（0-500像素）' +
				'<li>• 裁剪后游戏内容会更紧凑，适合宽屏显示器' +
				'</ul>'
		},
		package: {
			character: {},
			card: {},
			skill: {}
		},
		files: { character: [], card: [], skill: [], audio: ["effect"] }
	};
}
