import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import test from 'node:test';
import { createGameResultEffects, gameResultAssets } from '../src/effects/gameResultEffects.js';
import { decodeKillCombo, KillComboRenderer } from '../src/effects/killCombo.js';
import { spine } from '../src/libs/spine4-core.js';
import { createMvpSettlement } from '../src/ui/mvpSettlement.js';
import { prepareSettlementLobby, returnToSettlementLobby } from '../src/ui/settlementLobby.js';
import { domFixture } from './helpers/catalog-dom.mjs';

const root = new URL('../assets/game-result/', import.meta.url), read = name => readFileSync(new URL(name, root));
const flush = () => new Promise(resolve => setImmediate(resolve));

test('all original outcome tracks and voices retain source hashes and decode both intro and idle animations', () => {
	const sources = JSON.parse(read('sources.json'));
	assert.equal(sources.files.length, 12);
	for (const file of sources.files) assert.equal(createHash('sha256').update(read(file.file)).digest('hex'), file.sha256, file.file);
	const gl = new Proxy({ createShader: () => ({}), createProgram: () => ({}), createBuffer: () => ({}), createTexture: () => ({}),
		getShaderParameter: () => true, getProgramParameter: () => true, getAttribLocation: () => 0, getUniformLocation: () => ({}),
		bufferData(_target, vertices) { assert.ok(vertices.every(Number.isFinite)); },
	}, { get: (target, key) => key in target ? target[key] : /^[A-Z_0-9]+$/.test(key) ? key : () => {} });
	const renderer = new KillComboRenderer({ getContext: () => gl, getBoundingClientRect: () => ({ width: 2760, height: 1256 }) });
	for (const metadata of Object.values(gameResultAssets)) {
		const bytes = read(metadata.name + '.png');
		const model = decodeKillCombo(spine, { ...metadata, action: 'play' }, read(metadata.name + '.atlas.txt').toString(), read(metadata.name + '.skel'), {
			[metadata.name + '.png']: { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) },
		});
		assert.equal(model.animation.duration, metadata.intro); assert.equal(read(metadata.sound).subarray(0, 4).toString(), 'OggS');
		for (const action of ['play', 'play2']) {
			model.animation = model.data.findAnimation(action); assert.ok(model.animation);
			for (let time = 0; time < model.animation.duration; time += 1 / 60) renderer.draw(model, time);
		}
	}
});

test('original result intro transitions to looping play2 and stop cancels a late loader', async () => {
	const dom = domFixture(), canvas = dom.document.createElement('canvas'); dom.document.body.appendChild(canvas);
	let now = 0, frame, disposed = 0; const tracks = [];
	const environment = {
		loadSpine: async () => spine, now: () => now, requestFrame(callback) { frame = callback; return 1; }, cancelFrame() { frame = null; },
		readText: async url => read(url.split('/').at(-1)).toString(), readBinary: async url => read(url.split('/').at(-1)),
		loadImage: async url => { const b = read(url.split('/').at(-1)); return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }; },
		createRenderer: () => ({ upload() {}, draw(model, time, placement) { tracks.push([model.animation.name, time, placement.viewport]); }, dispose() { disposed++; } }),
	};
	const effects = createGameResultEffects(canvas, '/', 'win', () => ({ width: 2048, height: 1152, scale: 1.4 }), environment);
	assert.equal(await effects.start(), true); assert.equal(tracks[0][0], 'play'); now = 2300; frame(now);
	assert.equal(tracks.at(-1)[0], 'play2'); assert.deepEqual(tracks.at(-1)[2], { width: 2048, height: 1152 });
	effects.stop(); effects.stop(); assert.equal(disposed, 1); assert.equal(frame, null);
	let finish; const cancelled = createGameResultEffects(canvas, '/', 'lose', () => ({}), { ...environment, loadSpine: () => new Promise(resolve => { finish = resolve; }) });
	const pending = cancelled.start(); cancelled.stop(); finish(spine); assert.equal(await pending, false); assert.equal(disposed, 1);
});

