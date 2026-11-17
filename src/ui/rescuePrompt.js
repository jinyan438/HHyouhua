import { createPlayerTip } from './playerTip.js';

const css = `
.hh-rescue-active .player>.timeai:not(.hh-rescue-progress),.hh-rescue-active .player>.timePhase:not(.hh-rescue-progress),.hh-rescue-active .player>.timerbar,.hh-rescue-active .player>.tipskill,.hh-rescue-active .player>.tipshow:not(.hh-rescue-thinking),.hh-rescue-active #jindutiaopl:not([data-hh-action-timer]){visibility:hidden!important}
.player>.hh-rescue-thinking{pointer-events:none;transition:none}
.player>.hh-rescue-help{position:absolute;display:block;left:50%;top:35%;width:112%;height:auto;transform:translate(-50%,-50%);overflow:visible;z-index:97;pointer-events:none;transition:none;animation:none;opacity:1}
.hh-rescue-help>img{position:static;display:block;width:100%;max-width:none;height:auto;animation:none;transform:none;opacity:1}
`;

export function createRescuePrompt({ lib, game }, environment = {}) {
	const env = { document: globalThis.document, now: () => Date.now(), setTimer: (fn, ms) => setTimeout(fn, ms), clearTimer: id => clearTimeout(id), ...environment };
	const stack = [], rounds = new Set(), markers = new Map();
	function ensureStyle() {
		const doc = env.document;
		if (!doc?.createElement || doc.getElementById('hh-rescue-prompt-style')) return;
		const style = doc.createElement('style'); style.id = 'hh-rescue-prompt-style'; style.textContent = css;
		(doc.head || doc.body).appendChild(style);
	}
	function beginRound(dying) {
		const token = { dying, closed: false };
		rounds.add(token);
		let marker = markers.get(dying);
		if (!marker) {
			marker = { count: 0, node: null }; markers.set(dying, marker);
			try {
				const doc = env.document;
				if (doc?.createElement && dying?.appendChild) {
					ensureStyle();
					const node = marker.node = doc.createElement('div'); node.className = 'hh-rescue-help'; node.setAttribute('role', 'img'); node.setAttribute('aria-label', '救我');
					const image = doc.createElement('img'); image.src = `${lib.assetURL || ''}extension/HH优化/assets/rescue/jiuwo-static.png`; image.alt = ''; image.draggable = false;
					node.appendChild(image); dying.appendChild(node);
				}
			} catch (error) { marker.node?.remove(); marker.node = null; console.warn('[HH优化] 濒死提示显示失败', error); }
		}
		marker.count++;
		return token;
	}
	function endRound(token) {
		if (!token || token.closed) return;
		token.closed = true; rounds.delete(token);
		const marker = markers.get(token.dying);
		if (marker && --marker.count === 0) { marker.node?.remove(); markers.delete(token.dying); }
	}
	function refresh() {
		const current = stack[stack.length - 1];
		env.document?.body?.classList.toggle('hh-rescue-active', !!current?.node);
		for (const token of stack) if (token.node) { token.node.hidden = token !== current; token.node.style.display = token === current ? 'block' : 'none'; }
		game?.hhAIThinkProgress?.refresh();
	}
	function end(token) {
		if (token.closed) return;
		token.closed = true; env.clearTimer(token.timer); token.settle?.(false);
		token.progress = null;
		token.node?.remove();
		const index = stack.indexOf(token); if (index !== -1) stack.splice(index, 1);
		refresh();
	}
	function begin(player, dying, duration = 0) {
		const token = { player, dying, closed: false, startedAt: env.now(), progress: null };
		const progress = { rescue: true, elapsed: () => Math.max(0, env.now() - token.startedAt) };
		if (duration > 0) token.progress = progress;
		stack.push(token);
		try {
			const doc = env.document;
			if (doc?.createElement && player?.appendChild) {
				ensureStyle();
				const node = token.node = createPlayerTip(lib, 'hh-rescue-thinking', 'tiptao.png', doc);
				node.alt = '桃 思考中…'; node.setAttribute('role', 'status'); node.setAttribute('aria-label', node.alt);
				node.dataset.timed = String(duration > 0); player.appendChild(node);
			}
		} catch (error) { token.node?.remove(); token.node = null; console.warn('[HH优化] 求桃提示显示失败', error); }
		refresh();
		token.wait = (ms, valid = () => true) => new Promise(resolve => {
			token.startedAt = env.now(); token.progress = ms > 0 ? progress : null;
			const finish = value => {
				env.clearTimer(token.timer); token.timer = null; token.settle = null; token.progress = null;
				refresh(); resolve(value);
			};
			token.settle = finish; refresh();
			const tick = () => {
				if (token.closed || !valid()) { finish(false); return; }
				const remaining = ms - (env.now() - token.startedAt);
				if (remaining <= 0) { finish(true); return; }
				token.timer = env.setTimer(tick, Math.min(80, remaining));
			};
			tick();
		});
		return token;
	}
	const clear = () => { for (const token of [...stack].reverse()) end(token); for (const token of rounds) endRound(token); };
	lib.onover?.push(clear);
	return { begin, end, beginRound, endRound, clear, get active() { return !!stack[stack.length - 1]?.node; }, get current() { return stack[stack.length - 1] || null; } };
}
