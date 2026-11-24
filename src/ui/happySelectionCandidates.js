// Extend the native Happy mode's seven-card deal without replacing its event.
export function installHappySelectionCandidates({ lib, game, ui, get, _status }) {
	const buttons = ui.create.buttons;
	ui.create.buttons = function (list, type, position, ...args) {
		const event = _status.event;
		const parent = event?.name === 'chooseCharacter' ? event : event?.getParent?.('chooseCharacter');
		const localHappy = get.mode() === 'versus' && _status.mode === 'two' && !_status.connectMode && !game.online && !_status.brawl;
		// Initial deals run in chooseCharacter; rerolls run in its mounted chooseButton.
		// The native free-pick catalog and unrelated dialogs keep their own lists.
		const deal = event === parent || (event?.name === 'chooseButton' && event.player === game.me && event.dialog?._hhSelection && event.dialog !== parent?.dialogxx);
		if (localHappy && deal && parent?.name === 'chooseCharacter' && Array.isArray(parent.list) && type === 'characterx' &&
			Array.isArray(list) && list.length > 0 && list.length <= 7 && list.every(id => parent.list.includes(id))) {
			const source = id => get.sourceCharacter(id);
			const used = new Set([...list, ...game.players.flatMap(player => [player.name1, player.name2, player.replacetwo]).filter(Boolean)].map(source));
			const pool = parent.list.filter(id => !used.has(source(id)) &&
				(lib.characterReplace[id] || [id]).some(name => lib.character[name] && !lib.filter.characterDisabled(name)));
			list = [...list];
			while (list.length < 12 && pool.length) {
				const id = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
				if (used.has(source(id))) continue;
				used.add(source(id)); list.push(id);
			}
		}
		return buttons.call(this, list, type, position, ...args);
	};
}
