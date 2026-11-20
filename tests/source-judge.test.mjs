import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { spine } from '../src/libs/spine4-core.js';
import { decodeKillCombo } from '../src/effects/killCombo.js';
import { createSourceJudgePlayer, sourceJudgeOutcome, sourceJudgeTiming } from '../src/effects/sourceJudge.js';
import { decorateSourceRevealDialog } from '../src/ui/sourceReveal.js';
import { domFixture } from './helpers/catalog-dom.mjs';

const assetRoot = new URL('../assets/judge-effects/', import.meta.url);
const flush = () => new Promise(resolve => setImmediate(resolve));
const read = name => fs.readFileSync(new URL(name, assetRoot));

test('original judge atlas, both result timelines and three status crops retain their source hashes', () => {
	const provenance = JSON.parse(read('sources.json'));
	assert.equal(provenance.files.length, 6);
	for (const file of provenance.files) assert.equal(createHash('sha256').update(read(file.file)).digest('hex'), file.sha256);
	const png = read('panding.png');
	const model = decodeKillCombo(spine, { action: 'play' }, read('panding.atlas.txt').toString(), read('panding.skel'), { 'panding.png': { width: png.readUInt32BE(16), height: png.readUInt32BE(20) } });
	assert.equal(model.data.version, '4.0.56');
	assert.deepEqual(model.data.animations.map(a => a.name), ['play', 'play2']);
	for (const animation of model.data.animations) for (let time = 0; time < animation.duration; time += 1 / 60) {
		model.skeleton.setToSetupPose(); animation.apply(model.skeleton, -1, time, false, [], 1, spine.MixBlend.setup, spine.MixDirection.mixIn); model.skeleton.updateWorldTransform();
		for (const bone of model.skeleton.bones) assert.ok([bone.worldX, bone.worldY, bone.a, bone.b, bone.c, bone.d].every(Number.isFinite));
	}
});

test('delayed-trick activation follows judge2 rather than treating benefit to the player as activation', () => {
	for (const judgestr of ['lebu', '乐不思蜀', '兵粮寸断', '闪电', '浮雷', '草木皆兵']) {
		assert.equal(sourceJudgeOutcome({ judgestr, result: { judge: -1, bool: false } }), true);
		assert.equal(sourceJudgeOutcome({ judgestr, result: { judge: 1, bool: true } }), false);
	}
	assert.equal(sourceJudgeOutcome({ judgestr: '洛神', result: { judge: 1 } }), true);
	assert.equal(sourceJudgeOutcome({ judgestr: '八卦阵', result: { judge: -1 } }), false);
	assert.equal(sourceJudgeOutcome({ result: { judge: -1 }, judge2: () => true }), true);
	assert.equal(sourceJudgeOutcome({ result: { judge: 0 } }), null);
});

function fixture({ fail = false, animation = true } = {}) {
	const h = domFixture(), frames = new Map(), draws = [];
	const arena = h.document.createElement('div'); arena.clientWidth = 1000; arena.clientHeight = 650; h.document.body.appendChild(arena);
	h.document.defaultView = { addEventListener() {}, removeEventListener() {} };
	const context = { lib: { config: { animation }, skill: {}, onover: [] }, game: {}, ui: { window: h.document.body, arena, thrown: [] }, get: { translation: text => text }, _status: {} };
	let serial = 0;
	const player = createSourceJudgePlayer(context, {
		...h.environment, loadSpine: async () => spine,
		readText: async () => { if (fail) throw Error('unavailable'); return read('panding.atlas.txt').toString(); },
		readBinary: async () => read('panding.skel'), loadImage: async () => ({ width: 256, height: 64 }),
		createRenderer: () => ({ upload() {}, draw(model, time, placement) { draws.push({ action: model.animation.name, time, alpha: model.skeleton.color.a, placement }); } }),
		requestFrame(fn) { frames.set(++serial, fn); return serial; }, cancelFrame(id) { frames.delete(id); },
	});
	function make() {
		const node = h.document.createElement('div'); node.className = 'card'; node.offsetWidth = 126; node.offsetHeight = 174;
		arena.appendChild(node); const card = { clone: node };
		const after = [], handlers = [], event = { name: 'judge', judgestr: '八卦阵', node, player: { judging: [card] }, insertAfter(fn) { after.push(fn); }, pushHandler(fn) { handlers.push(fn); } };
		return { node, card, event, after, handlers };
	}
	function paint() { const callbacks = [...frames.values()]; frames.clear(); for (const fn of callbacks) fn(h.environment.now()); }
	return { ...h, ...context, context, player, frames, draws, make, paint };
}

