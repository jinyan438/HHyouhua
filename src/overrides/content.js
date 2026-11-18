/**
 * @fileoverview Content覆写模块 - lib.element.content相关的覆写方法
 */

import { lib, game, ui, get, ai, _status } from "noname";

/** @type {Object|null} 基础方法引用 */
let baseContentMethods = null;

/**
 * 设置基础方法引用
 * @param {Object} methods - 基础方法对象
 */
export function setBaseContentMethods(methods) {
	baseContentMethods = methods;
}

/** Preserve the source batches before native multi-recipient gain performs its losses. */
export function createContentGainMultiple(base) {
	if (typeof base !== "function") return base;
	return async function (event, trigger, player) {
		game.hhDrawMotion?.captureGain(event, player);
		const previous = event._HH_gainMotionManaged;
		event._HH_gainMotionManaged = game.hhDrawMotion?.enabled === true && typeof game.hhDrawMotion.waitForGain === "function";
		try {
			const result = await base.call(this, event, trigger, player);
			if (game.hhSettlement?.canOptimize(event)) await game.hhDrawMotion?.waitForGain(event);
			return result;
		} finally {
			if (previous === undefined) delete event._HH_gainMotionManaged;
			else event._HH_gainMotionManaged = previous;
		}
	};
}

/** Create the gain phases, retaining card provenance before the native loss phase. */
export function createContentGain(baseGain) {
	const phases = baseGain.slice(0, -2);
	if (phases.length) {
		const beforeLose = phases[0];
		phases[0] = async function (event, trigger, player) {
			game.hhDrawMotion?.captureGain(event, player);
			return beforeLose.call(this, event, trigger, player);
		};
	}
	return [
		...phases,
		async (event, trigger, player) => {
			let { cards, gaintag } = event;
			const fastSettlement = game.hhSettlement?.fastGain(event) === true;
			const handcards = player.node.handcards1;
			const fragment = document.createDocumentFragment();
			for (let i = 0; i < cards.length; i++) {
				const card = cards[i];
				let sort = lib.config.sort_card(card);
				if (lib.config.reverse_sort) sort = -sort;
				if (["o", "d"].includes(get.position(card, true))) {
					card.addKnower("everyone");
				}
				card.fix();
				card.style.transform = "";
				if (card.parentNode == handcards) {
					cards.splice(i--, 1);
					continue;
				}
				gaintag.forEach(tag => card.addGaintag(tag));
				if (event.knowers) card.addKnower(event.knowers);
				fragment.appendChild(card);
				if (_status.discarded) _status.discarded.remove(card);
				for (let j = 0; j < card.vanishtag.length; j++) {
					if (card.vanishtag[j][0] != "_") card.vanishtag.splice(j--, 1);
				}
			}
			const _dui = window.decadeUI;
			const gainTo = function (cards, nodelay) {
				cards.duiMod = event.source;
				if (player == game.me) {
					_dui.layoutHandDraws(cards, event);
					_dui.queueNextFrameTick(_dui.layoutHand, _dui);
					game.addVideo("gain12", player, [get.cardsInfo(fragment.childNodes), gaintag]);
				}
				const s = player.getCards("s");
				if (s.length) handcards.insertBefore(fragment, s[0]);
				else handcards.appendChild(fragment);
				game.broadcast(
					function (player, cards, num, gaintag) {
						player.directgain(cards, null, gaintag);
						_status.cardPileNum = num;
					},
					player,
					cards,
					ui.cardPile.childNodes.length,
					gaintag
				);
				if (nodelay !== true) {
					setTimeout(
						function (player) {
							player.update();
							game.resume();
						},
						get.delayx(400, 400) + 66,
						player
					);
				} else {
					player.update();
				}
			};
			if (event.animate == "draw") {
				if (!fastSettlement) game.pause();
				gainTo(cards, fastSettlement);
				player.$draw(cards.length);
			} else if (event.animate == "gain") {
				if (!fastSettlement) game.pause();
				gainTo(cards, fastSettlement);
				player.$gain(cards, event.log);
			} else if (event.animate == "gain2" || event.animate == "draw2") {
				if (!fastSettlement) game.pause();
				gainTo(cards, fastSettlement);
				player.$gain2(cards, event.log);
			} else if (event.animate == "give" || event.animate == "giveAuto") {
				if (!fastSettlement) game.pause();
				gainTo(cards, fastSettlement);
				const evtmap = event.losing_map;
				if (event.animate == "give") {
					for (const i in evtmap) {
						const source = (_status.connectMode ? lib.playerOL : game.playerMap)[i];
						source.$give(evtmap[i][0], player, event.log);
					}
				} else {
					for (const i in evtmap) {
						const source = (_status.connectMode ? lib.playerOL : game.playerMap)[i];
						if (evtmap[i][1].length) source.$giveAuto(evtmap[i][1], player, event.log);
						if (evtmap[i][2].length) source.$give(evtmap[i][2], player, event.log);
					}
				}
			} else if (typeof event.animate == "function") {
				const time = event.animate(event);
				game.pause();
				setTimeout(
					function () {
						gainTo(cards, true);
						game.resume();
					},
					get.delayx(time, time)
				);
			} else {
				gainTo(cards, true);
			}
			// Rules can skip padding, but the next move must not consume a card before its visible arrival.
			if (fastSettlement) await game.hhDrawMotion?.waitForGain(event, player);
		},
		async (event, trigger, player) => {
			if (event.updatePile) game.updateRoundNumber();
		},
	];
}

