// Keep native game gestures from consuming form input or scrolling.
export function isolateDialogInput(dialog) {
	for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'wheel', 'keydown']) {
		dialog.addEventListener(type, event => event.stopPropagation(), { passive: true });
	}
}

// Some Android WebViews do not synthesize click after the game's touch handling.
// Handle a tap directly, reject scrolling, and ignore its subsequent mouse click.
export function bindDialogButton(button, activate) {
	button.type = 'button';
	let press = null, ignoreClicksUntil = 0;
	button.addEventListener('touchstart', event => {
		const point = event.touches[0];
		press = !button.disabled && event.touches.length === 1
			? { id: point.identifier, x: point.clientX, y: point.clientY, moved: false } : null;
	}, { passive: true });
	button.addEventListener('touchmove', event => {
		const point = Array.from(event.touches).find(point => point.identifier === press?.id);
		if (press && (!point || event.touches.length !== 1 || Math.hypot(point.clientX - press.x, point.clientY - press.y) > 12)) press.moved = true;
	}, { passive: true });
	button.addEventListener('touchcancel', () => { press = null; ignoreClicksUntil = Date.now() + 800; }, { passive: true });
	button.addEventListener('touchend', event => {
		const point = Array.from(event.changedTouches).find(point => point.identifier === press?.id);
		const tapped = press && !press.moved && point && !event.touches.length
			&& Math.hypot(point.clientX - press.x, point.clientY - press.y) <= 12;
		press = null; ignoreClicksUntil = Date.now() + 800;
		event.preventDefault(); event.stopPropagation();
		if (tapped && !button.disabled) return activate(event);
	}, { passive: false });
	button.addEventListener('click', event => {
		event.stopPropagation();
		if (button.disabled || event.detail !== 0 && Date.now() < ignoreClicksUntil) { event.preventDefault(); return; }
		return activate(event);
	});
}
