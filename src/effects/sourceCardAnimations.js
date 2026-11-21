import { sourceCards, sourceCardAssets, sourceCardNatures, sourceCardSkills, sourceCardHits } from './sourceCardAssets.js';
import { decodeKillCombo, KillComboRenderer, loadSpine4Runtime, readSpine4Asset, loadSpine4Image } from './killCombo.js';

const cardMap = new Map(sourceCards.map(card => [card.name, card]));
const assetMap = new Map(sourceCardAssets.map(asset => [asset.id, asset]));
const trickCards = new Set(['nanman', 'wugu', 'taoyuan', 'huogong', 'wuzhong', 'juedou', 'jiedao', 'wuxie', 'tiesuo', 'shunshou', 'guohe', 'wanjian']);
const screenCards = new Set(['nanman', 'wugu', 'taoyuan', 'huogong']);
const delayedCards = new Set(['lebu', 'bingliang', 'shandian']);
const silentCastCards = new Set([...delayedCards, 'shunshou', 'guohe', 'wanjian']);
const equipmentCards = new Set(sourceCards.filter(card => card.effect.startsWith('EF_Equip_')).map(card => card.name));

// Keep lazy fallback loading available, but do not preload superseded 3.8 card effects.
export const replacedCardEffectNames = new Set([
	'effect_tao', 'effect_jiu',
	'effect_wugufengdeng', 'effect_taoyuanjieyi', 'SF_kapai_eff_taoyuanjieyi', 'effect_nanmanruqin',
	'effect_wanjianqifa_full', 'effect_wanjianqifa', 'effect_wuzhongshengyou', 'effect_wuxiekeji',
	'effect_shunshouqianyang', 'effect_guohechaiqiao', 'effect_huogong', 'effect_tiesuolianhuan',
	'effect_lebusishu', 'effect_bingliangcunduan', 'effect_shandian', 'effect_baguazhen', 'effect_baiyinshizi',
	'effect_cixiongshuanggujian', 'effect_fangtianhuaji', 'effect_guanshifu', 'effect_gudingdao',
	'effect_hanbingjian', 'effect_qilingong', 'effect_qinggangjian', 'effect_qinglongyanyuedao',
	'effect_renwangdun', 'effect_tengjiafangyu', 'effect_tengjiaranshao', 'effect_zhangbashemao',
	'effect_zhugeliannu', 'effect_zhuqueyushan',
]);

export function sourceShaNature(card, get) {
	const value = get?.nature ? get.nature(card) : card?.nature;
	const natures = Array.isArray(value) ? value : String(value || '').split(/[|,+ ]/);
	return ['fire', 'thunder', 'ice'].find(nature => natures.includes(nature)) || '';
}

export function sourceCardEffect(card, get) {
	const entry = cardMap.get(card?.name);
	if (!entry) return null;
	// Keep the original Sha (normal/fire/thunder) and Shan effects. Ice Sha
	// remains on the imported animation, as do the other cards.
	if (card.name === 'shan' || (card.name === 'sha' && sourceShaNature(card, get) !== 'ice')) return null;
	return card.name === 'sha' ? sourceCardNatures[sourceShaNature(card, get)] || entry.effect : entry.effect;
}

export function sourceCardPlacement(metadata, canvasRect, anchorRect, screen = false, { size = 1, centerOnAnchor = false } = {}) {
	const [left, bottom, right, top] = metadata.bounds;
	const width = Math.max(1, right - left), height = Math.max(1, top - bottom);
	const centerX = (left + right) / 2, centerY = (bottom + top) / 2;
	const box = screen ? { left: canvasRect.left, top: canvasRect.top, width: canvasRect.width, height: canvasRect.height } : anchorRect;
	if (!box || !box.width || !box.height) return null;
	const widthFactor = screen === 'center' ? .64 : screen ? .92 : 1.8;
	const heightFactor = screen === 'center' ? .66 : screen ? .82 : 1.35;
	const scale = Math.min(box.width * widthFactor / width, box.height * heightFactor / height) * size;
	const center = centerOnAnchor && anchorRect ? anchorRect : box;
	return {
		x: center.left - canvasRect.left + center.width / 2 - centerX * scale,
		y: center.top - canvasRect.top + center.height / 2 + centerY * scale,
		scale,
	};
}

