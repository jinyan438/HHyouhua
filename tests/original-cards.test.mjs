import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import test from 'node:test';
import ts from 'typescript';
import { applyOriginalCardFace, applyOriginalGlyphs, originalCardNames, originalCardFilename, originalHandRow, originalCentralRow, originalHandScale, originalDiscardScale, migrateOriginalCardLayout, originalCardLayout, originalCardStylePriority, originalCardConfig, prioritizeOriginalCardMenu } from '../src/ui/originalCards.js';
import { getPlayerStyleSizing } from '../src/ui/playerStyleSizing.js';
import { domFixture } from './helpers/catalog-dom.mjs';

const read = file => fs.readFileSync(new URL(file, import.meta.url), 'utf8');
const assets = new URL('../assets/original-cards/', import.meta.url);
const fixtures = JSON.parse(read('./fixtures/original-card-layout.json'));

test('all standard and extra pack entities resolve to the exact original PNGs', () => {
	const names = new Set();
	for (const [pack, count] of [['standard', 32], ['extra', 10]]) {
		const source = ts.createSourceFile(pack, read(`../../../card/${pack}.js`), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
		const definition = source.statements.find(ts.isExportAssignment).expression;
		const defined = new Set(definition.properties.find(prop => prop.name?.getText(source) === 'card').initializer.properties.map(prop => prop.name.getText(source)));
		const list = definition.properties.find(prop => prop.name?.getText(source) === 'list').initializer;
		const packNames = new Set();
		for (const row of list.elements) {
			const name = row.elements[2].text, nature = row.elements[3]?.text;
			if (defined.has(name)) packNames.add(name);
			names.add(name);
			const filename = originalCardFilename(name, nature);
			assert.ok(filename, `${pack}: ${name}/${nature}`);
			assert.ok(fs.existsSync(new URL(filename + '.png', assets)));
		}
		assert.equal(packNames.size, count);
	}
	assert.deepEqual([...originalCardNames].sort(), [...names].sort());
	assert.equal(originalCardFilename('sha', ['ice']), 'sha_ice');
	for (const card of [['unknown'], ['sha', 'fire|thunder'], ['sha', ['fire', 'thunder']]]) assert.equal(originalCardFilename(...card), null);
});

test('all 75 PNGs and the original client method snapshots retain their hashes', () => {
	const provenance = JSON.parse(fs.readFileSync(new URL('sources.json', assets)));
	assert.equal(provenance.files.length, 75);
	for (const file of provenance.files) {
		const bytes = fs.readFileSync(new URL(file.file, assets));
		assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.file);
		assert.equal(bytes.length, file.bytes);
		if (!/^(red_|black_|spade|heart|diamond|club)/.test(file.file)) assert.deepEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], [126, 174]);
	}
	for (const [name, method] of Object.entries(fixtures)) assert.equal(createHash('sha256').update(method).digest('hex'), provenance.methods[name]);
});

function cardFixture() {
	const { Element, document } = domFixture();
	document.baseURI = 'https://noname.test/game/';
	const card = new Element(), node = new Element(), num = new Element('span'), suit = new Element('span');
	for (const el of [card, node, num, suit]) el.style.removeProperty = function (key) { delete this[key.startsWith('--') ? key : key.replace(/-([a-z])/g, (_, c) => c.toUpperCase())]; };
	node.className = 'suit-num'; suit.className = 'suit';
	node.$num = num; node.$suit = suit; card.$suitnum = node;
	card.appendChild(node); node.append(num, suit);
	return { card, node, num, suit };
}

