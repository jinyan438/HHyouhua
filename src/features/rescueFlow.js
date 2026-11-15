import { createRescuePrompt } from '../ui/rescuePrompt.js';

export function setupRescueFlow(context, options = {}) {
	const { lib, game, ui, get, _status } = context;
	if (game.hhRescueFlow) return game.hhRescueFlow;
	const getThinkDelay = options.getThinkDelay || (() => 0), prompt = options.prompt || createRescuePrompt(context);
	const ended = (event, trigger, dying) => event.finished || _status.over || trigger.nodying || dying.nodying || dying.hp > 0 || !dying.isAlive() || dying.isOut() || dying.removed;
	for (const contentMap of new Set([lib.element?.content, lib.element?.contents])) {
		if (!contentMap || typeof contentMap._save !== 'function') continue;
		const original = contentMap._save;
		// The order, legality checks and choice callbacks mirror core Content._save.
		// Keep async so the engine compiler preserves these module dependencies.
		contentMap._save = async function (event, trigger) {
			if (_status.connectMode || game.online) return original.apply(this, arguments);
			event.dying = trigger.player;
			const dying = trigger.player, acted = new Set();
			const question = `${get.translation(dying)}濒死，是否帮助？`;
			const round = prompt.beginRound(dying);
			try {
				outer: while (!dying.isDead()) {
					if (ended(event, trigger, dying)) break;
					const player = event.player; if (!player) break;
					acted.add(player);
					const taoEnemy = lib.config.tao_enemy && dying.side !== player.side && lib.config.mode !== 'identity' && lib.config.mode !== 'guozhan' && !dying.hasSkillTag('revertsave');
					let result = { bool: false };
					if (!taoEnemy && player.isIn()) {
						// Ask every eligible seat, even with no Peach or rescue skill.
						// Native chooseToUse handles manual cancellation and AI passes.
						const duration = Math.max(0, Math.min(15000, Number(getThinkDelay(player, dying, event)) || 0));
						const turn = prompt.begin(player, dying, duration);
						try {
							if (duration > 0 && !await turn.wait(duration, () => !ended(event, trigger, dying) && player.isIn())) {
								if (turn.closed || ended(event, trigger, dying)) break outer;
							} else if (!ended(event, trigger, dying) && player.isIn()) {
								result = await player.chooseToUse({
									filterCard(card, player, name) {
										const event = name || _status.event;
										return lib.filter.cardSavable(card, player, event.dying);
									},
									filterTarget(card, player, target) {
										if (target !== _status.event.dying || !card) return false;
										const info = get.info(card);
										if (!info.singleCard || ui.selected.targets.length === 0) {
											let mod = game.checkMod(card, player, target, 'unchanged', 'playerEnabled', player);
											if (mod == false) return false;
											mod = game.checkMod(card, player, target, 'unchanged', 'targetEnabled', target);
											if (mod !== 'unchanged') return mod ?? false;
										}
										return true;
									},
									prompt: question, prompt2: `当前体力：${dying.hp}`,
									ai1(card) {
										const player = get.player();
										if (typeof card === 'string') {
											const info = get.info(card);
											if (info.ai && info.ai.order) return typeof info.ai.order === 'number' ? info.ai.order : info.ai.order(null, player);
										}
										return 1;
									},
									ai2(target) { const effect = get.effect_use(target); return effect <= 0 ? effect : get.effect(target); },
									type: 'dying', targetRequired: true, dying,
									_HH_rescueThought: duration > 0,
								}).forResult();
							}
						} finally { prompt.end(turn); }
					}
					if (event.finished || _status.over) break;
					if (result.bool) {
						if (ended(event, trigger, dying)) { trigger.untrigger(); break; }
					} else {
						let next = player.next; const visited = new Set();
						while (true) {
							if (!next || acted.has(next) || visited.has(next)) break outer;
							if (!next.isOut()) { event.player = next; break; }
							visited.add(next); next = next.next;
						}
					}
				}
			} finally { prompt.endRound(round); }
		};
	}
	game.hhRescueFlow = prompt;
	return prompt;
}
