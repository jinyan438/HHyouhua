import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { apiRoot, fetchModels, complete, requestAPI, LLM_PREFIX as P } from '../src/llm/client.js';
import { createPerspective, definitionCode } from '../src/llm/perspective.js';
import { createActions, scoreBeatmap } from '../src/llm/actions.js';
import { setupLLMTakeover } from '../src/llm/controller.js';

function array(items = []) {
	const list = [...items];
	Object.defineProperties(list, {
		add: { value(item) { if (!this.includes(item)) this.push(item); return this; } },
		remove: { value(item) { const at = this.indexOf(item); if (at >= 0) this.splice(at, 1); return this; } },
		addArray: { value(items) { items.forEach(item => this.add(item)); return this; } },
		randomSort: { value() { this.reverse(); return this; } },
	}); return list;
}
function node(classes = []) {
	const names = new Set(classes);
	return { classList: { add: (...items) => items.forEach(item => names.add(item)), remove: (...items) => items.forEach(item => names.delete(item)), contains: name => names.has(name) },
		style: {}, updateTransform() {}, recheck() {}, uncheck() {}, unprompt() {}, addTempClass() {}, close() {}, open() {}, querySelector() {},
	};
}
const coreFile = new URL('../../../noname/library/element/content.ts', import.meta.url);
const coreSource = fs.readFileSync(coreFile, 'utf8');
const nativeContent = ts.transpileModule(coreSource.slice(coreSource.indexOf('export const Content')).replace('export const Content', 'const Content') + '\nglobalThis.nativeContent = Content;', { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
function methods(relative, names) {
	const url = new URL(relative, import.meta.url), source = ts.createSourceFile(url.pathname, fs.readFileSync(url, 'utf8'), ts.ScriptTarget.Latest, true);
	const declarations = source.statements.filter(ts.isClassDeclaration).flatMap(item => [...item.members]);
	return names.map(name => declarations.find(item => ts.isMethodDeclaration(item) && item.name.getText(source) === name).getText(source)).join(',\n');
}
const gameMethods = methods('../../../noname/game/index.js', ['check', 'uncheck']);
const clickMethods = methods('../../../noname/ui/click/index.js', ['ok', 'cancel', 'skill']);
const eventMethods = methods('../../../noname/library/element/gameEvent.ts', ['backup', 'restore']);
const checkSource = fs.readFileSync(new URL('../../../noname/game/check.js', import.meta.url), 'utf8').replace(/^import .*$/m, '').replace('export class Check', 'globalThis.NativeCheck = class Check');

function harness(policy = () => ({ action: 'bool', value: true })) {
	const requests = [], popups = [], used = [];
	const lib = { config: { mode: 'identity', [P + 'enabled']: true, [P + 'address']: 'https://model.example/v1', [P + 'key']: 'TEST_SECRET_KEY', [P + 'model']: 'mock', skip_shan: false },
		character: { own: ['male', 'wei', 4, ['skill_own']], other: ['female', 'wu', 3, ['skill_other']], concealed_general: ['male', 'qun', 4, ['concealed_skill']] },
		translate: { own: '本将', other: '对方', sha: '杀', shan: '闪', skill_own_info: '本将技能文本', concealed_general: 'CONCEALED_GENERAL_TEXT', concealed_skill_info: 'CONCEALED_SKILL_TEXT' },
		characterIntro: {}, card: { sha: { selectTarget: 1 }, shan: {} }, inpile: ['sha', 'shan'], skill: { global: array(), skill_own: { content: function ownSkillCode() { return 1; } }, skill_other: {}, concealed_skill: {} },
		filter: { all: () => true, wuxieSwap: () => false, cardAiIncluded: () => true, cardRespondable: () => true, cardDiscardable: () => true, buttonIncluded: () => true, filterEnable: (event, player, skill) => event.name === 'chooseToUse' && skill === 'skill_own' },
		element: {}, init: { onfree() {} }, arenaReady: [], onover: [], };
	const _status = { gameStarted: true, prehidden_skills: [], lastdragchange: [], dragline: [], dieClose: [] };
	const ui = { selected: { cards: array(), targets: array(), buttons: array() }, click: {}, create: {}, arena: { ...node(), offsetWidth: 900, offsetHeight: 600 }, canvas: {}, touchlines: [], control: node(), dialogs: [], cardPile: { childNodes: [] }, discardPile: { childNodes: [] } };
	function player(seat, name) {
		const result = { ...node(), playerid: String(seat), name, name1: name, hp: 4, maxHp: 4, identity: seat === 1 ? 'zhu' : 'fan', identityShown: false,
			skills: seat === 2 ? ['skill_own'] : ['skill_other'], hiddenSkills: [], invisibleSkills: [], marks: {}, storage: {}, hand: [],
			getSeatNum: () => seat, getCards(position = 'h') { return array(position.includes('h') ? this.hand : []); }, countCards(position) { return this.getCards(position).length; },
			getSkills() { return array(this.skills); }, getExpansions: () => [], getStat: () => ({}),
			isMine: () => seat === 1, isOnline: () => false, isUnderControl: () => false, isDead: () => false, isOut: () => false, isUnseen: () => false,
			node: { equips: node() }, useResult(result) { used.push(result); }, popup: value => popups.push(value), addTempClass() {},
		}; return result;
	}
	const human = player(1, 'other'), actor = player(2, 'own'), opponent = player(3, 'other');
	const game = { players: [human, actor, opponent], dead: [], me: human, roundNumber: 1,
		expandSkills: list => list, filterSkills: list => list, callHook() {}, checkMod: () => 'unchanged',
		resume() {}, stopCountChoose() {}, log() {}, addVideo() {}, broadcast() {}, broadcastAll() {}, finishSkill() {}, saveConfig() {},
		addGlobalSkill(name) { lib.skill.global.add(name); },
		addCardKnower(cards, viewer) { cards.forEach(card => (card.knowers ||= []).push(viewer)); },
	};
	const get = { mode: () => 'identity', owner: card => card.owner, position: card => card.position,
		itemtype: value => value?.playerid ? 'player' : value?.cardid ? 'card' : Array.isArray(value) && value[0]?.cardid ? 'cards' : undefined,
		info: value => typeof value === 'string' ? lib.skill[value] : lib.card[value?.name], event: () => _status.event, player: () => _status.event.player,
		select: value => { if (typeof value === 'function') value = value(); return Array.isArray(value) ? value : [value ?? 1, value ?? 1]; },
		card: () => { const event = _status.event; return event?.skill ? lib.skill[event.skill].viewAs || null : ui.selected.cards[0] || event?._get_card; },
		noSelected: () => !Object.values(ui.selected).some(list => list.length), links: buttons => buttons.map(button => button.link), autoViewAs: card => card && ({ name: card.name, suit: card.suit, number: card.number }),
		filter: value => value, objtype: () => undefined, translation: value => lib.translate[value] || value?.name || String(value), is: { shownCard: card => !!card.shown, phoneLayout: () => false },
		cnNumber: String, skillTranslation: name => name,
	};
	ui.create.skills = list => ui.skills = { skills: list, close() { this.skills = []; } };
	ui.create.skills2 = list => ui.skills2 = { skills: list, close() { this.skills = []; } };
	ui.create.skills3 = list => ui.skills3 = { skills: list, close() { this.skills = []; } };
	ui.create.dialog = (...values) => ({ ...node(), buttons: array(values.flat().filter(value => value?.cardid).map(link => ({ ...node(), link }))),
		add() { return { style: {} }; }, addText() {}, content: node(), });
	const context = { lib, game, ui, get, _status, ai: { basic: { chooseCard: () => false, chooseTarget: () => false, chooseButton: () => false } } };
	const realm = vm.createContext({ ...context, console });
	vm.runInContext('Array.prototype.add=function(x){if(!this.includes(x))this.push(x);return this};Array.prototype.addArray=function(a){a.forEach(x=>this.add(x));return this};Array.prototype.remove=function(x){const i=this.indexOf(x);if(i>=0)this.splice(i,1);return this};', realm);
	vm.runInContext(nativeContent, realm); lib.element.content = realm.nativeContent;
	vm.runInContext(checkSource, realm); game.Check = new realm.NativeCheck();
	vm.runInContext('Object.assign(game, {' + gameMethods + '});Object.assign(ui.click, {' + clickMethods + '});globalThis.eventMethods={' + eventMethods + '};', realm);
	function card(name, owner, { known = [], shown = false, position = 'h' } = {}) {
		const value = { ...node(), cardid: name + ':' + Math.random(), name, owner, position, suit: 'spade', number: 7, shown,
			isKnownBy(viewer) { return viewer === owner || known.includes(viewer) || shown || this.knowers?.includes(viewer); } };
		if (position === 'h') owner?.hand.push(value); return value;
	}
	function event(name, fields = {}) {
		const result = { name, player: actor, _aiexclude: array(), _result: {}, result: undefined,
			isMine: () => false, isOnline: () => false, getParent: () => ({}), getTrigger: () => ({}),
			custom: { replace: {}, add: {} }, resume() {}, finish() { this.finished = true; }, goto(value) { this.nextStep = value; }, redo() {},
			trigger: async () => {}, autochoose: () => false, position: 'h', ...realm.eventMethods, ...fields };
		_status.event = result; return result;
	}
	const fetcher = async (url, options) => {
		const body = JSON.parse(options.body); requests.push({ url, options, body });
		const request = JSON.parse(body.messages.findLast(message => message.role === 'user' && message.content.startsWith('{')).content);
		const answer = await policy(request, requests.length, body);
		if (answer instanceof Error) throw answer;
		return { ok: true, json: async () => ({ choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'call-' + requests.length, type: 'function', function: { name: 'game_action', arguments: JSON.stringify(answer) } }] } }] }) };
	};
	function install() { return setupLLMTakeover(context, { fetch: fetcher }); }
	async function run(evt, { until = Infinity } = {}) {
		_status.event = evt;
		const content = lib.element.content[evt.name];
		if (Array.isArray(content)) {
			for (let index = 0, cycles = 0; index < Math.min(content.length, until) && !evt.finished; cycles++) {
				assert.ok(cycles < 100, 'native event did not terminate');
				await content[index](evt, null, evt.player, evt._result);
				index = evt.nextStep ?? index + 1; delete evt.nextStep;
			}
		} else await content(evt, null, evt.player);
		return evt.result;
	}
	return { ...context, requests, popups, used, human, actor, opponent, card, event, run, install, realm };
}

