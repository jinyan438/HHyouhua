import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { setupLordBlindShot } from '../src/features/lordBlindShot.js';

const key = 'extension_HH优化_enable_lord_blind_shot';
function fixture() {
	const players = Array.from({ length: 5 }, (_, id) => {
		const classes = new Set();
		return { id, identity: id ? 'fan' : 'zhu', identityShown: !id, isZhu: !id, ai: { shown: id ? 0 : 1 }, storage: {}, hp: id ? 3 : 4,
			threat: 1, distance: id === 1 ? 1 : 2, out: false, dead: false,
			isIn() { return !this.dead && !this.out; }, isMad: () => false, isUnderControl: () => false, isOnline: () => false,
			getSkills: () => [], hasSkill: () => false, hasSkillTag: () => false, mayHaveShan: () => .5, countCards: () => 3,
			classList: { contains: name => classes.has(name), add: name => classes.add(name), remove: name => classes.delete(name) },
		};
	});
	const lord = players[0], registered = [];
	const lib = { config: { mode: 'identity', [key]: true }, skill: { global: [] }, card: {}, onover: [] };
	const game = { players, zhu: lord, me: players[4], finishSkill: name => registered.push(name), expandSkills() {}, hasNature: () => false };
	const _status = { mode: 'normal', ai: {}, event: { player: lord, putTempCache() {} } };
	const get = { mode: () => lib.config.mode, threaten: player => player.threat, distance: (_from, to) => to.distance,
		info: item => (typeof item === 'string' ? lib.skill[item] : lib.card[item?.name]) || {},
		result: item => get.info(item).ai?.result || {}, tag(item, name) { const tag = get.info(item).ai?.tag?.[name]; return typeof tag === 'function' ? tag(item) : tag; },
	};
	lib.card.hit = { ai: { result: { target: -1 }, tag: { damage: 1 } } };
	lib.card.help = { ai: { result: { target: 1 } } };
	lib.skill.hit_skill = { ai: { result: { target: -1 }, damage: true } };
	const context = { lib, game, get, _status }, controller = setupLordBlindShot(context);
	const action = (actor, targets, name = 'hit', skill = false, extra = {}) => ({ name: skill ? 'useSkill' : 'useCard', player: actor, targets,
		...(skill ? { skill: name } : { card: { name } }), ...extra });
	return { ...context, lord, players, registered, controller, action };
}

test('threat and distance jointly choose the highest weight, without reading hidden identities', () => {
	const h = fixture(), [, near, high, far] = h.players;
	high.threat = 5; high.distance = 2; far.threat = 12; far.distance = 4;
	for (const player of h.players.slice(1)) Object.defineProperty(player, 'identity', { get() { throw new Error('hidden role must not be inspected'); } });
	assert.equal(h.controller.sync().target, high);
	h.controller.reset(); high.threat = 1;
	assert.equal(h.controller.sync().target, far);
	h.controller.reset(); far.threat = 1;
	assert.equal(h.controller.sync().target, near);
});

test('the selected opponent stays locked while scores change; self-help and attacks on unknown players reveal no side', () => {
	const h = fixture(), selected = h.controller.sync().target;
	h.players[2].threat = 100;
	h.controller.observe(h.action(selected, [selected], 'help'));
	h.controller.observe(h.action(selected, [h.players[3]]));
	assert.equal(h.controller.sync().target, selected); assert.equal(h.controller.state.ended, false);
});

test('helping the lord identifies a loyal tendency, changes target and prevents selecting that ally again', () => {
	const h = fixture(), loyal = h.controller.sync().target;
	h.controller.observe(h.action(loyal, [h.lord], 'help'));
	assert.notEqual(h.controller.state.target, loyal); assert.equal(h.controller.attitude(h.lord, loyal), 4);
	h.controller.state.target.dead = true;
	assert.notEqual(h.controller.sync().target, loyal);
});