const nativeURL = new URL('../../../noname/game/index.js', import.meta.url);
function nativeFixture({ online = false, host = false, audio = true } = {}) {
	const dom = domFixture(), window = new dom.Element('window'), calls = { records: [], videos: [], voices: [], dialogs: [], reload: 0, lobby: 0, coins: [] };
	const lib = { configprefix: 'noname_', assetURL: '/', config: { mode: 'identity', video: 0, background_audio: audio }, onover: [], skill: {}, poptip: { add() {} } };
	const _status = host ? { connectMode: true } : { coin: 0 };
	const player = { name: 'caocao', ai: {}, stat: [{ damage: 1, card: { sha: 1 } }], identity: 'zhu', skills: [], 攻击分数: 7,
		node: { avatar: { style: { backgroundImage: 'url(caocao.jpg)' } } }, getCards: () => [], getEnemies: () => [], getFriends: () => [], isOnline2: () => false };
	const ui = { control: { show() {} }, clear() {}, update() {}, create: {
		div() { return dom.document.createElement('div'); },
		dialog(...args) {
			const dialog = dom.document.createElement('div'); dialog.className = 'dialog';
			dialog.content = dom.document.createElement('div'); dialog.appendChild(dialog.content);
			Object.defineProperty(dialog.content, 'innerHTML', { get() { return this.textContent; }, set(value) {
				this.textContent = ''; const caption = dom.document.createElement('div'); caption.textContent = value; this.appendChild(caption);
			} });
			dialog.add = value => { if (typeof value === 'string') { const child = dom.document.createElement('div'); child.textContent = value; dialog.content.appendChild(child); } else if (value) dialog.content.appendChild(value); };
			for (const arg of args) if (arg !== 'hidden') dialog.add(arg);
			if (!args.includes('hidden')) dom.document.body.appendChild(dialog);
			calls.dialogs.push({ dialog, args }); return dialog;
		},
		control() { return { hide() {} }; }, exit() { ui.exit = { firstChild: {} }; },
	} };
	const get = { mode: () => 'identity', config: () => false, translation: value => typeof value === 'string' ? value : value.name, id: () => 'poptip', poptip: () => '手牌', totalPopulation: () => 1 };
	const game = { me: player, players: [player], dead: [], online, layout: 'mobile', stopCountChoose() {},
		playAudio(...args) { calls.voices.push(args); return { pause() {}, remove() {} }; },
		broadcastAll(callback, ...args) { callback(...args); }, addVideo(...args) { calls.videos.push(args); }, addRecord(value) { calls.records.push(value); },
		changeCoin(value) { calls.coins.push(value); }, saveConfig() {}, reload() { calls.reload++; },
	};
	const source = readFileSync(nativeURL, 'utf8'), begin = source.indexOf('\tover(result, bool) {'), end = source.indexOf('\n\t/**', begin + 15);
	const context = vm.createContext({ game, lib, ui, get, _status, document: dom.document, window, localStorage: { setItem() {} },
		setTimeout: dom.environment.setTimer, clearInterval() {}, Math });
	game.over = vm.runInContext('({' + source.slice(begin, end) + '}).over', context);
	const effects = () => ({ start: () => Promise.resolve(true), stop() {} });
	const settlement = createMvpSettlement({ lib, game, ui, get, _status }, { ...dom.environment, window, createEffects: effects,
		resultEnvironment: { createEffects: effects }, returnToLobby() { calls.lobby++; } });
	return { ...dom, lib, game, ui, calls, settlement, _status };
}

test('actual native game.over preserves rewards, recorded statistics and records while replacing only presentation', { skip: !existsSync(nativeURL) }, () => {
	for (const result of [true, false, null]) {
		const h = nativeFixture(); h.game.over(result);
		assert.deepEqual(h.calls.records, [result]); assert.equal(h.calls.coins.length, 1);
		assert.equal(h.calls.videos[0][0], 'over'); assert.ok(h.calls.videos[0][2].includes('伤害'));
		assert.equal(h.calls.dialogs.length, 1); assert.ok(h.calls.dialogs[0].args.includes('hidden'));
		assert.equal(h.document.body.querySelector('.dialog'), null);
		assert.equal(h.calls.voices.length, 1); assert.ok(h.calls.voices[0][0].path.startsWith('ext:HH优化/assets/game-result/'));
		assert.ok(h.document.body.querySelector('.hh-game-result')); assert.equal(h.document.body.querySelector('.hh-mvp-portrait'), null);
		h.game.over(result); assert.equal(h.calls.records.length, 1); h.advance(1800);
		h.document.body.querySelector('.hh-game-result').emit('click'); assert.ok(h.document.body.querySelector('.hh-mvp-portrait'));
		assert.equal(h.calls.lobby, 0); h.advance(1500); h.document.body.querySelector('.hh-mvp-screen').emit('click');
		assert.equal(h.calls.lobby, 1); assert.equal(h.calls.reload, 0);
	}
});

test('online client early return still starts the flow and host auto-reload cannot skip continue', { skip: !existsSync(nativeURL) }, () => {
	const client = nativeFixture({ online: true }); client.game.over('<div>结果</div>', false, new Map());
	assert.ok(client.document.body.querySelector('.hh-result-lose')); client.settlement.close();
	const host = nativeFixture({ host: true }); host.game.over(true); host.advance(16000);
	assert.equal(host.calls.reload, 0); assert.ok(host.document.body.querySelector('.hh-game-result')); host.settlement.close();
});

test('disabled outcome audio stays silent and native wrappers are restored after an exception', { skip: !existsSync(nativeURL) }, () => {
	const silent = nativeFixture({ audio: false }); silent.game.over(false); assert.equal(silent.calls.voices.length, 0); silent.settlement.close();
	const h = nativeFixture(), original = h.ui.create.dialog, audio = h.game.playAudio, reload = h.game.reload;
	h.game.stopCountChoose = () => { throw new Error('native failure'); };
	assert.throws(() => h.game.over(true), /native failure/);
	assert.equal(h.ui.create.dialog, original); assert.equal(h.game.playAudio, audio); assert.equal(h.game.reload, reload);
});

test('MVP continue forces the lobby for one load without persisting a changed splash preference', () => {
	const persisted = { show_splash: 'off' }, lib = { configprefix: 'noname_', config: { ...persisted } }, _status = {};
	const storage = new Map([['noname_directstart', 'true'], ['show_splash_off', 'true']]); let assigned;
	const win = { location: { href: 'http://127.0.0.1:8080/?importExtensionName=HH', assign(url) { assigned = url; } },
		localStorage: { removeItem: key => storage.delete(key) }, history: { replaceState(_a, _b, url) { win.location.href = url; } } };
	returnToSettlementLobby({ lib, _status }, win);
	assert.equal(_status.reloading, true); assert.equal(storage.size, 0); assert.equal(new URL(assigned).searchParams.get('hhReturnLobby'), '1');
	win.location.href = assigned; assert.equal(prepareSettlementLobby(lib, win), true); assert.equal(lib.config.show_splash, 'always');
	assert.equal(win.hhSettlementLobby, true);
	assert.equal(new URL(win.location.href).searchParams.get('hhReturnLobby'), null); assert.equal(persisted.show_splash, 'off');
	assert.equal(prepareSettlementLobby(lib, win), false);
});
