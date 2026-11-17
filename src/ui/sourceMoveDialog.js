// Decorate the native move dialog without replacing its cards or callbacks.
const states = new WeakMap();
const moveEvents = new Set(['chooseToMove', 'chooseToMove_new']);

export function getSourceMoveLayout(width, height, rows, columns, groups = 1, expanded = false) {
	const availableBoard = Math.max(180, width - Math.min(180, width * .14));
	const label = width < 500 ? 28 : 34;
	const available = availableBoard / groups - label - 12;
	const scale = Math.max(.42, Math.min(expanded ? 1.3 : 1,
		available / (columns * 121.5 - 13.5),
		(height * (expanded ? .83 : .67) - 64 - (rows - 1) * 10) / (rows * 150)));
	const cardWidth = 108 * scale, cardHeight = 150 * scale;
	const board = Math.min(availableBoard, groups * (label + 10 + columns * cardWidth + (columns - 1) * cardWidth / 8) + (groups - 1) * 10);
	const bodyHeight = rows * cardHeight + (rows - 1) * 10;
	const basePanelHeight = bodyHeight + 60;
	const verticalInset = Math.min(24, Math.max(0, (height - basePanelHeight - 16) / 2));
	const panelHeight = basePanelHeight + verticalInset * 2;
	return { board, label, scale, cardWidth, cardHeight, gap: cardWidth / 8,
		bodyHeight, contentTop: 44 + verticalInset, panelHeight,
		top: Math.max(8, Math.min(height * .08 - verticalInset, height - panelHeight - 8)) };
}

export function getSourceMoveTitle(event, get, lib) {
	const seen = new Set();
	for (let current = event; current && !seen.has(current); current = current.getParent?.() || current.parent) {
		seen.add(current);
		const skill = current.skill || (lib.skill?.[current.name] && current.name);
		if (skill) {
			const text = get.translation?.(skill);
			if (typeof text === 'string' && text !== skill) return text.replace(/<[^>]*>/g, '');
		}
	}
	const prompt = String(event.prompt || '').replace(/<[^>]*>/g, '');
	const short = prompt.split(/[：:]/)[0];
	if (short && short.length <= 12) return short;
	if (event.list?.some(item => String(item[0]).includes('牌堆顶'))) return '观星';
	return '调整牌序';
}

function findRows(dialog) {
	const children = Array.from(dialog.content?.children || []);
	const legacy = children.filter(node => node.matches('.buttons.guanxing'));
	if (legacy.length) return legacy.map(cards => {
		let label = cards.previousElementSibling;
		const selectAll = label?.classList.contains('select-all') ? label : null;
		if (selectAll) label = selectAll.previousElementSibling;
		return { container: null, groups: [{ cards, label, selectAll }] };
	});
	return children.filter(node => node.classList.contains('row-container')).map(container => {
		const cells = Array.from(container.children);
		if (cells.length < 2 || cells.length % 2) return null;
		const groups = [];
		for (let i = 0; i < cells.length; i += 2) groups.push({ label: cells[i], cards: cells[i + 1] });
		return { container, groups };
	}).filter(Boolean);
}

