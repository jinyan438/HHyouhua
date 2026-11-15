import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { setupRescueFlow } from '../src/features/rescueFlow.js';
import { createRescuePrompt } from '../src/ui/rescuePrompt.js';
import { createPlayerTip } from '../src/ui/playerTip.js';

const coreText = fs.readFileSync(new URL('../../../noname/library/element/content.ts', import.meta.url), 'utf8');
const core = ts.createSourceFile('content.ts', coreText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const definition = core.statements.find(statement => ts.isVariableStatement(statement) && statement.declarationList.declarations[0].name.getText(core) === 'Content');
const save = definition.declarationList.declarations[0].initializer.properties.find(property => property.name?.getText(core) === '_save');
const choose = definition.declarationList.declarations[0].initializer.properties.find(property => property.name?.getText(core) === 'chooseToUse');
const nativeCode = ts.transpileModule('globalThis.nativeSave = ({' + save.getText(core) + '})._save; globalThis.nativeChoiceStart = ' + choose.initializer.elements[0].getText(core) + ';', { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;

function fixture({ native = false, hp = 0, plans = {}, capable = [], out = [], mode = 'identity', taoEnemy = false, duration = 700, onWait, onChoose } = {}) {
	const choices = [], turns = [], waits = [], active = [], rounds = [];
	const players = Array.from({ length: 4 }, (_, id) => ({
		id, side: id % 2, hp: id === 2 ? hp : 3, removed: false,
		isDead: () => false, isAlive: () => true, isOut: () => out.includes(id), isIn: () => !out.includes(id),
		hasSkillTag: () => false, canSave: () => capable.includes(id),
	}));
	players.forEach((player, i) => { player.next = players[(i + 1) % players.length]; });
	const dying = players[2];
	let untriggered = 0;
	const trigger = { player: dying, untrigger() { untriggered++; } }, event = { name: '_save', player: players[0], finished: false };
	const context = {
		lib: { config: { mode, tao_enemy: taoEnemy }, element: {}, onover: [], filter: { cardSavable: (card, actor, target) => card.name === 'tao' || card.name === 'jiu' && actor === target } },
		game: { checkMod: () => 'unchanged' }, ui: { selected: { targets: [] } },
		get: { translation: player => '玩家' + player.id, info: () => ({ singleCard: false, ai: { order: 4 } }), player: () => event.player, effect_use: () => 1, effect: () => 2 },
		_status: { event: { dying } },
	};
	const realm = vm.createContext(context); vm.runInContext(nativeCode, realm);
	context.lib.element.content = { _save: realm.nativeSave };
	const counters = new Map();
	players.forEach(player => {
		player.chooseToUse = options => ({ async forResult() {
			assert.equal(active.length, native ? 0 : 1, 'Only one rescue seat is presented');
			const index = counters.get(player.id) || 0; counters.set(player.id, index + 1);
			const plan = plans[player.id]?.[index] || { bool: false };
			choices.push({ player: player.id, type: options.type, targetRequired: options.targetRequired, prompt: options.prompt, prompt2: options.prompt2 });
			if (onChoose) return onChoose({ player, options, dying, event, trigger });
			if (plan.error) throw new Error('choice failure');
			if (plan.heal) dying.hp += plan.heal;
			return { bool: !!plan.bool };
		} });
	});
	const prompt = {
		beginRound(target) { const round = { target }; rounds.push(round); return round; },
		endRound(round) { assert.equal(rounds.pop(), round); },
		begin(player, target, ms) {
			assert.equal(rounds.length, 1); assert.equal(active.length, 0); turns.push(player.id);
			const token = { player, target, async wait(time, valid) { waits.push(time); if (onWait) await onWait({ player, dying, event, trigger, valid }); return valid(); } };
			active.push(token); return token;
		},
		end(token) { assert.equal(active.pop(), token); },
	};
	if (!native) setupRescueFlow(context, { prompt, getThinkDelay: () => duration });
	return { context, players, dying, event, trigger, choices, turns, waits, active, rounds, prompt, nativeChoiceStart: realm.nativeChoiceStart, run: () => context.lib.element.content._save(event, trigger), get untriggered() { return untriggered; } };
}

async function parity(options) {
	const before = fixture({ ...options, native: true }), after = fixture(options);
	await before.run(); await after.run();
	// The requested extra no-Peach questions cancel; legal native choices and
	// final game state still match core _save.
	assert.deepEqual(after.choices.filter(choice => options.capable?.includes(choice.player)), before.choices);
	assert.equal(after.dying.hp, before.dying.hp); assert.equal(after.untriggered, before.untriggered);
	assert.equal(after.event.player.id, before.event.player.id); assert.equal(after.active.length, 0); assert.equal(after.rounds.length, 0);
	return after;
}

test('every seat receives an actual rescue question, including seats without a Peach', async () => {
	const h = await parity({ capable: [1, 3], plans: { 1: [{ bool: false }], 3: [{ bool: true, heal: 1 }] } });
	assert.deepEqual(h.turns, [0, 1, 2, 3]); assert.equal(h.waits.length, 4);
	assert.deepEqual(h.choices.map(choice => choice.player), [0, 1, 2, 3]);
});

test('a full round with no rescue cards still asks everyone without probing canSave', async () => {
	const h = fixture();
	h.players.forEach(player => { player.canSave = () => { throw new Error('must not skip no-Peach questions'); }; });
	await h.run(); assert.deepEqual(h.choices.map(choice => choice.player), [0, 1, 2, 3]);
	assert.equal(h.dying.hp, 0); assert.equal(h.rounds.length, 0);
});

test('a rescuer may supply several Peaches and polling stops as soon as dying is resolved', async () => {
	const h = await parity({ hp: -1, capable: [1], plans: { 1: [{ bool: true, heal: 1 }, { bool: true, heal: 1 }] } });
	assert.deepEqual(h.turns, [0, 1, 1]); assert.equal(h.dying.hp, 1);
});

test('all passes complete one seat cycle; out players and team rescue restrictions match native rules', async () => {
	let h = await parity({ capable: [0, 1, 2, 3] });
	assert.deepEqual(h.turns, [0, 1, 2, 3]); assert.equal(h.dying.hp, 0);
	h = await parity({ capable: [0, 1, 2, 3], out: [1] });
	assert.deepEqual(h.turns, [0, 2, 3]);
	h = await parity({ capable: [0, 1, 2, 3], mode: 'versus', taoEnemy: true });
	assert.deepEqual(h.turns, [0, 2]);
});

test('Peach, self-save Wine, target modifiers and native AI choice callbacks are retained', async () => {
	const h = fixture({ capable: [0], duration: 0, onChoose({ player, options, dying }) {
		assert.equal(options.filterCard({ name: 'tao' }, player, { dying }), true);
		assert.equal(options.filterCard({ name: 'jiu' }, player, { dying }), false);
		assert.equal(options.filterCard({ name: 'jiu' }, dying, { dying }), true);
		assert.equal(options.filterTarget({ name: 'tao' }, player, dying), true);
		assert.equal(options.filterTarget({ name: 'tao' }, player, player), false);
		h.context.game.checkMod = () => false;
		assert.equal(options.filterTarget({ name: 'tao' }, player, dying), false);
		h.context.game.checkMod = () => 0;
		assert.equal(options.filterTarget({ name: 'tao' }, player, dying), false);
		h.context.lib.filter.cardSavable = card => card.name === 'skill_rescue';
		assert.equal(options.filterCard({ name: 'skill_rescue' }, player, { dying }), true);
		assert.equal(options.ai1('tao'), 4); assert.equal(options.ai2(dying), 2);
		assert.equal(options._HH_rescueThought, false);
		dying.hp = 1; return { bool: true };
	} });
	await h.run(); assert.equal(h.waits.length, 0);
});

test('pre-thought rescue choices are marked so normal choice hooks cannot add a second delay', async () => {
	const h = fixture({ capable: [0], onChoose({ options, dying }) { assert.equal(options._HH_rescueThought, true); dying.hp = 1; return { bool: true }; } });
	await h.run(); assert.deepEqual(h.waits, [700]);
});

test('recovering or ending the game during a countdown cancels further rescue choices and clears the prompt', async () => {
	let h = fixture({ capable: [0], onWait({ dying }) { dying.hp = 1; } });
	await h.run(); assert.equal(h.choices.length, 0); assert.equal(h.active.length, 0);
	h = fixture({ capable: [0], onWait({ event }) { event.finished = true; } });
	await h.run(); assert.equal(h.choices.length, 0); assert.equal(h.active.length, 0);
});

test('a manual player with no Peach still gets a choice and must cancel before polling advances', async () => {
	let release;
	const h = fixture({ duration: 0, onChoose({ player }) { if (player.id === 0) return new Promise(resolve => { release = resolve; }); return { bool: false }; } });
	const pending = h.run(); assert.equal(h.active.length, 1); assert.equal(h.waits.length, 0);
	assert.equal(h.players[0].canSave(h.dying), false); assert.deepEqual(h.turns, [0]); assert.equal(h.rounds.length, 1);
	release({ bool: false }); await pending; assert.equal(h.active.length, 0); assert.equal(h.rounds.length, 0);
	assert.deepEqual(h.choices.map(choice => choice.player), [0, 1, 2, 3]);
});

test('the actual native chooseToUse opens the human rescue dialog even when no savable card is selected', async () => {
	let pauses = 0;
	const dialogs = [];
	const h = fixture({ duration: 0, async onChoose({ player, options }) {
		if (player.id === 0) {
			const choice = { ...options, player, isMine: () => true };
			await h.nativeChoiceStart(choice, null, player);
			assert.equal(choice.dialog.prompt, options.prompt);
		}
		return { bool: false };
	} });
	h.players[0].getSkills = () => []; h.players[0].isUnderControl = () => false;
	h.context.lib.skill = { global: [] }; h.context.lib.config.auto_confirm = true;
	Object.assign(h.context.game, { expandSkills() {}, check: () => false, pause() { pauses++; } });
	Object.assign(h.context.get, { card: () => undefined, info: () => ({}) });
	h.context.ui.create = { dialog(prompt) { const dialog = { prompt, addText() {} }; dialogs.push(dialog); return dialog; } };
	await h.run(); assert.equal(pauses, 1); assert.equal(dialogs.length, 1); assert.equal(h.players[0].canSave(h.dying), false);
});

test('a choice exception removes both the current question and the dying marker', async () => {
	const broken = fixture({ capable: [0], plans: { 0: [{ error: true }] } });
	await assert.rejects(broken.run(), /choice failure/); assert.equal(broken.active.length, 0); assert.equal(broken.rounds.length, 0);
});

test('setup is idempotent and network play delegates to the original save implementation', async () => {
	const h = fixture(); const wrapped = h.context.lib.element.content._save;
	assert.equal(setupRescueFlow(h.context), h.prompt); assert.equal(h.context.lib.element.content._save, wrapped);
	h.context._status.connectMode = true; await h.run(); assert.equal(h.turns.length, 0); assert.equal(h.waits.length, 0);
});

function domHarness(style = 'off') {
	let now = 0, next = 0;
	const timers = new Map(), animations = [];
	class Element {
		constructor() {
			this.children = []; this.style = {}; this.dataset = {}; this.classes = new Set();
			this.classList = { toggle: (name, value) => value ? this.classes.add(name) : this.classes.delete(name), contains: name => this.classes.has(name) };
		}
		appendChild(child) { child.remove?.(); this.children.push(child); child.parent = this; return child; }
		remove() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; }
		setAttribute(name, value) { this[name] = value; }
		animate(frames, options) { const animation = { frames, options, cancelled: false, cancel() { this.cancelled = true; } }; animations.push(animation); return animation; }
	}
	const body = new Element(), head = new Element();
	const document = { body, head, createElement: () => new Element(), createTextNode: textContent => ({ textContent }), getElementById: id => head.children.find(node => node.id === id) };
	const lib = { onover: [], assetURL: '/game/', config: { extension_HH优化_newDecadeStyle: style } };
	const prompt = createRescuePrompt({ lib }, { document, now: () => now, setTimer: (fn, ms) => { const id = ++next; timers.set(id, { fn, due: now + ms }); return id; }, clearTimer: id => timers.delete(id) });
	function advance(ms) { now += ms; for (const [id, timer] of [...timers]) if (timer.due <= now) { timers.delete(id); timer.fn(); } }
	return { prompt, document, body, head, lib, animations, timers, advance, player: () => new Element() };
}

test('rescue uses the normal phase-tip layout and nested rescue restores the suspended seat', async () => {
	const h = domHarness(), first = h.prompt.begin(h.player(), {}, 1000);
	assert.equal(first.node.className, 'tipshow hh-rescue-thinking'); assert.equal(first.node.alt, '桃 思考中…');
	assert.equal(first.node.src, '/game/extension/HH优化/ui/assets/lbtn/shoushatip/tiptao.png');
	const phase = createPlayerTip(h.lib, 'playertip', 'tip.png', h.document);
	assert.equal(first.node.style.cssText, phase.style.cssText); assert.equal(h.body.classList.contains('hh-rescue-active'), true);
	assert.match(h.head.children[0].textContent, /pointer-events:none/);
	const waiting = first.wait(1000); h.advance(400); assert.equal(h.timers.size, 1);
	const nested = h.prompt.begin(h.player(), {}, 0);
	assert.equal(first.node.style.display, 'none'); assert.equal(nested.node.dataset.timed, 'false');
	h.prompt.end(nested); assert.equal(first.node.style.display, 'block');
	h.advance(600); assert.equal(await waiting, true); h.prompt.end(first);
	assert.equal(h.animations.length, 0);
	assert.equal(h.prompt.active, false); assert.equal(h.timers.size, 0); assert.equal(h.body.classList.contains('hh-rescue-active'), false);
	for (const style of ['on', 'othersOff']) {
		const themed = domHarness(style), turn = themed.prompt.begin(themed.player(), {}, 0);
		const phase = createPlayerTip(themed.lib, 'playertip', 'tip.png', themed.document);
		assert.equal(turn.node.style.cssText, phase.style.cssText); themed.prompt.end(turn);
	}
});

test('game end cancels outstanding countdown promises and clears every rescue node and timer', async () => {
	const h = domHarness(), player = h.player(), dying = h.player(), round = h.prompt.beginRound(dying), turn = h.prompt.begin(player, dying, 1000);
	const waiting = turn.wait(1000); h.lib.onover[0]();
	assert.equal(await waiting, false); assert.equal(player.children.length, 0); assert.equal(h.timers.size, 0);
	assert.equal(h.prompt.current, null); assert.equal(h.body.classList.contains('hh-rescue-active'), false);
	assert.equal(dying.children.length, 0); assert.equal(round.closed, true);
});

test('the original red rescue marker stays on the dying portrait while the asking seat changes', () => {
	const h = domHarness(), dying = h.player(), round = h.prompt.beginRound(dying);
	const marker = dying.children[0];
	assert.equal(marker.className, 'hh-rescue-help'); assert.equal(marker['aria-label'], '救我');
	assert.equal(marker.children[0].src, '/game/extension/HH优化/assets/rescue/jiuwo-static.png');
	const badge = fs.readFileSync(new URL('../assets/rescue/jiuwo-static.png', import.meta.url));
	assert.equal(badge.readUInt32BE(16), 200); assert.equal(badge.readUInt32BE(20), 120);
	const markerStyle = h.head.children[0].textContent.match(/\.hh-rescue-help>img\{([^}]+)\}/)[1];
	assert.match(markerStyle, /animation:none/); assert.match(markerStyle, /transform:none/);
	const first = h.prompt.begin(h.player(), dying); h.prompt.end(first);
	assert.equal(dying.children[0], marker);
	const second = h.prompt.begin(h.player(), dying); h.prompt.end(second);
	assert.equal(dying.children[0], marker);
	h.prompt.endRound(round); assert.equal(dying.children.length, 0);
});

test('nested rescue rounds reuse a dying marker and independently clean up different dying portraits', () => {
	const h = domHarness(), first = h.player(), other = h.player();
	const outer = h.prompt.beginRound(first), inner = h.prompt.beginRound(first), nested = h.prompt.beginRound(other);
	assert.equal(first.children.length, 1); assert.equal(other.children.length, 1);
	h.prompt.endRound(inner); assert.equal(first.children.length, 1);
	h.prompt.endRound(nested); assert.equal(other.children.length, 0); assert.equal(first.children.length, 1);
	h.prompt.endRound(outer); h.prompt.endRound(outer); assert.equal(first.children.length, 0);
});
