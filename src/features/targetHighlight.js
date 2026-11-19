/** Keep confirmed targets visible until the entire card or skill event settles. */
export function setupTargetHighlight({ lib, game, get, _status }) {
	if (game.hhTargetHighlight) return game.hhTargetHighlight;
	const effects = new Map(), owners = new Map();
	const choices = new Set(["chooseTarget", "chooseButtonTarget"]);
	const selectionRanges = new WeakMap();
	const responseEvents = new Set(["respond", "chooseToRespond", "dying", "_save", "_wuxie"]);
	const isEffect = event => event.name === "useCard" || event.name === "useSkill" || !!lib.skill?.[event.name]?.content;
	const originalCreate = game.createEvent;

	function isActiveAction(event) {
		if (!event.player || event.player !== _status?.currentPhase || event.hideTargets || _status.over) return false;
		const visited = new Set();
		for (let current = event; current && !visited.has(current); current = current.parent) {
			visited.add(current);
			if (current.respondTo || responseEvents.has(current.name)
				|| current.name === "chooseToUse" && current.type && current.type !== "phase"
				|| lib.skill?.[current.name]?.content && current._trigger) return false;
			if (current !== event && isEffect(current) && current.player && current.player !== event.player) return false;
		}
		return true;
	}
	function explicitRange(event, info = {}, cached = true) {
		if (cached && selectionRanges.has(event)) return selectionRanges.get(event);
		const selector = event.selectTarget ?? info.selectTarget;
		// Dynamic selectors depend on the current choice. Cache them while that choice is checked.
		if (typeof selector === "function" && event !== _status.event) return false;
		try {
			const value = get?.select ? get.select(selector) : typeof selector === "function" ? selector() : selector;
			return (Array.isArray(value) ? value[1] : value ?? 1) > 0;
		} catch { return false; }
	}
	function explicitTargets(event) {
		const info = event.name === "useCard" ? (event.card && (get?.info?.(event.card) || lib.card?.[event.card.name]))
			: lib.skill?.[event.skill || event.name];
		if (!info || info.notarget || info.toself || info.type === "equip") return false;
		const visited = new Set();
		const declared = source => selectionRanges.has(source) || source.selectTarget !== undefined
			|| info.selectTarget !== undefined || !!info.filterTarget;
		for (let parent = event.parent; parent && !visited.has(parent); parent = parent.parent) {
			visited.add(parent);
			if (isEffect(parent)) break;
			if (parent.player === event.player && (choices.has(parent.name) || parent.name === "chooseToUse" || parent.name === "chooseUseTarget")) {
				return declared(parent) && explicitRange(parent, info);
			}
		}
		return declared(event) && explicitRange(event, info);
	}
	// Native auto-confirm clears selected cards and restores skill selectors; capture their range first.
	lib.hooks?.checkEnd?.unshift(function hhTargetSelection(event) {
		if (event.filterTarget) selectionRanges.set(event, explicitRange(event, {}, false));
	});
	function addTargets(state, targets, explicit) {
		if (!explicit || !isActiveAction(state.event)) return;
		for (const target of targets || []) {
			if (!target?.classList?.contains("player") || target === state.event.player || target.removed
				|| target.isDead?.() || target.isOut?.() || state.targets.has(target)) continue;
			state.targets.add(target);
			if (!owners.has(target)) owners.set(target, new Set());
			owners.get(target).add(state);
			target.classList.add("hh-target-resolving");
		}
	}
	function release(event) {
		const state = effects.get(event);
		if (!state) return;
		for (const target of state.targets) {
			const active = owners.get(target);
			active?.delete(state);
			if (!active?.size) {
				owners.delete(target);
				target.classList.remove("hh-target-resolving");
			}
		}
		effects.delete(event);
	}
	function sync(event) {
		const state = effects.get(event);
		if (state) addTargets(state, event.targets, state.explicit);
	}
	function confirmChoice(event) {
		if (!event.result?.bool || !explicitRange(event)) return;
		const visited = new Set();
		for (let parent = event.parent; parent && !visited.has(parent); parent = parent.parent) {
			visited.add(parent);
			// The outer combined choice must finish before its targets take effect.
			if (choices.has(parent.name)) return;
			const state = effects.get(parent);
			if (state) {
				if (event.player === parent.player) addTargets(state, event.result.targets, true);
				return;
			}
		}
	}
	function observe(event) {
		if (!event || typeof event.start !== "function" || (!isEffect(event) && !choices.has(event.name))) return;
		const originalStart = event.start;
		let completion;
		event.start = function (...args) {
			if (completion) return completion;
			if (isEffect(event)) {
				effects.set(event, { event, targets: new Set(), explicit: explicitTargets(event) });
				sync(event);
				// Use the native default handler so added targets are seen between content steps.
				event.pushHandler?.(sync);
			}
			try {
				completion = Promise.resolve(originalStart.apply(this, args)).then(value => {
					if (choices.has(event.name)) confirmChoice(event);
					return value;
				}).finally(() => release(event));
				return completion;
			} catch (error) {
				release(event);
				throw error;
			}
		};
	}
	game.createEvent = function (...args) {
		const event = originalCreate.apply(this, args);
		observe(event);
		return event;
	};
	const controller = {
		clear() { for (const event of effects.keys()) release(event); },
		get activeCount() { return effects.size; },
	};
	(lib.onover ||= []).push(controller.clear);
	game.hhTargetHighlight = controller;
	return controller;
}