test('a standalone judgment stays in the central row through the original result hold and fade, then releases it', async () => {
	const h = fixture(), { node, event, card, after } = h.make();
	assert.equal(h.player.begin(event, node), true);
	assert.ok(node.querySelector('img').src.endsWith('judge_status_0.png'));
	assert.equal(decorateSourceRevealDialog(h.document.createElement('div'), event, h.context), true);
	event.result = { card, judge: 1 }; event.player.judging = [];
	let done = false; const promise = h.player.resolve(event).then(() => { done = true; });
	await flush(); h.paint(); assert.equal(h.draws.at(-1).action, 'play');
	assert.equal(h.draws.at(-1).placement.scale, 1);
	h.advance(1500); h.paint(); assert.equal(h.draws.at(-1).alpha, 1);
	h.advance(150); h.paint(); assert.equal(h.draws.at(-1).alpha, .5); assert.equal(done, false);
	h.advance(149); await flush(); assert.equal(done, false);
	h.advance(1); await promise; assert.equal(done, true); assert.equal(h.player.diagnostics.active, 0);
	assert.equal(node.querySelector('.used-info'), null);
	assert.equal(node.querySelector('img'), null); assert.equal(node.fixed, true);
	for (const fn of after) await fn(); assert.equal(node.isConnected, false); assert.equal(node.fixed, undefined);
	assert.equal(h.document.body.querySelector('.hh-source-judge-effects'), null); assert.equal(h.frames.size, 0);
});

test('native rejudging without a second begin keeps the final card pinned before ui.clear and plays only its final result', async () => {
	const h = fixture(), { event, node, handlers, after } = h.make(); h.player.begin(event, node);
	decorateSourceRevealDialog(h.document.createElement('div'), event, h.context);
	const replacement = h.document.createElement('div'); replacement.className = 'card'; h.ui.arena.appendChild(replacement);
	const finalCard = { clone: replacement }; event.player.judging = [finalCard];
	// guicai responds with a new clone; it does not enter the original judge-card tag hook again.
	for (const handler of handlers) handler(event, { state: 'end' });
	assert.equal(replacement.fixed, true);
	assert.equal(replacement.classList.contains('hh-source-reveal-card'), true);
	event.result = { card: finalCard, judge: -1 };
	const promise = h.player.resolve(event); await flush(); h.paint();
	assert.equal(node.isConnected, false); assert.equal(replacement.classList.contains('hh-source-reveal-card'), true);
	assert.equal(h.draws.at(-1).action, 'play2');
	assert.equal(replacement.querySelector('.used-info'), null);
	h.advance(sourceJudgeTiming.duration); await promise;
	for (const fn of after) await fn();
	assert.equal(replacement.isConnected, false); assert.equal(replacement.fixed, undefined);
});

test('missing WebGL retains the original static result and still completes its wait', async () => {
	const h = fixture({ fail: true }), { event, node, card } = h.make();
	h.player.begin(event, node); event.result = { card, judge: 1 };
	const promise = h.player.resolve(event); await flush();
	assert.equal(h.player.diagnostics.failed, true); assert.ok(node.querySelector('img').src.endsWith('judge_status_1.png'));
	h.advance(1800); await promise; assert.equal(node.querySelector('img'), null); assert.equal(node.fixed, undefined);
});

test('game exit and hidden-page cleanup unblock every pending result without late asynchronous effects', async () => {
	const h = fixture(); const a = h.make(), b = h.make();
	const promises = [a, b].map(({ event, node, card }) => { h.player.begin(event, node); event.result = { card, judge: 1 }; return h.player.resolve(event); });
	h.player.stop(); await Promise.all(promises); await flush();
	assert.equal(h.player.diagnostics.active, 0); assert.equal(h.frames.size, 0); assert.equal(h.timers.size, 0);
	for (const { node } of [a, b]) { assert.equal(node.querySelector('img'), null); assert.equal(node.fixed, undefined); }
});

test('disabled animation and neutral results add no wait, and private/replay/online contexts retain their existing display', async () => {
	const h = fixture({ animation: false }), { event, node, card } = h.make();
	h.player.begin(event, node); event.result = { card, judge: 1 }; await h.player.resolve(event);
	assert.equal(h.timers.size, 0); assert.equal(h.frames.size, 0);
	for (const key of ['connectMode', 'video']) { h._status[key] = true; assert.equal(h.player.begin(h.make().event, node), false); h._status[key] = false; }
	h.game.online = true; assert.equal(h.player.begin(h.make().event, node), false);
	const n = fixture(), item = n.make(); n.player.begin(item.event, item.node); item.event.result = { card: item.card, judge: 0 }; await n.player.resolve(item.event);
	assert.equal(n.timers.size, 0); assert.equal(item.node.querySelector('.used-info'), null);
});
