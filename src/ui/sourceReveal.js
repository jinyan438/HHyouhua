// JiZhan uses the client's persistent central card stack (GMt), not a skill window.
import { originalDiscardScale } from './originalCards.js';
export const nativeRevealMotion = { cardWidth: 126, cardHeight: 174, scale: .87, gap: 5, duration: 250 };

export function getSourceRevealLayout(width, height, count, cardWidth = 126, cardHeight = 174, scale = .87, unit = 1) {
	const w = cardWidth * scale, h = cardHeight * scale;
	const total = count * w;
	const gap = total > width && count > 1 ? (width - total) / (count - 1) : nativeRevealMotion.gap * unit;
	const left = total > width ? 0 : (width - total) >> 1;
	const top = (height - h) >> 1;
	let x = left;
	return Array.from({ length: count }, () => { const point = { x, y: top, scale }; x += w + gap; return point; });
}

export function getSourceRevealOwner(event, lib) {
	const seen = new Set([event]);
	for (let parent = event?.getParent?.() || event?.parent; parent && !seen.has(parent); parent = parent.getParent?.() || parent.parent) {
		seen.add(parent);
		if (lib.skill?.[parent.name] || lib.card?.[parent.name] || parent.skill && lib.skill?.[parent.skill]) return parent;
		if (/^(phase|chooseTo|useCard|respond|judge)/.test(parent.name || '')) break;
	}
	return null;
}

const arenas = new WeakMap();

function getBoard({ ui, lib, game }) {
	let board = arenas.get(ui.arena);
	if (board) return board;
	const sessions = new Map(), doc = ui.arena.ownerDocument, view = doc.defaultView;
	const transform = point => `translate(${point.x}px,${point.y}px) scale(${point.scale})`;
	const current = () => [...sessions.values()].at(-1);
	const showCurrent = () => {
		for (const session of sessions.values()) for (const item of session.items) item.node.style.visibility = session === current() ? '' : 'hidden';
	};
	function layout(session, animate = true) {
		const bounds = globalThis.decadeUI?.boundsCaches?.arena;
		bounds?.check?.();
		const width = bounds?.cardWidth || 126, height = bounds?.cardHeight || 174;
		const bodyHeight = globalThis.decadeUI?.get?.bodySize?.().height || ui.arena.clientHeight;
		const scale = bodyHeight * originalDiscardScale / height;
		const areaWidth = ui.arena.clientWidth * .7;
		const points = getSourceRevealLayout(areaWidth, ui.arena.clientHeight, session.items.length, width, height, scale, scale / nativeRevealMotion.scale);
		session.items.forEach((item, index) => {
			const node = item.node, point = points[index];
			point.x += (ui.arena.clientWidth - areaWidth) / 2 + (width * scale - width) / 2;
			point.y += (height * scale - height) / 2;
			const start = item.motion ? view.getComputedStyle(node).transform : node.style.transform || transform({ x: (ui.arena.clientWidth - width * scale) / 2, y: point.y, scale });
			item.motion?.cancel();
			node.style.width = width + 'px'; node.style.height = height + 'px';
			node.tx = point.x; node.ty = point.y; node.scaled = true;
			node.style.transform = transform(point);
			if (animate && lib.config.animation !== false && node.animate) {
				// Laya.Ease.sineOut: interpolate the transform with sin(pi*t/2).
				const from = new view.DOMMatrix(start === 'none' ? undefined : start), to = new view.DOMMatrix(transform(point));
				const frames = Array.from({ length: 17 }, (_, i) => {
					const t = Math.sin(i / 16 * Math.PI / 2);
					return { transform: `matrix(${from.a + (to.a - from.a) * t},0,0,${from.d + (to.d - from.d) * t},${from.e + (to.e - from.e) * t},${from.f + (to.f - from.f) * t})`, offset: i / 16 };
				});
				item.motion = node.animate(frames, { duration: nativeRevealMotion.duration, easing: 'linear' });
			}
		});
	}
	function close(owner) {
		const session = sessions.get(owner);
		if (!session) return;
		sessions.delete(owner);
		session.closed = true;
		for (const item of session.items) {
			item.motion?.cancel();
			item.node.remove();
			item.node.fixed = item.fixed;
		}
		showCurrent();
		if (!sessions.size) view.removeEventListener('resize', resize);
	}
	function resize() { for (const session of sessions.values()) layout(session, false); }
	board = {
		open(owner) {
			let session = sessions.get(owner);
			if (session) return session;
			session = { items: [], add(node, card, label, index = this.items.length) {
				if (!node || this.closed) return;
				const existing = this.items.find(item => item.node === node);
				if (existing) return existing;
				const old = this.items.find(item => item.card === card);
				if (old) { node.remove(); card.clone = old.node; return old; }
				const item = { node, card, fixed: node.fixed };
				this.items.splice(index, 0, item);
				node.fixed = true;
				node.classList.add('hh-source-reveal-card');
				node.classList.remove('button', 'selected', 'selectable', 'removing');
				node.style.transformOrigin = '0 0';
				if (label) {
					const tag = node.querySelector('.used-info') || node.appendChild(doc.createElement('div'));
					tag.className = 'used-info'; tag.textContent = label;
				}
				ui.thrown = (ui.thrown || []).filter(item => item !== node);
				ui.arena.appendChild(node);
				// Native gain2 and HH draw motion can now reuse the actual displayed origin.
				if (card) card.clone = node;
				layout(this); showCurrent();
				return item;
			} };
			sessions.set(owner, session);
			owner.insertAfter(async () => close(owner), {});
			view.addEventListener('resize', resize);
			return session;
		},
		clear() { for (const owner of [...sessions.keys()]) close(owner); },
	};
	(lib.onover ||= []).push(() => board.clear());
	arenas.set(ui.arena, board);
	return board;
}

