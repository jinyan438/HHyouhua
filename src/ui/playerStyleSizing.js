// Preserve the approved left column; changing width stretches the portrait area.
export const playerStyleBaseline = Object.freeze({
	width: 136, borderWidth: 401,
	hpRight: 134, borderLeft: -15, factionLeft: 13, nameInset: 26,
});

// OL frames are 228px wide. Their vertical frame rails lie at x=32.5 and 203.5,
// leaving a 171px visible span; transparent padding must grow along with the image.
export const playerFrameGeometry = Object.freeze({ width: 228, height: 288, left: 32.5, span: 171 });
// All four OL seat effects share the same baked portrait occlusion and rails.
export const playerGlowGeometry = Object.freeze({ spriteWidth: 2560, frameWidth: 256, frameHeight: 256, left: 80, span: 95, bottom: 204, outset: 2, rightOutset: 3, displayHeight: 340 * 183 / 184, displayTop: -86.9375 * 183 / 184 - 2 });

const portraitRight = { on: 0, off: 3.08, othersOff: .96, onlineUI: .536, babysha: 0, codename: 0 };

export function getPlayerStyleSizing(value, style = 'onlineUI') {
	const parsed = parseInt(value);
	const width = Number.isFinite(parsed) ? Math.max(80, Math.min(200, parsed)) : playerStyleBaseline.width;
	const scale = width / playerStyleBaseline.width;
	const delta = width - playerStyleBaseline.width;
	const online = style === 'onlineUI';
	const glowSpan = 135.3375 + delta + playerGlowGeometry.outset + playerGlowGeometry.rightOutset;
	return {
		...playerStyleBaseline, width, scale, delta,
		sourceGlowWidth: glowSpan * playerGlowGeometry.frameWidth / playerGlowGeometry.span,
		sourceGlowLeft: -2.277960526315791 - playerGlowGeometry.outset - glowSpan * playerGlowGeometry.left / playerGlowGeometry.span,
		hpRight: playerStyleBaseline.hpRight + delta,
		borderGrow: delta * (online ? playerFrameGeometry.width / playerFrameGeometry.span : 1),
		borderShift: online && delta ? -delta * playerFrameGeometry.left / playerFrameGeometry.span : 0,
		portraitRight: portraitRight[style] ?? portraitRight.onlineUI,
		armorLeft: 120 + delta,
	};
}
