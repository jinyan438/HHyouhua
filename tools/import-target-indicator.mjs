import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { spine } from '../src/libs/spine4-core.js';

// The original effect only uses region attachments and linear/stepped timelines.
// Convert its serialization for the existing 3.6 player, retaining every keyframe.
const root = new URL('../assets/animation/ol-selected-swords/', import.meta.url);
const name = 'FX_paiju_guoduhu';
const read = suffix => fs.readFileSync(new URL(name + suffix, root));
const atlas = new spine.TextureAtlas(read('.atlas.txt').toString());
const data = new spine.SkeletonBinary(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(new Uint8Array(read('.skel')));
const hex = color => ['r', 'g', 'b', 'a'].map(key => Math.round(color[key] * 255).toString(16).padStart(2, '0')).join('');
const result = {
	skeleton: { spine: '3.6.38' },
	bones: data.bones.map(bone => ({ name: bone.name, ...(bone.parent && { parent: bone.parent.name }),
		x: bone.x, y: bone.y, rotation: bone.rotation, scaleX: bone.scaleX, scaleY: bone.scaleY, shearX: bone.shearX, shearY: bone.shearY })),
	slots: data.slots.map(slot => ({ name: slot.name, bone: slot.boneData.name, color: hex(slot.color),
		attachment: slot.attachmentName, blend: ['normal', 'additive', 'multiply', 'screen'][slot.blendMode] })),
	skins: {}, animations: {},
};
for (const skin of data.skins) {
	const attachments = {};
	for (const entry of skin.getAttachments()) {
		const a = entry.attachment;
		if (!(a instanceof spine.RegionAttachment)) throw new Error('Unsupported source attachment');
		(attachments[data.slots[entry.slotIndex].name] ||= {})[entry.name] = {
			type: 'region', path: a.path, x: a.x, y: a.y, rotation: a.rotation,
			scaleX: a.scaleX, scaleY: a.scaleY, width: a.width, height: a.height, color: hex(a.color),
		};
	}
	result.skins[skin.name] = attachments;
}
for (const animation of data.animations) {
	const converted = result.animations[animation.name] = { slots: {}, bones: {} };
	for (const timeline of animation.timelines) {
		let stride, type, values;
		if (timeline instanceof spine.AttachmentTimeline) {
			(converted.slots[data.slots[timeline.slotIndex].name] ||= {}).attachment =
				Array.from(timeline.frames, (time, i) => ({ time, name: timeline.attachmentNames[i] }));
			continue;
		}
		if (timeline instanceof spine.RGBATimeline) {
			stride = 5; type = 'color'; values = i => ({ color: hex(Object.fromEntries(['r', 'g', 'b', 'a'].map((key, j) => [key, timeline.frames[i + j + 1]]))) });
		} else if (timeline instanceof spine.RotateTimeline) {
			stride = 2; type = 'rotate'; values = i => ({ angle: timeline.frames[i + 1] });
		} else if (timeline instanceof spine.ScaleTimeline || timeline instanceof spine.TranslateTimeline) {
			stride = 3; type = timeline instanceof spine.ScaleTimeline ? 'scale' : 'translate';
			values = i => ({ x: timeline.frames[i + 1], y: timeline.frames[i + 2] });
		} else throw new Error('Unsupported source timeline: ' + timeline.constructor.name);
		const frames = [];
		for (let i = 0; i < timeline.frames.length; i += stride) {
			const curve = timeline.curves[i / stride];
			if (curve > 1) throw new Error('Source has a bezier curve; extend the converter first');
			frames.push({ time: timeline.frames[i], ...values(i), ...(curve === 1 && { curve: 'stepped' }) });
		}
		const target = timeline.slotIndex !== undefined ? (converted.slots[data.slots[timeline.slotIndex].name] ||= {})
			: (converted.bones[data.bones[timeline.boneIndex].name] ||= {});
		target[type] = frames;
	}
}
const atlas38 = [name + '.png', `size: ${atlas.pages[0].width},${atlas.pages[0].height}`, 'format: RGBA8888', 'filter: Linear,Linear', 'repeat: none'];
for (const r of atlas.regions) atlas38.push(r.name, `  rotate: ${r.degrees === 90}`, `  xy: ${r.x}, ${r.y}`,
	`  size: ${r.width}, ${r.height}`, `  orig: ${r.originalWidth}, ${r.originalHeight}`, `  offset: ${r.offsetX}, ${r.offsetY}`, '  index: -1');
fs.writeFileSync(new URL(name + '.atlas', root), atlas38.join('\n') + '\n');
fs.writeFileSync(new URL(name + '.json', root), JSON.stringify(result, null, '\t') + '\n');
const files = ['.atlas.txt', '.skel', '.png', '.atlas', '.json'].map(suffix => {
	const bytes = read(suffix);
	return { file: name + suffix, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
});
fs.writeFileSync(new URL('sources.json', root), JSON.stringify({
	source: 'E:/AI/sanguosha/sanguosha2/yoka.game_g_android_4.0.2.apk',
	path: '/res/assets/animate/game/seat/' + name,
	cacheKeys: { '.atlas.txt': 'cf0295ce', '.skel': '58c5e272', '.png': '33fb3847' },
	action: 'play', duration: data.animations[0].duration, sourceVersion: data.version,
	conversion: 'Serialization only: original transforms, keyframes, attachments, blending and texture pixels.', files,
}, null, '\t') + '\n');
console.log(`Imported ${name}: ${data.animations[0].duration}s, ${data.bones.length} bones, ${data.slots.length} slots`);
