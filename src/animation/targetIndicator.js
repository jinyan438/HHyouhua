import { chupaiAnimations } from './configs/skillAnimations.js';

/** One cancellable play per selected player, including while its asset is loading. */
export function setupTargetIndicators({ lib, game, ui, animation, getConfig }, environment = {}) {
	if (animation.targetIndicators) return animation.targetIndicators;
	const { MutationObserver = globalThis.MutationObserver } = environment;
	const active = new Map(), loading = new Map(), observed = new Set();
	const selected = player => player.isConnected !== false && player.classList.contains('selected')
		&& !player.classList.contains('dead') && !player.classList.contains('out');
	function stop(player) {
		const state = active.get(player);
		active.delete(player);
		if (state?.node) animation.stopSpine(state.node);
		delete player.ChupaizhishiXid;
	}
	function ready(config) {
		if (animation.hasSpine(config.name)) return Promise.resolve();
		if (loading.has(config.name)) return loading.get(config.name);
		const work = new Promise((resolve, reject) => animation.loadSpine(config.name, config.fileType || 'skel', resolve, reject));
		loading.set(config.name, work);
		work.then(() => loading.delete(config.name), () => loading.delete(config.name));
		return work;
	}
	function sync(player, force = false) {
		const key = getConfig(), config = chupaiAnimations[key];
		if (!selected(player) || !config) { stop(player); return; }
		if (!force && active.get(player)?.key === key) return;
		stop(player);
		const state = { key, node: null };
		active.set(player, state);
		const play = () => {
			if (active.get(player) !== state || !selected(player) || getConfig() !== key) return;
			state.node = animation.playSpine({ name: config.name, action: config.action, loop: true }, { parent: player, scale: config.scale });
			if (state.node) player.ChupaizhishiXid = state.node;
			else active.delete(player);
		};
		if (animation.hasSpine(config.name)) play();
		else ready(config).then(play, error => {
			if (active.get(player) !== state) return;
			active.delete(player);
			console.warn('HH优化：目标指示加载失败', error);
		});
	}
	function observe(player) {
		if (observed.has(player)) return;
		observed.add(player);
		const observer = new MutationObserver(() => sync(player));
		observer.observe(player, { attributes: true, attributeFilter: ['class'] });
		player.ChupaizhishiXObserver = observer;
		sync(player);
	}
	const controller = {
		observe,
		refresh() {
			for (const player of game.players || []) observe(player);
			for (const player of observed) sync(player, true);
		},
		clear() { for (const player of active.keys()) stop(player); },
	};
	const inits = lib.element.player.inits || [];
	lib.element.player.inits = [].concat(inits, observe);
	for (const player of game.players || []) observe(player);
	if (ui?.arena) {
		const removals = new MutationObserver(() => {
			for (const player of observed) {
				if (player.isConnected !== false) continue;
				stop(player);
				player.ChupaizhishiXObserver.disconnect();
				delete player.ChupaizhishiXObserver;
				observed.delete(player);
			}
		});
		removals.observe(ui.arena, { childList: true });
	}
	(lib.onover ||= []).push(controller.clear);
	animation.targetIndicators = controller;
	return controller;
}
