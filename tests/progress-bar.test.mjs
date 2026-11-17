import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { domFixture } from './helpers/catalog-dom.mjs';
import { createPlayerTip } from '../src/ui/playerTip.js';
import { setupPlayerActionTimer } from '../src/features/playerActionTimer.js';

const source = readFileSync(new URL('../src/ui/progress-bar.js', import.meta.url), 'utf8')
	.replace(/^import[^\n]*\n/gm, '').replaceAll('export function ', 'function ');

function fixture(style = 'off') {
	const dom = domFixture(), { document, Element, environment } = dom;
	Element.prototype.getElementsByClassName = function (name) { return this.querySelectorAll('.' + name); };
	document.getElementById = id => document.body.querySelectorAll('div').find(node => node.id === id);
	const intervals = new Set();
	function setInterval(fn, ms) {
		const token = { active: true };
		const tick = () => { if (!token.active) return; fn(); if (token.active) token.timer = environment.setTimer(tick, ms); };
		token.timer = environment.setTimer(tick, ms); intervals.add(token); return token;
	}
	function clearInterval(token) { if (!token) return; token.active = false; environment.clearTimer(token.timer); intervals.delete(token); }
	const players = Array.from({ length: 3 }, () => document.createElement('div'));
	players.forEach(player => { player.className = 'player'; player.isPhaseUsing = () => true; player.isMine = () => player === game.me && !status.auto; document.body.appendChild(player); });
	const lib = { assetURL: '', config: { extension_HH优化_newDecadeStyle: style, extension_HH优化_jindutiaoYangshi: '2' }, onover: [] };
	const game = { me: players[0], players, Jindutiaoplayer() { const node = document.createElement('div'); node.id = 'jindutiaopl'; document.body.appendChild(node); return { update(fraction) { node.fraction = fraction; }, remove() { node.remove(); } }; } };
	const status = { gameStarted: true, currentPhase: players[1] };
	let clockOffset = 0;
	const context = vm.createContext({ document, window: {}, lib, game, ui: {}, get: {}, _status: status,
		createPlayerTip: (lib, className, imageName) => createPlayerTip(lib, className, imageName, document),
		setupPlayerActionTimer: context => setupPlayerActionTimer(context, { now: environment.now, setInterval, clearInterval }),
		performance: { now: () => environment.now() + clockOffset }, setInterval, clearInterval });
	vm.runInContext(source + '\nsetupWatcher({}); setupTipWatcher();', context);
	dom.advance(100);
	return { ...dom, context, lib, game, status, players, intervals, progress: game.hhAIThinkProgress,
		jump(ms) { clockOffset += ms; }, stop() { lib.onover.forEach(fn => fn()); } };
}

function bar(player) { return player.querySelector('.timeai,.timePhase'); }
function fraction(node) { return Number(node.firstChild.style.transform.match(/scaleX\((.+)\)/)[1]); }

for (const style of ['off', 'on']) {
	test(`AI bar uses a fixed 15-second scale and survives unpaused engine ticks (${style})`, () => {
		const h = fixture(style), player = h.players[1];
		const token = h.progress.begin(player, 1920, true), node = bar(player), tip = player.querySelector('.hh-ai-thinking');
		assert.ok(node && tip, 'Shown immediately, without waiting for the 100ms watcher');
		assert.equal(fraction(node), 1);
		assert.match(tip.src, /\/tip\.png$/);
		h.advance(960);
		assert.equal(bar(player), node, 'Watcher must keep the same node while the engine is not paused');
		assert.equal(player.querySelector('.hh-ai-thinking'), tip);
		assert.ok(Math.abs(fraction(node) - 0.936) < 1e-9);
		h.advance(928);
		assert.ok(fraction(node) > 0.87 && fraction(node) < 0.88);
		h.advance(32);
		assert.equal(fraction(node), 0.872, 'A 1.92-second thought consumes only 1.92 / 15 of the bar');
		assert.equal(bar(player), node, 'The actual wait controls when the remaining bar is removed');
		h.progress.end(token);
		assert.equal(bar(player), null);
		assert.equal(player.querySelector('.hh-ai-thinking'), null);
		h.stop(); assert.equal(h.intervals.size, 0);
	});
}

