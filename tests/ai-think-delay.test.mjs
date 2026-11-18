// 从仓库根目录运行：node --test apps/core/extension/HH优化/tests/ai-think-delay.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { setupSettlementOptimization } from '../src/features/settlementOptimization.js';

const extension = readFileSync(new URL('../hh-features.js', import.meta.url), 'utf8');
const thinkCode = extension.slice(extension.indexOf('const HH_parseNumberConfig'), extension.indexOf('setupLordBlindShot({ lib, game, get, _status });'));
const rescueBridge = extension.slice(extension.indexOf('// ========== 濒死逐人求桃'), extension.indexOf('// ========== HH优化样式覆盖功能'));
const coreSource = readFileSync(new URL('../../../noname/library/element/content.ts', import.meta.url), 'utf8');
const coreCode = ts.transpileModule(coreSource.slice(coreSource.indexOf('export const Content')).replace('export const Content', 'const Content') + '\nglobalThis.coreContent = Content;', {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

function setup({ config = {}, random = 0.5, content, schedule = callback => callback() } = {}) {
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
        addVideo() {}, broadcast() {}, broadcastAll() {}, log() {}, delay() {}, createButtonCardsetion() {},
        addGlobalSkill(name) { if (!lib.skill.global.includes(name)) lib.skill.global.push(name); } };
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
    math.random = typeof random === 'function' ? random : () => random;
    let rescueOptions;
    const context = vm.createContext({ lib, game, ui, get, ai: { basic: { chooseCard: () => true, chooseButton: () => true } }, _status: status, Math: math, Date,
        setupRescueFlow(_context, options) { rescueOptions = options; },
        delay: () => Promise.resolve(),
        setTimeout(callback, ms) { waits.push(ms); schedule(callback, ms); },
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
    vm.runInContext(rescueBridge, context);
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
    return { lib, game, ui, get, status, player, hand, waits, popups, actions, event, use, run, choice, loadCardPack, think: context.think, rescueDelay: (...args) => rescueOptions.getThinkDelay(...args) };
}

test('思考开始即传入实际等待时长，直到等待完成才清理提示和进度条', async () => {
    let finish;
    const h = setup({ schedule: callback => { finish = callback; } }), calls = [], token = {};
    h.game.hhAIThinkProgress = {
        begin(player, duration, showTip, event) { calls.push({ player, duration, showTip, event }); return token; },
        end(value) { assert.equal(value, token); calls.push('end'); },
    };
    const event = h.use('sha'), pending = h.think.delay(event);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].player, h.player);
    assert.equal(calls[0].duration, h.waits[0]);
    assert.equal(calls[0].event, event, 'Presentation receives the actual decision, including Wuxie context');
    assert.ok(calls[0].duration >= 600); assert.equal(calls[0].showTip, true);
    assert.deepEqual(h.popups, [], 'Use a persistent hint instead of the transient damage popup');
    finish(); await pending;
    assert.equal(calls[1], 'end');
});

test('快速操作和关闭文字提示仍同步进度，等待异常也会清理', async () => {
    for (const mode of ['quick', 'hidden', 'error']) {
        const h = setup({ config: { extension_HH优化_ai_think_delay_popup: mode !== 'hidden' },
            schedule: callback => { if (mode === 'error') throw new Error('wait failed'); callback(); } });
        const token = {}; let started = false, ended = false;
        h.game.hhAIThinkProgress = {
            begin(player, duration, showTip) {
                started = true; assert.ok(duration > 0); if (mode === 'quick') assert.ok(duration >= 1000 && duration <= 2600);
                assert.equal(showTip, mode !== 'hidden' && duration >= 600); return token;
            },
            end(value) { assert.equal(value, token); ended = true; },
        };
        const pending = h.think.delay(h.use(mode === 'quick' ? 'wuzhong' : 'sha'));
        if (mode === 'error') await assert.rejects(pending, /wait failed/); else await pending;
        assert.ok(started && ended);
    }
});

test('因操作超时托管的本地角色与其他AI一致思考，不再走快速旁路', async () => {
    const h = setup(); h.game.me = h.player; h.status.auto = true; h.game.hhPlayerActionTimer = { timedOutAuto: true };
    await h.think.delay(h.use('sha')); assert.equal(h.waits.length, 1); assert.ok(h.waits[0] >= 1000);
    const other = { ...h.player };
    await h.think.delay(h.use('sha', { player: other })); assert.equal(h.waits.length, 2); assert.ok(h.waits[1] >= 1000);
});

test('求桃预思考沿用救人长考和自救点击节奏，不预先查询是否有桃', () => {
    const h = setup(), dying = { hp: 0 }, parent = { name: '_save' };
    h.player.canSave = () => { throw new Error('不能提前探测救人能力'); };
    const hasCards = h.rescueDelay(h.player, dying, parent);
    h.hand.length = 0;
    const noCards = h.rescueDelay(h.player, dying, parent);
    assert.ok(hasCards >= 600 && noCards >= 600);
    const selfSave = h.rescueDelay(h.player, h.player, parent);
    assert.ok(selfSave >= 900 && selfSave <= 2600);
    assert.deepEqual(h.popups, []);
});

test('求桃等待遵守思考总开关、零时长、联机及真人/手动控制限制', () => {
    for (const mode of ['disabled', 'zero', 'connect', 'online', 'mine', 'controlled']) {
        const h = setup();
        if (mode === 'disabled') h.lib.config.extension_HH优化_enable_ai_think_delay = false;
        if (mode === 'zero') { h.lib.config.extension_HH优化_ai_think_delay_min = 0; h.lib.config.extension_HH优化_ai_think_delay_max = 0; }
        if (mode === 'connect') h.status.connectMode = true;
        if (mode === 'online') h.game.online = true;
        if (mode === 'mine') h.player.isMine = () => true;
        if (mode === 'controlled') h.player.isUnderControl = () => true;
        assert.equal(h.rescueDelay(h.player, { hp: 0 }, { name: '_save' }), 0, mode);
    }
});

test('求桃预思考后不重复等待出牌/转化子选择，出牌结算中的独立响应仍正常计时', async () => {
    const h = setup(), dying = { hp: 0 };
    const parent = h.use('tao', { type: 'dying', dying, _HH_rescueThought: true });
    await h.think.delay(parent);
    await h.think.delay(h.event('chooseButton', { parent, result: { bool: true, links: [1] } }));
    parent.result = { bool: false }; await h.think.delay(parent);
    assert.equal(h.waits.length, 0);
    const resolution = h.event('useCard', { parent });
    await h.think.delay(h.use('shan', { name: 'chooseToRespond', type: undefined, parent: resolution }));
    assert.equal(h.waits.length, 1);
});

test('实际 chooseToUse：顺手用牌也遵守用户的思考下限，并保持出牌结果', async () => {
    const h = setup({ config: { extension_HH优化_ai_think_delay_min: 10000 } });
    const evt = h.use('wuzhong');
    evt.selectedResult = evt.result;
    delete evt.result;
    await h.run(evt);
    assert.equal(h.actions.length, 1);
    assert.equal(h.actions[0].result, evt.selectedResult);
    assert.equal(h.actions[0].waits.length, 1);
    assert.equal(h.waits.length, 1);
    assert.equal(h.waits[0], 10000);
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

test('实际 chooseToRespond：出闪前观察响应一次，保留响应牌和返回事件', async () => {
    const h = setup();
    const evt = h.use('shan', { name: 'chooseToRespond', type: undefined, parent: {} });
    evt.selectedResult = evt.result;
    delete evt.result;
    let response;
    h.player.respond = (cards, card) => {
        assert.equal(h.waits.length, 1);
        assert.ok(h.waits[0] >= 1000 && h.waits[0] <= 2600);
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
    assert.ok(h.waits.every(ms => ms >= 1000 && ms <= 2600));
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

test('普通出闪/响应杀保留完整停顿，残血及持有桃无懈仍采用普通响应上限', async () => {
    const h = setup();
    h.player.hp = 1;
    h.hand.push({ name: 'wuxie' });
    for (const name of ['shan', 'sha']) {
        const evt = h.use(name, { name: 'chooseToRespond', type: undefined, prompt: '请响应伤害，当前体力为1' });
        await h.think.delay(evt);
    }
    assert.equal(h.waits.length, 2);
    assert.ok(h.waits.every(ms => ms >= 1000 && ms <= 2600));
    assert.deepEqual(h.popups, []);
});

test('无普通响应也按响应节奏观察；无懈跳过和结束出牌阶段保留原节奏', async () => {
    const h = setup();
    await h.think.delay(h.event('chooseToRespond', { result: { bool: false } }));
    await h.think.delay(h.event('chooseToUse', { type: undefined, result: { bool: false } }));
    assert.equal(h.waits.length, 2); assert.ok(h.waits.every(ms => ms >= 1000 && ms <= 2600));
    await h.think.delay(h.event('chooseToUse', { type: 'wuxie', result: { bool: false } }));
    await h.think.delay(h.event('chooseToRespond', { parent: h.event('_wuxie'), result: { bool: false } }));
    assert.equal(h.waits.length, 2);
    await h.think.delay(h.event('chooseToDiscard', { result: { bool: true, autochoose: true } }));
    await h.think.delay(h.event('chooseToUse', { result: { bool: false } }));
    assert.equal(h.waits.length, 4);
    assert.ok(h.waits.every(ms => ms >= 900 && ms <= 2600));
});

test('原生自动跳过无杀/闪及普通无牌选择在交还失败结果之前阻塞，自动检查只执行一次', async () => {
    for (const name of ['chooseToRespond', 'chooseToUse']) {
        const callbacks = [], h = setup({ schedule: callback => callbacks.push(callback) });
        h.hand.length = 0; h.lib.config.skip_shan = true;
        let checks = 0, completed = false;
        const evt = h.choice(name, { bool: false }, { type: name === 'chooseToUse' ? 'respondShan' : undefined,
            autochoose: () => { checks++; return true; } });
        const pending = h.run(evt).then(() => { completed = true; });
        for (let i = 0; !callbacks.length && i < 30; i++) await Promise.resolve();
        assert.equal(callbacks.length, 1); assert.equal(completed, false);
        assert.equal(evt.result.bool, false); assert.equal(h.waits.length, 1); assert.ok(h.waits[0] >= 1000);
        callbacks.shift()(); await pending;
        assert.equal(completed, true); assert.equal(h.actions.length, 0);
        assert.equal(checks, name === 'chooseToRespond' ? 1 : 0);
    }
});

function shaFixture(options = {}) {
    const h = setup(options), sha = h.loadCardPack('standard').sha;
    const defender = h.player, attacker = h.game.players[1], skill = h.lib.skill._HH_ai_missing_shan, events = [];
    const source = h.event('sha', { player: attacker, target: defender, card: { name: 'sha' } });
    h.lib.config.skip_shan = true; h.hand.length = 0;
    h.lib.element.VCard = class { constructor(data) { Object.assign(this, data); } }; h.lib.filter.cardEnabled = () => false;
    defender.hasShan = () => false;
    defender.chooseToUse = () => { throw Error('原生快速跳过不能被改成一次实际选牌'); };
    defender.damage = async () => { events.push(['damage', h.waits.length]); };
    h.game.hasNature = () => false; h.get.nature = () => undefined;
    source.trigger = name => {
        events.push([name, h.waits.length]);
        if (name === 'shaHit' && skill.filter(source, defender)) return skill.content({}, source, defender);
    };
    const run = () => sha.content(source, undefined, attacker);
    return { ...h, source, defender, attacker, skill, events, run };
}

test('原版杀完全跳过无闪询问时，受伤之前仍有同步进度的思考，且只补一次', async () => {
    const callbacks = [], h = shaFixture({ schedule: callback => callbacks.push(callback) }), progress = [];
    h.game.hhAIThinkProgress = { begin(player, duration, showTip, question) {
        assert.equal(player, h.defender); assert.equal(question.type, 'respondShan'); assert.ok(showTip);
        progress.push(['begin', duration]); return question;
    }, end() { progress.push(['end']); } };
    assert.ok(h.lib.skill.global.includes('_HH_ai_missing_shan'));
    const pending = h.run();
    for (let i = 0; !callbacks.length && i < 20; i++) await Promise.resolve();
    assert.equal(callbacks.length, 1); assert.deepEqual(h.events, [['shaHit', 0]]);
    assert.ok(h.waits[0] >= 1000 && h.waits[0] <= 2600); assert.equal(progress.length, 1);
    callbacks.shift()(); await pending;
    assert.equal(h.waits.length, 1); assert.equal(h.skill.filter(h.source, h.defender), false);
    assert.deepEqual(h.events, [['shaHit', 0], ['damage', 1], ['shaDamage', 1]]); assert.equal(progress.length, 2);
});

test('原生杀已经询问并思考过的失败响应不再补停顿，需两闪时后续无闪仍独立思考', async () => {
    for (const partial of [false, true]) {
        const h = shaFixture(); let availableChecks = 0, choices = 0;
        h.defender.hasShan = () => { availableChecks++; return availableChecks === 1; };
        h.defender.isLinked = () => false; h.defender.hasSkillTag = () => false; h.defender.hasSkill = () => false;
        h.defender.mayHaveShan = () => 2;
        h.attacker.hasSkillTag = () => false; h.get.damageEffect = () => -1;
        h.source.shanRequired = partial ? 2 : 1;
        h.defender.chooseToUse = () => {
            choices++;
            return { set() { return this; }, async forResult() {
                const result = partial ? { bool: true, card: { name: 'shan' }, result: 'shaned' } : { bool: false };
                await h.think.delay(h.event('chooseToUse', { type: 'respondShan', parent: h.source, result }));
                return result;
            } };
        };
        await h.run();
        assert.equal(choices, 1); assert.equal(availableChecks, partial ? 2 : 1, '不额外探测是否有闪');
        assert.equal(h.waits.length, partial ? 2 : 1); assert.ok(h.waits.every(ms => ms >= 1000));
        assert.equal(h.events.filter(([name]) => name === 'damage').length, 1);
    }
});

test('无闪补充停顿不介入强命中、自动闪避、真人、关闭开关及联机录像等流程', async () => {
    for (const mode of ['directHit', 'directHit2', 'skipShan', 'disabled', 'zero', 'mine', 'controlled', 'connect', 'online', 'video', 'over']) {
        const h = shaFixture();
        if (['directHit', 'directHit2', 'skipShan'].includes(mode)) h.source[mode] = true;
        if (mode === 'disabled') h.lib.config.extension_HH优化_enable_ai_think_delay = false;
        if (mode === 'zero') Object.assign(h.lib.config, { extension_HH优化_ai_think_delay_min: 0, extension_HH优化_ai_think_delay_max: 0 });
        if (mode === 'mine') h.defender.isMine = () => true;
        if (mode === 'controlled') h.defender.isUnderControl = () => true;
        if (mode === 'connect') h.status.connectMode = true;
        if (mode === 'online') h.game.online = true;
        if (mode === 'video') h.status.video = true;
        if (mode === 'over') h.status.over = true;
        if (h.skill.filter(h.source, h.defender)) await h.skill.content({}, h.source, h.defender);
        assert.equal(h.waits.length, 0, mode);
    }
});

test('无牌响应逐次取样，结算开关及速度倍率不改变停顿；提前结束的选择也先完成思考', async () => {
    const sequences = [];
    for (const enabled of [false, true]) {
        const h = setup({ random: seededRandom(837), content: { chooseToRespond: [async function(event) { event.result = { bool: false }; event.finish(); }] } });
        h.game.delayx = () => Promise.resolve(); h.lib.config.extension_HH优化_speed_multiplier = enabled ? 2.5 : 1;
        setupSettlementOptimization({ lib: h.lib, game: h.game, get: h.get, _status: h.status }, { enable_settlement_optimize: enabled });
        for (let i = 0; i < 20; i++) await h.run(h.event('chooseToRespond'));
        assert.equal(h.waits.length, 20); assert.ok(new Set(h.waits).size >= 18);
        assert.ok(h.waits.every(ms => ms >= 1000 && ms <= 2600)); sequences.push(h.waits);
    }
    assert.deepEqual(sequences[0], sequences[1]);
});

test('强制弃光和唯一控制项模拟点击，多选项及多牌取舍正常等待', async () => {
    const h = setup();
    await h.think.delay(h.event('chooseToDiscard', { forced: true, selectCard: 3, result: { bool: true, cards: h.hand } }));
    await h.think.delay(h.event('chooseControl', { controls: ['ok'], result: { control: 'ok' } }));
    assert.equal(h.waits.length, 2);
    assert.ok(h.waits.every(ms => ms >= 900 && ms <= 2600));
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
    assert.ok(h.waits[1] >= 900 && h.waits[1] <= 2600);
    await h.run(h.event('chooseBool', { choice: true }));
    assert.equal(h.waits.length, 3);
});

test('技能消耗牌不作为使用牌，虚拟牌按最终牌名判断', () => {
    const h = setup();
    const evt = h.event('chooseToUse', { result: { bool: true, skill: 'active', cards: [{ name: 'wuzhong' }] } });
    assert.ok(h.think.calc(h.player, evt) > 0);
    evt.result.card = { name: 'wuzhong' };
    const delay = h.think.calc(h.player, evt);
    assert.ok(delay >= 1000 && delay <= 2600);
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
    assert.ok(h.waits[0] >= 1000 && h.waits[0] <= 2600);
    const wrapped = h.lib.element.content.chooseToUse;
    h.think.hook();
    assert.equal(h.lib.element.content.chooseToUse, wrapped);
});

test('关闭功能、联机、真人和手动控制角色不等待', async () => {
    for (const mode of ['disabled', 'connect', 'online', 'mine', 'controlled', 'replay', 'over']) {
        const h = setup();
        if (mode == 'disabled') h.lib.config.extension_HH优化_enable_ai_think_delay = false;
        if (mode == 'connect') h.status.connectMode = true;
        if (mode == 'online') h.game.online = true;
        if (mode == 'mine') h.player.isMine = () => true;
        if (mode == 'controlled') h.player.isUnderControl = () => true;
        if (mode == 'replay') h.status.video = true;
        if (mode == 'over') h.status.over = true;
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
            assert.ok(quick >= 500 && quick <= 800);
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

test('系统结算事件不接入思考，预选牌的交互仍保留观察确认', async () => {
    const system = async function() { return 'resolved'; };
    const content = Object.fromEntries(['useCard', 'draw', 'gain', 'discard', 'damage', 'recover', 'showCards'].map(name => [name, system]));
    const h = setup({ content });
    for (const name of Object.keys(content)) {
        if (name.startsWith('_')) continue;
        assert.equal(h.lib.element.content[name], system);
        await h.think.delay(h.event(name, { result: { bool: true } }));
    }
    assert.equal(h.waits.length, 0);
    await h.think.delay(h.event('discardPlayerCard', { directresult: h.hand, result: { bool: true, cards: h.hand } }));
    assert.equal(h.waits.length, 1); assert.ok(h.waits[0] >= 900);
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

function seededRandom(seed = 421) {
    return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

test('启用结算优化后每张主动牌和每次杀闪响应仍单独等待，关闭思考才取消这些等待', async () => {
    const sequences = [];
    for (const enabled of [false, true]) {
        const h = setup({ random: seededRandom() });
        Object.assign(h.lib.config, { game_speed: 'mid', extension_HH优化_speed_multiplier: 2.5, animation: true });
        h.game.delayx = () => Promise.resolve();
        const settlement = setupSettlementOptimization({ lib: h.lib, game: h.game, get: h.get, _status: h.status }, { enable_settlement_optimize: enabled });
        const phase = h.event('phaseUse'); let responses = 0;
        h.player.respond = () => { responses++; return { set() {} }; };
        for (let i = 0; i < 12; i++) {
            const evt = h.use('sha', { parent: phase }); evt.selectedResult = evt.result; delete evt.result;
            await h.run(evt);
            const response = h.use(i % 2 ? 'sha' : 'shan', { name: 'chooseToRespond', type: undefined, parent: h.event('useCard') });
            response.selectedResult = response.result; delete response.result; await h.run(response);
        }
        assert.equal(h.actions.length, 12); assert.equal(responses, 12); assert.equal(h.waits.length, 24);
        assert.ok(h.waits.every(ms => ms >= 1000));
        assert.ok(new Set(h.waits).size >= 20, '不能连续使用同一个固定停顿');
        sequences.push(h.waits.slice());
        h.status.event = h.event('useCard'); await h.game.delayx();
        assert.equal(settlement.snapshot().defaultWaits, 0, '使用牌的展示等待保持原样');
        h.status.event = h.event('gain', { animate: false }); await h.game.delayx();
        assert.equal(settlement.snapshot().defaultWaits, enabled ? 1 : 0, '静默数据结算独立保持优化');
        h.lib.config.extension_HH优化_enable_ai_think_delay = false;
        await h.think.delay(h.use('sha', { parent: phase })); assert.equal(h.waits.length, 24);
        assert.equal(h.lib.config.game_speed, 'mid'); assert.equal(h.lib.config.extension_HH优化_speed_multiplier, 2.5); assert.equal(h.lib.config.animation, true);
    }
    assert.deepEqual(sequences[0], sequences[1], '结算开关和倍率不能吞掉或缩短思考时长');
});

test('真实出牌步骤必须等自己的思考计时完成后才能提交，不提前开始下一张牌', async () => {
    const callbacks = [], h = setup({ schedule: callback => callbacks.push(callback) });
    const phase = h.event('phaseUse');
    for (const name of ['sha', 'wuzhong', 'bagua']) {
        const evt = h.use(name, { parent: phase }); evt.selectedResult = evt.result; delete evt.result;
        const before = h.actions.length, pending = h.run(evt);
        for (let i = 0; !callbacks.length && i < 20; i++) await Promise.resolve();
        assert.equal(callbacks.length, 1); assert.equal(h.actions.length, before);
        callbacks.shift()(); await pending; assert.equal(h.actions.length, before + 1);
        assert.equal(h.actions.at(-1).result, evt.selectedResult);
    }
});

test('连续用牌不会越出越快，摸到新牌和公开场面变化后重新规划', () => {
    const h = setup(), phase = h.event('phaseUse');
    h.player.actionHistory = [{ gain: [] }];
    const play = () => h.think.calc(h.player, h.use('sha', { parent: phase }));
    const first = play(), planned = play(), next = play(), review = play();
    assert.ok(first > planned); assert.equal(planned, next, '已规划连招的缩短不逐次叠乘');
    assert.ok(review > next, '几张后恢复观察节奏');
    h.player.actionHistory[0].gain.push({});
    assert.ok(play() > planned, '手牌总数没变的得牌也需要重新观察');
    play(); h.game.players[1].hp--;
    assert.ok(play() > planned, '体力变化后重新取舍');
    play(); h.game.players[1].node = { equips: { childElementCount: 1 } };
    assert.ok(play() > planned, '装备变化后重新取舍');
    assert.ok(Array.from({ length: 50 }, play).every(ms => ms >= 1200 && ms <= 2600));
});

test('角色和每次决策有不同节奏，复杂操作不会全挤到最长时长', () => {
    const h = setup({ random: seededRandom(707) }), phase = h.event('phaseUse');
    const active = [], response = [], easy = [], complex = [];
    for (let i = 0; i < 300; i++) {
        active.push(h.think.calc(h.player, h.use('sha', { parent: phase })));
        response.push(h.think.calc(h.player, h.use('shan', { name: 'chooseToRespond', type: undefined })));
        easy.push(h.think.calc(h.player, h.use('wuzhong', { parent: phase })));
        complex.push(h.think.calc(h.player, h.use('sha', { parent: phase, complexCard: true, selectCard: [1, 3], selectTarget: [1, 3] })));
    }
    for (const values of [active, response, easy, complex]) assert.ok(new Set(values).size > 150);
    assert.ok(active.every(ms => ms >= 1200 && ms <= 2600));
    assert.ok(response.every(ms => ms >= 1000 && ms <= 2600));
    assert.ok(easy.every(ms => ms >= 1000 && ms <= 2600));
    assert.ok(complex.every(ms => ms <= 2600));
    const mean = values => values.reduce((a, b) => a + b) / values.length;
    assert.ok(mean(active) > mean(response)); assert.ok(mean(complex) > mean(active));
    const other = { ...h.player }; delete other._HH_aiThinkProfile;
    h.think.calc(other, h.use('sha', { player: other }));
    assert.notEqual(other._HH_aiThinkProfile.speed, h.player._HH_aiThinkProfile.speed);
});

test('代选、唯一选项、频繁技能和结束阶段均有可感知且变化的停顿', async () => {
    const h = setup({ random: seededRandom(318) });
    const choices = [
        () => h.event('chooseControl', { controls: ['ok'], result: { control: 'ok' } }),
        () => h.event('chooseBool', { frequentSkill: 'yingzi', result: { bool: true } }),
        () => h.event('chooseToDiscard', { forced: true, selectCard: -1, result: { bool: true, cards: h.hand } }),
        () => h.event('chooseCard', { result: { bool: true, autochoose: true, cards: [h.hand[0]] } }),
        () => h.event('chooseToUse', { result: { bool: false } }),
    ];
    for (let i = 0; i < 10; i++) for (const choice of choices) await h.think.delay(choice());
    assert.equal(h.waits.length, 50); assert.ok(h.waits.every(ms => ms >= 900 && ms <= 2600));
    assert.ok(new Set(h.waits).size > 40, '简单操作也不能连续使用固定的最低时长');
});

test('新增给牌、移牌、选数和选技能入口保留最终结果，并对不同结果形状分别计时', async () => {
    const content = Object.fromEntries(['chooseToGive', 'chooseToMove', 'chooseToMove_new', 'chooseNumbers', 'chooseSkill'].map(name => [name, async function(event) {
        event.result = event.selectedResult; return event.result;
    }]));
    const h = setup({ content }); h.lib.skill.transform = { chooseButton: {} };
    const values = [{ bool: true, cards: [h.hand[0]] }, { bool: true, moved: [h.hand] }, { moved: [h.hand] }, { numbers: [2, 3] }, { bool: true, skill: 'transform' }];
    for (const [index, name] of Object.keys(content).entries()) {
        const event = h.event(name, { selectedResult: values[index] }); await h.run(event);
        assert.equal(event.result, values[index]); assert.equal(h.waits.length, index + 1);
    }
    assert.ok(h.waits.every(ms => ms >= 900));
});

test('实际原生选技能：选到带选择按钮的技能也在结果交还前思考一次', async () => {
    const h = setup(); h.get.max = list => list[0]; h.get.skillRank = () => 1;
    h.lib.skill.transform = { chooseButton: {} };
    const event = h.event('chooseSkill', { target: { getGainableSkills: () => ['transform', 'other'] } });
    await h.run(event); assert.equal(event.result.skill, 'transform'); assert.equal(h.waits.length, 1); assert.ok(h.waits[0] >= 900);
});

test('竞技场初始化后重接其他扩展替换的选择函数，重复安装不叠加等待', async () => {
    const h = setup(), replacement = [async function(event) { event.result = { bool: true, cards: [h.hand[0]] }; }];
    h.lib.element.content.chooseCard = replacement;
    for (const callback of h.lib.arenaReady) callback();
    const wrapped = h.lib.element.content.chooseCard; assert.notEqual(wrapped, replacement);
    for (const callback of h.lib.arenaReady) callback(); assert.equal(h.lib.element.content.chooseCard, wrapped);
    await h.run(h.event('chooseCard')); assert.equal(h.waits.length, 1); assert.ok(h.waits[0] >= 900);
});

test('已编译的旧式步骤复用原索引、沙盒依赖和this，在提交操作前等待', async () => {
    const compiled = Object.assign(async function() { throw Error('must reuse native compiled step bodies'); }, { compiled: true, originals: [
        function(top, event, trigger, player) { assert.equal(this, event); assert.equal(top.game, h.game); assert.equal(player, h.player); event.result = { bool: true, cards: [h.hand[0]] }; },
        function(top, event) { assert.equal(this, event); assert.equal(h.waits.length, 1); event.committed = true; return 'kept'; },
    ] });
    const h = setup({ content: { chooseCard: compiled } }), event = h.event('chooseCard');
    await h.run(event); assert.equal(event.committed, true); assert.equal(event._result, 'kept'); assert.equal(h.waits.length, 1);
});

test('不透明的扩展编译器在进入选择前思考，不改变原返回值和this', async () => {
    const callbacks = []; let entered = false;
    const original = Object.assign(async function(event) { assert.equal(this, event); entered = true; event.result = { bool: true }; return 'same'; }, { compiled: true });
    const h = setup({ content: { chooseCard: original }, schedule: callback => callbacks.push(callback) }), event = h.event('chooseCard');
    const result = h.run(event); assert.equal(entered, false); assert.equal(callbacks.length, 1);
    callbacks.shift()(); assert.equal(await result, 'same'); assert.equal(entered, true); assert.equal(h.waits.length, 1);
});
