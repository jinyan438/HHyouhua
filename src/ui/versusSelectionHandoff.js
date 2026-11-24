// Keep the last selection frame until the native chooseCharacter has initialized
// every seat. Disposing chooseButton must not expose the unfinished arena.
export function preserveVersusSelection({ game, ui }, { viewport, parent }) {
	const arena = ui.arena;
	if (!parent.pushHandler || !arena?.isConnected || !viewport.isConnected) return;
	const cover = viewport.cloneNode(true);
	cover.inert = true;
	cover.setAttribute('aria-hidden', 'true');
	cover.style.pointerEvents = 'none';
	cover.querySelector('.hh-selection-footer')?.remove();
	for (const node of cover.querySelectorAll('[id]')) node.removeAttribute('id');
	ui.window.appendChild(cover);
	let disposed = false, frame = null, revealing = false;
	const observer = new MutationObserver(() => {
		if (!cover.isConnected || !arena.isConnected || ui.arena !== arena) release();
		else if (!arena.classList.contains('choose-character') && game.players.every(player => player.name1)) reveal();
	});
	observer.observe(ui.window, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
	// A cancelled setup or an exception must never leave a frozen selection screen.
	const timeout = setTimeout(release, 3000);
	function release() {
		if (disposed) return;
		disposed = true;
		clearTimeout(timeout);
		if (frame !== null) cancelAnimationFrame(frame);
		observer.disconnect(); cover.remove();
		const handlers = parent.getHandler?.();
		// The engine dispatches handlers with forEach, so remove after dispatch.
		Promise.resolve().then(() => {
			const index = handlers?.indexOf(onCharacterEnd) ?? -1;
			if (index >= 0) handlers.splice(index, 1);
		});
	}
	function reveal() {
		if (disposed || revealing) return;
		revealing = true;
		// The native 500ms timer is only a presentation delay. Setup is complete.
		arena.classList.remove('choose-character');
		// Give the initialized arena a paint before uncovering it.
		frame = requestAnimationFrame(() => { frame = requestAnimationFrame(release); });
	}
	function onCharacterEnd(current, option) {
		if (option?.state !== 'end') return;
		if (game.players.every(player => player.name1)) reveal();
		else release();
	}
	parent.pushHandler(onCharacterEnd);
}
