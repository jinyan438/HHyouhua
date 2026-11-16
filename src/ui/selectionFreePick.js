const plain = value => String(value || '').replace(/<[^>]*>/g, '').trim();
const normalize = value => plain(value).normalize('NFKC').toLowerCase().replace(/\s+/g, '');

// This picker only returns an id. The opening dialog owns selection and submission.
export function createSelectionFreePick({ lib, ui, get }, { root, available, paintCard, onPick }) {
	let panel = null, previousFocus = null;
	const close = (restoreFocus = true) => {
		panel?.remove(); panel = null;
		if (restoreFocus && previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
	};
	function open() {
		close(false);
		previousFocus = document.activeElement;
		panel = document.createElement('div');
		panel.className = 'hh-point-picker';
		panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-label', '点将');
		const make = (tag, cls, text, parent = panel) => {
			const node = document.createElement(tag); node.className = cls;
			if (text !== undefined) node.textContent = text;
			if (tag === 'button') node.type = 'button';
			parent.appendChild(node); return node;
		};
		const header = make('header', 'hh-point-header');
		make('span', 'hh-point-title', '点将', header);
		const search = make('input', 'hh-point-search', undefined, header);
		search.type = 'search'; search.placeholder = '搜索武将'; search.setAttribute('aria-label', '搜索武将名、编号或技能');
		const back = make('button', 'hh-point-close', '×', header); back.setAttribute('aria-label', '关闭点将');
		back.addEventListener('click', () => close());
		const packs = make('nav', 'hh-point-packs'); packs.setAttribute('aria-label', '武将包');
		const grid = make('div', 'hh-point-grid'); grid.tabIndex = 0;
		const names = Object.keys(lib.character).filter(available);
		const index = new Map(names.map(id => [id, normalize([id, get.translation(id), ...(get.character(id).skills || []).map(skill => get.translation(skill))].join(' '))]));
		let filtered = [], shown = 0, pack = '', choices = [];
		function more() {
			for (const id of filtered.slice(shown, shown + 40)) {
				const card = ui.create.button(id, 'character', undefined, true);
				card.classList.add('hh-general'); paintCard(card); card.tabIndex = 0;
				card.setAttribute('role', 'button'); card.setAttribute('aria-label', plain(get.translation(id)));
				const pick = () => { if (available(id)) { close(false); onPick(id); } };
				card.addEventListener('click', e => { e.stopPropagation(); pick(); });
				card.addEventListener('keydown', e => {
					if (['Enter', ' '].includes(e.key) && !e.repeat) { e.preventDefault(); e.stopPropagation(); pick(); }
				});
				grid.appendChild(card);
			}
			shown = Math.min(shown + 40, filtered.length);
		}
		function render() {
			const query = normalize(search.value);
			filtered = names.filter(id => (!pack || Object.hasOwn(lib.characterPack[pack], id)) && (!query || index.get(id).includes(query)));
			grid.replaceChildren(); grid.scrollTop = 0; shown = 0;
			for (const [id, button] of choices) button.setAttribute('aria-pressed', String(id === pack));
			more();
			if (!filtered.length) make('div', 'hh-point-empty', '暂无武将', grid);
		}
		const addPack = (id, label) => {
			const button = make('button', 'hh-point-pack', label, packs); choices.push([id, button]);
			button.addEventListener('click', () => { pack = id; render(); });
		};
		addPack('', '全部');
		for (const [id, characters] of Object.entries(lib.characterPack || {})) {
			if (['mode_favourite', 'mode_banned'].includes(id) || !characters || !names.some(name => Object.hasOwn(characters, name))) continue;
			addPack(id, plain(lib.translate?.[id + '_character_config'] || lib.translate?.[id] || id.replace(/^mode_extension_/, '')));
		}
		search.addEventListener('input', render);
		grid.addEventListener('scroll', () => { if (grid.scrollHeight - grid.scrollTop - grid.clientHeight < 500) more(); });
		panel.addEventListener('keydown', e => {
			if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
			if (e.key !== 'Tab') return;
			const controls = [...panel.querySelectorAll('button,input,[tabindex="0"]')].filter(node => !node.hidden);
			const first = controls[0], last = controls.at(-1);
			if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
			else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
		});
		// Keep taps, wheel scrolling and text editing local to the picker.
		for (const type of ['pointerdown', 'mousedown', 'touchstart', 'touchmove', 'touchend', 'click', 'wheel']) panel.addEventListener(type, e => e.stopPropagation());
		root.appendChild(panel); render(); search.focus({ preventScroll: true });
	}
	return { open, close, get isOpen() { return !!panel; } };
}