test('face and alpha mask share an absolute URL for browser, subdirectory and local-file launches', () => {
	for (const [baseURI, assetURL, expected] of [
		['https://noname.test/game/', '', 'https://noname.test/game/extension/HH%E4%BC%98%E5%8C%96/assets/original-cards/sha.png'],
		['https://noname.test/game/index.html', './', 'https://noname.test/game/extension/HH%E4%BC%98%E5%8C%96/assets/original-cards/sha.png'],
		['https://noname.test/game/', '/assets/', 'https://noname.test/assets/extension/HH%E4%BC%98%E5%8C%96/assets/original-cards/sha.png'],
		['https://noname.test/game/', 'https://cdn.test/', 'https://cdn.test/extension/HH%E4%BC%98%E5%8C%96/assets/original-cards/sha.png'],
		['file:///F:/noname/index.html', '', 'file:///F:/noname/extension/HH%E4%BC%98%E5%8C%96/assets/original-cards/sha.png'],
	]) {
		const { card } = cardFixture();
		card.ownerDocument.baseURI = baseURI;
		applyOriginalCardFace(card, { name: 'sha', suit: 'spade', number: 7 }, assetURL);
		assert.equal(card.style.backgroundImage, `url("${expected}")`);
		assert.equal(card.style['--hh-original-card-face'], card.style.backgroundImage);
	}
});

test('all 52 rank/suit combinations use original red and black glyphs and cleanly fall back', () => {
	const h = cardFixture();
	for (const suit of ['spade', 'club', 'heart', 'diamond']) for (let number = 1; number <= 13; number++) {
		assert.ok(applyOriginalCardFace(h.card, [suit, number, 'sha', 'fire'], '/'));
		assert.ok(h.card.style.backgroundImage.endsWith('/sha_fire.png")'));
		assert.equal(h.card.style['--hh-original-card-face'], h.card.style.backgroundImage);
		assert.ok(h.suit.style.backgroundImage.endsWith(`/${suit}.png")`));
		const match = h.num.style.backgroundImage.match(/\/((red|black)_[a-z0-9]+\.png)/);
		assert.equal(match[2], ['heart', 'diamond'].includes(suit) ? 'red' : 'black');
		assert.ok(fs.existsSync(new URL(match[1], assets)));
		assert.equal(h.num.dataset.sourceGlyph, 'true');
	}
	applyOriginalGlyphs(h.node, 'none', 0);
	assert.equal(h.num.dataset.sourceGlyph, undefined); assert.equal(h.suit.dataset.sourceGlyph, undefined);
	applyOriginalGlyphs(h.node, 'diamond', 99);
	assert.equal(h.num.dataset.sourceGlyph, undefined); assert.equal(h.suit.dataset.sourceGlyph, 'true');
	assert.ok(applyOriginalCardFace(h.card, { name: 'shan', suit: 'spade', number: 11 }));
	assert.equal(applyOriginalCardFace(h.card, { name: 'custom', suit: 'heart', number: 5 }), false);
	assert.equal(h.card.classList.contains('hh-original-card'), false);
	assert.equal(h.card.style['--hh-original-card-face'], undefined);
	assert.equal(h.suit.dataset.sourceGlyph, undefined);
});

test('hand and central rows match the original executable layout functions across scales and widths', () => {
	const sourceHand = vm.runInNewContext(`({${fixtures['xvi.computeHandCard']}}).computeHandCard`);
	const sourceCentral = vm.runInNewContext(`({${fixtures['GMt.layoutStackCardUis']}}).layoutStackCardUis`, { ZP: { M_CARD_SIZE: { width: 126, height: 174 } } });
	for (const unit of [.5, 1, 1.6]) for (const width of [160, 600, 1400]) for (const count of [1, 2, 4, 8, 25]) {
		const handWidth = 126 * unit;
		const expectedHand = sourceHand.call({ cardUiSize: { width: handWidth }, MAX_HGAP: 0 }, count, 0, width);
		const hand = originalHandRow(count, width, handWidth);
		if (count > 1) assert.ok(Math.abs(hand.step - (handWidth + expectedHand.gap)) < 1e-8);
		const nodes = Array.from({ length: count }, () => ({ x: 0, y: 0, scale() {} }));
		sourceCentral.call({ clearEnterFrame() {}, startEnterFrame() {}, width: width / unit, height: 500, stackUis: nodes, clearedActionUis: [], stackCardScale: .87 });
		const row = originalCentralRow(count, width, handWidth * .87, unit);
		for (let i = 0; i < count; i++) assert.ok(Math.abs(row.start + row.step * i - nodes[i].EndX * unit) <= unit, `central ${unit}/${width}/${count}/${i}`);
	}
});

