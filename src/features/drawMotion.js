import { nativeDrawMotion as native, deckDrawPoints, seatDrawPoints, drawControlPoint, drawMotionFrames, drawTransform, groupDrawSources } from "../ui/sourceDrawMotion.js";

export function setupDrawMotion({ lib, game, ui, get, _status }, environment = {}) {
	if (game.hhDrawMotion) return game.hhDrawMotion;
	const env = { getDui: () => globalThis.decadeUI, Observer: globalThis.MutationObserver,
		setTimer: (fn, ms) => setTimeout(fn, ms), clearTimer: id => clearTimeout(id), ...environment };
	const pending = new WeakMap(), waitingCards = new Set(), handStates = new WeakMap(), observed = new WeakSet(), active = new Set();
	let gainSources = new WeakMap(), handGeneration = 0;
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
	function gainEvent(player, options) {
		if (options.event) return options.event;
		if (Array.isArray(options.cards) || options.losing_map) return options;
		const current = _status.event;
		if (current?.gain_list?.some(pair => pair[0] === player)) return current;
		const event = current?.name === "gain" ? current : current?.getParent?.("gain", true, true);
		if (event?.player === player) return event;
		const multiple = current?.getParent?.("loseAsync", true, true);
		return multiple?.gain_list?.some(pair => pair[0] === player) ? multiple : null;
	}
	function recipientCards(event, player) {
		const batch = event?.gain_list?.find(pair => pair[0] === player)?.[1];
		return batch ? (Array.isArray(batch) ? batch : [batch]) : event?.cards;
	}
	function describeCard(card, player, event = {}, options = {}, beforeLose = false) {
		let source, zone;
		for (const [id, groups] of Object.entries(event.losing_map || {})) {
			if (!groups[0]?.includes(card)) continue;
			source = (_status.connectMode ? lib.playerOL : game.playerMap)?.[id];
			if (groups[1]?.includes(card)) zone = "h";
			else {
				const loss = source && event.getl?.(source);
				for (const position of ["e", "j", "x", "s"]) if (loss?.[position + "s"]?.includes(card)) { zone = position; break; }
				if (!zone && /^[hejsx]$/.test(card?.original || "")) zone = card.original;
			}
			break;
		}
		const publicOrigin = card && controller.origin(card);
		if (!source && !beforeLose && ["gain2", "draw2"].includes(event.animate || options.animate) && publicOrigin) {
			return { source: null, zone: "o", channel: "", origin: publicOrigin, seatToSeat: false };
		}
		if (card && get.position) {
			const liveSource = get.owner?.(card, "judge"), liveZone = get.position(card, true);
			// After insertion, the recipient is no longer the card's source.
			if (beforeLose || liveSource !== player) {
				if (!source) source = options.source || liveSource;
				if (!zone && (!source || source === liveSource)) zone = liveZone;
			}
		}
		if (!source) source = options.source || (!beforeLose && event.animate !== "draw" ? event.source : null);
		if (!zone) zone = source ? "h" : publicOrigin && event.animate !== "draw" ? "o" : "c";
		if (["c", "d", "o"].includes(zone)) source = null;
		const channel = zone === "x" ? [...(card?.gaintag || [])].sort().join("|") : "";
		const origin = source === game.me ? rect(card) : ["d", "o"].includes(zone) ? publicOrigin : null;
		return { source: source || null, zone, channel, origin, seatToSeat: !!source && ["h", "e", "j", "s"].includes(zone) };
	}
	function sourcePoints(sources, m) {
		const points = [], width = m.width * m.scale, height = m.height * m.scale;
		for (const group of groupDrawSources(sources)) {
			const seat = group.source && rect(group.source);
			const size = arenaSize(), stack = ["d", "o"].includes(group.zone);
			const froms = seat ? seatDrawPoints(seat, group.indices.length, width, height, m.unit)
				: stack ? group.indices.map(() => ({ x: size.width / 2, y: size.height / 2 - native.stackCenterOffsetY * m.unit }))
				: deckDrawPoints(size, group.indices.length, width, height, m.unit);
			group.indices.forEach((index, i) => {
				const origin = sources[index].origin;
				points[index] = origin ? { x: origin.left, y: origin.top } : froms[i];
			});
		}
		return points;
	}
	function observeHand(container) {
		if (!container || !env.Observer || observed.has(container)) return;
		observed.add(container);
		new env.Observer(() => {
			for (const card of [...waitingCards]) {
				const state = pending.get(card);
				if (state?.container === container && card.parentNode !== container) clearWaiting(card);
			}
			for (const state of [...active]) if (state.real && state.container === container && state.real.parentNode !== container) finish(state);
		}).observe(container, { childList: true });
	}
	const controller = {
		position: rect,
		get enabled() { return enabled(); },
		canPlay(player) { return enabled() && !!rect(player); },
		handlesHand(cards, player) {
			if (!enabled() || player !== game.me || !cards.length) return false;
			if (Array.from(cards).every(card => card && (pending.has(card) || handStates.has(card)))) return true;
			const event = gainEvent(player, {}), batch = event?.gain_list && recipientCards(event, player);
			return !!batch && cards.length === batch.length && Array.from(cards).every(card => !card || batch.includes(card));
		},
		captureGain(event, player = event?.player) {
			if (!enabled() || !event || gainSources.has(event)) return;
			const cards = event.gain_list ? event.gain_list.flatMap(pair => Array.isArray(pair[1]) ? pair[1] : [pair[1]]) : event.cards;
			if (!Array.isArray(cards)) return;
			const parent = event.getParent?.("loseAsync", true, true), inherited = parent && gainSources.get(parent);
			const sources = new Map();
			for (const card of cards) {
				if (typeof card?.copy !== "function" && !Array.isArray(card?.cards)) continue;
				const source = inherited?.get(card) || describeCard(card, player, event, {}, true);
				sources.set(card, source);
				for (const physical of card.cards || [card]) {
					sources.set(physical, inherited?.get(physical) || source);
				}
			}
			gainSources.set(event, sources);
		},
		describe(cards, player, options = {}) {
			const event = gainEvent(player, options), saved = event && gainSources.get(event);
			const batch = recipientCards(event, player);
			return Array.from(cards, (card, i) => {
				const physical = card || (batch?.length === cards.length ? batch[i] : null);
				return saved?.get(physical) || describeCard(physical, player, event || options, options);
			});
		},
		origin(card) {
			const clone = card?.clone;
			return clone?.parentNode === ui.arena ? rect(clone) : null;
		},
		prepareHand(cards, boundsCaches, options = {}) {
			if (!enabled() || !game.me || !ui.arena?.animate || !cards.length) return false;
			if (typeof options.animate === "function" || options.animate === false) return false;
			const m = metrics(), sources = controller.describe(cards, game.me, options), points = sourcePoints(sources, m);
			handGeneration++;
			cards.forEach((card, i) => {
				if (!card?.copy) return;
				clearWaiting(card); if (handStates.has(card)) finish(handStates.get(card));
				pending.set(card, { from: points[i], transition: card.style.transition, container: game.me.node.handcards1,
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
				const newDeal = old.generation !== handGeneration;
				if (!newDeal && Math.abs(end.x - old.end.x) + Math.abs(end.y - old.end.y) < .5) return;
				const current = rect(old.clone), remaining = newDeal ? native.handMs : Math.max(16, old.duration - (old.animation.currentTime || 0));
				old.generation = handGeneration;
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
				{ real: card, container: card.parentNode, opacity: card.style.opacity, transition: waiting.transition, generation: handGeneration });
			if (state.finished) { card.style.transition = waiting.transition; return; }
			handStates.set(card, state); card.style.opacity = "0";
			state.interact = () => finish(state);
			card.addEventListener?.("pointerdown", state.interact, true);
		},
		play(cards, player, options = {}) {
			if (!enabled() || !cards.length || !ui.arena?.animate) return false;
			const target = rect(player); if (!target) return false;
			const m = metrics(), width = m.width * m.scale, height = m.height * m.scale;
			const sources = options.sources || controller.describe(cards, player, options);
			const froms = sourcePoints(sources, m), ends = [];
			for (const group of groupDrawSources(sources)) {
				const points = seatDrawPoints(target, group.indices.length, width, height, m.unit, true);
				group.indices.forEach((index, i) => ends[index] = points[i]);
			}
			cards.forEach((card, i) => {
				const source = sources[i];
				const origin = source.origin || (source.source === game.me || ["d", "o"].includes(source.zone) ? options.origins?.[i] : null);
				const start = { ...(origin ? { x: origin.left, y: origin.top } : froms[i]), scale: origin ? origin.width / m.width : m.scale };
				const end = { ...ends[i], scale: m.scale };
				const hand = player === game.me;
				startClone(card, start, end, hand ? null : drawControlPoint(start, end, ui.arena.offsetHeight, m.unit, sources[i].seatToSeat), { hand });
			});
			return true;
		},
		clear() { for (const card of [...waitingCards]) clearWaiting(card); for (const state of [...active]) finish(state); gainSources = new WeakMap(); },
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
