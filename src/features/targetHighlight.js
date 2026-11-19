/** Keep confirmed targets visible until the entire card or skill event settles. */
export function setupTargetHighlight({ lib, game, _status }) {
	if (game.hhTargetHighlight) return game.hhTargetHighlight;
	const effects = new Map(), owners = new Map();
	const choices = new Set(["chooseTarget", "chooseButtonTarget"]);
	const isEffect = event => event.name === "useCard" || event.name === "useSkill" || !!lib.skill?.[event.name]?.content;
	const originalCreate = game.createEvent;

	function addTargets(state, targets) {
		if (state.event.hideTargets || _status?.over) return;
		for (const target of targets || []) {
			if (!target?.classList?.contains("player") || state.targets.has(target)) continue;
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
		if (state) addTargets(state, event.targets);
	}
	function confirmChoice(event) {
		if (!event.result?.bool) return;
		const visited = new Set();
		for (let parent = event.parent; parent && !visited.has(parent); parent = parent.parent) {
			visited.add(parent);
			// The outer combined choice must finish before its targets take effect.
			if (choices.has(parent.name)) return;
			const state = effects.get(parent);
			if (state) { addTargets(state, event.result.targets); return; }
		}
	}
	function observe(event) {
		if (!event || typeof event.start !== "function" || (!isEffect(event) && !choices.has(event.name))) return;
		const originalStart = event.start;
		let completion;
		event.start = function (...args) {
			if (completion) return completion;
			if (isEffect(event)) {
				effects.set(event, { event, targets: new Set() });
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
