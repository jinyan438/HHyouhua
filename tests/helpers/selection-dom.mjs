import fs from 'node:fs';
import vm from 'node:vm';
import { domFixture } from './catalog-dom.mjs';

// Minimal DOM around the real Dialog.open hook, including capture events and cleanup.
export function selectionFixture({ mode = 'doudizhu', role = 'zhu', count = role === 'zhu' ? 6 : 3, select = 1, fixed = false, teammate = false, cards = false, setup } = {}) {
	const dom = domFixture(), { document, Element } = dom;
	const proto = Element.prototype;
	Object.defineProperties(proto, {
		childElementCount: { get() { return this.children.length; } },
		nextSibling: { get() { return this.parentNode?.children[this.parentNode.children.indexOf(this) + 1] || null; } },
		innerHTML: { set(value) {
			this.textContent = ''; const stack = [this];
			for (const token of String(value).match(/<[^>]*>|[^<]+/g) || []) {
				if (token.startsWith('</')) { stack.pop(); continue; }
				if (!token.startsWith('<')) { stack.at(-1).append(token); continue; }
				const child = new Element(token.match(/^<([\w-]+)/)[1]);
				for (const [, key, val] of token.matchAll(/([\w-]+)="([^"]*)"/g)) {
					if (key === 'class') child.className = val; else child.setAttribute(key, val);
				}
				stack.at(-1).appendChild(child);
				if (!/\/\s*>$/.test(token) && !/^<(img|br|input)\b/.test(token)) stack.push(child);
			}
		}, get() { return this.textContent; } },
	});
	proto.append = function (...items) { for (let child of items) { if (typeof child === 'string') { const text = new Element('span'); text.textContent = child; child = text; } this.appendChild(child); } };
	proto.replaceChildren = function (...items) { this.textContent = ''; this.append(...items); };
	proto.insertBefore = function (child, anchor) { if (!anchor) return this.appendChild(child); child.remove(); this.children.splice(this.children.indexOf(anchor), 0, child); child.parentNode = this; return child; };
	proto.replaceWith = function (child) { const parent = this.parentNode; parent.insertBefore(child, this); this.remove(); };
	proto.contains = function (node) { while (node) { if (node === this) return true; node = node.parentNode; } return false; };
	proto.closest = function (selector) { let node = this; while (node) { if (selector.startsWith('.') && node.classList.contains(selector.slice(1))) return node; node = node.parentNode; } return null; };
	proto.removeAttribute = function (key) { delete this.attributes[key]; };
	proto.addEventListener = function (type, callback, options = {}) {
		const list = this.listeners.get(type) || []; list.push({ callback, capture: options === true || !!options.capture }); this.listeners.set(type, list);
		options.signal?.addEventListener('abort', () => this.removeEventListener(type, callback), { once: true });
	};
	proto.removeEventListener = function (type, callback) { this.listeners.set(type, (this.listeners.get(type) || []).filter(item => item.callback !== callback)); };
	proto.emit = function (type, properties = {}) {
		const event = { type, target: this, button: 0, isPrimary: true, clientX: 0, clientY: 0, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, stopImmediatePropagation() { this.immediate = true; }, ...properties };
		for (const { callback } of [...this.listeners.get(type) || []].sort((a, b) => Number(b.capture) - Number(a.capture))) { callback.call(this, event); if (event.immediate) break; }
		return event;
	};
	proto.getBoundingClientRect = function () { const width = this.classList.contains('hh-identity-selection') ? 2760 : this.offsetWidth, height = this.offsetHeight; return { left: 0, top: 0, width, height, right: width, bottom: height }; };
	document.addEventListener = proto.addEventListener.bind(document); document.removeEventListener = proto.removeEventListener.bind(document);
	const observers = [], calls = { check: 0, ok: 0, nativeClicks: 0, close: 0 }, window = new Element();
	window.matchMedia = () => ({ matches: true });
	class Observer { constructor(callback) { this.callback = callback; observers.push(this); } observe() {} disconnect() { this.disconnected = true; } }
	// Native AbortController's warning threshold is inappropriate for a dialog with many cards.
	class Controller { constructor() { this.signal = new Element(); } abort() { this.signal.emit('abort'); } }
	class Dialog extends Element {
		constructor() { super(); this.className = 'dialog'; const container = new Element(); container.className = 'content-container'; this.content = new Element(); this.content.className = 'content'; container.append(this.content); this.append(container); this.buttons = []; }
		open() { document.body.append(this); return this; }
		close() { calls.close++; this.remove(); }
	}
	const lib = { arenaReady: [], element: { Dialog }, config: {}, character: {}, characterReplace: {}, skill: {}, translate: {}, filter: { characterDisabled: () => false } };
	for (let i = 0; i < 40; i++) lib.character['general' + i] = { group: 'shu', hp: 4, maxHp: 4, skills: ['rende'] };
	const game = { players: [], online: false, getRarity: () => 'rare', uncheck() {}, check() {
		calls.check++; for (const button of dialog.buttons) button.classList.toggle('selectable', event.filterButton(button));
		return selected.length === get.select(event.selectButton)[1];
	} };
	for (let i = 0; i < 3; i++) game.players.push({ identity: i === 0 ? 'zhu' : 'fan', identityShown: true });
	game.zhu = game.players[0]; game.me = game.players[role === 'zhu' ? 0 : 2];
	const get = { mode: () => mode, sourceCharacter: id => id, character: id => lib.character[id], translation: id => ({ rende: '仁德', shu: '蜀' })[id] || id, slimName: id => id, skillInfoTranslation: () => '出牌阶段，可以将手牌交给其他角色。', cnNumber: n => ['零','一','二','三','四','五','六','七','八'][n], distance: (a, b) => (game.players.indexOf(b) - game.players.indexOf(a) + 3) % 3, select: value => typeof value === 'function' ? get.select(value()) : Array.isArray(value) ? value : [value ?? 1, value ?? 1] };
	const selected = []; selected.add = item => { if (!selected.includes(item)) selected.push(item); }; selected.remove = item => { const i = selected.indexOf(item); if (i >= 0) selected.splice(i, 1); };
	const ui = { window: document.body, control: new Element(), selected: { buttons: selected }, click: { ok() { calls.ok++; event.result = { confirm: 'ok' }; } }, create: {} };
	document.body.append(ui.control);
	const makeButton = (id, type, parent, noclick) => { const button = new Element(); button.className = 'button character'; button.link = id; button.refresh = (_, next) => { button.link = next; }; if (!noclick) button.addEventListener('click', () => calls.nativeClicks++); parent?.appendChild(button); return button; };
	ui.create.button = makeButton;
	ui.create.buttons = (list, type, position, noclick) => list.map(id => makeButton(id, type, position, noclick));
	ui.create.dialog = () => new Dialog();
	const dialog = new Dialog();
	function group(ids, character = true) { const box = new Element(); box.className = 'buttons'; for (const id of ids) { const button = makeButton(id); if (!character) button.className = 'button card'; dialog.buttons.push(button); box.append(button); } dialog.content.append(box); }
	const own = Object.keys(lib.character).slice(0, count); group(own);
	if (teammate) { const caption = new Element(); caption.className = 'caption'; caption.textContent = '队友的武将'; dialog.content.append(caption); group(Object.keys(lib.character).slice(count, count + 3)); }
	if (cards) group([{ name: 'sha' }, { name: 'shan' }], false);
	const parent = fixed ? {} : { list: Object.keys(lib.character).slice(count) };
	parent.name = 'chooseCharacter';
	parent._hhRevealedIdentity = game.me.identity;
	const event = { name: 'chooseButton', player: game.me, dialog, selectButton: select, filterButton: button => typeof button.link === 'string' && (!teammate || own.includes(button.link)), getParent: name => name === 'chooseCharacter' ? parent : null };
	const _status = { event };
	setup?.({ lib, game, ui, get, _status, event, dialog, document });
	const context = vm.createContext({ document, window, lib, game, get, ui, _status, Date, Event, ResizeObserver: Observer, MutationObserver: Observer, AbortController: Controller, setTimeout: dom.environment.setTimer, clearTimeout: dom.environment.clearTimer,
		findSelectionPlayerTemplate: () => null, createSelectionPlayerVisual() { throw new Error('Unexpected player initialization'); }, captureSelectionPlayerLayout() {} });
	const source = fs.readFileSync(new URL('../../identity-selection.js', import.meta.url), 'utf8').replace(/^import[^\n]*\n/gm, '').replace('export function ', 'function ');
	const picker = fs.readFileSync(new URL('../../src/ui/selectionFreePick.js', import.meta.url), 'utf8').replace(/^import[^\n]*\n/gm, '').replace('export function ', 'function ');
	const input = fs.readFileSync(new URL('../../src/ui/selectionCardInput.js', import.meta.url), 'utf8').replace('export function ', 'function ');
	const versus = fs.readFileSync(new URL('../../src/ui/versusSelection.js', import.meta.url), 'utf8').replace(/^import[^\n]*\n/gm, '').replace('export function ', 'function ');
	const recommendation = fs.readFileSync(new URL('../../src/ui/versusRecommendation.js', import.meta.url), 'utf8').replace('export function ', 'function ');
	const candidates = fs.readFileSync(new URL('../../src/ui/happySelectionCandidates.js', import.meta.url), 'utf8').replace('export function ', 'function ');
	vm.runInContext(input + '\n' + picker + '\n' + recommendation + '\n' + versus + '\n' + candidates + '\n' + source + '\ninstallIdentitySelection(lib, game, ui, get, _status);', context);
	lib.arenaReady.forEach(fn => fn());
	return { ...dom, context, lib, game, get, ui, _status, parent, event, dialog, calls, observers, own, open() { dialog.open(); game.check(); return dialog._hhSelection; } };
}
