import { createCharacterCatalog, bindCharacterPress, allCharactersPack } from './characterCatalog.js';
import { createSelectionPlayerVisual, findSelectionPlayerTemplate, selectionPlayerSize } from './selectionPlayer.js';

const clean = value => typeof value === 'string' ? value.replace(/<[^>]*>/g, '').trim() : '';

export function createCharacterBrowser(context, environment = {}) {
	const { lib, game, ui, get, _status = {} } = context;
	const doc = environment.document || globalThis.document, win = environment.window || doc?.defaultView || globalThis;
	const assetRoot = `${lib.assetURL || ''}extension/HH优化/assets/character-browser/`;
	const env = { setTimer: (fn, ms) => setTimeout(fn, ms), clearTimer: id => clearTimeout(id), now: Date.now, ...environment };
	let root, model, workspace, detail, grid, search, status, title, back, feedback, sidebar;
	let pack = allCharactersPack, rows = [], shown = 0, detailId, previousFocus, pausedHere = false, noticeTimer;
	let presses = [], detailPress, packButtons = new Map(), sizeObserver;
	const pageSize = 60;
	function node(tag, cls, text, parent) {
		const result = doc.createElement(tag); result.className = cls;
		if (text !== undefined) result.textContent = text;
		if (tag === 'button') result.type = 'button';
		parent?.appendChild(result); return result;
	}
	function clear(element) { while (element.firstChild) element.removeChild(element.firstChild); }
	function stopPresses() { for (const press of presses) press.destroy(); presses = []; if (grid) for (const card of grid.children) sizeObserver?.unobserve?.(card); }
	function notify(text) {
		if (!root) return;
		feedback.textContent = text; env.clearTimer(noticeTimer);
		noticeTimer = env.setTimer(() => { if (feedback) feedback.textContent = ''; }, 2200);
	}
	function updatePackCounts() {
		for (const [id, { button, count }] of packButtons) {
			const value = model.counts(id); count.textContent = `${value.enabled}/${value.total}`;
			button.setAttribute('aria-pressed', String(id === pack));
		}
	}
	function fitCards() {
		if (!root) return;
		const { width, height, playerWidth, playerHeight, playerScale } = selectionPlayerSize(findSelectionPlayerTemplate(game), game, lib);
		root.style.setProperty('--hh-player-width', `${playerWidth}px`); root.style.setProperty('--hh-player-height', `${playerHeight}px`);
		root.style.setProperty('--hh-card-aspect', `${width}/${height}`);
		root.style.setProperty('--hh-card-ratio', String(width / height)); root.style.setProperty('--hh-card-height-ratio', String(height / width));
		for (const card of root.querySelectorAll('.hh-general-card')) {
			if (card.clientWidth) card.style.setProperty('--hh-player-scale', String(playerScale * card.clientWidth / width));
		}
	}
	function portrait(parent, entry, large = false) {
		const card = node(large ? 'div' : 'button', 'hh-general-card' + (large ? ' hh-general-card-large' : ''), undefined, parent);
		card.dataset.character = entry.id; card.dataset.group = entry.group;
		card.classList.toggle('is-disabled', model.isBanned(entry.id));
		card.setAttribute('aria-label', entry.name + (model.isBanned(entry.id) ? '，已禁用' : ''));
		card.title = `${entry.name} · 长按${model.isBanned(entry.id) ? '启用' : '禁用'}`;
		card.appendChild(createSelectionPlayerVisual(context, entry.id, {
			document: doc, getComputedStyle: win.getComputedStyle?.bind(win),
			setPortrait: env.setPortrait && ((element, id) => env.setPortrait(element, model.entries.get(id))),
		}));
		sizeObserver?.observe(card);
		return card;
	}
	function press(card, entry, open) {
		return bindCharacterPress(card, { open, toggle: () => toggle(entry.id), pointerEvents: !!win.PointerEvent, setTimer: env.setTimer, clearTimer: env.clearTimer, now: env.now });
	}
	async function toggle(id) {
		const current = model;
		try {
			const banned = await current.toggle(id);
			if (!root || model !== current) return;
			updatePackCounts();
			if (detailId) showDetail(detailId, false);
			else renderGrid(false);
			notify(`${current.entries.get(id).name}已${banned ? '禁用' : '启用'}`);
		} catch (error) { if (root && model === current) notify('保存失败，请重试'); console.warn('[HH优化] 保存禁将设置失败', error); }
	}
	function more() {
		if (!root || shown >= rows.length) return;
		const limit = Math.min(rows.length, shown + pageSize), fragment = doc.createDocumentFragment();
		for (; shown < limit; shown++) {
			const entry = rows[shown], card = portrait(fragment, entry);
			presses.push(press(card, entry, () => showDetail(entry.id)));
		}
		grid.appendChild(fragment);
		fitCards();
		root.querySelector('.hh-character-more').hidden = shown >= rows.length;
	}
	function renderGrid(reset = true) {
		const scroll = grid.parentNode.scrollTop, limit = reset ? pageSize : Math.max(pageSize, shown);
		stopPresses(); clear(grid); shown = 0;
		rows = model.list({ pack, query: search.value, status: status.value });
		while (shown < Math.min(rows.length, limit)) more();
		root.querySelector('.hh-character-empty').hidden = rows.length > 0;
		root.querySelector('.hh-character-more').hidden = shown >= rows.length;
		grid.parentNode.scrollTop = reset ? 0 : scroll;
	}
	function showList() {
		const previous = detail?.querySelector('.hh-general-card'); if (previous) sizeObserver?.unobserve?.(previous);
		detailPress?.destroy(); detailPress = null; detailId = null;
		workspace.hidden = false; detail.hidden = true; search.hidden = false; status.hidden = false;
		title.textContent = '武将'; back.setAttribute('aria-label', '关闭武将界面');
	}
	function showDetail(id, focus = true) {
		const entry = model?.entries.get(id); if (!root || !entry) return;
		const previous = detail.querySelector('.hh-general-card'); if (previous) sizeObserver?.unobserve?.(previous);
		detailPress?.destroy(); clear(detail); detailId = id;
		workspace.hidden = true; detail.hidden = false; search.hidden = true; status.hidden = true;
		title.textContent = '武将详情'; back.setAttribute('aria-label', '返回武将列表');
		const left = node('section', 'hh-general-detail-left', undefined, detail), card = portrait(left, entry, true);
		detailPress = press(card, entry, () => {});
		const hp = typeof entry.hp === 'string' ? entry.hp.split('/') : [entry.hp, entry.maxHp];
		const maximum = hp[1] ?? entry.maxHp;
		node('div', 'hh-general-vitals', `${clean(get.translation?.(entry.sex) || entry.sex)}　体力 ${hp[0]}${String(hp[0]) !== String(maximum) ? '/' + maximum : ''}`, left);
		const right = node('section', 'hh-general-detail-right', undefined, detail);
		const tabs = node('div', 'hh-general-detail-tabs', undefined, right), pane = node('div', 'hh-general-detail-pane', undefined, right);
		const skillsTab = node('button', 'hh-general-tab', '技能', tabs);
		let story = get.characterIntro?.(id) || lib.characterIntro?.[id];
		if (typeof story !== 'string') story = '';
		const storyTab = story ? node('button', 'hh-general-tab', '生平', tabs) : null;
		function selected(tab) { for (const button of [skillsTab, storyTab].filter(Boolean)) button.setAttribute('aria-selected', String(button === tab)); clear(pane); }
		function skills() {
			selected(skillsTab);
			const names = node('div', 'hh-general-skill-tabs', undefined, pane), text = node('div', 'hh-general-skill-description', undefined, pane);
			const buttons = [];
			function describe(skill, button) {
				for (const item of buttons) item.setAttribute('aria-selected', String(item === button));
				const info = lib.skill?.[skill];
				const kind = [info?.zhuSkill && '主公技', info?.limited && '限定技', info?.juexingji && '觉醒技', info?.locked && '锁定技'].filter(Boolean).join(' · ');
				clear(text); if (kind) node('div', 'hh-general-skill-kind', kind, text);
				const description = node('div', 'hh-general-skill-text', undefined, text);
				description.innerHTML = get.skillInfoTranslation?.(skill) || lib.translate?.[skill + '_info'] || '暂无技能说明';
			}
			for (const skill of entry.skills) {
				const button = node('button', 'hh-general-skill', clean(get.translation?.(skill) || lib.translate?.[skill] || skill), names);
				buttons.push(button); button.addEventListener('click', () => describe(skill, button));
			}
			if (entry.skills.length) describe(entry.skills[0], buttons[0]); else text.textContent = '暂无技能';
		}
		skillsTab.addEventListener('click', skills);
		storyTab?.addEventListener('click', () => { selected(storyTab); const body = node('div', 'hh-general-story', undefined, pane); body.innerHTML = story; });
		skills(); fitCards(); if (focus) skillsTab.focus?.({ preventScroll: true });
	}
	function backOrClose() { if (detailId) { const id = detailId; showList(); Array.from(grid.children).find(item => item.dataset.character === id)?.focus?.({ preventScroll: true }); } else close(); }
	function key(event) {
		if (!root) return;
		if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); backOrClose(); }
		else if (event.key === 'Tab') {
			const items = Array.from(root.querySelectorAll('button,input,select,[tabindex="0"]')).filter(item => !item.hidden && item.getClientRects().length);
			const first = items[0], last = items.at(-1);
			if (event.shiftKey && doc.activeElement === first) { event.preventDefault(); last?.focus(); }
			else if (!event.shiftKey && doc.activeElement === last) { event.preventDefault(); first?.focus(); }
		}
	}
	function cancelPresses() { for (const item of presses) item.cancel(); detailPress?.cancel(); }
	function open() {
		if (root) { root.focus?.(); return root; }
		if (!doc?.createElement) return null;
		model = createCharacterCatalog(context); if (!model.packs.some(item => item.id === pack)) pack = allCharactersPack;
		previousFocus = doc.activeElement; pausedHere = !_status.connectMode && !_status.paused2 && typeof game.pause2 === 'function';
		if (pausedHere) game.pause2();
		root = node('div', 'hh-character-browser', undefined, doc.body || ui.window); root.tabIndex = -1;
		root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', '武将');
		const header = node('header', 'hh-character-header', undefined, root);
		title = node('div', 'hh-character-title', '武将', header);
		feedback = node('div', 'hh-character-feedback', '', header); feedback.setAttribute('role', 'status');
		status = node('select', 'hh-character-filter', undefined, header); status.setAttribute('aria-label', '筛选启用状态');
		for (const [value, label] of [['all', '全部武将'], ['enabled', '已启用'], ['disabled', '已禁用']]) { const option = node('option', '', label, status); option.value = value; } status.value = 'all';
		search = node('input', 'hh-character-search', undefined, header); search.type = 'search'; search.placeholder = '搜索武将'; search.setAttribute('aria-label', '搜索武将'); search.autocomplete = 'off';
		back = node('button', 'hh-character-back', undefined, header); back.setAttribute('aria-label', '关闭武将界面'); back.addEventListener('click', backOrClose);
		workspace = node('div', 'hh-character-workspace', undefined, root); sidebar = node('nav', 'hh-character-packs', undefined, workspace); sidebar.setAttribute('aria-label', '选择武将扩展包');
		packButtons = new Map();
		for (const entry of model.packs) {
			const button = node('button', 'hh-character-pack', undefined, sidebar); node('span', 'hh-character-pack-name', entry.name, button);
			const count = node('span', 'hh-character-pack-count', '', button); packButtons.set(entry.id, { button, count });
			button.addEventListener('click', () => { pack = entry.id; updatePackCounts(); renderGrid(); });
		}
		const scroll = node('main', 'hh-character-scroll', undefined, workspace); grid = node('div', 'hh-character-grid', undefined, scroll);
		node('div', 'hh-character-empty', '没有匹配的武将', scroll);
		const load = node('button', 'hh-character-more', '更多武将', scroll); load.addEventListener('click', more);
		scroll.addEventListener('scroll', () => { cancelPresses(); if (scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop < 200) more(); }, { passive: true });
		detail = node('div', 'hh-general-detail', undefined, root); detail.hidden = true;
		search.addEventListener('input', () => renderGrid()); status.addEventListener('change', () => renderGrid());
		for (const type of ['click', 'pointerdown', 'pointerup', 'touchstart', 'touchend', 'wheel', 'keydown']) root.addEventListener(type, event => event.stopPropagation(), { passive: type.startsWith('touch') || type === 'wheel' });
		doc.addEventListener('keydown', key, true); doc.addEventListener('visibilitychange', cancelPresses);
		if (typeof win.ResizeObserver === 'function') {
			sizeObserver = new win.ResizeObserver(fitCards); sizeObserver.observe(root);
			const template = findSelectionPlayerTemplate(game); if (template?.node?.campWrap) sizeObserver.observe(template);
		} else win.addEventListener?.('resize', fitCards);
		updatePackCounts(); renderGrid(); root.focus?.({ preventScroll: true }); return root;
	}
	function close() {
		if (!root) return;
		stopPresses(); detailPress?.destroy(); detailPress = null; env.clearTimer(noticeTimer);
		sizeObserver?.disconnect(); sizeObserver = null; win.removeEventListener?.('resize', fitCards);
		doc.removeEventListener('keydown', key, true); doc.removeEventListener('visibilitychange', cancelPresses);
		root.remove(); root = null; model = null; detailId = null; packButtons.clear();
		if (pausedHere) game.resume2?.(); pausedHere = false;
		if (previousFocus?.isConnected) previousFocus.focus?.({ preventScroll: true }); previousFocus = null;
	}
	lib.onover?.push(close);
	return { open, close, openCharacter: showDetail, get root() { return root; }, get catalog() { return model; }, assetRoot };
}
