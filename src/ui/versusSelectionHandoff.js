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
	const started = performance.now(), images = new Set();
	let disposed = false, frame = null, preparing = false, ready = false, revealing = false, resume = null;
	const observer = new MutationObserver(() => {
		if (!cover.isConnected || !arena.isConnected || ui.arena !== arena || _status.over) release();
		else if (!arena.classList.contains('choose-character') && game.players.every(player => player.name1)) prepare();
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
		// Pause only after character setup, so initialization can finish while the
		// bar drains. An independent delay cannot resume another extension's pause.
		_status.pauseManager?.setDelay?.(new Promise(resolve => { resume = resolve; }));
		arena.classList.remove('choose-character');
		const nodes = [ui.background, ...game.players.flatMap(player => [player.node?.avatar, player.node?.avatar2])].filter(Boolean);
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
		if (game.players.every(player => player.name1)) prepare();
		else release();
	}
	parent.pushHandler(onCharacterEnd);
	frame = requestAnimationFrame(drain);
}