test('an attack on the lord by any player ends blind targeting permanently, including after that enemy dies', () => {
	const h = fixture(); h.controller.sync();
	const actor = h.players[3]; h.controller.observe(h.action(actor, [h.lord]));
	assert.equal(h.controller.state.ended, true); assert.equal(h.controller.state.target, null);
	actor.dead = true; assert.equal(h.controller.attitude(h.lord, h.players[1]), undefined);
	assert.equal(h.controller.sync().reason, 'rebel-exposed');
});

test('targeted harmful skills and attacks on an established ally reveal a rebel tendency', () => {
	let h = fixture(); h.controller.observe(h.action(h.players[1], [h.lord], 'hit_skill', true));
	assert.equal(h.controller.state.ended, true);
	h = fixture(); h.controller.observe(h.action(h.players[1], [h.lord], 'help'));
	h.controller.observe(h.action(h.players[2], [h.players[1]])); assert.equal(h.controller.state.ended, true);
});

test('publicly shown loyal identities are excluded; a publicly shown rebel ends the mechanism', () => {
	const h = fixture(); h.players[1].identityShown = true; h.players[1].identity = 'zhong';
	assert.notEqual(h.controller.sync().target, h.players[1]);
	h.players[3].identityShown = true; assert.equal(h.controller.sync().ended, true);
});

test('a killed opponent revealed as a rebel also permanently ends blind targeting', () => {
	const h = fixture(), target = h.controller.sync().target;
	target.dead = true; target.identityShown = true;
	h.game.players = h.players.filter(player => player !== target); h.game.dead = [target];
	assert.equal(h.controller.sync().ended, true); assert.equal(h.controller.state.target, null);
});

test('dead, out, removed and unreachable candidates are excluded and an invalid target is replaced', () => {
	const h = fixture(); h.players[1].dead = true; h.players[2].out = true; h.players[3].distance = Infinity;
	assert.equal(h.controller.sync().target, h.players[4]);
	h.players[4].removed = true; assert.equal(h.controller.sync().target, null);
});

test('the switch, non-identity modes, online play and manual control preserve the original AI', () => {
	for (const kind of ['switch', 'other', 'connect', 'online', 'human', 'controlled', 'remote-player', 'purple', 'stratagem', 'mad', 'over']) {
		const h = fixture();
		if (kind === 'switch') h.lib.config[key] = false;
		if (kind === 'other') h.lib.config.mode = 'guozhan';
		if (kind === 'connect') h._status.connectMode = true;
		if (kind === 'online') h.game.online = true;
		if (kind === 'human') h.game.me = h.lord;
		if (kind === 'controlled') h.lord.isUnderControl = () => true;
		if (kind === 'remote-player') h.lord.isOnline = () => true;
		if (kind === 'purple' || kind === 'stratagem') h._status.mode = kind;
		if (kind === 'mad') h.lord.isMad = () => true;
		if (kind === 'over') h._status.over = true;
		assert.equal(h.controller.attitude(h.lord, h.players[1]), undefined, kind);
	}
	const h = fixture(); h.game.me = h.lord; h._status.auto = true;
	assert.equal(h.controller.attitude(h.lord, h.players[1]), -5);
});

test('other AI players and self-evaluation are unaffected; toggling off releases the attitude override', () => {
	const h = fixture();
	assert.equal(h.controller.attitude(h.players[2], h.players[1]), undefined);
	assert.equal(h.controller.attitude(h.lord, h.lord), undefined);
	assert.equal(h.controller.attitude(h.lord, null), undefined);
	assert.equal(h.controller.attitude(h.lord, h.players[1]), -5);
	h.lib.config[key] = false; assert.equal(h.controller.attitude(h.lord, h.players[1]), undefined);
});

