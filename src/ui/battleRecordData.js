const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const tenth = value => Math.round(value * 10) / 10;

// The source client receives kill_score/damage_score/heal_score/assist_score/
// mvp_score from the server. These local scores deliberately share HH's MVP rule.
export function collectMvpScores(game) {
	const players = [...new Set([...(game.players || []), ...(game.dead || [])])];
	const dead = new Set(game.dead || []);
	return players.map(player => {
		let situation = finite(player.局势分数, 100) - (dead.has(player) || player.isDead?.() ? 20 : 0);
		for (const enemy of player.getEnemies?.(null, true) || []) if (dead.has(enemy) || enemy.isDead?.()) situation += 2;
		for (const friend of player.getFriends?.(null, true) || []) if (dead.has(friend) || friend.isDead?.()) situation -= 2;
		const score = finite(player.攻击分数) + finite(player.治疗分数) + finite(player.辅助分数) + situation - finite(player.惩罚扣分);
		return { player, score, rating: (Math.max(0, score) / 10).toFixed(1) };
	});
}

export const battleRecordRules = [
	'本页采用 HH 本地计分，与全场最佳共用同一份结算快照。原版客户端的评分由服务器下发，本地资源中没有服务器公式。',
	'伤害分：使用伤害牌 +0.2；对敌方造成伤害，每点 +0.3，单次最多 +1.5；击杀敌方 +0.3。内奸对其他角色造成的伤害也计分，击杀非主公友方 +0.3 且免误杀扣分。',
	'治疗分：为自己或友方回复体力，每点 +0.2，单次最多 +1；来源为内奸时也计分。',
	'辅助分：使用无懈可击 +0.2，使用非自身的多目标锦囊 +0.1。从敌方来源获得牌时，获得者每张 +0.1；敌方来源导致弃牌时，来源每张 +0.1。来源为内奸时不限制敌方关系。',
	'总评分 = 伤害分 + 治疗分 + 辅助分 + 局势分 − 惩罚分，最低 0。局势起始 10，阵亡 −2，每名敌方阵亡 +0.2、友方阵亡 −0.2；误杀友方 −0.5。',
	'击杀数取本体实际击杀统计。所有玩家（含阵亡者）按总评分评选 MVP；胜负按当前模式判定，阵亡不等于失败。点赞仅保存于本次本地战绩，不增加服务器人气或奖励。',
];

function resultFor(player, outcome, game, status) {
	if (outcome !== true && outcome !== false) return 'tie';
	if (player === game.me) return outcome ? 'win' : 'lose';
	if (status.winner?.includes(player)) return 'win';
	if (status.loser?.includes(player)) return 'lose';
	try {
		const value = game.checkOnlineResult?.(player);
		if (value === true || value === false) return value ? 'win' : 'lose';
	} catch { /* Some modes only support this helper on the host. */ }
	const friends = game.me?.getFriends?.(null, true) || [], enemies = game.me?.getEnemies?.(null, true) || [];
	if (friends.includes(player)) return outcome ? 'win' : 'lose';
	if (enemies.includes(player)) return outcome ? 'lose' : 'win';
	return 'unknown';
}

export function collectBattleRecord({ lib, game, get = {}, _status = {} }, outcome, duration = 0, scores = collectMvpScores(game)) {
	const best = scores.reduce((top, row) => !top || row.score > top.score ? row : top, null);
	const mode = get.mode?.() || lib.config.mode || '';
	const translate = value => String(get.translation?.(value) || value || '');
	const rows = scores.map(({ player, score, rating }, index) => {
		const names = [player.name1 || player.name, player.name2].filter(Boolean);
		const nickname = player === game.me ? lib.config.connect_nickname : player.nickname;
		const identity = (mode === 'guozhan' ? player.group : player.identity) || '';
		const fullIdentity = identity ? translate(identity + '2') : '';
		return Object.freeze({
			id: String(player.playerid ?? index), seat: finite(player.getSeatNum?.(), index + 1),
			name: String(nickname || names.map(translate).join(' / ') || `玩家${index + 1}`),
			general: names.map(translate).join(' / '), character: player.skin?.name || names[0] || '',
			avatar: player.node?.avatar?.style?.backgroundImage || '',
			identity: player.identity || '', group: player.group || '',
			identityName: fullIdentity === identity + '2' ? translate(identity) : fullIdentity,
			result: resultFor(player, outcome, game, _status), self: player === game.me,
			kills: (player.stat || []).reduce((sum, stat) => sum + finite(stat.kill), 0),
			damage: tenth(finite(player.攻击分数) / 10), heal: tenth(finite(player.治疗分数) / 10), assist: tenth(finite(player.辅助分数) / 10),
			score, rating, mvp: best?.player === player,
		});
	});
	const order = { win: 0, lose: 1, tie: 2, unknown: 3 };
	rows.sort((a, b) => order[a.result] - order[b.result] || a.seat - b.seat);
	return Object.freeze({ mode, modeName: translate(mode), rounds: Math.max(0, Math.trunc(finite(game.roundNumber))),
		duration: Math.max(0, Math.floor(finite(duration) / 1000)), outcome, rows: Object.freeze(rows) });
}

// Same portable replay format as the engine's “录像 → 导出” action.
export function exportBattleReplay({ lib, game, _status = {} }, record) {
	if (typeof game.export !== 'function' || typeof lib.init?.encode !== 'function' || !lib.video?.length || _status.video) return false;
	const me = game.me || game.players?.[0];
	if (!me) return false;
	const saved = lib.videos?.find(video => video.video === lib.video);
	const name = saved?.name || game.getVideoName?.() || [record.rows.find(row => row.self)?.general || '', record.modeName];
	const video = saved || { name, mode: record.mode, video: lib.video, win: record.outcome === true,
		name1: me.name1 || me.name, name2: me.name2, time: lib.getUTC?.(new Date()) ?? Date.now() };
	game.export(lib.init.encode(JSON.stringify(video)), `无名杀 - 录像 - ${name[0]} - ${name[1]}`);
	return true;
}