export function createSourceCardPlayer({ lib, game, ui, get }, environment = {}) {
	const env = {
		document: globalThis.document, loadSpine: loadSpine4Runtime,
		readText: url => readSpine4Asset(url, false), readBinary: url => readSpine4Asset(url, true), loadImage: loadSpine4Image,
		createRenderer: canvas => new KillComboRenderer(canvas), now: () => performance.now(),
		requestFrame: callback => requestAnimationFrame(callback), cancelFrame: id => cancelAnimationFrame(id),
		setTimer: (callback, ms) => setTimeout(callback, ms), clearTimer: id => clearTimeout(id), ...environment,
	};
	const cache = new Map(), pending = new Map(), failed = new Set(), eventPlays = new WeakMap();
	const eventAnchors = new WeakMap(), actorAnchors = new WeakMap();
	const active = new Set();
	let root, canvas, renderer, frame, generation = 0, graphicsFailed = false;
	const rootPath = `${lib.assetURL || ''}extension/HH优化/assets/card-effects/`;
	const pixelBudget = 16 * 1024 * 1024;
	const enabled = () => lib.config?.animation !== false && !graphicsFailed && !env.document?.hidden;
	function cardKey(card) {
		return card.cardid || card.cards?.map(item => item.cardid).filter(Boolean).sort().join(',') || card.name;
	}
	function usedCardAnchor(actor, card, event, cardNode) {
		let record = event && eventAnchors.get(event);
		if (!record) {
			record = { node: cardNode, lastRect: null };
			record.anchor = { getBoundingClientRect() {
				const rect = record.node?.isConnected !== false && record.node?.getBoundingClientRect?.();
				if (rect?.width > 0 && rect?.height > 0) record.lastRect = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
				if (record.lastRect) return record.lastRect;
				const area = (ui.arena || ui.window || env.document.body).getBoundingClientRect();
				const width = Math.min(130, area.width * .12), height = width * 1.4;
				return { left: area.left + (area.width - width) / 2, top: area.top + (area.height - height) / 2, width, height };
			} };
			if (event) eventAnchors.set(event, record);
		}
		if (cardNode) record.node = cardNode;
		if (actor && card.name === 'shunshou') {
			let entries = actorAnchors.get(actor);
			if (!entries) actorAnchors.set(actor, entries = new Map());
			entries.set(cardKey(card), record);
			while (entries.size > 16) entries.delete(entries.keys().next().value);
		}
		return record.anchor;
	}
	function initialize() {
		if (renderer) return renderer;
		root = env.document.createElement('div'); root.className = 'hh-source-card-effects'; root.setAttribute('aria-hidden', 'true');
		Object.assign(root.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '98', overflow: 'hidden' });
		canvas = env.document.createElement('canvas'); root.appendChild(canvas);
		Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' });
		canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); stop(); cache.clear(); renderer = null; });
		try { return renderer = env.createRenderer(canvas); }
		catch (error) { graphicsFailed = true; throw error; }
	}
	function trim(except) {
		let pixels = [...cache.values()].reduce((sum, model) => sum + model.pixels, 0);
		const used = new Set([...active].map(instance => instance.base));
		for (const [id, model] of cache) {
			if (cache.size <= 6 && pixels <= pixelBudget) break;
			if (id !== except && !used.has(model)) { renderer.release(model); cache.delete(id); pixels -= model.pixels; }
		}
	}
	async function preload(id) {
		if (!assetMap.has(id) || failed.has(id)) return null;
		if (cache.has(id)) { const model = cache.get(id); cache.delete(id); cache.set(id, model); return model; }
		if (pending.has(id)) return pending.get(id);
		const job = (async () => {
			const owner = initialize(), metadata = assetMap.get(id), path = rootPath + metadata.folder + '/';
			const [spine, atlas, bytes, pages] = await Promise.all([
				env.loadSpine(), env.readText(path + metadata.name + '.atlas.txt'), env.readBinary(path + metadata.name + '.skel'),
				Promise.all(metadata.pages.map(async name => [name, await env.loadImage(path + name)])),
			]);
			if (owner !== renderer) return null;
			const model = decodeKillCombo(spine, metadata, atlas, bytes, Object.fromEntries(pages));
			model.pixels = pages.reduce((sum, [, image]) => sum + image.width * image.height, 0);
			owner.upload(model); cache.set(id, model); trim(id); return model;
		})();
		pending.set(id, job);
		try { return await job; }
		catch (error) { failed.add(id); console.warn(`[HH优化] 卡牌动画加载失败：${id}，使用原有效果`, error); return null; }
		finally { pending.delete(id); }
	}
	function finish(instance) {
		if (!active.delete(instance)) return;
		env.clearTimer(instance.timer);
		if (!active.size) { env.cancelFrame(frame); frame = undefined; root?.remove(); }
		trim();
	}
	function tick(now) {
		frame = undefined;
		let first = true;
		for (const instance of [...active]) {
			const elapsed = Math.max(0, (now - instance.start) / 1000);
			if (elapsed >= instance.model.animation.duration || (!instance.screen && instance.anchor?.isConnected === false)) { finish(instance); continue; }
			const placement = sourceCardPlacement(instance.model.metadata, canvas.getBoundingClientRect(), instance.anchor?.getBoundingClientRect?.(), instance.screen, instance);
			if (!placement) { finish(instance); continue; }
			try { renderer.draw(instance.model, elapsed, { ...placement, clear: first }); first = false; }
			catch (error) { console.warn('[HH优化] 卡牌动画绘制失败', error); finish(instance); }
		}
		if (active.size && frame === undefined) frame = env.requestFrame(tick);
	}
	async function playAsset(id, anchor, { screen = false, token = generation, size = 1, centerOnAnchor = false } = {}) {
		if (!enabled()) return false;
		const base = await preload(id);
		if (!base || token !== generation || !enabled() || (!screen && anchor?.isConnected === false)) return false;
		// A pending concurrent load can outlive another request's cache eviction.
		if (!Object.keys(base.textures).length) { renderer.upload(base); cache.set(id, base); }
		const model = { ...base, skeleton: new base.spine.Skeleton(base.data) };
		const instance = { model, base, anchor, screen, size, centerOnAnchor, start: env.now() };
		active.add(instance);
		while (active.size > 24) finish(active.values().next().value);
		instance.timer = env.setTimer(() => finish(instance), model.animation.duration * 1000 + 150);
		(ui.window || env.document.body).appendChild(root);
		if (frame === undefined) frame = env.requestFrame(tick);
		trim(); return true;
	}
	function stop() { generation++; for (const instance of [...active]) finish(instance); root?.remove(); }
	function playCard(actor, card, { event, cardNode, onFallback } = {}) {
		// Bind the displayed card before deduplication: tryCardAnimate can precede
		// the clone hook, and the effect must follow the card once it is laid out.
		const anchor = trickCards.has(card?.name) ? usedCardAnchor(actor, card, event, cardNode) : actor;
		if (silentCastCards.has(card?.name)) return true;
		const id = sourceCardEffect(card, get);
		if (!id || !enabled() || failed.has(id)) return false;
		const token = generation;
		const ownEvent = event && ['useCard', 'respond'].includes(event.name) && event.player === actor && event.card?.name === card.name;
		if (ownEvent) {
			let seen = eventPlays.get(event);
			if (!seen) eventPlays.set(event, seen = new Set());
			const key = card.name + ':' + sourceShaNature(card, get);
			if (seen.has(key)) return true;
			seen.add(key);
		}
		const screen = screenCards.has(card.name) ? (card.name === 'huogong' ? 'center' : true) : false;
		const size = card.name === 'huogong' ? .8 : (card.name === 'juedou' || card.name === 'wuxie') ? 1.6 : 1;
		playAsset(id, anchor, { screen, token, size, centerOnAnchor: trickCards.has(card.name) }).then(success => { if (token === generation && !success) onFallback?.(); }).catch(error => { console.warn('[HH优化] 卡牌动画播放失败', error); if (token === generation) onFallback?.(); });
		return true;
	}
	function playSkill(actor, name, { onFallback } = {}) {
		const id = sourceCardSkills[name];
		if (!id || !enabled() || failed.has(id)) return false;
		const token = generation;
		playAsset(id, actor, { token }).then(success => { if (!success && token === generation) onFallback?.(); }).catch(error => { console.warn('[HH优化] 装备动画播放失败', error); if (token === generation) onFallback?.(); });
		return true;
	}
	env.document?.addEventListener?.('visibilitychange', () => { if (env.document.hidden) stop(); });
	return {
		handles(card) {
			if (typeof card === 'string') card = { name: card };
			if (silentCastCards.has(card?.name)) return true;
			const id = sourceCardEffect(card, get);
			return !!id && enabled() && !failed.has(id);
		},
		wasPlayed: (event, card) => !!eventPlays.get(event)?.has(card.name + ':' + sourceShaNature(card, get)),
		playAsset, playCard, playSkill, preload, stop,
		playSteal(actor, card) {
			game.hhCardAudio?.playSteal(actor, card);
			const record = actorAnchors.get(actor)?.get(cardKey(card));
			const anchor = record?.anchor || usedCardAnchor(actor, card);
			return playAsset(sourceCardEffect({ name: 'shunshou' }, get), anchor).catch(() => false);
		},
		playHit(actor, nature) {
			if (!sourceCardEffect({ name: 'sha', nature }, get)) return Promise.resolve(false);
			return playAsset(sourceCardHits[sourceShaNature({ nature }, get)] || sourceCardHits.sha, actor).catch(() => false);
		},
		get diagnostics() { return { active: active.size, cached: cache.size, pixels: [...cache.values()].reduce((sum, model) => sum + model.pixels, 0), pending: pending.size }; },
	};
}

