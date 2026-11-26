/**
 * @fileoverview 布局模块，负责手牌和弃牌区的布局计算与更新
 */
import { lib, game, ui, get, ai, _status } from "noname";
import { originalHandRow, originalCentralRow, originalDiscardScale } from "../ui/originalCards.js";

/**
 * 弃牌区最大宽度占屏幕宽度的比例
 * @constant {number}
 */
const DISCARD_MAX_WIDTH_RATIO = 0.7;

/**
 * 创建layout模块
 * @returns {Object} layout模块对象
 */
export function createLayoutModule() {
	return {
		/**
		 * 更新所有布局
		 */
		update() {
			this.updateHand();
			this.updateDiscard();
		},

		/**
		 * 更新手牌布局
		 */
		updateHand() {
			if (!game.me) return;
			const handNode = ui.handcards1;
			if (!handNode) return console.error("hand undefined");

			const cards = [...handNode.childNodes, ...(game.hhCardDistribution?.handCards || [])].filter(card => {
				if (card.classList.contains("removing")) {
					card.scaled = false;
					return false;
				}
				return true;
			});
			if (!cards.length) return;

			const bounds = decadeUI.boundsCaches.hand;
			bounds.check();
			const { width: pw, cardWidth: cw, cardHeight: ch, cardScale: cs } = bounds;
			const csw = cw * cs;
			const y = Math.round((ch * cs - ch) / 2);
			const selected = [...(ui.selected?.cards || []), ...(ui.selected?.buttons || [])];
			const expanded = selected.findLast(card => cards.includes(card) && card.classList.contains("selected"))
				|| cards.findLast(card => card.classList.contains("selected"));
			const selectedIndex = cards.indexOf(expanded);
			const row = originalHandRow(cards.length, pw, csw, selectedIndex);
			const xStart = (csw - cw) / 2;

			cards.forEach((card, i) => {
				const fx = xStart + i * row.step + (i > selectedIndex ? row.expand : 0);
				const x = Math.round(fx);
				card.tx = x;
				card.ty = y;
				card.scaled = true;
				card.style.transform = `translate(${x}px,${y}px) scale(${cs})`;
				card._transform = card.style.transform;
				card.updateTransform(card.classList.contains("selected"));
				game.hhDrawMotion?.settleHand(card);
			});

			const container = ui.handcards1Container;
			// Extremely narrow windows still expose every card rather than collapsing to one x.
			const overflow = row.width > pw + 0.5;
			container.classList.toggle("scrollh", overflow);
			container.style.overflowX = overflow ? "auto" : "";
			container.style.overflowY = overflow ? "hidden" : "";
			handNode.style.width = overflow ? `${Math.ceil(row.width)}px` : "100%";
			game.hhCardDistribution?.updateHandWidth(handNode.style.width);
		},

		/**
		 * 更新弃牌区布局
		 * 当卡牌总宽度超过限制宽度时，卡牌会折叠重叠显示
		 */
		updateDiscard() {
			ui.thrown ??= [];
			ui.thrown = ui.thrown.filter(t => {
				if (t.classList.contains("drawingcard") || t.classList.contains("removing") || t.parentNode !== ui.arena || t.fixed) {
					return false;
				}
				t.classList.remove("removing");
				return true;
			});
			if (!ui.thrown.length) return;

			const cards = ui.thrown;
			const bounds = decadeUI.boundsCaches.arena;
			bounds.check();
			const { width: pw, height: ph, cardWidth: cw, cardHeight: ch } = bounds;
			const cs = (decadeUI.get.bodySize().height * originalDiscardScale) / ch;
			const csw = cw * cs;
			const y = Math.round((ph - ch) / 2);

			// 弃牌区最大宽度限制为屏幕宽度的70%
			const maxWidth = pw * DISCARD_MAX_WIDTH_RATIO;
			// 实际可用宽度取最大宽度限制和屏幕宽度的较小值
			const limitW = Math.min(maxWidth, pw);

			const row = originalCentralRow(cards.length, limitW, csw, cs / 0.87);
			const xMargin = row.step;
			const xStart = (pw - limitW) / 2 + row.start + (csw - cw) / 2;

			cards.forEach((card, i) => {
				const x = Math.round(xStart + i * xMargin);
				card.tx = x;
				card.ty = y;
				card.scaled = true;
				card.style.transform = `translate(${x}px,${y}px) scale(${cs})`;
			});
		},

		/**
		 * 清理卡牌
		 * @param {HTMLElement} card - 卡牌元素
		 */
		clearout(card) {
			if (!card || card.fixed || card.classList.contains("removing")) return;
			if (card.name?.startsWith("shengbei_left_") || card.name?.startsWith("shengbei_right_")) {
				card.delete();
				return;
			}
			if (!ui.thrown.includes(card)) {
				ui.thrown.push(card);
				decadeUI.queueNextFrameTick(decadeUI.layoutDiscard, decadeUI);
			}
			card.classList.add("invalided");
			setTimeout(
				c => {
					c.remove();
					decadeUI.queueNextFrameTick(decadeUI.layoutDiscard, decadeUI);
				},
				2333,
				card
			);
		},

		/**
		 * 防抖处理
		 * @param {Object} config - 防抖配置
		 */
		_debounce(config) {
			const { defaultDelay, maxDelay, timeoutKey, timeKey, immediateCallback, callback } = config;
			const nowTime = Date.now();

			if (this[timeoutKey]) {
				clearTimeout(this[timeoutKey]);
				if (nowTime - this[timeKey] > maxDelay) {
					this[timeoutKey] = this[timeKey] = null;
					immediateCallback();
					return;
				}
			} else {
				this[timeKey] = nowTime;
			}

			this[timeoutKey] = setTimeout(
				() => {
					this[timeoutKey] = this[timeKey] = null;
					callback();
				},
				this[timeoutKey] ? nowTime - this[timeKey] : defaultDelay
			);
		},

		/**
		 * 延迟清理
		 */
		delayClear() {
			this._debounce({
				defaultDelay: 500,
				maxDelay: 1000,
				timeoutKey: "_delayClearTimeout",
				timeKey: "_delayClearTimeoutTime",
				immediateCallback: ui.clear,
				callback: ui.clear,
			});
		},

		/**
		 * 使布局失效
		 */
		invalidate() {
			this.invalidateHand();
			this.invalidateDiscard();
		},

		/**
		 * 使手牌布局失效
		 */
		invalidateHand() {
			this._debounce({
				defaultDelay: 40,
				maxDelay: 180,
				timeoutKey: "_handcardTimeout",
				timeKey: "_handcardTimeoutTime",
				immediateCallback: () => this.updateHand(),
				callback: () => this.updateHand(),
			});
		},

		/**
		 * 使弃牌区布局失效
		 */
		invalidateDiscard() {
			this._debounce({
				defaultDelay: ui.thrown?.length > 15 ? 80 : 40,
				maxDelay: 180,
				timeoutKey: "_discardTimeout",
				timeKey: "_discardTimeoutTime",
				immediateCallback: () => this.updateDiscard(),
				callback: () => this.updateDiscard(),
			});
		},

		/**
		 * 响应窗口大小变化
		 */
		resize() {
			if (!ui.arena) return;
			ui.arena.classList.toggle("dui-mobile", decadeUI.isMobile());

			decadeUI.dataset.animSizeUpdated = false;
			decadeUI.dataset.bodySize.updated = false;
			Object.values(decadeUI.boundsCaches).forEach(cache => (cache.updated = false));

			const ensureStyle = selector => decadeUI.sheet.getStyle(selector) || decadeUI.sheet.insertRule(`${selector} { zoom: 1; }`);
			const buttonsWindow = ensureStyle("#window > .dialog.popped .buttons:not(.smallzoom)");
			const buttonsArena = ensureStyle("#arena:not(.choose-character) .buttons:not(.smallzoom)");

			decadeUI.zooms.card = decadeUI.getCardBestScale();
			if (ui.me) ui.me.style.height = `${Math.round(decadeUI.getHandCardSize().height * decadeUI.zooms.card + 30.4)}px`;
			if (buttonsArena) buttonsArena.zoom = decadeUI.zooms.card;
			if (buttonsWindow) buttonsWindow.zoom = decadeUI.zooms.card;
			if (ui.dialog) ui.update();
			this.invalidate();
		},
	};
}
