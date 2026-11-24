// Reserve a native pool entry until the AI seat reaches its normal init call.
// The mode still owns initialization, reserves and the rest of setup.
export function createVersusRecommendation({ lib, game, get, _status }, parent) {
	if (get.mode() !== 'versus' || _status.mode !== 'two' || _status.connectMode || game.online || _status.brawl) return null;
	if (parent._hhVersusRecommendation) return parent._hhVersusRecommendation;
	let recommendation = null, disposed = false;
	const choices = new Set();
	const source = id => get.sourceCharacter(id);
	const allied = player => player !== game.me && game.me.side !== undefined && player.side === game.me.side;
	const aiSeat = player => allied(player) && !player.name1 && !player.isOnline?.() && !player.ws && !player._trueMe;
	const poolFor = () => parent.list;
	const target = () => {
		if (disposed || get.mode() !== 'versus' || _status.mode !== 'two' || _status.connectMode || game.online || _status.brawl || parent.two_assign) return null;
		return game.players.find(player => allied(player) && !player.name1 && Array.isArray(poolFor(player))) || null;
	};
	const occupied = id => game.players.some(player => [player.name1, player.name2, player.replacetwo].filter(Boolean).some(name => source(name) === source(id)));
	const poolEntry = (pool, id) => pool.find(name => source(name) === source(id) || lib.characterReplace?.[name]?.includes(id));
	function cancel() {
		if (!recommendation) return;
		for (const { pool, entries } of recommendation.reservations) {
			for (const [index, id] of entries) if (!pool.includes(id) && !occupied(id)) pool.splice(Math.min(index, pool.length), 0, id);
		}
		recommendation = null;
	}
	function allowed(id, player = target()) {
		if (!player || !lib.character[id] || lib.filter.characterDisabled(id) || occupied(id)) return false;
		if (recommendation?.player === player && recommendation.id === id) return true;
		return !!poolEntry(poolFor(player), id);
	}
	function recommend(id) {
		const player = target();
		if (!allowed(id, player)) return false;
		cancel();
		const pool = poolFor(player), reservations = [];
		if (aiSeat(player)) {
			const entries = [];
			for (let index = pool.length - 1; index >= 0; index--) {
				if (source(pool[index]) === source(id) || lib.characterReplace?.[pool[index]]?.includes(id)) entries.unshift([index, pool.splice(index, 1)[0]]);
			}
			reservations.push({ pool, entries });
		}
		recommendation = { player, id, pool, reservations };
		return true;
	}
	function sync(ids) {
		if (recommendation && (target() !== recommendation.player || poolFor(recommendation.player) !== recommendation.pool || !ids.includes(recommendation.id) || !allowed(recommendation.id))) cancel();
	}
	const restores = game.players.filter(player => typeof player.init === 'function').map(player => {
		const own = Object.getOwnPropertyDescriptor(player, 'init'), init = player.init;
		function initialize(...args) {
			const item = recommendation;
			// Free selection and auto-selection also return through native chooseButton.
			if (item && [...choices].some(event => event.result?.links?.some(id => source(id) === source(item.id)))) cancel();
			if (item && player === game.me && args.slice(0, 2).some(id => id && source(id) === source(item.id))) cancel();
			if (item && recommendation === item && player === item.player) {
				if (aiSeat(player) && poolFor(player) === item.pool && allowed(item.id, player)) {
					// Native randomRemove already consumed its fallback; return that unused entry.
					const fallback = args[0], key = Object.keys(lib.characterReplace || {}).find(name => lib.characterReplace[name].includes(fallback)) || fallback;
					if (key && source(key) !== source(item.id) && !item.pool.includes(key) && !occupied(key)) item.pool.push(key);
					args[0] = item.id;
					recommendation = null;
				} else cancel();
			}
			return init.apply(this, args);
		}
		player.init = initialize;
		return () => { if (player.init === initialize) { if (own) Object.defineProperty(player, 'init', own); else delete player.init; } };
	});
	const finish = parent.finish, ownFinish = Object.getOwnPropertyDescriptor(parent, 'finish');
	function finishSelection(...args) { controller.dispose(); return finish.apply(this, args); }
	if (typeof finish === 'function') parent.finish = finishSelection;
	const controller = {
		target, allowed, recommend, cancel, sync,
		observeChoice: event => choices.add(event),
		get current() { return recommendation; },
		selfChoice(id) { if (recommendation && source(id) === source(recommendation.id)) cancel(); },
		dispose() {
			if (disposed) return;
			disposed = true; cancel(); restores.forEach(restore => restore());
			if (parent.finish === finishSelection) { if (ownFinish) Object.defineProperty(parent, 'finish', ownFinish); else delete parent.finish; }
			delete parent._hhVersusRecommendation;
		},
	};
	parent._hhVersusRecommendation = controller;
	return controller;
}
