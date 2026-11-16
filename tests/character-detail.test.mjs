import assert from 'node:assert/strict';
import test from 'node:test';
import { characterSkillTags, createCharacterSkins, createCharacterVoice } from '../src/ui/characterDetail.js';

const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture() {
	const saves = [], audioCalls = [];
	const lib = { config: { skin: { other: ['own.png', 'extension/other/own.png'] }, identity_banned: ['banned'], background_speak: true, volumn_audio: 8 }, character: { liubei: { sex: 'male' } }, characterSubstitute: { liubei: [['liubei_alt', ['ext:test/alt.png']]] }, translate: { liubei_alt: '替代形象', portrait: '精选皮肤' } };
	const game = { saveConfig(key, value) { saves.push([key, value]); }, getFileList(folder, success) { success([], ['10.jpg', '2.jpg', 'portrait.webp', 'notes.txt']); }, playAudio(options) { const audio = { paused: false, removed: false, pause() { this.paused = true; }, remove() { this.removed = true; } }; audioCalls.push({ options, audio }); return audio; } };
	const get = { character: id => lib.character[id], skinPath: id => 'image/skin/' + id + '/' };
	return { lib, game, get, saves, audioCalls };
}

test('skill badges distinguish activation and trigger definitions and preserve special categories', () => {
	assert.deepEqual(characterSkillTags({ enable: 'phaseUse', zhuSkill: true }), { types: [{ type: 'active', label: '主动' }], labels: ['主公技'] });
	assert.deepEqual(characterSkillTags({ trigger: { player: 'damageEnd' }, forced: true, juexingji: true }).labels, ['觉醒技', '锁定技']);
	assert.equal(characterSkillTags({ trigger: {}, forced: true, locked: false }).labels.includes('锁定技'), false);
	assert.deepEqual(characterSkillTags({ enable: true, trigger: {}, limited: true, zhuanhuanji: true }).types.map(item => item.label), ['主动', '被动']);
	assert.deepEqual(characterSkillTags({ limited: true, dutySkill: true }).labels, ['限定技', '使命技']);
});

test('skin choices use registered substitute metadata and installed image files without inventing unavailable skins', async () => {
	const h = fixture(), skins = createCharacterSkins(h), choices = await skins.list('liubei');
	assert.deepEqual(choices.map(choice => choice.name), ['经典形象', '替代形象', '2', '10', '精选皮肤']);
	assert.equal(choices[1].image, 'extension/test/alt.png'); assert.equal(choices[1].character, 'liubei_alt');
	assert.equal(choices[4].image, 'image/skin/liubei/portrait.webp'); assert.equal(skins.selected('liubei', choices).key, 'original');
	h.game.getFileList = (_folder, _success, error) => error(new Error('not installed'));
	assert.equal((await skins.list('liubei')).length, 2);
	assert.equal((await skins.list('guanyu')).length, 1);
	delete h.game.getFileList; h.lib.skin = { guanyu: 2 }; assert.equal((await skins.list('guanyu'))[2].value, 2);
});

test('skin changes share native configuration, update matching avatars, preserve other settings and roll back save failures', async () => {
	const h = fixture(), updates = []; h.game.players = [{ name: 'liubei', node: { avatar: { setBackground(...args) { updates.push(args); } } } }];
	const skins = createCharacterSkins(h), choices = await skins.list('liubei');
	await skins.select('liubei', choices[4]);
	assert.deepEqual(h.lib.config.skin.liubei, ['portrait.webp', 'image/skin/liubei/portrait.webp']);
	assert.deepEqual(h.lib.config.skin.liubei_alt, ['portrait.webp', 'image/skin/liubei/portrait/liubei_alt.webp']);
	assert.equal(updates[0][0], 'liubei'); assert.equal(h.saves[0][0], 'skin'); assert.deepEqual(h.lib.config.identity_banned, ['banned']);
	assert.equal(skins.selected('liubei', await skins.list('liubei')).key, choices[4].key);
	await skins.select('liubei', choices[1]); assert.equal(skins.selected('liubei', await skins.list('liubei')).character, 'liubei_alt');
	const before = h.lib.config.skin; h.game.saveConfig = async () => { throw new Error('write failed'); };
	await assert.rejects(skins.select('liubei', choices[0]), /write failed/); assert.equal(h.lib.config.skin, before);
	h.game.saveConfig = () => {}; await skins.select('liubei', choices[0]); assert.equal(h.lib.config.skin.liubei, undefined); assert.equal(h.lib.config.skin.liubei_alt, undefined); assert.deepEqual(h.lib.config.skin.other, ['own.png', 'extension/other/own.png']);
});

test('rapid skin saves serialize and native asynchronous persistence finishes before the operation resolves', async () => {
	const h = fixture(); let release, completed = false;
	h.game.promises = { saveConfig() { return new Promise(resolve => { release = resolve; }); } };
	const skins = createCharacterSkins(h), choices = await skins.list('liubei');
	const first = skins.select('liubei', choices[1]).then(() => { completed = true; }), second = skins.select('liubei', choices[4]);
	await flush(); assert.equal(completed, false); assert.equal(h.lib.config.skin.liubei[0], 'liubei_alt'); release(); await first; await flush();
	assert.equal(h.lib.config.skin.liubei[0], 'portrait.webp'); release(); await second;
});

test('voice previews resolve the selected skin, cycle lines, stay local and stop on change or close', () => {
	const h = fixture(), requests = [];
	h.get.Audio = { skill(options) { requests.push(options); return { audioList: [{ file: 'skill/rende_alt1.mp3', text: '第一句' }, { file: 'skill/rende_alt2.mp3', text: '第二句' }] }; } };
	const voice = createCharacterVoice(h);
	assert.equal(voice.play('rende', 'liubei', 'liubei_alt').text, '第一句');
	assert.deepEqual(requests[0].player.skin, { name: 'liubei_alt' }); assert.deepEqual(requests[0].player.tempname, ['liubei_alt']);
	assert.equal(h.audioCalls[0].options.addVideo, false);
	assert.equal(voice.play('rende', 'liubei', 'liubei_alt').text, '第二句'); assert.equal(h.audioCalls[0].audio.paused, true);
	voice.stop(); assert.equal(h.audioCalls[1].audio.removed, true); h.audioCalls[1].options.onError(); assert.equal(h.audioCalls.length, 2);
	h.lib.config.background_speak = false; assert.equal(voice.play('rende', 'liubei').muted, true); assert.equal(h.audioCalls.length, 2);
	h.lib.config.background_speak = true; h.lib.config.volumn_audio = 0; assert.equal(voice.play('rende', 'liubei').muted, true);
	h.lib.config.volumn_audio = 8; h.get.Audio.skill = () => ({ audioList: [] }); assert.equal(voice.play('silent', 'liubei').empty, true);
});

test('voice previews fall back through missing files and retain support for the native legacy resolver', () => {
	const h = fixture(); h.game.parseSkillAudio = () => ['skill/missing.mp3', 'ext:test/skill/rende.mp3'];
	const voice = createCharacterVoice(h); voice.play('rende', 'liubei'); h.audioCalls[0].options.onError();
	assert.equal(h.audioCalls[1].options.path, 'ext:test/skill/rende.mp3'); voice.stop(); assert.equal(h.audioCalls[1].audio.paused, true);
});
