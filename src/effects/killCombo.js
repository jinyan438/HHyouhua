import { killComboAssets } from './killComboAssets.js';

export function normalizeKillComboCount(value) {
	return Math.max(1, Math.min(7, Math.trunc(Number(value)) || 1));
}

// Keep Spine 4.0 module-local: the existing UI and dynamic skins use window.spine.
const loadSpine = () => import('../libs/spine4-core.js').then(module => module.spine);

function request(url, binary) {
	return new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		xhr.open('GET', url, true);
		xhr.timeout = 15000;
		if (binary) xhr.responseType = 'arraybuffer';
		xhr.onload = () => {
			const value = binary ? xhr.response : xhr.responseText;
			if (((xhr.status >= 200 && xhr.status < 300) || xhr.status === 0) && value?.[binary ? 'byteLength' : 'length']) resolve(value);
			else reject(new Error(`连斩资源读取失败：${url} (${xhr.status})`));
		};
		xhr.onerror = xhr.ontimeout = () => reject(new Error(`连斩资源读取失败：${url}`));
		xhr.send();
	});
}

function loadImage(url) {
	return new Promise((resolve, reject) => {
		const image = new Image();
		const timeout = setTimeout(() => { image.onload = image.onerror = null; reject(new Error(`连斩图集加载超时：${url}`)); }, 15000);
		image.onload = () => { clearTimeout(timeout); resolve(image); };
		image.onerror = () => { clearTimeout(timeout); reject(new Error(`连斩图集读取失败：${url}`)); };
		image.src = url;
	});
}

