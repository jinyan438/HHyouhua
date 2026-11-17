const DISPLAY_MS = 300;
const SHRINK_MS = 450;

// Only animation clones enter this controller. Real cards keep the engine's zone lifecycle.
export function setupEquipMove({ lib, game, ui, get, _status }, environment = {}) {
	if (game.hhEquipMove) return game.hhEquipMove;
	const env = { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: id => clearTimeout(id), ...environment };
	const states = new WeakMap(), sources = new WeakMap(), equipEvents = new WeakSet(), active = new Set();

	function useEvent(source, current = _status.event) {
		const matches = event => event?.name === 'useCard' && get.type(event.card) === 'equip'
			&& (event.cards?.includes(source) || event.card === source);
		if (matches(current)) return current;
		const parent = current?.getParent?.('useCard', true, true);
		return matches(parent) ? parent : null;
	}

	function finish(state) {
		if (state.finished) return;
		state.finished = true;
		for (const timer of state.timers) env.clearTimeout(timer);
		state.timers.length = 0;
		active.delete(state);
		const index = ui.thrown?.indexOf(state.clone) ?? -1;
		if (index >= 0) ui.thrown.splice(index, 1);
		// The engine's delete() can wait for a transition that never arrives. Remove directly.
		state.clone.remove();
		if (state.source.clone === state.clone) delete state.source.clone;
	}

	function later(state, callback, delay) {
		state.timers.push(env.setTimeout(() => {
			if (state.finished) return;
			try { callback(); } catch { finish(state); }
		}, delay));
	}

	function prepare(source, clone, equip, target, event) {
		const state = { source, clone, equip, target, event, timers: [], finished: false, shown: false };
		states.set(clone, state);
		sources.set(source, state);
		active.add(state);
		clone.fixed = true;
		// Native equip may call this before insertion, call it twice, or skip it entirely.
		clone.moveDelete = clone.moveTo = function (player) {
			if (!state.finished && player) state.target = player;
			return this;
		};
		later(state, () => finish(state), 1000);
	}

	function removePreviousClone(source) {
		const clone = source.clone;
		if (!clone || clone === source) return;
		const state = states.get(clone);
		if (state) { finish(state); return; }
		if (clone.parentNode !== ui.arena) return;
		const index = ui.thrown?.indexOf(clone) ?? -1;
		if (index >= 0) ui.thrown.splice(index, 1);
		// Gain/draw frame callbacks still hold this old clone. Use a fresh one so
		// those callbacks cannot overwrite or prematurely remove the equip animation.
		clone.remove();
		if (source.clone === clone) delete source.clone;
	}

	function localRect(node) {
		const arena = ui.arena, area = arena.getBoundingClientRect(), rect = node?.getBoundingClientRect();
		if (!rect?.width || !rect.height || !area.width || !area.height || !arena.offsetWidth || !arena.offsetHeight) return null;
		const sx = area.width / arena.offsetWidth, sy = area.height / arena.offsetHeight;
		return { left: (rect.left - area.left) / sx, top: (rect.top - area.top) / sy, width: rect.width / sx, height: rect.height / sy };
	}

	function destination(state) {
		const equips = state.target?.node?.equips;
		const slots = Array.from(equips?.children || []);
		const slot = slots.find(card => card === state.source || card.cardid && card.cardid === state.source.cardid
			|| card.cards?.includes(state.source) || card[card.cardSymbol]?.cards?.includes(state.source)
			|| card.name === state.equip.name);
		const rect = localRect(slot);
		if (rect) return rect;
		const bar = localRect(equips);
		if (bar) return { ...bar, height: Math.min(bar.height, 16) };
		const player = localRect(state.target);
		return player && { left: player.left + player.width * .17, top: player.top + player.height * .8, width: player.width * .7, height: 16 };
	}

	function shrink(state) {
		// Arm removal before reading the slot: replacement skills may already have removed it.
		later(state, () => finish(state), SHRINK_MS + 30);
		const rect = destination(state);
		if (!rect || !state.clone.isConnected) return finish(state);
		const scale = Math.min(rect.width / state.width, rect.height / state.height, state.scale * .38);
		const x = rect.left;
		const y = rect.top + (rect.height - state.height * scale) / 2;
		state.clone.style.transition = `transform ${SHRINK_MS}ms cubic-bezier(.4,0,.2,1)`;
		state.clone.style.transform = `translate(${x}px,${y}px) scale(${scale})`;
	}

	const controller = {
		prepareClone(source, clone, actor) {
			if (!source || source.throwWith === 'e' || source.original === 'e' || source.parentNode?.classList?.contains('equips')) return false;
			const event = useEvent(source);
			if (!event || !clone || clone === source) return false;
			prepare(source, clone, event.card, event.targets?.[0] || event.player || actor, event);
			return true;
		},
		beginEquip(event, actor) {
			if (!event?.card?.name || equipEvents.has(event)) return;
			equipEvents.add(event);
			const target = event.player || actor;
			const cards = event.cards?.length ? event.cards : [event.card];
			for (const source of cards) {
				const previous = sources.get(source), use = useEvent(source, event);
				if (previous && (previous.event === event || use && previous.event === use)) {
					previous.target = target;
					previous.equip = event.card;
					continue;
				}
				removePreviousClone(source);
				const appearance = typeof source.copy === 'function' ? source : game.createCard(event.card.name, source.suit || 'none', source.number || 0);
				const clone = appearance.copy('thrown');
				prepare(source, clone, event.card, target, event);
				controller.show(clone);
			}
		},
		placed(equip, cards, player) {
			const current = _status.event;
			const event = current?.name === 'equip' ? current : current?.getParent?.('equip', true, true);
			if (event?.player === player && (event.card === equip || cards?.length && cards.every(card => event.cards?.includes(card)))) {
				controller.beginEquip(event, player);
			} else {
				controller.beginEquip({ card: equip, cards, player }, player);
			}
		},
		drawsEquip(cards, player) {
			const event = _status.event;
			if (event?.name !== 'equip' || event.player !== player || !cards.length || !cards.every(card => card && event.cards?.includes(card))) return false;
			controller.beginEquip(event, player);
			return true;
		},
		show(clone) {
			const state = states.get(clone);
			if (!state) return false;
			if (state.shown || state.finished) return true;
			state.shown = true;
			try {
				Object.assign(clone.style, { left: '0px', top: '0px', margin: '0px', transformOrigin: '0 0', transition: 'none', opacity: '1', pointerEvents: 'none', zIndex: '100' });
				ui.arena.appendChild(clone);
				const player = localRect(state.target);
				state.width = clone.offsetWidth;
				state.height = clone.offsetHeight;
				if (!player || !state.width || !state.height) { finish(state); return true; }
				state.scale = Math.min(player.width * .66 / state.width, player.height * .7 / state.height);
				const x = player.left + player.width * .05, y = player.top + player.height * .03;
				clone.style.transform = `translate(${x}px,${y}px) scale(${state.scale})`;
				later(state, () => shrink(state), DISPLAY_MS);
			} catch { finish(state); }
			return true;
		},
		clear() { for (const state of active) finish(state); },
		get activeCount() { return active.size; },
	};
	(lib.onover ||= []).push(() => controller.clear());
	game.hhEquipMove = controller;
	return controller;
}
