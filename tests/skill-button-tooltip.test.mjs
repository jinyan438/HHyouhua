import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { domFixture } from './helpers/catalog-dom.mjs';

const source = fs.readFileSync(new URL('../src/ui/skillButtonTooltip.js', import.meta.url), 'utf8')
	.replace(/import .* from "noname";/, '').replace(/export /g, '');

function fixture() {
	const h = domFixture(), frames = [];
	h.Element.prototype.contains = function (target) {
		for (let node = target; node; node = node.parentNode) if (node === this) return true;
		return false;
	};
	const add = h.document.addEventListener;
	h.document.addEventListener = (type, callback, capture) => {
		assert.equal(capture, true, 'Dismiss before game controls can stop bubbling');
		if (!h.document.listeners.get(type)?.includes(callback)) add(type, callback);
	};
	const arena = h.document.createElement('div');
	h.document.body.appendChild(arena);
	const first = h.document.createElement('button'), second = h.document.createElement('button');
	const label = h.document.createElement('span');
	arena.append(first, second); first.appendChild(label);
	const context = vm.createContext({
		document: h.document, ui: { arena }, lib: { translate: { first: '夺首', second: '飞扬' } },
		get: { translation: (skill, type) => type === 'info' ? '锁定技。①技能说明。' : skill },
		requestAnimationFrame: callback => frames.push(callback),
		setTimeout: h.environment.setTimer, clearTimeout: h.environment.clearTimer,
	});
	vm.runInContext(source + '\nglobalThis.controller = new SkillButtonTooltip();', context);
	const controller = context.controller;
	return { ...h, controller, arena, first, second, label,
		frame() { for (const callback of frames.splice(0)) callback(); },
		listenerCount() { return [...h.document.listeners.values()].reduce((sum, list) => sum + list.length, 0); },
	};
}

test('outside mouse, touch and click interactions dismiss the skill description', () => {
	for (const type of ['pointerdown', 'touchstart', 'click']) {
		const h = fixture();
		h.controller.show(h.first, 'first'); h.frame();
		assert.equal(h.controller.tooltip.style.opacity, '1');
		h.document.emit(type, { target: h.arena });
		assert.equal(h.controller.currentButton, null);
		assert.equal(h.controller.tooltip.style.opacity, '0');
		assert.equal(h.listenerCount(), 0);
		h.advance(200);
		assert.equal(h.controller.tooltip.style.display, 'none');
	}
});

test('the opening interaction on a button or its label keeps its description visible', () => {
	const h = fixture();
	h.controller.attach(h.first, 'first'); h.controller.attach(h.first, 'first');
	assert.equal(h.first.listeners.get('touchend').length, 1);
	h.first.emit('touchend'); h.frame();
	for (const type of ['pointerdown', 'touchstart', 'click']) {
		for (const target of [h.first, h.label]) h.document.emit(type, { target });
	}
	assert.equal(h.controller.currentButton, h.first);
	assert.equal(h.controller.tooltip.style.opacity, '1');
	h.controller.destroy();
});

test('a touch can reopen the same skill without another mouseenter or a stale fade timeout', () => {
	const h = fixture(); h.controller.attach(h.first, 'first');
	h.first.emit('touchend'); h.frame();
	h.document.emit('touchstart', { target: h.arena }); h.advance(100);
	h.first.emit('touchend'); h.frame(); h.advance(200);
	assert.equal(h.controller.currentButton, h.first);
	assert.equal(h.controller.tooltip.style.display, 'block');
	assert.equal(h.controller.tooltip.style.opacity, '1');
	assert.equal(h.listenerCount(), 3);
	h.controller.destroy();
});

test('closing before the render frame cannot revive the hidden tooltip', () => {
	const h = fixture(); h.controller.show(h.first, 'first');
	h.document.emit('pointerdown', { target: h.arena });
	h.frame(); h.advance(200);
	assert.equal(h.controller.tooltip.style.opacity, '0');
	assert.equal(h.controller.tooltip.style.display, 'none');
	assert.equal(h.controller.currentButton, null);
});

test('switching skills ignores the old button render and mouseleave', () => {
	const h = fixture(); h.controller.attach(h.first, 'first');
	h.first.emit('mouseenter');
	h.controller.show(h.second, 'second'); h.first.emit('mouseleave'); h.frame();
	assert.equal(h.controller.currentButton, h.second);
	assert.ok(h.controller.tooltip.innerHTML.includes('飞扬'));
	assert.equal(h.controller.tooltip.style.opacity, '1');
	assert.equal(h.listenerCount(), 3);
	h.controller.destroy();
});

test('destroy removes the tooltip, outside listeners and timers before a pending frame', () => {
	const h = fixture(); h.controller.show(h.first, 'first');
	h.controller.destroy(); h.frame(); h.advance(300);
	assert.equal(h.controller.tooltip, null);
	assert.equal(h.controller.currentButton, null);
	assert.equal(h.arena.querySelector('.skill-button-tooltip'), null);
	assert.equal(h.listenerCount(), 0);
	assert.equal(h.timers.size, 0);
});
