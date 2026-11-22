// Original shouQiKaWindow: Xji.createChild, 714 × 213 on a 750-high stage.
export function openingHandScore(cards, player, get) {
	// The original client requests a server score. Its fallback Grade tables are
	// absent from the offline resources; use this engine's character-aware values.
	const value = cards.reduce((sum, card) => {
		const score = Number(get.value(card, player));
		return sum + (Number.isFinite(score) ? score : 0);
	}, 0);
	return Math.max(0, Math.min(99, Math.round(value * 2.5)));
}

export function createLuckyCardDialog({ lib, game, ui, get }, event, onConfirm) {
	const host = ui.window, doc = host.ownerDocument, win = doc.defaultView;
	const root = doc.createElement('section');
	root.className = 'hh-lucky-card';
	root.tabIndex = -1;
	root.setAttribute('role', 'dialog');
	root.setAttribute('aria-labelledby', 'hh-lucky-card-question');
	root.innerHTML = `<div class="hh-lucky-score-glow" aria-hidden="true"></div>
		<div class="hh-lucky-score" role="img"></div>
		<div class="hh-lucky-score-title">手牌评分</div>
		<div class="hh-lucky-question" id="hh-lucky-card-question">是否更换当前手牌</div>
		<div class="hh-lucky-cost"></div>
		<button class="hh-lucky-change" type="button">更换手牌</button>
		<button class="hh-lucky-cancel" type="button">取消</button>
		<div class="hh-lucky-progress" aria-hidden="true"><div></div></div>`;
	const score = openingHandScore(game.me.getCards('h'), game.me, get);
	const scoreNode = root.querySelector('.hh-lucky-score');
	scoreNode.setAttribute('aria-label', `手牌评分 ${score}`);
	for (const digit of String(score)) {
		const node = doc.createElement('span');
		node.className = `hh-lucky-digit hh-lucky-digit-${digit}`;
		scoreNode.appendChild(node);
	}
	root.querySelector('.hh-lucky-cost').textContent = event.freeChanges > 0
		? `本次更换手牌免费（剩余${event.freeChanges}次）`
		: `消耗1张手气卡（剩余${event.luckyCards}张）`;
	const change = root.querySelector('.hh-lucky-change'), cancel = root.querySelector('.hh-lucky-cancel');
	change.disabled = event.freeChanges <= 0 && event.luckyCards <= 0;
	let closed = false, resolved = false, timer;
	function choose(bool) {
		if (closed || resolved || bool && change.disabled) return;
		resolved = true;
		change.disabled = cancel.disabled = true;
		onConfirm(bool);
	}
	change.addEventListener('click', () => choose(true));
	cancel.addEventListener('click', () => choose(false));
	function keydown(e) {
		if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); choose(false); }
	}
	root.addEventListener('keydown', keydown);
	const previousFocus = doc.activeElement;
	function resize() {
		const scale = Math.max(.1, Math.min(host.clientHeight / 750, (host.clientWidth - 24) / 744));
		root.style.setProperty('--hh-lucky-scale', scale);
	}
	host.appendChild(root);
	resize();
	const observer = new win.ResizeObserver(resize);
	observer.observe(host);
	root.focus({ preventScroll: true });
	const progress = root.querySelector('.hh-lucky-progress'), fill = progress.firstElementChild;
	if (String(lib.config.extension_HH优化_jindutiaoYangshi) === '0') progress.hidden = true;
	else {
		const started = win.performance.now();
		const duration = Math.max(1, Number(lib.config.extension_HH优化_playerActionTime) || 15) * 1000;
		timer = win.setInterval(() => {
			const remaining = Math.max(0, 1 - (win.performance.now() - started) / duration);
			fill.style.transform = `scaleX(${remaining})`;
			if (!remaining) { win.clearInterval(timer); progress.hidden = true; }
		}, 32);
	}
	return {
		element: root,
		close() {
			if (closed) return;
			closed = true;
			win.clearInterval(timer);
			observer.disconnect();
			const focused = root.contains(doc.activeElement);
			root.remove();
			if (focused && previousFocus?.isConnected) previousFocus.focus?.({ preventScroll: true });
		},
	};
}
