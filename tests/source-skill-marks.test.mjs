import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { decorateSourceSkillMark, refreshSourceSkillMarks } from '../src/ui/sourceSkillMarks.js';

test('both mark textures preserve the native atlas crops and independent nine-slice borders', () => {
	const root = new URL('../assets/skill-marks/', import.meta.url);
	const sources = JSON.parse(fs.readFileSync(new URL('sources.json', root), 'utf8'));
	const css = fs.readFileSync(new URL('../src/styles/source-skill-marks.css', import.meta.url), 'utf8');
	assert.equal(sources.atlas.cacheKey, '61c5aa54'); assert.equal(sources.texture.cacheKey, 'db156ff2');
	assert.deepEqual(sources.files.map(file => file.kind), ['gray', 'gold']);
	for (const file of sources.files) {
		const bytes = fs.readFileSync(new URL(file.file, root));
		assert.equal(bytes.length, file.bytes); assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
		assert.equal(bytes.readUInt32BE(16), 30); assert.equal(bytes.readUInt32BE(20), 30);
		assert.ok(css.includes(file.file + '") ' + file.sizeGrid.join(' ') + ' fill'));
	}
	assert.ok(css.includes('.hh-source-mark-content'));
	assert.ok(!css.includes('.skillMarkItem'));
});

class Element {
	constructor(classes = '') {
		this.children = []; this.dataset = {}; this.style = { setProperty(key, value) { this[key] = value; } }; this.listeners = {};
		const values = new Set(classes.split(/[ .]+/).filter(Boolean));
		this.classList = { contains: value => values.has(value), add: (...names) => names.forEach(name => values.add(name)), remove: (...names) => names.forEach(name => values.delete(name)), toggle(name, state = !values.has(name)) { if (state) values.add(name); else values.delete(name); } };
	}
	appendChild(child) { child.remove(); child.parentNode = this; this.children.push(child); return child; }
	remove() { if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; }
	delete() { this.remove(); }
	addEventListener(type, fn) { this.listeners[type] = fn; }
	set innerHTML(value) { this.textContent = value; }
	get innerHTML() { return this.textContent; }
	setBackground() { return this; }
	setBackgroundImage(value) { this.style.backgroundImage = value; }
}