test('original appearance disables old saved overrides on every load without redundant writes', async () => {
	const lib = { config: { extension_HH优化_originalCardLayoutVersion: 1, extension_HH优化_cardScale: .6, extension_HH优化_discardScale: .5, unrelated: 8 } }, writes = [];
	const game = { promises: { async saveConfig(key, value) { lib.config[key] = value; writes.push(key); } } };
	await migrateOriginalCardLayout(lib, game);
	for (const [key, value] of Object.entries(originalCardConfig)) assert.equal(lib.config['extension_HH优化_' + key], value);
	assert.equal(lib.config.unrelated, 8);
	assert.equal(lib.config.extension_HH优化_originalCardLayoutVersion, 2);
	const initialWrites = writes.length;
	await migrateOriginalCardLayout(lib, game);
	assert.equal(writes.length, initialWrites);
	lib.config.extension_HH优化_cardScale = .3;
	lib.config.extension_HH优化_enable_card_rank_image = true;
	await migrateOriginalCardLayout(lib, game);
	assert.equal(writes.length, initialWrites + 2);
	assert.equal(lib.config.extension_HH优化_cardScale, originalHandScale);
	assert.equal(lib.config.extension_HH优化_enable_card_rank_image, false);
});

test('appearance override controls are absent while unrelated controls remain available', () => {
	const appearance = [...Object.keys(originalCardConfig), 'cardPrettify', 'handFoldMin', 'card_suit_blur', 'card_suit_image_size', 'card_rank_image_height'];
	const menu = Object.fromEntries([...appearance, 'speed_multiplier', 'player_width', 'cardGhostEffect'].map(key => [key, { name: key }]));
	assert.equal(prioritizeOriginalCardMenu(menu), menu);
	assert.deepEqual(Object.keys(menu), ['speed_multiplier', 'player_width', 'cardGhostEffect']);
});

function variableFunction(file, name) {
	const source = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
	let result;
	function visit(node) {
		if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) result = node.initializer.getText(source);
		ts.forEachChild(node, visit);
	}
	visit(source);
	assert.ok(result, name);
	return result;
}

test('actual feature CSS cannot replace or move original glyphs even with every legacy option enabled', () => {
	const config = Object.fromEntries(['enable_card_suit_color', 'enable_card_suit_blur', 'enable_card_suit_image', 'enable_card_rank_image'].map(key => ['extension_HH优化_' + key, true]));
	Object.assign(config, { extension_HH优化_suit_num_top: 40, extension_HH优化_suit_num_left: -40, extension_HH优化_card_suit_image_size: 40, extension_HH优化_card_rank_image_height: 60 });
	const source = variableFunction('../hh-features.js', 'updateCustomStyle');
	for (const priority of [false, true]) {
		const customStyleEl = {}, glow = { sheet: { cssRules: [], insertRule(rule) { this.cssRules.push(rule); } } };
		const context = { lib: { config, assetURL: '/' }, originalCardStylePriority: priority, getPlayerStyleSizing, customStyleEl, window: {}, document: { getElementById: () => glow } };
		vm.runInNewContext('(' + source + ')()', context);
		assert.ok(customStyleEl.textContent.includes('--hh-configured-player-width'), 'unrelated player styling still runs');
		for (const token of ['suit-num', 'tempsuitnum', 'card suit/', 'card shuzi/', 'margin-top: 40px']) assert.equal(customStyleEl.textContent.includes(token), !priority, token);
	}
});