export function decodeKillCombo(spine, metadata, atlasText, bytes, images) {
	const atlas = new spine.TextureAtlas(atlasText);
	for (const page of atlas.pages) {
		if (!images[page.name]) throw new Error(`连斩图集缺页：${page.name}`);
		page.setTexture({ setFilters() {}, setWraps() {}, getImage: () => images[page.name] });
	}
	const data = new spine.SkeletonBinary(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(new Uint8Array(bytes));
	const animation = data.findAnimation(metadata.action || 'play');
	if (!animation || !data.version?.startsWith('4.0.')) throw new Error('连斩骨骼版本或动画不匹配');
	for (const skin of data.skins) for (const { attachment } of skin.getAttachments()) {
		const region = attachment.region;
		if (!(attachment instanceof spine.RegionAttachment) || ![180, 270].includes(region.degrees)) continue;
		// This client also packs regions at 180/270 degrees, beyond the helper's 0/90 support.
		const swapped = region.degrees === 270;
		const u = region.x / region.page.width, v = region.y / region.page.height;
		const u2 = (region.x + (swapped ? region.height : region.width)) / region.page.width;
		const v2 = (region.y + (swapped ? region.width : region.height)) / region.page.height;
		const corners = [[u, v2], [u, v], [u2, v], [u2, v2]];
		for (let i = 0; i < 4; i++) attachment.uvs.set(corners[(i - region.degrees / 90 + 4) % 4], i * 2);
	}
	return { spine, metadata, atlas, data, animation, images, skeleton: new spine.Skeleton(data), textures: {} };
}

export class KillComboRenderer {
	constructor(canvas) {
		this.canvas = canvas;
		const gl = this.gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: true });
		if (!gl) throw new Error('WebGL 不可用');
		const compile = (type, source) => {
			const shader = gl.createShader(type);
			gl.shaderSource(shader, source); gl.compileShader(shader);
			if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
			return shader;
		};
		const vertex = compile(gl.VERTEX_SHADER, 'attribute vec2 a_position;attribute vec2 a_uv;uniform vec2 u_view;varying vec2 v_uv;void main(){gl_Position=vec4(a_position/u_view*2.0-1.0,0.0,1.0);v_uv=a_uv;}');
		const fragment = compile(gl.FRAGMENT_SHADER, 'precision mediump float;uniform sampler2D u_texture;uniform vec4 u_color;varying vec2 v_uv;void main(){gl_FragColor=texture2D(u_texture,v_uv)*u_color;}');
		const program = this.program = gl.createProgram();
		gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
		gl.deleteShader(vertex); gl.deleteShader(fragment);
		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
		this.position = gl.getAttribLocation(program, 'a_position'); this.uv = gl.getAttribLocation(program, 'a_uv');
		this.view = gl.getUniformLocation(program, 'u_view'); this.color = gl.getUniformLocation(program, 'u_color');
		this.buffer = gl.createBuffer();
		gl.useProgram(program); gl.uniform1i(gl.getUniformLocation(program, 'u_texture'), 0);
		gl.enable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
	}

	upload(model) {
		const gl = this.gl;
		try {
			for (const [name, image] of Object.entries(model.images)) {
				const texture = model.textures[name] = gl.createTexture();
				gl.bindTexture(gl.TEXTURE_2D, texture); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
				gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			}
		} catch (error) { this.release(model); throw error; }
	}

	release(model) {
		for (const texture of Object.values(model.textures)) this.gl.deleteTexture(texture);
		model.textures = {};
	}

	draw(model, time, placement = {}) {
		const gl = this.gl, canvas = this.canvas, spine = model.spine;
		const rect = canvas.getBoundingClientRect(), dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
		const width = Math.max(1, Math.round(rect.width * dpr)), height = Math.max(1, Math.round(rect.height * dpr));
		if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
		gl.viewport(0, 0, width, height);
		if (placement.clear !== false) { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); }
		if (!rect.width || !rect.height || time >= model.animation.duration) return;
		const skeleton = model.skeleton;
		skeleton.setToSetupPose();
		model.animation.apply(skeleton, -1, time, false, [], 1, spine.MixBlend.setup, spine.MixDirection.mixIn);
		skeleton.updateWorldTransform();
		gl.useProgram(this.program); gl.uniform2f(this.view, rect.width, rect.height); gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
		gl.enableVertexAttribArray(this.position); gl.enableVertexAttribArray(this.uv);
		gl.vertexAttribPointer(this.position, 2, gl.FLOAT, false, 16, 0); gl.vertexAttribPointer(this.uv, 2, gl.FLOAT, false, 16, 8);
		const scale = placement.scale ?? Math.min(rect.width / 1920, rect.height / 1080);
		const x = placement.x ?? rect.width / 2, y = rect.height - (placement.y ?? rect.height / 2);
		for (const slot of skeleton.drawOrder) {
			const attachment = slot.getAttachment();
			if (!attachment || !slot.bone.active || slot.color.a * (attachment.color?.a || 0) < .002) continue;
			let world, triangles;
			if (attachment instanceof spine.RegionAttachment) {
				world = new Float32Array(8); attachment.computeWorldVertices(slot.bone, world, 0, 2); triangles = [0, 1, 2, 2, 3, 0];
			} else if (attachment instanceof spine.MeshAttachment) {
				world = new Float32Array(attachment.worldVerticesLength);
				attachment.computeWorldVertices(slot, 0, attachment.worldVerticesLength, world, 0, 2); triangles = attachment.triangles;
			} else continue;
			// Some hidden, zero-scale constrained meshes are degenerate during the intro.
			if (!world.every(Number.isFinite) || !attachment.uvs.every(Number.isFinite)) continue;
			const vertices = new Float32Array(triangles.length * 4);
			for (let i = 0; i < triangles.length; i++) {
				const j = triangles[i] * 2, k = i * 4;
				vertices[k] = x + world[j] * scale; vertices[k + 1] = y + world[j + 1] * scale;
				vertices[k + 2] = attachment.uvs[j]; vertices[k + 3] = attachment.uvs[j + 1];
			}
			const c = slot.color, a = attachment.color, s = skeleton.color;
			gl.uniform4f(this.color, c.r * a.r * s.r, c.g * a.g * s.g, c.b * a.b * s.b, c.a * a.a * s.a);
			gl.bindTexture(gl.TEXTURE_2D, model.textures[attachment.region.page.name]);
			if (slot.data.blendMode === spine.BlendMode.Additive) gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ONE, gl.ONE);
			else if (slot.data.blendMode === spine.BlendMode.Multiply) gl.blendFuncSeparate(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
			else if (slot.data.blendMode === spine.BlendMode.Screen) gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_COLOR, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
			else gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
			gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW); gl.drawArrays(gl.TRIANGLES, 0, triangles.length);
		}
	}
}

export { loadSpine as loadSpine4Runtime, request as readSpine4Asset, loadImage as loadSpine4Image };