test('interaction resolution has no phase thinking label; real AI thought uses the original play style only while waiting', () => {
	for (const style of ['off', 'on']) {
		const h = fixture(style), player = h.players[1];
		for (const name of ['phaseUse', 'useCard', 'choosePlayerCard', 'gain', 'damage']) {
			h.status.event = { name, player }; h.status.paused = name === 'choosePlayerCard'; h.advance(200);
			assert.equal(player.querySelector('.tipshow'), null, `No phase label or replacement during ${name}`);
		}
		const token = h.progress.begin(player, 1920, true), tip = player.querySelector('.hh-ai-thinking');
		assert.match(tip.src, /\/tip\.png$/);
		assert.equal(tip.alt, '出牌 思考中…');
		h.advance(300); assert.equal(player.querySelectorAll('.tipshow').length, 1);
		h.progress.end(token); h.advance(200);
		assert.equal(player.querySelector('.tipshow'), null, 'Ending thought must not restore the old phase label');
		h.stop(); assert.equal(h.intervals.size, 0);
	}
});

test('discard hints retain their theme style, disappear after discard, and clear on game over', () => {
	for (const style of ['off', 'on']) {
		const h = fixture(style), player = h.players[1];
		h.status.event = { name: 'phaseDiscard', player }; h.advance(100);
		const tip = player.querySelector('.playertipQP');
		assert.ok(tip); assert.ok(tip.src.endsWith(style === 'off' ? '/tipQP.png' : '/discardtip.png'));
		h.status.event.name = 'phaseUse'; h.advance(100); assert.equal(player.querySelector('.tipshow'), null);
		h.status.event.name = 'phaseDiscard'; h.advance(100); assert.ok(player.querySelector('.playertipQP'));
		h.stop(); assert.equal(player.querySelector('.tipshow'), null); assert.equal(h.intervals.size, 0);
	}
});

test('three seconds of thinking consumes 20 percent of the 15-second bar', () => {
	const h = fixture(), token = h.progress.begin(h.players[1], 3000, true), node = bar(h.players[1]);
	h.advance(3000);
	assert.ok(Math.abs(fraction(node) - 0.8) < 32 / 15000, 'Animation may lag by at most one frame');
	h.progress.end(token);
	assert.equal(bar(h.players[1]), null, 'Finishing a thought removes the remaining 80 percent');
	h.stop();
});

test('the bar reaches zero at 15 seconds and never becomes negative', () => {
	const h = fixture(), token = h.progress.begin(h.players[1], 15000, true), node = bar(h.players[1]);
	h.advance(14976); assert.ok(fraction(node) > 0);
	h.advance(32); assert.equal(fraction(node), 0);
	h.advance(2000); assert.equal(fraction(node), 0);
	h.progress.end(token); h.stop(); assert.equal(h.intervals.size, 0);
});

test('a delayed animation frame consumes elapsed time against the fixed 15-second scale', () => {
	const h = fixture(), token = h.progress.begin(h.players[1], 1920, true), node = bar(h.players[1]);
	h.jump(928); h.advance(32);
	assert.ok(Math.abs(fraction(node) - 0.936) < 1e-9);
	h.progress.end(token); h.stop();
});

test('consecutive choices restart at full and an older completion cannot hide a newer countdown', () => {
	const h = fixture(), player = h.players[1];
	const first = h.progress.begin(player, 1920, true), old = bar(player);
	h.advance(960);
	const second = h.progress.begin(player, 960, true), next = bar(player);
	assert.notEqual(next, old); assert.equal(old.isConnected, false); assert.equal(fraction(next), 1);
	h.progress.end(first); assert.equal(bar(player), next);
	h.advance(480); assert.equal(fraction(next), 0.968, 'Shorter decisions keep the same consumption rate');
	const third = h.progress.begin(h.players[2], 960, false);
	assert.equal(bar(player), null); assert.ok(bar(h.players[2]));
	h.progress.end(second); assert.ok(bar(h.players[2]));
	h.progress.end(third); h.stop();
});

test('short or hidden thinking hints still get a correctly timed bar, including autoplay on the local seat', () => {
	const h = fixture(), token = h.progress.begin(h.game.me, 320, false), node = bar(h.game.me);
	assert.ok(node); assert.equal(h.game.me.querySelector('.hh-ai-thinking'), null);
	h.advance(160); assert.equal(fraction(node), 1 - 160 / 15000);
	h.progress.end(token); assert.equal(bar(h.game.me), null); h.stop();
});

test('manual player waits and Wuxie multiple-seat timers retain their normal lifecycle', () => {
	const h = fixture();
	h.status.event = { name: 'chooseToUse', player: h.game.me, isMine: () => true }; h.status.paused = true; h.advance(100);
	assert.ok(h.document.getElementById('jindutiaopl'));
	const token = h.progress.begin(h.players[1], 1920, true);
	assert.ok(h.document.getElementById('jindutiaopl'), 'An unrelated AI hint cannot cancel a real manual choice');
	h.progress.end(token); h.advance(100);
	assert.ok(h.document.getElementById('jindutiaopl'));
	h.status.event.type = 'wuxie'; h.advance(100);
	const nodes = h.players.slice(1).map(bar);
	assert.ok(nodes.every(Boolean));
	h.advance(300); assert.deepEqual(h.players.slice(1).map(bar), nodes);
	assert.ok(nodes.every(node => fraction(node) < 1));
	h.status.paused = false; h.advance(100);
	assert.equal(h.document.getElementById('jindutiaopl'), undefined);
	assert.ok(h.players.every(player => !bar(player))); h.stop();
});

