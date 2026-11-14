// 从仓库根目录运行：node --test apps/core/extension/HH优化/tests/ai-think-delay.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const extension = readFileSync(new URL('../hh-features.js', import.meta.url), 'utf8');
const thinkCode = extension.slice(extension.indexOf('const HH_parseNumberConfig'), extension.indexOf('HH_hookAIThinkDelay();') + 'HH_hookAIThinkDelay();'.length);
const coreSource = readFileSync(new URL('../../../noname/library/element/content.ts', import.meta.url), 'utf8');
const coreCode = ts.transpileModule(coreSource.slice(coreSource.indexOf('export const Content')).replace('export const Content', 'const Content') + '\nglobalThis.coreContent = Content;', {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

function setup({ config = {}, random = 0.5, content } = {}) {
    const waits = [], popups = [], actions = [];
    const lib = { config: { extension_HH优化_enable_ai_think_delay: true, ...config }, skill: { global: [] }, element: {},
        filter: { all: () => true, cardDiscardable: () => true } };
    const status = {};
    const hand = [{ name: 'sha' }, { name: 'shan' }, { name: 'tao' }];
    const player = {
        hp: 3, getCards: () => hand.slice(), countCards: () => hand.length, getEquips: () => [],
        isMine: () => false, isOnline: () => false, isUnderControl: () => false,
        getSkills: () => [], popup: value => popups.push(value),
        useResult: result => { actions.push({ result, waits: [...waits] }); return {}; },
    };
    const game = { players: [player, { hp: 3 }], check: () => true, expandSkills() {}, resume() {}, stopCountChoose() {},
        addVideo() {}, broadcast() {}, broadcastAll() {}, log() {}, delay() {}, createButtonCardsetion() {} };
    const ui = { click: { ok() { status.event.result = status.event.selectedResult; }, cancel() { status.event.result = { bool: false }; } },
        arena: { classList: { remove() {} } }, create: {}, dialogs: [] };
    const get = {
        name: card => card.name,
        info: card => typeof card == 'string' ? lib.skill[card] : card.name == 'bagua' ? { type: 'equip', subtype: 'equip2' } : {},
        select: value => Array.isArray(value) ? value : [value || 1, value || 1],
        translation: value => value.name || '角色', suit: card => card.suit || 'heart',
        idDialog: id => ui.dialogs.find(dialog => dialog.videoId == id),
    };
    const math = Object.create(Math);
    math.random = () => random;
    const context = vm.createContext({ lib, game, ui, get, ai: { basic: { chooseCard: () => true, chooseButton: () => true } }, _status: status, Math: math, Date,
        delay: () => Promise.resolve(),
        setTimeout(callback, ms) { waits.push(ms); callback(); },
    });
    vm.runInContext(`
        Array.prototype.add = function(value) { if (!this.includes(value)) this.push(value); return this; };
        Array.prototype.remove = function(value) { const i = this.indexOf(value); if (i >= 0) this.splice(i, 1); return this; };
    `, context);
    ui.create.dialog = () => ({
        buttons: vm.runInContext('[]', context), style: {}, content: { firstChild: {} }, open() {}, close() {},
        add(value) { if (Array.isArray(value)) this.buttons.push(...value.map(link => ({ link }))); return { style: {} }; },
    });
    vm.runInContext(coreCode, context);
    lib.element.content = content || context.coreContent;
    vm.runInContext(thinkCode + '\nglobalThis.think = { delay: HH_aiThinkDelay, calc: HH_calcAIThinkDelay, pace: HH_getAIThinkPace, hook: HH_hookAIThinkDelay };', context);
    function event(name = 'chooseToUse', options = {}) {
        const evt = { name, player, type: name == 'chooseToUse' ? 'phase' : undefined,
            isMine: () => false, isOnline: () => false, resume() {}, async trigger() {}, ...options };
        evt.getParent = name => {
            if (!name) return evt.parent || null;
            let parent = evt.parent;
            while (parent && parent.name != name) parent = parent.parent;
            return parent || null;
        };
        return evt;
    }
    function use(name, options = {}) {
        const card = { name };
        return event('chooseToUse', { result: { bool: true, card, cards: [card], targets: [player] }, ...options });
    }
    // 保留引擎的待提交步骤语义，覆盖原内容中的 goto/redo 及返回值传递。
    async function run(evt) {
        status.event = evt;
        const steps = lib.element.content[evt.name];
        if (!Array.isArray(steps)) return steps.call(evt, evt, undefined, evt.player);
        let step = 0, pending = null;
        Object.defineProperty(evt, 'step', { configurable: true, get: () => step, set: value => { pending = value; } });
        evt.goto = value => { pending = value; };
        evt.redo = () => { pending = step; };
        evt.finish = () => { evt.finished = true; };
        for (let guard = 0; !evt.finished && step < steps.length; guard++) {
            assert.ok(guard < 30, '事件不应陷入重复选择死循环');
            pending = step + 1;
            const result = await steps[step].call(evt, evt, undefined, evt.player, evt._result);
            if (result !== undefined) evt._result = result;
            step = pending;
        }
    }
    function choice(name, selectedResult, options = {}) {
        const evt = event(name, { position: 'h', prompt: false, autochoose: () => false,
            filterCard: () => true, selectCard: 1, selectButton: 1, selectedResult, ...options });
        evt.set = (key, value) => { evt[key] = value; return evt; };
        evt.forResult = async () => { await run(evt); return evt.result; };
        return evt;
    }
    function loadCardPack(name) {
        const source = readFileSync(new URL(`../../../card/${name}.js`, import.meta.url), 'utf8');
        vm.runInContext(source.slice(source.indexOf('export default')).replace('export default', 'globalThis.testCardPack ='), context);
        return context.testCardPack.card;
    }
    return { lib, game, ui, get, status, player, hand, waits, popups, actions, event, use, run, choice, loadCardPack, think: context.think };
}

test('实际 chooseToUse：无中生有保留点击时间，不受10秒思考下限影响，并保持出牌结果', async () => {
    const h = setup({ config: { extension_HH优化_ai_think_delay_min: 10000 } });
    const evt = h.use('wuzhong');
    evt.selectedResult = evt.result;
    delete evt.result;
    await h.run(evt);
    assert.equal(h.actions.length, 1);
    assert.equal(h.actions[0].result, evt.selectedResult);
    assert.equal(h.actions[0].waits.length, 1);
    assert.equal(h.waits.length, 1);
    assert.ok(h.waits[0] > 0 && h.waits[0] < 600);
    assert.deepEqual(h.popups, []);
});

test('实际 chooseToUse：普通杀在使用前只思考一次，持有无中不代表本次使用无中', async () => {
    const h = setup();
    h.hand.push({ name: 'wuzhong' });
    const evt = h.use('sha');
    evt.selectedResult = evt.result;
    delete evt.result;
    await h.run(evt);
    assert.equal(h.actions.length, 1);
    assert.equal(h.actions[0].waits.length, 1);
    assert.equal(h.waits.length, 1);
    assert.ok(h.waits[0] >= 250 && h.waits[0] <= 2600);
});

test('实际 chooseToUse：取消后回到原第0步重新选择，只执行最终结果', async () => {
    const h = setup();
    const evt = h.use('sha');
    const selected = evt.result;
    delete evt.result;
    let attempts = 0;
    h.ui.click.ok = () => { evt.result = ++attempts == 1 ? { ...selected, cancel: true } : selected; };
    await h.run(evt);
    assert.equal(attempts, 2);
    assert.equal(h.actions.length, 1);
    assert.equal(h.actions[0].result, selected);
    assert.equal(h.waits.length, 1);
});

test('实际 chooseToRespond：出闪前快速响应一次，保留响应牌和返回事件', async () => {
    const h = setup();
    const evt = h.use('shan', { name: 'chooseToRespond', type: undefined, parent: {} });
    evt.selectedResult = evt.result;
    delete evt.result;
    let response;
    h.player.respond = (cards, card) => {
        assert.equal(h.waits.length, 1);
        assert.ok(h.waits[0] < 600);
        response = { cards, card };
        return { set() {} };
    };
    await h.run(evt);
    assert.equal(response.card, evt.selectedResult.card);
    assert.equal(response.cards, evt.selectedResult.cards);
    assert.equal(h.waits.length, 1);
    assert.equal(h.popups.length, 0);
});

test('自己吃桃、濒死自救酒、装备空栏保留点击；救别人、出酒增伤和换装备需要思考', async () => {
    const h = setup();
    for (const evt of [h.use('tao'), h.use('jiu', { dying: h.player, type: 'dying' }), h.use('bagua')]) {
        await h.think.delay(evt);
    }
    assert.equal(h.waits.length, 3);
    assert.ok(h.waits.every(ms => ms > 0 && ms < 600));
    const dying = { hp: 0 };
    const rescue = h.use('tao', { type: 'dying', dying });
    rescue.result.targets = [dying];
    await h.think.delay(rescue);
    await h.think.delay(h.use('jiu'));
    h.player.getEquips = () => [{ name: 'renwang' }];
    await h.think.delay(h.use('bagua'));
    assert.equal(h.waits.length, 6);
    assert.ok(h.waits.slice(3).every(ms => ms >= 600));
});

test('普通出闪/响应杀快速执行，残血及持有桃无懈不引发长考或提示', async () => {
    const h = setup({ config: { extension_HH优化_ai_think_delay_min: 10000 } });
    h.player.hp = 1;
    h.hand.push({ name: 'wuxie' });
    for (const name of ['shan', 'sha']) {
        const evt = h.use(name, { name: 'chooseToRespond', type: undefined, prompt: '请响应伤害，当前体力为1' });
        await h.think.delay(evt);
    }
    assert.equal(h.waits.length, 2);
    assert.ok(h.waits.every(ms => ms > 0 && ms < 600));
    assert.deepEqual(h.popups, []);
});

test('无普通响应不等待；简单代选和结束出牌阶段仍有点击时间', async () => {
    const h = setup();
    await h.think.delay(h.event('chooseToRespond', { result: { bool: false } }));
    await h.think.delay(h.event('chooseToUse', { type: undefined, result: { bool: false } }));
    await h.think.delay(h.event('chooseToUse', { type: 'wuxie', result: { bool: false } }));
    assert.equal(h.waits.length, 0);
    await h.think.delay(h.event('chooseToDiscard', { result: { bool: true, autochoose: true } }));
    await h.think.delay(h.event('chooseToUse', { result: { bool: false } }));
    assert.equal(h.waits.length, 2);
    assert.ok(h.waits.every(ms => ms > 0 && ms < 600));
});

test('强制弃光和唯一控制项模拟点击，多选项及多牌取舍正常等待', async () => {
    const h = setup();
    await h.think.delay(h.event('chooseToDiscard', { forced: true, selectCard: 3, result: { bool: true, cards: h.hand } }));
    await h.think.delay(h.event('chooseControl', { controls: ['ok'], result: { control: 'ok' } }));
    assert.equal(h.waits.length, 2);
    assert.ok(h.waits.every(ms => ms > 0 && ms < 600));
    await h.think.delay(h.event('chooseControl', { controls: ['draw', 'recover'], result: { control: 'draw' } }));
    await h.think.delay(h.event('chooseToDiscard', { forced: true, selectCard: 1, result: { bool: true, cards: [h.hand[0]] } }));
    assert.equal(h.waits.length, 4);
    assert.ok(h.waits.slice(2).every(ms => ms >= 600));
});

test('实际 chooseControl 和单体 chooseBool 返回结果后应用节奏', async () => {
    const h = setup();
    await h.run(h.event('chooseControl', { controls: ['draw', 'recover'], choice: 0 }));
    await h.run(h.event('chooseBool', { choice: true, frequentSkill: 'yingzi' }));
    assert.equal(h.waits.length, 2);
    assert.ok(h.waits[1] > 0 && h.waits[1] < 600);
    await h.run(h.event('chooseBool', { choice: true }));
    assert.equal(h.waits.length, 3);
});

test('技能消耗牌不作为使用牌，虚拟牌按最终牌名判断', () => {
    const h = setup();
    const evt = h.event('chooseToUse', { result: { bool: true, skill: 'active', cards: [{ name: 'wuzhong' }] } });
    assert.ok(h.think.calc(h.player, evt) > 0);
    evt.result.card = { name: 'wuzhong' };
    const delay = h.think.calc(h.player, evt);
    assert.ok(delay > 0 && delay < 600);
});

test('技能中的独立选择分别等待，出牌包装不重复等待，结算中新响应独立思考', async () => {
    const h = setup();
    const parent = h.use('sha');
    const child = h.event('chooseControl', { parent, controls: ['sha', 'juedou'], result: { control: 'sha' } });
    await h.think.delay(child);
    await h.think.delay(h.event('chooseCard', { parent, result: { bool: true, cards: [h.hand[0]] } }));
    await h.think.delay(parent);
    assert.equal(h.waits.length, 2);
    const resolution = h.event('useCard', { parent });
    await h.think.delay(h.use('wuxie', { type: 'wuxie', parent: resolution }));
    assert.equal(h.waits.length, 3);
});

test('技能尚待选按钮或取消重选时不提前等待', async () => {
    const h = setup();
    h.lib.skill.transform = { chooseButton: {} };
    const evt = h.event('chooseToUse', { result: { bool: true, skill: 'transform' } });
    await h.think.delay(evt);
    assert.equal(h.waits.length, 0);
    evt.result = { bool: true, card: { name: 'sha' }, cancel: true };
    await h.think.delay(evt);
    assert.equal(h.waits.length, 0);
    delete evt.result.cancel;
    await h.think.delay(evt);
    assert.equal(h.waits.length, 1);
});

test('包装保留 goto/redo、this、第四参数和原返回值，不插入额外步骤', async () => {
    const visits = [];
    const original = [
        async function(evt) { assert.equal(this, evt); visits.push(0); evt.result = 'ai'; return { selection: 7 }; },
        async function(evt, trigger, player, result) {
            assert.equal(result.selection, 7);
            visits.push(1);
            if (!evt.retried) { evt.retried = 1; evt.goto(0); return; }
            if (evt.retried == 1) { evt.retried++; evt.redo(); return; }
            evt.result = { bool: true, card: { name: 'wuzhong' } };
        },
        async function() { visits.push(2); return 'unchanged'; },
    ];
    const h = setup({ content: { chooseToUse: original } });
    assert.equal(h.lib.element.content.chooseToUse.length, original.length);
    const evt = h.event();
    await h.run(evt);
    assert.deepEqual(visits, [0, 1, 0, 1, 1, 2]);
    assert.equal(evt._result, 'unchanged');
    assert.equal(h.waits.length, 1);
    assert.ok(h.waits[0] > 0 && h.waits[0] < 600);
    const wrapped = h.lib.element.content.chooseToUse;
    h.think.hook();
    assert.equal(h.lib.element.content.chooseToUse, wrapped);
});

test('关闭功能、联机、真人和手动控制角色不等待', async () => {
    for (const mode of ['disabled', 'connect', 'online', 'mine', 'controlled']) {
        const h = setup();
        if (mode == 'disabled') h.lib.config.extension_HH优化_enable_ai_think_delay = false;
        if (mode == 'connect') h.status.connectMode = true;
        if (mode == 'online') h.game.online = true;
        if (mode == 'mine') h.player.isMine = () => true;
        if (mode == 'controlled') h.player.isUnderControl = () => true;
        await h.think.delay(h.use('sha'));
        assert.equal(h.waits.length, 0, mode);
    }
});

test('普通操作遵守上限，随机长考仅用于关键取舍，0配置完全取消等待', () => {
    for (const random of [0, 0.01, 0.5, 0.999999]) {
        const h = setup({ random, config: { extension_HH优化_ai_think_delay_min: 0, extension_HH优化_ai_think_delay_max: 800 } });
        for (let i = 0; i < 20; i++) {
            assert.ok(h.think.calc(h.player, h.use('sha')) <= 800);
            assert.ok(h.think.calc(h.player, h.use('wuxie', { type: 'wuxie' })) <= 2300);
            const quick = h.think.calc(h.player, h.use('wuzhong'));
            assert.ok(quick > 0 && quick < 600);
        }
    }
    const h = setup({ config: { extension_HH优化_ai_think_delay_min: 0, extension_HH优化_ai_think_delay_max: 0 } });
    assert.equal(h.think.calc(h.player, h.use('sha')), 0);
    assert.equal(h.think.calc(h.player, h.use('wuxie')), 0);
    assert.equal(h.think.calc(h.player, h.use('wuzhong')), 0);
});

test('阶段令牌每阶段重置连招，自己回合中的无懈不算主动出牌', () => {
    const h = setup();
    h.status.currentPhase = h.player;
    const phase = h.event('phaseUse');
    h.think.calc(h.player, h.use('wuzhong', { parent: phase }));
    assert.equal(h.player._HH_aiThinkProfile.phaseThinkCount, 0);
    const first = h.think.calc(h.player, h.use('sha', { parent: phase }));
    const second = h.think.calc(h.player, h.use('sha', { parent: phase }));
    assert.ok(second < first);
    h.think.calc(h.player, h.use('wuxie', { parent: phase, type: 'wuxie' }));
    assert.equal(h.player._HH_aiThinkProfile.phaseThinkCount, 2);
    h.think.calc(h.player, h.use('sha', { parent: h.event('phaseUse') }));
    assert.equal(h.player._HH_aiThinkProfile.phaseThinkCount, 1);
    assert.equal(h.player._HH_aiThinkProfile.comboCount, 0);
});

test('不额外执行自动选择、过滤或AI决策回调，弃牌不按所弃锦囊归为关键出牌', async () => {
    const h = setup();
    const forbidden = () => { throw new Error('不应重新运行决策回调'); };
    const evt = h.event('chooseToDiscard', { forced: true, selectCard: 1, autochoose: forbidden, filterCard: forbidden, ai: forbidden,
        result: { bool: true, cards: [{ name: 'juedou' }] } });
    assert.equal(h.think.pace(h.player, evt), 'normal');
    await h.think.delay(evt);
    assert.equal(h.waits.length, 1);
});

test('系统结算事件不接入延迟，已经指定结果的拆牌直接结算', async () => {
    const system = async function() { return 'resolved'; };
    const content = Object.fromEntries(['useCard', 'draw', 'gain', 'discard', 'damage', 'recover', 'showCards'].map(name => [name, system]));
    const h = setup({ content });
    for (const name of Object.keys(content)) {
        if (name.startsWith('_')) continue;
        assert.equal(h.lib.element.content[name], system);
        await h.think.delay(h.event(name, { result: { bool: true } }));
    }
    await h.think.delay(h.event('discardPlayerCard', { directresult: h.hand, result: { bool: true, cards: h.hand } }));
    assert.equal(h.waits.length, 0);
});

test('实际火攻：展示和弃同花色牌各思考一次，展示及伤害结算不额外思考', async () => {
    const h = setup();
    const huogong = h.loadCardPack('extra').huogong;
    const target = { ...h.player, hasCards: () => true };
    const parent = h.use('huogong');
    await h.think.delay(parent);
    const useCard = h.event('useCard', { parent, card: { name: 'huogong' } });
    const effect = h.event('huogong', { type: 'card', parent: useCard, card: useCard.card, target });
    const stages = [];
    target.chooseCard = () => h.choice('chooseCard', { bool: true, cards: [h.hand[1]] }, { player: target, parent: effect, forced: true });
    target.showCards = () => {
        stages.push(['show', h.waits.length]);
        return { set() { return this; }, videoId: 1 };
    };
    h.player.chooseToDiscard = () => h.choice('chooseToDiscard', { bool: true, cards: [h.hand[0]] }, { parent: effect });
    h.player.discard = () => { stages.push(['discard', h.waits.length]); return {}; };
    target.damage = () => { stages.push(['damage', h.waits.length]); };
    await huogong.content(effect, undefined, h.player);
    assert.deepEqual(stages, [['show', 2], ['discard', 3], ['damage', 3]]);
    assert.equal(h.waits.length, 3);
    assert.ok(h.waits.every(ms => ms >= 600));
});

test('实际拆顺及选择他人牌：多张明牌选择在弃置/获得之前思考一次', async () => {
    for (const name of ['choosePlayerCard', 'discardPlayerCard', 'gainPlayerCard']) {
        const h = setup();
        const cards = [{ name: 'bagua' }, { name: 'zhuge' }];
        const target = { getCards: () => cards.slice(), getDiscardableCards: () => cards.slice(), getGainableCards: () => cards.slice() };
        let moved = 0;
        target.discard = () => { assert.equal(h.waits.length, 1); moved++; return {}; };
        h.player.gain = () => { assert.equal(h.waits.length, 1); moved++; return { gaintag: { addArray() {} } }; };
        const evt = h.choice(name, { bool: true, links: [cards[0]] }, {
            target, position: 'e', prompt: '选择一张牌', forced: true, filterButton: h.lib.filter.all,
            parent: h.event('useCard', { card: { name: name == 'gainPlayerCard' ? 'shunshou' : 'guohe' } }),
        });
        await h.run(evt);
        assert.equal(h.waits.length, 1, name);
        assert.ok(h.waits[0] >= 600, name);
        assert.equal(evt.result.cards[0], cards[0], name);
        assert.equal(moved, name == 'choosePlayerCard' ? 0 : 1, name);
    }
});

test('实际五谷：每个人选牌独立思考，最后一张由系统分配时无额外思考', async () => {
    const h = setup();
    const wugu = h.loadCardPack('standard').wugu;
    const dialog = h.ui.create.dialog();
    dialog.videoId = 7;
    dialog.add(h.hand);
    h.ui.dialogs.push(dialog);
    const useCard = h.event('useCard', { card: { name: 'wugu' } });
    let effect;
    const gains = [];
    h.player.chooseButton = () => h.choice('chooseButton', { bool: true, links: [dialog.buttons[0].link] }, { forced: true, parent: effect });
    h.player.getName = () => '玩家';
    h.player.gain = card => { gains.push({ card, waits: h.waits.length }); };
    h.player.$gain2 = () => {};
    for (let i = 0; i < 3; i++) {
        effect = h.event('wugu', { parent: useCard, type: 'card', card: useCard.card, target: h.player, preResult: 7 });
        await wugu.content(effect, undefined, h.player);
    }
    assert.deepEqual(gains.map(gain => gain.waits), [1, 2, 2]);
    assert.equal(h.waits.length, 2);
    assert.ok(h.waits.every(ms => ms >= 600));
});

test('借刀要求出杀或交武器都需要取舍，不套用普通响应/放弃的快速路径', async () => {
    for (const bool of [true, false]) {
        const h = setup();
        const evt = h.use('sha', { type: undefined, respondTo: [h.game.players[1], { name: 'jiedao' }], complexSelect: true, complexTarget: true });
        if (!bool) evt.result = { bool: false };
        await h.think.delay(evt);
        assert.equal(h.waits.length, 1);
        assert.ok(h.waits[0] >= 600);
    }
});

test('先前出牌思考不吞掉后续独立选择，重复进入同一个选择事件只等待一次', async () => {
    const h = setup();
    const parent = h.use('sha');
    await h.think.delay(parent);
    const child = h.choice('chooseCard', { bool: true, cards: [h.hand[0]] }, { parent });
    await h.run(child);
    await h.think.delay(child);
    const second = h.event('chooseControl', { parent, controls: ['draw', 'recover'], result: { control: 'draw' } });
    await h.think.delay(second);
    assert.equal(h.waits.length, 3);
});
