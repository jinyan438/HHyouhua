import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { KillComboRenderer } from '../src/effects/killCombo.js';

function fixture() {
	const players = [], errors = [];
	class Player {
		constructor(path) {
			this.path = path; this.canvas = { parentNode: null }; this.running = false;
			this.assets = new Set(); this.loads = []; this.plays = []; players.push(this);
		}
		hasSpine(name) { return this.assets.has(name); }
		loadSpine(name, type, onload, onerror) { this.loads.push({ name, type, onload, onerror }); }
		finish(name, success = true) {
			const index = this.loads.findIndex(load => load.name === name), [load] = this.loads.splice(index, 1);
			if (success) { this.assets.add(name); load.onload?.(); } else load.onerror?.();
		}
		playSpine(animation, position) { this.plays.push({ animation, position }); this.running = true; }
	}
	const context = vm.createContext({ self: { spine: {} }, AnimationPlayer: Player, console: { error: message => errors.push(message) } });
	const source = fs.readFileSync(new URL('../src/animation/AnimationPlayerPool.js', import.meta.url), 'utf8')
		.replace(/^import[^\n]*\n/gm, '').replace('export class ', 'class ');
	vm.runInContext(source + '\nthis.Pool = AnimationPlayerPool;', context);
	const pool = new context.Pool(4, 'assets/', 'effects');
	const host = () => ({ appendChild(canvas) { canvas.parentNode = this; } });
	return { pool, players, errors, host };
}

test('reserving four animation players preloads with only one WebGL owner', () => {
	const h = fixture(); let loaded = 0;
	assert.equal(h.players.length, 1);
	h.pool.loadSpine('follow', 'json', () => loaded++);
	h.players[0].finish('follow');
	assert.equal(loaded, 1); assert.equal(h.players.length, 1);
	assert.equal(h.pool.capacity, 4);
});

test('concurrent effects allocate up to four players and load textures into their own context before playing', () => {
	const h = fixture(), hosts = Array.from({ length: 5 }, h.host);
	h.pool.loadSpine('follow', 'json'); h.players[0].finish('follow');
	hosts.forEach(host => h.pool.playSpineTo(host, { name: 'follow' }));
	assert.equal(h.players.length, 4); assert.equal(h.errors.length, 1);
	assert.equal(h.players[0].plays.length, 1);
	for (const player of h.players.slice(1)) {
		assert.equal(player.plays.length, 0);
		assert.equal(player.loads[0].type, 'json');
		player.finish('follow');
		assert.equal(player.plays.length, 1);
		assert.equal(player._poolPending.size, 0);
	}
	assert.equal(hosts[4]._ap, undefined);
});

test('pending effects reserve their target, deduplicate loads and free a failed player for reuse', () => {
	const h = fixture(), first = h.host(), second = h.host(), third = h.host();
	h.pool.playSpineTo(first, 'follow'); h.pool.playSpineTo(first, 'follow');
	assert.equal(h.players[0].loads.length, 1);
	h.pool.playSpineTo(second, 'follow');
	assert.equal(h.players.length, 2); assert.notEqual(first._ap, second._ap);
	h.players[0].finish('follow'); assert.equal(h.players[0].plays.length, 2);
	h.players[1].finish('follow', false);
	h.pool.playSpineTo(third, 'follow');
	assert.equal(h.players.length, 2); assert.equal(third._ap, second._ap);
	h.players[1].finish('follow'); assert.equal(h.players[1].plays.length, 1);
	assert.equal(h.errors.length, 0);
});

test('a completed player reuses its textures and a moved canvas does not play a stale target request', () => {
	const h = fixture(), first = h.host(), second = h.host();
	h.pool.playSpineTo(first, 'follow');
	second.appendChild(first._ap.canvas); h.players[0].finish('follow');
	assert.equal(h.players[0].plays.length, 0);
	h.pool.playSpineTo(second, 'follow');
	assert.equal(h.players.length, 1); assert.equal(h.players[0].loads.length, 0);
	assert.equal(h.players[0].plays.length, 1);
	h.players[0].running = false; h.pool.playSpineTo(first, 'follow');
	assert.equal(h.players.length, 1); assert.equal(h.players[0].plays.length, 2);
});

test('disposing a selection renderer releases its own GPU objects and browser context slot', () => {
	for (const extension of [true, false]) {
		const calls = [], texture = {}, buffer = {}, program = {}, model = { textures: { page: texture } };
		const renderer = {
			release: KillComboRenderer.prototype.release, buffer, program,
			canvas: { remove() { calls.push('remove'); } },
			gl: {
				deleteTexture(value) { assert.equal(value, texture); calls.push('texture'); },
				deleteBuffer(value) { assert.equal(value, buffer); calls.push('buffer'); },
				deleteProgram(value) { assert.equal(value, program); calls.push('program'); },
				getExtension(name) { assert.equal(name, 'WEBGL_lose_context'); return extension ? { loseContext() { calls.push('context'); } } : null; },
			},
		};
		KillComboRenderer.prototype.dispose.call(renderer, model);
		assert.deepEqual(calls, ['texture', 'buffer', 'program', 'remove', ...(extension ? ['context'] : [])]);
		assert.deepEqual(model.textures, {});
	}
});
