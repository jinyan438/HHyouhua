"use strict";

/**
 * @fileoverview 手气卡换牌模块
 * @description 游戏开局时允许玩家更换手牌，前3次免费，之后消耗手气卡
 */

import { lib, game, ui, get, ai, _status } from "noname";
import { createLuckyCardDialog } from "../ui/luckyCardDialog.js";

/**
 * 初始化手气卡换牌功能
 */
export function setupLuckyCard() {
	/**
	 * 手气卡工具对象，挂载到 lib 供 step 编译器访问
	 * @namespace lib._luckyCard
	 */
	lib._luckyCard = {
		/** @type {number} 免费换牌次数 */
		FREE_CHANGES: 3,

		closeDialog() {
			this.dialog?.close();
			delete this.dialog;
		},

		resolve(event, bool) {
			if (_status.event !== event || !_status.paused || event.finished) return;
			event.bool = bool;
			this.closeDialog();
			game.resume();
		},

		showDialog(event) {
			this.closeDialog();
			ui.cardDialog?.close();
			delete ui.cardDialog;
			ui.confirm?.close();
			this.dialog = createLuckyCardDialog({ lib, game, ui, get }, event, bool => this.resolve(event, bool));
		},

		/**
		 * 判断是否还能换牌
		 * @param {number} freeChanges - 剩余免费次数
		 * @param {number} luckyCards - 剩余手气卡数量
		 * @returns {boolean}
		 */
		canChange(freeChanges, luckyCards) {
			return freeChanges > 0 || luckyCards > 0;
		},
	};
	lib.onover.push(() => lib._luckyCard.closeDialog());

	lib.element.content.gameDraw = function () {
		"step 0";
		if (_status.brawl?.noGameDraw) {
			event.finish();
			return;
		}

		let end = player,
			numx = num;
		do {
			if (typeof num === "function") numx = num(player);

			let cards = [];
			const otherGetCards = event.otherPile?.[player.playerid]?.getCards;

			if (otherGetCards) cards.addArray(otherGetCards(numx));
			else if (player.getTopCards) cards.addArray(player.getTopCards(numx));
			else cards.addArray(get.cards(numx));

			if (event.gaintag?.[player.playerid]) {
				const gaintag = event.gaintag[player.playerid];
				const list = typeof gaintag === "function" ? gaintag(numx, cards) : [[cards, gaintag]];
				game.broadcastAll(
					(p, l) => {
						for (let i = l.length - 1; i >= 0; i--) p.directgain(l[i][0], null, l[i][1]);
					},
					player,
					list
				);
			} else {
				player.directgain(cards);
			}

			if (player.singleHp === true && get.mode() !== "guozhan" && (lib.config.mode !== "doudizhu" || _status.mode !== "online")) {
				player.doubleDraw();
			}

			player._start_cards = player.getCards("h");
			player = player.next;
		} while (player !== end);

		event.changeCard = get.config("change_card");
		if (
			_status.connectMode ||
			(lib.config.mode === "single" && _status.mode !== "wuxianhuoli") ||
			(lib.config.mode === "doudizhu" && _status.mode === "online") ||
			!["identity", "guozhan", "doudizhu", "single"].includes(lib.config.mode)
		) {
			event.changeCard = "disabled";
		}
		const changeLimit = event.changeCard === "once" ? 1 : event.changeCard === "twice" ? 2 : Infinity;
		event.freeChanges = Math.min(lib._luckyCard.FREE_CHANGES, changeLimit);
		event.luckyCards = 10000 + Math.floor(Math.random() * 90000);

		("step 1");
		if (
			event.changeCard !== "disabled" &&
			!_status.auto &&
			game.me.countCards("h") &&
			lib._luckyCard.canChange(event.freeChanges, event.luckyCards)
		) {
			const lc = lib._luckyCard;
			lc.showDialog(event);
			event.custom.replace.confirm = function (bool) {
				lib._luckyCard.resolve(_status.event, bool);
			};
		} else {
			lib._luckyCard.closeDialog();
			event.finish();
			setTimeout(decadeUI.effect.gameStart, 51);
		}

		("step 2");
		if (event.changeCard === "once") event.changeCard = "disabled";
		else if (event.changeCard === "twice") event.changeCard = "once";
		else if (event.changeCard === "disabled") {
			event.bool = false;
			return;
		}

		_status.imchoosing = true;
		event.switchToAuto = function () {
			lib._luckyCard.resolve(_status.event, false);
		};
		game.pause();

		("step 3");
		_status.imchoosing = false;
		const lc = lib._luckyCard;

		if (event.bool) {
			game.changeCoin?.(-3);

			const hs = game.me.getCards("h");
			let cards = [];
			const otherGetCards = event.otherPile?.[game.me.playerid]?.getCards;
			const otherDiscard = event.otherPile?.[game.me.playerid]?.discard;

			game.addVideo("lose", game.me, [get.cardsInfo(hs), [], [], []]);
			for (let i = 0; i < hs.length; i++) {
				hs[i].removeGaintag(true);
				otherDiscard ? otherDiscard(hs[i]) : hs[i].discard(false);
			}

			if (otherGetCards) cards.addArray(otherGetCards(hs.length));
			else cards.addArray(get.cards(hs.length));

			if (event.gaintag?.[game.me.playerid]) {
				const gaintag = event.gaintag[game.me.playerid];
				const list = typeof gaintag === "function" ? gaintag(hs.length, cards) : [[cards, gaintag]];
				for (let i = list.length - 1; i >= 0; i--) game.me.directgain(list[i][0], null, list[i][1]);
			} else {
				game.me.directgain(cards);
			}

			game.me._start_cards = game.me.getCards("h");

			// 消耗免费次数或手气卡
			if (event.freeChanges > 0) {
				event.freeChanges--;
			} else {
				event.luckyCards--;
			}

			lc.closeDialog();

			// 只要还能换就继续
			if (event.changeCard !== "disabled" && lc.canChange(event.freeChanges, event.luckyCards)) {
				event.goto(1);
			} else {
				setTimeout(decadeUI.effect.gameStart, 51);
			}
		} else {
			lc.closeDialog();
			game.me._start_cards = game.me.getCards("h");
			setTimeout(decadeUI.effect.gameStart, 51);
			event.finish();
		}
	};
}
