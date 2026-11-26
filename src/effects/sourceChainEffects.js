import { decodeKillCombo, KillComboRenderer, loadSpine4Runtime, readSpine4Asset, loadSpine4Image } from './killCombo.js';

export const chainAssets = {
	enter: { name: 'EF_Plot_TSLH2', action: 'play2', speed: 1.2 },
	stay: { name: 'EF_Plot_TSLH2', action: 'play4' },
	clear: { name: 'EF_Plot_TSLH3', action: 'play5' },
	fire: { name: 'EF_Plot_tiesuo_02_H', action: 'play' },
	thunder: { name: 'EF_Plot_tiesuo_02_L', action: 'play' },
	ice: { name: 'EF_Plot_tiesuo_02_B', action: 'play' },
};
const sounds = { cast: '3d_85_spell1', enter: '3d_85_spell2', clear: '3d_85_spell4', break: '3d_85_broken_fire' };

// Only the engine's actual elemental unlink gets a damage break. A skill that
// changes chain state while resolving damage still uses the normal release.
export function chainDamageNature(event, player) {
	const parent = event.getParent?.();
	if (parent?.name !== '_lianhuan4') return '';
	const trigger = parent.getTrigger?.() || parent._trigger;
	const damage = trigger?.getParent?.() || parent.getParent?.('damage');
	if (damage?.name !== 'damage' || damage.player !== player) return '';
	const values = Array.isArray(damage.nature) ? damage.nature : String(damage.nature || '').split(/[|,+ ]/);
	return ['fire', 'thunder', 'ice'].find(nature => values.includes(nature)) || '';
}

export function chainPlacement(canvas, player) {
	if (!(player?.width > 0 && player?.height > 0)) return null;
	const scale = Math.min(player.width / 174, player.height / 232);
	return { x: player.left - canvas.left + player.width / 2, y: player.top - canvas.top + player.height / 2 - 10 * scale, scale };
}

export function createSourceChainEffects({ lib, game, ui }, environment = {}) {
	const env = {
		document: globalThis.document, loadSpine: loadSpine4Runtime,
		readText: url => readSpine4Asset(url, false), readBinary: url => readSpine4Asset(url, true), loadImage: loadSpine4Image,
		createRenderer: canvas => new KillComboRenderer(canvas), now: () => performance.now(),
		requestFrame: fn => requestAnimationFrame(fn), cancelFrame: id => cancelAnimationFrame(id),
		setTimer: (fn, ms) => setTimeout(fn, ms), clearTimer: id => clearTimeout(id), ...environment,
	};
	const path = `${lib.assetURL || ''}extension/HH优化/assets/chain-effects/`;
	const cache = new Map(), pending = new Map(), records = new Map();
	let root, canvas, renderer, frame, generation = 0;
	const enabled = () => lib.config?.animation !== false && !env.document?.hidden;
	function initialize() {
		if (renderer) return renderer;
		root = env.document.createElement('div'); root.className = 'hh-source-chain-effects'; root.setAttribute('aria-hidden', 'true');
		Object.assign(root.style, { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '90', overflow: 'hidden' });
		canvas = env.document.createElement('canvas'); root.appendChild(canvas);
		Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' });
		canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); stop(); cache.clear(); renderer = null; });
		return renderer = env.createRenderer(canvas);
	}
	async function preload(name, action) {
		if (cache.has(name)) return cache.get(name);
		if (pending.has(name)) return pending.get(name);
		const job = (async () => {
			const owner = initialize(), folder = path + name + '/';
			const [spine, atlasText, bytes] = await Promise.all([env.loadSpine(), env.readText(folder + name + '.atlas.txt'), env.readBinary(folder + name + '.skel')]);
			const atlas = new spine.TextureAtlas(atlasText);
			const images = Object.fromEntries(await Promise.all(atlas.pages.map(async page => [page.name, await env.loadImage(folder + page.name)])));
			const model = decodeKillCombo(spine, { name, action }, atlasText, bytes, images);
			if (owner !== renderer) return null;
			owner.upload(model); cache.set(name, model); return model;
		})();
		pending.set(name, job);
		try { return await job; } finally { pending.delete(name); }
	}
	function remove(record) {
		env.clearTimer(record.timer);
		record.resolveFinished?.();
		record.player.classList?.remove('hh-source-chain');
		if (records.get(record.player) === record) records.delete(record.player);
		if (!records.size) { env.cancelFrame(frame); frame = undefined; root?.remove(); }
	}
	function tick(time) {
		frame = undefined;
		if (!enabled()) { stop(); return; }
		let clear = true;
		for (const record of [...records.values()]) {
			const { player, model } = record;
			if (player.isConnected === false || player.classList?.contains('dead')) { remove(record); continue; }
			if (!model) continue;
			const placement = chainPlacement(canvas.getBoundingClientRect(), player.getBoundingClientRect?.());
			if (!placement) { remove(record); continue; }
			const elapsed = Math.max(0, (time - record.start) / 1000) * (chainAssets[record.stage].speed || 1);
			if (record.stage !== 'stay' && elapsed >= model.animation.duration) { remove(record); continue; }
			try { renderer.draw(model, record.stage === 'stay' ? 0 : elapsed, { ...placement, clear, holdLastFrame: record.stage === 'stay' }); clear = false; }
			catch (error) { console.warn('[HH优化] 铁索动画绘制失败', error); remove(record); }
		}
		if (clear) renderer?.gl?.clear(renderer.gl.COLOR_BUFFER_BIT);
		if ([...records.values()].some(record => record.model) && frame === undefined) frame = env.requestFrame(tick);
	}
	function playSound(stage) {
		if (env.document?.hidden || lib.config?.background_audio === false) return;
		const fallback = () => { if (stage !== 'cast') return game.playAudio?.('effect', stage === 'enter' ? 'link' : 'link_clear'); };
		if (lib.config?.extension_HH优化_enable_audio_replace === false) return fallback();
		let failed = false;
		const onError = () => { if (!failed) { failed = true; fallback(); } };
		try { return game.playAudio?.({ path: 'ext:HH优化/assets/chain-effects/' + sounds[stage] + '.mp3', onError }); }
		catch { onError(); }
	}
	async function show(record) {
		const token = generation, asset = chainAssets[record.stage];
		try {
			const base = await preload(asset.name, asset.action);
			if (!base || token !== generation || records.get(record.player) !== record || !enabled() || record.player.isConnected === false) {
				if (records.get(record.player) === record) remove(record);
				return false;
			}
			const animation = base.data.findAnimation(asset.action);
			if (!animation) throw Error('铁索动画动作缺失：' + asset.action);
			record.model = { ...base, animation, skeleton: new base.spine.Skeleton(base.data) }; record.start = env.now();
			record.player.classList?.add('hh-source-chain');
			(ui.window || env.document.body).appendChild(root);
			if (record.stage === 'enter') record.timer = env.setTimer(() => {
				if (records.get(record.player) !== record) return;
				record.stage = 'stay'; record.model.animation = base.data.findAnimation(chainAssets.stay.action); record.start = env.now();
			}, 1800);
			else if (record.stage !== 'stay') record.timer = env.setTimer(() => remove(record), animation.duration * 1000 + 100);
			if (frame === undefined) frame = env.requestFrame(tick);
			return true;
		} catch (error) {
			if (records.get(record.player) === record) remove(record);
			console.warn('[HH优化] 铁索动画加载失败，保留原连环标记', error); return false;
		}
	}
	function setLinked(player, linked, nature = '', { silent = false, restore = false } = {}) {
		const previous = records.get(player);
		if (previous) remove(previous);
		if (!silent) playSound(linked ? 'enter' : ['fire', 'thunder', 'ice'].includes(nature) ? 'break' : 'clear');
		if (!enabled() || player.isConnected === false) return Promise.resolve(false);
		const stage = linked ? restore ? 'stay' : 'enter' : ['fire', 'thunder', 'ice'].includes(nature) ? nature : 'clear';
		const record = { player, linked, stage };
		record.finished = new Promise(resolve => { record.resolveFinished = resolve; });
		records.set(player, record);
		return show(record);
	}
	function waitForBreak(player) {
		const record = records.get(player);
		return record && ['fire', 'thunder', 'ice'].includes(record.stage) ? record.finished : Promise.resolve();
	}
	function stop() { generation++; for (const record of [...records.values()]) remove(record); root?.remove(); }
	function restore() {
		for (const player of game.players || []) if (player.isLinked?.() && !records.has(player)) setLinked(player, true, '', { silent: true, restore: true });
	}
	env.document?.addEventListener?.('visibilitychange', () => { if (env.document.hidden) stop(); else restore(); });
	return { setLinked, waitForBreak, stop, restore, playCast: () => playSound('cast'),
		get diagnostics() { return { active: records.size, cached: cache.size, pending: pending.size }; },
	};
}

