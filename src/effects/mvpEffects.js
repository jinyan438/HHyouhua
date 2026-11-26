import { decodeKillCombo, KillComboRenderer, loadSpine4Runtime, readSpine4Asset, loadSpine4Image } from './killCombo.js';

export const mvpEffects = [
	{ name: 'FX_PaiJu_JieSuan_kuang', action: 'play', duration: 1, loop: true },
	{ name: 'FX_PaiJu_JieSuan_QCZJ', action: 'play', duration: .6333333849906921, loop: false },
];

export function createMvpEffects(canvas, assetPath, getLayout, environment = {}) {
	const env = {
		loadSpine: loadSpine4Runtime, readText: url => readSpine4Asset(url, false), readBinary: url => readSpine4Asset(url, true),
		loadImage: loadSpine4Image, createRenderer: value => new KillComboRenderer(value),
		now: () => performance.now(), requestFrame: callback => requestAnimationFrame(callback), cancelFrame: id => cancelAnimationFrame(id),
		...environment,
	};
	let stopped = false, frame, renderer, models = [];
	const onLost = event => { event.preventDefault(); stop(); };
	canvas.addEventListener('webglcontextlost', onLost);
	function stop() {
		if (stopped) return;
		stopped = true; env.cancelFrame(frame);
		canvas.removeEventListener('webglcontextlost', onLost);
		canvas.parentNode?.classList.remove('hh-mvp-animated');
		if (renderer) {
			for (const model of models) renderer.release(model);
			renderer.dispose({ textures: {} }); renderer = null;
		}
	}
	async function start() {
		try {
			const spine = await env.loadSpine();
			const loaded = await Promise.all(mvpEffects.map(async metadata => {
				const [atlas, bytes, image] = await Promise.all([
					env.readText(assetPath + metadata.name + '.atlas.txt'), env.readBinary(assetPath + metadata.name + '.skel'),
					env.loadImage(assetPath + metadata.name + '.png'),
				]);
				return decodeKillCombo(spine, metadata, atlas, bytes, { [metadata.name + '.png']: image });
			}));
			if (stopped) return false;
			models = loaded; renderer = env.createRenderer(canvas);
			for (const model of models) renderer.upload(model);
			const startTime = env.now();
			const draw = now => {
				if (stopped) return;
				try {
					const elapsed = Math.max(0, (now - startTime) / 1000), layout = getLayout();
					renderer.draw(models[0], elapsed % models[0].animation.duration, { ...layout.border, scale: layout.scale });
					// After the one-shot sweep, retain the original plain title.
					renderer.draw(models[1], Math.min(elapsed, models[1].animation.duration), { ...layout.title, scale: layout.scale, clear: false, holdLastFrame: true });
					canvas.parentNode?.classList.add('hh-mvp-animated');
					frame = env.requestFrame(draw);
				} catch (error) { console.warn('[HH优化] MVP 动画绘制失败', error); stop(); }
			};
			draw(startTime);
			return !stopped;
		} catch (error) {
			if (!stopped) console.warn('[HH优化] MVP 动画加载失败，保留静态结算', error);
			stop(); return false;
		}
	}
	return { start, stop };
}