export function decorateSourceMoveDialog(dialog, event, { ui, get, lib }) {
	if (!moveEvents.has(event?.name) || event.dialog !== dialog) return false;
	if (states.has(dialog)) return true;
	const rows = findRows(dialog);
	if (!rows.length) return false;
	const doc = dialog.ownerDocument, view = doc.defaultView;
	const groups = rows.flatMap(row => row.groups);
	const columns = Math.max(1, groups.reduce((sum, group) => sum + group.cards.children.length, 0));
	dialog.classList.add('hh-source-move-dialog');
	dialog.style.setProperty('--hh-move-slot-count', columns);
	const title = doc.createElement('div');
	title.className = 'hh-move-title';
	const titleText = doc.createElement('span');
	titleText.textContent = getSourceMoveTitle(event, get, lib);
	title.appendChild(titleText);
	const expand = doc.createElement('button');
	expand.className = 'hh-move-expand';
	expand.type = 'button';
	expand.setAttribute('aria-label', '放大');
	title.appendChild(expand);
	dialog.appendChild(title);
	for (const child of Array.from(dialog.content.children)) child.classList.add('hh-move-original');
	rows.forEach((row, index) => {
		if (row.container) {
			row.container.classList.add('hh-move-grid-row');
			row.container.style.setProperty('--hh-move-row-index', index);
			row.container.style.gridTemplateColumns = `repeat(${row.groups.length}, var(--hh-move-label-width) minmax(0, 1fr))`;
		}
		for (const group of row.groups) {
			group.cards.classList.add('hh-move-cards');
			group.label?.classList.add('hh-move-label');
			for (const node of [group.cards, group.label, group.selectAll]) node?.style.setProperty('--hh-move-row-index', index);
			group.selectAll?.classList.add('hh-move-select-all');
		}
	});
	let expanded = false;
	const scaleCards = scale => {
		for (const group of groups) for (const card of group.cards.children) {
			// Independent scale survives the engine's translate/swap animations,
			// and is copied into its detached drag preview by cloneNode.
			card.style.scale = String(scale);
			card.style.transformOrigin = '0 0';
			if (card.copy) { card.copy.style.scale = String(scale); card.copy.style.transformOrigin = '0 0'; }
		}
	};
	let scale = 1;
	const layout = () => {
		const arena = ui.arena || dialog.parentElement;
		const sizing = getSourceMoveLayout(arena?.clientWidth || view.innerWidth,
			arena?.clientHeight || view.innerHeight, rows.length, columns,
			Math.max(...rows.map(row => row.groups.length)), expanded);
		scale = sizing.scale;
		for (const [property, value] of Object.entries({
			'board-width': sizing.board, 'label-width': sizing.label,
			'card-width': sizing.cardWidth, 'card-height': sizing.cardHeight,
			'gap': sizing.gap, 'step': sizing.cardWidth + sizing.gap,
			'body-height': sizing.bodyHeight, 'content-top': sizing.contentTop,
			'panel-height': sizing.panelHeight, 'top': sizing.top,
		})) dialog.style.setProperty('--hh-move-' + property, value + 'px');
		dialog.style.setProperty('--hh-move-scale', scale);
		scaleCards(scale);
	};
	expand.addEventListener('click', e => {
		e.stopPropagation();
		expanded = !expanded;
		expand.setAttribute('aria-label', expanded ? '还原' : '放大');
		expand.setAttribute('aria-pressed', String(expanded));
		layout();
	});
	layout();
	const mutation = new view.MutationObserver(() => scaleCards(scale));
	mutation.observe(dialog.content, { childList: true, subtree: true });
	const resize = view.ResizeObserver ? new view.ResizeObserver(layout) : null;
	if (ui.arena) resize?.observe(ui.arena);
	view.addEventListener('resize', layout);
	states.set(dialog, () => {
		mutation.disconnect();
		resize?.disconnect();
		view.removeEventListener('resize', layout);
	});
	return true;
}

export function closeSourceMoveDialog(dialog) {
	states.get(dialog)?.();
	states.delete(dialog);
}

export function updateSourceLoadingDialog(dialog, { ui, event }) {
	const enabled = ui.arena?.dataset?.loadingStyle === 'onlineUI' &&
		!moveEvents.has(event?.name) && !dialog.classList.contains('hh-source-move-dialog') &&
		dialog.matches('.scroll1:not(.dclieqiong), .scroll2:not(.dclieqiong), .addNewRow:not(.dclieqiong)');
	dialog.classList.toggle('hh-source-loading-dialog', enabled);
	const caption = Array.from(dialog.content?.children || []).find(node => node.classList.contains('caption'));
	caption?.classList.toggle('hh-loading-heading', enabled);
	if (!enabled) return;
	dialog.dataset.hhLoadingTitle = caption?.textContent || '';
	const arenaHeight = ui.arena.clientHeight || dialog.ownerDocument.defaultView.innerHeight;
	const height = Math.min(arenaHeight - 42, Math.max(210, dialog.content.scrollHeight + 78));
	dialog.style.setProperty('--hh-loading-height', height + 'px');
	dialog.style.setProperty('--hh-loading-top', Math.max(4, Math.min(arenaHeight * .1, arenaHeight - height - 45)) + 'px');
}
