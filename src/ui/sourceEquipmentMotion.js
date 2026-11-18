// Classic identity-client defaults: VUt / GMt / AMt / Yki in the original main.js.
export const nativeEquipmentMotion = Object.freeze({
	seatWidth: 174, seatHeight: 232, cardWidth: 126, cardHeight: 174,
	equipWidth: 146, equipInset: 27,
	popScale: 1.2, popOffsetRatio: 0.1, endScale: 0.1,
	popMs: 200, selfPopMs: 267, shrinkMs: 200, selfShrinkMs: 267,
	rise: 15, selfRise: 30, slideMs: 300, watchdogMs: 1500,
});

export function equipmentMotionPlan(player, width, height, self = false) {
	const n = nativeEquipmentMotion;
	const unit = Math.min(player.width / n.seatWidth, player.height / n.seatHeight);
	const scale = Math.min(n.cardWidth * unit / width, n.cardHeight * unit / height);
	const initial = { x: player.left + (player.width - width * scale) / 2, y: player.top + (player.height - height * scale) / 2, scale };
	return {
		initial,
		popup: { x: initial.x - n.cardWidth * n.popOffsetRatio * unit, y: initial.y - (n.cardHeight * n.popOffsetRatio + (self ? n.selfRise : n.rise)) * unit, scale: scale * n.popScale },
		popMs: self ? n.selfPopMs : n.popMs,
		shrinkMs: self ? n.selfShrinkMs : n.shrinkMs,
		endScale: scale * n.endScale,
	};
}

export function equipmentArrivalPose(slot, height, scale) {
	const n = nativeEquipmentMotion;
	return { x: slot.left - slot.width * n.equipInset / n.equipWidth, y: slot.top + (slot.height - height * scale) / 2, scale };
}

export const equipmentPoseTransform = pose => `translate(${pose.x}px,${pose.y}px) scale(${pose.scale})`;

// Sample the original sineOut formula; position and scale share the same progress.
export function equipmentMotionFrames(from, to, sineOut = false) {
	const steps = sineOut ? 30 : 1;
	return Array.from({ length: steps + 1 }, (_, index) => {
		const offset = index / steps, t = sineOut ? Math.sin(offset * Math.PI / 2) : offset;
		const pose = Object.fromEntries(["x", "y", "scale"].map(key => [key, from[key] + (to[key] - from[key]) * t]));
		return { offset, transform: equipmentPoseTransform(pose) };
	});
}
