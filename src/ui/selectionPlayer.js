import { getPlayerStyleSizing } from './playerStyleSizing.js';

// The visual-only player used by both opening selection and the character catalog.
export function findSelectionPlayerTemplate(game) {
	return game.players?.find(player => player !== game.me && player.node?.campWrap) || game.me;
}

export function captureSelectionPlayerLayout(template, scale = 1) {
	const rect = template?.getBoundingClientRect?.();
	if (!rect?.width || !rect?.height || !scale || !template.offsetWidth || !template.offsetHeight) return null;
	return { width: rect.width / scale, height: rect.height / scale, playerWidth: template.offsetWidth, playerHeight: template.offsetHeight, playerScale: rect.width / template.offsetWidth / scale };
}

export function selectionPlayerSize(template, game, lib) {
	const recorded = game?.hhSelectionCardLayout;
	if (recorded?.width > 0 && recorded.height > 0 && recorded.playerWidth > 0 && recorded.playerHeight > 0 && recorded.playerScale > 0) return recorded;
	const measured = captureSelectionPlayerLayout(template);
	if (measured) return measured;
	const { width, height } = getPlayerStyleSizing(lib?.config?.extension_HH优化_player_width, lib?.config?.extension_HH优化_newDecadeStyle, lib?.config?.extension_HH优化_player_height);
	return { width, height, playerWidth: width, playerHeight: height, playerScale: 1 };
}

export function createSelectionPlayerVisual({ lib, game, ui, get }, id, environment = {}) {
	const doc = environment.document || globalThis.document;
	const template = environment.template || findSelectionPlayerTemplate(game);
	const raw = get.character(id), hpSpec = raw.hp ?? raw[2] ?? 0;
	const parts = typeof hpSpec === 'string' ? hpSpec.split('/').map(Number) : [hpSpec];
	const info = { group: raw.group || raw[1], groupBorder: raw.groupBorder, hp: parts[0], maxHp: raw.maxHp ?? parts[1] ?? parts[0], hujia: raw.hujia || 0 };
	const make = cls => { const element = doc.createElement('div'); element.className = cls; return element; };
	const player = make('player fullskin hh-selection-player');
	const computedStyle = environment.getComputedStyle || doc.defaultView?.getComputedStyle?.bind(doc.defaultView);
	if (template && computedStyle) player.style.fontFamily = computedStyle(template).fontFamily;
	player.dataset.mode = get.mode();
	player.dataset.borderLevel = ui.arena?.dataset.borderLevel || lib.config.extension_HH优化_borderLevel || 'five';
	if (player.dataset.borderLevel === 'random') player.dataset.borderLevel = template?.dataset.borderLevel || 'five';
	const avatar = template?.node?.avatar?.cloneNode(false) || make('primary-avatar');
	avatar.classList.remove('hidden');
	Object.assign(avatar.style, { display: '', opacity: '1', visibility: 'visible' });
	if (environment.setPortrait) environment.setPortrait(avatar, id);
	else avatar.setBackground(id, 'character');
	const camp = template?.node?.campWrap?.cloneNode(true) || make('camp-wrap');
	if (!camp.querySelector('.camp-back')) camp.appendChild(make('camp-back'));
	if (!camp.querySelector('.camp-border')) camp.appendChild(make('camp-border'));
	if (!camp.querySelector('.camp-name')) camp.appendChild(make('camp-name'));
	if (!camp.querySelector('.avatar-name')) camp.appendChild(make('avatar-name'));
	camp.dataset.camp = info.groupBorder || info.group;
	const name = camp.querySelector('.avatar-name');
	name.innerHTML = get.slimName?.(id) || get.translation(id);
	const campName = camp.querySelector('.camp-name');
	campName.style.backgroundImage = '';
	campName.innerHTML = get.translation(info.group);
	camp.node = { campName };
	// Use the same configured faction renderer as real players, without creating a player.
	let prototype = lib.element?.Player?.prototype;
	while (prototype) {
		const descriptor = Object.getOwnPropertyDescriptor(prototype, 'group');
		if (descriptor?.set) { descriptor.set.call({ name: id, node: { campWrap: camp } }, info.group); break; }
		prototype = Object.getPrototypeOf(prototype);
	}
	const hpWrap = template?.node?.hpWrap?.cloneNode(false) || make('hp-wrap');
	const hp = make('hp');
	hp.dataset.condition = info.hp > info.maxHp / 2 ? 'high' : info.hp > info.maxHp / 3 ? 'mid' : 'low';
	if (info.maxHp > 5 || (info.hujia && info.maxHp > 3)) {
		hp.classList.add('textstyle');
		const number = value => get.numStr?.(value) ?? String(value);
		hp.innerHTML = `${number(info.hp)}<br>/<br>${number(info.maxHp)}<div></div>`;
		player.dataset.maxHp = '4';
	} else {
		player.dataset.maxHp = String(info.maxHp);
		for (let i = 0; i < info.maxHp; i++) { const jade = make(''); jade.classList.toggle('lost', i >= info.hp); hp.appendChild(jade); }
	}
	hpWrap.appendChild(hp); player.append(avatar, camp, hpWrap);
	return player;
}
