import { createGameResultEffects, gameResultAssets } from '../effects/gameResultEffects.js';

export function createGameResultFlow({ lib, game, ui, _status }, options, environment = {}) {
	const env = { document: globalThis.document, window: globalThis.window, now: () => performance.now(),
		createEffects: createGameResultEffects, ...environment };
	let session, processed = false;
	const path = `${lib.assetURL || ''}extension/HH优化/assets/game-result/`;
	function stop() {
		if (!session) return;
		const current = session; session = null;
		current.effects?.stop(); current.audio?.pause?.(); current.audio?.remove?.();
		env.window?.removeEventListener('resize', current.resize); current.root.remove();
	}
	function show(value) {
		if (processed) return false;
		processed = true;
		const outcome = value === true ? 'win' : value === false ? 'lose' : 'tie', metadata = gameResultAssets[outcome];
		const root = env.document.createElement('div'); root.className = `hh-mvp-screen hh-game-result hh-result-${outcome}`;
		root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', metadata.label); root.tabIndex = -1;
		env.document.body.appendChild(root);
		const current = session = { root, opened: env.now() };
		if (options.onViewRecords) {
			const records = env.document.createElement('button'); records.className = 'hh-result-records'; records.type = 'button'; records.textContent = '查看战绩'; root.appendChild(records);
			records.addEventListener('click', event => { event.stopPropagation(); options.onViewRecords(root); });
			records.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') event.stopPropagation(); });
		}
		const fallback = env.document.createElement('div'); fallback.className = 'hh-result-fallback'; fallback.textContent = metadata.label; root.appendChild(fallback);
		const hint = env.document.createElement('div'); hint.className = 'hh-mvp-continue'; hint.textContent = '点击继续'; root.appendChild(hint);
		const canvas = env.document.createElement('canvas'); canvas.className = 'hh-mvp-effects'; canvas.setAttribute('aria-hidden', 'true'); root.appendChild(canvas);
		let layout;
		current.resize = () => {
			const rect = root.getBoundingClientRect(), width = root.clientWidth || rect.width, height = root.clientHeight || rect.height;
			layout = { width, height, scale: Math.min(width / 1450, height / 750) };
			root.style.setProperty('--mvp-unit', `${layout.scale}px`);
		};
		current.resize(); env.window?.addEventListener('resize', current.resize);
		const next = event => {
			event.stopPropagation();
			if (session !== current || root.inert) return;
			if (event.type === 'keydown' && !['Escape', 'Enter', ' '].includes(event.key)) return;
			if (env.now() - current.opened < 1800) return;
			event.preventDefault(); stop(); options.onContinue();
		};
		root.addEventListener('click', next); root.addEventListener('keydown', next); root.focus?.({ preventScroll: true });
		try {
			current.effects = env.createEffects(canvas, path, outcome, () => layout);
			Promise.resolve(current.effects.start()).catch(error => console.warn('[HH优化] 胜负动画启动失败', error));
		} catch (error) { console.warn('[HH优化] 胜负动画使用静态提示', error); }
		if (lib.config.background_audio !== false) current.audio = game.playAudio({ path: `ext:HH优化/assets/game-result/${metadata.sound}`, addVideo: false, video: true });
		return true;
	}
	// Let the engine finish rewards, records, videos and online messages. Only the
	// old presentation is intercepted, during the synchronous game-over call.
	const nativeOver = game.over;
	if (typeof nativeOver === 'function') game.over = function (...args) {
		if (_status.over || lib.config.test_game) return nativeOver.apply(this, args);
		const createDialog = ui.create.dialog, playAudio = game.playAudio, reload = game.reload, publicOver = game.over, hidden = [];
		const hideDialog = function (...args) {
			const dialog = createDialog.call(this, ...args, 'hidden'); hidden.push(dialog); return dialog;
		};
		const filterAudio = function (...args) {
			const sound = args.length === 1 && typeof args[0] === 'object' ? args[0]?.path : args.join('/');
			if (/^(?:audio\/)?effect\/(?:win|lose|tie)(?:\.mp3)?$/.test(sound || '')) return;
			return playAudio.apply(this, args);
		};
		const laterReload = function (...args) { if (!processed) return reload.apply(this, args); };
		if (createDialog) ui.create.dialog = hideDialog;
		game.playAudio = filterAudio;
		if (typeof reload === 'function') game.reload = laterReload;
		// The native implementation sends game.over itself to remote clients.
		// Keep that serialized function free of this wrapper's module closures.
		game.over = nativeOver;
		try {
			const returned = nativeOver.apply(this, args);
			if (_status.over && !processed) options.onGameOver(game.online ? args[1] : args[0]);
			return returned;
		} finally {
			if (ui.create.dialog === hideDialog) ui.create.dialog = createDialog;
			if (game.playAudio === filterAudio) game.playAudio = playAudio;
			if (game.reload === laterReload) game.reload = reload;
			if (game.over === nativeOver) game.over = publicOver;
			for (const dialog of hidden) dialog.remove?.();
			if (processed) { ui.restart?.hide?.(); ui.continue_game?.hide?.(); }
		}
	};
	return { show, stop, get active() { return !!session; }, reset() { stop(); processed = false; } };
}
