// Drain the selection bar for two seconds, then uncover a painted arena whose
// backgrounds and portraits have loaded. Native setup can run behind the cover.
export function preserveVersusSelection({ game, ui, _status }, { viewport, parent }) {
	const arena = ui.arena;
	if (!parent.pushHandler || !arena?.isConnected || !viewport.isConnected) return;
	const cover = viewport.cloneNode(true);
	cover.classList.add('hh-versus-handoff');
	cover.inert = true;
	cover.setAttribute('aria-hidden', 'true');
	cover.style.pointerEvents = 'none';
	cover.querySelector('.hh-selection-footer')?.remove();
	const prompt = cover.querySelector('.hh-selection-prompt');
	if (prompt) prompt.textContent = '';
	for (const node of cover.querySelectorAll('[id]')) node.removeAttribute('id');
	const progress = cover.querySelector('.hh-selection-progress');
	progress.hidden = false;
	const fill = progress.firstChild;
	fill.style.width = '100%';
	ui.window.appendChild(cover);
	const started = performance.now(), images = new Set(), openingEvents = new Set();
	const openingHandlers = game.globalEventHandlers;
	let disposed = false, frame = null, preparing = false, ready = false, revealing = false, resume = null;
	const observer = new MutationObserver(() => {
		if (!cover.isConnected || !arena.isConnected || ui.arena !== arena || _status.over) release();
		else {
			const current = _status.event;
			if (!openingHandlers?.pushHandler && !arena.classList.contains('choose-character') &&
				game.players.every(player => player.name1)) prepare();
			// Some opening skills need human input before the first deal completes.
			// Uncover that prompt instead of leaving the game paused under the cover.
			if (game.players.every(player => player.name1) && _status.paused && !_status.auto && current?.player === game.me &&
				/^choose/.test(current.name) && current.getParent?.('chooseCharacter') !== parent) prepare();
		}
	});
	observer.observe(ui.window, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
	function release() {
		if (disposed) return;
		disposed = true;
		if (frame !== null) cancelAnimationFrame(frame);
		observer.disconnect(); cover.remove();
		for (const finish of images) finish();
		resume?.();
		const handlers = parent.getHandler?.();
		// The engine dispatches handlers with forEach, so remove after dispatch.
		Promise.resolve().then(() => {
			const index = handlers?.indexOf(onCharacterEnd) ?? -1;
			if (index >= 0) handlers.splice(index, 1);
			openingHandlers?.removeHandler?.('phaseLoop', 'onPhaseLoop', onOpeningReady);
			for (const current of openingEvents) {
				const list = current.getHandler?.();
				const index = list?.indexOf(onOpeningReady) ?? -1;
				if (index >= 0) list.splice(index, 1);
			}
		});
	}
	function reveal() {
		if (disposed || revealing || !ready || performance.now() - started < 2000) return;
		revealing = true;
		if (frame !== null) cancelAnimationFrame(frame);
		fill.style.width = '0%';
		// Give the initialized arena a paint before uncovering it.
		frame = requestAnimationFrame(() => { frame = requestAnimationFrame(release); });
	}
	function drain() {
		if (disposed) return;
		frame = null;
		const remaining = Math.max(0, 1 - (performance.now() - started) / 2000);
		fill.style.width = `${remaining * 100}%`;
		if (remaining > 0) frame = requestAnimationFrame(drain);
		else reveal();
	}
	function prepare() {
		if (disposed || preparing) return;
		preparing = true;
		// Let gameStart, the initial deal and gameDrawAfter finish behind the cover.
		// Stop before the first turn; pausing at chooseCharacter left all of that
		// Android rendering work until after the cover had already been removed.
		_status.pauseManager?.setDelay?.(new Promise(resolve => { resume = resolve; }));
		arena.classList.remove('choose-character');
		const cards = game.me.getCards?.('h') || [];
		const nodes = [ui.background, ...game.players.flatMap(player => [player.node?.avatar, player.node?.avatar2]),
			...cards.flatMap(card => [card, ...card.children])].filter(Boolean);
		const urls = new Set(nodes.flatMap(node => [...getComputedStyle(node).backgroundImage.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/g)].map(match => match[1] ?? match[2] ?? match[3])));
		Promise.all([...urls].map(url => new Promise(resolve => {
			const image = new Image();
			const finish = () => { image.onload = image.onerror = null; images.delete(finish); resolve(); };
			images.add(finish);
			image.onload = () => Promise.resolve(image.decode?.()).catch(() => {}).then(finish);
			image.onerror = finish;
			image.src = url;
		}))).then(() => { if (!disposed) { ready = true; reveal(); } });
	}
	function onCharacterEnd(current, option) {
		if (option?.state !== 'end') return;
		if (game.players.every(player => player.name1)) {
			if (!openingHandlers?.pushHandler) prepare();
		} else release();
	}
	function onOpeningReady(current, option) {
		if (disposed) return;
		openingEvents.add(current);
		if (option?.state === 'begin') prepare();
	}
	openingHandlers?.pushHandler?.('phaseLoop', onOpeningReady);
	parent.pushHandler(onCharacterEnd);
	frame = requestAnimationFrame(drain);
}
