export function domFixture() {
	const document = { listeners: new Map(), activeElement: null, hidden: false };
	function matches(element, selector) {
		const tag = selector.match(/^[a-z]+/i)?.[0];
		if (tag && element.tagName !== tag.toUpperCase()) return false;
		for (const match of selector.matchAll(/\.([\w-]+)/g)) if (!element.classList.contains(match[1])) return false;
		for (const match of selector.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)) {
			const value = element.getAttribute(match[1]); if (value == null || match[2] !== undefined && value !== match[2]) return false;
		}
		return true;
	}
	class Element {
		constructor(tag = 'div') {
			this.tagName = tag.toUpperCase(); this.ownerDocument = document; this.children = []; this.listeners = new Map(); this.dataset = {}; this.attributes = {}; this.style = { setProperty(key, value) { this[key] = value; } };
			this.scrollTop = 0; this.scrollHeight = 1000; this.clientHeight = 400; this.offsetTop = 0; this.offsetLeft = 0; this.offsetWidth = 56; this.offsetHeight = 58; this.value = ''; this.hidden = false;
			const classes = new Set(); this.classList = { add: (...names) => names.forEach(name => classes.add(name)), remove: (...names) => names.forEach(name => classes.delete(name)), contains: name => classes.has(name), toggle(name, active = !classes.has(name)) { if (active) classes.add(name); else classes.delete(name); return active; } };
			Object.defineProperty(this, 'className', { get: () => [...classes].join(' '), set: value => { classes.clear(); value.split(/\s+/).filter(Boolean).forEach(name => classes.add(name)); } });
		}
		get firstChild() { return this.children[0] || null; }
		get parentElement() { return this.parentNode; }
		get childNodes() { return this.children; }
		get isConnected() { let node = this; while (node) { if (node === document.body) return true; node = node.parentNode; } return false; }
		set textContent(value) { this._text = String(value); for (const child of this.children) child.parentNode = null; this.children = []; }
		get textContent() { return (this._text || '') + this.children.map(child => child.textContent).join(''); }
		set innerHTML(value) { this.textContent = value; } get innerHTML() { return this.textContent; }
		appendChild(child) { if (child.fragment) { for (const item of [...child.children]) this.appendChild(item); return child; } child.remove(); this.children.push(child); child.parentNode = this; return child; }
		removeChild(child) { if (child.parentNode !== this) throw new Error('Not a child'); child.remove(); return child; }
		remove() { if (this.parentNode) { const index = this.parentNode.children.indexOf(this); if (index >= 0) this.parentNode.children.splice(index, 1); } this.parentNode = null; }
		delete() { this.remove(); }
		setAttribute(key, value) { this.attributes[key] = String(value); }
		getAttribute(key) { if (key.startsWith('data-')) return this.dataset[key.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] ?? null; return this.attributes[key] ?? (key === 'tabindex' && this.tabIndex !== undefined ? String(this.tabIndex) : null); }
		querySelectorAll(selector) { const found = [], selectors = selector.split(','); function visit(parent) { for (const child of parent.children) { if (selectors.some(item => matches(child, item.trim()))) found.push(child); visit(child); } } visit(this); return found; }
		querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
		addEventListener(type, callback) { const list = this.listeners.get(type) || []; list.push(callback); this.listeners.set(type, list); }
		removeEventListener(type, callback) { this.listeners.set(type, (this.listeners.get(type) || []).filter(item => item !== callback)); }
		emit(type, properties = {}) { const event = { type, button: 0, clientX: 0, clientY: 0, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, ...properties }; for (const fn of [...this.listeners.get(type) || []]) fn.call(this, event); return event; }
		focus() { document.activeElement = this; }
		getClientRects() { let node = this; while (node) { if (node.hidden) return []; node = node.parentNode; } return this.isConnected ? [{}] : []; }
		getBoundingClientRect() { return { left: this.offsetLeft, top: this.offsetTop, width: this.offsetWidth, height: this.offsetHeight }; }
		setBackground(id) { this.portraitId = id; }
		setBackgroundImage(path) { this.style.backgroundImage = path; return this; }
	}
	document.body = new Element('body'); document.activeElement = document.body;
	document.createElement = tag => new Element(tag); document.createDocumentFragment = () => Object.assign(new Element(), { fragment: true });
	document.addEventListener = Element.prototype.addEventListener.bind(document); document.removeEventListener = Element.prototype.removeEventListener.bind(document); document.emit = Element.prototype.emit.bind(document);
	let time = 0, sequence = 0; const timers = new Map();
	const environment = { document, window: { PointerEvent: function () {} }, now: () => time, setTimer(fn, ms) { const id = ++sequence; timers.set(id, { at: time + ms, fn }); return id; }, clearTimer(id) { timers.delete(id); } };
	function advance(ms) { const end = time + ms; for (;;) { const next = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0]; if (!next) break; time = next[1].at; timers.delete(next[0]); next[1].fn(); } time = end; }
	return { document, Element, environment, advance, timers };
}
