// Own the entire card gesture so native drag/intro state cannot consume later taps.
export function bindSelectionCardInput(button, { activate, hold, swap, reroll, listen, later = setTimeout, cancel = clearTimeout }) {
	const controller = listen ? null : new AbortController();
	const on = listen || ((node, type, callback, capture = false) => node.addEventListener(type, callback, { capture, signal: controller.signal }));
	let press = null, timer = null, ignoreRelease = false, ignoreClick = false;
	const stop = () => { if (timer !== null) cancel(timer); timer = null; };
	const begin = e => {
		stop(); ignoreRelease = false; ignoreClick = false;
		const point = e.touches?.[0] || e;
		press = { x: point.clientX, y: point.clientY, swap: !!swap && e.target === swap, moved: false, held: false };
		if (hold) timer = later(() => { timer = null; if (press && !press.moved) press.held = hold() === true; }, 500);
	};
	const move = e => {
		const point = e.touches?.[0] || e;
		if (press && Math.hypot(point.clientX - press.x, point.clientY - press.y) > 12) { press.moved = true; stop(); }
	};
	on(button, 'pointerdown', e => {
		if (e.button !== 0 || e.isPrimary === false) return;
		begin(e);
		if (press.swap) { e.preventDefault(); e.stopPropagation(); }
	}, true);
	on(button, 'pointermove', move);
	on(button, 'pointerleave', () => { stop(); if (press) press.moved = true; });
	on(button, 'pointercancel', () => { stop(); press = null; ignoreRelease = true; ignoreClick = true; });
	on(button, 'pointerup', e => {
		stop();
		if (press && (press.held || press.moved || press.swap)) {
			ignoreRelease = true; ignoreClick = true;
			if (!press.moved) { e.preventDefault(); e.stopPropagation(); }
			if (press.swap && !press.held && !press.moved) reroll?.();
		}
		press = null;
	}, true);
	on(button, 'mousedown', e => e.stopImmediatePropagation(), true);
	on(button, 'touchstart', e => {
		e.stopImmediatePropagation();
		if (!press) begin(e);
	}, true);
	on(button, 'touchmove', e => { move(e); e.stopPropagation(); }, true);
	on(button, 'touchcancel', () => { stop(); press = null; ignoreRelease = true; ignoreClick = true; }, true);
	on(button, 'touchend', e => {
		e.preventDefault(); e.stopImmediatePropagation(); stop();
		const blocked = ignoreRelease || press?.held || press?.moved || press?.swap;
		if (!ignoreRelease && press?.swap && !press.held && !press.moved) reroll?.();
		press = null; ignoreRelease = false; ignoreClick = true;
		if (!blocked) activate();
	}, true);
	on(button, 'click', e => {
		e.preventDefault(); e.stopImmediatePropagation();
		if (ignoreClick) { ignoreClick = false; ignoreRelease = false; return; }
		if (swap && e.target === swap) reroll?.(); else activate();
	}, true);
	on(button, 'keydown', e => {
		if (e.target === swap && e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); hold?.(); return; }
		if (e.target !== button || !['Enter', ' '].includes(e.key) || e.repeat) return;
		e.preventDefault(); e.stopPropagation(); activate();
	});
	on(button, 'contextmenu', e => { e.preventDefault(); e.stopImmediatePropagation(); }, true);
	return { destroy() { stop(); press = null; controller?.abort(); } };
}
