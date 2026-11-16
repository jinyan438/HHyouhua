import { sourceSkillAsset as asset } from './sourceSkillAssets.js';

function styles(base) {
	const percent = ms => (ms / asset.duration * 100).toFixed(5) + '%';
	const still = asset.stillFrame / (asset.frames - 1) * 100;
	return `
@font-face{font-family:hh-source-skill;src:url("${base + asset.font}") format("woff2");font-display:swap}
.player>.hh-source-skill{display:block;position:absolute;left:50%;top:46%;width:160%;height:0;padding:0 0 64%;box-sizing:content-box;transform:translate(-50%,-50%);z-index:99;pointer-events:none;transition:none;border:0;background:none;box-shadow:none;line-height:1;overflow:visible}
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

export function createSourceSkillPopup({ lib }, environment = {}) {
	const env = { document: globalThis.document, setTimer: (fn, ms) => setTimeout(fn, ms), clearTimer: id => clearTimeout(id), ...environment };
	const active = new Map();
	function end(player, record = active.get(player)) {
		if (!record) return;
		env.clearTimer(record.timer); record.node.remove();
		if (active.get(player) === record) active.delete(player);
	}
	function clear() { for (const [player, record] of active) end(player, record); }
	function play(player, value) {
		const doc = env.document;
		const text = typeof value === 'string' ? value.replace(/<[^>]*>/g, '').trim() : '';
		if (!text || !doc?.createElement || !player?.appendChild || player.isConnected === false || doc.hidden) return false;
		end(player);
		const record = {};
		try {
			if (!doc.getElementById('hh-source-skill-style')) {
				const style = doc.createElement('style'); style.id = 'hh-source-skill-style';
				style.textContent = styles(`${lib.assetURL || ''}extension/HH优化/assets/skill-popup/`);
				(doc.head || doc.body).appendChild(style);
			}
			const node = record.node = doc.createElement('div'); node.className = 'hh-source-skill';
			node.dataset.motion = String(lib.config?.animation !== false);
			node.setAttribute('role', 'status'); node.setAttribute('aria-label', text);
			const width = Number(player.offsetWidth) || 136, characters = Array.from(text), middle = Math.floor(characters.length / 2);
			node.style.fontSize = `${Math.max(10, Math.min(44, width * .24, width * 1.1 / Math.max(2, characters.length)))}px`;
			const ink = doc.createElement('div'); ink.className = 'hh-source-skill-ink'; ink.setAttribute('aria-hidden', 'true');
			const label = doc.createElement('div'); label.className = 'hh-source-skill-label'; label.setAttribute('aria-hidden', 'true');
			for (const [name, letters] of [['left', characters.slice(0, middle)], ['right', characters.slice(middle)]]) {
				const group = doc.createElement('span'); group.className = 'hh-source-skill-' + name; group.textContent = letters.join(''); label.appendChild(group);
			}
			node.appendChild(ink); node.appendChild(label); player.appendChild(node);
			active.set(player, record); record.timer = env.setTimer(() => end(player, record), asset.duration + 40);
			return true;
		} catch (error) { record.node?.remove(); active.delete(player); console.warn('[HH优化] 原版技能提示显示失败', error); return false; }
	}
	lib.onover?.push(clear);
	env.document?.addEventListener?.('visibilitychange', () => { if (env.document.hidden) clear(); });
	return { play, clear, get activeCount() { return active.size; } };
}