test('an unpaused AI Wuxie thought masks the responder across every other seat without inspecting cards or skills', () => {
	for (const style of ['off', 'on']) {
		const h = fixture(style), responder = h.players[1];
		for (const player of h.players) {
			player.getCards = player.hasWuxie = player.hasSkillTag = () => { throw new Error('Hidden response capability must not affect presentation'); };
		}
		h.status.event = { name: 'chooseToUse', type: 'wuxie', player: responder };
		h.status.paused = false; h.status.imchoosing = false;
		const token = h.progress.begin(responder, 1920, true), nodes = h.players.slice(1).map(bar);
		assert.equal(bar(h.game.me), null); assert.ok(nodes.every(Boolean));
		assert.ok(h.players.slice(1).every(player => player.querySelector('.hh-ai-thinking')));
		h.advance(960);
		assert.deepEqual(h.players.slice(1).map(bar), nodes, 'Keep the whole group stable during engine ticks');
		assert.ok(nodes.every(node => Math.abs(fraction(node) - .936) < 1e-9));
		h.progress.end(token); h.advance(100);
		assert.ok(h.players.every(player => !bar(player) && !player.querySelector('.hh-ai-thinking')));
		h.stop(); assert.equal(h.intervals.size, 0);
	}
});

test('nested Wuxie skill choices keep the mask even if the global event changes during the wait', () => {
	const h = fixture(), responder = h.players[2];
	const question = { name: 'chooseToUse', type: 'wuxie', getParent: () => ({ name: '_wuxie' }) };
	const skill = { name: 'chooseButton', player: responder, getParent: () => question };
	h.status.event = { name: 'skillResolution', player: responder };
	const first = h.progress.begin(responder, 1920, true, skill);
	assert.ok(h.players.slice(1).every(player => bar(player) && player.querySelector('.hh-ai-thinking')));
	h.advance(500);
	const second = h.progress.begin(h.players[1], 960, false, question), nodes = h.players.slice(1).map(bar);
	h.progress.end(first); h.advance(480);
	assert.deepEqual(h.players.slice(1).map(bar), nodes);
	assert.ok(nodes.every(node => Math.abs(fraction(node) - .968) < 1e-9));
	assert.ok(h.players.every(player => !player.querySelector('.hh-ai-thinking')), 'Honor the global hint setting for every seat');
	h.progress.end(second); h.stop(); assert.equal(h.intervals.size, 0);
});

test('ordinary play inside a resolved Wuxie card keeps its own single-seat thinking display', () => {
	const h = fixture(), responder = h.players[1];
	const inquiry = { name: '_wuxie' }, resolved = { name: 'useCard', getParent: () => inquiry };
	const choice = { name: 'chooseTarget', player: responder, getParent: () => resolved };
	const token = h.progress.begin(responder, 1920, true, choice);
	assert.ok(bar(responder)); assert.equal(bar(h.players[2]), null); assert.equal(bar(h.game.me), null);
	h.progress.end(token); h.stop();
});

test('rescue prompts take precedence and game over clears bars, hints and animation timers', () => {
	const h = fixture(), player = h.players[1], token = h.progress.begin(player, 1920, true);
	h.game.hhRescueFlow = { active: true }; h.advance(100);
	assert.equal(bar(player), null); assert.equal(player.querySelector('.hh-ai-thinking'), null);
	h.game.hhRescueFlow.active = false; h.advance(100);
	assert.ok(fraction(bar(player)) < 1, 'Restoring a countdown must not reset its start time');
	h.status.over = true; h.stop(); h.progress.end(token);
	assert.equal(bar(player), null); assert.equal(player.querySelector('.hh-ai-thinking'), null);
	assert.equal(h.progress.begin(player, 1920, true), null); assert.equal(h.intervals.size, 0);
});

test('a manual Peach question still has its own player countdown while rescue hides AI bars', () => {
	const h = fixture();
	h.game.hhRescueFlow = { active: true };
	h.status.event = { name: 'chooseToUse', type: 'dying', player: h.game.me, isMine: () => true };
	h.status.paused = true; h.advance(100);
	assert.ok(h.document.getElementById('jindutiaopl'));
	assert.ok(h.players.every(player => !bar(player)));
	h.stop(); assert.equal(h.document.getElementById('jindutiaopl'), undefined);
});
