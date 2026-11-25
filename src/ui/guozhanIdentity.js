// OL y5i / drs: per-seat faction exclusions, native tiles and single-faction badges.
export const GUOZHAN_FACTIONS = ['wu', 'qun', 'shu', 'wei', 'jin'];
const names = { wu: '吴', qun: '群', shu: '蜀', wei: '魏', jin: '晋', ye: '野', key: '键' };
// Interior pixels from countrywarforcemin_*1.png, including the native gray tile.
const colors = { wu: '#4a9631', qun: '#e4b7ac', shu: '#ba261b', wei: '#3c16b2', jin: '#aa10ff' };

export function setupGuozhanIdentity({ lib, game, ui, get, _status }) {
	if (game.hhGuozhanIdentity) return game.hhGuozhanIdentity;
	const document = ui.window?.ownerDocument || globalThis.document;
	const base = `${lib.assetURL || ''}extension/HH优化/assets/guozhan-force/`;
	const observed = new WeakMap();
	let active;
	function groups() {
		const banned = _status.bannedGroup?.replace(/^group_/, '');
		if (!GUOZHAN_FACTIONS.includes(banned)) return [...GUOZHAN_FACTIONS];
		return ['wu', 'qun', 'shu', 'wei'].map(group => group === banned ? 'jin' : group);
	}
	function shown(player) {
		return !!(player.identityShown || player.forceShown);
	}
	function close() {
		if (!active) return;
		active.layer.remove();
		active.removalObserver.disconnect();
		document.removeEventListener('keydown', onKey);
		active = undefined;
	}
	function onKey(event) {
		if (event.key === 'Escape') { event.stopPropagation(); close(); }
	}
	function remaining(player, available) {
		return Array.isArray(player._guozhanguess) ? available.filter(group => player._guozhanguess.includes(group)) : available;
	}
	function image(node, file) { node.style.backgroundImage = `url("${base}${file}.png")`; }
	function quarter(parent, group, index, rim = false) {
		const node = document.createElement('span');
		node.className = `hh-force-quarter hh-force-quarter-${index}${rim ? ' hh-force-rim' : ''}`;
		image(node, `countrywarforcemin_${group === 'no' ? 'no' : group + '1'}`);
		parent.appendChild(node);
	}
	function update(player) {
		const state = observed.get(player);
		if (!state) return;
		const node = player.node.identity;
		if (get.mode() !== 'guozhan') {
			if (node.classList.contains('hh-guozhan-identity')) node.classList.remove('hh-guozhan-identity');
			state.badge.hidden = true;
			state.signature = undefined;
			if (active?.player === player) close();
			return;
		}
		if (!node.classList.contains('hh-guozhan-identity')) node.classList.add('hh-guozhan-identity');
		const known = shown(player), available = groups(), kept = remaining(player, available);
		// Only public identity data is read here. Hidden general names/groups are never consulted.
		const group = known ? player.identity : kept.length === 1 ? kept[0] : '';
		const signature = JSON.stringify([known, group, available, kept]);
		if (active?.player === player && (known || !player.isConnected || player.isDead?.() || active.signature !== signature)) close();
		if (state.signature === signature) return;
		state.signature = signature;
		const badge = state.badge;
		badge.hidden = false;
		badge.textContent = '';
		badge.style.backgroundImage = '';
		badge.classList.toggle('hh-force-single', !!group);
		node.setAttribute('role', known ? 'img' : 'button');
		node.tabIndex = known ? -1 : 0;
		node.setAttribute('aria-label', group ? `${known ? '' : '标记'}${names[group] || group}势力` : '排除势力');
		if (group && GUOZHAN_FACTIONS.includes(group)) {
			image(badge, `countrywarforceshow_${group}`);
		} else if (group) {
			badge.textContent = names[group] || get.translation(group);
		} else if (available.length === 4) {
			available.forEach((item, index) => quarter(badge, kept.includes(item) ? item : 'no', index));
		} else {
			const clockwise = ['wu', 'qun', 'wei', 'jin', 'shu'].filter(item => available.includes(item));
			const step = 360 / clockwise.length;
			badge.style.backgroundImage = `conic-gradient(from 270deg, ${clockwise.map((item, index) => `${kept.includes(item) ? colors[item] : '#a4a4a4'} ${index * step}deg ${(index + 1) * step}deg`).join(', ')})`;
			for (let index = 0; index < 4; index++) quarter(badge, 'no', index, true);
		}
	}
	function open(player) {
		if (get.mode() !== 'guozhan' || shown(player) || player === game.me || player.noclick || _status.video || _status.over
			|| _status.dragged || player.isDead?.() || !player.isConnected || !game.getIdentityList?.(player)) return;
		if (active?.player === player) { close(); return; }
		close();
		const available = groups(), kept = remaining(player, available);
		const layer = document.createElement('div');
		layer.className = 'hh-guozhan-force-layer';
		const menu = document.createElement('div');
		menu.className = 'hh-guozhan-force-menu';
		menu.setAttribute('role', 'group');
		menu.setAttribute('aria-label', '排除势力');
		if (available.length === 5) menu.classList.add('hh-force-five');
		else image(menu, 'countrywarforcebg');
		for (const group of available) {
			const button = document.createElement('button');
			button.type = 'button';
			button.className = 'hh-guozhan-force-option';
			button.dataset.group = group;
			button.classList.toggle('hh-force-excluded', !kept.includes(group));
			button.setAttribute('aria-label', names[group]);
			button.setAttribute('aria-pressed', String(!kept.includes(group)));
			image(button, `countrywarforce_${group}1`);
			button.addEventListener('click', event => {
				event.preventDefault(); event.stopPropagation();
				_status.clicked = true;
				// Recheck after a reveal/reconnect; guesses never write player.identity or player.group.
				if (!shown(player) && game.getIdentityList?.(player)) {
					const current = remaining(player, available);
					player._guozhanguess = available.filter(item => item === group ? !current.includes(item) : current.includes(item));
					const single = player._guozhanguess.length === 1 ? player._guozhanguess[0] : '';
					player.node.identity.dataset.color = single || 'unknown';
					player.node.identity.firstChild.innerHTML = single ? names[single] : '';
					update(player);
				}
				close();
			});
			menu.appendChild(button);
		}
		layer.appendChild(menu);
		layer.addEventListener('click', event => { event.stopPropagation(); _status.clicked = true; close(); });
		layer.addEventListener('touchend', event => event.stopPropagation());
		ui.window.appendChild(layer);
		const rect = player.node.identity.getBoundingClientRect(), bounds = layer.getBoundingClientRect();
		const scale = bounds.width / (layer.offsetWidth || bounds.width) || 1;
		const width = menu.offsetWidth, height = menu.offsetHeight;
		menu.style.left = Math.max(0, Math.min((rect.right - bounds.left) / scale + 3, layer.offsetWidth - width)) + 'px';
		menu.style.top = Math.max(0, Math.min((rect.bottom - bounds.top) / scale, layer.offsetHeight - height)) + 'px';
		const removalObserver = new MutationObserver(() => { if (!player.isConnected) close(); });
		removalObserver.observe(player.parentNode, { childList: true });
		active = { player, layer, removalObserver, signature: observed.get(player)?.signature };
		document.addEventListener('keydown', onKey);
	}
	function observe(player) {
		if (observed.has(player) || !player.node?.identity?.firstChild) return;
		const node = player.node.identity, badge = document.createElement('span');
		badge.className = 'hh-guozhan-force-badge';
		node.appendChild(badge);
		const observer = new MutationObserver(() => update(player));
		observer.observe(node, { attributes: true, attributeFilter: ['data-color', 'class'] });
		observer.observe(node.firstChild, { childList: true, characterData: true, subtree: true });
		observer.observe(player, { attributes: true, attributeFilter: ['class'] });
		observed.set(player, { badge, observer });
		let lastTouch = -Infinity;
		const click = event => {
			if (get.mode() !== 'guozhan') return;
			event.preventDefault(); event.stopImmediatePropagation(); event.stopPropagation();
			_status.clicked = true;
			if (event.type === 'click' && Date.now() - lastTouch < 500) return;
			if (event.type === 'touchend') lastTouch = Date.now();
			open(player);
		};
		node.addEventListener('click', click, true);
		node.addEventListener('touchend', click, { capture: true, passive: false });
		node.addEventListener('keydown', event => {
			if (get.mode() === 'guozhan' && (event.key === 'Enter' || event.key === ' ')) {
				event.preventDefault(); event.stopPropagation(); open(player);
			}
		});
		update(player);
	}
	const refresh = () => { for (const player of [...game.players, ...game.dead]) { observe(player); update(player); } };
	lib.arenaReady.push(refresh);
	lib.onover.push(close);
	globalThis.addEventListener?.('resize', close);
	return game.hhGuozhanIdentity = { observe, update, refresh, close };
}
