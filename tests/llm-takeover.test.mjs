import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { apiRoot, fetchModels, complete, requestAPI, LLM_PREFIX as P } from '../src/llm/client.js';
import { createPerspective, definitionCode } from '../src/llm/perspective.js';
import { createActions, scoreBeatmap } from '../src/llm/actions.js';
import { setupLLMTakeover } from '../src/llm/controller.js';
import { domFixture } from './helpers/catalog-dom.mjs';

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

function harness(policy = () => ({ action: 'bool', value: true }), responseUsage) {
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
			getSkills() { return array(this.skills); }, getExpansions: () => [], getStat: () => ({}), hasSkillTag: () => false,
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
	const get = { mode: () => 'identity', owner: card => card.owner, position: card => card.position, suit: card => card.suit, number: card => card.number,
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
	const realm = vm.createContext({ ...context, console, delay: async () => {} });
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
		const rules = JSON.parse(body.messages.find(message => message.role === 'system' && message.content.startsWith('{"generals"')).content);
		const request = { ...rules, ...JSON.parse(body.messages.findLast(message => message.role === 'user' && message.content.startsWith('{')).content) };
		const answer = await policy(request, requests.length, body);
		if (answer instanceof Error) throw answer;
		const calls = Array.isArray(answer) ? answer : [answer];
		return { ok: true, json: async () => ({ ...(responseUsage ? { usage: responseUsage } : {}), choices: [{ message: { role: 'assistant', content: null, tool_calls: calls.map((input, index) => ({ id: 'call-' + requests.length + '-' + index, type: 'function', function: { name: 'game_action', arguments: JSON.stringify(input) } })) } }] }) };
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
	assert.ok(json.includes('OWN_HAND')); assert.ok(json.includes('REVEALED_HAND')); assert.ok(json.includes('本将技能文本')); assert.equal(json.includes('ownSkillCode'), false);
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
	for (const { body } of h.requests) {
		const rules = JSON.parse(body.messages[1].content), input = JSON.parse(body.messages.findLast(message => message.role === 'user').content);
		assert.ok(rules.generals.length); assert.equal(rules.skills.skill_own.info, '本将技能文本'); assert.equal(rules.skills.skill_own.code, undefined);
		assert.ok(Array.isArray(input.record.recent));
	}
});

test('LLM choices keep native legality and selections without showing human masks or target swords while awaiting requests', async () => {
	let thought, starts = 0, stops = 0, nextRequest = 0;
	const h = harness(request => {
		assert.ok(thought, 'AI thinking animation remains active across every tool request');
		for (const item of [...h.game.players, ...h.actor.hand]) {
			for (const marker of ['selected', 'selectable', 'un-selectable']) assert.equal(item.classList.contains(marker), false, marker);
		}
		assert.equal(h.opponent.classList.contains('hh-target-resolving'), true, 'Real resolution effects remain intact');
		const state = request.state;
		switch (nextRequest++) {
			case 0: return { action: 'card', id: state.cards[0].id };
			case 1: assert.equal(state.cards[0].selected, true); return { action: 'target', id: state.targets.find(target => target.player === 'seat:3').id };
			case 2: assert.equal(state.targets.find(target => target.player === 'seat:3').selected, true); return { action: 'confirm' };
		}
		throw new Error('unexpected extra request');
	});
	const hooks = fs.readFileSync(new URL('../src/core/hooks.js', import.meta.url), 'utf8').replace(/^import .*$/m, '').replace('export function ', 'function ');
	h.lib.hooks = Object.fromEntries(['checkTarget', 'checkCard', 'checkEnd', 'uncheckCard', 'uncheckTarget', 'checkOverflow'].map(key => [key, []]));
	vm.runInContext(hooks + '\ninitHooks();', h.realm);
	h.game.callHook = (name, args) => { if (['checkTarget', 'uncheckTarget'].includes(name)) h.lib.hooks[name].forEach(callback => callback(...args)); };
	h.game.hhAIThinkProgress = {
		begin(player, duration, showTip, event, options) {
			starts++; assert.equal(player, h.actor); assert.equal(showTip, true); assert.equal(options.llm, true);
			assert.equal(event._HH_llmDecision, true); assert.equal(duration, 120000);
			return thought = {};
		},
		end(token) { if (token === thought) { thought = null; stops++; } },
	};
	h.opponent.classList.add('hh-target-resolving');
	const card = h.card('sha', h.actor); h.install();
	const result = await h.run(h.event('chooseToUse', { type: 'phase', filterCard: () => true, selectCard: 1,
		filterTarget: (card, player, target) => target === h.opponent, selectTarget: 1,
		filterOk: () => h.ui.selected.cards[0]?.classList.contains('selected') && h.ui.selected.targets[0]?.classList.contains('selected') }));
	assert.equal(result.cards[0], card); assert.equal(result.targets[0], h.opponent); assert.equal(h.used.length, 1);
	assert.equal(starts, 1); assert.equal(stops, 1); assert.equal(thought, null);
	for (const player of h.game.players) assert.equal(player.classList.contains('un-selectable'), false);
});

