/** Pair displayed cards with recipients without moving the real cards before settlement. */
export function setupCardDistribution({ lib, game, ui, get, _status }) {
	if (game.hhCardDistribution) return game.hhCardDistribution;
	const prototype = lib.element?.Player?.prototype || lib.element?.player;
	const original = prototype?.chooseButtonTarget;
	if (typeof original !== 'function') return;
	let active;
	const exactCount = value => typeof value === 'number' ? value
		: Array.isArray(value) && value[0] === value[1] ? value[0] : 0;
	const cardPool = params => params?.createDialog?.find(value => Array.isArray(value)
		&& value.length && value.every(card => get.itemtype(card) === 'card'));
	function matches(params) {
		const count = exactCount(params?.selectButton);
		return Number.isInteger(count) && count > 1 && count === exactCount(params.selectTarget)
			&& !params.dialog && !params.filterOk && !params.processAI && !params.custom && !params.filterCard
			&& Array.isArray(params.createDialog) && cardPool(params)?.length >= count;
	}
	function withSelection(buttons, targets, callback) {
		const previousButtons = ui.selected.buttons, previousTargets = ui.selected.targets;
		ui.selected.buttons = buttons;
		ui.selected.targets = targets;
		try { return callback(); }
		finally { ui.selected.buttons = previousButtons; ui.selected.targets = previousTargets; }
	}
	function showHand(params) {
		const container = ui.handcards1Container;
		const layer = ui.create.div('.handcards.hh-distribution-hand', container);
		const dialog = ui.create.dialog(params.createDialog[0], 'hidden');
		dialog.classList.add('hh-distribution-prompt');
		const buttons = cardPool(params).map(card => ui.create.button(card, 'card', layer));
		dialog.buttons = buttons;
		const hand = ui.handcards1;
		const previous = { width: hand.style.width, overflowX: container.style.overflowX,
			overflowY: container.style.overflowY, scroll: container.classList.contains('scrollh') };
		const view = {
			buttons, layer, dialog,
			mark(button, target) {
				button.classList.add('unselectable');
				const label = ui.create.div('.hh-distribution-recipient', button);
				label.textContent = get.translation(target);
			},
			close() {
				if (active !== view) return;
				active = undefined;
				dialog.close();
				layer.remove();
				hand.style.width = previous.width;
				container.style.overflowX = previous.overflowX;
				container.style.overflowY = previous.overflowY;
				container.classList.toggle('scrollh', previous.scroll);
				globalThis.decadeUI?.layout?.updateHand();
			},
		};
		active = view;
		globalThis.decadeUI?.layout?.updateHand();
		return view;
	}
	async function distribute(event, player, params) {
		const count = exactCount(params.selectButton), assignments = [];
		const view = showHand(params);
		const priorButtons = () => assignments.map(pair => pair.button);
		const priorTargets = () => assignments.map(pair => pair.target);
		const context = callback => withSelection([...priorButtons(), ...ui.selected.buttons],
			[...priorTargets(), ...ui.selected.targets], callback);
		try {
			while (assignments.length < count && !_status.over) {
				// Use native button/target clicks and confirmation for each complete pair.
				const choice = original.call(player, { ...params, createDialog: undefined, dialog: view.dialog,
					selectButton: 1, selectTarget: 1, canHidden: false, animate: false,
					complexSelect: false, complexTarget: true, noAutoSelect: true, hhCardDistribution: true,
					filterButton(button, actor) {
						return !assignments.some(pair => pair.button === button)
							&& context(() => event.filterButton(button, actor));
					},
					filterTarget(card, actor, target) {
						return ui.selected.buttons.length === 1 && !assignments.some(pair => pair.target === target)
							&& context(() => event.filterTarget(card, actor, target));
					},
					ai1(button) { return context(() => event.ai1(button)); },
					ai2(target) { return context(() => event.ai2(target)); },
				});
				const result = await choice.forResult();
				// Cancelling only restarts the current pair; confirmed assignments remain visible.
				if (!result?.bool) continue;
				const button = view.buttons.find(item => item.link === result.links?.[0]);
				const target = result.targets?.[0];
				if (!button || !target || assignments.some(pair => pair.button === button || pair.target === target)) continue;
				assignments.push({ button, target });
				view.mark(button, target);
			}
			event.result = assignments.length !== count ? { bool: false } : {
				bool: true, confirm: 'ok', cards: [], buttons: priorButtons(),
				links: priorButtons().map(button => button.link), targets: priorTargets(),
			};
		} finally { view.close(); }
	}
	prototype.chooseButtonTarget = function (params) {
		const next = original.apply(this, arguments);
		if (!_status.connectMode && !game.online && next.isMine() && matches(params)
			&& ui.handcards1 && ui.handcards1Container) {
			next.setContent(async function (event, trigger, player) { await distribute(event, player, params); });
		}
		return next;
	};
	// A pair is committed only by the user's confirmation, even with auto-confirm enabled.
	lib.hooks?.checkEnd?.unshift(function hhDistributionConfirm(event, check) {
		if (!event.hhCardDistribution) return;
		check.auto = check.autoConfirm = check.auto_confirm = false;
		for (const button of event.dialog.buttons) button.updateTransform?.(button.classList.contains('selected'));
	});
	const controller = {
		matches,
		get handCards() { return active?.buttons || []; },
		updateHandWidth(width) { if (active) active.layer.style.width = width; },
		clear() { active?.close(); },
	};
	(lib.onover ||= []).push(controller.clear);
	game.hhCardDistribution = controller;
	return controller;
}
