import { nativeDrawMotion as native, deckDrawPoints, seatDrawPoints, drawControlPoint, drawMotionFrames, drawTransform } from "../ui/sourceDrawMotion.js";

export function setupDrawMotion({ lib, game, ui, get, _status }, environment = {}) {
	if (game.hhDrawMotion) return game.hhDrawMotion;
	const env = { getDui: () => globalThis.decadeUI, Observer: globalThis.MutationObserver,
		setTimer: (fn, ms) => setTimeout(fn, ms), clearTimer: id => clearTimeout(id), ...environment };
	const pending = new WeakMap(), waitingCards = new Set(), handStates = new WeakMap(), observed = new WeakSet(), active = new Set();
	const enabled = () => lib.config?.animation !== false && !game.chess && typeof ui.arena?.animate === "function";
	const arenaSize = () => ({ width: ui.arena.offsetWidth, height: ui.arena.offsetHeight });
	function clearWaiting(card, restore = true) {
		const state = pending.get(card); if (!state) return;
		env.clearTimer(state.timer); pending.delete(card); waitingCards.delete(card);
		if (restore && card.parentNode === state.container) card.classList.remove("drawinghidden");
		if (restore && card.style.transition === "none") card.style.transition = state.transition;
	}
	function rect(node) {
		const arena = ui.arena, a = arena?.getBoundingClientRect(), r = node?.getBoundingClientRect?.();
		if (!a?.width || !a.height || !r?.width || !r.height || !arena.offsetWidth || !arena.offsetHeight) return null;
		const sx = a.width / arena.offsetWidth, sy = a.height / arena.offsetHeight;
		return { left: (r.left - a.left) / sx, top: (r.top - a.top) / sy, width: r.width / sx, height: r.height / sy };
	}
	function metrics() {
		const bounds = env.getDui()?.boundsCaches?.arena;
		bounds?.check?.();
		const width = bounds?.cardWidth || 108, height = bounds?.cardHeight || 150, scale = bounds?.cardScale || 1;
		return { width, height, scale, unit: width * scale / native.cardWidth };
	}
	function finish(state) {
		if (state.finished) return;
		state.finished = true;
		for (const timer of state.timers) env.clearTimer(timer);
		if (state.animation) { state.animation.onfinish = state.animation.oncancel = null; state.animation.cancel(); }
		state.clone.remove();
		const index = ui.thrown?.indexOf(state.clone) ?? -1;
		if (index >= 0) ui.thrown.splice(index, 1);
		if (state.real) {
			if (state.real.style.opacity === "0") state.real.style.opacity = state.opacity;
			// Commit the handoff before restoring the game's transition: all rule.
			void state.real.offsetWidth;
			if (state.real.style.transition === "none") state.real.style.transition = state.transition;
			state.real.removeEventListener?.("pointerdown", state.interact, true);
			if (handStates.get(state.real) === state) handStates.delete(state.real);
		}
		active.delete(state);
	}
	function animate(state, start, end, control, duration) {
		if (state.animation) { state.animation.onfinish = state.animation.oncancel = null; state.animation.cancel(); }
		state.end = end;
		Object.assign(state.clone.style, { left: "0px", top: "0px", margin: "0px", transformOrigin: "0 0",
			transition: "none", animation: "none", opacity: "1", pointerEvents: "none", transform: drawTransform(end) });
		const plan = drawMotionFrames(start, end, control, !!state.real || state.hand, duration);
		state.duration = plan.duration;
		state.animation = state.clone.animate(plan.frames, { duration: plan.duration, easing: "linear", fill: "both" });
		state.animation.onfinish = state.animation.oncancel = () => finish(state);
	}
	function startClone(clone, start, end, control, options = {}) {
		const state = { clone, timers: [], ...options };
		clone.fixed = true;
		active.add(state);
		try {
			ui.arena.appendChild(clone);
			animate(state, start, end, control);
			state.timers.push(env.setTimer(() => finish(state), native.watchdogMs));
		} catch { finish(state); }
		return state;
	}
	function sourceFor(card, options) {
		if (options.animate === "draw") return null;
		if (options.animate === "give" || options.animate === "giveAuto") {
			for (const [id, groups] of Object.entries(options.losing_map || {})) {
				if (groups.some(group => Array.isArray(group) && group.includes(card))) return (_status.connectMode ? lib.playerOL : game.playerMap)?.[id];
			}
		}
		return options.source || null;
	}
	function observeHand(container) {
		if (!container || !env.Observer || observed.has(container)) return;
		observed.add(container);
		new env.Observer(() => {
			for (const state of [...active]) if (state.real && state.container === container && state.real.parentNode !== container) finish(state);
		}).observe(container, { childList: true });
	}
	const controller = {
		position: rect,
		get enabled() { return enabled(); },
		canPlay(player) { return enabled() && !!rect(player); },
		handlesHand(cards, player) { return player === game.me && cards.length > 0 && cards.every(card => pending.has(card) || handStates.has(card)); },
		origin(card) {
			const clone = card?.clone;
			return clone?.parentNode === ui.arena ? rect(clone) : null;
		},
		prepareHand(cards, boundsCaches, options = {}) {
			if (!enabled() || !game.me || !ui.arena?.animate || !cards.length) return false;
			if (typeof options.animate === "function" || options.animate === false) return false;
			const m = metrics(), points = deckDrawPoints(arenaSize(), cards.length, m.width * m.scale, m.height * m.scale, m.unit);
			cards.forEach((card, i) => {
				if (!card?.copy) return;
				clearWaiting(card); if (handStates.has(card)) finish(handStates.get(card));
				const source = sourceFor(card, options);
				let from;
				if (options.animate === "gain2" || options.animate === "draw2") {
					const r = controller.origin(card); if (r) from = { x: r.left, y: r.top };
				}
				if (!from && source) {
					// Rk.fromHandFunc uses the sender's card point, not an old discard clone.
					const r = source === game.me && rect(card);
					if (r) from = { x: r.left, y: r.top };
					else { const seat = rect(source); if (seat) from = seatDrawPoints(seat, 1, m.width * m.scale, m.height * m.scale, m.unit)[0]; }
				} else if (!from && options.animate !== "draw") {
					const r = controller.origin(card); if (r) from = { x: r.left, y: r.top };
				}
				pending.set(card, { from: from || points[i], transition: card.style.transition, container: game.me.node.handcards1,
					timer: env.setTimer(() => clearWaiting(card), native.watchdogMs) });
				waitingCards.add(card);
				// The final layout is measured without the legacy 400ms CSS interpolation.
				card.style.transition = "none";
			});
			observeHand(game.me.node.handcards1);
			return true;
		},
		settleHand(card) {
			const waiting = pending.get(card), old = handStates.get(card);
			if (!waiting && !old) return;
			if (!enabled() || card.parentNode !== (waiting || old).container || card.classList.contains("selected")) {
				if (old) finish(old);
				if (waiting) clearWaiting(card);
				return;
			}
			if (waiting) card.classList.remove("drawinghidden");
			const r = rect(card); if (!r) return;
			const end = { x: r.left, y: r.top, scale: r.width / card.offsetWidth };
			if (old) {
				if (Math.abs(end.x - old.end.x) + Math.abs(end.y - old.end.y) < .5) return;
				const current = rect(old.clone), remaining = Math.max(16, old.duration - (old.animation.currentTime || 0));
				if (current) try { animate(old, { x: current.left, y: current.top, scale: current.width / old.clone.offsetWidth }, end, null, remaining); } catch { finish(old); }
				return;
			}
			clearWaiting(card, false);
			let clone;
			try { clone = card.copy("thrown", "drawingcard", false); }
			catch { card.style.transition = waiting.transition; return; }
			clone.style.width = `${card.offsetWidth}px`;
			clone.style.height = `${card.offsetHeight}px`;
			const state = startClone(clone, { ...waiting.from, scale: end.scale }, end, null,
				{ real: card, container: card.parentNode, opacity: card.style.opacity, transition: waiting.transition });
			if (state.finished) { card.style.transition = waiting.transition; return; }
			handStates.set(card, state); card.style.opacity = "0";
			state.interact = () => finish(state);
			card.addEventListener?.("pointerdown", state.interact, true);
		},
		play(cards, player, options = {}) {
			if (!enabled() || !cards.length || !ui.arena?.animate) return false;
			const target = rect(player); if (!target) return false;
			const m = metrics(), width = m.width * m.scale, height = m.height * m.scale;
			const starts = options.source && rect(options.source);
			const froms = starts ? seatDrawPoints(starts, cards.length, width, height, m.unit) : deckDrawPoints(arenaSize(), cards.length, width, height, m.unit);
			const ends = seatDrawPoints(target, cards.length, width, height, m.unit, true);
			cards.forEach((card, i) => {
				const origin = options.origins?.[i];
				const start = { ...(origin ? { x: origin.left, y: origin.top } : froms[i]), scale: origin ? origin.width / m.width : m.scale };
				const end = { ...ends[i], scale: m.scale };
				const hand = player === game.me;
				startClone(card, start, end, hand ? null : drawControlPoint(start, end, ui.arena.offsetHeight, m.unit, !!options.source), { hand });
			});
			return true;
		},
		clear() { for (const card of [...waitingCards]) clearWaiting(card); for (const state of [...active]) finish(state); },
		get activeCount() { return active.size; },
	};
	game.hhDrawMotion = controller;
	(lib.onover ||= []).push(() => controller.clear());
	// Starting hands and luck-card exchanges enter via directgain rather than gain.
	const prototype = lib.element?.Player?.prototype || lib.element?.player;
	if (prototype?.directgain) {
		const original = prototype.directgain;
		prototype.directgain = function (cards, ...args) {
			const event = _status.event, deal = event?.name === "gameDraw" || event?.getParent?.("gameDraw", true, true);
			const fresh = deal && enabled() ? cards.filter(card => !this.getCards("hs").includes(card)) : [];
			if (fresh.length && this === game.me) controller.prepareHand(fresh, null, { animate: "draw" });
			const result = original.call(this, cards, ...args);
			if (fresh.length && this !== game.me) this.$draw(fresh.length, false);
			return result;
		};
	}
	return controller;
}
