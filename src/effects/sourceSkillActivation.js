import { decodeKillCombo, KillComboRenderer, loadSpine4Runtime, readSpine4Asset, loadSpine4Image } from './killCombo.js';

export const activationAssets = ['xiyou_jineng', 'shishi_jineng', 'chuanshuo_jineng', 'xianding_jineng'];

export function setupActivationReplay({ game }, effect = () => globalThis.decadeUI?.effect) {
	if (!game.videoContent) return;
	game.videoContent.hhSkillActivation = (player, content) => {
		if (!player || !Array.isArray(content)) return;
		const [name, , color, avatar, skill] = content;
		if (effect()?.skill) return effect().skill(player, name, avatar, skill);
		return player.$fullscreenpop?.(name, color, avatar);
	};
}

export function activationKind(info) {
	return info?.juexingji ? 'awakening' : info?.limited ? 'limited' : null;
}

export function resolveActivationSkill({ lib, get, _status }, player, name, skill) {
	const candidates = [skill, _status?.event?.skill, ...(player.getSkills?.(null, false, false) || []), ...(player.hiddenSkills || [])];
	return candidates.find(id => {
		const info = lib.skill[id];
		return activationKind(info) && (id === skill || info.animationStr === name || lib.translate[id] === name || get?.translation?.(id) === name);
	});
}

// The original client chooses the skeleton by skin quality, then play/play2 by skill type.
export function activationAsset(rarity) {
	return activationAssets[({ epic: 1, legend: 2, limited: 3 })[rarity] ?? 0];
}

export function createActivationModel(base, kind, images) {
	const { spine, data } = base, skin = new spine.Skin('activation');
	skin.copySkin(data.defaultSkin);
	for (const [slotName, image] of Object.entries(images)) {
		const index = data.findSlot(slotName)?.index;
		if (index === undefined) continue;
		for (const entry of skin.getAttachments().filter(item => item.slotIndex === index)) {
			const attachment = entry.attachment;
			if (!(attachment instanceof spine.RegionAttachment)) continue;
			const region = new spine.TextureAtlasRegion();
			region.page = { name: slotName, width: image.width, height: image.height };
			Object.assign(region, { u: 0, v: 0, u2: 1, v2: 1, width: image.width, height: image.height,
				originalWidth: image.width, originalHeight: image.height, offsetX: 0, offsetY: 0, degrees: 0 });
			if (slotName !== '1_4xianding') {
				// Local skill names have varying lengths; place them on the native banner beside the portrait.
				attachment.width = 900; attachment.height = 200;
				attachment.x = kind === 'limited' ? 600 : -600; attachment.y = -140;
			}
			attachment.setRegion(region); attachment.updateOffset();
		}
	}
	const skeleton = new spine.Skeleton(data); skeleton.setSkin(skin);
	return { ...base, skeleton, images, textures: {}, animation: data.findAnimation(kind === 'limited' ? 'play2' : 'play') };
}