// Called synchronously while the native dialog opens, after showCardsFixing.
// The engine still owns triggers, logging, visibility, delays, callbacks and close.
export function decorateSourceRevealDialog(dialog, event, context) {
	const { lib, game, ui, get, _status } = context;
	if (!ui.arena || _status.connectMode || game.online || _status.video || game.chess || !event || !['showCards', 'judge'].includes(event.name)) return false;
	if (event.name === 'showCards' && (event.flashAnimation || event.hiddencards?.length || event.createDialog || event.dialog != null || event.customButton || event.triggeronly ||
		!event.cards?.length || event.cards.some(card => !['c', 'o'].includes(get.position(card, true)) || get.owner(card)))) return false;
	const owner = getSourceRevealOwner(event, lib);
	if (!owner?.insertAfter) return false;
	const nodes = event.name === 'judge' ? [event.node] : dialog.buttons;
	if (!nodes?.length || !nodes[0]) return false;
	const session = getBoard(context).open(owner);
	const skill = owner.skill || owner.name;
	for (const node of nodes) session.add(node, event.name === 'judge' ? event.player?.judging?.[0] : node.link, event.name === 'showCards' ? get.translation(skill) + '展示' : '');
	if (event.name === 'judge' && !event._hhRevealJudgeHook) {
		event._hhRevealJudgeHook = true;
		let item = session.items.find(item => item.node === event.node);
		event.pushHandler?.((judge, option) => {
			if (option.state !== 'end' || session.closed) return;
			const card = judge.result?.card || judge.player?.judging?.[0];
			// Rejudging keeps the final card and its original result animation.
			if (card && card !== item?.card && card.clone) {
				const index = session.items.indexOf(item);
				if (index < 0) return;
				item.motion?.cancel(); item.node.remove(); item.node.fixed = item.fixed;
				session.items.splice(index, 1);
				item = session.add(card.clone, card, '', index);
			}
		});
	}
	dialog.classList.add('hh-source-reveal-dialog');
	dialog.peaceDialog = true;
	return true;
}