test('forced attacks, hidden targets and chain splash do not supply voluntary identity evidence', () => {
	const h = fixture();
	h.controller.observe(h.action(h.players[1], [h.lord], 'hit', false, { getParent: () => ({ name: 'jiedao' }) }));
	h.controller.observe(h.action(h.players[1], [h.lord], 'hit', false, { hideTargets: true }));
	h.controller.observe({ name: 'damage', player: h.lord, source: h.players[2], num: 1, notLink: () => false });
	assert.equal(h.controller.state.ended, false);
});

test('multi-target evidence is weighted, repeated events and resulting damage are not counted twice', () => {
	const h = fixture(), actor = h.players[1];
	const action = h.action(actor, h.players.filter(player => player !== actor));
	h.controller.observe(action); h.controller.observe(action);
	assert.equal(h.controller.state.evidence.get(actor), -.5); assert.equal(h.controller.state.ended, false);
	h.controller.observe({ name: 'damage', player: h.lord, source: actor, num: 1, getParent: () => action });
	assert.equal(h.controller.state.evidence.get(actor), -.5);
	h.controller.observe(h.action(actor, [h.lord])); assert.equal(h.controller.state.ended, true);
});

test('unclassified direct damage/recovery provide evidence, while zero changes do not', () => {
	let h = fixture(); h.controller.observe({ name: 'recover', player: h.lord, source: h.players[1], num: 1 });
	assert.equal(h.controller.attitude(h.lord, h.players[1]), 4);
	h = fixture(); h.controller.observe({ name: 'damage', player: h.lord, source: h.players[2], num: 0 });
	assert.equal(h.controller.state.ended, false);
	h.controller.observe({ name: 'damage', player: h.lord, source: h.players[2], num: 1 }); assert.equal(h.controller.state.ended, true);
});

test('a healing skill and its actual recovery count as one public action', () => {
	const h = fixture(), actor = h.players[1];
	h.lib.skill.help_skill = { ai: { result: { target: 1 } } };
	const skill = h.action(actor, [h.lord], 'help_skill', true);
	h.controller.observe(skill);
	h.controller.observe({ name: 'recover', player: h.lord, source: actor, num: 1, getParent: name => name === 'useSkill' ? skill : null });
	assert.equal(h.controller.state.evidence.get(actor), 1);
	h.controller.observe(h.action(actor, [h.lord])); assert.equal(h.controller.state.ended, true);
});

test('setup is idempotent, preserves existing attitude hooks and cleans game state on game over', () => {
	const h = fixture(), other = () => undefined; h._status.ai.customAttitude.push(other);
	assert.equal(setupLordBlindShot(h), h.controller); assert.equal(h._status.ai.customAttitude.length, 2);
	assert.deepEqual(h.registered, ['_hh_lord_blind_shot']);
	h.controller.sync(); h.lib.onover[0](); assert.equal(h.controller.state, undefined);
});

test('threat functions may query attitude without recursively selecting a target', () => {
	const h = fixture();
	h.get.threaten = player => { assert.equal(h.controller.attitude(h.lord, player), undefined); return player.threat; };
	assert.equal(h.controller.sync().target, h.players[1]);
});

