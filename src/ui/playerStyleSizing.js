// Preserve the approved left column; changing width stretches the portrait area.
export const playerStyleBaseline = Object.freeze({
	width: 136, height: 180, borderWidth: 401,
	hpRight: 134, borderLeft: -15, factionLeft: 13, nameInset: 26,
});

// OL frames are 228px wide. Their vertical frame rails lie at x=32.5 and 203.5,
// leaving a 171px visible span; transparent padding must grow along with the image.
export const playerFrameGeometry = Object.freeze({ width: 228, height: 288, left: 32.5, span: 171 });
// All four OL seat effects share the same baked portrait occlusion and rails.
export const playerGlowGeometry = Object.freeze({ spriteWidth: 2560, frameWidth: 256, frameHeight: 256, left: 80, span: 95, bottom: 204, outset: 2, rightOutset: 3, displayHeight: 340 * 183 / 184, displayTop: -86.9375 * 183 / 184 - 2 });

const portraitRight = { on: 0, off: 3.08, othersOff: .96, onlineUI: .536, babysha: 0, codename: 0 };
const frameHeightOrigin = { onlineUI: 30, othersOff: 17, codename: 26 };

export function getPlayerStyleSizing(value, style = 'onlineUI', heightValue) {
	const parsed = parseInt(value);
	const width = Number.isFinite(parsed) ? Math.max(80, Math.min(200, parsed)) : playerStyleBaseline.width;
	const parsedHeight = parseInt(heightValue);
	const height = Number.isFinite(parsedHeight) ? Math.max(120, Math.min(300, parsedHeight)) : playerStyleBaseline.height;
	const heightScale = height / playerStyleBaseline.height;
	// Preserve the 2px top and 1px bottom glow outsets while extending the card body.
	const glowHeightScale = (height + 3) / (playerStyleBaseline.height + 3);
	const scale = width / playerStyleBaseline.width;
	const delta = width - playerStyleBaseline.width;
	const online = style === 'onlineUI';
	const glowSpan = 135.3375 + delta + playerGlowGeometry.outset + playerGlowGeometry.rightOutset;
	return {
		...playerStyleBaseline, width, height, scale, delta, heightScale,
		heightDelta: height - playerStyleBaseline.height,
		frameHeightScale: Object.hasOwn(frameHeightOrigin, style) ? heightScale : 1,
		frameHeightOrigin: frameHeightOrigin[style] ?? 0,
		sourceGlowWidth: glowSpan * playerGlowGeometry.frameWidth / playerGlowGeometry.span,
		sourceGlowLeft: -2.277960526315791 - playerGlowGeometry.outset - glowSpan * playerGlowGeometry.left / playerGlowGeometry.span,
		sourceGlowHeight: playerGlowGeometry.displayHeight * glowHeightScale,
		sourceGlowTop: (playerGlowGeometry.displayTop + 2) * glowHeightScale - 2,
		targetGlowHeight: 448 * glowHeightScale,
		targetGlowTop: (-104.25 + 2) * glowHeightScale - 2,
		hpRight: playerStyleBaseline.hpRight + delta,
		borderGrow: delta * (online ? playerFrameGeometry.width / playerFrameGeometry.span : 1),
		borderShift: online && delta ? -delta * playerFrameGeometry.left / playerFrameGeometry.span : 0,
		portraitRight: portraitRight[style] ?? portraitRight.onlineUI,
		armorLeft: 120 + delta,
	};
}

