import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { collectMvpResult, createMvpSettlement, mvpLayout } from '../src/ui/mvpSettlement.js';
import { createMvpEffects, mvpEffects } from '../src/effects/mvpEffects.js';
import { decodeKillCombo } from '../src/effects/killCombo.js';
import { spine } from '../src/libs/spine4-core.js';
import { domFixture } from './helpers/catalog-dom.mjs';

const root = new URL('../assets/mvp-fullscreen/', import.meta.url);
const read = name => readFileSync(new URL(name, root));
const flush = () => new Promise(resolve => setImmediate(resolve));

test('original MVP skeletons, atlases, textures, background and OGG retain their source hashes', () => {
	const sources = JSON.parse(read('sources.json'));
	assert.equal(sources.files.length, 11);
	for (const file of sources.files) {
		const bytes = read(file.file);
		assert.equal(bytes.length, file.bytes);
		assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.file);
	}
	assert.equal(read('ui_quanchangzuijia.ogg').subarray(0, 4).toString(), 'OggS');
	for (const metadata of mvpEffects) {
		const image = read(metadata.name + '.png');
		const model = decodeKillCombo(spine, metadata, read(metadata.name + '.atlas.txt').toString(), read(metadata.name + '.skel'), {
			[metadata.name + '.png']: { width: image.readUInt32BE(16), height: image.readUInt32BE(20) },
		});
		assert.equal(model.data.version, '4.0.56'); assert.equal(model.animation.duration, metadata.duration);
		for (let time = 0; time < metadata.duration; time += 1 / 60) {
			model.skeleton.setToSetupPose(); model.animation.apply(model.skeleton, -1, time, false, [], 1, spine.MixBlend.setup, spine.MixDirection.mixIn);
			model.skeleton.updateWorldTransform();
			for (const slot of model.skeleton.drawOrder) {
				const attachment = slot.getAttachment(); if (!attachment) continue;
				const world = new Float32Array(8); attachment.computeWorldVertices(slot.bone, world, 0, 2);
				assert.ok(world.every(Number.isFinite)); assert.ok(attachment.uvs.every(Number.isFinite));
			}
		}
	}
});

function player(name, attack = 0) {
	return { name, skills: ['test'], 攻击分数: attack, 局势分数: 100, getEnemies: () => [], getFriends: () => [], node: { avatar: { style: { backgroundImage: `url("${name}.jpg")` } } } };
}

test('final ranking includes the dead without mutating scores or replacing the live player array', () => {
	const a = player('a', 9), b = player('b', 40); const players = [a], dead = [b];
	a.getEnemies = (filter, includeDead) => { assert.equal(filter, null); assert.equal(includeDead, true); return [b]; };
	const game = { players, dead };
	assert.deepEqual(collectMvpResult(game), { player: b, score: 120, rating: '12.0' });
	b.攻击分数 = 20;
	assert.deepEqual(collectMvpResult(game), { player: a, score: 111, rating: '11.1' });
	assert.equal(a.局势分数, 100); assert.equal(b.局势分数, 100);
	assert.equal(game.players, players); assert.equal(game.dead, dead); assert.equal(collectMvpResult({}), null);
});

function harness({ failingEffects = false } = {}) {
	const dom = domFixture(), controls = [], sounds = [], saves = [], effects = [];
	const window = new dom.Element('window');
	const lib = { assetURL: '/', config: { connect_nickname: '<红薯>' }, onover: [], skill: { test: { audio: true } } };
	const self = player('caocao', 7), game = { players: [self], dead: [], me: self,
		saveConfig(key, value) { saves.push({ key, value }); },
		playAudio(options) { const audio = { options, pause() { this.paused = true; }, remove() { this.removed = true; } }; sounds.push(audio); return audio; },
		trySkillAudio(...args) { return this.playAudio({ skill: args }); },
	};
	const _status = {}, ui = { create: { control(name, callback) { controls.push({ name, callback }); } } };
	const get = { translation: value => value === 'caocao' ? '曹操' : value };
	const context = { lib, game, ui, get, _status };
	const settlement = createMvpSettlement(context, { ...dom.environment, window,
		createEffects(canvas, path, layout) {
			if (failingEffects) throw new Error('no WebGL');
			const effect = { canvas, path, layout, start: () => Promise.resolve(true), stop() { this.stopped = true; } }; effects.push(effect); return effect;
		},
	});
	return { ...dom, context, window, controls, sounds, saves, effects, settlement };
}