function method(source, name) {
	const file = ts.createSourceFile('engine.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
	let found;
	function visit(node) { if (ts.isMethodDeclaration(node) && node.name.getText(file) === name) found = node; else ts.forEachChild(node, visit); }
	visit(file); assert.ok(found, name); return found.getText(file);
}

function nativeAI(h) {
	const ui = { selected: {} }, ai = { getCacheKey: card => card.name };
	const CacheContext = class {
		static requireCacheContext() { return { get: h.get, delegate: object => object }; }
		static setCacheContext() {} static setInCacheEnvironment() {} static removeCacheContext() {}
	};
	const realm = vm.createContext({ ...h, ui, ai, CacheContext, console });
	const getSource = fs.readFileSync(new URL('../../../noname/get/index.js', import.meta.url), 'utf8');
	const modeSource = fs.readFileSync(new URL('../../../mode/identity.js', import.meta.url), 'utf8');
	const methods = ['attitude', 'result', 'effect_use', 'effect', 'damageEffect'].map(name => method(getSource, name));
	const code = 'Object.assign(get, {' + methods.concat(method(modeSource, 'rawAttitude')).join(',\n') + '});';
	vm.runInContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText, realm);
	Object.assign(h.get, { copy: object => ({ ...object }), difficulty: () => 2, realAttitude: (from, to) => from === to ? 5 : 0,
		autoViewAs: card => card, itemtype: item => typeof item, select: select => Array.isArray(select) ? select : [select, select], skills: () => [],
	});
	const cardSource = fs.readFileSync(new URL('../../../card/standard.js', import.meta.url), 'utf8');
	vm.runInContext(cardSource.slice(cardSource.indexOf('export default')).replace('export default', 'globalThis.cards ='), realm);
	Object.assign(h.lib.card, realm.cards.card);
	const skillSource = fs.readFileSync(new URL('../../../character/shenhua/skill.js', import.meta.url), 'utf8');
	const ast = ts.createSourceFile('skill.js', skillSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
	let skill; function visit(node) { if (ts.isPropertyAssignment(node) && node.name.getText(ast) === 'qiangxi') skill = node; else ts.forEachChild(node, visit); } visit(ast);
	h.lib.skill.qiangxi = vm.runInContext('({' + skill.getText(ast) + '}).qiangxi', realm);
	const basicSource = fs.readFileSync(new URL('../../../noname/ai/basic.js', import.meta.url), 'utf8');
	vm.runInContext(basicSource.slice(basicSource.indexOf('export class Basic')).replace('export class Basic', 'globalThis.NativeBasic = class Basic'), realm);
	vm.runInContext('Array.prototype.add = function(item) { if (!this.includes(item)) this.push(item); return this; };', realm);
	ui.selected.cards = vm.runInContext('[]', realm); ui.selected.targets = vm.runInContext('[]', realm);
	h.game.check = () => {};
	const basic = new realm.NativeBasic();
	function choose(item, legal = h.players.slice(1)) {
		ui.selected.targets.length = 0;
		Object.assign(h._status.event, { filterTarget: () => true, selectTarget: 1 });
		h.get.selectableTargets = () => legal.filter(player => !ui.selected.targets.includes(player));
		return basic.chooseTarget(target => h.get.effect_use(target, item, h.lord));
	}
	return { ui, basic, choose };
}

test('native identity attitude, card effect and AI selection turn Sha from a pass into a legal attack', () => {
	const h = fixture(), native = nativeAI(h);
	h.lib.config[key] = false; assert.equal(native.choose({ name: 'sha' }), false);
	h.lib.config[key] = true; assert.equal(native.choose({ name: 'sha' }), true);
	assert.equal(native.ui.selected.targets[0], h.controller.state.target);
	assert.equal(native.choose({ name: 'sha' }, []), false, 'No legal target remains a pass');
});

test('native active-skill selection and target evaluation use the same blind target and retain health costs', () => {
	const h = fixture(), native = nativeAI(h);
	h.lib.config[key] = false; assert.equal(native.choose('qiangxi'), false);
	h.lib.config[key] = true;
	Object.assign(h._status.event, { filterCard: () => true, selectCard: 1 });
	h.get.selectableCards = () => []; h.get.skills = () => h._status.event.skill ? [] : ['qiangxi'];
	native.ui.click = { skill(name) { h._status.event.skill = name; h._status.event.selectCard = h.lib.skill[name].selectCard; } };
	assert.equal(native.basic.chooseCard(skill => h.lib.skill[skill].ai.order), true);
	assert.equal(h._status.event.skill, 'qiangxi'); assert.equal(native.choose('qiangxi'), true);
	assert.equal(native.ui.selected.targets[0], h.controller.state.target);
	h.lord.hp = 1; assert.equal(native.choose('qiangxi'), false, 'Blind targeting must not force a suicidal skill');
});
