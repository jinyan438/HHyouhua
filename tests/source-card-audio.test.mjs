import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import vm from 'node:vm';
import { setupSourceCardAudio } from '../src/audio/sourceCardAudio.js';
import { sourceCardAudioAssets as assets } from '../src/audio/sourceCardAudioAssets.js';
import { sourceCards } from '../src/effects/sourceCardAssets.js';
import { createSourceCardPlayer, setupSourceCardAnimations } from '../src/effects/sourceCardAnimations.js';

function harness(install = true) {
	const sounds = [], voices = [], skills = [];
	const context = {
		lib: { config: { background_audio: true, extension_HH优化_enable_audio_replace: true }, skill: {}, animate: { card: {}, skill: {} } },
		game: {
			playAudio(...args) { sounds.push({ receiver: this, args }); return args; },
			playCardAudio(...args) { voices.push({ receiver: this, args }); return args; },
			trySkillAudio(...args) { skills.push({ receiver: this, args }); return args; },
			finishSkill() {}, broadcastAll(callback, ...args) { callback(...args); },
		},
		get: { subtype: card => card.subtype || 'equip1', nature: card => card.nature, type: card => card.type || 'equip' },
		ui: {}, _status: {},
	};
	if (install) setupSourceCardAudio(context);
	return { ...context, context, sounds, voices, skills };
}

test('5 original-client sound effects cover Shunshou and all 23 equipment cards without replacing spoken skill audio', () => {
	const manifest = JSON.parse(fs.readFileSync(new URL('../assets/card-audio/sources.json', import.meta.url), 'utf8'));
	assert.equal(Object.keys(manifest.clips).length, 5);
	const names = sourceCards.filter(card => card.effect.startsWith('EF_Equip_')).map(card => card.name).sort();
	assert.deepEqual(Object.keys(assets.equipment).sort(), names); assert.equal(names.length, 23);
	assert.equal(assets.skills, undefined);
	assert.equal(assets.steal, manifest.steal + '.mp3');
	assert.equal(assets.steal, '3d_4_spell2.mp3', 'Use the sheep bleat from shunshouHit, not the casting sound');
	assert.equal(assets.equipment.zhuge, 'wuqi.mp3'); assert.equal(assets.equipment.bagua, 'fangju.mp3'); assert.equal(assets.equipment.chitu, 'ma.mp3');
	for (const [name, file] of Object.entries(assets.equipment)) assert.equal(file, manifest.equipment[name] + '.mp3');
	for (const clip of Object.values(manifest.clips)) {
		const bytes = fs.readFileSync(new URL('../assets/card-audio/' + clip.file, import.meta.url));
		assert.equal(createHash('sha256').update(bytes).digest('hex'), clip.sha256);
		assert.equal(bytes.length, clip.bytes); assert.equal(clip.codec_name, 'mp3');
		assert.ok(clip.duration > .02 && clip.duration < 20);
		assert.match(clip.original_url, /^https:\/\/web\.sanguosha\.com\/220\/sgsolApp\/res\/runtime\/m\/voice\/(?:spelleffect\/3d_|spell\/card\/(?:wuqi|fangju|ma)\.ogg)/);
		assert.match(clip.original_sha256, /^[0-9a-f]{64}$/);
	}
});

test('generic equipment effects are replaced while all card names, skill voices and audio arguments are preserved', () => {
	const h = harness(), receiver = {};
	h.game.playCardAudio('shunshou', 'female'); h.game.playCardAudio({ name: 'zhuge' }, 'male');
	h.game.trySkillAudio('bagua_skill', receiver, true);
	assert.equal(h.voices.length, 2); assert.equal(h.skills.length, 1);
	assert.equal(h.voices[1].args[0].name, 'zhuge'); assert.equal(h.skills[0].args[0], 'bagua_skill');
	for (const args of [['effect', 'equip1'], [{ path: 'effect/equip2.mp3' }], ['ext:HH优化/effect/equip3.mp3'], ['../extension/HH优化/effect/equip4.mp3']]) h.game.playAudio(...args);
	assert.equal(h.sounds.length, 0);
	const options = { path: 'effect/damage2', onEnded() {} };
	assert.equal(h.game.playAudio.call(receiver, options)[0], options);
	assert.equal(h.sounds[0].receiver, receiver); assert.equal(h.sounds[0].args[0], options);
	h.game.playCardAudio.call(receiver, { name: 'sha' }, 'female');
	h.game.trySkillAudio.call(receiver, 'wusheng', receiver, false, true);
	assert.equal(h.voices[2].receiver, receiver); assert.equal(h.skills[1].receiver, receiver);
	assert.equal(setupSourceCardAudio(h.context), h.game.hhCardAudio, 'Repeated setup must not wrap audio again');
});

