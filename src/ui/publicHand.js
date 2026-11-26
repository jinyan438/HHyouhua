// Laya ShowHandCardTip (Sns / Ins): four columns, .85 cards and a nine-slice bg.
export function getPublicHand(player, { game, get }) {
	if (!player || player === game.me || player.isDead?.()) return { cards: [], total: 0 };
	const hand = player.getCards('h');
	const full = !!game.me && (player.isUnderControl?.(true) || game.me.hasSkillTag?.('viewHandcard', null, player, true));
	return { cards: hand.filter(card => full || get.is.shownCard(card)), total: hand.length };
}

export function getPublicHandLayout(count) {
	const cardWidth = .85 * 126, cardHeight = .85 * 174;
	const width = count <= 1 ? 137 : count === 2 ? 250 : count === 3 ? 365 : 4 * cardWidth + 3 * 6 + 30;
	const height = count > 8 ? 400 : count > 4 ? 380 : 220;
	return { width, height, cardWidth, cardHeight, stepX: cardWidth + 6, stepY: cardHeight + 6 };
}

export function getPublicHandSummary(cards, { get, lib }) {
	return cards.slice(0, 4).map(card => {
		let name = lib.translate?.[card.name + '_ab'] || (card.name === 'zhuge' ? '连弩' : get.translation(card.name));
		if (card.name === 'sha') {
			const nature = get.nature?.(card) ?? card.nature;
			const natures = Array.isArray(nature) ? nature : String(nature || '').split('|');
			const prefix = natures.map(value => ({ fire: '火', thunder: '雷', ice: '冰' })[value] || '').join('');
			name = prefix + name;
		}
		return String(name || card.name).replace(/<[^>]*>/g, '').slice(0, 2);
	});
}

