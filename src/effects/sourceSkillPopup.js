import { sourceSkillAsset as asset } from './sourceSkillAssets.js';

function styles(base) {
	const percent = ms => (ms / asset.duration * 100).toFixed(5) + '%';
	const still = asset.stillFrame / (asset.frames - 1) * 100;
	return `
@font-face{font-family:hh-source-skill;src:url("${base + asset.font}") format("woff2");font-display:swap}
.hh-source-skill{display:block;position:absolute;padding:0;box-sizing:content-box;transform-origin:center;z-index:99;pointer-events:none;transition:none;border:0;background:none;box-shadow:none;line-height:1;overflow:visible}
.hh-source-skill>.hh-source-skill-ink,.hh-source-skill>.hh-source-skill-label{position:absolute;display:block;left:0;right:0;top:0;bottom:0;transition:none;pointer-events:none}
.hh-source-skill>.hh-source-skill-ink{background-image:url("${base + asset.image}");background-repeat:no-repeat;background-size:${asset.frames * 100}% 100%;background-position:${still}% 0}
.hh-source-skill>.hh-source-skill-label{display:flex;align-items:center;justify-content:center;font-family:hh-source-skill,yuanli,STKaiti,KaiTi,serif;font-size:inherit;font-weight:normal;color:#fff5e9;white-space:nowrap;text-shadow:0 1px 1px #111,-1px 0 1px #111,1px 0 1px #111;-webkit-text-stroke:.35px #111}
.hh-source-skill-label>span{position:static;display:inline-block;white-space:pre;line-height:1}
.hh-source-skill[data-motion=true]>.hh-source-skill-ink{animation:hh-source-skill-ink ${asset.duration}ms steps(${asset.frames - 1},end) both}
.hh-source-skill[data-motion=true] .hh-source-skill-left{animation:hh-source-skill-left ${asset.duration}ms linear both}
.hh-source-skill[data-motion=true] .hh-source-skill-right{animation:hh-source-skill-right ${asset.duration}ms linear both}
@keyframes hh-source-skill-ink{from{background-position:0 0}to{background-position:100% 0}}
@keyframes hh-source-skill-left{0%,${percent(asset.labelAppear)}{opacity:0;transform:translateX(-1.75em)}${percent(asset.labelEnterEnd)},${percent(asset.labelFade)}{opacity:1;transform:translateX(0)}${percent(asset.labelEnd)},100%{opacity:0;transform:translateX(0)}}
@keyframes hh-source-skill-right{0%,${percent(asset.labelAppear)}{opacity:0;transform:translateX(1.75em)}${percent(asset.labelEnterEnd)},${percent(asset.labelFade)}{opacity:1;transform:translateX(0)}${percent(asset.labelEnd)},100%{opacity:0;transform:translateX(0)}}
@media(prefers-reduced-motion:reduce){.hh-source-skill[data-motion=true]>.hh-source-skill-ink{animation:none;background-position:${still}% 0}.hh-source-skill[data-motion=true] .hh-source-skill-left,.hh-source-skill[data-motion=true] .hh-source-skill-right{animation:none;opacity:1;transform:none}}
`;
}

export function createSourceSkillPopup({ lib, ui = {} }, environment = {}) {
	const env = {
		document: globalThis.document,
		requestFrame: fn => requestAnimationFrame(fn), cancelFrame: id => cancelAnimationFrame(id),
		setTimer: (fn, ms) => setTimeout(fn, ms), clearTimer: id => clearTimeout(id), ...environment,
	};
	const active = new Map();
	let root, frame;
	function end(player, record = active.get(player)) {
		if (!record) return;
		env.clearTimer(record.timer); record.node.remove();
		if (active.get(player) === record) active.delete(player);
		if (!active.size) { env.cancelFrame(frame); frame = undefined; root?.remove(); }
	}
	function clear() { for (const [player, record] of active) end(player, record); }
	function place(player, record, area) {
		const rect = player.getBoundingClientRect?.();
		if (player.isConnected === false || !rect?.width || !rect.height || !area.width || !area.height || !root.offsetWidth || !root.offsetHeight) return false;
		const width = Number(player.offsetWidth) || 136, height = Number(player.offsetHeight) || 180;
		const sx = area.width / root.offsetWidth, sy = area.height / root.offsetHeight;
		Object.assign(record.node.style, {
			left: `${(rect.left - area.left + rect.width * .5) / sx}px`,
			top: `${(rect.top - area.top + rect.height * .46) / sy}px`,
			width: `${width * 1.6}px`, height: `${width * .64}px`,
			transform: `translate(-50%,-50%) scale(${rect.width / width / sx},${rect.height / height / sy})`,
			fontSize: `${Math.max(10, Math.min(44, width * .24, width * 1.1 / Math.max(2, record.characters)))}px`,
		});
		return true;
	}
	function tick() {
		frame = undefined;
		const area = root.getBoundingClientRect();
		for (const [player, record] of active) if (env.document.hidden || !place(player, record, area)) end(player, record);
		if (active.size) frame = env.requestFrame(tick);
	}
	function play(player, value) {
		const doc = env.document;
		const text = typeof value === 'string' ? value.replace(/<[^>]*>/g, '').trim() : '';
		if (!text || !doc?.createElement || !player?.appendChild || player.isConnected === false || doc.hidden) return false;
		end(player);
		const record = {};
		try {
			if (!root) {
				root = doc.createElement('div'); root.className = 'hh-source-skill-effects';
				// Share the chain canvas's parent so the player/arena stacking contexts cannot cover the ink or name.
				Object.assign(root.style, { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '91', overflow: 'visible' });
			}
			(ui.window || doc.body).appendChild(root);
			if (!doc.getElementById('hh-source-skill-style')) {
				const style = doc.createElement('style'); style.id = 'hh-source-skill-style';
				style.textContent = styles(`${lib.assetURL || ''}extension/HH优化/assets/skill-popup/`);
				(doc.head || doc.body).appendChild(style);
			}
			const node = record.node = doc.createElement('div'); node.className = 'hh-source-skill';
			node.dataset.motion = String(lib.config?.animation !== false);
			node.setAttribute('role', 'status'); node.setAttribute('aria-label', text);
			const characters = Array.from(text), middle = Math.floor(characters.length / 2);
			record.characters = characters.length;
			const ink = doc.createElement('div'); ink.className = 'hh-source-skill-ink'; ink.setAttribute('aria-hidden', 'true');
			const label = doc.createElement('div'); label.className = 'hh-source-skill-label'; label.setAttribute('aria-hidden', 'true');
			for (const [name, letters] of [['left', characters.slice(0, middle)], ['right', characters.slice(middle)]]) {
				const group = doc.createElement('span'); group.className = 'hh-source-skill-' + name; group.textContent = letters.join(''); label.appendChild(group);
			}
			node.appendChild(ink); node.appendChild(label); root.appendChild(node);
			if (!place(player, record, root.getBoundingClientRect())) { node.remove(); if (!active.size) root.remove(); return false; }
			active.set(player, record); record.timer = env.setTimer(() => end(player, record), asset.duration + 40);
			if (frame === undefined) frame = env.requestFrame(tick);
			return true;
		} catch (error) { if (record.node) end(player, record); else if (!active.size) root?.remove(); console.warn('[HH优化] 原版技能提示显示失败', error); return false; }
	}
	lib.onover?.push(clear);
	env.document?.addEventListener?.('visibilitychange', () => { if (env.document.hidden) clear(); });
	return { play, clear, get activeCount() { return active.size; } };
}
