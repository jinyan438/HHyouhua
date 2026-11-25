// OL iTs (unknown backs), Tns.SetGeneralState (owner mask), N5i (owner view).
export function setupGuozhanHidden({ lib, game, ui, get, _status }) {
	if (game.hhGuozhanHidden) return game.hhGuozhanHidden;
	const observed = new WeakMap();
	const ready = get.mode() === 'guozhan' && typeof Image === 'function' ? Promise.all([
		'general_unkown_l.png', 'general_unkown_r.png', 'general_luck_mask_l.png', 'general_luck_mask.png',
	].map(file => new Promise(resolve => {
		const image = new Image();
		image.onload = () => resolve(true);
		image.onerror = () => resolve(false);
		image.src = `${lib.assetURL || ''}extension/HH优化/assets/guozhan-hidden/${file}`;
	}))) : Promise.resolve();
	let view;
	function canView(player) {
		return get.mode() === 'guozhan' && player === game.me && !_status.video && !_status.observe
			&& !ui.arena?.classList.contains('observe') && !ui.arena?.classList.contains('video');
	}
	function toggle(node, name, value) {
		if (node.classList.contains(name) !== value) node.classList.toggle(name, value);
	}
	function layout(player) {
		const state = observed.get(player);
		if (!state || !player.classList.contains('hh-guozhan-hidden')) return;
		const computed = player.ownerDocument.defaultView?.getComputedStyle(player.node.avatar);
		const inset = Math.max(0, Number.parseFloat(computed?.left) || player.node.avatar.offsetLeft || 0);
		player.style.setProperty('--hh-guozhan-portrait-inset', inset + 'px');
		state.faces.forEach(([avatar, face]) => {
			const width = avatar.offsetWidth;
			const latent = face.firstChild;
			latent.style.left = width / 2 + 'px';
			latent.style.width = Math.min(width * 75 / 69.5, avatar.offsetHeight * 75 / 227) + 'px';
		});
	}
	function update(player) {
		const state = observed.get(player);
		if (!state) return;
		const enabled = get.mode() === 'guozhan' && !!ui.arena && player.parentNode === ui.arena && !player.noclick;
		toggle(player, 'hh-guozhan-hidden', enabled);
		toggle(player, 'hh-guozhan-local', enabled && canView(player));
		// Theme rules give name2 an important display value, including after a reveal.
		state.label.style.setProperty('display', enabled && !canView(player) && player.classList.contains('unseen2') ? 'block' : 'none', 'important');
		// Reinitialization can clear avatar children. The engine still owns their images.
		for (const [avatar, face] of state.faces) if (face.parentNode !== avatar) avatar.appendChild(face);
		if (state.label.parentNode !== player) player.appendChild(state.label);
		if (enabled) layout(player);
	}
	function observe(player) {
		if (observed.has(player)) return update(player);
		if (!player.node?.avatar || !player.node?.avatar2) return;
		const document = player.ownerDocument;
		const faces = [player.node.avatar, player.node.avatar2].map((avatar, index) => {
			const face = document.createElement('div');
			face.className = `hh-guozhan-hidden-face hh-guozhan-hidden-${index ? 'vice' : 'main'}`;
			face.setAttribute('aria-hidden', 'true');
			const latent = document.createElement('span');
			latent.className = 'hh-guozhan-latent';
			face.appendChild(latent);
			avatar.appendChild(face);
			return [avatar, face];
		});
		const label = document.createElement('div');
		label.className = 'name name2 hh-guozhan-vice-label';
		label.textContent = '副将';
		label.setAttribute('aria-hidden', 'true');
		player.appendChild(label);
		const observer = new MutationObserver(() => update(player));
		observer.observe(player, { attributes: true, attributeFilter: ['class', 'data-position'] });
		const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => layout(player)) : null;
		resizeObserver?.observe(player);
		observed.set(player, { faces, label, observer, resizeObserver });
		update(player);
	}
	function refresh() {
		for (const player of [...game.players, ...game.dead]) { observe(player); update(player); }
	}
	// Covers swap-control, replay and observer switches without reading hidden characters.
	function refreshView() {
		const next = [get.mode(), game.me, _status.video, _status.observe, ui.arena,
			ui.arena?.classList.contains('observe'), ui.arena?.classList.contains('video'),
			lib.config?.extension_HH优化_newDecadeStyle];
		if (view && next.every((value, index) => value === view[index])) return;
		view = next;
		refresh();
	}
	lib.arenaReady.push(refresh);
	ui.updates.push(refreshView);
	return game.hhGuozhanHidden = { observe, update, refresh, canView, ready };
}
