import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { sourceEquipmentLayout, nativeEquipmentLayout } from '../src/ui/sourceEquipmentLayout.js';
import { refreshPlayerEquipment, observePlayerEquipment } from '../src/ui/equipment.js';
import { equipmentArrivalPose } from '../src/ui/sourceEquipmentMotion.js';

const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/source-equipment-layout.json', import.meta.url)));
const origin = JSON.parse(fs.readFileSync(new URL('../assets/equipment/layout-source.json', import.meta.url)));
const types = ['equip1', 'equip2', 'equip3', 'equip4', 'equip5'];
const PIt = Object.fromEntries(['WEAPON', 'ARMOR', 'HORSE_DEF', 'HORSE_ATT', 'TREASURE', 'WEAPON_EX'].map((name, i) => ['ZONE_EQUIP_' + name, i + 1]));
const xIt = { DEF_HORSE: 5, ATT_HORSE: 6, TREASURE: 7 };
const nH = { ...Object.fromEntries(Object.entries(PIt).map(([key, value]) => [key, 1 << value])), ZONE_EQUIP: 62 };
const context = vm.createContext({ PIt, xIt, nH, Vwt: { IsPveRoguelike: false }, ZP: { M_EQUIP_SIZE: { width: 146, height: 30 } },
    Laya: { Tween: { clearAll() {} }, Point: class { constructor(x, y) { this.x = x; this.y = y; } } }, zIt: { EQUIP: 1 },
    Fwt: { GetRes: value => value }, gt: { F: (...args) => args.join('_') }, EH: { GetFlowerResName: () => 'spade', GetNumberResName: () => '8' },
    Gwt: { Abolished: '废除', M_JIAYIMA: '+1', M_JIANYIMA: '−1' }, St: { I: () => ({ event(name, args) { context.endpoint = args[1]; } }) }, yD: { SHOW_A_CARD_MOTION: 'show' } });
const native = Object.fromEntries(Object.entries(fixture.methods).map(([name, code]) => [name, vm.runInContext(`({${code}})[${JSON.stringify(name.split('.').at(-1))}]`, context)]));

function nativeSeat(states) {
    const seat = { equipCards: [], abolishData: 0, zoneAvailableData: 126, IsAvailableWeaponEx: false };
    seat.HasZone = native['lrs.HasZone']; seat.HasEquipByType = native['lrs.HasEquipByType'];
    states.forEach((state, index) => {
        if (state === 2) seat.abolishData |= 1 << (index + 1);
        if (state === 3) seat.zoneAvailableData &= ~(1 << (index + 1));
        if (state === 1) seat.equipCards.push({ CardId: index + 1, CardBaseType: 1, CardZoneType: index + 1, FirstSkill: { Type: index + 3, MName: types[index] }, Seat: seat });
    });
    return seat;
}
const descriptors = states => states.flatMap((state, i) => state ? [{ subtype: types[i], status: ['empty', 'card', 'disabled', 'skill'][state] }] : []);
const view = item => ({ row: item.row, left: item.left, width: item.width });

test('source snapshot and layout constants match the original client methods', () => {
    assert.equal(fixture.sha256, origin.sha256);
    for (const [name, code] of Object.entries(fixture.methods)) assert.equal(createHash('sha256').update(code).digest('hex'), origin.functions[name], name);
    assert.deepEqual(nativeEquipmentLayout, { width: 146, rowHeight: 30, rows: 4 });
});