export function setupSourceChainEffects(context, environment) {
	const { lib, game, ui, get } = context;
	if (game.hhChainEffects) return game.hhChainEffects;
	const manager = game.hhChainEffects = createSourceChainEffects(context, environment);
	lib.onover?.push(() => manager.stop());
	lib.arenaReady?.push(() => manager.restore());
	// Preserve native state, logs, video format and UI updates. Pass the break
	// reason with the state broadcast so every client plays the same effect.
	lib.element.content.link = async function (event, trigger, player) {
		const isLinked = player.isLinked(), nature = chainDamageNature(event, player);
		game.log(player, `${isLinked ? '解除' : '被'}连环`);
		game.broadcastAll((player, isLinked, nature) => {
			player.classList.remove('target');
			player.classList.toggle(get.is.linked2(player) ? 'linked2' : 'linked');
			ui.updatej(player); ui.updatem(player);
			if (game.hhChainEffects) game.hhChainEffects.setLinked(player, !isLinked, nature);
			else if (lib.config.background_audio) game.playAudio('effect', `link${isLinked ? '_clear' : ''}`);
		}, player, isLinked, nature);
		if (nature) game.addVideo('hhChainNature', player, nature);
		game.addVideo('link', player, player.isLinked());
		// This link is a child of changeHp. Holding only its elemental break
		// keeps the native damage/chain loop sequential, including its triggers,
		// dying checks and skipped targets. Never queue already-settled damage.
		if (nature) await manager.waitForBreak(player);
	};
	const replay = game.videoContent?.link;
	if (replay) {
		const reasons = new WeakMap();
		game.videoContent.hhChainNature = (player, nature) => { if (player?.classList) reasons.set(player, nature); };
		game.videoContent.link = function (player, linked) {
			const result = replay.apply(this, arguments);
			if (player?.classList) {
				manager.setLinked(player, linked, reasons.get(player) || '', { silent: true });
				reasons.delete(player);
			}
			return result;
		};
	}
	manager.restore();
	return manager;
}
