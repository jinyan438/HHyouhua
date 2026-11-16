// Preserve the approved left column; changing width stretches the portrait area.
export const playerStyleBaseline = Object.freeze({
	width: 136, borderWidth: 401, glowWidth: 220, glowLeft: -50,
	hpRight: 134, borderLeft: -15, factionLeft: 13, nameInset: 26,
});

// OL frames are 228px wide. Their vertical frame rails lie at x=32.5 and 203.5,
// leaving a 171px visible span; transparent padding must grow along with the image.
export const playerFrameGeometry = Object.freeze({ width: 228, height: 288, left: 32.5, span: 171 });
export const playerGlowGeometry = Object.freeze({ spriteWidth: 2400, frameWidth: 240, displayedFrameWidth: 253, canvasWidth: 228 });

const portraitRight = { on: 0, off: 3.08, othersOff: .96, onlineUI: .536, babysha: 0, codename: 0 };

export function getPlayerStyleSizing(value, style = 'onlineUI') {
	const parsed = parseInt(value);
	const width = Number.isFinite(parsed) ? Math.max(80, Math.min(200, parsed)) : playerStyleBaseline.width;
	const scale = width / playerStyleBaseline.width;
	const delta = width - playerStyleBaseline.width;
	const online = style === 'onlineUI';
	return {
		...playerStyleBaseline, width, scale, delta,
		hpRight: playerStyleBaseline.hpRight + delta,
		borderGrow: delta * (online ? playerFrameGeometry.width / playerFrameGeometry.span : 1),
		borderShift: online && delta ? -delta * playerFrameGeometry.left / playerFrameGeometry.span : 0,
		portraitRight: portraitRight[style] ?? portraitRight.onlineUI,
		armorLeft: 120 + delta,
	};
}