test('normalizes compatible endpoints, fetches models and preserves the authorization boundary', async () => {
	assert.equal(apiRoot('https://api.example/v1/chat/completions/'), 'https://api.example/v1');
	assert.throws(() => apiRoot('file:///secret')); assert.throws(() => apiRoot('https://secret@api.example/v1'));
	let request;
	const models = await fetchModels({ address: 'https://api.example/v1', key: 'secret' }, { fetch: async (...args) => { request = args; return { ok: true, json: async () => ({ data: [{ id: 'b' }, { id: 'a' }, { id: 'a' }] }) }; } });
	assert.deepEqual(models, ['a', 'b']); assert.equal(request[0], 'https://api.example/v1/models');
	assert.equal(request[1].headers.Authorization, 'Bearer secret'); assert.equal(request[1].redirect, 'error');
	await assert.rejects(requestAPI({ address: 'https://api.example', key: 'SECRET' }, 'models', undefined, { fetch: async () => ({ ok: false, status: 401, text: async () => 'SECRET' }) }), error => error.message === 'API 返回 HTTP 401');
});

test('requests time out even when an adapter ignores AbortSignal', async () => {
	await assert.rejects(requestAPI({ address: 'https://api.example', timeout: 10 }, 'models', undefined, { fetch: () => new Promise(() => {}) }), /超时/);
});

