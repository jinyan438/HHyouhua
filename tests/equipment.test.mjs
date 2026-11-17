import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { refreshEquipmentDisplay, refreshPlayerEquipment, observePlayerEquipment } from '../src/ui/equipment.js';

function fixture(options = {}) {
	function node() {
		return {
			children: [], style: { setProperty(key, value) { this[key] = value; } },
			classList: { add() {} }, ownerDocument: { createElement: node },
			replaceChildren(...children) { this.children = children; },
		};
	}
	const card = { name: 'zhuge', suit: 'diamond', number: 1, dataset: {}, node: { name2: node() }, classList: { contains: value => value === 'fakeequip' && options.fake }, ...options.card };
	const get = { subtype: () => options.subtype || 'equip1', info: () => options.info || {},
		translation: name => ({ zhuge: '诸葛连弩', bagua: '八卦阵', diamond: '♦', club: '♣', spade: '♠', heart: '♥' })[name] || name };
	return { card, get, parts: () => Object.fromEntries(card.node.name2.children.map(child => [child.className, child])) };
}

test('Vite-normalized directory URL keeps the separator before icon, suit and rank filenames', async () => {
	const source = readFileSync(new URL('../src/ui/equipment.js', import.meta.url), 'utf8');
	// This is the directory URL emitted by the real Vite development server.
	const servedRoot = 'http://127.0.0.1:8080/extension/HH%E4%BC%98%E5%8C%96/assets/equipment';
	const transformed = source.replace('new URL("../../assets/equipment/", import.meta.url)', `new URL(${JSON.stringify(servedRoot)})`);
	const { refreshEquipmentDisplay: refresh } = await import('data:text/javascript,' + encodeURIComponent(transformed));
	const f = fixture();
	refresh(f.card, f.get);
	for (const part of ['equip-icon', 'equip-suit', 'equip-number']) {
		assert.ok(f.parts()[part].style.backgroundImage.startsWith(`url("${servedRoot}/`), f.parts()[part].style.backgroundImage);
	}
});

test('native equipment types, all suit/rank sprites, range and regular text', () => {
	for (const [subtype, type] of Object.entries({ equip1: 3, equip2: 4, equip3: 5, equip4: 6, equip5: 7 })) {
		for (const suit of ['spade', 'heart', 'club', 'diamond']) for (let number = 1; number <= 13; number++) {
			const f = fixture({ subtype, card: { suit, number } });
			refreshEquipmentDisplay(f.card, f.get);
			const p = f.parts();
			assert.match(p['equip-icon'].style.backgroundImage, new RegExp(`new_equip_type_${type}_new`));
			assert.match(p['equip-suit'].style.backgroundImage, new RegExp(`other_equip_${suit}_new`));
			assert.match(p['equip-number'].style.backgroundImage, new RegExp(`other_equip_${['heart', 'diamond'].includes(suit) ? 'red' : 'black'}_`));
			assert.equal(p['equip-name'].textContent, '诸葛弩');
			assert.equal(p['equip-range'].textContent, subtype === 'equip1' ? '1' : '');
		}
	}
});

test('weapon and mount distances use the native card definition', () => {
	for (const [subtype, distance, expected] of [['equip1', { attackFrom: -3 }, '4'], ['equip3', { globalTo: 2 }, '+2'], ['equip4', { globalFrom: -1 }, '-1']]) {
		const f = fixture({ subtype, info: { distance } });
		refreshEquipmentDisplay(f.card, f.get);
		assert.equal(f.parts()['equip-range'].textContent, expected);
	}
});

test('view-as equipment stays bracketed; absent suit/rank produces no false glyph', () => {
	const f = fixture({ fake: true, card: { viewAs: 'bagua', suit: 'none', number: 0 } });
	refreshEquipmentDisplay(f.card, f.get);
	assert.equal(f.parts()['equip-name'].textContent, '[八卦]');
	for (const name of ['equip-suit', 'equip-number']) {
		assert.equal(f.parts()[name].textContent, '');
		assert.equal(f.parts()[name].style.backgroundImage, undefined);
	}
});

test('refresh after native replacement is idempotent and preserves disabled/granted-skill text', () => {
	const f = fixture();
	const disabled = fixture({ card: { name: 'feichu_equip1' } }).card;
	const granted = fixture({ card: { name: 'empty_equip1' } }).card;
	disabled.node.name2.textContent = '武器栏 已废除';
	granted.node.name2.textContent = '青龙偃月刀 武圣';
	const player = { node: { equips: { childNodes: [f.card, disabled, granted] } } };
	refreshPlayerEquipment(player, f.get);
	f.card.node.name2.children = [];
	refreshPlayerEquipment(player, f.get);
	refreshPlayerEquipment(player, f.get);
	assert.equal(f.card.node.name2.children.length, 5);
	assert.equal(disabled.node.name2.textContent, '武器栏 已废除');
	assert.equal(granted.node.name2.textContent, '青龙偃月刀 武圣');
});

test('equipment-zone observer repairs late native label replacement and leaves its own rendering intact', () => {
	const f = fixture();
	const equips = { childNodes: [f.card] };
	const player = { node: { equips } };
	f.card.parentNode = equips;
	f.card.closest = () => f.card;
	const label = f.card.node.name2;
	label.nodeType = 1;
	label.closest = () => f.card;
	const created = [];
	class Observer {
		constructor(callback) { this.callback = callback; created.push(this); }
		observe(target, options) { this.target = target; this.options = options; }
	}
	const observer = observePlayerEquipment(player, f.get, Observer);
	assert.equal(observer.options.subtree, true);
	assert.equal(observer.options.characterData, true);
	const originalParts = [...label.children];
	observer.callback([{ target: label }]);
	assert.deepEqual(label.children, originalParts, 'our own mutations must not recreate nodes');
	label.children = [];
	observer.callback([{ target: label }]);
	assert.equal(label.children.length, 5, 'native innerHTML replacement is repaired');
	label.children[3].textContent = '旧装备名';
	observer.callback([{ target: { nodeType: 3, parentElement: label } }]);
	assert.equal(label.children[3].textContent, '诸葛弩');
	label.children = [];
	observer.callback([{ target: equips }]);
	assert.equal(label.children.length, 5, 'cards inserted by broadcast/reconnect are repaired');
	assert.equal(observePlayerEquipment(player, f.get, Observer), observer);
	assert.equal(created.length, 1);
});
