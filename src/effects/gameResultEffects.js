import { decodeKillCombo, KillComboRenderer, loadSpine4Runtime, readSpine4Asset, loadSpine4Image } from './killCombo.js';

export const gameResultAssets = {
	win: { name: 'FX_PaiJu_JieSuan_Shengli_new', sound: 'ui_zhandoushengli.ogg', label: '胜利', intro: 1.7000000476837158 },
	lose: { name: 'FX_PaiJu_JieSuan_ShiBai_new', sound: 'ui_zhandoushibai.ogg', label: '失败', intro: 1.3000000715255737 },
	tie: { name: 'FX_PaiJu_JieSuan_PingJu_new', sound: 'ui_zhandoupingju.ogg', label: '平局', intro: 1.2000000476837158 },
};

export function createGameResultEffects(canvas, path, outcome, getLayout, environment = {}) {
	const env = {
		loadSpine: loadSpine4Runtime, readText: url => readSpine4Asset(url, false), readBinary: url => readSpine4Asset(url, true),
		loadImage: loadSpine4Image, createRenderer: element => new KillComboRenderer(element), now: () => performance.now(),
		requestFrame: callback => requestAnimationFrame(callback), cancelFrame: id => cancelAnimationFrame(id), ...environment,
	};
	const metadata = gameResultAssets[outcome];
	let stopped = false, renderer, model, frame;
	const lost = event => { event.preventDefault(); stop(); };
	canvas.addEventListener('webglcontextlost', lost);
	function stop() {
		if (stopped) return;
		stopped = true; env.cancelFrame(frame); canvas.removeEventListener('webglcontextlost', lost);
		canvas.parentNode?.classList.remove('hh-result-animated');
		if (renderer) { renderer.dispose(model || { textures: {} }); renderer = null; }
	}
	async function start() {
		try {
			const [spine, atlas, bytes, image] = await Promise.all([
				env.loadSpine(), env.readText(path + metadata.name + '.atlas.txt'), env.readBinary(path + metadata.name + '.skel'), env.loadImage(path + metadata.name + '.png'),
			]);
			if (stopped) return false;
			model = decodeKillCombo(spine, { ...metadata, action: 'play' }, atlas, bytes, { [metadata.name + '.png']: image });
			const intro = model.data.findAnimation('play'), idle = model.data.findAnimation('play2');
			if (!idle) throw new Error('缺少结算停留动画');
			renderer = env.createRenderer(canvas); renderer.upload(model);
			const begin = env.now();
			const draw = now => {
				if (stopped) return;
				try {
					const elapsed = Math.max(0, (now - begin) / 1000), layout = getLayout();
					model.animation = elapsed < intro.duration ? intro : idle;
					const time = elapsed < intro.duration ? elapsed : (elapsed - intro.duration) % idle.duration;
					renderer.draw(model, time, { x: layout.width / 2, y: layout.height / 2 - 137 * layout.scale,
						scale: layout.scale, viewport: { width: layout.width, height: layout.height } });
					canvas.parentNode?.classList.add('hh-result-animated'); frame = env.requestFrame(draw);
				} catch (error) { console.warn('[HH优化] 胜负动画绘制失败', error); stop(); }
			};
			draw(begin); return !stopped;
		} catch (error) { if (!stopped) console.warn('[HH优化] 胜负动画加载失败，使用静态提示', error); stop(); return false; }
	}
	return { start, stop };
}