// Shared by live players and the splash catalog before gameplay styles initialize.
export function getPlayerStyleCss(sizing, scope = '') {
	const player = `${scope ? scope + ' ' : ''}.player`;
	return `
	${player} {
		--hh-configured-player-width: ${sizing.width}px;
		--hh-configured-player-height: ${sizing.height}px;
		--hh-source-glow-width: ${sizing.sourceGlowWidth}px;
		--hh-source-glow-left: ${sizing.sourceGlowLeft}px;
		--hh-source-glow-height: ${sizing.sourceGlowHeight}px;
		--hh-source-glow-top: ${sizing.sourceGlowTop}px;
		--hh-target-glow-height: ${sizing.targetGlowHeight}px;
		--hh-target-glow-top: ${sizing.targetGlowTop}px;
		--hh-configured-hp-right: ${sizing.hpRight}px;
	}
	/* 覆盖HH优化所有样式的武将宽度 */
	#arena[data-new-decade-style="onlineUI"] > ${player} {
		--w: ${sizing.width}px !important;
	}
	#arena[data-new-decade-style="on"] > ${player},
	#arena[data-new-decade-style="off"] > ${player},
	#arena[data-new-decade-style="othersOff"] > ${player},
	#arena[data-new-decade-style="babysha"] > ${player},
	#arena[data-new-decade-style="codename"] > ${player} {
		--w: ${sizing.width}px !important;
	}
	/* 武将牌宽高独立设置，覆盖各主题及人数布局 */
	#arena.fewplayer > ${player}:not(.minskin),
	#arena:not(.fewplayer) > ${player}:not(.minskin),
	#arena:not(.fewplayer):not(*[data-player_height=""]) > ${player}:not(.minskin) {
		width: ${sizing.width}px !important;
		height: ${sizing.height}px !important;
	}
	/* 武将头像使用cover填充，保持图片不变形 */
	${player} > .primary-avatar,
	${player} > .deputy-avatar {
		background-size: cover !important;
		background-position: center top !important;
		background-repeat: no-repeat !important;
	}
	/* Fixed portrait insets; percentage widths otherwise leave a gap when widened. */
	${player}:not(.fullskin2):not(.double-character):not(.double):not([data-double="1"]):not([data-mode="guozhan"]) > .primary-avatar {
		width: auto !important;
		right: ${sizing.portraitRight}px !important;
	}
	/* 调整HP勾玉位置 */
	${player} > .hp-wrap {
		right: ${sizing.hpRight}px !important;
	}
	${player}[data-position="0"] > .hp-wrap {
		right: ${sizing.hpRight}px !important;
	}
	/* 调整护甲位置 */
	${scope ? scope + ' ' : ''}.hujia {
		left: ${sizing.armorLeft}px !important;
	}
	/* 覆盖HH优化 online样式的边框图片宽度和位置 */
	${player} > .camp-wrap > .camp-border {
		width: calc(${sizing.borderWidth}% + ${sizing.borderGrow}px) !important;
		left: ${sizing.borderLeft + sizing.borderShift}px !important;
		transform: scaleY(${sizing.frameHeightScale}) !important;
		transform-origin: 0 ${sizing.frameHeightOrigin}px !important;
	}
	body[data-style="onlineUI"] ${player} > .camp-wrap > .camp-back {
		bottom: calc(1% - ${sizing.heightDelta}px) !important;
	}
	#arena.decadeUI[data-border-level="one"] ${player} > .camp-wrap > .camp-border,
	#arena.decadeUI[data-border-level="two"] ${player} > .camp-wrap > .camp-border,
	#arena.decadeUI[data-border-level="three"] ${player} > .camp-wrap > .camp-border,
	#arena.decadeUI[data-border-level="four"] ${player} > .camp-wrap > .camp-border {
		width: calc(${sizing.borderWidth}% + ${sizing.borderGrow}px) !important;
		left: ${sizing.borderLeft + sizing.borderShift}px !important;
	}
	/* 调整势力标志位置 */
	${player} > .camp-wrap > .camp-name {
		left: ${sizing.factionLeft}px !important;
	}
	/* Share the same text column; image-based factions keep their theme geometry. */
	body[data-style="onlineUI"] ${player} > .camp-wrap > .camp-name,
	${player} > .camp-wrap > .avatar-name,
	${player} > .camp-wrap > .avatar-name-default {
		left: ${sizing.nameInset}% !important;
		right: ${sizing.nameInset}% !important;
		width: auto !important;
		align-items: center !important;
		writing-mode: vertical-rl !important;
	}
	${player} > .camp-wrap > .avatar-name,
	${player} > .camp-wrap > .avatar-name-default {
		transform: none !important;
	}
	`;
}
