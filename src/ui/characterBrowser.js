import { createCharacterCatalog, bindCharacterPress, allCharactersPack } from './characterCatalog.js';
import { createSelectionPlayerVisual, findSelectionPlayerTemplate, selectionPlayerSize } from './selectionPlayer.js';
import { refreshCharacterSettingsMenus } from './characterSettingsMenu.js';
import { characterSkillTags, createCharacterSkins, createCharacterVoice } from './characterDetail.js';

const clean = value => typeof value === 'string' ? value.replace(/<[^>]*>/g, '').trim() : '';

export function createCharacterBrowser(context, environment = {}) {
	const { lib, game, ui, get, _status = {} } = context;
	const doc = environment.document || globalThis.document, win = environment.window || doc?.defaultView || globalThis;
	const assetRoot = `${lib.assetURL || ''}extension/HH优化/assets/character-browser/`;
	const env = { setTimer: (fn, ms) => setTimeout(fn, ms), clearTimer: id => clearTimeout(id), now: Date.now, ...environment };
	const skins = createCharacterSkins(context), voice = createCharacterVoice(context, env);
	let detailSession = 0;
	let root, model, workspace, detail, grid, search, status, title, back, feedback, sidebar;
	let filterButton, filterMenu, filterOptions = [], filterValue = 'all';
	let pack = allCharactersPack, rows = [], shown = 0, detailId, previousFocus, pausedHere = false, noticeTimer;
	let presses = [], packPresses = [], detailPress, packButtons = new Map(), sizeObserver;
	const pageSize = 60;
	function node(tag, cls, text, parent) {
		const result = doc.createElement(tag); result.className = cls;
		if (text !== undefined) result.textContent = text;
		if (tag === 'button') result.type = 'button';
		parent?.appendChild(result); return result;
	}
	function clear(element) { while (element.firstChild) element.removeChild(element.firstChild); }
	function closeFilter(restoreFocus = false) {
		if (!filterMenu || filterMenu.hidden) return;
		filterMenu.hidden = true; filterButton.setAttribute('aria-expanded', 'false');
		if (restoreFocus) filterButton.focus?.({ preventScroll: true });
	}
	function openFilter() {
		filterMenu.hidden = false; filterButton.setAttribute('aria-expanded', 'true');
		filterOptions.find(option => option.dataset.value === filterValue)?.focus?.({ preventScroll: true });
	}
	function outsideFilter(event) {
		for (let target = event.target; target; target = target.parentNode) if (target === status) return;
		closeFilter();
	}
	function createFilter(header) {
		filterValue = 'all'; filterOptions = [];
		status = node('div', 'hh-character-filter', undefined, header);
		filterButton = node('button', 'hh-character-filter-button', '全部武将', status);
		filterButton.setAttribute('aria-label', '筛选启用状态：全部武将');
		filterButton.setAttribute('aria-haspopup', 'listbox'); filterButton.setAttribute('aria-expanded', 'false');
		filterButton.setAttribute('aria-controls', 'hh-character-filter-options');
		filterMenu = node('div', 'hh-character-filter-menu', undefined, status); filterMenu.id = 'hh-character-filter-options';
		filterMenu.setAttribute('role', 'listbox'); filterMenu.setAttribute('aria-label', '筛选启用状态'); filterMenu.hidden = true;
		for (const [value, label] of [['all', '全部武将'], ['enabled', '已启用'], ['disabled', '已禁用']]) {
			const option = node('button', 'hh-character-filter-option', label, filterMenu); option.dataset.value = value; option.tabIndex = -1;
			option.setAttribute('role', 'option'); option.setAttribute('aria-selected', String(value === filterValue)); filterOptions.push(option);
			option.addEventListener('click', () => {
				filterValue = value; filterButton.textContent = label; filterButton.setAttribute('aria-label', '筛选启用状态：' + label);
				for (const item of filterOptions) item.setAttribute('aria-selected', String(item === option));
				closeFilter(true); renderGrid();
			});
		}
		filterButton.addEventListener('click', () => filterMenu.hidden ? openFilter() : closeFilter(true));
		filterButton.addEventListener('keydown', event => {
			if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); openFilter(); }
		});
		filterMenu.addEventListener('keydown', event => {
			if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
			event.preventDefault();
			const index = filterOptions.indexOf(doc.activeElement);
			const next = event.key === 'Home' ? 0 : event.key === 'End' ? filterOptions.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + filterOptions.length) % filterOptions.length;
			filterOptions[next]?.focus?.({ preventScroll: true });
		});
	}
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
			const enabled = model.isPackEnabled(id), item = model.packs.find(item => item.id === id);
			button.classList.toggle('is-pack-disabled', !enabled);
			button.setAttribute('aria-label', `${item.name} ${value.enabled}/${value.total}${enabled ? '' : '，已关闭'}`);
			button.title = model.canTogglePack(id) ? `${item.name} · 长按${enabled ? '关闭' : '开启'}` : item.name;
		}
	}
	function fitCards() {
		if (!root) return;
		const { width, height, playerWidth, playerHeight, playerScale } = selectionPlayerSize(findSelectionPlayerTemplate(game), game, lib);
		root.style.setProperty('--hh-player-width', `${playerWidth}px`); root.style.setProperty('--hh-player-height', `${playerHeight}px`);
		root.style.setProperty('--hh-card-aspect', `${width}/${height}`);
		root.style.setProperty('--hh-card-ratio', String(width / height)); root.style.setProperty('--hh-card-height-ratio', String(height / width));
		const large = detailId && !detail.hidden ? detail.querySelector('.hh-general-card-large') : null;
		if (large) {
			const left = large.parentNode, style = win.getComputedStyle?.(left);
			const availableWidth = left.clientWidth - (parseFloat(style?.paddingLeft) || 0) - (parseFloat(style?.paddingRight) || 0);
			const availableHeight = left.clientHeight - (parseFloat(style?.paddingTop) || 0) - (parseFloat(style?.paddingBottom) || 0);
			if (win.getComputedStyle?.(detail)?.display === 'flex') { large.style.width = ''; large.style.height = ''; }
			else if (availableWidth > 0 && availableHeight > 0) {
				const cardHeight = Math.min(availableHeight, availableWidth * height / width);
				large.style.width = `${cardHeight * width / height}px`; large.style.height = `${cardHeight}px`;
			}
		}
		for (const card of root.querySelectorAll('.hh-general-card')) {
			if (!card.clientWidth) continue;
			const scale = playerScale * card.clientWidth / width; card.style.setProperty('--hh-player-scale', String(scale));
			if (card === large) {
				const targetWidth = card.getBoundingClientRect().width, visualWidth = card.querySelector('.hh-selection-player')?.getBoundingClientRect().width;
				if (targetWidth > 0 && visualWidth > 0) card.style.setProperty('--hh-player-scale', String(scale * targetWidth / visualWidth));
			}
		}
	}
	function portrait(parent, entry, large = false) {
		const card = node(large ? 'div' : 'button', 'hh-general-card' + (large ? ' hh-general-card-large' : ''), undefined, parent);
		card.dataset.character = entry.id; card.dataset.group = entry.group;
		card.classList.toggle('is-disabled', model.isBanned(entry.id));
		const packEnabled = model.isCharacterPackEnabled(entry.id, pack); card.classList.toggle('is-pack-disabled', !packEnabled);
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
			refreshCharacterSettingsMenus(context, current);
			if (!root || model !== current) return;
			updatePackCounts();
			if (detailId) showDetail(detailId, false);
			else renderGrid(false);
			notify(`${current.entries.get(id).name}已${banned ? '禁用' : '启用'}`);
		} catch (error) { if (root && model === current) notify('保存失败，请重试'); console.warn('[HH优化] 保存禁将设置失败', error); }
	}
	async function togglePack(id) {
		const current = model;
		try {
			const enabled = await current.togglePack(id); refreshCharacterSettingsMenus(context, current);
			if (!root || model !== current) return;
			updatePackCounts(); renderGrid(false); if (detailId) showDetail(detailId, false);
			notify(`${current.packs.find(item => item.id === id).name}已${enabled ? '开启' : '关闭'}`);
		} catch (error) { if (root && model === current) notify('保存失败，请重试'); console.warn('[HH优化] 保存武将包设置失败', error); }
	}
	async function toggleGroup(section) {
		const current = model;
		try {
			const enabled = await current.toggleGroup(section.pack, section.group); refreshCharacterSettingsMenus(context, current);
			if (!root || model !== current) return;
			updatePackCounts(); renderGrid(false); notify(`${section.name}已${enabled ? '开启' : '关闭'}`);
		} catch (error) { if (root && model === current) notify('保存失败，请重试'); console.warn('[HH优化] 保存分包设置失败', error); }
	}
	function sectionHeader(parent, section) {
		const header = node('div', 'hh-character-section', undefined, parent); header.dataset.section = section.key;
		header.classList.toggle('is-pack-disabled', !model.isPackEnabled(section.pack));
		const label = node('span', 'hh-character-section-name', section.name, header); label.title = section.name;
		const enabled = section.ids.filter(id => model.isEnabled(id, section.pack)).length;
		node('span', 'hh-character-section-count', `${enabled}/${section.ids.length}`, header);
		if (section.group ? model.canToggleGroup(section.pack, section.group) : model.canTogglePack(section.pack)) {
			const on = section.group ? model.groupEnabled(section.pack, section.group) : model.isPackEnabled(section.pack);
			const button = node('button', 'hh-character-section-toggle', on ? '开启' : '关闭', header);
			button.setAttribute('role', 'switch'); button.setAttribute('aria-checked', String(on)); button.setAttribute('aria-label', section.name);
			button.addEventListener('click', () => section.group ? toggleGroup(section) : togglePack(section.pack));
		}
	}
	function more() {
		if (!root || shown >= rows.length) return;
		const limit = Math.min(rows.length, shown + pageSize), fragment = doc.createDocumentFragment();
		for (; shown < limit; shown++) {
			const { entry, section } = rows[shown];
			if (section.header && (shown === 0 || rows[shown - 1].section.key !== section.key)) sectionHeader(fragment, section);
			const card = portrait(fragment, entry);
			presses.push(press(card, entry, () => showDetail(entry.id)));
		}
		grid.appendChild(fragment);
		fitCards();
		root.querySelector('.hh-character-more').hidden = shown >= rows.length;
	}
	function renderGrid(reset = true) {
		const scroll = grid.parentNode.scrollTop, limit = reset ? pageSize : Math.max(pageSize, shown);
		stopPresses(); clear(grid); shown = 0;
		rows = model.sections({ pack, query: search.value, status: filterValue }).flatMap(section => section.entries.map(entry => ({ entry, section })));
		while (shown < Math.min(rows.length, limit)) more();
		root.querySelector('.hh-character-empty').hidden = rows.length > 0;
		root.querySelector('.hh-character-more').hidden = shown >= rows.length;
		grid.parentNode.scrollTop = reset ? 0 : scroll;
	}
	function showList() {
		detailSession++; voice.stop();
		const previous = detail?.querySelector('.hh-general-card'); if (previous) { sizeObserver?.unobserve?.(previous); sizeObserver?.unobserve?.(previous.parentNode); }
		detailPress?.destroy(); detailPress = null; detailId = null;
		workspace.hidden = false; detail.hidden = true; search.hidden = false; status.hidden = false;
		title.textContent = '武将'; back.setAttribute('aria-label', '关闭武将界面');
	}
	function showDetail(id, focus = true) {
		const entry = model?.entries.get(id); if (!root || !entry) return;
		closeFilter(); voice.stop(); const session = ++detailSession;
		const previous = detail.querySelector('.hh-general-card'); if (previous) { sizeObserver?.unobserve?.(previous); sizeObserver?.unobserve?.(previous.parentNode); }
		detailPress?.destroy(); clear(detail); detailId = id;
		workspace.hidden = true; detail.hidden = false; search.hidden = true; status.hidden = true;
		title.textContent = '武将详情'; back.setAttribute('aria-label', '返回武将列表');
		const left = node('section', 'hh-general-detail-left', undefined, detail), card = portrait(left, entry, true);
		sizeObserver?.observe(left);
		detailPress = press(card, entry, () => {});
		const right = node('section', 'hh-general-detail-right', undefined, detail);
		const panel = node('section', 'hh-general-info', undefined, right);
		const tabs = node('div', 'hh-general-detail-tabs', undefined, panel), pane = node('div', 'hh-general-detail-pane', undefined, panel);
		tabs.setAttribute('role', 'tablist'); pane.setAttribute('role', 'tabpanel');
		const skillsTab = node('button', 'hh-general-tab', '技能', tabs), guideTab = node('button', 'hh-general-tab', '攻略', tabs), storyTab = node('button', 'hh-general-tab', '故事', tabs);
		for (const [button, key] of [[skillsTab, 'skills'], [guideTab, 'guide'], [storyTab, 'story']]) { button.dataset.tab = key; button.setAttribute('role', 'tab'); }
		let story = get.characterIntro?.(id) || lib.characterIntro?.[id];
		if (typeof story !== 'string') story = '暂无故事';
		let selectedSkin = skins.original(id), selectedSkill = entry.skills[0], caption;
		function paintSkin(element, choice) {
			if (!element) return;
			if (!choice.image) { if (env.setPortrait) env.setPortrait(element, entry); else element.setBackground?.(id, 'character', 'noskin'); }
			else if (choice.image.startsWith('db:') && element.setBackgroundDB) element.setBackgroundDB(choice.image.slice(3));
			else if (element.setBackgroundImage) element.setBackgroundImage(choice.image);
			else element.style.backgroundImage = 'url(' + JSON.stringify(/^(?:[a-z][\w+.-]*:|\/)/i.test(choice.image) ? choice.image : (lib.assetURL || '') + choice.image) + ')';
		}
		function selected(tab) { voice.stop(); for (const button of [skillsTab, guideTab, storyTab]) button.setAttribute('aria-selected', String(button === tab)); pane.setAttribute('aria-label', tab.textContent); clear(pane); }
		function skills() {
			selected(skillsTab);
			const toolbar = node('div', 'hh-general-skill-toolbar', undefined, pane), names = node('div', 'hh-general-skill-tabs', undefined, toolbar);
			const talk = node('button', 'hh-general-voice', undefined, toolbar), text = node('div', 'hh-general-skill-description', undefined, pane);
			talk.title = '台词'; talk.disabled = !entry.skills.length;
			const buttons = [];
			function describe(skill, button) {
				voice.stop(); selectedSkill = skill;
				for (const item of buttons) item.setAttribute('aria-selected', String(item === button));
				talk.setAttribute('aria-label', '播放' + clean(get.translation?.(skill) || skill) + '技能语音');
				const info = lib.skill?.[skill] || get.info?.(skill) || {}, tags = characterSkillTags(info);
				clear(text); const kinds = node('div', 'hh-general-skill-kind', undefined, text);
				for (const type of tags.types) { const badge = node('span', 'hh-general-skill-type', undefined, kinds); badge.dataset.type = type.type; badge.title = type.label; badge.setAttribute('aria-label', type.label); }
				for (const label of tags.labels) node('span', 'hh-general-skill-tag', label, kinds);
				const description = node('div', 'hh-general-skill-text', undefined, text);
				description.innerHTML = get.skillInfoTranslation?.(skill, null, false) || lib.translate?.[skill + '_info'] || '暂无技能说明';
				caption = node('div', 'hh-general-voice-caption', '', text); caption.setAttribute('role', 'status');
			}
			talk.addEventListener('click', () => {
				try { const result = voice.play(selectedSkill, id, selectedSkin.substitute ? selectedSkin.character : id); if (result.muted) notify('技能语音已关闭'); else if (result.empty) notify('暂无技能语音'); else caption.textContent = clean(result.text || ''); }
				catch (error) { notify('暂无可播放的技能语音'); console.warn('[HH优化] 预览技能语音失败', error); }
			});
			for (const skill of entry.skills) {
				const button = node('button', 'hh-general-skill', clean(get.translation?.(skill) || lib.translate?.[skill] || skill), names);
				button.dataset.skill = skill;
				buttons.push(button); button.addEventListener('click', () => describe(skill, button));
			}
			if (entry.skills.length) { const index = Math.max(0, entry.skills.indexOf(selectedSkill)); describe(entry.skills[index], buttons[index]); } else text.textContent = '暂无技能';
		}
		skillsTab.addEventListener('click', skills);
		storyTab.addEventListener('click', () => { selected(storyTab); const body = node('div', 'hh-general-story', undefined, pane); body.innerHTML = story; });
		guideTab.addEventListener('click', () => { selected(guideTab); const body = node('div', 'hh-general-story', undefined, pane); const guide = lib.characterGuide?.[id] || lib.characterStrategy?.[id]; body.innerHTML = typeof guide === 'string' ? guide : '暂无攻略'; });
		const rail = node('div', 'hh-general-skins', undefined, right); rail.setAttribute('role', 'listbox'); rail.setAttribute('aria-label', '选择皮肤');
		rail.addEventListener('scroll', cancelPresses, { passive: true });
		function skinButtons(choices, repaint = true) {
			clear(rail); selectedSkin = skins.selected(id, choices);
			if (repaint) paintSkin(card.querySelector('.hh-selection-player')?.firstChild, selectedSkin);
			for (const choice of choices) {
				const button = node('button', 'hh-general-skin', undefined, rail); button.dataset.skin = choice.key; button.title = choice.name;
				button.setAttribute('role', 'option'); button.setAttribute('aria-label', choice.name); button.setAttribute('aria-selected', String(choice.key === selectedSkin.key));
				paintSkin(node('div', 'hh-general-skin-image', undefined, button), choice);
				button.addEventListener('click', async () => {
					for (const item of rail.children) item.disabled = true;
					try {
						await skins.select(id, choice);
						if (!root || detailSession !== session) return;
						voice.stop();
						selectedSkin = choice; if (caption) caption.textContent = '';
						for (const item of rail.children) item.setAttribute('aria-selected', String(item === button));
						for (const item of root.querySelectorAll('.hh-general-card')) if (item.dataset.character === id) paintSkin(item.querySelector('.hh-selection-player')?.firstChild, choice);
					} catch (error) { if (root && detailSession === session) notify('皮肤保存失败，请重试'); console.warn('[HH优化] 保存皮肤失败', error); }
					finally { if (root && detailSession === session) for (const item of rail.children) item.disabled = false; }
				});
			}
		}
		skinButtons([selectedSkin], false); rail.setAttribute('aria-busy', 'true');
		skins.list(id).then(choices => { if (root && detailSession === session) { skinButtons(choices); rail.setAttribute('aria-busy', 'false'); } }).catch(error => { if (root && detailSession === session) rail.setAttribute('aria-busy', 'false'); console.warn('[HH优化] 读取皮肤失败', error); });
		skills(); fitCards(); if (focus) skillsTab.focus?.({ preventScroll: true });
	}
	function backOrClose() { if (detailId) { const id = detailId; showList(); Array.from(grid.children).find(item => item.dataset.character === id)?.focus?.({ preventScroll: true }); } else close(); }
	function key(event) {
		if (!root) return;
		if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!filterMenu.hidden) closeFilter(true); else backOrClose(); }
		else if (event.key === 'Tab') {
			if (!filterMenu.hidden) closeFilter(true);
			const items = Array.from(root.querySelectorAll('button,input,select,[tabindex="0"]')).filter(item => !item.hidden && item.getClientRects().length);
			const first = items[0], last = items.at(-1);
			if (event.shiftKey && doc.activeElement === first) { event.preventDefault(); last?.focus(); }
			else if (!event.shiftKey && doc.activeElement === last) { event.preventDefault(); first?.focus(); }
		}
	}
	function cancelPresses() { for (const item of [...presses, ...packPresses]) item.cancel(); detailPress?.cancel(); closeFilter(); }
	function open() {
		if (root) { root.focus?.(); return root; }
		if (!doc?.createElement) return null;
		model = createCharacterCatalog(context); if (!model.packs.some(item => item.id === pack)) pack = allCharactersPack;
		previousFocus = doc.activeElement; pausedHere = env.pauseGame !== false && !_status.connectMode && !_status.paused2 && typeof game.pause2 === 'function';
		if (pausedHere) game.pause2();
		root = node('div', 'hh-character-browser', undefined, doc.body || ui.window); root.tabIndex = -1;
		root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', '武将');
		const header = node('header', 'hh-character-header', undefined, root);
		title = node('div', 'hh-character-title', '武将', header);
		feedback = node('div', 'hh-character-feedback', '', header); feedback.setAttribute('role', 'status');
		createFilter(header);
		search = node('input', 'hh-character-search', undefined, header); search.type = 'search'; search.placeholder = '搜索武将'; search.setAttribute('aria-label', '搜索武将'); search.autocomplete = 'off';
		back = node('button', 'hh-character-back', undefined, header); back.setAttribute('aria-label', '关闭武将界面'); back.addEventListener('click', backOrClose);
		workspace = node('div', 'hh-character-workspace', undefined, root); sidebar = node('nav', 'hh-character-packs', undefined, workspace); sidebar.setAttribute('aria-label', '选择武将扩展包');
		packButtons = new Map();
		for (const entry of model.packs) {
			const button = node('button', 'hh-character-pack', undefined, sidebar); node('span', 'hh-character-pack-name', entry.name, button);
			button.dataset.pack = entry.id;
			const count = node('span', 'hh-character-pack-count', '', button); packButtons.set(entry.id, { button, count });
			const select = () => { pack = entry.id; updatePackCounts(); renderGrid(); };
			if (model.canTogglePack(entry.id)) packPresses.push(bindCharacterPress(button, { open: select, toggle: () => togglePack(entry.id), pointerEvents: !!win.PointerEvent, setTimer: env.setTimer, clearTimer: env.clearTimer, now: env.now }));
			else button.addEventListener('click', select);
		}
		sidebar.addEventListener('scroll', cancelPresses, { passive: true });
		const scroll = node('main', 'hh-character-scroll', undefined, workspace); grid = node('div', 'hh-character-grid', undefined, scroll);
		node('div', 'hh-character-empty', '没有匹配的武将', scroll);
		const load = node('button', 'hh-character-more', '更多武将', scroll); load.addEventListener('click', more);
		scroll.addEventListener('scroll', () => { cancelPresses(); if (scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop < 200) more(); }, { passive: true });
		detail = node('div', 'hh-general-detail', undefined, root); detail.hidden = true;
		search.addEventListener('input', () => renderGrid());
		for (const type of ['click', 'pointerdown', 'pointerup', 'touchstart', 'touchend', 'wheel', 'keydown']) root.addEventListener(type, event => event.stopPropagation(), { passive: type.startsWith('touch') || type === 'wheel' });
		doc.addEventListener('keydown', key, true); doc.addEventListener('visibilitychange', cancelPresses);
		doc.addEventListener('pointerdown', outsideFilter, true); doc.addEventListener('click', outsideFilter, true);
		if (typeof win.ResizeObserver === 'function') {
			sizeObserver = new win.ResizeObserver(fitCards); sizeObserver.observe(root);
			const template = findSelectionPlayerTemplate(game); if (template?.node?.campWrap) sizeObserver.observe(template);
		} else win.addEventListener?.('resize', fitCards);
		updatePackCounts(); renderGrid(); root.focus?.({ preventScroll: true }); return root;
	}
	function close() {
		if (!root) return;
		detailSession++; voice.stop();
		stopPresses(); for (const item of packPresses) item.destroy(); packPresses = []; detailPress?.destroy(); detailPress = null; env.clearTimer(noticeTimer);
		sizeObserver?.disconnect(); sizeObserver = null; win.removeEventListener?.('resize', fitCards);
		doc.removeEventListener('keydown', key, true); doc.removeEventListener('visibilitychange', cancelPresses);
		doc.removeEventListener('pointerdown', outsideFilter, true); doc.removeEventListener('click', outsideFilter, true);
		root.remove(); root = null; model = null; detailId = null; packButtons.clear();
		if (pausedHere) game.resume2?.(); pausedHere = false;
		env.onClose?.();
		if (previousFocus?.isConnected) previousFocus.focus?.({ preventScroll: true }); previousFocus = null;
	}
	lib.onover?.push(close);
	return { open, close, openCharacter: showDetail, get root() { return root; }, get catalog() { return model; }, assetRoot };
}
