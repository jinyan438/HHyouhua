import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function harness({ disabled, spine = true } = {}) {
	const calls = [], timers = [];
	const lib = { config: { extension_HH优化_killEffect: true } };
	if (disabled !== undefined) lib.config.extension_HH优化_disable_native_kill_effect = disabled;
	const _status = { paused: true, paused2: true };
	const game = {
		playAudio(...args) { calls.push(['audio', ...args]); },
		broadcastAll(callback, ...args) { calls.push(['broadcast']); callback(...args); },
	};
	const ui = { window: { offsetHeight: 800, appendChild() { calls.push(['append']); } }, refresh() {} };
	const decadeUI = {
		extensionName: 'HH优化',
		dialog: { create(className) {
			calls.push(['create', className]);
			return { style: {}, classList: { add() {} }, close(ms) { calls.push(['close', ms]); } };
		} },
		animation: {
			canvas: { width: 1200, style: { zIndex: 3 } },
			getSpineBounds() { return spine ? { size: { x: 1000 } } : null; },
			playSpine(name) { calls.push(['spine', name]); },
		},
		delay(ms) { calls.push(['delay', ms]); },
		getRandom(min) { return min; },
	};
	const context = vm.createContext({ lib, game, ui, _status, decadeUI, window: { decadeUI },
		get: { itemtype: value => value?.kind },
		setTimeout(fn, ms) { timers.push({ fn, ms }); },
	});
	for (const file of ['effects/config.js', 'effects/utils.js', 'effects/kill.js', 'skills/animate.js']) {
		const source = readFileSync(new URL('../src/' + file, import.meta.url), 'utf8')
			.replace(/^import .*;\r?$/gm, '').replace(/^export /gm, '');
		vm.runInContext(source, context, { filename: file });
	}
	decadeUI.effect = { kill: context.playKillEffect };
	const hook = vm.runInContext('animateSkill.decadeUI_dieKillEffect', context);
	// The engine recompiles skill content; callbacks must also work without module closures.
	hook.content = vm.runInContext('(' + hook.content.toString().replace(/^async content/, 'async function') + ')', context);
	const player = () => ({ kind: 'player', isUnseen: () => false, node: { avatar: { style: { backgroundImage: 'url(avatar.jpg)' } } } });
	return { lib, game, _status, decadeUI, calls, timers, hook, play: context.playKillEffect, source: player(), target: player() };
}

test('disabling native defeat suppresses visuals, sound, timers and its wait through direct and compiled skill calls', async () => {
	for (const spine of [true, false]) {
		const h = harness({ disabled: true, spine });
		assert.equal(h.hook.filter(), false);
		h.play(h.source, h.target);
		await h.hook.content({}, { source: h.source, player: h.target });
		assert.deepEqual(h.calls, [['broadcast']]);
		assert.equal(h.timers.length, 0);
		assert.equal(h.decadeUI.animation.canvas.style.zIndex, 3);
		assert.deepEqual(h._status, { paused: true, paused2: true }, 'Other pause owners must remain untouched');
	}
});

test('absent or off setting keeps both original rendering paths and the exact 2000ms wait', async () => {
	for (const disabled of [undefined, false]) {
		for (const spine of [true, false]) {
			const h = harness({ disabled, spine });
			assert.equal(h.hook.filter(), true);
			await h.hook.content({}, { source: h.source, player: h.target });
			assert.equal(h.calls.filter(([kind]) => kind === 'audio').length, 1);
			assert.deepEqual(h.calls.filter(([kind]) => kind === 'delay'), [['delay', 2000]]);
			assert.deepEqual(h.calls.filter(([kind]) => kind === 'close'), [['close', 3000]]);
			assert.ok(h.calls.some(([kind]) => kind === 'append'));
			assert.equal(h.calls.some(([kind]) => kind === 'spine'), spine);
			assert.equal(h.timers.length, spine ? 1 : 10);
		}
	}
});

test('live toggles suppress an already queued effect and restore subsequent playback without changing legacy preferences', async () => {
	const h = harness({ disabled: false });
	assert.equal(h.hook.filter(), true);
	h.lib.config.extension_HH优化_disable_native_kill_effect = true;
	await h.hook.content({}, { source: h.source, player: h.target });
	assert.deepEqual(h.calls, [['broadcast']]);
	assert.equal(h.timers.length, 0);
	h.lib.config.extension_HH优化_disable_native_kill_effect = false;
	await h.hook.content({}, { source: h.source, player: h.target });
	assert.deepEqual(h.calls.filter(([kind]) => kind === 'delay'), [['delay', 2000]]);
	h.lib.config.extension_HH优化_killEffect = false;
	assert.equal(h.hook.filter(), false);
	for (const disabled of [true, false]) {
		h.lib.config.extension_HH优化_disable_native_kill_effect = disabled;
		assert.equal(h.hook.filter(), false, 'The existing kill-effect preference must still win');
	}
});
