import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { domFixture } from './catalog-dom.mjs';
import { setupPlayerActionTimer } from '../../src/features/playerActionTimer.js';

function nativeMethods(file, className, names) {
	const source = ts.createSourceFile(file, fs.readFileSync(new URL(file, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
	const definition = source.statements.find(node => ts.isClassDeclaration(node) && node.name.text === className);
	return `class Native${className} {\n${definition.members.filter(node => names.includes(node.name?.getText(source))).map(node => node.getText(source)).join('\n')}\n}`;
}

const methods = nativeMethods('../../../../noname/game/index.js', 'Game', ['pause', 'resume', 'pause2', 'resume2', 'countChoose', 'stopCountChoose'])
	+ nativeMethods('../../../../noname/ui/click/index.js', 'Click', ['ok', 'cancel', 'auto', 'dialogcontrol']);
const coreSource = fs.readFileSync(new URL('../../../../noname/library/element/content.ts', import.meta.url), 'utf8');
const coreCode = ts.transpileModule(coreSource.slice(coreSource.indexOf('export const Content')).replace('export const Content', 'const Content') + '\nglobalThis.coreContent = Content;', {
	compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const progressCode = fs.readFileSync(new URL('../../src/ui/progress-bar.js', import.meta.url), 'utf8').replace(/^import[^\n]*\n/gm, '').replaceAll('export function ', 'function ');
const pauseCode = ts.transpileModule(fs.readFileSync(new URL('../../../../noname/game/PauseManager.ts', import.meta.url), 'utf8')
	.replace(/^import[^\n]*\n/gm, '').replace('export default class', 'class') + '\nnew PauseManager();', {
	compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

export function actionHarness({ style = '2', seconds = '15', config = {}, nativePause = false } = {}) {
	const dom = domFixture(), { document, Element, environment } = dom;
	document.getElementById = id => document.body.querySelectorAll('div').find(node => node.id === id);
	const intervals = new Set(), calls = { uses: [], responses: [], discards: [], countdowns: [] };
	function setInterval(fn, ms) {
		const token = { active: true };
		const tick = () => { if (!token.active) return; fn(); if (token.active) token.timer = environment.setTimer(tick, ms); };
		token.timer = environment.setTimer(tick, ms); intervals.add(token); return token;
	}
	function clearInterval(token) { if (!token) return; token.active = false; environment.clearTimer(token.timer); intervals.delete(token); }
	let paused = false, release;
	const status = { gameStarted: true, imchoosing: false, prehidden_skills: [], pauseManager: { get pause() { return new Promise(resolve => { release = resolve; }); } } };
	if (nativePause) status.pauseManager = vm.runInNewContext(pauseCode);
	Object.defineProperty(status, 'paused', nativePause ? {
		get: () => status.pauseManager.pause.isStarted,
		set(value) { if (value) status.pauseManager.pause.start(); else status.pauseManager.pause.resolve(); },
	} : { get: () => paused, set(value) { const was = paused; paused = value; if (was && !value) { const resolve = release; release = null; resolve?.(); } } });
	const lib = { config: { extension_HH优化_jindutiaoYangshi: style, extension_HH优化_playerActionTime: seconds, extension_HH优化_jindutiaoSet: 22, auto_confirm: false, autoskilllist: [], ...config },
		onover: [], skill: { global: [] }, filter: { all: () => true, cardDiscardable: card => !card.protected, cardAiIncluded: () => true, wuxieSwap: () => false }, assetURL: '', configOL: { choose_timeout: 15 } };
	const ui = { selected: { cards: [], buttons: [], targets: [] }, arena: new Element(), auto: new Element(), control: new Element(), create: {}, dialogs: [], controls: [], updatec() {},
		timer: { show() {}, hide() {} } };
	ui.control.hide = () => { ui.control.hidden = true; }; ui.control.show = () => { ui.control.hidden = false; };
	const closable = () => ({ style: {}, buttons: [], content: {}, classList: { add() {}, remove() {} }, open() {}, close() {}, add() {}, addText() {} });
	ui.create.dialog = () => closable(); ui.create.cardChooseAll = () => {};
	ui.create.control = (...args) => {
		const control = new Element(); control.className = 'control';
		Object.defineProperty(control, 'lastChild', { get: () => control.children.at(-1) });
		control.close = () => { control.remove(); ui.controls.splice(ui.controls.indexOf(control), 1); if (ui.confirm === control) ui.confirm = null; };
		for (const link of Array.isArray(args[0]) ? args[0] : args) {
			if (typeof link !== 'string' || link === 'stayleft' || link === 'nozoom') continue;
			const button = new Element(); button.link = link; button.textContent = link; control.appendChild(button);
		}
		ui.controls.unshift(control); document.body.appendChild(control); return control;
	};
	ui.create.confirm = str => {
		if (ui.confirm?.str === str) return;
		ui.confirm?.close();
		if (!str) return;
		const control = new Element(); control.className = 'control confirm'; control.str = str;
		control.close = () => { control.remove(); if (ui.confirm === control) ui.confirm = null; };
		for (const key of str) { const button = new Element(); button.link = key === 'o' ? 'ok' : 'cancel'; button.textContent = button.link; control.appendChild(button); }
		ui.confirm = control; document.body.appendChild(control);
	};
	let game;
	const get = { event: () => status.event, links: items => items.map(item => item.link), info: () => ({}), select: value => Array.isArray(value) ? value : [value ?? 1, value ?? 1],
		card: () => ui.selected.cards[0], autoViewAs: card => card, objtype: () => 'div', itemtype: value => value?.close ? 'dialog' : undefined,
		translation: value => value?.name || value, cnNumber: String, numStr: String };
	const ai = { basic: { chooseCard() {
		const event = status.event, cards = player.getCards(event.position).filter(card => event.filterCard(card, player));
		ui.selected.cards.push(...cards.slice(0, get.select(event.selectCard)[0])); game.check(); return ui.selected.cards.length > 0;
	} } };
	const context = vm.createContext({ document, window: {}, lib, ui, get, ai, _status: status, performance: { now: environment.now },
		setInterval, clearInterval, setTimeout: environment.setTimer, clearTimeout: environment.clearTimer });
	vm.runInContext(methods + '\nglobalThis.nativeGame = new NativeGame(); globalThis.nativeClick = new NativeClick();', context);
	game = context.nativeGame; context.game = game; ui.click = context.nativeClick; ui.click.shortcut = () => {};
	const hand = Array.from({ length: 3 }, (_, index) => Object.assign(new Element(), { name: ['sha', 'shan', 'tao'][index], number: index + 1,
		uncheck() { this.classList.add('uncheck'); }, recheck() { this.classList.remove('uncheck'); } }));
	const player = { hp: 3, isMine: () => !status.auto && !game.notMe, isUnderControl: () => false, isOnline: () => false, isOut: () => false,
		getCards() { const cards = vm.runInContext('[]', context); cards.push(...hand); return cards; }, getSkills: () => [], showTimer() {}, hideTimer() {},
		useResult(result) { calls.uses.push(result); return {}; }, respond(...args) { calls.responses.push(args); return { set() {} }; },
		discard(cards) { calls.discards.push(cards); return {}; },
	};
	game.me = player; game.players = [player];
	Object.assign(game, { expandSkills: skills => skills, countDown: (...args) => calls.countdowns.push(args), checkMod: () => 'unchanged',
		check() { const event = status.event; const ok = ui.selected.cards.length >= get.select(event.selectCard)[0]; ui.create.confirm((ok ? 'o' : '') + (event.forced ? '' : 'c')); game.countChoose(); return ok; },
		uncheck() { for (const items of Object.values(ui.selected)) items.length = 0; status.imchoosing = false; }, addVideo() {}, broadcast() {}, broadcastAll() {}, log() {}, delay() {},
	});
	vm.runInContext('Array.prototype.add = function(v) { if (!this.includes(v)) this.push(v); return this; }; Array.prototype.remove = function(v) { const i = this.indexOf(v); if (i >= 0) this.splice(i, 1); return this; };', context);
	ui.controls = vm.runInContext('[]', context);
	vm.runInContext(coreCode, context);
	vm.runInContext(progressCode + '\ninitPrecontentUI();', context);
	const timer = setupPlayerActionTimer({ lib, game, ui, get, _status: status }, { now: environment.now, setInterval, clearInterval });
	function event(name = 'chooseToUse', options = {}) {
		const evt = { name, player, type: name === 'chooseToUse' ? 'phase' : undefined, forced: false, position: 'h', prompt: false, selectCard: 1,
			filterCard: () => true, autochoose: () => false, isMine: player.isMine, isOnline: () => false, async trigger() {},
			resume() { status.imchoosing = false; }, restore() { delete evt.skill; }, ...options };
		evt._aiexclude = vm.runInContext('[]', context);
		if (Array.isArray(evt.controls)) { const controls = vm.runInContext('[]', context); controls.push(...evt.controls); evt.controls = controls; }
		evt.getParent = name => { let parent = evt.parent; if (!name) return parent || {}; while (parent && parent.name !== name) parent = parent.parent; return parent; };
		return evt;
	}
	function wait(evt) { status.event = evt; game.countChoose(); game.pause(); return timer.current; }
	async function run(evt) {
		status.event = evt;
		const steps = context.coreContent[evt.name];
		if (!Array.isArray(steps)) return steps(evt, undefined, evt.player);
		let step = 0, pending = 0;
		Object.defineProperty(evt, 'step', { get: () => step, set: value => { pending = value; } });
		evt.goto = value => { pending = value; }; evt.redo = () => { pending = step; }; evt.finish = () => { evt.finished = true; };
		for (let guard = 0; !evt.finished && step < steps.length; guard++) {
			if (guard > 40) throw new Error('Native event did not terminate');
			pending = step + 1;
			const result = await steps[step](evt, undefined, evt.player, evt._result);
			if (result !== undefined) evt._result = result;
			if (status.paused) await status.pauseManager.pause;
			step = pending;
		}
	}
	const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
	function card(name) {
		const source = fs.readFileSync(new URL('../../../../card/standard.js', import.meta.url), 'utf8');
		vm.runInContext(source.slice(source.indexOf('export default')).replace('export default', 'globalThis.standardCards ='), context);
		return context.standardCards.card[name];
	}
	function skin(name) {
		const load = path => vm.runInContext(fs.readFileSync(new URL(path, import.meta.url), 'utf8').replace(/^import[^\n]*\n/gm, '').replaceAll('export function ', 'function '), context);
		load('../../src/core/app.js'); vm.runInContext('initApp(); globalThis.app = window.app;', context);
		load('../../ui/lbtn/skins/base.js');
		if (name !== 'base') load(`../../ui/lbtn/skins/${name}.js`);
		const creator = `create${name.charAt(0).toUpperCase() + name.slice(1)}LbtnPlugin`;
		const plugin = vm.runInContext(`${creator}(lib, game, ui, get, ai, _status, app)`, context);
		plugin.initConfirmRewrite(); plugin.initCancelIntercept(); return plugin;
	}
	function stop() { for (const fn of lib.onover) fn(); }
	return { ...dom, lib, game, ui, get, status, player, hand, calls, timer, intervals, context, event, wait, run, flush, card, skin, stop };
}