export function createSourceSkillActivation({ lib, game, ui }, environment = {}) {
	const env = {
		document: globalThis.document, loadSpine: loadSpine4Runtime,
		readText: url => readSpine4Asset(url, false), readBinary: url => readSpine4Asset(url, true), loadImage: loadSpine4Image,
		createRenderer: canvas => new KillComboRenderer(canvas), now: () => performance.now(),
		requestFrame: fn => requestAnimationFrame(fn), cancelFrame: id => cancelAnimationFrame(id),
		setTimer: (fn, ms) => setTimeout(fn, ms), clearTimer: id => clearTimeout(id), ...environment,
	};
	const path = `${lib.assetURL || ''}extension/HH优化/assets/skill-activation/`;
	const cache = new Map(), pending = new Map(), active = new Set();
	let renderer, root, canvas, frame, generation = 0;
	let fontReady;
	const enabled = () => !env.document?.hidden && lib.config?.animation !== false;
	function initialize() {
		if (renderer) return renderer;
		root = env.document.createElement('div'); root.className = 'hh-skill-activation';
		root.setAttribute('aria-hidden', 'true');
		Object.assign(root.style, { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '100', overflow: 'hidden' });
		canvas = env.document.createElement('canvas'); root.appendChild(canvas);
		Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' });
		canvas.addEventListener('webglcontextlost', event => {
			event.preventDefault(); stop(); cache.clear(); renderer = null;
		});
		return renderer = env.createRenderer(canvas);
	}
	async function preload(name = activationAssets[0]) {
		if (!activationAssets.includes(name)) return null;
		if (cache.has(name)) return cache.get(name);
		if (pending.has(name)) return pending.get(name);
		const job = (async () => {
			const owner = initialize();
			const [spine, atlas, bytes, image] = await Promise.all([
				env.loadSpine(), env.readText(path + name + '.atlas.txt'), env.readBinary(path + name + '.skel'), env.loadImage(path + name + '.png'),
			]);
			if (owner !== renderer) return null;
			const model = decodeKillCombo(spine, { action: 'play' }, atlas, bytes, { [name + '.png']: image });
			owner.upload(model); cache.set(name, model);
			return model;
		})();
		pending.set(name, job);
		try { return await job; }
		catch (error) { console.warn('[HH优化] 觉醒/限定技资源加载失败', error); return null; }
		finally { pending.delete(name); }
	}
	function finish(instance) {
		if (!active.delete(instance)) return;
		env.clearTimer(instance.timer); instance.owner.release(instance.dynamic);
		if (!active.size) { env.cancelFrame(frame); frame = undefined; root?.remove(); }
	}
	function stop() { generation++; for (const instance of [...active]) finish(instance); }
	function tick(now) {
		frame = undefined;
		const rect = canvas.getBoundingClientRect();
		let clear = true;
		for (const instance of [...active]) {
			const elapsed = Math.max(0, (now - instance.start) / 1000);
			if (elapsed >= instance.model.animation.duration) { finish(instance); continue; }
			try {
				renderer.draw(instance.model, elapsed, { clear, scale: Math.min(rect.width / 1920, rect.height / 1080), x: rect.width / 2, y: rect.height / 2 });
				clear = false;
			} catch (error) { console.warn('[HH优化] 觉醒/限定技绘制失败', error); finish(instance); }
		}
		if (active.size) frame = env.requestFrame(tick);
	}
	function portraitTexture(image) {
		const result = env.document.createElement('canvas'); result.width = result.height = 512;
		const ctx = result.getContext('2d'), size = Math.min(image.width, image.height);
		ctx.beginPath(); ctx.arc(256, 256, 252, 0, Math.PI * 2); ctx.clip();
		ctx.drawImage(image, (image.width - size) / 2, (image.height - size) / 2, size, size, 0, 0, 512, 512);
		return result;
	}
	function textTexture(value) {
		const result = env.document.createElement('canvas'); result.width = 1024; result.height = 256;
		const ctx = result.getContext('2d'), text = String(value).replace(/<[^>]*>/g, '').trim();
		const size = Math.min(180, 960 / Math.max(2, Array.from(text).length));
		ctx.font = `${size}px hh-activation-font,STKaiti,KaiTi,serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
		ctx.strokeStyle = '#231108'; ctx.lineWidth = 5; ctx.strokeText(text, 512, 128, 980);
		const gradient = ctx.createLinearGradient(0, 40, 0, 210);
		gradient.addColorStop(0, '#fff8dc'); gradient.addColorStop(.5, '#ffe7a2'); gradient.addColorStop(1, '#ce8f3a');
		ctx.fillStyle = gradient; ctx.fillText(text, 512, 128, 980);
		return result;
	}
	async function play(player, name, kind, image, rarity = 'rare') {
		if (!enabled() || !player || player.isConnected === false) return false;
		if (!fontReady) {
			const doc = env.document;
			if (!doc.getElementById?.('hh-activation-font')) {
				const style = doc.createElement('style'); style.id = 'hh-activation-font';
				style.textContent = `@font-face{font-family:hh-activation-font;src:url("${lib.assetURL || ''}extension/HH优化/assets/skill-popup/HYF3GJM.woff2") format("woff2");font-display:swap}`;
				(doc.head || doc.body).appendChild(style);
			}
			fontReady = Promise.resolve(doc.fonts?.load('100px hh-activation-font')).catch(() => {});
		}
		const token = generation, [base] = await Promise.all([preload(activationAsset(rarity)), fontReady]);
		if (!base || token !== generation || !enabled()) return false;
		try {
			const images = { '1_4xianding': portraitTexture(image), [kind === 'limited' ? '1_7xiandingzi' : '1_5juexingzi']: textTexture(name) };
			const model = createActivationModel(base, kind, images), owner = renderer;
			owner.upload(model);
			const dynamic = { textures: model.textures }; model.textures = { ...base.textures, ...model.textures };
			const instance = { model, dynamic, owner, start: env.now() };
			active.add(instance); (ui.window || env.document.body).appendChild(root);
			instance.timer = env.setTimer(() => finish(instance), model.animation.duration * 1000 + 80);
			if (frame === undefined) frame = env.requestFrame(tick);
			return true;
		} catch (error) { console.warn('[HH优化] 觉醒/限定技播放失败', error); return false; }
	}
	lib.onover?.push(stop);
	env.document?.addEventListener?.('visibilitychange', () => { if (env.document.hidden) stop(); });
	return { preload, play, stop, get generation() { return generation; }, get activeCount() { return active.size; } };
}
