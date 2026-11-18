import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { spine } from '../src/libs/spine4-core.js';
import { decodeKillCombo } from '../src/effects/killCombo.js';
import { sourceSkillAsset as asset } from '../src/effects/sourceSkillAssets.js';
import { createSourceSkillPopup } from '../src/effects/sourceSkillPopup.js';
import { setupSettlementOptimization } from '../src/features/settlementOptimization.js';

const root = new URL('../assets/skill-popup/', import.meta.url);
const read = name => fs.readFileSync(new URL(name, root));

test('original skill resources are intact and exported timing matches the native Spine events', () => {
	const sources = JSON.parse(read('sources.json'));
	for (const file of sources.files) {
		const bytes = read(file.file);
		assert.equal(bytes.length, file.bytes, file.file);
		assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.file);
	}
	const png = read(asset.image);
	assert.equal(png.readUInt32BE(16), asset.width * asset.frames);
	assert.equal(png.readUInt32BE(20), asset.height);
	assert.equal(read(asset.font).toString('ascii', 0, 4), 'wOF2');
	const model = decodeKillCombo(spine, { action: sources.animation }, read('putongchufa.atlas.txt').toString(), read('putongchufa.skel'), { 'putongchufa.png': { width: 2048, height: 1024 } });
	assert.equal(model.data.version, sources.version);
	assert.equal(Math.round(model.animation.duration * 1000), asset.duration);
	const events = model.animation.timelines.filter(t => t instanceof spine.EventTimeline).flatMap(t => t.events);
	assert.equal(Math.round(events.find(e => e.data.name === 'chuxian').time * 1000), asset.labelAppear);
	assert.equal(Math.round(events.find(e => e.data.name === 'xiaoshi').time * 1000), asset.labelFade);
	// The held pose must be the black brush strip, rather than a blank or gold entrance frame.
	const state = new spine.AnimationState(new spine.AnimationStateData(model.data));
	state.setAnimation(0, sources.animation, false); state.update(asset.stillFrame / 30); state.apply(model.skeleton);
	assert.ok(model.skeleton.slots.some(slot => slot.getAttachment()?.name === 'chaobianheti/chaobianheti_00035'));
});

function fixture({ animation = true } = {}) {
	class Element {
		constructor() { this.children = []; this.dataset = {}; this.style = {}; this.attributes = {}; this.isConnected = true; this.offsetWidth = 136; }
		appendChild(child) { child.remove(); this.children.push(child); child.parentNode = this; return child; }
		remove() { if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; }
		setAttribute(key, value) { this.attributes[key] = value; }
	}
	const head = new Element(), body = new Element(), timers = new Map(), listeners = {}, calls = { videos: [], broadcasts: [], hooks: [], spine: [], fullscreen: [] };
	let id = 0;
	const document = { head, body, hidden: false, createElement: () => new Element(), getElementById: value => head.children.find(node => node.id === value), addEventListener(type, fn) { listeners[type] = fn; } };
	const environment = { document, setTimer(fn, ms) { const handle = ++id; timers.set(handle, { fn, ms }); return handle; }, clearTimer(handle) { timers.delete(handle); } };
	const lib = { assetURL: '/noname/', config: { animation, skill_animation_type: 'default' }, onover: [], skill: { sanyao: {}, awakening: { skillAnimation: 'legend' } }, translate: { sanyao: '散谣', awakening: '觉醒' }, animate: { skill: {} } };
	const game = { addVideo: (...args) => calls.videos.push(args), broadcast: (...args) => calls.broadcasts.push(args), callHook: (...args) => calls.hooks.push(args) };
	const player = new Element(); player.getSkills = () => ['sanyao', 'awakening'];
	const manager = createSourceSkillPopup({ lib }, environment);
	return { Element, lib, game, player, manager, calls, document, timers, listeners, environment };
}

test('settlement toggle preserves skill brush CSS duration and its cleanup timer', () => {
	const results = [];
	for (const enabled of [false, true]) {
		const h = fixture(), status = { event: { name: 'useSkill' } };
		h.game.delayx = () => 'native-display';
		setupSettlementOptimization({ lib: h.lib, game: h.game, get: {}, _status: status }, { enable_settlement_optimize: enabled });
		h.manager.play(h.player, '散谣'); assert.equal(h.game.delayx(), 'native-display');
		const timer = [...h.timers.values()][0]; assert.equal(timer.ms, asset.duration + 40);
		results.push({ css: h.document.head.children[0].textContent, duration: timer.ms });
		assert.equal(h.manager.activeCount, 1); timer.fn(); assert.equal(h.manager.activeCount, 0);
	}
	assert.deepEqual(results[0], results[1]);
});