test('perspectives exclude unknown hands, generals, identities, expansions and opponents storage', () => {
	const h = harness(), view = createPerspective(h);
	h.card('OWN_HAND', h.actor); h.card('HIDDEN_HAND', h.opponent); h.card('REVEALED_HAND', h.opponent, { known: [h.actor] });
	h.opponent.name1 = 'concealed_general'; h.opponent.isUnseen = () => true; h.opponent.skills = []; h.opponent.hiddenSkills = ['concealed_skill'];
	h.opponent.storage = { secret: 'OPPONENT_STORAGE_SECRET' };
	const hiddenExpansion = h.card('HIDDEN_EXPANSION', h.opponent, { position: 'x' }); hiddenExpansion.classList.add('infohidden'); h.opponent.getExpansions = () => [hiddenExpansion];
	const json = JSON.stringify(view.snapshot(h.actor));
	for (const hidden of ['HIDDEN_HAND', 'concealed_general', 'CONCEALED_GENERAL_TEXT', 'CONCEALED_SKILL_TEXT', 'OPPONENT_STORAGE_SECRET', 'HIDDEN_EXPANSION']) assert.equal(json.includes(hidden), false, hidden);
	assert.ok(json.includes('OWN_HAND')); assert.ok(json.includes('REVEALED_HAND')); assert.ok(json.includes('ownSkillCode'));
	assert.equal(view.snapshot(h.actor).players[2].identity, 'unknown');
	h.opponent.identityShown = true; assert.equal(view.snapshot(h.actor).players[2].identity, 'fan');
});