test('existing HH audio replacement wrapper still handles damage sounds without duplicating the new card sounds', () => {
	const h = harness(false);
	const text = fs.readFileSync(new URL('../hh-features.js', import.meta.url), 'utf8');
	const block = text.slice(text.indexOf('// 音频替换功能'), text.indexOf('// ========== 装备牌移动优化'));
	vm.runInContext(block, vm.createContext({ ...h.context, config: { enable_audio_replace: true }, setupSourceCardAudio }));
	h.game.playAudio('effect', 'equip1'); assert.equal(h.sounds.length, 0);
	h.game.hhCardAudio.playEquip({ name: 'qinggang' });
	assert.equal(h.sounds.length, 1); assert.ok(h.sounds[0].args[0].path.endsWith('/' + assets.equipment.qinggang));
	h.game.playAudio('effect', 'damage');
	assert.equal(h.sounds[1].args[0], 'ext:HH优化/effect/damage.mp3');
});

test('the actual Shunshou gain hook plays one sound even with card animations disabled', async () => {
	const h = harness(); h.lib.config.animation = false;
	const player = h.game.hhCardEffects = createSourceCardPlayer(h.context, { document: { hidden: false, addEventListener() {} } });
	setupSourceCardAnimations(h.context);
	const actor = {}, card = { name: 'shunshou' };
	const effect = { name: 'shunshou', card, player: actor };
	const take = { name: 'gainPlayerCard', player: actor, getParent: () => effect };
	const gained = { player: actor, cards: [{}], getParent: () => take };
	player.playCard(actor, card, { event: { name: 'useCard', card, player: actor } });
	h.game.playCardAudio(card, actor); assert.equal(h.sounds.length, 0); assert.equal(h.voices.length, 1);
	const hook = h.lib.skill._hh_source_card_steal;
	assert.equal(hook.filter(gained), true); await hook.content({}, gained); await hook.content({}, gained);
	assert.equal(h.sounds.length, 1); assert.ok(h.sounds[0].args[0].path.endsWith('/' + assets.steal));
	assert.equal(player.diagnostics.active, 0);
});

test('equipAfter plays once for normal/direct equips without repeating animations; other-pack equipment retains its generic sound', async () => {
	const h = harness(), visuals = [];
	h.game.hhCardEffects = { handles: () => false, wasPlayed: () => true, playCard: (...args) => visuals.push(args) };
	setupSourceCardAnimations(h.context);
	const hook = h.lib.skill._hh_source_card_equip;
	const normal = { card: { name: 'bagua', subtype: 'equip2' }, player: {}, getParent: () => ({ name: 'useCard' }) };
	assert.equal(hook.filter(normal), true); await hook.content({}, normal); await hook.content({}, normal);
	assert.equal(h.sounds.length, 1); assert.equal(visuals.length, 0);
	const direct = { card: { name: 'chitu', subtype: 'equip4' }, player: {}, getParent: () => null };
	await hook.content({}, direct); assert.equal(h.sounds.length, 2); assert.equal(visuals.length, 1);
	const other = { card: { name: 'other_pack_weapon', subtype: 'equip1' }, player: {}, getParent: () => null };
	assert.equal(hook.filter(other), true); await hook.content({}, other);
	assert.deepEqual(h.sounds[2].args, ['effect', 'equip1']); assert.equal(visuals.length, 1);
});

test('card sound effects respect global and extension sound settings independently of graphics', () => {
	const h = harness(), actor = {};
	h.lib.config.animation = false;
	h.game.hhCardAudio.playEquip({ name: 'zhuge' }); h.game.hhCardAudio.playSteal(actor);
	assert.equal(h.sounds.length, 2);
	h.lib.config.background_audio = false;
	h.game.hhCardAudio.playSteal(actor); h.game.hhCardAudio.playEquip({ name: 'zhuge' }); assert.equal(h.sounds.length, 2);
	h.lib.config.background_audio = true; h.lib.config.extension_HH优化_enable_audio_replace = false;
	h.game.playAudio('effect', 'equip1'); h.game.playCardAudio('shunshou', 'female'); h.game.trySkillAudio('bagua_skill', actor);
	assert.equal(h.sounds.length, 3); assert.equal(h.voices.length, 1); assert.equal(h.skills.length, 1);
});

test('missing imported audio falls back once through the saved original functions without recursively suppressing the fallback', () => {
	const h = harness(), actor = {};
	h.game.hhCardAudio.playSteal(actor);
	let options = h.sounds.at(-1).args[0]; options.onError(); options.onError();
	assert.equal(h.voices.length, 0, 'A missing bleat must not insert a spoken card-name fallback');
	h.game.hhCardAudio.playEquip({ name: 'bagua', subtype: 'equip2' });
	options = h.sounds.at(-1).args[0]; options.onError(); options.onError();
	assert.deepEqual(h.sounds.at(-1).args, ['effect', 'equip2']);
});
