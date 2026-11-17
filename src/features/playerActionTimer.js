const CHOICES = new Set([
	'chooseToUse', 'chooseToRespond', 'chooseBool', 'chooseControl', 'chooseCard',
	'chooseTarget', 'chooseButton', 'chooseCardTarget', 'chooseButtonTarget',
	'chooseToDiscard', 'chooseToGive', 'choosePlayerCard', 'discardPlayerCard', 'gainPlayerCard',
	'chooseToCompare', 'chooseToMove', 'chooseToMove_new', 'chooseNumbers', 'chooseSkill', 'chooseToGuanxing',
]);

export function setupPlayerActionTimer({ lib, game, ui, get, _status }, environment = {}) {
	if (game.hhPlayerActionTimer) return game.hhPlayerActionTimer;
	const env = { now: () => performance.now(), setInterval: (fn, ms) => setInterval(fn, ms), clearInterval: id => clearInterval(id), ...environment };
	const hooks = [], announced = new WeakSet();
	let current = null, consecutive = 0, resolving = 0, stopped = false;
	let lastAuto = !!_status.auto, lastPlayer = game.me, timedOutAuto = false;
	const enabled = () => String(lib.config.extension_HH优化_jindutiaoYangshi) !== '0' && !_status.connectMode && !game.online && !_status.video;
	const manual = event => enabled() && _status.gameStarted && !_status.over && !_status.auto && !game.notMe
		&& !!event && !!game.me && event.player === game.me && !event.finished && event.isMine?.() === true
		&& (CHOICES.has(event.name) || announced.has(event))
		&& event.getParent?.('chooseCharacter', true)?.name !== 'chooseCharacter';
	function duration(event) {
		const limits = event.player.forceCountChoose;
		const override = event.name === 'chooseToUse' && event.type === 'phase' ? limits?.phaseUse ?? limits?.[event.name] : limits?.[event.name];
		const seconds = Number(override ?? limits?.default ?? lib.config.extension_HH优化_playerActionTime ?? 15);
		return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : 15000;
	}
	function clear() {
		current?.view?.remove();
		current = null;
	}
	function refresh() {
		if (!current) return;
		current.view?.remove();
		current.view = game.Jindutiaoplayer?.({ manual: true });
		current.view?.update(current.fraction);
	}
	function passive(event) {
		// Native confirmation callbacks close skill/choice UI and resume the original event.
		if (event.skill && !event.norestore && ['chooseToUse', 'chooseToRespond'].includes(event.name)) {
			ui.click.cancel();
			if (_status.event !== event || !_status.paused) return;
		}
		if (event.name === 'chooseControl' && event.controls?.length) {
			const controls = event.controls;
			const cancel = controls.find(control => ['cancel2', 'cancel', '取消', '不发动', '不响应', '跳过', '结束'].includes(control));
			const fallback = controls.includes(event.choice) ? event.choice : controls[event.choice] ?? controls[0];
			event.result = { control: cancel ?? fallback };
			game.resume();
		} else if (typeof event.switchToAuto === 'function') {
			// Custom promise-based choices must use their own resolver, not just game.resume().
			event.switchToAuto();
			if (_status.event === event && _status.paused) game.resume();
		} else if (!event.forced) {
			ui.click.cancel();
		} else {
			// The next native choice step handles legal mandatory cards/targets and all later effects.
			game.uncheck();
			event.result = 'ai';
			game.resume();
		}
	}
	function expire(token) {
		if (current !== token || _status.event !== token.event || !_status.paused || _status.paused2 || !manual(token.event)) return;
		clear();
		consecutive++;
		resolving++;
		try {
			if (consecutive >= 3) {
				ui.click.auto?.('forced');
				if (_status.auto) {
					timedOutAuto = true;
					lastAuto = true;
					return;
				}
			}
			passive(token.event);
		} finally {
			resolving--;
		}
	}
	function check(allowTimeout = true) {
		if (stopped) return;
		if (lastPlayer !== game.me || lastAuto !== !!_status.auto) {
			clear(); consecutive = 0;
			if (!_status.auto || lastPlayer !== game.me) timedOutAuto = false;
			lastPlayer = game.me; lastAuto = !!_status.auto;
		}
		const event = _status.event;
		if (!_status.paused || !manual(event)) { clear(); return; }
		const now = env.now();
		if (current?.event !== event) {
			clear();
			current = { event, duration: duration(event), elapsed: 0, lastTime: now, paused: !!_status.paused2, fraction: 1, view: null };
			refresh();
		}
		const token = current;
		if (!token.paused) token.elapsed += Math.max(0, now - token.lastTime);
		token.lastTime = now; token.paused = !!_status.paused2;
		token.fraction = token.duration ? Math.max(0, 1 - token.elapsed / token.duration) : 0;
		token.view?.update(token.fraction);
		if (allowTimeout && token.fraction === 0) expire(token);
	}
	function wrap(object, key, create) {
		const original = object[key];
		if (typeof original !== 'function') return;
		const wrapped = create(original); object[key] = wrapped;
		hooks.push(() => { if (object[key] === wrapped) object[key] = original; });
	}
	wrap(game, 'countChoose', original => function () {
		const event = _status.event;
		if (event && typeof event.switchToAuto === 'function') announced.add(event);
		if (!stopped && manual(event)) {
			_status.imchoosing = true;
			check(false);
			return;
		}
		return original.apply(this, arguments);
	});
	wrap(game, 'pause', original => function () {
		const result = original.apply(this, arguments); check(false); return result;
	});
	wrap(game, 'resume', original => function () {
		const token = current;
		const result = original.apply(this, arguments);
		if (token && !_status.paused && current === token) {
			if (!resolving && !_status.auto) consecutive = 0;
			clear();
		}
		return result;
	});
	for (const key of ['pause2', 'resume2']) wrap(game, key, original => function () {
		check(false); const result = original.apply(this, arguments); check(false); return result;
	});
	const timer = env.setInterval(() => check(), 32);
	function stop() {
		if (stopped) return;
		stopped = true; env.clearInterval(timer); clear(); consecutive = 0; timedOutAuto = false;
		for (const restore of hooks.reverse()) restore();
	}
	lib.onover.push(stop);
	game.hhPlayerActionTimer = { check, refresh, stop, get current() { return current; }, get consecutive() { return consecutive; }, get timedOutAuto() { return timedOutAuto; } };
	return game.hhPlayerActionTimer;
}
