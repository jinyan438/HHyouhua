/** Original xvi.CardUI_SelectedChanged: at the limit, replace the oldest selection. */
export function setupHandSelection({ lib, game, ui, get, _status }) {
	if (game.hhHandSelection) return game.hhHandSelection;
	const marked = new Set();
	const handCards = () => [...(ui.handcards1?.children || []), ...(ui.handcards2?.children || [])];
	function localChoice(event) {
		return event === _status.event && event?.player === game.me && event.isMine?.()
			&& !_status.auto && !_status.video && !_status.over && !event.result
			&& typeof event.filterCard === "function" && !event.custom?.replace?.card;
	}
	function allowed(card, event) {
		return !card.classList.contains("uncheck") && !card.classList.contains("removing")
			&& !event.player.isOut() && lib.filter.cardAiIncluded(card)
			&& lib.filter.cardRespondable(card, event.player) && event.filterCard(card, event.player);
	}
	function replacement(card, event = _status.event) {
		if (!localChoice(event) || !handCards().includes(card) || ui.selected.cards.includes(card)
			|| !event.player.getCards(event.position).includes(card)) return;
		const max = get.select(event.selectCard)[1];
		if (!Number.isFinite(max) || max < 1 || ui.selected.cards.length !== max) return;
		const originalCards = ui.selected.cards, originalTargets = ui.selected.targets;
		const oldest = originalCards[0], retained = originalCards.slice(1);
		// Only probe filters. Do not run game.check, confirmation, AI or custom callbacks here.
		ui.selected.cards = [];
		ui.selected.targets = [];
		oldest.classList.remove("selected");
		try {
			for (const kept of retained) {
				if (!allowed(kept, event)) return;
				ui.selected.cards.push(kept);
			}
			if (!allowed(card, event)) return;
			ui.selected.cards.push(card);
			const nextMax = get.select(event.selectCard)[1];
			if (!(nextMax >= ui.selected.cards.length)) return;
			return oldest;
		} catch {
			return;
		} finally {
			ui.selected.cards = originalCards;
			ui.selected.targets = originalTargets;
			oldest.classList.add("selected");
		}
	}
	function clear() {
		for (const card of marked) card.classList.remove("hh-hand-switchable");
		marked.clear();
	}
	function refresh(event) {
		clear();
		if (localChoice(event)) for (const card of handCards()) {
			if (!replacement(card, event)) continue;
			card.classList.add("hh-hand-switchable");
			marked.add(card);
		}
		globalThis.decadeUI?.layout?.invalidateHand();
	}
	const controller = {
		replaceOldest(card) {
			const event = _status.event, oldest = replacement(card, event);
			if (!oldest) return;
			ui.selected.cards.splice(ui.selected.cards.indexOf(oldest), 1);
			oldest.classList.remove("selected");
			oldest.updateTransform(false);
			game.callHook("uncheckCard", [oldest, event]);
			// Targets belong to the previous card; check them again against the replacement.
			if (event.filterTarget || ui.selected.targets.length) game.uncheck("target");
			delete event._cardChoice;
			delete event._targetChoice;
			card.classList.add("selectable");
			return true;
		},
		clear,
	};
	lib.hooks.checkEnd.push(refresh);
	lib.hooks.uncheckEnd.push(clear);
	(lib.onover ||= []).push(clear);
	game.hhHandSelection = controller;
	return controller;
}
