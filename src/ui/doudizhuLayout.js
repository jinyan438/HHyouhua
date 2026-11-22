/** Landlord-relative seats, including dead players whose physical seats remain on screen. */
export function getDoudizhuLayout(game, mode) {
	if (mode !== "doudizhu") return null;
	const players = [...new Set([...(game.players || []), ...(game.dead || [])])];
	const lord = game.zhu;
	if (players.length !== 3 || !players.includes(game.me) || !players.includes(lord) || lord.identity !== "zhu") return null;

	let seats = [lord, lord.nextSeat, lord.nextSeat?.nextSeat];
	if (new Set(seats).size !== 3 || seats.some(player => !players.includes(player)) || seats[2].nextSeat !== lord) {
		// During selection/reconnection the engine may publish positions before nextSeat.
		const positions = players.map(player => Number(player.dataset?.position));
		if (positions.some(position => !Number.isInteger(position) || position < 0 || position > 2) || new Set(positions).size !== 3) return null;
		const first = Number(lord.dataset.position);
		seats = players.slice().sort((a, b) => (Number(a.dataset.position) - first + 3) % 3 - (Number(b.dataset.position) - first + 3) % 3);
	}
	const view = seats.indexOf(game.me) + 1;
	const slots = [
		["self", "top-right", "top-left"],
		["top", "self", "right"],
		["top", "left", "self"],
	][view - 1];
	return { view, slots: new Map(seats.map((player, index) => [player, slots[index]])) };
}

export function setupDoudizhuLayout({ lib, game, ui, get }) {
	if (game.hhDoudizhuLayout) return game.hhDoudizhuLayout;
	let arena, observer, pending = false;
	function refresh() {
		if (!arena) return;
		const layout = getDoudizhuLayout(game, get.mode());
		const view = layout ? String(layout.view) : undefined;
		const viewChanged = arena.dataset.hhDoudizhuView !== view;
		if (viewChanged) {
			if (view) arena.dataset.hhDoudizhuView = view;
			else delete arena.dataset.hhDoudizhuView;
		}
		for (const player of arena.children) {
			if (!player.classList.contains("player")) continue;
			const slot = layout?.slots.get(player);
			if (player.dataset.hhDoudizhuSlot !== slot) {
				if (slot) player.dataset.hhDoudizhuSlot = slot;
				else delete player.dataset.hhDoudizhuSlot;
				player.cacheLeft = null;
			}
			// Card trajectories cache positions separately from the DOM layout.
			if (viewChanged) player.cacheLeft = null;
		}
	}
	function schedule() {
		if (pending) return;
		pending = true;
		queueMicrotask(() => { pending = false; refresh(); });
	}
	function observe() {
		if (arena !== ui.arena) {
			observer?.disconnect();
			arena = ui.arena;
			if (arena) {
				observer = new MutationObserver(records => {
					if (records.some(record => record.type === "attributes" || record.target === arena)) schedule();
				});
				observer.observe(arena, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-number", "data-position", "data-color"] });
			}
		}
		refresh();
	}
	const controller = { refresh, observe };
	game.hhDoudizhuLayout = controller;
	(lib.arenaReady ||= []).push(observe);
	observe();
	return controller;
}