test('blank buttons never serialize the hidden card link or its name', () => {
	const h = harness(); const secret = h.card('BLANK_SECRET', h.opponent);
	const event = h.event('choosePlayerCard', { filterButton: () => true, selectButton: 1, dialog: { buttons: array([{ ...node(['blank']), link: secret }]) } });
	const bridge = createActions(h, createPerspective(h), event);
	const state = bridge.state(); assert.equal(JSON.stringify(state).includes('BLANK_SECRET'), false);
	bridge.act({ action: 'button', id: state.buttons[0].id }); bridge.act({ action: 'confirm' });
	assert.equal(bridge.result.links[0], secret);
});

test('face-down judgments do not inherit the engine public-zone shortcut', () => {
	const h = harness(), view = createPerspective(h);
	const judge = h.card('HIDDEN_JUDGMENT', h.opponent, { position: 'j' });
	judge.classList.add('infohidden'); judge.isKnownBy = () => true;
	assert.equal(view.cardKnown(judge, h.actor), false);
	judge._knowers = [h.actor.playerid]; assert.equal(view.cardKnown(judge, h.actor), true);
	const blank = h.card('SECRET_BLANK_CARD', h.opponent, { position: 'j' }); h.lib.card.SECRET_BLANK_CARD = { blankCard: true };
	blank.isKnownBy = () => true; assert.equal(view.cardKnown(blank, h.actor), false);
	h.ui.discardPile.childNodes = [blank]; blank.position = 'd';
	assert.equal(JSON.stringify(view.snapshot(h.actor).discardPile).includes('SECRET_BLANK_CARD'), false);
});

test('compiled rule definitions preserve the original source text', () => {
	const content = function compiledWrapper() {};
	content.compiled = true; content.original = 'function originalSkill() { return 1; }';
	assert.equal(definitionCode(content), content.original);
});