test('automatic end screen, safe close, local count, restored focus and repeat viewing', async () => {
	const h = harness(); const focus = h.document.createElement('button'); h.document.body.appendChild(focus); focus.focus();
	h.context.lib.onover[0](); assert.equal(h.saves.length, 1); assert.equal(h.controls.length, 1);
	h.advance(500); const screen = h.document.body.querySelector('.hh-mvp-screen'); assert.ok(screen);
	assert.equal(screen.querySelector('.hh-mvp-score-value').textContent, '10.7');
	assert.equal(screen.querySelector('.hh-mvp-name').textContent, '<红薯>');
	assert.equal(screen.querySelector('.hh-mvp-portrait').style.backgroundImage, 'url("caocao.jpg")');
	assert.equal(h.settlement.show(), false); screen.emit('click'); assert.equal(h.context._status.showHHMvp, true);
	h.advance(1400); assert.equal(h.sounds.length, 2);
	h.advance(100); screen.emit('keydown', { key: 'Escape' });
	assert.equal(h.document.body.querySelector('.hh-mvp-screen'), null); assert.equal(h.context._status.showHHMvp, false);
	assert.equal(h.document.activeElement, focus); assert.equal(h.effects[0].stopped, true);
	assert.ok(h.sounds.every(audio => audio.paused && audio.removed)); assert.equal(h.timers.size, 0);
	h.controls[0].callback(); assert.ok(h.document.body.querySelector('.hh-mvp-screen'));
	assert.equal(h.saves.length, 1); assert.equal(h.context.game.me.局势分数, 100);
	h.settlement.close(); await flush();
	assert.equal(h.window.listeners.get('resize').length, 0);
});

test('early manual viewing cancels auto-open, close during loading stays closed, new matches reset counts', () => {
	const h = harness(); h.settlement.onover(); h.controls[0].callback();
	assert.equal(h.effects.length, 1); h.advance(500); assert.equal(h.effects.length, 1);
	h.settlement.close(); h.advance(5000); assert.equal(h.sounds.length, 1);
	h.settlement.onover(); assert.equal(h.saves.length, 1); h.settlement.close();
	h.settlement.reset(); h.settlement.onover(); assert.equal(h.saves.length, 2); h.settlement.close();
});

test('empty games, other players and replays never invent a local monthly count', () => {
	const h = harness(); h.context.game.me = null; h.settlement.onover(); h.advance(500);
	assert.equal(h.saves.length, 0); assert.equal(h.document.body.querySelector('.hh-mvp-month'), null); h.settlement.close();
	h.settlement.reset(); h.context.game.players = []; h.settlement.onover(); assert.equal(h.timers.size, 0);
	const replay = harness(); replay.context._status.video = true; replay.settlement.onover(); assert.equal(replay.saves.length, 0); replay.settlement.close();
});

test('static artwork and continue remain usable if the effects cannot initialize', () => {
	const h = harness({ failingEffects: true }); h.settlement.onover(); h.advance(2000);
	const screen = h.document.body.querySelector('.hh-mvp-screen');
	assert.ok(screen.querySelector('.hh-mvp-border-fallback')); assert.ok(screen.querySelector('.hh-mvp-title-fallback'));
	screen.emit('click'); assert.equal(h.context._status.showHHMvp, false);
});

test('source proportions remain inside desktop, wide, mobile landscape and portrait screens', () => {
	for (const [width, height] of [[2760, 1256], [1920, 1080], [1280, 720], [844, 390], [390, 844]]) {
		const layout = mvpLayout(width, height), s = layout.scale;
		assert.ok(s > 0); assert.ok(layout.card.x >= 0 && layout.card.y >= 0);
		assert.ok(layout.card.x + layout.card.width <= width);
		assert.ok(layout.card.y + layout.card.height <= height);
		assert.ok(layout.info.x >= 0 && layout.info.x + 458 * s <= width);
		assert.ok(layout.info.y + 118 * s <= height);
		assert.ok(layout.title.x + 161 * s <= width);
	}
});

test('looping border and one-shot title use the actual tracks and release resources when closed', async () => {
	const dom = domFixture(), canvas = dom.document.createElement('canvas'); dom.document.body.appendChild(canvas);
	let frame, now = 0, disposed = 0; const draws = [], released = [];
	const environment = {
		loadSpine: async () => spine, now: () => now, requestFrame(callback) { frame = callback; return 1; }, cancelFrame() { frame = null; },
		readText: async url => read(url.split('/').at(-1)).toString(), readBinary: async url => read(url.split('/').at(-1)),
		loadImage: async url => { const b = read(url.split('/').at(-1)); return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }; },
		createRenderer: () => ({ upload() {}, draw(model, time, placement) { draws.push([model.metadata.name, time, placement]); }, release(model) { released.push(model); }, dispose() { disposed++; } }),
	};
	const effects = createMvpEffects(canvas, '/', () => mvpLayout(1750, 750), environment);
	assert.equal(await effects.start(), true); now = 2500; frame(now);
	assert.equal(draws.at(-2)[1], .5); assert.equal(draws.at(-1)[1], mvpEffects[1].duration);
	assert.equal(draws.at(-1)[2].clear, false); assert.equal(draws.at(-1)[2].holdLastFrame, true);
	effects.stop(); effects.stop(); assert.equal(disposed, 1); assert.equal(released.length, 2); assert.equal(frame, null);
	let resolve; const delayed = createMvpEffects(canvas, '/', () => mvpLayout(1750, 750), { ...environment, loadSpine: () => new Promise(done => { resolve = done; }) });
	const loading = delayed.start(); delayed.stop(); resolve(spine); assert.equal(await loading, false); assert.equal(disposed, 1);
});