test('repeated skills replace only that player’s popup and stale timers cannot remove the new one', () => {
	const h = fixture(), other = new h.Element();
	assert.equal(h.manager.play(h.player, '散谣'), true);
	const original = h.player.children[0], expired = [...h.timers.values()][0];
	assert.equal(original.children[1].children.map(node => node.textContent).join(''), '散谣');
	assert.equal(original.attributes['aria-label'], '散谣');
	assert.equal(expired.ms, asset.duration + 40);
	h.manager.play(other, '制蛮'); h.manager.play(h.player, '觉醒');
	assert.equal(h.manager.activeCount, 2); assert.equal(h.timers.size, 2);
	assert.equal(original.parentNode, null); assert.equal(h.player.children.length, 1);
	expired.fn();
	assert.equal(h.manager.activeCount, 2); assert.equal(h.player.children[0].attributes['aria-label'], '觉醒');
	assert.equal(h.document.head.children.length, 1);
	for (const { fn } of [...h.timers.values()]) fn();
	assert.equal(h.manager.activeCount, 0); assert.equal(h.timers.size, 0);
	assert.equal(h.player.children.length + other.children.length, 0);
});

test('game over and hidden pages remove all popups; detached players and hidden pages do not start effects', () => {
	const h = fixture(); h.manager.play(h.player, '散谣'); h.lib.onover.forEach(fn => fn());
	assert.equal(h.player.children.length, 0); assert.equal(h.timers.size, 0);
	h.manager.play(h.player, '散谣'); h.document.hidden = true; h.listeners.visibilitychange();
	assert.equal(h.manager.activeCount, 0); assert.equal(h.timers.size, 0);
	assert.equal(h.manager.play(h.player, '散谣'), false);
	h.document.hidden = false; h.player.isConnected = false;
	assert.equal(h.manager.play(h.player, '散谣'), false);
});

test('no-motion mode keeps the readable held frame, and long Unicode skill names remain plain complete text', () => {
	const h = fixture({ animation: false });
	assert.equal(h.manager.play(h.player, '<b>散谣·长技能𠮷</b>'), true);
	const node = h.player.children[0], css = h.document.head.children[0].textContent;
	assert.equal(node.dataset.motion, 'false');
	assert.equal(node.children[1].children.map(part => part.textContent).join(''), '散谣·长技能𠮷');
	assert.ok(parseFloat(node.style.fontSize) < 32.64);
	assert.ok(css.includes('background-position:60% 0'));
	assert.ok(css.includes('/noname/extension/HH优化/assets/skill-popup/HYF3GJM.woff2'));
	assert.ok(css.includes('prefers-reduced-motion:reduce'));
	assert.ok(!css.includes('infinite'));
});

function integration(h) {
	const core = ts.createSourceFile('player.js', fs.readFileSync(new URL('../../../noname/library/element/player.js', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
	const methods = new Map();
	function visit(node) { if (ts.isMethodDeclaration(node) && ['trySkillAnimate', 'popup'].includes(node.name?.getText(core))) methods.set(node.name.getText(core), node.getText(core)); ts.forEachChild(node, visit); }
	visit(core);
	const override = fs.readFileSync(new URL('../src/overrides/player/animations.js', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
	const context = vm.createContext({ lib: h.lib, game: h.game, ui: {}, get: { translation: value => h.lib.translate[value] || value, skillTranslation: value => h.lib.translate[value] }, getDui: () => ({ animation: { playSpine: (...args) => h.calls.spine.push(args) } }), createSourceSkillPopup: context => createSourceSkillPopup(context, h.environment) });
	vm.runInContext(override + '\nglobalThis.methods = ({' + [...methods.values()].join(',') + '});', context);
	Object.assign(h.player, context.methods, { $damagepop: context.playerDamagepop, $skill: (...args) => h.calls.fullscreen.push(args) });
}

test('native trySkillAnimate → popup reaches the replacement once, preserving broadcast and video recording', () => {
	const h = fixture(); integration(h);
	h.player.trySkillAnimate('sanyao', 'sanyao');
	assert.equal(h.player.children.length, 1); assert.equal(h.player.children[0].attributes['aria-label'], '散谣');
	assert.equal(h.calls.videos.length, 1); assert.equal(h.calls.videos[0][0], 'damagepop');
	assert.equal(h.calls.broadcasts.length, 1); assert.equal(h.calls.hooks[0][0], 'checkSkillAnimate');
	h.player.$damagepop('散谣', 'water', true);
	assert.equal(h.calls.broadcasts.length, 2); assert.equal(h.player.children.length, 1);
	h.player.$damagepop('思考中…', 'water', true);
	assert.equal(h.calls.videos.length, 2); assert.equal(h.player.children.length, 1);
	h.game.hhSourceSkillPopup.clear();
});

test('damage, healing, full-screen skills and skill-specific effects retain their original routes', () => {
	const h = fixture(); integration(h);
	h.player.$damagepop(-2, 'thunder'); h.player.$damagepop(1, 'wood');
	assert.equal(h.calls.spine[0][0].action, 'play6'); assert.equal(h.calls.spine[1][0], 'effect_zhiliao');
	h.player.trySkillAnimate('awakening', 'awakening');
	assert.equal(h.calls.fullscreen.length, 1); assert.equal(h.calls.fullscreen[0][0], '觉醒');
	let custom = 0; h.lib.animate.skill.sanyao = () => custom++;
	h.player.trySkillAnimate('sanyao', 'sanyao');
	assert.equal(custom, 1); assert.equal(h.player.children.length, 0); assert.equal(h.game.hhSourceSkillPopup, undefined);
});
