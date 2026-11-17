const CHOICES = new Set([
	'chooseToUse', 'chooseToRespond', 'chooseBool', 'chooseControl', 'chooseCard',
	'chooseTarget', 'chooseButton', 'chooseCardTarget', 'chooseButtonTarget',
	'chooseToDiscard', 'chooseToGive', 'choosePlayerCard', 'discardPlayerCard', 'gainPlayerCard',
	'chooseToCompare', 'chooseToMove', 'chooseToMove_new', 'chooseNumbers', 'chooseSkill', 'chooseToGuanxing',
]);

export function setupPlayerActionTimer({ lib, game, ui, get, _status }, environment = {}) {
	if (game.hhPlayerActionTimer) return game.hhPlayerActionTimer;
	const env = { now: () => performance.now(), setInterval: (fn, ms) => setInterval(fn, ms), clearInterval: id => clearInterval(id), ...environment };
	const hooks = [], announced = new WeakSet(), operations = new WeakMap(), controlOwners = new WeakMap(), retired = new Set(), confirmations = new Set();
	let current = null, consecutive = 0, resolving = 0, stopped = false;
	let resumeSerial = 0, pauseSerial = 0;
	let confirmFactory, controlFactory;
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
	function operation(event) { return { event, controls: new Set(), started: false, timedOut: false }; }
	function own(control, owner) {
		if (!control) return;
		const previous = controlOwners.get(control);
		if (previous === owner) return;
		previous?.controls.delete(control);
		controlOwners.delete(control);
		if (owner) {
			owner.controls.add(control); controlOwners.set(control, owner);
			if (owner.timedOut) retired.add(owner);
		}
	}
	function observeControl(control) {
		if (stopped || !control) return;
		if (!enabled()) { own(control, null); confirmations.delete(control); return; }
		confirmations.add(control);
		const event = _status.event;
		if (event && typeof event.switchToAuto === 'function') announced.add(event);
		let owner = operations.get(event);
		if (!owner && event) { owner = operation(event); operations.set(event, owner); }
		// Reused containers transfer to the new event instead of being swept with the old one.
		own(control, owner);
		if (owner?.timedOut && resumeSerial > owner.resumeSerial) (owner.followups ??= new Set()).add(control);
	}
	function cleanupControls() {
		for (const owner of [...retired]) {
			for (const control of [...owner.controls]) {
				owner.controls.delete(control);
				if (controlOwners.get(control) !== owner) continue;
				controlOwners.delete(control);
				if (control.isConnected !== false || ui.confirm === control) {
					if (typeof control.close === 'function') control.close();
					else control.remove?.();
				}
				if (ui.confirm === control && !controlOwners.has(control)) ui.confirm = null;
				if (!controlOwners.has(control)) {
					// A skin close animation may leave a clickable node behind.
					control.remove?.(); ui.controls?.remove?.(control); confirmations.delete(control);
				}
			}
			if (!owner.controls.size) retired.delete(owner);
		}
	}
	function cleanupInactiveControls(event) {
		if (!enabled() || !_status.gameStarted) return;
		const waiting = _status.paused && !_status.auto && !game.notMe && !_status.over && !event?.finished
			&& (event?.isMine?.() === true || _status.imchoosing && (!event?.player || event.name === 'gameDraw'));
		for (const control of confirmations) {
			const owner = controlOwners.get(control);
			if (waiting && (!owner || owner.event === event) && !owner?.timedOut) continue;
			const stale = owner || operation(event);
			own(control, stale); retired.add(stale);
		}
		cleanupControls();
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
			const serial = resumeSerial;
			event.switchToAuto();
			if (resumeSerial === serial && _status.event === event && _status.paused) game.resume();
		} else if (!event.forced) {
			// Skin cancel handlers treat a selection as "reselect"; expiry must abandon it.
			game.uncheck();
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
		token.timedOut = true; token.resumeSerial = resumeSerial; token.pauseSerial = pauseSerial; retired.add(token);
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
			// Adopt controls opened for the next choice before releasing the old operation.
			if (!resolving) check(false);
		}
	}
	function check(allowTimeout = true) {
		if (stopped) return;
		watchControls();
		if (resolving) return;
		if (lastPlayer !== game.me || lastAuto !== !!_status.auto) {
			clear(); consecutive = 0;
			if (!_status.auto || lastPlayer !== game.me) timedOutAuto = false;
			lastPlayer = game.me; lastAuto = !!_status.auto;
		}
		const event = _status.event;
		if (enabled() && ui.confirm) {
			confirmations.add(ui.confirm);
			if (!controlOwners.has(ui.confirm)) own(ui.confirm, operations.get(event));
		}
		if (!_status.paused || !manual(event)) {
			clear(); cleanupControls(); if (allowTimeout) cleanupInactiveControls(event); return;
		}
		const now = env.now();
		if (current?.event !== event) {
			clear();
			const pending = operations.get(event);
			// Native PauseManager clears `paused` asynchronously after resume(). Only
			// a real subsequent pause may reopen this completed event's decision UI.
			if (pending?.timedOut && pending.pauseSerial === pauseSerial) { cleanupControls(); return; }
			current = pending && !pending.started ? pending : operation(event);
			Object.assign(current, { started: true, duration: duration(event), elapsed: 0, lastTime: now, paused: !!_status.paused2, fraction: 1, view: null });
			operations.set(event, current);
			// A resumed multi-step skill may open controls before pausing its next step.
			for (const control of pending?.followups || []) if (controlOwners.get(control) === pending) own(control, current);
			const owner = ui.confirm && controlOwners.get(ui.confirm);
			if (!owner || owner.event === event) own(ui.confirm, current);
			refresh();
		}
		const token = current;
		if (!token.paused) token.elapsed += Math.max(0, now - token.lastTime);
		token.lastTime = now; token.paused = !!_status.paused2;
		token.fraction = token.duration ? Math.max(0, 1 - token.elapsed / token.duration) : 0;
		token.view?.update(token.fraction);
		cleanupControls();
		if (allowTimeout) cleanupInactiveControls(event);
		if (allowTimeout && token.fraction === 0) expire(token);
	}
	function wrap(object, key, create) {
		const original = object?.[key];
		if (typeof original !== 'function') return;
		const wrapped = create(original); object[key] = wrapped;
		hooks.push(() => { if (object[key] === wrapped) object[key] = original; });
		return wrapped;
	}
	function watchControls() {
		// UI skins load after the timer and may replace these factories again.
		if (ui.create?.confirm !== confirmFactory) confirmFactory = wrap(ui.create, 'confirm', original => function () {
			const result = original.apply(this, arguments);
			observeControl(ui.confirm);
			return result;
		});
		if (ui.create?.control !== controlFactory) controlFactory = wrap(ui.create, 'control', original => function () {
			const result = original.apply(this, arguments);
			const links = Array.from(result?.childNodes || []).map(node => node.link).filter(link => link !== undefined);
			if (links.length && links.every(link => ['ok', 'cancel', '确定', '取消'].includes(link))) observeControl(result);
			return result;
		});
	}
	watchControls();
	wrap(game, 'countChoose', original => function () {
		if (!stopped) watchControls();
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
		pauseSerial++;
		const result = original.apply(this, arguments); check(false); return result;
	});
	wrap(game, 'resume', original => function () {
		const token = current, wasPaused = !!_status.paused;
		resumeSerial++;
		const result = original.apply(this, arguments);
		if (token && wasPaused && !resolving && !_status.auto) consecutive = 0;
		if (token && !_status.paused && current === token) {
			clear();
		}
		if (!resolving) cleanupControls();
		return result;
	});
	for (const key of ['pause2', 'resume2']) wrap(game, key, original => function () {
		check(false); const result = original.apply(this, arguments); check(false); return result;
	});
	const timer = env.setInterval(() => check(), 32);
	function stop() {
		if (stopped) return;
		stopped = true; env.clearInterval(timer); clear(); cleanupControls(); confirmations.clear(); consecutive = 0; timedOutAuto = false;
		for (const restore of hooks.reverse()) restore();
	}
	lib.onover.push(stop);
	game.hhPlayerActionTimer = { check, refresh, stop, get current() { return current; }, get consecutive() { return consecutive; }, get timedOutAuto() { return timedOutAuto; } };
	return game.hhPlayerActionTimer;
}