test('native chooseToUse selects a card and target, then executes useResult', async () => {
	const h = harness(request => {
		const state = request.state;
		if (!state.cards.some(card => card.selected)) return { action: 'card', id: state.cards.find(card => card.name === 'sha').id };
		if (!state.targets.some(target => target.selected)) return { action: 'target', id: state.targets.find(target => target.player === 'seat:3').id };
		return { action: 'confirm' };
	});
	const card = h.card('sha', h.actor); h.install();
	const result = await h.run(h.event('chooseToUse', { type: 'phase', filterCard: card => card.name === 'sha', selectCard: 1, filterTarget: (card, player, target) => target !== player, selectTarget: 1 }));
	assert.equal(result.bool, true); assert.equal(result.cards[0], card); assert.equal(result.targets[0], h.opponent); assert.equal(h.used.length, 1);
	assert.equal(h.requests.length, 3); assert.equal(h.requests[0].options.headers.Authorization, 'Bearer TEST_SECRET_KEY');
	for (const { body } of h.requests) { const input = JSON.parse(body.messages.findLast(message => message.role === 'user').content); assert.ok(input.generals.length); assert.ok(input.skills.skill_own.code.content.includes('ownSkillCode')); assert.ok(Array.isArray(input.record)); }
});

test('native view-as skills use backup, select the cost, and restore the event', async () => {
	const h = harness(request => {
		const state = request.state;
		if (!state.currentSkill) return { action: 'skill', id: 'skill_own' };
		if (!state.cards.some(card => card.selected)) return { action: 'card', id: state.cards[0].id };
		return { action: 'confirm' };
	});
	h.lib.skill.skill_own = { enable: 'chooseToRespond', viewAs: { name: 'shan' }, filterCard: () => true, selectCard: 1 };
	h.lib.filter.filterEnable = (event, player, skill) => skill === 'skill_own';
	h.card('sha', h.actor); h.install();
	const event = h.event('chooseToRespond', { nouse: true, filterCard: card => card.name === 'shan', selectCard: 1 });
	await h.run(event, { until: 2 });
	assert.equal(event.result.bool, true); assert.equal(event.result.card.name, 'shan'); assert.equal(event.result.skill, 'skill_own'); assert.equal(event.skill, undefined);
});

test('native control cleanup and optional skill activation use model decisions', async () => {
	const h = harness(request => request.state.kind === 'control' ? { action: 'control', index: 1 } : { action: 'bool', value: false }); h.install();
	const result = await h.run(h.event('chooseControl', { controls: ['draw_card', 'recover_hp'], choiceList: ['摸牌', '回血'] }));
	assert.equal(result.control, 'recover_hp'); assert.equal(result.index, 1);
	const bool = await h.run(h.event('chooseBool', { ai: () => true })); assert.equal(bool.bool, false);
});

test('native card, target and combined selection preserve follow-up callbacks', async () => {
	const h = harness(request => {
		const state = request.state, card = state.cards?.find(card => card.available && !card.selected), target = state.targets?.find(target => target.available && !target.selected);
		if (card) return { action: 'card', id: card.id }; if (target) return { action: 'target', id: target.id }; return { action: 'confirm' };
	}); h.card('sha', h.actor); h.install();
	for (const name of ['chooseCard', 'chooseTarget', 'chooseCardTarget']) {
		let callback = false;
		const event = h.event(name, { filterCard: name === 'chooseTarget' ? undefined : () => true, selectCard: 1,
			filterTarget: name === 'chooseCard' ? undefined : (card, player, target) => target === h.opponent, selectTarget: 1, onresult() { callback = true; } });
		const result = await h.run(event); assert.equal(result.bool, true, name);
		if (name === 'chooseTarget') assert.equal(callback, true);
	}
});

