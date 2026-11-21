import { decodeKillCombo, KillComboRenderer, loadSpine4Runtime, readSpine4Asset, loadSpine4Image } from './killCombo.js';

export const damageAssets = ['EF_Basic_Sha_03_WD', 'EF_Basic_Sha_03_2_WD', 'EF_Basic_Sha_03_3_WD', 'EF_Basic_Sha_03_huo', 'EF_Basic_Sha_03_lei', 'EF_Basic_Sha_03_bing', 'baojishuzhi'];

// AMt.playHurtShaEffect and playBaojiHurtEffect in the original client.
export function damageEffectName(num, nature) {
	const natures = Array.isArray(nature) ? nature : String(nature || '').split(/[|,+ ]/);
	if (natures.includes('fire')) return damageAssets[3];
	if (natures.includes('thunder')) return damageAssets[4];
	if (natures.includes('ice')) return damageAssets[5];
	return damageAssets[num === 1 ? 0 : num < 4 ? 1 : 2];
}

export function damageNumberAction(num) {
	return num <= 3 ? 'play' : num <= 9 ? 'play2' : num <= 99 ? 'play3' : 'play4';
}

export function damagePlacement(canvas, player) {
	if (!(player?.width > 0 && player?.height > 0)) return null;
	return { x: player.left - canvas.left + player.width / 2, y: player.top - canvas.top + player.height / 2, scale: Math.min(player.width / 174, player.height / 232) };
}

// Keep each hit's skin private: overlapping numbers must never overwrite each other.
export function createDamageNumberModel(base, num, digits) {
	const { spine, data } = base;
	const skeleton = new spine.Skeleton(data), skin = new spine.Skin('damage-' + num);
	skin.addSkin(data.defaultSkin);
	const values = String(num).split('').map(Number);
	const pairs = values.length === 1 ? [[3, 7]] : values.length === 2 ? [[3, 7], [4, 8]] : [[3, 7], [4, 8], [5, 9]];
	for (let i = 0; i < pairs.length; i++) for (const slotIndex of pairs[i]) {
		for (const entry of data.defaultSkin.getAttachments().filter(item => item.slotIndex === slotIndex)) {
			const attachment = entry.attachment.copy();
			attachment.setRegion(digits.findRegion('baoji_' + values[i]));
			attachment.width = 50; attachment.height = 70; attachment.updateOffset();
			skin.setAttachment(slotIndex, entry.name, attachment);
		}
	}
	skeleton.setSkin(skin);
	return { ...base, skeleton, animation: data.findAnimation(damageNumberAction(num)) };
}