test('LLM selection cleanup also runs after invalid operations and reset without changing logical toggle semantics', () => {
	const h = harness(), card = h.card('sha', h.actor);
	const event = h.event('chooseCard', { filterCard: () => true, selectCard: 1 });
	const bridge = createActions(h, createPerspective(h), event);
	const state = bridge.state(), id = state.cards[0].id;
	bridge.act({ action: 'card', id });
	assert.deepEqual([...h.ui.selected.cards], [card]); assert.equal(card.classList.contains('selected'), false);
	assert.equal(bridge.state().cards[0].selected, true);
	assert.throws(() => bridge.act({ action: 'target', id: 'bad' }), /不可选/);
	assert.equal(card.classList.contains('selected'), false); assert.equal(card.classList.contains('selectable'), false);
	bridge.act({ action: 'card', id }); assert.equal(h.ui.selected.cards.length, 0);
	bridge.act({ action: 'card', id }); bridge.reset();
	assert.equal(h.ui.selected.cards.length, 0); assert.equal(card.classList.contains('selectable'), false);
});

test('failed or cancelled LLM decisions stop the AI thinking animation before falling back', async () => {
	for (const mode of ['error', 'cancel', 'end']) {
		let started, ended = 0, token;
		const ready = new Promise(resolve => { started = resolve; });
		const h = harness(() => {
			started(); return mode === 'error' ? new Error('provider failed') : new Promise(() => {});
		});
		h.game.hhAIThinkProgress = {
			begin() { return token = {}; },
			end(value) { if (value === token) { token = null; ended++; } },
		};
		const api = h.install(), pending = h.run(h.event('chooseBool', { choice: false }));
		await ready;
		if (mode === 'cancel') api.cancelPending();
		if (mode === 'end') h.lib.onover.forEach(callback => callback());
		await pending;
		assert.equal(token, null); assert.equal(ended, 1); assert.equal(api.pending, 0);
	}
});