test('per-seat conversations and prompts stay independent and reset between games', async () => {
	const h = harness(request => ({ action: 'bool', value: true }));
	h.lib.config[P + 'seat_prompts'] = { 2: 'ONLY_SEAT_TWO', 3: 'ONLY_SEAT_THREE' }; h.install();
	await h.run(h.event('chooseBool', { prompt: 'PRIVATE_TWO_DECISION' }));
	await h.run(h.event('chooseBool', { player: h.opponent, prompt: 'PRIVATE_THREE_DECISION' }));
	assert.equal(JSON.stringify(h.requests[1].body).includes('ONLY_SEAT_TWO'), false);
	assert.equal(JSON.stringify(h.requests[1].body).includes('PRIVATE_TWO_DECISION'), false);
	await h.run(h.event('chooseBool'));
	assert.ok(JSON.stringify(h.requests[2].body).includes('PRIVATE_TWO_DECISION'));
	h.game.hhLLM.reset(); await h.run(h.event('chooseBool'));
	assert.equal(JSON.stringify(h.requests[3].body).includes('PRIVATE_TWO_DECISION'), false);
});

test('private views reach only their viewer; public logs freeze visibility at the time of the log', async () => {
	const h = harness(); const secret = h.card('PRIVATE_VIEW_CARD', h.human); h.install();
	await h.run(h.event('viewCards', { cards: [secret] }));
	h.game.log(h.opponent, '公开动作');
	await h.run(h.event('chooseBool')); await h.run(h.event('chooseBool', { player: h.opponent }));
	assert.ok(JSON.stringify(h.requests[0].body).includes('PRIVATE_VIEW_CARD'));
	assert.equal(JSON.stringify(h.requests[1].body).includes('PRIVATE_VIEW_CARD'), false);
	assert.ok(JSON.stringify(h.requests[1].body).includes('公开动作'));
});

test('legal sorting validates each move, every item and the final constraints', () => {
	const h = harness(); const first = h.card('sha', h.actor, { position: 'o' }), second = h.card('shan', h.actor, { position: 'o' });
	const event = h.event('chooseToMove', { list: [['顶', [first, second]], ['底']], forced: true, filterMove: (button, to) => to === 1, filterOk: moved => moved[1].length === 1 });
	const bridge = createActions(h, createPerspective(h), event, 'move');
	const state = bridge.state(); assert.throws(() => bridge.act({ action: 'confirm' }), /条件/);
	assert.throws(() => bridge.act({ action: 'move', id: state.groups[0].items[0].id, to: 0 }), /不能移动/);
	bridge.act({ action: 'move', id: state.groups[0].items[1].id, to: 1 }); bridge.act({ action: 'confirm' });
	assert.deepEqual(bridge.result.moved, [[first], [second]]);
});

test('number tools enforce native filterSelect and filterOk', () => {
	const h = harness(); const event = h.event('chooseNumbers', { list: [{ min: 0, max: 3 }, ['asc', 1, 3]], filterSelect: value => value !== 2, filterOk: event => event.numbers[0] + event.numbers[1] === 4 });
	const bridge = createActions(h, createPerspective(h), event, 'numbers');
	assert.throws(() => bridge.act({ action: 'numbers', values: [2, 1] }), /限制/);
	assert.throws(() => bridge.act({ action: 'numbers', values: [0, 1] }), /不合法/);
	bridge.act({ action: 'numbers', values: [1, 3] }); assert.deepEqual(bridge.result.numbers, [1, 3]);
});

test('API failures resume the native AI path and leave no active request or selection', async () => {
	const h = harness(() => new Error('provider failed')); h.card('sha', h.actor); h.install();
	const result = await h.run(h.event('chooseBool', { choice: true, ai: () => false }));
	assert.equal(result.bool, false); assert.equal(h.game.hhLLM.pending, 0); assert.equal(h._status.event._HH_llmDecision, undefined);
	assert.equal(h.popups[0], 'API失败·原生AI'); assert.ok(!h.game.hhLLM.lastError.includes('TEST_SECRET_KEY'));
});

