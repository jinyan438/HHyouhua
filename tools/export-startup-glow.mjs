import fs from 'node:fs';
import assert from 'node:assert/strict';
import { spine } from '../src/libs/spine4-core.js';

// Decode the original skeletons with the bundled Spine 4.0 runtime. Only the
// additive light slot is exported; the lobby retains its reference-version icons.
const base = 'E:/AI/sanguosha/extract/unity';
const relative = 'assets/res/effect/spinecdn/temp/base/mainui';
const models = [
    ['activity', 'yd_dating_huodong_anniu', 'yd_dating_huodong_anniu'],
    ['common', 'yd_dating_giftsum_anniu', 'yd_dating_anniu_ty'],
];
const result = models.map(([name, folder, file]) => {
    const atlasPath = `${base}/text/${relative}/${folder}/${file}.atlas.txt`;
    const skeletonPath = `${base}/text/${relative}/${folder}/${file}.skel.bytes`;
    const texturePath = `${base}/texture/${relative}/${folder}/${file}.png`;
    const atlas = new spine.TextureAtlas(fs.readFileSync(atlasPath, 'utf8'));
    for (const page of atlas.pages) page.setTexture({ setFilters() {}, setWraps() {}, getImage: () => ({ width: page.width, height: page.height }) });
    const data = new spine.SkeletonBinary(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(new Uint8Array(fs.readFileSync(skeletonPath)));
    const animation = data.animations[0];
    const timeline = animation.timelines.find(t => t instanceof spine.AttachmentTimeline);
    assert.equal(data.version, '4.0.56');
    assert.equal(animation.duration, 2);
    assert.equal(timeline.frames.length, 31);
    assert.equal(timeline.attachmentNames[0], timeline.attachmentNames[30]);
    const skeleton = new spine.Skeleton(data);
    const frames = Array.from(timeline.frames).slice(0, -1).map((time, index) => {
        assert.ok(Math.abs(time - index / 15) < 1e-6);
        skeleton.setToSetupPose();
        animation.apply(skeleton, -1, time, false, [], 1, spine.MixBlend.setup, spine.MixDirection.mixIn);
        skeleton.updateWorldTransform();
        const draws = skeleton.drawOrder.filter(slot => slot.data.blendMode === spine.BlendMode.Additive).map(slot => {
            const attachment = slot.getAttachment();
            assert.ok(attachment instanceof spine.RegionAttachment);
            assert.equal(slot.color.a, 1);
            const vertices = new Float32Array(8);
            attachment.computeWorldVertices(slot.bone, vertices, 0, 2);
            return { vertices: Array.from(vertices), uvs: Array.from(attachment.uvs) };
        });
        assert.equal(draws.length, 1);
        return draws[0];
    });
    return { name, atlas: atlasPath, skeleton: skeletonPath, source: texturePath, version: data.version, animation: animation.name, duration_ms: 2000, fps: 15, frames };
});
process.stdout.write(JSON.stringify(result));