export function createSourceDamageEffects({ lib, ui }, environment = {}) {
	const env = {
		document: globalThis.document, loadSpine: loadSpine4Runtime,
		readText: url => readSpine4Asset(url, false), readBinary: url => readSpine4Asset(url, true), loadImage: loadSpine4Image,
		createRenderer: canvas => new KillComboRenderer(canvas), now: () => performance.now(),
		requestFrame: fn => requestAnimationFrame(fn), cancelFrame: id => cancelAnimationFrame(id),
		setTimer: (fn, ms) => setTimeout(fn, ms), clearTimer: id => clearTimeout(id), ...environment,
	};
	const path = `${lib.assetURL || ''}extension/HH优化/assets/damage-effects/`;
	const cache = new Map(), pending = new Map(), active = new Set(), waits = new Set(), shakes = new Map();
	let root, canvas, renderer, frame, generation = 0;
	const enabled = () => lib.config?.animation !== false && !env.document?.hidden;
	function initialize() {
		if (renderer) return renderer;
		root = env.document.createElement('div'); root.className = 'hh-source-damage-effects'; root.setAttribute('aria-hidden', 'true');
		Object.assign(root.style, { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '100', overflow: 'hidden' });
		canvas = env.document.createElement('canvas'); root.appendChild(canvas);
		Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' });
		canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); stop(); cache.clear(); renderer = null; });
		return renderer = env.createRenderer(canvas);
	}
	async function preload(name) {
		if (cache.has(name)) return cache.get(name);
		if (pending.has(name)) return pending.get(name);
		const job = (async () => {
			const owner = initialize(), folder = path + name + '/';
			const [spine, atlasText, bytes] = await Promise.all([env.loadSpine(), env.readText(folder + name + '.atlas.txt'), env.readBinary(folder + name + '.skel')]);
			const atlas = new spine.TextureAtlas(atlasText);
			const pages = await Promise.all(atlas.pages.map(async page => [page.name, await env.loadImage(folder + page.name)]));
			const images = Object.fromEntries(pages);
			const model = decodeKillCombo(spine, { name }, atlasText, bytes, images);
			if (name === 'baojishuzhi') {
				const [text, image] = await Promise.all([env.readText(path + 'digits.atlas.txt'), env.loadImage(path + 'digits.png')]);
				model.digits = new spine.TextureAtlas(text);
				model.digits.pages[0].setTexture({ setFilters() {}, setWraps() {}, getImage: () => image });
				model.images['digits.png'] = image;
			}
			if (renderer !== owner) return null;
			owner.upload(model); cache.set(name, model); return model;
		})();
		pending.set(name, job);
		try { return await job; } finally { pending.delete(name); }
	}
	function finish(instance) {
		if (!active.delete(instance)) return;
		env.clearTimer(instance.timer);
		instance.node?.remove();
		if (!active.size) { env.cancelFrame(frame); frame = undefined; root?.remove(); }
	}
	function tick(time) {
		frame = undefined;
		let clear = true;
		for (const instance of [...active]) {
			if (!instance.model) continue;
			const elapsed = Math.max(0, (time - instance.start) / 1000);
			const placement = damagePlacement(canvas.getBoundingClientRect(), instance.player.getBoundingClientRect?.());
			if (!enabled() || instance.player.isConnected === false || !placement || elapsed >= instance.model.animation.duration) { finish(instance); continue; }
			try { renderer.draw(instance.model, elapsed, { ...placement, clear }); clear = false; }
			catch (error) { console.warn('[HH优化] 伤害动画绘制失败', error); finish(instance); }
		}
		if (clear) renderer?.gl?.clear(renderer.gl.COLOR_BUFFER_BIT);
		if ([...active].some(instance => instance.model)) frame = env.requestFrame(tick);
	}
	function fallbackNumber(player, num) {
		if (!env.document?.createElement || player.isConnected === false) return false;
		const node = env.document.createElement('div'); node.className = 'hh-source-damage-number'; node.textContent = '-' + num;
		Object.assign(node.style, { position: 'absolute', left: '55%', top: '45%', color: '#eb4024', font: 'bold 40px KaiTi,serif', textShadow: '0 1px 3px #311', pointerEvents: 'none', zIndex: '100' });
		player.appendChild(node);
		const instance = { node }; active.add(instance); instance.timer = env.setTimer(() => finish(instance), 734);
		return true;
	}
	async function playAsset(name, player, num, token = generation) {
		if (!enabled() || !player || player.isConnected === false) return false;
		try {
			const base = await preload(name);
			if (!base || token !== generation || !enabled() || player.isConnected === false) return false;
			const model = num ? createDamageNumberModel(base, num, base.digits) : { ...base, skeleton: new base.spine.Skeleton(base.data) };
			const instance = { model, player, start: env.now() }; active.add(instance);
			while (active.size > 32) finish(active.values().next().value);
			instance.timer = env.setTimer(() => finish(instance), model.animation.duration * 1000 + 100);
			(ui.window || env.document.body).appendChild(root);
			if (frame === undefined) frame = env.requestFrame(tick);
			return true;
		} catch (error) {
			console.warn('[HH优化] 原版伤害动画加载失败', error);
			return token === generation && enabled() && num ? fallbackNumber(player, num) : false;
		}
	}
	function shake(player, num) {
		if (lib.config?.damage_shake === false || !player.animate) return;
		shakes.get(player)?.cancel();
		const width = player.getBoundingClientRect?.().width || 174, distance = (num > 1 ? 50 : 32) * width / 174;
		const motion = player.animate([{ translate: '0px', easing: 'cubic-bezier(.47,0,.745,.715)' }, { translate: `${-distance}px`, offset: .5, easing: 'cubic-bezier(.47,0,.745,.715)' }, { translate: '0px' }], { duration: 160 });
		shakes.set(player, motion); motion.onfinish = () => { if (shakes.get(player) === motion) shakes.delete(player); };
	}
	function number(player, num, token = generation) {
		if (!(num > 1) || !enabled() || !player || player.isConnected === false) return Promise.resolve(false);
		return Number.isInteger(num) && num <= 999 ? playAsset('baojishuzhi', player, num, token) : Promise.resolve(fallbackNumber(player, num));
	}
	function play(player, num, nature, { number: showNumber = true } = {}) {
		if (!(num > 0) || !enabled() || !player || player.isConnected === false) return false;
		const token = generation;
		if (showNumber && Number.isInteger(num) && num > 1 && num <= 999) preload('baojishuzhi').catch(() => {});
		// Start both parts from the same loaded hit, including the first uncached hit.
		playAsset(damageEffectName(num, nature), player, undefined, token).then(() => {
			if (token !== generation || !enabled() || player.isConnected === false) return;
			const timer = env.setTimer(() => {
				waits.delete(timer);
				if (token !== generation || !enabled() || player.isConnected === false) return;
				shake(player, num); if (showNumber) number(player, num, token);
			}, nature === 'thunder' && num >= 2 && num <= 3 ? 160 : 180);
			waits.add(timer);
		});
		return true;
	}
	function stop() {
		generation++;
		for (const timer of waits) env.clearTimer(timer); waits.clear();
		for (const instance of [...active]) finish(instance);
		for (const motion of shakes.values()) motion.cancel(); shakes.clear();
		root?.remove();
	}
	lib.onover?.push(stop);
	env.document?.addEventListener?.('visibilitychange', () => { if (env.document.hidden) stop(); });
	lib.arenaReady?.push(() => { for (const name of [damageAssets[0], 'baojishuzhi']) preload(name).catch(() => {}); });
	return { play, number, preload, stop, get diagnostics() { return { active: active.size, pending: pending.size, cached: cache.size, waits: waits.size, shakes: shakes.size }; } };
}

export function setupSourceDamageEffects(context) {
	return context.game.hhDamageEffects ||= createSourceDamageEffects(context);
}