test('settings changes and game end dismiss a pending failure question and release the native event', async t => {
	const previousDocument = globalThis.document;
	t.after(() => { if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument; });
	for (const mode of ['settings', 'end']) {
		let opened, dialog;
		const shown = new Promise(resolve => { opened = resolve; });
		globalThis.document = {
			body: { append() {} },
			createElement(tag) {
				const element = { style: {}, append() {}, close() {}, remove() { this.removed = true; }, showModal() { opened(); } };
				if (tag === 'dialog') dialog = element;
				return element;
			},
		};
		const h = harness(() => new Error('provider failed')), api = h.install();
		h.lib.config[P + 'failure'] = 'ask';
		const event = h.event('chooseBool', { choice: false }), pending = h.run(event);
		await shown;
		assert.equal(api.pending, 1);
		if (mode === 'settings') api.cancelPending(); else h.lib.onover.forEach(callback => callback());
		const result = await pending;
		assert.equal(api.pending, 0); assert.equal(dialog.removed, true);
		if (mode === 'settings') assert.equal(result.bool, false); else assert.equal(event.finished, true);
	}
});

test('human, online, replay, disabled and ended games do not send model requests', async () => {
	for (const mode of ['human', 'online', 'replay', 'disabled', 'ended']) {
		const h = harness(); const api = h.install();
		if (mode === 'online') h._status.connectMode = true;
		if (mode === 'replay') h._status.video = true;
		if (mode === 'disabled') h.lib.config[P + 'enabled'] = false;
		if (mode === 'ended') h.lib.onover.forEach(callback => callback());
		const event = h.event('chooseBool', { player: mode === 'human' ? h.human : h.actor, choice: true });
		// Use the native AI branch for the human's auto play as well.
		await h.run(event); assert.equal(h.requests.length, 0, mode); assert.equal(api.pending, 0);
	}
});

test('hook refresh is idempotent and preserves the AI-delay hook marker', () => {
	const h = harness(), api = h.install(), content = h.lib.element.content.chooseCard;
	api.refreshHooks(); api.refreshHooks(); assert.equal(h.lib.element.content.chooseCard, content); assert.equal(content._HH_aiThinkDelayHooked, true);
});