const core = ts.createSourceFile('player.js', fs.readFileSync(new URL('../../../noname/library/element/player.js', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const methods = new Map();
function visit(node) { if (ts.isMethodDeclaration(node) && ['markSkill', 'unmarkSkill', 'updateMarks'].includes(node.name?.getText(core))) methods.set(node.name.getText(core), node.getText(core)); ts.forEachChild(node, visit); }
visit(core);
const override = fs.readFileSync(new URL('../src/overrides/player/marks.js', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');

function fixture({ touchscreen = false } = {}) {
	const log = { videos: [], broadcasts: [], all: [], sync: [], clicks: [] };
	const lib = { config: { touchscreen, hover_all: true, right_info: true, extension_HH优化_newDecadeStyle: 'on' }, translate: { zhichi: '智迟', zhaofu: '诏缚', pojun: '破军', awakening: '觉醒', custom: '完整技能名称' }, skill: {
		zhichi: { intro: { content: '状态' } }, zhaofu: { intro: { content: '状态' } }, pojun: { intro: { content: 'cards' } }, awakening: { juexingji: true, intro: {} }, image: { markimage: 'image.png', intro: {} }, custom: { intro: {} },
	}, setHover(node, fn) { node.hoverHandler = fn; } };
	const create = (classes, parent) => { const node = new Element(classes); parent?.appendChild(node); return node; };
	const document = { createElement: () => new Element() };
	const createNode = (classes, parent) => { const node = create(classes, parent); node.ownerDocument = document; return node; };
	const ui = { create: { div: createNode }, click: { card() { log.clicks.push(this); }, hoverplayer() {}, rightplayer() {} }, updatem() {} };
	const get = { info: name => lib.skill[name], itemtype: value => value?.card ? 'card' : Array.isArray(value) ? 'cards' : typeof value, translation: name => lib.translate[name] || name, character: () => ({}), skillintro: () => '武将说明', cardInfo: card => [card.name] };
	const window = { decadeUI: { config: { newDecadeStyle: 'on', playerMarkStyle: 'decade' }, element: { create: createNode } } };
	const game = { addVideo: (...args) => log.videos.push(args), broadcast: (...args) => log.broadcasts.push(args), broadcastAll(fn, ...args) { log.all.push(args); vm.runInNewContext('(' + fn.toString() + ')')(...args); } };
	let base;
	const realm = vm.createContext({ lib, ui, get, game, window, _status: {}, console, decorateSourceSkillMark, refreshSourceSkillMarks, getBasePlayerMethods: () => base });
	vm.runInContext('globalThis.native = ({' + [...methods.values()].join(',') + '});\n' + override, realm); base = realm.native;
	const player = Object.assign(new Element('player'), { marks: {}, storage: {}, hujia: 0, node: { marks: new Element('dui-marks') }, updateMarks: base.updateMarks, markSkill: realm.playerMarkSkill, unmarkSkill: realm.playerUnmarkSkill, mark: realm.playerMark, markCharacter: realm.playerMarkCharacter, markSkillCharacter: realm.playerMarkSkillCharacter, updateMark: realm.playerUpdateMark, syncStorage(name) { log.sync.push(name); }, countCards: () => 3 });
	player.appendChild(player.node.marks);
	return { player, lib, log, ui, get, realm, base };
}

test('native markSkill creates gray states and a gold card mark with live counters and original click handlers', () => {
	const h = fixture(), p = h.player;
	p.markSkill('zhichi'); p.markSkill('zhaofu'); p.storage.pojun = [1, 2, 3, 4]; p.markSkill('pojun');
	assert.equal(p.marks.zhichi.dataset.hhSourceMark, 'gray'); assert.equal(p.marks.zhaofu.text.dataset.hhSourceMarkLabel, '诏缚');
	assert.equal(p.marks.pojun.dataset.hhSourceMark, 'gold'); assert.equal(p.marks.pojun.markcount.textContent, 4);
	assert.equal(p.marks.pojun.hhSourceMarkContent.textContent, '破军[4]');
	assert.equal(p.marks.pojun.parentNode, p.node.marks); assert.equal(p.node.marks.classList.contains('hh-source-marks'), true);
	const mark = p.marks.pojun; mark.listeners.click.call(mark);
	assert.equal(h.log.clicks[0], mark); assert.equal(mark.hoverHandler, h.ui.click.hoverplayer); assert.equal(mark.oncontextmenu, h.ui.click.rightplayer);
	p.storage.pojun = [1, 2]; p.updateMark('pojun', true);
	assert.equal(p.marks.pojun, mark); assert.equal(mark.markcount.textContent, 2); assert.deepEqual(h.log.sync, ['pojun']);
	assert.equal(mark.hhSourceMarkContent.textContent, '破军[2]');
	p.storage.pojun = []; p.updateMark('pojun'); assert.equal(mark.markcount, undefined); assert.equal(mark.hhSourceMarkContent.textContent, '破军');
	p.unmarkSkill('pojun'); assert.equal(p.marks.pojun, undefined); assert.equal(mark.parentNode, null);
	assert.ok(h.log.videos.some(entry => entry[0] === 'unmarkSkill'));
});

test('full labels preserve legacy text used by other styles and touch interactions stay native', () => {
	const h = fixture({ touchscreen: true }); h.player.markSkill('custom');
	const mark = h.player.marks.custom;
	assert.equal(mark.text.textContent, '完整'); assert.equal(mark.text.dataset.hhSourceMarkLabel, '完整技能名称');
	assert.equal(mark.hhSourceMarkContent.textContent, '完整技能名称');
	assert.equal(mark.listeners.touchend, h.ui.click.card); assert.equal(mark.listeners.click, undefined);
	assert.equal(mark.info, h.lib.skill.custom.intro);
});

test('awakening, image marks, conversion and limited skills retain their original display', () => {
	const h = fixture(); h.player.markSkill('zhichi'); h.player.markSkill('awakening'); h.player.markSkill('image');
	assert.equal(h.player.marks.awakening.classList.contains('hh-source-mark'), false);
	assert.equal(h.player.marks.image.classList.contains('hh-source-mark'), false);
	assert.equal(h.player.marks.image.text.style.backgroundImage, 'image.png');
	assert.equal(h.player.node.marks.classList.contains('hh-source-marks'), false);
	for (const flag of ['limited', 'zhuanhuanji', 'zhuanhuanji2']) { h.lib.skill[flag] = { [flag]: true, intro: {} }; h.player.markSkill(flag); assert.equal(h.player.marks[flag], undefined); }
	h.lib.skill.zhichi.juexingji = true; decorateSourceSkillMark(h.player.marks.zhichi, h.lib);
	assert.equal(h.player.marks.zhichi.classList.contains('hh-source-mark'), false);
});

test('card copies are preserved and mixed containers keep the existing layout', () => {
	const h = fixture(), card = { card: true, name: 'sha', suit: 'spade', number: 7, classList: new Element().classList, copy: () => new Element('card mark') };
	h.player.markSkill('zhichi'); const mark = h.player.mark(card, {}, 'pojun');
	assert.equal(mark.suit, 'spade'); assert.equal(mark.number, 7); assert.equal(mark.classList.contains('hh-source-mark'), false);
	assert.equal(h.player.node.marks.classList.contains('hh-source-marks'), false);
	mark.remove(); refreshSourceSkillMarks(h.player.node.marks);
	assert.equal(h.player.node.marks.classList.contains('hh-source-marks'), true);
});

test('serialized skill-character broadcasts create and update labels without closure variables or rebroadcast loops', () => {
	const h = fixture(); h.lib.skill.binding = { intro: { mark() {} } };
	h.player.markSkillCharacter('binding', { name: 'chengong' }, '诏缚', '可查看牌');
	const mark = h.player.marks.binding;
	assert.equal(h.log.all.length, 1); assert.equal(mark.dataset.hhSourceMark, 'gold');
	assert.equal(mark.text.dataset.hhSourceMarkLabel, '诏缚'); assert.equal(mark.info.content, '可查看牌');
	h.player.markSkillCharacter('binding', 'chengong', '更新后的技能标记', '新说明');
	assert.equal(h.player.marks.binding, mark); assert.equal(h.log.all.length, 2);
	assert.equal(mark.text.dataset.hhSourceMarkLabel, '更新后的技能标记'); assert.equal(mark.info.content, '新说明');
	h.player.updateMark('binding'); assert.equal(mark.text.dataset.hhSourceMarkLabel, '更新后的技能标记');
	h.player.markSkillCharacter('binding', 'chengong', '仅本机', '本机说明', true);
	assert.equal(h.log.all.length, 2); assert.equal(mark.text.dataset.hhSourceMarkLabel, '仅本机');
});

test('native markSkill broadcasts preserve state and source styling on a separately loaded client', () => {
	const host = fixture(), remote = fixture(); host.player.storage.pojun = [1, 2, 3, 4]; host.player.markSkill('pojun');
	const [fn, storage, , name, info, card] = host.log.broadcasts[0];
	vm.runInNewContext('(' + fn.toString() + ')', { lib: remote.lib })(storage, remote.player, name, info, card);
	assert.equal(remote.player.marks.pojun.dataset.hhSourceMark, 'gold'); assert.equal(remote.player.marks.pojun.markcount.textContent, 4);
	assert.equal(remote.player.marks.pojun.text.dataset.hhSourceMarkLabel, '破军');
});

const nativePacks = new Map();
function nativeSkill(pack, name) {
	if (!nativePacks.has(pack)) nativePacks.set(pack, ts.createSourceFile(pack + '.js', fs.readFileSync(new URL('../../../character/' + pack + '/skill.js', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS));
	const source = nativePacks.get(pack); let definition;
	function find(node) { if (ts.isPropertyAssignment(node) && node.name?.getText(source) === name && ts.isObjectLiteralExpression(node.initializer)) definition = node.initializer; ts.forEachChild(node, find); }
	find(source); assert.ok(definition, name + ' exists in the installed game');
	return vm.runInNewContext('(' + definition.getText(source) + ')');
}

test('actual Xu Sheng variants, Deng Ai and Zhong Hui definitions create gold expansion marks', () => {
	for (const [pack, key, label] of [['refresh', 'repojun2', '破军'], ['refresh', 'decadepojun2', '破军'], ['yijiang', 'xinpojun2', '破军'], ['shenhua', 'tuntian', '屯田'], ['yijiang', 'quanji', '权计']]) {
		const h = fixture(); h.lib.skill[key] = nativeSkill(pack, key); h.lib.translate[key] = label;
		h.player.countCards = () => 3; h.player.markSkill(key);
		const mark = h.player.marks[key];
		assert.equal(mark.dataset.hhSourceMark, 'gold', key);
		assert.equal(mark.hhSourceMarkContent.textContent, label + '[3]', key);
		assert.equal(mark.info, h.lib.skill[key].intro);
	}
});

test('updates correct a cached gray classification and expansion-count-only custom marks also become gold', () => {
	const h = fixture(); h.lib.translate.late = '破军'; h.lib.skill.late = { intro: { content: '状态' } };
	h.player.markSkill('late'); const mark = h.player.marks.late;
	assert.equal(mark.dataset.hhSourceMark, 'gray');
	h.lib.skill.late.intro = nativeSkill('refresh', 'repojun2').intro;
	h.player.updateMark('late');
	assert.equal(mark.dataset.hhSourceMark, 'gold'); assert.equal(mark.classList.contains('own-skill'), false);
	assert.equal(mark.hhSourceMarkContent.textContent, '破军[3]');
	h.lib.skill.countOnly = { intro: { markcount: 'expansion' } }; h.lib.translate.countOnly = '存牌';
	h.player.markSkill('countOnly'); assert.equal(h.player.marks.countOnly.dataset.hhSourceMark, 'gold');
	h.player.marks.customIntro = h.player.mark('customIntro', { content: 'cards' }); h.player.updateMark('customIntro');
	assert.equal(h.player.marks.customIntro.dataset.hhSourceMark, 'gold');
});
