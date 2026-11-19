/** Stage one-to-one card/recipient choices without moving cards before the complete result. */
export function setupCardDistribution({ lib, game, ui, get, _status }) {
	if (game.hhCardDistribution) return game.hhCardDistribution;
	const prototype = lib.element?.Player?.prototype || lib.element?.player;
	const original = prototype?.chooseButtonTarget;
	if (typeof original !== 'function') return;
	const exactCount = value => typeof value === 'number' ? value
		: Array.isArray(value) && value[0] === value[1] ? value[0] : 0;
	function matches(params) {
		const count = exactCount(params?.selectButton);
		return Number.isInteger(count) && count > 1 && count === exactCount(params.selectTarget)
			&& !params.dialog && !params.filterOk && !params.processAI && !params.custom && !params.filterCard
			&& Array.isArray(params.createDialog) && params.createDialog.some(value => Array.isArray(value)
				&& value.length >= count && value.every(card => get.itemtype(card) === 'card'));
	}
	function withSelection(buttons, targets, callback) {
		const previousButtons = ui.selected.buttons, previousTargets = ui.selected.targets;
		ui.selected.buttons = buttons;
		ui.selected.targets = targets;
		try { return callback(); }
		finally { ui.selected.buttons = previousButtons; ui.selected.targets = previousTargets; }
	}
	async function distribute(event, player, params) {
		const count = exactCount(params.selectButton);
		const pool = player.chooseButton({ ...params, createDialog: params.createDialog.slice(),
			filterTarget: undefined, selectTarget: undefined, ai: params.ai1,
			filterButton: event.filterButton, selectButton: count,
		});
		const selected = await pool.forResult();
		if (!selected?.bool) { event.result = { bool: false }; return; }
		const available = selected.links.slice(), assignments = [];
		while (available.length && !_status.over) {
			const picked = await player.chooseButton({
				createDialog: ['请选择要分配的牌', available.slice()], forced: true, selectButton: 1, ai: params.ai1,
			}).forResult();
			if (!picked?.bool) { event.result = { bool: false }; return; }
			const card = picked.links[0];
			if (!available.includes(card)) continue;
			const targetChoice = player.chooseTarget({ ...params,
				createDialog: ['将此牌分配给一名角色', [card]],
				prompt: `将${get.translation(card)}分配给一名角色`,
				prompt2: assignments.map(pair => `${get.translation(pair.card)} → ${get.translation(pair.target)}`).join('；'),
				filterButton: undefined, selectButton: undefined, filterCard: undefined,
				selectTarget: 1, forced: false, complexSelect: false, complexTarget: false, animate: false,
				filterTarget(cardx, actor, target) {
					if (assignments.some(pair => pair.target === target)) return false;
					const ordered = [...assignments.map(pair => pair.card), card, ...available.filter(item => item !== card)];
					return withSelection(ordered.map(link => selected.buttons?.find(button => button.link === link) || { link }),
						[...assignments.map(pair => pair.target), ...ui.selected.targets],
						() => event.filterTarget(cardx, actor, target));
				},
				ai(target) {
					if (typeof params.ai2 !== 'function') return get.attitude(player, target);
					const ordered = [...assignments.map(pair => pair.card), card, ...available.filter(item => item !== card)];
					return withSelection(ordered.map(link => ({ link })), assignments.map(pair => pair.target), () => params.ai2(target));
				},
			});
			const recipient = await targetChoice.forResult();
			// Cancelling this recipient returns to the locked pool; earlier pairs stay intact.
			if (!recipient?.bool) continue;
			const target = recipient.targets[0];
			if (!target || assignments.some(pair => pair.target === target)) continue;
			assignments.push({ card, target });
			available.splice(available.indexOf(card), 1);
		}
		if (assignments.length !== count) { event.result = { bool: false }; return; }
		event.result = { bool: true, confirm: 'ok', cards: [],
			links: assignments.map(pair => pair.card), targets: assignments.map(pair => pair.target),
			buttons: assignments.map(pair => selected.buttons?.find(button => button.link === pair.card) || { link: pair.card }),
		};
	}
	prototype.chooseButtonTarget = function (params) {
		const next = original.apply(this, arguments);
		if (!_status.connectMode && !game.online && next.isMine() && matches(params)) {
			next.setContent(async function (event, trigger, player) { await distribute(event, player, params); });
		}
		return next;
	};
	const controller = { matches };
	game.hhCardDistribution = controller;
	return controller;
}