function nativeCompiler(h) {
	const isolatedFunction = vm.runInContext('Function', h.realm);
	const dependencies = {
		noname: h,
		'@/util/index.js': { AsyncFunction: Object.getPrototypeOf(async function() {}).constructor,
			GeneratorFunction: Object.getPrototypeOf(function*() {}).constructor, AsyncGeneratorFunction: Object.getPrototypeOf(async function*() {}).constructor },
		'@/util/sandbox.js': { security: { getIsolatedsFrom: () => [null, null, isolatedFunction], isSandboxRequired: () => false }, CodeSnippet: class {}, ErrorManager: { setCodeSnippet() {} } },
	};
	const modules = new Map();
	function load(url) {
		if (modules.has(url.href)) return modules.get(url.href).exports;
		const module = { exports: {} }; modules.set(url.href, module);
		const code = ts.transpileModule(fs.readFileSync(url, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
		vm.runInContext('(function(require,module,exports){' + code + '\n})', h.realm)(name => dependencies[name] || load(new URL(name, url)), module, module.exports);
		return module.exports;
	}
	const source = fs.readFileSync(new URL('../../../noname/library/element/gameEvent.ts', import.meta.url), 'utf8');
	const start = source.indexOf('\t#step:');
	vm.runInContext(ts.transpileModule('class EngineSteps {\n' + source.slice(start, source.indexOf('// #endregion', start)) + '\n};globalThis.EngineSteps=EngineSteps;', { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText, h.realm);
	return load(new URL('../../../noname/library/element/GameEvent/compilers/ContentCompiler.ts', import.meta.url)).default;
}

test('actual ArrayCompiler/AsyncCompiler execute the intercepted native choice without losing steps', async () => {
	const h = harness(request => {
		const selected = request.state.cards.some(card => card.selected);
		return selected ? { action: 'confirm' } : { action: 'card', id: request.state.cards[0].id };
	});
	h.card('sha', h.actor); const compiler = nativeCompiler(h); h.install();
	const event = Object.assign(new h.realm.EngineSteps(), h.event('chooseCard', { filterCard: () => true, selectCard: 1 }), {
		getDefaultHandlerType: () => 'onContent', callHandler() {}, clearStepCache() {}, async waitNext() {},
	});
	h._status.event = event;
	await compiler.compile(h.lib.element.content.chooseCard).call(event, event);
	assert.equal(event.result.bool, true); assert.equal(event.result.cards[0].name, 'sha'); assert.equal(event.finished, true);
});

test('HH thinking hooks remain compatible and are not repeatedly nested on arena refresh', async () => {
	const h = harness();
	const source = fs.readFileSync(new URL('../hh-features.js', import.meta.url), 'utf8');
	vm.runInContext(source.slice(source.indexOf('const HH_parseNumberConfig'), source.indexOf('setupLordBlindShot({ lib, game, get, _status });')), h.realm);
	h.install(); const content = h.lib.element.content.chooseBool;
	h.game.hhAIThink.refreshHooks(); h.game.hhLLM.refreshHooks();
	assert.equal(h.lib.element.content.chooseBool, content);
	assert.equal((await h.run(h.event('chooseBool'))).bool, true); assert.equal(h.requests.length, 1);
});

test('aborted requests cannot submit an action into a new or finished event', async () => {
	let ready, release;
	const started = new Promise(resolve => ready = resolve), hold = new Promise(resolve => release = resolve);
	const h = harness(async () => { ready(); await hold; return { action: 'bool', value: true }; }); h.install();
	const event = h.event('chooseBool'), running = h.run(event); await started;
	h._status.event = { name: 'another_event' }; h.game.hhLLM.cancelPending();
	await running; release();
	assert.equal(event.result, undefined); assert.equal(event.finished, true); assert.equal(h.game.hhLLM.pending, 0);
});

test('native ordering adapter works for grouped rows and native skill choice results', async () => {
	const h = harness(request => {
		if (request.state.kind === 'skill') return { action: 'skill_choice', id: 'skill_own' };
		const state = request.state;
		if (state.groups[0].items.length) return { action: 'move', id: state.groups[0].items[0].id, to: 1 };
		return { action: 'confirm' };
	});
	const card = h.card('sha', h.actor), event = h.event('chooseToMove_new', { list: [[['一区', [card]], ['二区', []]]], filterOk: moved => moved[1].length === 1 });
	h.get.gainableSkillsName = () => ['skill_own']; h.install();
	const result = await h.run(event); assert.deepEqual(result.moved, [[], [card]]);
	const skill = await h.run(h.event('chooseSkill', { target: 'own' })); assert.equal(skill.skill, 'skill_own');
});

test('beatmap actions are scored from legal input timestamps using native windows', () => {
	const map = { timeleap: [100, 500, 900], speed: 25 };
	assert.equal(scoreBeatmap(map, [2600, 3000, 3400]).accuracy, 100);
	assert.equal(scoreBeatmap(map, [2600]).accuracy, 33);
	assert.equal(scoreBeatmap(map, []).accuracy, 0);
	assert.throws(() => scoreBeatmap(map, [5000, 1]), /递增/);
});

test('zero memory keeps full current records while omitting prior private conversation', async () => {
	const h = harness(); h.lib.config[P + 'memory'] = 0; h.install();
	await h.run(h.event('chooseBool', { prompt: 'OLD_PRIVATE_PROMPT' })); h.game.log('PUBLIC_HISTORY');
	await h.run(h.event('chooseBool'));
	assert.equal(JSON.stringify(h.requests[1].body).includes('OLD_PRIVATE_PROMPT'), false);
	assert.ok(JSON.stringify(h.requests[1].body).includes('PUBLIC_HISTORY'));
});
