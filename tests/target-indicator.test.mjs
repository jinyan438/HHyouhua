import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { spine as sourceSpine } from '../src/libs/spine4-core.js';
import { decodeKillCombo } from '../src/effects/killCombo.js';
import { setupTargetIndicators } from '../src/animation/targetIndicator.js';
import { chupaiAnimations } from '../src/animation/configs/skillAnimations.js';

const root = new URL('../assets/animation/ol-selected-swords/', import.meta.url), name = 'FX_paiju_guoduhu';
const read = suffix => fs.readFileSync(new URL(name + suffix, root));

test('converted swords preserve the original texture, geometry, flashes and one-second animation', () => {
	const manifest = JSON.parse(fs.readFileSync(new URL('sources.json', root), 'utf8'));
	for (const file of manifest.files) assert.equal(createHash('sha256').update(fs.readFileSync(new URL(file.file, root))).digest('hex'), file.sha256);
	const source = decodeKillCombo(sourceSpine, { action: 'play' }, read('.atlas.txt').toString(), read('.skel'), { [name + '.png']: {} });
	const context = vm.createContext({ console });
	vm.runInContext(fs.readFileSync(new URL('../src/libs/spine.js', import.meta.url), 'utf8'), context);
	const spine = context.spine;
	const texture = { setFilters() {}, setWraps() {}, getImage: () => ({ width: 512, height: 256 }) };
	const atlas = new spine.TextureAtlas(read('.atlas').toString(), () => texture);
	const data = new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(read('.json').toString());
	const skeleton = new spine.Skeleton(data), animation = data.findAnimation('play');
	assert.equal(animation.duration, 1);
	for (let frame = 0; frame < 120; frame++) {
		const time = frame / 120;
		for (const [runtime, sk, anim] of [[sourceSpine, source.skeleton, source.animation], [spine, skeleton, animation]]) {
			sk.setToSetupPose();
			anim.apply(sk, -1, time, false, [], 1, (runtime.MixBlend || runtime.MixPose).setup, runtime.MixDirection.mixIn);
			sk.updateWorldTransform();
		}
		for (let i = 0; i < skeleton.slots.length; i++) {
			const a = source.skeleton.slots[i], b = skeleton.slots[i];
			assert.equal(b.getAttachment()?.path, a.getAttachment()?.path, `attachment at ${time}`);
			for (const channel of ['r', 'g', 'b', 'a']) assert.ok(Math.abs(a.color[channel] - b.color[channel]) < .00001, `flash at ${time}`);
			assert.equal(b.data.blendMode, a.data.blendMode);
			if (!a.getAttachment()) continue;
			const va = new Float32Array(8), vb = new Float32Array(8);
			a.getAttachment().computeWorldVertices(a.bone, va, 0, 2);
			b.getAttachment().computeWorldVertices(b.bone, vb, 0, 2);
			for (let j = 0; j < 8; j++) assert.ok(Math.abs(va[j] - vb[j]) < .001, `vertex ${i}:${j} at ${time}: ${va[j]} / ${vb[j]}`);
			for (let j = 0; j < 8; j++) assert.ok(Math.abs(a.getAttachment().uvs[j] - b.getAttachment().uvs[j]) < .00001, `texture UV ${i}:${j}`);
		}
	}
});

function harness(loaded = true) {
	let config = 'dasima';
	const plays = [], stops = [], requests = [], callbacks = new Map();
	const assets = new Set(loaded ? Object.values(chupaiAnimations).map(a => a.name) : []);
	const players = [0, 1, 2].map(() => {
		const classes = new Set(['player', 'selectable']);
		return { isConnected: true, classList: { contains: key => classes.has(key) }, classes };
	});
	const animation = {
		hasSpine: name => assets.has(name),
		loadSpine(name, type, resolve) { requests.push({ name, type, resolve() { assets.add(name); resolve(); } }); },
		playSpine(sprite, position) { const node = { sprite, position }; plays.push(node); return node; },
		stopSpine(node) { stops.push(node); },
	};
	const lib = { element: { player: { inits: [] } } }, game = { players };
	class Observer { constructor(callback) { this.callback = callback; } observe(player) { callbacks.set(player, this.callback); } }
	const controller = setupTargetIndicators({ lib, game, animation, getConfig: () => config }, { MutationObserver: Observer });
	const select = (index, value) => { const p = players[index]; value ? p.classes.add('selected') : p.classes.delete('selected'); callbacks.get(p)(); };
	return { players, plays, stops, requests, controller, lib, select, setConfig(value) { config = value; controller.refresh(); } };
}

test('only yellow selected targets play; cancellation, multiple targets, settings and game over clean up', () => {
	const h = harness();
	assert.equal(h.plays.length, 0, 'blue candidates do not play');
	h.select(1, true); h.select(1, true);
	assert.equal(h.plays.length, 1, 'unrelated class updates do not restart');
	assert.equal(h.plays[0].sprite.name, 'ol-selected-swords/FX_paiju_guoduhu');
	h.select(0, true); assert.equal(h.plays.length, 2);
	h.select(1, false); assert.equal(h.stops.length, 1);
	assert.equal(h.players[1].ChupaizhishiXid, undefined);
	h.setConfig('jiangjun'); assert.equal(h.plays.length, 3); assert.equal(h.stops.length, 2);
	h.setConfig('off'); assert.equal(h.stops.length, 3); assert.equal(h.plays.length, 3);
	h.setConfig('dasima'); assert.equal(h.plays.length, 4);
	h.lib.onover[0](); assert.equal(h.stops.length, 4);
});

test('cancelling or changing style during a shared asset load cannot leave orphan effects', async () => {
	const h = harness(false);
	h.select(0, true); h.select(1, true);
	assert.equal(h.requests.length, 1);
	assert.equal(h.requests[0].type, 'json');
	h.select(0, false); h.select(0, true); h.select(1, false);
	h.requests[0].resolve(); await new Promise(resolve => setImmediate(resolve));
	assert.equal(h.plays.length, 1); assert.equal(h.plays[0].position.parent, h.players[0]);
	h.setConfig('jiangjun'); h.setConfig('off'); h.requests[1].resolve();
	await new Promise(resolve => setImmediate(resolve));
	assert.equal(h.plays.length, 1); assert.equal(h.stops.length, 1);
});
