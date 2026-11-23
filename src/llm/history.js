// The full, perspective-filtered archive stays local. Summaries never consult
// live players, so later revelations cannot leak into an earlier private record.
export function compactValue(value) {
	if (Array.isArray(value)) return value.map(compactValue);
	if (!value || typeof value !== 'object') return value;
	return Object.fromEntries(Object.entries(value)
		.filter(([key]) => !['state', 'info', 'code', 'definition'].includes(key))
		.map(([key, item]) => [key, compactValue(item)]));
}

export function summarizeHistory(records, recent = 16) {
	const through = Math.max(0, records.length - recent);
	const counts = {}, players = {}, highlights = [];
	for (let index = 0; index < through; index++) {
		const record = records[index];
		counts[record.type] = (counts[record.type] || 0) + 1;
		if (record.player) {
			const player = players[record.player] ||= { damage: 0, recovered: 0, hpLost: 0, used: {} };
			if (record.type === 'damage') player.damage += record.num || 0;
			if (record.type === 'recover') player.recovered += record.num || 0;
			if (record.type === 'loseHp') player.hpLost += record.num || 0;
			if (record.type === 'useCard' && record.card?.name) player.used[record.card.name] = (player.used[record.card.name] || 0) + 1;
		}
		if (['die', 'showCards', 'viewCards', 'showCharacter'].includes(record.type)) {
			highlights.push({ id: index + 1, ...compactValue(record) });
			if (highlights.length > 12) highlights.shift();
		}
	}
	return { total: records.length, summary: { through, counts, players, highlights },
		recent: records.slice(through).map((record, index) => ({ id: through + index + 1, ...compactValue(record) })) };
}

export function readHistory(records, { from, limit = 8, player, type } = {}) {
	if (from !== undefined && (!Number.isInteger(from) || from < 1)) throw new Error('from 应为从 1 开始的记录编号');
	if (!Number.isInteger(limit) || limit < 1 || limit > 8) throw new Error('每次可查询 1 至 8 条历史');
	const matches = records.map((record, index) => ({ id: index + 1, ...record }))
		.filter(record => (!player || record.player === player || record.source === player || record.targets?.includes(player)) && (!type || record.type === type));
	const selected = from === undefined ? matches.slice(-limit) : matches.filter(record => record.id >= from).slice(0, limit);
	const last = selected.at(-1)?.id;
	return { total: records.length, matched: matches.length, records: selected,
		next: last && matches.some(record => record.id > last) ? last + 1 : null };
}