test('native view-as skills use backup, select the cost, and restore the event', async () => {
	const h = harness(request => {
		const state = request.state;
		if (!state.currentSkill) return { action: 'skill', id: 'skill_own' };
		if (!state.cards.some(card => card.selected)) return { action: 'card', id: state.cards[0].id };
		return { action: 'confirm', reason: '将一张手牌转为闪，抵消敌方杀以避免伤害，收益高于保留此牌' };
	});
	h.lib.skill.skill_own = { enable: 'chooseToRespond', viewAs: { name: 'shan' }, filterCard: () => true, selectCard: 1 };
	h.lib.filter.filterEnable = (event, player, skill) => skill === 'skill_own';
	h.card('sha', h.actor); h.install();
	const event = h.event('chooseToRespond', { nouse: true, filterCard: card => card.name === 'shan', selectCard: 1 });
	await h.run(event, { until: 2 });
	assert.equal(event.result.bool, true); assert.equal(event.result.card.name, 'shan'); assert.equal(event.result.skill, 'skill_own'); assert.equal(event.skill, undefined);
	assert.equal(h.game.hhLLM.lastError, '');
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

test('per-seat strategy memories and prompts stay independent and reset between games', async () => {
	const h = harness(request => ({ action: 'bool', value: true, strategy: request.you === 'seat:2' ? 'ONLY_TWO_STRATEGY' : 'ONLY_THREE_STRATEGY' }));
	h.lib.config[P + 'seat_prompts'] = { 2: 'ONLY_SEAT_TWO', 3: 'ONLY_SEAT_THREE' }; h.install();
	await h.run(h.event('chooseBool', { prompt: 'PRIVATE_TWO_DECISION' }));
	await h.run(h.event('chooseBool', { player: h.opponent, prompt: 'PRIVATE_THREE_DECISION' }));
	assert.equal(JSON.stringify(h.requests[1].body).includes('ONLY_SEAT_TWO'), false);
	assert.equal(JSON.stringify(h.requests[1].body).includes('PRIVATE_TWO_DECISION'), false);
	await h.run(h.event('chooseBool'));
	assert.ok(JSON.stringify(h.requests[2].body).includes('ONLY_TWO_STRATEGY'));
	assert.equal(JSON.stringify(h.requests[2].body).includes('PRIVATE_TWO_DECISION'), false);
	assert.equal(JSON.stringify(h.requests[2].body).includes('ONLY_THREE_STRATEGY'), false);
	h.game.hhLLM.reset(); await h.run(h.event('chooseBool'));
	assert.equal(JSON.stringify(h.requests[3].body).includes('ONLY_TWO_STRATEGY'), false);
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
				const element = { style: {}, addEventListener() {}, append() {}, close() {}, remove() { this.removed = true; }, showModal() { opened(); } };
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

test('Android taps can retry, use native AI, or disable takeover from the failure dialog', async t => {
	const previousDocument = globalThis.document;
	t.after(() => { if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument; });
	for (const [label, decision] of [['重试', 'retry'], ['本次原生AI', 'ai'], ['关闭接管', 'disable']]) {
		const dom = domFixture();
		let opened;
		const shown = new Promise(resolve => { opened = resolve; });
		dom.Element.prototype.showModal = function() { opened(); };
		dom.Element.prototype.close = function() {};
		globalThis.document = dom.document;
		const h = harness((_, count) => count === 1 ? new Error('provider failed') : { action: 'bool', value: true });
		h.install(); h.lib.config[P + 'failure'] = 'ask';
		const pending = h.run(h.event('chooseBool', { choice: false }));
		await shown;
		const button = dom.document.body.querySelectorAll('button').find(button => button.textContent === label);
		const point = { identifier: 1, clientX: 20, clientY: 20 };
		button.emit('touchstart', { touches: [point] });
		button.emit('touchend', { touches: [], changedTouches: [point] });
		const result = await pending;
		assert.equal(result.bool, decision === 'retry');
		assert.equal(h.game.hhLLM.pending, 0); assert.equal(dom.document.body.children.length, 0);
		if (decision === 'disable') assert.equal(h.game.hhLLM.enabled, false);
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

test('zero memory omits past strategies while keeping the injected archive summary', async () => {
	const h = harness(() => ({ action: 'bool', value: true, strategy: 'OLD_PRIVATE_STRATEGY' })); h.lib.config[P + 'memory'] = 0; h.install();
	await h.run(h.event('chooseBool', { prompt: 'OLD_PRIVATE_PROMPT' })); h.game.log('PUBLIC_HISTORY');
	await h.run(h.event('chooseBool'));
	assert.equal(JSON.stringify(h.requests[1].body).includes('OLD_PRIVATE_PROMPT'), false);
	assert.equal(JSON.stringify(h.requests[1].body).includes('OLD_PRIVATE_STRATEGY'), false);
	assert.ok(JSON.stringify(h.requests[1].body).includes('PUBLIC_HISTORY'));
});

test('one batched model request selects a card and seat target and submits through native useResult', async () => {
	const h = harness(request => ({ action: 'batch', actions: [
		{ action: 'card', id: request.state.cards[0].id }, { action: 'target', id: 'seat:3' }, { action: 'confirm' },
	], strategy: '保留防御资源，集中压制已确认的敌方。' }));
	const card = h.card('sha', h.actor); h.install();
	const result = await h.run(h.event('chooseToUse', { type: 'phase', filterCard: () => true, selectCard: 1,
		filterTarget: (card, player, target) => target === h.opponent, selectTarget: 1 }));
	assert.equal(result.cards[0], card); assert.equal(result.targets[0], h.opponent);
	assert.equal(h.used.length, 1); assert.equal(h.requests.length, 1);
});

test('a partial batch stops at an illegal target and resumes from actual native selections', async () => {
	const h = harness((request, index) => ({ action: 'batch', actions: index === 1 ? [
		{ action: 'card', id: request.state.cards[0].id }, { action: 'target', id: 'seat:1' }, { action: 'confirm' },
	] : [{ action: 'target', id: 'seat:3' }, { action: 'confirm' }] }));
	const card = h.card('sha', h.actor); h.install();
	const result = await h.run(h.event('chooseToUse', { type: 'phase', filterCard: () => true, selectCard: 1,
		filterTarget: (card, player, target) => target === h.opponent, selectTarget: 1 }));
	assert.equal(result.cards[0], card); assert.equal(result.targets[0], h.opponent); assert.equal(h.requests.length, 2);
	const repair = h.requests[1].body;
	assert.ok(repair.messages.some(message => message.role === 'tool' && message.content.includes('前 1 步已执行')));
	assert.equal(JSON.parse(repair.messages.at(-1).content).state.cards[0].selected, true);
	assert.equal(h.used.length, 1);
});

test('injection contains effects of visible and current-choice cards but no full deck or card code', () => {
	const h = harness(), view = createPerspective(h);
	h.lib.translate.sha_info = '对一个目标造成伤害'; h.lib.translate.shan_info = '抵消杀';
	h.lib.card.sha.content = function NEVER_SEND_CARD_CODE() {};
	h.lib.card.UNSEEN_DECK_CARD = { content: 'UNSEEN_DECK_CODE'.repeat(10000) };
	h.lib.inpile.push('UNSEEN_DECK_CARD');
	h.card('sha', h.actor); h.card('UNSEEN_DECK_CARD', h.opponent);
	const snapshot = view.snapshot(h.actor, [], [], { currentCard: { name: 'shan' } });
	assert.deepEqual(Object.keys(snapshot.cards), ['sha', 'shan']);
	assert.equal(snapshot.cards.sha.info, '对一个目标造成伤害');
	const json = JSON.stringify(snapshot);
	for (const excluded of ['NEVER_SEND_CARD_CODE', 'UNSEEN_DECK', 'ownSkillCode', '"definition"', '"code"']) assert.equal(json.includes(excluded), false, excluded);
	assert.ok(json.length < 5000);
});

test('on-demand subskill code is available even before native registration and appears only once', () => {
	const h = harness(), view = createPerspective(h);
	h.lib.skill.skill_own.subSkill = { detail: { content: function UNIQUE_CHILD_CODE() {} } };
	assert.ok(view.snapshot(h.actor).skills.skill_own_detail);
	const child = view.skillDefinitions(['skill_own_detail'], true);
	assert.ok(child.skill_own_detail.code.content.includes('UNIQUE_CHILD_CODE'));
	const parent = JSON.stringify(view.skillDefinitions(['skill_own'], true));
	assert.equal(parent.match(/UNIQUE_CHILD_CODE/g).length, 1);
});

test('skill code is queried on demand within the visible rules, and injected/tool data never enters strategy history', async () => {
	let stage = 0;
	const h = harness((request, index, body) => {
		if (stage++ === 0) return { action: 'rules', id: 'concealed_skill' };
		if (stage === 2) {
			assert.ok(body.messages.some(message => message.role === 'tool' && message.content.includes('只能查询当前可见')));
			return { action: 'rules', id: 'skill_own' };
		}
		if (stage === 3) {
			assert.ok(body.messages.some(message => message.role === 'tool' && message.content.includes('ownSkillCode')));
			return { action: 'bool', value: true, strategy: 'NEXT_TURN_STRATEGY' };
		}
		assert.deepEqual(body.messages.filter(message => message.role === 'assistant'), [{ role: 'assistant', content: 'NEXT_TURN_STRATEGY' }]);
		const json = JSON.stringify(body);
		for (const excluded of ['ownSkillCode', 'PRIVATE_DECISION_SCENE', '"tool_calls"', '"submitted"']) assert.equal(json.includes(excluded), false, excluded);
		return { action: 'bool', value: true };
	});
	h.opponent.name1 = 'concealed_general'; h.opponent.isUnseen = () => true; h.opponent.skills = []; h.opponent.hiddenSkills = ['concealed_skill'];
	h.install(); await h.run(h.event('chooseBool', { prompt: 'PRIVATE_DECISION_SCENE' }));
	await h.run(h.event('chooseBool'));
	assert.equal(h.requests.length, 4);
	assert.equal(h.requests[0].body.messages[1].content, h.requests[3].body.messages[1].content, 'Static rules keep their prefix position and content');
});

test('old private archive entries are queried only by their viewer and remain temporary injection', async () => {
	let query = true;
	const h = harness((request, index, body) => {
		if (query) { query = false; return { action: 'history', from: 1, limit: 1 }; }
		if (index === 2) assert.ok(body.messages.some(message => message.role === 'tool' && message.content.includes('PRIVATE_ARCHIVE_CARD')));
		return { action: 'bool', value: true };
	});
	const card = h.card('PRIVATE_ARCHIVE_CARD', h.human); h.install();
	await h.run(h.event('viewCards', { cards: [card] }));
	for (let index = 0; index < 50; index++) h.game.log('public ' + index);
	await h.run(h.event('chooseBool'));
	query = true; await h.run(h.event('chooseBool', { player: h.opponent }));
	assert.equal(JSON.stringify(h.requests.slice(2).map(request => request.body)).includes('PRIVATE_ARCHIVE_CARD'), false);
});

test('repeated requests that make no progress stop before the old 96-request limit', async () => {
	const h = harness(() => ({ action: 'inspect' })); h.install();
	await h.run(h.event('chooseBool', { choice: false }));
	assert.equal(h.requests.length, 3); assert.match(h.game.hhLLM.lastError, /未推进/); assert.equal(h.game.hhLLM.pending, 0);
});

test('reported API usage is counted by seat and game without confusing cached input with extra tokens', async () => {
	const h = harness(undefined, { prompt_tokens: 1200, completion_tokens: 80, prompt_cache_hit_tokens: 900, total_tokens: 1280 });
	h.install(); await h.run(h.event('chooseBool')); await h.run(h.event('chooseBool', { player: h.opponent }));
	const usage = h.game.hhLLM.usage;
	assert.equal(usage.requests, 2); assert.equal(usage.reported, 2); assert.equal(usage.input, 2400); assert.equal(usage.output, 160);
	assert.equal(usage.cached, 1800); assert.equal(usage.total, 2560);
	assert.equal(usage.seats[2].total, 1280); assert.equal(usage.seats[3].total, 1280); assert.equal(usage.last.seat, 3);
	h.game.hhLLM.reset(); assert.equal(h.game.hhLLM.usage.requests, 0); assert.equal(h.game.hhLLM.usage.total, 0);
});

function cardDialog(buttons) {
	return { ...node(), buttons: array(buttons), content: node(), add: () => ({ style: {} }), addText() {} };
}

test('variable multi-card choices expose remaining quantity and stop an unexplained early confirmation', async () => {
	const h = harness((request, index, body) => {
		const state = request.state;
		assert.equal(state.context.skill.id, 'temporary_remove'); assert.equal(state.context.target, 'seat:3');
		assert.equal(state.selection.buttons.max, 2);
		assert.ok(state.buttons.every(button => button.hidden && button.zone === 'h' && button.owner === 'seat:3'));
		assert.equal(JSON.stringify(body).includes('UNREVEALED_ONE'), false);
		assert.equal(JSON.stringify(body).includes('UNREVEALED_TWO'), false);
		if (index === 1) {
			assert.equal(state.selection.buttons.selected, 0); assert.equal(state.selection.buttons.additionalAvailable, 2);
			return { action: 'batch', actions: [{ action: 'button', id: state.buttons[0].id }, { action: 'confirm' }] };
		}
		assert.equal(state.selection.buttons.selected, 1); assert.equal(state.selection.buttons.remainingCapacity, 1);
		assert.equal(state.partialConfirmRequiresReason, true);
		assert.ok(body.messages.some(message => message.role === 'tool' && message.content.includes('上限 2')));
		return { action: 'batch', actions: [{ action: 'button', id: state.buttons[1].id }, { action: 'confirm' }] };
	});
	h.lib.skill.temporary_remove = {}; h.lib.translate.temporary_remove_info = '可以将一名角色至多两张牌暂时移出其可用区域。'; h.actor.skills.push('temporary_remove');
	const cards = [h.card('UNREVEALED_ONE', h.opponent), h.card('UNREVEALED_TWO', h.opponent)];
	const parent = { name: 'temporary_remove', skill: 'temporary_remove', player: h.actor,
		_trigger: { name: 'useCardToPlayered', player: h.actor, target: h.opponent, card: { name: 'sha' } },
		parent: { name: 'phaseUse', player: h.actor } };
	h.install();
	const result = await h.run(h.event('choosePlayerCard', { parent, target: h.opponent, filterButton: () => true, selectButton: [1, 2], position: 'h',
		dialog: cardDialog(cards.map(link => ({ ...node(['blank']), link }))) }));
	assert.equal(result.bool, true); assert.equal(result.cards.length, 2); assert.equal(h.requests.length, 2);
});

test('intentional partial selections remain legal with a batch-level reason', () => {
	const h = harness(), cards = [h.card('sha', h.actor), h.card('shan', h.actor)];
	const event = h.event('chooseButton', { filterButton: () => true, selectButton: [1, 2], dialog: cardDialog(cards.map(link => ({ ...node(), link }))) });
	const bridge = createActions(h, createPerspective(h), event), state = bridge.state();
	bridge.act({ action: 'batch', reason: '保留另一张牌以便后续使用', actions: [{ action: 'button', id: state.buttons[0].id }, { action: 'confirm' }] });
	assert.equal(bridge.done, true); assert.equal(bridge.result.links.length, 1);
});

test('selection summaries follow dynamic ranges and native automatic-all choices', () => {
	const h = harness(), cards = [h.card('sha', h.actor), h.card('shan', h.actor)];
	const event = h.event('chooseButton', { filterButton: () => true, selectButton: () => [1, h.ui.selected.buttons.length ? 1 : 2],
		dialog: cardDialog(cards.map(link => ({ ...node(), link }))) });
	const bridge = createActions(h, createPerspective(h), event), state = bridge.state();
	assert.equal(state.selection.buttons.max, 2);
	bridge.act({ action: 'button', id: state.buttons[0].id });
	assert.equal(bridge.state().selection.buttons.max, 1); assert.equal(bridge.state().partialConfirmRequiresReason, false);
	bridge.act({ action: 'confirm' }); assert.equal(bridge.result.links.length, 1);
	const all = createActions(h, createPerspective(h), h.event('chooseTarget', { forced: true, filterTarget: (card, player, target) => target !== player, selectTarget: -1 }));
	assert.equal(all.state().selection.targets.max, 'all'); assert.equal(all.state().partialConfirmRequiresReason, false);
	all.act({ action: 'confirm' }); assert.equal(all.result.targets.length, 2);
});

test('optional skill costs include their source, timing, dynamic description and current judgment effects', async () => {
	const h = harness(request => {
		const { context, selection, cards } = request.state;
		assert.equal(context.skill.id, 'area_cleanse'); assert.equal(context.stage, 'cost'); assert.equal(context.phase, 'phaseJudge');
		assert.equal(context.trigger.timing, 'phaseJudgeBegin'); assert.equal(context.skill.info, '本次可以支付两张牌移除延迟效果');
		assert.equal(request.cards.delayed_lock.info, '判定失败则跳过一个阶段'); assert.deepEqual(selection.cards.min, 2); assert.deepEqual(selection.cards.max, 2);
		return { action: 'batch', reason: '支付两张牌移除妨碍行动的延迟效果，后续由自己执行，保住出牌机会更有利', actions: [...cards.map(card => ({ action: 'card', id: card.id })), { action: 'confirm' }] };
	});
	h.lib.skill.area_cleanse = {}; h.actor.skills.push('area_cleanse'); h.lib.dynamicTranslate = { area_cleanse: () => '本次可以支付两张牌移除延迟效果' };
	h.lib.card.delayed_lock = {}; h.lib.translate.delayed_lock_info = '判定失败则跳过一个阶段';
	const hand = [h.card('sha', h.actor), h.card('shan', h.actor)], delayed = h.card('delayed_lock', h.actor, { position: 'j' });
	h.actor.getCards = position => array([...(position.includes('h') ? hand : []), ...(position.includes('j') ? [delayed] : [])]);
	const parent = { name: 'area_cleanse_cost', skill: 'area_cleanse', player: h.actor, triggername: 'phaseJudgeBegin',
		_trigger: { name: 'phaseJudge', player: h.actor }, parent: { name: 'phaseJudge', player: h.actor } };
	h.install();
	const result = await h.run(h.event('chooseToDiscard', { parent, filterCard: () => true, selectCard: 2, chooseonly: true }));
	assert.equal(result.bool, true); assert.equal(result.cards.length, 2); assert.equal(h.requests.length, 1);
});

test('declining an optional skill requires a decision reason, accepts deliberate refusal, and never stores that reason as strategy', async () => {
	const h = harness((request, index) => index === 1 ? { action: 'bool', value: false, reason: 'COST_OUTWEIGHS_BENEFIT', strategy: 'PERSISTED_STRATEGY' } : { action: 'bool', value: true });
	h.lib.skill.optional_offer = {}; h.actor.skills.push('optional_offer');
	const parent = { name: 'optional_offer', skill: 'optional_offer', player: h.actor };
	const bridge = createActions(h, createPerspective(h), h.event('chooseBool', { parent }), 'bool');
	assert.equal(bridge.state().declineRequiresReason, true);
	assert.throws(() => bridge.act({ action: 'bool', value: false }), /reason/); assert.equal(bridge.done, false);
	bridge.act({ action: 'bool', value: false, reason: '付出大于收益' }); assert.equal(bridge.result.bool, false);
	const control = createActions(h, createPerspective(h), h.event('chooseControl', { parent, controls: ['ok', 'cancel2'] }), 'control');
	assert.throws(() => control.act({ action: 'control', index: 1 }), /reason/); assert.equal(control.done, false);
	control.act({ action: 'control', index: 1, reason: '保留资源用于下一次机会' }); assert.equal(control.result.control, 'cancel2');
	const cancel = createActions(h, createPerspective(h), h.event('chooseBool', { parent }), 'bool');
	assert.throws(() => cancel.act({ action: 'cancel' }), /reason/); assert.equal(cancel.done, false);
	cancel.act({ action: 'cancel', reason: '当前收益不足' }); assert.equal(cancel.result.bool, false);
	h.install(); await h.run(h.event('chooseBool', { parent })); await h.run(h.event('chooseBool'));
	const body = h.requests[1].body;
	assert.deepEqual(body.messages.filter(message => message.role === 'assistant'), [{ role: 'assistant', content: 'PERSISTED_STRATEGY' }]);
	assert.equal(JSON.stringify(body).includes('COST_OUTWEIGHS_BENEFIT'), false);
});

test('choice context includes equipped skills but hides concealed enemy skills and private trigger cards', () => {
	const h = harness(), view = createPerspective(h);
	h.lib.skill.equipment_offer = {}; h.lib.translate.equipment_offer_info = '装备提供的选择';
	h.actor.getSkills = (mode, includeEquips) => array(includeEquips === false ? ['skill_own'] : ['skill_own', 'equipment_offer']);
	assert.equal(view.snapshot(h.actor).skills.equipment_offer.info, '装备提供的选择');
	let enemyDynamicCalls = 0;
	h.lib.dynamicTranslate = { skill_other: () => { enemyDynamicCalls++; return 'PRIVATE_DYNAMIC_INFO'; } };
	const enemy = { name: 'skill_other', skill: 'skill_other', player: h.opponent };
	assert.equal(view.choiceContext(h.event('chooseBool', { parent: enemy })).skill.id, 'skill_other'); assert.equal(enemyDynamicCalls, 0);
	h.opponent.name1 = 'concealed_general'; h.opponent.isUnseen = () => true; h.opponent.skills = ['concealed_skill']; h.opponent.hiddenSkills = ['concealed_skill'];
	const card = h.card('PRIVATE_TRIGGER_CARD', h.opponent);
	const hidden = { name: 'concealed_skill_cost', skill: 'concealed_skill', player: h.opponent, triggername: 'phaseJudgeBegin',
		_trigger: { name: 'judge', player: h.opponent, card } };
	const json = JSON.stringify(view.choiceContext(h.event('chooseBool', { parent: hidden })));
	for (const secret of ['concealed_skill', 'CONCEALED_SKILL_TEXT', 'PRIVATE_TRIGGER_CARD', 'PRIVATE_DYNAMIC_INFO']) assert.equal(json.includes(secret), false, secret);
	h.opponent.skills = ['skill_other']; h.opponent.hiddenSkills = ['skill_other'];
	assert.equal(view.choiceContext(h.event('chooseBool', { parent: enemy })).skill, undefined, 'A skill known from another general does not reveal a concealed source');
});

test('ordinary active skills require a benefit assessment and retain dynamic effects without a code round trip', async () => {
	const h = harness(request => {
		assert.equal(request.state.skills[0].info, '转交一件装备，由接收方决定后续效果');
		assert.deepEqual(request.state.skills[0].activation.requiresRuleReview, []);
		return { action: 'batch', reason: '给友方一件装备，其可选择打击敌方，资源留在己方且收益高于保留装备', actions: [
			{ action: 'skill', id: 'skill_own' }, { action: 'target', id: 'seat:3' }, { action: 'confirm' },
		] };
	});
	h.lib.skill.skill_own = { enable: 'phaseUse', filterTarget: () => true, selectTarget: 1, content() {} };
	h.lib.dynamicTranslate = { skill_own: () => '转交一件装备，由接收方决定后续效果' };
	h.install();
	const result = await h.run(h.event('chooseToUse', { type: 'phase', filterCard: () => false }));
	assert.equal(result.bool, true, h.game.hhLLM.lastError); assert.equal(result.skill, 'skill_own'); assert.equal(h.requests.length, 1); assert.equal(h.used.length, 1);
	const event = h.event('chooseToUse', { type: 'phase', filterCard: () => false }), bridge = createActions(h, createPerspective(h), event);
	bridge.state(); bridge.act({ action: 'skill', id: 'skill_own' }); bridge.act({ action: 'target', id: 'seat:3' });
	assert.equal(bridge.state().currentSkillInfo.info, '转交一件装备，由接收方决定后续效果');
	assert.throws(() => bridge.act({ action: 'confirm' }), /净收益/); assert.equal(bridge.done, false); assert.equal(event.result, undefined);
});

test('limited skills cannot query and spend in one response before the model has received the implementation', async () => {
	const h = harness((request, index, body) => {
		if (index === 1) return [
			{ action: 'rules', id: 'skill_own' },
			{ action: 'batch', reason: '先看回血就发动', actions: [{ action: 'skill', id: 'skill_own' }, { action: 'target', id: 'seat:3' }, { action: 'confirm' }] },
		];
		if (index === 2) {
			assert.equal(h.used.length, 0);
			assert.deepEqual(request.state.activation.requiresRuleReview, []);
			assert.ok(body.messages.some(message => message.role === 'tool' && message.content.includes('下一次请求')));
			assert.ok(body.messages.some(message => message.role === 'tool' && message.content.includes('RECIPIENT_DECIDES_NEXT_EFFECT')));
			return { action: 'batch', actions: [{ action: 'reset' }, { action: 'cancel' }], strategy: '避免把后续伤害选择权交给敌方' };
		}
		assert.deepEqual(body.messages.filter(message => message.role === 'assistant'), [{ role: 'assistant', content: '避免把后续伤害选择权交给敌方' }]);
		assert.equal(JSON.stringify(body).includes('RECIPIENT_DECIDES_NEXT_EFFECT'), false);
		assert.equal(JSON.stringify(body).includes('先看回血就发动'), false);
		return { action: 'bool', value: true };
	});
	h.lib.skill.skill_own = { enable: 'phaseUse', limited: true, filterTarget: () => true, selectTarget: 1,
		content: function RECIPIENT_DECIDES_NEXT_EFFECT(event) { return event.target.chooseTarget(); } };
	h.install();
	const result = await h.run(h.event('chooseToUse', { type: 'phase', filterCard: () => false }));
	assert.equal(result.bool, false); assert.equal(h.used.length, 0);
	assert.equal(h.game.hhLLM.lastError, '');
	await h.run(h.event('chooseBool')); assert.equal(h.requests.length, 3);
});

test('missing skill text requires current code, while reviewed implementations and a reason allow native submission', async () => {
	const h = harness((request, index) => {
		if (index === 1) {
			assert.deepEqual(request.state.skills[0].activation.requiresRuleReview, ['skill_own']);
			return { action: 'rules', id: 'skill_own' };
		}
		return { action: 'batch', reason: '已核对实现，付出一张牌换取即时防御，由自己完成响应，比承受伤害有利', actions: [
			{ action: 'skill', id: 'skill_own' }, { action: 'card', id: request.state.cards[0].id }, { action: 'confirm' },
		] };
	});
	delete h.lib.translate.skill_own_info;
	h.lib.skill.skill_own = { enable: 'chooseToRespond', viewAs: { name: 'shan' }, filterCard: () => true, selectCard: 1 };
	h.lib.filter.filterEnable = (event, player, skill) => skill === 'skill_own';
	h.card('sha', h.actor); h.install();
	const result = await h.run(h.event('chooseToRespond', { nouse: true, filterCard: card => card.name === 'shan', selectCard: 1 }), { until: 2 });
	assert.equal(result.bool, true, h.game.hhLLM.lastError); assert.equal(result.card.name, 'shan'); assert.equal(h.game.hhLLM.lastError, '');
	assert.equal(h.requests.length, 2, JSON.stringify(h.requests.at(-1).body.messages.filter(message => message.role === 'tool')));
});

test('backup skills must review their limited source and cannot reuse another choice code review', () => {
	const h = harness();
	h.lib.skill.limited_source = { limited: true, content: function COMPLETE_EFFECT_SEQUENCE() {} };
	h.lib.skill.skill_own = { sourceSkill: 'limited_source', enable: 'phaseUse', filterTarget: () => true, selectTarget: 1 };
	const view = createPerspective(h), event = h.event('chooseToUse', { type: 'phase', filterCard: () => false }), bridge = createActions(h, view, event);
	bridge.state(); bridge.act({ action: 'skill', id: 'skill_own' }); bridge.act({ action: 'target', id: 'seat:3' });
	assert.deepEqual(bridge.state().activation.requiresRuleReview, ['skill_own', 'limited_source']);
	bridge.reviewRules(['skill_own']); assert.throws(() => bridge.act({ action: 'confirm', reason: '已权衡' }), /limited_source/);
	assert.ok(view.skillDefinitions(['skill_own'], true).limited_source.code.content.includes('COMPLETE_EFFECT_SEQUENCE'));
	bridge.reviewRules(['limited_source']); assert.throws(() => bridge.act({ action: 'confirm' }), /净收益/);
	bridge.act({ action: 'confirm', reason: '已核对来源实现及全部结算，成本和次数的价值低于当前获胜收益' }); assert.equal(bridge.result.bool, true);
	const next = createActions(h, view, h.event('chooseToUse', { type: 'phase', filterCard: () => false }));
	next.state(); next.act({ action: 'skill', id: 'skill_own' }); next.act({ action: 'target', id: 'seat:3' });
	assert.throws(() => next.act({ action: 'confirm', reason: '沿用之前判断' }), /rules/);
});

test('ordinary optional triggers, direct choices and costs require reasons without restricting opponents or forced effects', () => {
	const h = harness(), view = createPerspective(h);
	for (const parent of [
		{ name: 'trigger', skill: 'skill_own', player: h.actor },
		{ name: 'skill_own_cost', skill: 'skill_own', player: h.actor },
	]) {
		const bridge = createActions(h, view, h.event('chooseBool', { parent }), 'bool');
		assert.equal(bridge.state().activation.requiresReason, true); assert.deepEqual(bridge.state().activation.requiresRuleReview, []);
		assert.throws(() => bridge.act({ action: 'bool', value: true }), /净收益/);
		bridge.act({ action: 'bool', value: true, reason: '后续由自己决定目标，可获得正收益，无额外资源代价' }); assert.equal(bridge.result.bool, true);
	}
	h.lib.skill.skill_own.direct = true;
	const direct = createActions(h, view, h.event('chooseBool', { parent: { name: 'skill_own', player: h.actor } }), 'bool');
	assert.throws(() => direct.act({ action: 'bool', value: true }), /净收益/);
	direct.act({ action: 'bool', value: false, reason: '对手可反制，完整结算后不如保留资源' }); assert.equal(direct.result.bool, false);
	for (const fields of [
		{ parent: { name: 'skill_own_cost', skill: 'skill_own', player: h.actor }, forced: true },
		{ parent: { name: 'skill_other_cost', skill: 'skill_other', player: h.opponent } },
	]) {
		const bridge = createActions(h, view, h.event('chooseBool', fields), 'bool');
		assert.equal(bridge.state().activation, undefined); bridge.act({ action: 'bool', value: true }); assert.equal(bridge.result.bool, true);
	}
});

test('local output journal keeps action repair and provider output by seat without injecting them into later choices', async () => {
	const h = harness((request, index) => index === 1 ? { action: 'bool', value: 'invalid', reason: 'JOURNAL_ONLY_REASON' } :
		{ action: 'bool', value: true, reason: 'JOURNAL_ACCEPTED_REASON', strategy: 'STRATEGY_MEMORY' });
	h.install(); await h.run(h.event('chooseBool')); await h.run(h.event('chooseBool', { player: h.opponent })); await h.run(h.event('chooseBool'));
	const records = h.game.hhLLM.journal.read(2);
	assert.equal(records.length, 3); assert.equal(h.game.hhLLM.journal.read(3).length, 1);
	assert.equal(records[0].status, 'repair'); assert.equal(records[0].operations[0].outcome.ok, false);
	assert.match(records[0].operations[0].outcome.error, /布尔/); assert.equal(records[1].status, 'submitted');
	assert.equal(records[1].operations[0].input.reason, 'JOURNAL_ACCEPTED_REASON');
	const last = JSON.stringify(h.requests.at(-1).body);
	assert.equal(last.includes('JOURNAL_ONLY_REASON'), false); assert.equal(last.includes('JOURNAL_ACCEPTED_REASON'), false); assert.ok(last.includes('STRATEGY_MEMORY'));
	assert.equal(JSON.stringify(records).includes('TEST_SECRET_KEY'), false);
	h.lib.onover.forEach(callback => callback()); assert.equal(h.game.hhLLM.journal.read(2).length, 3);
	h.game.hhLLM.reset(); assert.deepEqual(h.game.hhLLM.journal.read(), []);
});
