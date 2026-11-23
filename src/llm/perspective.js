export const plain = value => String(value ?? '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

// Static definitions only. Never traverse live players, cards, DOM, storage or the event tree.
export function definitionCode(value, seen = new WeakSet()) {
	if (typeof value === 'function') return value.compiled && value.original ? definitionCode(value.original, seen) : value.toString();
	if (value == null || ['string', 'boolean', 'number'].includes(typeof value)) return value;
	if (typeof value !== 'object' || value.nodeType || value.playerid || value.cardid || seen.has(value)) return undefined;
	seen.add(value);
	const result = Array.isArray(value) ? value.map(item => definitionCode(item, seen)) : Object.fromEntries(Object.entries(value)
		.filter(([key]) => !['storage', '_cache', 'dialog', 'player', 'cards', 'targets'].includes(key))
		.map(([key, item]) => [key, definitionCode(item, seen)]));
	seen.delete(value);
	return result;
}

export function createPerspective({ lib, game, ui, get, _status }) {
	const players = () => [...new Set([...(game.players || []), ...(game.dead || [])])];
	const seat = player => Number(player?.getSeatNum?.()) || players().indexOf(player) + 1;
	const id = player => player ? 'seat:' + seat(player) : null;
	const names = (player, viewer) => [player.name1 || player.name, player.name2]
		.filter((name, index) => name && lib.character?.[name] && (player === viewer || !player.isUnseen?.(index)));
	const text = name => plain(lib.translate?.[name] || name);
	function cardKnown(card, viewer) {
		const owner = get.owner?.(card);
		const position = get.position?.(card, true);
		const hidden = card?.classList?.contains('infohidden') || card?.classList?.contains('infoflip') || lib.card?.[card?.viewAs || card?.name]?.blankCard;
		if (owner === viewer) return true;
		// Native isKnownBy unconditionally exposes the judgment zone; face-down
		// judgments need explicit knowledge instead of that public-zone shortcut.
		if (hidden) return !!card?._knowers?.some(knower => knower === 'everyone' || knower === viewer?.playerid)
			|| position === 'h' && viewer?.hasSkillTag?.('viewHandcard', null, owner, true) === true;
		if (position === 'c' || position === 's') return card?.isKnownBy?.(viewer) === true;
		if (position === 'h') return card?.isKnownBy?.(viewer) === true;
		if (['e', 'j', 'd', 'o'].includes(position)) return true;
		return card?.isKnownBy?.(viewer) === true || get.is?.shownCard?.(card) === true;
	}
	function cardInfo(card) {
		if (!card) return null;
		return { name: card.name, text: text(card.name), suit: card.suit, number: card.number,
			nature: card.nature, viewAs: typeof card.viewAs === 'string' ? card.viewAs : undefined,
			info: plain(lib.translate?.[card.name + '_info'] || ''), tags: [...(card.gaintag || [])] };
	}
	function cardView(card, viewer, granted = false) {
		return granted || cardKnown(card, viewer) ? cardInfo(card) : { hidden: true };
	}
	function playerView(player, viewer) {
		const knownNames = names(player, viewer);
		const own = player === viewer;
		const skills = own ? player.getSkills?.('invisible', false) || [] : player.getSkills?.(null, false) || [];
		const hiddenSkills = new Set(player.hiddenSkills || []);
		const identityVisible = own || player.identityShown === true || player.isZhu === true;
		const marks = Object.keys(player.marks || {}).map(name => ({ name, text: text(name),
			count: own ? player.countMark?.(name) || 0 : plain(player.marks[name]?.markcount?.textContent || '') }));
		return { id: id(player), seat: seat(player), generals: knownNames.map(name => ({ name, text: text(name) })),
			hp: player.hp, maxHp: player.maxHp, hujia: player.hujia || 0, group: knownNames.length || own ? player.group : 'unknown',
			identity: identityVisible ? player.identity : 'unknown', dead: !!player.isDead?.(), out: !!player.isOut?.(),
			linked: !!player.isLinked?.(), turnedOver: !!player.isTurnedOver?.(),
			handCount: player.countCards?.('h') || 0, hand: (player.getCards?.('h') || []).filter(card => cardKnown(card, viewer)).map(cardInfo),
			equipment: (player.getCards?.('e') || []).map(card => cardView(card, viewer)),
			judges: (player.getCards?.('j') || []).map(card => cardView(card, viewer)),
			expansions: (player.getExpansions?.() || []).map(card => cardView(card, viewer)), marks,
			skills: skills.filter(skill => own || !hiddenSkills.has(skill)).map(skill => ({ name: skill, text: text(skill), info: plain(lib.translate?.[skill + '_info'] || '') })),
			...(own ? { used: ownStorage(player.getStat?.(), viewer) } : {}) };
	}
	function ownStorage(value, viewer, depth = 0, seen = new WeakSet()) {
		if (value == null || ['string', 'number', 'boolean'].includes(typeof value)) return value;
		if (typeof value !== 'object' || depth > 5 || seen.has(value)) return undefined;
		if (value.playerid || players().includes(value)) return { player: id(value) };
		if (value.cardid || get.itemtype?.(value) === 'card') return cardView(value, viewer);
		if (value.nodeType) return undefined;
		seen.add(value);
		const result = Array.isArray(value) ? value.map(item => ownStorage(item, viewer, depth + 1, seen)) :
			Object.fromEntries(Object.entries(value).filter(([key]) => !key.startsWith('_')).map(([key, item]) => [key, ownStorage(item, viewer, depth + 1, seen)]));
		seen.delete(value);
		return result;
	}
	function skillDefinitions(skills) {
		const result = {}, visited = new Set();
		function add(name) {
			if (!name || visited.has(name) || !lib.skill?.[name]) return;
			visited.add(name);
			const info = lib.skill[name];
			result[name] = { text: text(name), info: plain(lib.translate?.[name + '_info'] || ''), code: definitionCode(info) };
			for (const child of [...(typeof info.group === 'string' ? [info.group] : info.group || []), ...(typeof info.global === 'string' ? [info.global] : info.global || []), ...Object.keys(info.subSkill || {}).map(key => name + '_' + key)]) add(child);
		}
		skills.forEach(add);
		return result;
	}
	function snapshot(viewer, records = [], extraSkills = []) {
		const visible = players().map(player => playerView(player, viewer));
		const generals = [...new Set(players().flatMap(player => names(player, viewer)))];
		const skillNames = [...new Set([...generals.flatMap(name => {
			const character = lib.character[name];
			return character.skills || character[3] || [];
		}), ...visible.flatMap(player => player.skills.map(skill => skill.name)), ...extraSkills])];
		const cardNames = [...new Set([...(lib.inpile || []), ...visible.flatMap(player => [...player.hand, ...player.equipment, ...player.judges].filter(card => card.name).map(card => card.name))])];
		return { you: id(viewer), mode: get.mode?.() || lib.config.mode, round: game.roundNumber || 0,
			currentPhase: id(_status.currentPhase), players: visible, record: records,
			pileCount: ui.cardPile?.childNodes?.length || 0,
			discardPile: Array.from(ui.discardPile?.childNodes || []).map(card => cardView(card, viewer)),
			generals: generals.map(name => { const character = lib.character[name]; return { name, text: text(name),
				intro: plain(lib.characterIntro?.[name] || ''), definition: definitionCode(character),
				skills: character.skills || character[3] || [] }; }),
			skills: skillDefinitions(skillNames),
			cards: Object.fromEntries(cardNames.map(name => [name, { text: text(name), info: plain(lib.translate?.[name + '_info'] || ''), code: definitionCode(lib.card?.[name]) }])),
		};
	}
	function logValue(value, viewer, reveal = false) {
		if (players().includes(value)) return { player: id(value), generals: names(value, viewer).map(text) };
		if (Array.isArray(value)) return value.map(item => logValue(item, viewer, reveal));
		if (get.itemtype?.(value) === 'card' || value?.cardid) return cardView(value, viewer, reveal);
		if (typeof value === 'object') return value?.name && lib.card?.[value.name] ? { name: value.name, text: text(value.name), nature: value.nature } : undefined;
		return typeof value === 'string' ? plain(value) : value;
	}
	return { players, seat, id, names, text, cardKnown, cardInfo, cardView, playerView, snapshot, skillDefinitions, logValue };
}
