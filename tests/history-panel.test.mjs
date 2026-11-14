import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../ui/lbtn/skins/online.js', import.meta.url), 'utf8')
	.replace(/^import .*;\r?\n/gm, '')
	.replace('export function createOnlineLbtnPlugin', 'function createOnlineLbtnPlugin');

class Element {
	constructor(selector = '', parent) {
		this.selector = selector;
		this.parentNode = parent;
		this.style = {};
		this.children = [];
		this.listeners = [];
		this.hidden = false;
		this.classList = new Set();
		this.classList.remove = value => this.classList.delete(value);
		this.classList.contains = value => this.classList.has(value);
		parent?.children.push(this);
	}
	addEventListener(type, handler, options) {
		this.listeners.push({ type, handler, capture: options === true || options?.capture });
	}
	closest(selectors) {
		return selectors.split(',').some(selector => selector.trim() === this.selector) ? this : this.parentNode?.closest(selectors);
	}
	remove() {
		this.removed = true;
		this.parentNode?.children.splice(this.parentNode.children.indexOf(this), 1);
		this.parentNode = null;
	}
	show() { this.hidden = false; }
	hide() { this.hidden = true; }
	click(type = 'click', cancelable = true) {
		const event = {
			type, target: this, cancelable, stopped: false, defaultPrevented: false,
			stopPropagation() { this.stopped = true; },
			preventDefault() { this.defaultPrevented = true; },
		};
		const path = [];
		for (let node = this; node; node = node.parentNode) path.push(node);
		for (const capture of [true, false]) {
			for (const node of capture ? path.slice().reverse() : path) {
				for (const listener of node.listeners) {
					if (listener.type === type && !!listener.capture === capture) listener.handler.call(node, event);
				}
				if (event.stopped) return event;
			}
		}
		return event;
	}
}

function setup(touchscreen = false) {
	const status = { gameStarted: true };
	const calls = { resume: 0, onresume: 0, leaked: 0 };
	const ui = {
		window: new Element('#window'), system: new Element(), time: new Element(),
		arena: new Element(), historybar: new Element(), pause: new Element(),
		click: { shortcut() {}, resume() { throw Error('不能再使用受全局状态拦截的通用恢复方法'); } },
		create: { div: (selector, parent) => new Element(selector, parent) },
	};
	const game = {
		pause2() { status.paused2 = true; },
		resume2() { status.paused2 = false; calls.resume++; },
		onresume() { calls.onresume++; },
	};
	const context = vm.createContext({
		createBaseLbtnPlugin: () => ({}),
		// 关闭响应不应再依赖打开后的定时器。
		setTimeout() { throw Error('不应延迟注册关闭事件'); },
	});
	vm.runInContext(source, context);
	const plugin = context.createOnlineLbtnPlugin({ config: { touchscreen } }, game, ui, {}, {}, status, {});
	plugin.initPauseOverride();
	plugin.showHistoryPanel = () => {
		const node = ui.create.pause();
		ui.time.hide();
		ui.historybar.classList.add('paused');
		ui.arena.classList.add('paused');
		ui.window.classList.add('touchinfohidden');
		return node;
	};
	const open = () => {
		ui.click.pause();
		return ui.window.children.at(-1);
	};
	ui.window.addEventListener('click', () => calls.leaked++);
	ui.window.addEventListener('touchend', () => calls.leaked++);
	return { status, ui, game, calls, open };
}

function assertResumed(h, node, count = 1) {
	assert.equal(node.removed, true, '关闭后立即移除遮罩');
	assert.equal(h.status.paused2, false, '恢复游戏暂停状态');
	for (const key of ['pausing', 'clicked', 'dragged']) assert.equal(h.status[key], false, key);
	assert.equal(h.ui.system.hidden, false);
	assert.equal(h.ui.time.hidden, false);
	assert.equal(h.ui.historybar.classList.has('paused'), false);
	assert.equal(h.ui.arena.classList.has('paused'), false);
	assert.equal(h.ui.window.classList.has('touchinfohidden'), false);
	assert.equal(h.calls.resume, count);
	assert.equal(h.calls.onresume, count);
	assert.equal(h.calls.leaked, 0, '关闭事件不能继续触发游戏操作');
}

for (const touchscreen of [false, true]) {
	for (const type of ['click', 'touchend', 'contextmenu']) {
		test(`触屏设置 ${touchscreen}：${type} 立即关闭，并忽略所有点击/拖动/打开状态组合`, () => {
			for (let flags = 0; flags < 8; flags++) {
				const h = setup(touchscreen);
				const node = h.open();
				Object.assign(h.status, { clicked: !!(flags & 1), dragged: !!(flags & 2), pausing: !!(flags & 4) });
				const event = node.children[0].click(type);
				assert.equal(event.defaultPrevented, true);
				assertResumed(h, node);
			}
		});
	}
}

test('筛选玩家、点击和滚动记录不关闭，之后点击右侧仍能关闭', () => {
	for (const selector of ['.bigbgjilu', '.historybg', '#sidebar', '#sidebar3']) {
		const h = setup(true);
		const node = h.open();
		const content = new Element(selector, node);
		const child = new Element('.record', content);
		let filtered = 0;
		child.addEventListener('click', event => { filtered++; event.stopPropagation(); });
		child.click();
		child.click('touchend');
		assert.equal(filtered, 1);
		assert.equal(node.removed, undefined);
		assert.equal(h.status.paused2, true);
		assert.equal(h.calls.resume, 0);
		h.calls.leaked = 0;
		h.status.dragged = true;
		node.children[0].click();
		assertResumed(h, node);
	}
});

test('捕获阶段关闭，右侧子元素阻止冒泡也不会卡住', () => {
	const h = setup();
	const node = h.open();
	const child = new Element('.right-child', node.children[0]);
	child.addEventListener('click', event => { event.stopPropagation(); h.status.clicked = true; });
	child.click();
	assertResumed(h, node);
});

test('触摸后的重复点击只恢复一次；反复打开关闭不残留遮罩和暂停状态', () => {
	const h = setup(true);
	for (let count = 1; count <= 30; count++) {
		const node = h.open();
		const right = node.children[0];
		right.click('touchend');
		right.click();
		assertResumed(h, node, count);
		assert.equal(h.ui.window.children.length, 0);
	}
});

test('点击遮罩本身、不可取消的事件、没有 onresume 回调时也能恢复', () => {
	const h = setup();
	delete h.game.onresume;
	const node = h.open();
	node.click('touchend', false);
	assert.equal(node.removed, true);
	assert.equal(h.status.paused2, false);
	assert.equal(h.calls.resume, 1);
});
