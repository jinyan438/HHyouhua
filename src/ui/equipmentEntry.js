import { nativeEquipmentMotion } from "./sourceEquipmentMotion.js";

// Native LayoutEquipCards moves x from seatX - 146 to seatX + 27 in 300 ms.
const DURATION_MS = nativeEquipmentMotion.slideMs;
const TRAVEL_RATIO = (nativeEquipmentMotion.equipWidth + nativeEquipmentMotion.equipInset) / nativeEquipmentMotion.equipWidth;

export function setupEquipmentEntry({ lib, game }, environment = {}) {
	if (game.hhEquipmentEntry) return game.hhEquipmentEntry;
	const env = {
		Observer: globalThis.MutationObserver,
		setTimer: (fn, ms) => setTimeout(fn, ms), clearTimer: id => clearTimeout(id),
		...environment,
	};
	const observers = new WeakMap(), states = new WeakMap(), active = new Set();
	const enabled = () => lib.config?.animation !== false;
	const realEquip = card => card?.classList?.contains("card") && !card.classList.contains("emptyequip")
		&& !card.classList.contains("feichu") && !/^(empty_|feichu_)/.test(card.name || "");

	function finish(state) {
		if (state.finished) return;
		state.finished = true;
		state.cancelWait?.();
		for (const timer of state.timers) env.clearTimer(timer);
		if (state.label.style.visibility === "hidden") state.label.style.visibility = state.visibility;
		if (state.card.style.clipPath === state.appliedClip) state.card.style.clipPath = state.clip;
		if (state.animation) {
			state.animation.onfinish = state.animation.oncancel = null;
			state.animation.cancel();
		}
		if (states.get(state.card) === state) states.delete(state.card);
		active.delete(state);
	}

	function slide(state) {
		if (state.finished || state.started) return;
		state.started = true;
		state.cancelWait?.();
		state.cancelWait = null;
		for (const timer of state.timers) env.clearTimer(timer);
		state.timers.length = 0;
		if (state.card.parentNode !== state.container || !enabled() || state.label.ownerDocument?.hidden) return finish(state);
		const width = state.label.offsetWidth || state.card.offsetWidth;
		if (!width || typeof state.label.animate !== "function") return finish(state);
		state.label.style.visibility = state.visibility;
		const compact = state.container.classList?.contains("hh-source-equipment-layout") && state.container.parentNode?.classList?.contains("player");
		const fullWidth = state.container.offsetWidth || width, offset = state.card.offsetLeft || 0;
		// Half strips cross the whole row; clipping to their final half would hide most of the native slide.
		state.card.style.clipPath = compact ? `inset(0px ${-(fullWidth - offset - (state.card.offsetWidth || width) + 2)}px 0px ${-(offset + 2)}px)` : "inset(0px -2px)";
		state.appliedClip = state.card.style.clipPath;
		const travel = compact ? fullWidth * TRAVEL_RATIO + offset : width * TRAVEL_RATIO;
		try {
			state.animation = state.label.animate([
				{ transform: `translateX(${-travel}px)` },
				{ transform: "translateX(0px)" },
			], { duration: DURATION_MS, easing: "linear", fill: "none" });
			state.animation.onfinish = state.animation.oncancel = () => finish(state);
			state.timers.push(env.setTimer(() => finish(state), DURATION_MS + 80));
		} catch { finish(state); }
	}

	function queue(card, player) {
		if (!enabled() || !realEquip(card)) return;
		const container = player.node.equips, label = card.node?.name2;
		if (!label || card.parentNode !== container || typeof label.animate !== "function") return;
		const old = states.get(card);
		if (old?.container === container) return;
		if (old) finish(old);
		const state = { card, label, container, visibility: label.style.visibility, clip: card.style.clipPath, timers: [], started: false, finished: false };
		states.set(card, state); active.add(state);
		label.style.visibility = "hidden";
		state.cancelWait = game.hhEquipMove?.afterArrival?.(card, player, () => slide(state));
		if (state.cancelWait) state.timers.push(env.setTimer(() => slide(state), nativeEquipmentMotion.watchdogMs));
		else slide(state);
	}

	const controller = {
		observe(player) {
			const container = player?.node?.equips;
			if (!container || !env.Observer || observers.has(container)) return;
			// Existing/reconnected equipment is already at rest and must not replay.
			let known = new Set(container.childNodes);
			const observer = new env.Observer(() => {
				const current = new Set(container.childNodes);
				for (const card of known) {
					const state = states.get(card);
					if (!current.has(card) && state?.container === container) finish(state);
				}
				for (const card of current) if (!known.has(card)) queue(card, player);
				known = current;
			});
			observer.observe(container, { childList: true });
			observers.set(container, observer);
		},
		clear() { for (const state of [...active]) finish(state); },
		get activeCount() { return active.size; },
	};
	game.hhEquipmentEntry = controller;
	(lib.onover ||= []).push(() => controller.clear());
	(lib.arenaReady ||= []).push(() => { for (const player of game.players || []) controller.observe(player); });
	for (const player of game.players || []) controller.observe(player);
	return controller;
}
