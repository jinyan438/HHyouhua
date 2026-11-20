import { decodeKillCombo, KillComboRenderer, loadSpine4Runtime, readSpine4Asset, loadSpine4Image } from './killCombo.js';
import { refreshSourceRevealJudge } from '../ui/sourceReveal.js';

export const sourceJudgeTiming = { fadeDelay: 1500, fadeDuration: 300, duration: 1800 };
const negativeCards = new Set(['lebu', '乐不思蜀', 'bingliang', '兵粮寸断', 'shandian', '闪电', 'caomu', '草木皆兵', 'fulei', '浮雷']);

// judge2 describes whether the effect takes place; judge/bool describe the player's benefit.
export function sourceJudgeOutcome(event) {
	const result = event.result;
	if (!result) return null;
	const effect = event.judge2?.(result);
	if (typeof effect === 'boolean') return effect;
	if (negativeCards.has(event.judgestr)) return result.judge < 0;
	return result.judge > 0 ? true : result.judge < 0 ? false : null;
}

export function createSourceJudgePlayer({ lib, game, ui, _status }, environment = {}) {
	const env = {
		document: globalThis.document, loadSpine: loadSpine4Runtime,
		readText: url => readSpine4Asset(url, false), readBinary: url => readSpine4Asset(url, true), loadImage: loadSpine4Image,
		now: () => performance.now(), requestFrame: callback => requestAnimationFrame(callback), cancelFrame: id => cancelAnimationFrame(id),
		setTimer: (callback, ms) => setTimeout(callback, ms), clearTimer: id => clearTimeout(id),
		createRenderer: canvas => new KillComboRenderer(canvas), ...environment,
	};
	const path = `${lib.assetURL || ''}extension/HH优化/assets/judge-effects/`;
	const states = new Map();
	let root, canvas, renderer, model, loading, failed = false, frame, generation = 0;
	const animated = () => lib.config.animation !== false && !env.document.hidden;
	function stamp(state, index) {
		state.stamp?.remove();
		const image = env.document.createElement('img');
		image.className = 'hh-source-judge-stamp'; image.src = path + `judge_status_${index}.png`; image.alt = '';
		image.setAttribute('aria-hidden', 'true'); state.node.appendChild(image); state.stamp = image;
	}
	function pin(state, node) {
		if (state.node === node) return;
		release(state);
		state.node = node;
		node.classList.add('hh-source-judge-card');
		node.querySelector('.used-info')?.remove();
		node._hhJudgeOriginalFixed = node.fixed;
		node.fixed = true;
	}
	function release(state) {
		state.stamp?.remove(); state.stamp = null;
		const node = state.node;
		if (!node) return;
		// The central row retains its cards until the owning skill ends.
		if (!node.classList.contains('hh-source-reveal-card')) {
			node.fixed = node._hhJudgeOriginalFixed;
			node.classList.remove('hh-source-judge-card');
		}
		delete node._hhJudgeOriginalFixed;
	}
	function finish(event) {
		const state = states.get(event);
		if (!state) return;
		states.delete(event); env.clearTimer(state.timer); release(state); state.done?.();
		if (![...states.values()].some(item => item.effect)) { env.cancelFrame(frame); frame = undefined; root?.remove(); }
	}
	async function preload() {
		if (model || failed) return model;
		if (loading) return loading.catch(() => null);
		loading = (async () => {
			root ||= env.document.createElement('div'); root.className = 'hh-source-judge-effects'; root.setAttribute('aria-hidden', 'true');
			canvas ||= env.document.createElement('canvas'); root.appendChild(canvas);
			canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); stop(); model = null; failed = true; });
			renderer ||= env.createRenderer(canvas);
			const [spine, atlas, bytes, image] = await Promise.all([
				env.loadSpine(), env.readText(path + 'panding.atlas.txt'), env.readBinary(path + 'panding.skel'), env.loadImage(path + 'panding.png'),
			]);
			const decoded = decodeKillCombo(spine, { name: 'panding', action: 'play' }, atlas, bytes, { 'panding.png': image });
			renderer.upload(decoded); return model = decoded;
		})();
		try { return await loading; }
		catch (error) { failed = true; console.warn('[HH优化] 原版判定骨骼不可用，保留原版结果标记', error); return null; }
		finally { loading = null; }
	}
	function tick(now) {
		frame = undefined;
		let clear = true, active = false;
		for (const state of states.values()) {
			if (!state.effect) continue;
			const elapsed = now - state.start, rect = state.node.getBoundingClientRect();
			if (!state.node.isConnected || !rect.width || !rect.height || elapsed >= sourceJudgeTiming.duration) continue;
			active = true;
			const area = canvas.getBoundingClientRect();
			state.effect.skeleton.color.a = Math.min(1, Math.max(0, (sourceJudgeTiming.duration - elapsed) / sourceJudgeTiming.fadeDuration));
			// Native card effects use the center of a 126 x 174 card, without fitting the stamp to its bounds.
			try {
				renderer.draw(state.effect, Math.min(elapsed / 1000, state.effect.animation.duration - .00001), {
					x: rect.left - area.left + rect.width / 2, y: rect.top - area.top + rect.height / 2,
					scale: Math.min(rect.width / 126, rect.height / 174), clear,
				});
			} catch {
				state.effect = null; failed = true; stamp(state, state.outcome ? 1 : 2); continue;
			}
			clear = false;
		}
		if (active) frame = env.requestFrame(tick); else root?.remove();
	}
	function begin(event, node, onResult) {
		if (!node || _status.connectMode || _status.video || game.online || game.chess) return false;
		let state = states.get(event);
		if (!state) {
			state = { event, onResult }; states.set(event, state);
			event.insertAfter?.(async () => finish(event), {});
		}
		if (state.resolved) return true;
		pin(state, node);
		if (animated()) { stamp(state, 0); void preload(); }
		return true;
	}
	async function resolve(event) {
		const state = states.get(event);
		if (!state) return;
		if (state.resolved) return state.promise;
		state.resolved = true;
		refreshSourceRevealJudge(event);
		const node = event.result?.card?.clone || event.node;
		if (node) pin(state, node);
		state.onResult?.(state.node);
		const outcome = sourceJudgeOutcome(event);
		state.outcome = outcome;
		state.node.querySelector('.used-info')?.remove();
		state.stamp?.remove(); state.stamp = null;
		if (!animated() || outcome === null || !state.node.isConnected) { finish(event); return; }
		state.start = env.now();
		state.promise = new Promise(done => { state.done = done; });
		state.timer = env.setTimer(() => finish(event), sourceJudgeTiming.duration);
		stamp(state, outcome ? 1 : 2);
		const token = generation;
		void preload().then(base => {
			if (!base || token !== generation || !states.has(event) || env.now() - state.start >= sourceJudgeTiming.duration) return;
			state.stamp?.remove(); state.stamp = null;
			state.effect = { ...base, skeleton: new base.spine.Skeleton(base.data), animation: base.data.findAnimation(outcome ? 'play' : 'play2') };
			(ui.window || env.document.body).appendChild(root);
			if (frame === undefined) frame = env.requestFrame(tick);
		});
		await state.promise;
	}
	function stop() { generation++; for (const event of [...states.keys()]) finish(event); root?.remove(); }
	env.document.addEventListener('visibilitychange', () => { if (env.document.hidden) stop(); });
	return { begin, resolve, preload, stop, has: event => states.has(event), get diagnostics() { return { active: states.size, ready: !!model, failed }; } };
}

export function setupSourceJudgeAnimations(context) {
	const { lib, game, _status } = context;
	if (game.hhJudgeEffects) return game.hhJudgeEffects;
	const player = game.hhJudgeEffects = createSourceJudgePlayer(context);
	const prototype = lib.element.Player.prototype, nativeJudgeAnimate = prototype.tryJudgeAnimate;
	prototype.tryJudgeAnimate = function (...args) {
		// The source stamp already contains its own result; omit the engine's extra text popup.
		if (player.has(_status.event) && _status.event.player === this) return;
		return nativeJudgeAnimate.apply(this, args);
	};
	(lib.onover ||= []).push(() => player.stop());
	// The native judge has computed its final result and applied modifiers here.
	// Wait inside its existing trigger so gain/expansion callbacks run after the result animation.
	lib.skill._hh_source_judge_result = {
		trigger: { global: 'judgeFixing' }, firstDo: true, priority: 100000, forced: true, silent: true, charlotte: true, forceDie: true,
		filter: event => player.has(event),
		async content(event, trigger) { await player.resolve(trigger); },
	};
	game.finishSkill('_hh_source_judge_result');
	return player;
}