test('all 1024 equipment/abolished/unavailable combinations match native actual-card rows and half widths', () => {
    for (let mask = 0; mask < 1024; mask++) {
        const states = types.map((_, i) => (mask >> (i * 2)) & 3), seat = nativeSeat(states);
        const plan = sourceEquipmentLayout(descriptors(states), Object.fromEntries(types.map((type, i) => [type, seat.HasZone(i + 1)])));
        const uis = seat.equipCards.map(card => ({ Card: card, theCard: card, x: 1, visible: true, height: 30,
            bmpRange: {}, bmpFlower: {}, bmpNumber: {}, bmpFace: { size() {} }, typeTex: {}, nameLabel: {},
            updateRange() {}, resetTagResWid() {}, IsZuoBangYouBi: () => false, TransformInitState() {}, layout() {},
            UpdateCardFace() { native['fns.UpdateCardFace'].call(this); } }));
        native['AMt.LayoutEquipCards'].call({ seat, equipCardUIs: uis, equipStartX: () => 0, equipStartY: () => 0 });
        for (const ui of uis) {
            const actual = plan.find(item => item.subtype === types[ui.Card.CardId - 1]);
            assert.deepEqual(view(actual), { row: (ui.EndY - 110) / 30, left: (ui.EndX - 27) / 146, width: ui.width / 146 }, states.join(',') + ':' + actual.subtype);
            assert.equal(actual.halfHorse, !!ui.isHalf);
        }
        assert.ok(plan.every(item => item.row >= 0 && item.row < 4));
    }
});

test('all 243 ordinary/abolished combinations match native abolished-slot rows and widths', () => {
    for (let mask = 0; mask < 243; mask++) {
        const states = types.map((_, i) => Math.floor(mask / 3 ** i) % 3), seat = nativeSeat(states), rendered = [];
        const plan = sourceEquipmentLayout(descriptors(states));
        native['xUt.updateUI'].call({ seat, abolishVal: seat.abolishData, hasEquipedTreasure: states[4] === 1,
            startX: 27, halfBgWidth: 73, typeList: types, RemoveDrawChildren() {}, getPosY: row => 110 + row * 30,
            createItem(half, subtype, text, left, top) { rendered.push({ subtype, row: (top - 110) / 30, left: (left - 27) / 146, width: half ? .5 : 1 }); } });
        for (const item of rendered) assert.deepEqual(view(plan.find(entry => entry.subtype === item.subtype)), view(item), states.join(',') + ':' + item.subtype);
    }
});

test('empty defense allows a lone attack horse to fill row three; occupied treasure merges both horses only when needed', () => {
    const attack = { subtype: 'equip4', status: 'card' }, defense = { subtype: 'equip3', status: 'card' }, treasure = { subtype: 'equip5', status: 'skill' };
    assert.deepEqual(view(sourceEquipmentLayout([attack])[0]), { row: 2, left: 0, width: 1 });
    assert.deepEqual(view(sourceEquipmentLayout([attack, treasure])[0]), { row: 2, left: 0, width: 1 });
    assert.deepEqual(sourceEquipmentLayout([defense, attack]).map(view), [{ row: 2, left: 0, width: 1 }, { row: 3, left: 0, width: 1 }]);
    assert.deepEqual(sourceEquipmentLayout([defense, attack, treasure]).map(view), [{ row: 2, left: 0, width: .5 }, { row: 2, left: .5, width: .5 }, { row: 3, left: 0, width: 1 }]);
});

test('expanded and combined horse equipment retain real entries inside four rows', () => {
    const entries = [{ subtype: 'equip1' }, { subtype: 'equip1' }, { subtype: 'equip5' }, { subtype: 'equip6' }];
    const plan = sourceEquipmentLayout(entries); assert.equal(plan.length, 4); assert.ok(plan.every(item => item.row < 4 && item.width > 0));
    assert.deepEqual(plan.map(view), [{ row: 0, left: 0, width: .5 }, { row: 0, left: .5, width: .5 }, { row: 3, left: 0, width: .5 }, { row: 3, left: .5, width: .5 }]);
    const horse = sourceEquipmentLayout([{ subtype: 'equip3', subtypes: ['equip3', 'equip4'] }, { subtype: 'equip5' }]);
    assert.deepEqual(view(horse[0]), { row: 2, left: 0, width: 1 });
    assert.deepEqual(view(sourceEquipmentLayout([{ subtype: 'equip3' }, { subtype: 'equip5' }], { mountCombined: true, equip4: false })[0]), { row: 2, left: 0, width: 1 });
});