test('actual hand scale and border hooks ignore stale legacy configuration at runtime', () => {
	const lib = { config: { extension_HH优化_cardScale: .9, extension_HH优化_cardkmh: 'kuang1', extension_HH优化_cardbj: 'kb4' }, assetURL: '/' };
	const context = { lib, originalHandScale, originalCardLayout, originalCardStylePriority };
	for (const name of ['isMobile', 'getRandom', 'getMapElementPos', 'delayRemoveCards', 'getPlayerIdentity']) context[name] = () => {};
	const register = variableFunction('../src/core/utility.js', 'registerDecadeUIUtilityModule');
	const ui = { get: { bodySize: () => ({ height: 1256 }) }, sheet: { getStyle: () => ({ width: '200px', height: '300px' }) } };
	vm.runInNewContext('(' + register + ')', context)(ui);
	assert.equal(ui.getCardBestScale(), 1256 / 750);
	assert.equal(ui.getHandCardSize().width, 126); assert.equal(ui.getHandCardSize().height, 174);
	const styles = read('../src/ui/cardStyles.js').replace(/^import .*;\r?$/gm, '').replace(/export function /g, 'function ');
	const css = [];
	context.document = { createElement: () => ({}), head: { appendChild(node) { css.push(node); } } };
	const hooks = vm.runInNewContext(styles + '; ({ applyCardBorder, updateCardStyles })', context);
	const card = { style: {}, classList: { contains: () => true } };
	hooks.applyCardBorder(card, {}, true); hooks.applyCardBorder(card, { dataset: { borderLevel: 'five' } });
	assert.deepEqual(card.style, {});
	hooks.updateCardStyles();
	assert.equal(css.length, 2); assert.ok(css.every(style => style.innerHTML === ''));
});

test('HH hand and discard layout applies the source geometry to real card nodes', () => {
	const { Element } = domFixture();
	for (const bodyHeight of [375, 750, 1256]) for (const count of [1, 4, 18]) {
		const hand = new Element(), arena = new Element(), container = new Element();
		const cards = Array.from({ length: count }, () => {
			const card = new Element(); card.updateTransform = () => {}; hand.appendChild(card); return card;
		});
		const thrown = Array.from({ length: count }, () => { const card = new Element(); arena.appendChild(card); return card; });
		const cs = bodyHeight * originalHandScale / 174;
		const context = { lib: { config: { extension_HH优化_cardScale: .9, extension_HH优化_discardScale: .8 } }, game: { me: {} }, ui: { handcards1: hand, handcards1Container: container, arena, thrown }, originalHandRow, originalCentralRow, originalDiscardScale,
			decadeUI: { get: { bodySize: () => ({ height: bodyHeight }) }, boundsCaches: { hand: { check() {}, width: 600, cardWidth: 126, cardHeight: 174, cardScale: cs }, arena: { check() {}, width: 1000, height: bodyHeight, cardWidth: 126, cardHeight: 174 } } } };
		const source = read('../src/core/layout.js').replace(/^import .*;\r?$/gm, '').replace('export function createLayoutModule', 'function createLayoutModule');
		const layout = vm.runInNewContext(source + '; createLayoutModule()', context);
		layout.updateHand(); layout.updateDiscard();
		const row = originalHandRow(count, 600, 126 * cs);
		cards.forEach((card, i) => assert.equal(card.tx, Math.round((126 * cs - 126) / 2 + row.step * i)));
		assert.equal(container.style.overflowX, '');
		const discardCS = cs * .87;
		const central = originalCentralRow(count, 700, 126 * discardCS, cs);
		thrown.forEach((card, i) => {
			assert.equal(card.tx, Math.round(150 + central.start + (126 * discardCS - 126) / 2 + central.step * i));
			assert.ok(card.style.transform.endsWith(`scale(${discardCS})`) || Math.abs(Number(card.style.transform.match(/scale\(([^)]+)\)/)[1]) - discardCS) < 1e-12);
		});
	}
});