/**
 * 保留原生判定及回调结算，完成后通知判定结果显示。
 * 不能用旧 step 实现代替：屯田等技能会在异步回调中移动判定牌。
 */
export function createContentJudge(baseJudge) {
	if (!Array.isArray(baseJudge) || !baseJudge.length) return baseJudge;
	const last = baseJudge[baseJudge.length - 1];
	return [
		...baseJudge.slice(0, -1),
		async (event, trigger, player) => {
			const result = await last.call(event, event, trigger, player);
			event.triggerMessage?.("judgeresult");
			return result;
		},
	];
}

/**
 * 创建失去卡牌覆写内容
 * @param {Object} baseLose - 基础lose方法数组
 * @returns {Array} 覆写后的lose方法数组
 */
export function createContentLose(baseLose) {
	return [
		async (event, trigger, player) => {
			const evt = event.getParent();
			if ((evt.name != "discard" || event.type != "discard") && (evt.name != "loseToDiscardpile" || event.type != "loseToDiscardpile")) {
				event.delay = false;
				if (event.blameEvent == undefined) event.animate = false;
			} else {
				if (evt.delay === false) event.delay = false;
				if (event.animate == undefined) event.animate = evt.animate;
			}
		},
		async (event, trigger, player) => {
			let { cards } = event;
			event.vcards = {
				cards: [],
				es: [],
				js: [],
			};
			event.vcard_cards = [];
			event.gaintag_map = {};
			const hs = [];
			const es = [];
			const js = [];
			const ss = [];
			const xs = [];
			const unmarks = [];
			if (event.insert_card && event.position == ui.cardPile) event.cards.reverse();
			const hej = player.getCards("hejsx");
			event.stockcards = cards.slice(0);
			for (let i = 0; i < cards.length; i++) {
				let cardx = [cards[i]];
				if (!hej.includes(cards[i])) {
					cards.splice(i--, 1);
					continue;
				} else if (cards[i].parentNode) {
					if (cards[i].parentNode.classList.contains("equips")) {
						cards[i].throwWith = cards[i].original = "e";
						const VEquip = cards[i][cards[i].cardSymbol];
						if (VEquip) {
							if (cards[i].isViewAsCard) {
								let loseCards = VEquip.cards;
								cardx.addArray(loseCards);
								event.vcard_cards.addArray(loseCards);
								loseCards.forEach(cardi => {
									cardi.throwWith = cardi.original = "e";
									delete cardi.destiny;
									es.push(cardi);
									event.vcard_map.set(cardi, VEquip || get.autoViewAs(cards[i], void 0, false));
								});
							} else {
								es.push(cards[i]);
								event.vcard_map.set(cards[i], VEquip || get.autoViewAs(cards[i], void 0, false));
								event.vcard_cards.add(cards[i]);
							}
							event.vcards.cards.push(cards[i]);
							event.vcards.es.push(cards[i]);
						}
					} else if (cards[i].parentNode.classList.contains("judges")) {
						cards[i].throwWith = cards[i].original = "j";
						const VJudge = cards[i][cards[i].cardSymbol];
						if (VJudge) {
							if (cards[i].isViewAsCard) {
								let loseCards = VJudge.cards;
								cardx.addArray(loseCards);
								event.vcard_cards.addArray(loseCards);
								loseCards.forEach(cardi => {
									cardi.throwWith = cardi.original = "j";
									delete cardi.destiny;
									js.push(cardi);
									event.vcard_map.set(cardi, VJudge || get.autoViewAs(cards[i], void 0, false));
								});
							} else {
								js.push(cards[i]);
								event.vcard_map.set(cards[i], VJudge || get.autoViewAs(cards[i], void 0, false));
								event.vcard_cards.add(cards[i]);
							}
							event.vcards.cards.push(cards[i]);
							event.vcards.js.push(cards[i]);
						}
					} else if (cards[i].parentNode.classList.contains("expansions")) {
						cards[i].throwWith = cards[i].original = "x";
						xs.push(cards[i]);
						event.vcard_map.set(cards[i], get.autoViewAs(cards[i], void 0, false));
						if (cards[i].gaintag && cards[i].gaintag.length) unmarks.addArray(cards[i].gaintag);
					} else if (cards[i].parentNode.classList.contains("handcards")) {
						if (cards[i].classList.contains("glows")) {
							cards[i].throwWith = cards[i].original = "s";
							ss.push(cards[i]);
							event.vcard_map.set(cards[i], get.autoViewAs(cards[i], void 0, false));
						} else {
							cards[i].throwWith = cards[i].original = "h";
							hs.push(cards[i]);
							event.vcard_map.set(cards[i], get.autoViewAs(cards[i], void 0, player));
						}
					} else {
						cards[i].throwWith = cards[i].original = null;
					}
				}
				for (let j = 0; j < cardx.length; j++) {
					if (cardx[j].gaintag && cardx[j].gaintag.length) {
						event.gaintag_map[cardx[j].cardid] = cardx[j].gaintag.slice(0);
						const tags = cardx[j].gaintag.filter(tag => !tag.startsWith("eternal_"));
						tags.forEach(tag => cardx[j].removeGaintag(tag));
					}
					cardx[j].style.transform += " scale(0.2)";
					cardx[j].classList.remove("glow");
					cardx[j].classList.remove("glows");
					cardx[j].recheck();
					const info = lib.card[cardx[j].name];
					if ("_destroy" in cardx[j]) {
						if (cardx[j]._destroy) {
							cardx[j].delete();
							cardx[j].destroyed = cardx[j]._destroy;
							continue;
						}
					} else if ("destroyed" in cardx[j]) {
						if (event.getlx !== false && event.position && cardx[j].willBeDestroyed(event.position.id, null, event)) {
							cardx[j].selfDestroy(event);
							continue;
						}
					} else if (info.destroy) {
						cardx[j].delete();
						cardx[j].destroyed = info.destroy;
						continue;
					}
					if (event.position) {
						if (_status.discarded) {
							if (event.position == ui.discardPile) {
								_status.discarded.add(cardx[j]);
							} else {
								_status.discarded.remove(cardx[j]);
							}
						}
						if (event.insert_index) {
							cardx[j].fix();
							event.position.insertBefore(cardx[j], event.insert_index(event, cardx[j]));
						} else if (event.insert_card) {
							cardx[j].fix();
							event.position.insertBefore(cardx[j], event.position.firstChild);
						} else if (event.position == ui.cardPile) {
							cardx[j].fix();
							event.position.appendChild(cardx[j]);
						} else cardx[j].goto(event.position);
					} else {
						cardx[j].remove();
					}
				}
			}
			const _dui = window.decadeUI;
			if (player == game.me) _dui.queueNextFrameTick(_dui.layoutHand, _dui);
			ui.updatej(player);
			game.broadcast(
				(player, cards, num) => {
					for (let i = 0; i < cards.length; i++) {
						cards[i].removeGaintag(true);
						cards[i].classList.remove("glow");
						cards[i].classList.remove("glows");
						cards[i].fix();
						cards[i].remove();
					}
					if (player == game.me) ui.updatehl();
					ui.updatej(player);
					_status.cardPileNum = num;
				},
				player,
				cards.slice(),
				ui.cardPile.childNodes.length
			);
			if (event.animate != false) {
				const evt = event.getParent();
				evt.discardid = lib.status.videoId++;
				game.broadcastAll(
					function (player, cards, id, visible) {
						const cardx = cards
							.slice()
							.map(i => (i.cards ? i.cards : [i]))
							.flat();
						cardx.duiMod = true;
						if (visible) player.$throw(cardx, null, "nobroadcast");
						const cardnodes = [];
						cardnodes._discardtime = get.time();
						for (let i = 0; i < cardx.length; i++) {
							if (cardx[i].clone) cardnodes.push(cardx[i].clone);
						}
						ui.todiscard[id] = cardnodes;
					},
					player,
					cards,
					evt.discardid,
					event.visible
				);
				if (lib.config.sync_speed && cards[0]?.clone) {
					if (evt.delay != false) {
						const waitingForTransition = get.time();
						evt.waitingForTransition = waitingForTransition;
						cards[0].clone.listenTransition(function () {
							if (_status.waitingForTransition == waitingForTransition && _status.paused) {
								game.resume();
							}
							delete evt.waitingForTransition;
						});
					} else if (evt.getParent().discardTransition) {
						delete evt.getParent().discardTransition;
						const waitingForTransition = get.time();
						evt.getParent().waitingForTransition = waitingForTransition;
						cards[0].clone.listenTransition(function () {
							if (_status.waitingForTransition == waitingForTransition && _status.paused) {
								game.resume();
							}
							delete evt.getParent().waitingForTransition;
						});
					}
				}
			}
			game.addVideo("lose", player, [get.cardsInfo(hs), get.cardsInfo(es), get.cardsInfo(js), get.cardsInfo(ss)]);
			event.cards2 = hs.concat(es);
			cards.removeArray(event.vcards.cards);
			cards.addArray(event.vcard_cards);
			player.getHistory("lose").push(event);
			game.getGlobalHistory().cardMove.push(event);
			player.update();
			game.addVideo("loseAfter", player);
			event.num = 0;
			if (event.position == ui.ordering) {
				const evt = event.relatedEvent || event.getParent();
				if (!evt.orderingCards) evt.orderingCards = [];
				if (!evt.noOrdering && !evt.cardsOrdered) {
					evt.cardsOrdered = true;
					const next = game.createEvent("orderingDiscard", false);
					event.next.remove(next);
					evt.after.push(next);
					next.relatedEvent = evt;
					next.setContent("orderingDiscard");
				}
				if (!evt.noOrdering) {
					evt.orderingCards.addArray(cards);
				}
			} else if (event.position == ui.cardPile) {
				game.updateRoundNumber();
			}
			if (unmarks.length) {
				for (const i of unmarks) {
					player[(lib.skill[i] && lib.skill[i].mark) || player.hasCard(card => card.hasGaintag(i), "x") ? "markSkill" : "unmarkSkill"](i);
				}
			}
			event.hs = hs;
			event.es = es;
			event.js = js;
			event.ss = ss;
			event.xs = xs;
			game.clearCardKnowers(hs);
			if (hs.length && !event.visible) {
				player.getCards("h").forEach(hcard => {
					hcard.clearKnowers();
				});
			}
		},
		...baseLose.slice(2),
	];
}