function domFixture() {
    let writes = 0;
    function node(classes = []) {
        const tokens = new Set(classes), values = new Map();
        return { nodeType: 1, children: [], dataset: {}, _text: '', ownerDocument: { createElement: () => node() },
            get childNodes() { return this.children; }, get textContent() { return this.children.length ? this.children.map(c => c.textContent).join('') : this._text; },
            set textContent(value) { this._text = value; this.children = []; },
            style: { setProperty(k, v) { writes++; values.set(k, v); }, getPropertyValue: k => values.get(k) || '' },
            classList: { contains: name => tokens.has(name), add(...names) { names.forEach(name => tokens.add(name)); }, remove(name) { tokens.delete(name); } },
            replaceChildren(...children) { writes++; this.children = children; }, closest() { return this.node ? this : this.parentNode; } };
    }
    const equips = node(), player = { node: { equips }, disabledSlots: {}, hasEnabledSlot(type) { return !this.disabledSlots[type]; } };
    const get = { subtype: card => card.dataset.cardSubtype, info: () => ({}), translation: value => value };
    function card(subtype, name = subtype, classes = [], text = '') {
        const card = node(['card', ...classes]); Object.assign(card, { name, suit: 'club', number: 2, dataset: { cardSubtype: subtype }, node: { name2: node() } });
        card.node.name2.parentNode = card; card.node.name2.textContent = text; return card;
    }
    const put = card => { equips.children.push(card); card.parentNode = equips; return card; };
    return { equips, player, get, card, put, get writes() { return writes; } };
}

test('native placeholder insertion, skill text, abolition/restoration and removal reflow the same selectable nodes without loops', () => {
    const h = domFixture(), defense = h.put(h.card('equip3')), attack = h.put(h.card('equip4')), empty = h.put(h.card('equip5', 'empty_equip5', ['hidden', 'emptyequip']));
    let observer; class Observer { constructor(callback) { this.callback = callback; observer = this; } observe() {} }
    observePlayerEquipment(h.player, h.get, Observer); const originalOrder = [...h.equips.children];
    assert.equal(defense.dataset.hhEquipLayout, 'full'); assert.equal(attack.style.getPropertyValue('--hh-equip-row'), '3'); assert.equal(empty.dataset.hhEquipLayout, 'empty');
    const treasure = h.put(h.card('equip5', 'empty_equip5', ['emptyequip'], '观骨 木牛流马')); treasure.extraEquip = ['guangu', 'muniu'];
    observer.callback([{ target: h.equips }]); assert.equal(defense.dataset.hhEquipLayout, 'horse'); assert.equal(attack.style.getPropertyValue('--hh-equip-left'), '50%');
    assert.equal(treasure.node.name2.children[1].textContent, '观骨 木牛流马');
    const writes = h.writes; observer.callback([{ target: h.equips }]); assert.equal(h.writes, writes, 'own mutations must converge');
    treasure.node.name2.textContent = '新技能 宝物'; observer.callback([{ target: treasure.node.name2 }]); assert.equal(treasure.node.name2.children[1].textContent, '新技能 宝物');
    h.equips.children.pop(); const disabled = h.put(h.card('equip5', 'feichu_equip5', ['feichu'], '宝物栏 已废除'));
    observer.callback([{ target: h.equips }]); assert.equal(disabled.node.name2.children[1].textContent, '废除'); assert.equal(attack.dataset.hhEquipLayout, 'horse');
    h.equips.children.pop(); observer.callback([{ target: h.equips }]); assert.equal(attack.dataset.hhEquipLayout, 'full'); assert.equal(attack.style.getPropertyValue('--hh-equip-row'), '3');
    assert.deepEqual(h.equips.children, originalOrder); assert.equal(defense.node.name2.children[3].className, 'equip-name');
});

test('half horse popup shrink uses native hidden-strip endpoint rather than the final right-hand slot', () => {
    for (const [width, left] of [[146, 27], [73, 27], [73, 100]]) {
        native['AMt.startEquipCardMotion'].call({ seatTopSprite: { localToGlobal: p => p }, setAEquipCardActive() {} }, { Card: {}, x: -146, y: 170, width, height: 30 });
        const pose = equipmentArrivalPose({ left, top: 170, width, height: 30, layoutLeft: 27, layoutWidth: 146 }, 174, .1);
        assert.equal(pose.x, context.endpoint.x); assert.equal(pose.y + 174 * .1 / 2, context.endpoint.y);
    }
});