export function createPublicHandView(context, environment = globalThis) {
	const { game, ui, get, lib } = context, doc = environment.document;
	const entries = new Map();
	let current = null;
	const create = (name, parent) => {
		const node = doc.createElement('div'); node.className = name; parent?.appendChild(node); return node;
	};
	const cancelTimer = id => environment.clearTimeout(id);
	const removeCurrent = () => {
		if (!current) return;
		cancelTimer(current.timer);
		current.resize?.disconnect();
		current.removal?.disconnect();
		current.panel.remove();
		current.entry.count.setAttribute('aria-expanded', 'false');
		current.entry.summary.setAttribute('aria-expanded', 'false');
		current = null;
	};
	function close(immediate = false) {
		if (!current) return;
		if (immediate || lib.config.animation === false) { removeCurrent(); return; }
		if (current.closing) return;
		current.closing = true;
		current.cards.textContent = ''; current.title.hidden = true;
		current.panel.classList.remove('hh-public-hand-opening');
		current.panel.classList.add('hh-public-hand-closing');
		current.timer = environment.setTimeout(removeCurrent, 150);
	}
	function layoutSummary(player, summary) {
		if (!ui.arena || summary.hidden) return;
		const bounds = ui.arena.getBoundingClientRect(), rect = player.getBoundingClientRect();
		const rightSeat = rect.left + rect.width / 2 > bounds.left + bounds.width / 2;
		const scale = (player.offsetHeight || 232) / 232;
		Object.assign(summary.style, {
			left: rightSeat ? 'auto' : player.offsetWidth + 5 * scale + 'px',
			right: rightSeat ? player.offsetWidth + 5 * scale + 'px' : 'auto',
			transform: `scale(${scale})`, transformOrigin: rightSeat ? '100% 100%' : '0% 100%',
		});
	}
	function layout() {
		if (!current || current.closing) return;
		const { player, panel, entry, sizing } = current, arena = ui.arena;
		if (!arena || !player.isConnected || player.isDead?.()) { close(true); return; }
		const bounds = arena.getBoundingClientRect(), rect = player.getBoundingClientRect(), anchor = entry.count.getBoundingClientRect();
		const edge = entry.summary.hidden ? rect : entry.summary.getBoundingClientRect();
		const width = arena.clientWidth, height = arena.clientHeight;
		const sx = bounds.width / width || 1, sy = bounds.height / height || 1;
		const scale = Math.max(.1, Math.min((ui.window?.clientHeight || height) / 750, (width - 16) / sizing.width, (height - 16) / sizing.height));
		const rightSeat = (rect.left + rect.width / 2 - bounds.left) / sx > width / 2;
		const w = sizing.width * scale, h = sizing.height * scale;
		let left = rightSeat ? (edge.left - bounds.left) / sx - w - 12 * scale : (edge.right - bounds.left) / sx + 12 * scale;
		let top = (rect.bottom - bounds.top) / sy - h - 12 * scale;
		if ((rect.bottom - bounds.top) / sy < height * .45) top = (anchor.top - bounds.top) / sy;
		left = Math.max(8, Math.min(width - w - 8, left)); top = Math.max(8, Math.min(height - h - 8, top));
		Object.assign(panel.style, { left: left + 'px', top: top + 'px', width: sizing.width + 'px', height: sizing.height + 'px', transform: `scale(${scale})` });
		panel.style.setProperty('--hh-hand-origin', rightSeat ? '100% 50%' : '0% 50%');
	}
	function render(hand, opening = false) {
		if (!current) return;
		const { player, cards, title, panel } = current;
		current.hand = hand; current.sizing = getPublicHandLayout(hand.total);
		cards.textContent = '';
		title.textContent = get.translation(player) + '的手牌';
		cards.style.height = current.sizing.height - 70 + 'px';
		for (let i = 0; i < hand.total; i++) {
			const slot = create('hh-public-hand-slot', cards), card = hand.cards[i];
			Object.assign(slot.style, { left: i % 4 * current.sizing.stepX + 'px', top: Math.floor(i / 4) * current.sizing.stepY + 'px' });
			const node = card ? ui.create.button(card, 'card', undefined, true) : ui.create.card(undefined, undefined, true);
			node.classList.add('button');
			if (!card) { node.classList.add('infohidden'); node.setAttribute('aria-label', '未知手牌'); }
			slot.appendChild(node);
		}
		panel.classList.toggle('hh-public-hand-opening', opening && lib.config.animation !== false);
		layout();
	}
	function open(player) {
		const entry = entries.get(player), hand = getPublicHand(player, context);
		if (!entry || !ui.arena || !hand.cards.length) { close(true); return false; }
		if (current?.player === player && !current.closing) return true;
		removeCurrent();
		const panel = create('hh-public-hand', ui.arena), bg = create('hh-public-hand-bg', panel);
		panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', get.translation(player) + '的手牌');
		const cards = create('hh-public-hand-cards', panel), title = create('hh-public-hand-title', panel);
		for (const name of ['pointerdown', 'mousedown', 'touchstart', 'touchmove', 'click', 'touchend']) panel.addEventListener(name, event => event.stopPropagation());
		current = { player, entry, panel, bg, cards, title };
		entry.count.setAttribute('aria-expanded', 'true');
		entry.summary.setAttribute('aria-expanded', 'true');
		render(hand, true);
		if (environment.ResizeObserver) {
			current.resize = new environment.ResizeObserver(layout); current.resize.observe(ui.arena);
		}
		if (environment.MutationObserver) {
			current.removal = new environment.MutationObserver(() => { if (current && !current.player.isConnected) close(true); });
			current.removal.observe(ui.arena, { childList: true });
		}
		return true;
	}
	function update(player) {
		const entry = entries.get(player);
		if (!entry) { if (player?.node?.count && player.isConnected) attach(player); return; }
		const hand = getPublicHand(player, context), visible = hand.cards.length > 0 && player.isConnected;
		entry.summary.hidden = !visible;
		entry.names.textContent = visible ? getPublicHandSummary(hand.cards, context).join('\n') : '';
		entry.more.hidden = !visible || hand.cards.length < 5;
		layoutSummary(player, entry.summary);
		entry.count.classList.toggle('hh-public-hand-available', visible);
		if (visible) {
			for (const node of [entry.count, entry.summary]) {
				node.setAttribute('role', 'button'); node.setAttribute('tabindex', '0');
				node.setAttribute('aria-label', '查看' + get.translation(player) + '的手牌');
			}
		} else {
			for (const node of [entry.count, entry.summary]) for (const name of ['role', 'tabindex', 'aria-label', 'aria-expanded']) node.removeAttribute(name);
		}
		if (current?.player !== player || current.closing) return;
		if (!visible) { close(true); return; }
		const previous = current.hand;
		if (previous.total !== hand.total || previous.cards.length !== hand.cards.length || hand.cards.some((card, i) => card !== previous.cards[i])) render(hand);
		else { current.title.textContent = get.translation(player) + '的手牌'; layout(); }
	}
	function detach(player) {
		const entry = entries.get(player); if (!entry) return;
		if (current?.player === player) close(true);
		entry.observer?.disconnect();
		for (const node of [entry.count, entry.summary]) for (const [name, fn] of entry.listeners) node.removeEventListener(name, fn, true);
		entry.summary.remove();
		if (player.node.showCards === entry.summary) delete player.node.showCards;
		entry.count.classList.remove('hh-public-hand-available');
		for (const name of ['role', 'tabindex', 'aria-label', 'aria-expanded']) entry.count.removeAttribute(name);
		entries.delete(player);
	}
	function attach(player) {
		if (entries.get(player)?.count === player.node.count) { update(player); return; }
		detach(player);
		// Replace the old strip with the original client's persistent Oki summary.
		player.node.showCards?.remove(); delete player.node.showCards;
		const count = player.node.count; if (!count) return;
		const summary = create('hh-public-hand-summary', player);
		create('hh-public-hand-summary-bg', summary);
		const names = create('hh-public-hand-summary-names', summary), more = create('hh-public-hand-summary-more', summary);
		more.textContent = '...'; summary.hidden = true; player.node.showCards = summary;
		const available = () => getPublicHand(player, context).cards.length > 0;
		const stop = event => { if (available()) event.stopPropagation(); };
		let touchStart = null, ignoreClickUntil = 0;
		const startTouch = event => {
			if (!available()) return;
			touchStart = event.touches[0]; event.stopPropagation();
		};
		const activate = event => {
			if (!available() || event.type === 'keydown' && !['Enter', ' '].includes(event.key)) return;
			if (event.type === 'touchend') {
				const end = event.changedTouches[0], start = touchStart; touchStart = null;
				if (!start || !end || Math.hypot(end.clientX - start.clientX, end.clientY - start.clientY) > 12) return;
				ignoreClickUntil = Date.now() + 600;
			} else if (event.type === 'click' && Date.now() < ignoreClickUntil) {
				event.preventDefault(); event.stopImmediatePropagation(); return;
			}
			event.preventDefault(); event.stopImmediatePropagation();
			if (current?.player === player && !current.closing) close(); else open(player);
		};
		const listeners = [['click', activate], ['keydown', activate], ['touchstart', startTouch], ['touchend', activate], ...['pointerdown', 'mousedown', 'touchmove', 'touchcancel'].map(name => [name, stop])];
		for (const node of [count, summary]) for (const [name, fn] of listeners) node.addEventListener(name, fn, true);
		const entry = { count, summary, names, more, listeners }; entries.set(player, entry);
		if (environment.MutationObserver) {
			entry.observer = new environment.MutationObserver(() => update(player));
			for (const name of ['handcards1', 'handcards2']) if (player.node[name]) entry.observer.observe(player.node[name], { childList: true });
			entry.observer.observe(player, { attributes: true, attributeFilter: ['class', 'style', 'data-position'] });
		}
		update(player);
	}
	const refresh = () => { for (const player of new Set([...entries.keys(), ...(game.players || []), ...(game.dead || [])])) update(player); };
	const outside = event => {
		if (current && !current.panel.contains(event.target) && !current.entry.count.contains(event.target) && !current.entry.summary.contains(event.target)) close();
	};
	doc.addEventListener('pointerdown', outside, true);
	doc.addEventListener('touchstart', outside, true);
	doc.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
	doc.addEventListener('visibilitychange', () => { if (doc.hidden) close(true); });
	environment.addEventListener?.('resize', refresh);
	return { attach, detach, update, refresh, open, close, clear() { close(true); for (const player of [...entries.keys()]) detach(player); } };
}

export function setupPublicHand(context) {
	const { game, lib } = context;
	if (game.hhPublicHand) return game.hhPublicHand;
	const view = game.hhPublicHand = createPublicHandView(context);
	lib.skill._hh_public_hand = {
		trigger: { global: ['gameStart', 'phaseBegin', 'phaseAfter', 'addShownCardsAfter', 'hideShownCardsAfter', 'showCharacterAfter', 'dieAfter'] },
		forced: true, popup: false, silent: true, charlotte: true,
		content() { game.hhPublicHand?.refresh(); },
	};
	game.addGlobalSkill('_hh_public_hand');
	(lib.onover ??= []).push(() => view.clear());
	return view;
}