export function createKillComboPlayer({ lib, game, ui }, environment = {}) {
	const env = {
		document: globalThis.document, loadSpine, readText: url => request(url, false), readBinary: url => request(url, true), loadImage,
		now: () => performance.now(), requestFrame: callback => requestAnimationFrame(callback), cancelFrame: id => cancelAnimationFrame(id),
		setTimer: (callback, ms) => setTimeout(callback, ms), clearTimer: id => clearTimeout(id),
		createRenderer: canvas => new KillComboRenderer(canvas), ...environment,
	};
	const rootPath = `${lib.assetURL || ''}extension/HH优化/assets/kill-combo/`;
	const cache = new Map(), pending = new Map();
	let renderer, root, canvas, active, generation = 0, queue = Promise.resolve();
	function ensureRenderer() {
		if (renderer) return renderer;
		root = env.document.createElement('div'); root.className = 'hh-kill-combo'; root.setAttribute('aria-hidden', 'true');
		Object.assign(root.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '99', overflow: 'hidden' });
		canvas = env.document.createElement('canvas');
		Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' });
		root.appendChild(canvas);
		canvas.addEventListener('webglcontextlost', event => {
			event.preventDefault(); stop(); cache.clear(); renderer = null;
		});
		return renderer = env.createRenderer(canvas);
	}
	async function preload(value) {
		const count = normalizeKillComboCount(value);
		if (cache.has(count)) return cache.get(count);
		if (pending.has(count)) return pending.get(count);
		const work = (async () => {
			const owner = ensureRenderer(), metadata = killComboAssets[count - 1], path = rootPath + metadata.folder + '/';
			const [spine, atlas, bytes, pages] = await Promise.all([
				env.loadSpine(), env.readText(path + metadata.name + '.atlas.txt'), env.readBinary(path + metadata.name + '.skel'),
				Promise.all(metadata.pages.map(async name => [name, await env.loadImage(path + name)])),
			]);
			if (owner !== renderer) throw new Error('连斩图形上下文已重置');
			const model = decodeKillCombo(spine, metadata, atlas, bytes, Object.fromEntries(pages));
			owner.upload(model); cache.set(count, model);
			// Bound texture memory; seven 2K multi-page atlases need not all stay on the GPU.
			for (const [key, candidate] of cache) {
				if (cache.size <= 2) break;
				if (candidate !== active?.model && key !== count) { owner.release(candidate); cache.delete(key); }
			}
			return model;
		})();
		pending.set(count, work);
		try { return await work; } finally { pending.delete(count); }
	}
	function stop() {
		generation++; active?.finish(false); root?.remove();
	}
	async function execute(count, token) {
		if (token !== generation) return false;
		const metadata = killComboAssets[count - 1];
		let model;
		try { model = await preload(count); }
		catch (error) { console.warn('[HH优化] 连斩动画加载失败，继续播放音效', error); }
		if (token !== generation) return false;
		(ui.window || env.document.body).appendChild(root || env.document.createElement('div'));
		const audio = game.playAudio({ path: metadata.audio });
		return new Promise(resolve => {
			let frame, timer, finished = false;
			const finish = success => {
				if (finished) return;
				finished = true; env.cancelFrame(frame); env.clearTimer(timer); root?.remove();
				if (!success) { audio?.pause?.(); audio?.remove?.(); }
				active = null; resolve(success);
			};
			active = { model, finish };
			const start = env.now(), duration = model?.animation.duration || metadata.duration;
			const draw = now => {
				if (finished) return;
				const elapsed = Math.max(0, (now - start) / 1000);
				if (elapsed >= duration) return finish(true);
				try { if (model) renderer.draw(model, elapsed); }
				catch (error) { console.warn('[HH优化] 连斩动画绘制失败', error); return finish(false); }
				frame = env.requestFrame(draw);
			};
			// A hidden WebView may suspend animation frames; completion must still resolve.
			timer = env.setTimer(() => finish(true), duration * 1000 + 150);
			draw(start);
		});
	}
	return {
		preload, stop,
		play(value) {
			const count = normalizeKillComboCount(value), token = generation;
			const job = queue.then(() => execute(count, token));
			queue = job.catch(error => { console.warn('[HH优化] 连斩播报失败', error); });
			return queue;
		},
	};
}