export function setupSourceCardAnimations(context) {
	const { lib, game, get, _status } = context;
	let player = game.hhCardEffects;
	if (!player) {
		player = game.hhCardEffects = createSourceCardPlayer(context);
		if (Array.isArray(lib.onover)) lib.onover.push(() => player.stop());
		if (Array.isArray(lib.arenaReady)) lib.arenaReady.push(() => {
			player.preload(cardMap.get('tao').effect).catch(() => {});
		});
	}
	lib.animate.card ||= {}; lib.animate.skill ||= {};
	for (const card of sourceCards) {
		if (card.name === 'shan') continue;
		const original = lib.animate.card[card.name];
		if (original?._hhSourceCard) continue;
		const replacement = function (...args) {
			const fallback = () => {
				if (original) return original.apply(this, args);
				if (!lib.config.show_card_prompt) return;
				const type = get.type?.(args[0]);
				if ((type === 'equip' && lib.config.hide_card_prompt_equip) || (type === 'basic' && lib.config.hide_card_prompt_basic)) return;
				this.popup?.(args[3] ? { name: args[0].name, nature: args[0].nature } : args[1], args[2], false);
			};
			if (!player.playCard(this, args[0], { event: _status.event, onFallback: fallback })) fallback();
		};
		replacement._hhSourceCard = true; lib.animate.card[card.name] = replacement;
	}
	for (const name of Object.keys(sourceCardSkills)) {
		const original = lib.animate.skill[name];
		if (original?._hhSourceCard) continue;
		const replacement = function (...args) {
			const fallback = () => original?.apply(this, args);
			if (!player.playSkill(this, name, { onFallback: fallback })) fallback();
		};
		replacement._hhSourceCard = true; lib.animate.skill[name] = replacement;
	}
	lib.skill._hh_source_card_hit = {
		trigger: { global: 'damageEnd' }, silent: true, charlotte: true, forced: true,
		filter(event) { return !game.hhDamageEffects && event.card?.name === 'sha' && player.handles({ name: 'sha', nature: event.nature || event.card.nature }); },
		content(event, trigger) {
			const nature = trigger.nature || trigger.card.nature;
			game.broadcastAll((target, nature) => { game.hhCardEffects?.playHit(target, nature); }, trigger.player, nature);
		},
	};
	if (typeof game.finishSkill === 'function') game.finishSkill('_hh_source_card_hit');
	else game.addGlobalSkill?.('_hh_source_card_hit');
	const shownEquips = new WeakSet();
	lib.skill._hh_source_card_equip = {
		trigger: { global: 'equipAfter' }, silent: true, charlotte: true, forced: true,
		filter(event) { return !!event.card && !shownEquips.has(event) && (equipmentCards.has(event.card.name) || get.type?.(event.card) === 'equip'); },
		async content(event, trigger) {
			if (shownEquips.has(trigger)) return;
			shownEquips.add(trigger);
			const parent = trigger.getParent?.('useCard');
			const animate = equipmentCards.has(trigger.card.name) && !(parent && game.hhCardEffects.wasPlayed(parent, trigger.card));
			game.broadcastAll((target, card, animate) => {
				game.hhCardAudio?.playEquip(card);
				if (animate) game.hhCardEffects?.playCard(target, card);
			}, trigger.player, trigger.card, animate);
		},
	};
	if (typeof game.finishSkill === 'function') game.finishSkill('_hh_source_card_equip');
	else game.addGlobalSkill?.('_hh_source_card_equip');
	const shownSteals = new WeakSet();
	lib.skill._hh_source_card_steal = {
		trigger: { global: 'gainAfter' }, silent: true, charlotte: true, forced: true,
		filter(event) {
			if (!event.cards?.length || shownSteals.has(event)) return false;
			const take = event.getParent?.(), effect = take?.getParent?.();
			return take?.name === 'gainPlayerCard' && take.player === event.player && effect?.name === 'shunshou' && effect.player === event.player;
		},
		// Keep async: StepCompiler reconstructs sync content and loses this closure.
		async content(event, trigger) {
			if (shownSteals.has(trigger)) return;
			shownSteals.add(trigger);
			const effect = trigger.getParent().getParent();
			game.broadcastAll((target, card) => { game.hhCardEffects?.playSteal(target, card); }, trigger.player, effect.card || { name: 'shunshou' });
		},
	};
	if (typeof game.finishSkill === 'function') game.finishSkill('_hh_source_card_steal');
	else game.addGlobalSkill?.('_hh_source_card_steal');
	return player;
}
