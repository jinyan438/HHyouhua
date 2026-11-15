const option = 'extension_HH优化_enable_lord_blind_shot';
const hook = '_hh_lord_blind_shot';

export function setupLordBlindShot({ lib, game, get, _status }) {
	if (game.hhLordBlindShot) return game.hhLordBlindShot;
	let state, seen = new WeakSet(), scored = new WeakSet(), evaluating = false;
	const inGame = player => !!player && !player.removed && (player.isIn ? player.isIn() : !player.dead);
	const supported = () => (get.mode?.() || lib.config.mode) === 'identity' && !['purple', 'stratagem'].includes(_status.mode) && !_status.connectMode && !game.online && !_status.over;
	const aiLord = () => {
		const lord = game.zhu;
		return supported() && inGame(lord) && lord.isZhu && lord.identityShown && !lord.isMad?.() && !(lord === game.me && !_status.auto) && !(lord.isUnderControl?.() && !_status.auto) && !lord.isOnline?.() ? lord : null;
	};
	function reset() { state = undefined; seen = new WeakSet(); scored = new WeakSet(); }
	function ensureState(lord) {
		if (state?.lord !== lord) state = { lord, target: null, paused: false, reason: null, evidence: new Map() };
		return state;
	}
	function tendency(player) {
		// Only read actual identity once it has been made public.
		if (player.identityShown) {
			if (player.identity === 'fan') return -1;
			if (['zhu', 'zhong', 'mingzhong'].includes(player.identity)) return 1;
		}
		const value = state?.evidence.get(player) || 0;
		return value >= 1 ? 1 : value <= -1 ? -1 : 0;
	}
	function sync() {
		const lord = aiLord();
		if (!lord) return null;
		const current = ensureState(lord);
		if (evaluating) return current;
		evaluating = true;
		try {
			current.paused = false; current.reason = null;
			for (const player of game.players) {
				if (player !== lord && inGame(player) && tendency(player) < 0) {
					current.paused = true; current.reason = 'living-rebel-exposed'; current.target = null; return current;
				}
			}
			const candidate = player => player !== lord && inGame(player) && !player.identityShown && tendency(player) === 0;
			// Keep the selected opponent until new public evidence or removal.
			if (candidate(current.target)) return current;
			current.target = null;
			if (lib.config[option] === false) return current;
			let best = -Infinity;
			for (const player of game.players) {
				if (!candidate(player)) continue;
				let threat;
				try { threat = Number(get.threaten(player, lord)); } catch { threat = 1; }
				let distance = Number(get.distance(lord, player, 'attack'));
				if (!Number.isFinite(threat)) threat = 1;
				if (!Number.isFinite(distance)) continue;
				threat = Math.max(0, threat); distance = Math.max(1, distance);
				const weight = .9 * threat + .1 / distance;
				if (weight > best) { best = weight; current.target = player; }
			}
			return current;
		} finally { evaluating = false; }
	}
	function attitude(from, to) {
		if (!from || !to || evaluating || lib.config[option] === false || from !== game.zhu || from === to) return;
		const current = sync();
		if (!current) return;
		if (current.paused && inGame(to) && tendency(to) < 0) return -5;
		if (current.target === to) return -5;
		if (tendency(to) > 0) return 4;
	}
	function record(actor, evidence) {
		if (!Number.isFinite(evidence) || !evidence || !actor || actor === state.lord) return false;
		state.evidence.set(actor, Math.max(-4, Math.min(4, (state.evidence.get(actor) || 0) + evidence)));
		return true;
	}
	function observe(event) {
		if (!event || !supported()) return;
		const current = sync();
		if (!current || seen.has(event)) return;
		seen.add(event);
		if (event.getParent?.('jiedao')?.name === 'jiedao') return;
		if (event.name === 'damage' || event.name === 'recover') {
			const actor = event.source;
			if (!actor || actor.isMad?.() || event.hideSource || actor === event.player || event.player !== current.lord || !(event.num > 0)) return;
			// Card/skill intent was already counted; chain splash is not a new choice.
			for (const name of ['useCard', 'useSkill']) {
				const parent = event.getParent?.(name);
				if (parent?.name === name && parent.player === actor && scored.has(parent)) return;
			}
			if (event.name === 'damage' && event.notLink && !event.notLink()) return;
			if (record(actor, event.name === 'damage' ? -2 : 1)) scored.add(event);
		} else if (['useCard', 'useSkill'].includes(event.name)) {
			const actor = event.player, item = event.card || event.skill;
			if (!inGame(actor) || actor === current.lord || actor.isMad?.() || !item || event.hideTargets || event.getParent?.('jiedao')?.name === 'jiedao') return;
			const targets = [...new Set(event.targets || [])].filter(inGame);
			if (!targets.length || targets.every(target => target === actor)) return;
			let evidence = 0;
			evaluating = true;
			try {
				const result = get.result(item), damaging = get.tag?.(item, 'damage') || get.info(item)?.ai?.damage;
				for (const target of targets) {
					if (target === actor) continue;
					const side = target === current.lord ? 1 : tendency(target);
					if (!side) continue;
					let benefit = damaging ? -1 : result.target;
					if (typeof benefit === 'function') benefit = benefit(actor, target, item);
					if (typeof benefit !== 'number' || !Number.isFinite(benefit)) {
						benefit = get.tag?.(item, 'damage') || get.info(item)?.ai?.damage ? -1 : 0;
					}
					if (benefit) evidence += (benefit * side < 0 ? -2 : 1) / targets.length;
				}
			} catch (error) { console.warn('[HH优化] 盲狙行为判断失败', error); }
			finally { evaluating = false; }
			if (record(actor, evidence)) scored.add(event);
		} else return;
		sync();
	}
	function attach() {
		_status.ai ||= {};
		_status.ai.customAttitude ||= [];
		if (!_status.ai.customAttitude.includes(attitude)) _status.ai.customAttitude.push(attitude);
	}
	const controller = { reset, sync, observe, attitude, get state() { return state; } };
	game.hhLordBlindShot = controller;
	attach();
	lib.skill[hook] = {
		trigger: { global: ['gameStart', 'phaseBefore', 'useCard1', 'useSkill', 'damageEnd', 'recoverEnd', 'dieAfter'] },
		silent: true, charlotte: true, forced: true, forceDie: true,
		filter(event, player) { return player === game.zhu && supported(); },
		// Async content retains the controller closure under the engine compiler.
		async content(event, trigger) {
			attach();
			if (event.triggername === 'gameStart') reset();
			if (['useCard', 'useSkill', 'damage', 'recover'].includes(trigger.name)) observe(trigger);
			else sync();
		},
	};
	game.finishSkill?.(hook);
	if (!game.finishSkill) game.addGlobalSkill?.(hook);
	lib.onover?.push(reset);
	return controller;
}
