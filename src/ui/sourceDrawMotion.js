// Classic identity client: NMt / xvi / Yki / Zv / VUt in sanguosha2/work/main.js.
export const nativeDrawMotion = Object.freeze({
	cardWidth: 126, cardHeight: 174, seatWidth: 174, seatHeight: 232,
	deckGap: 26, arrivalGap: 16, seatSourceY: 20,
	stackCenterOffsetY: 15,
	handMs: 300, flyMs: 700, fadeDelayMs: 800, fadeMs: 400, watchdogMs: 2500,
	minBend: 200,
});
export const sineOut = t => Math.sin(t * Math.PI / 2);
export const drawTransform = p => `translate(${p.x}px,${p.y}px) scale(${p.scale})`;

// Each original move message keeps its FromID / FromZone / FromZoneParam batch.
export function groupDrawSources(sources) {
	const groups = [];
	sources.forEach((source, index) => {
		let group = groups.find(g => g.source === source.source && g.zone === source.zone && g.channel === source.channel);
		if (!group) groups.push(group = { source: source.source, zone: source.zone, channel: source.channel, indices: [] });
		group.indices.push(index);
	});
	return groups;
}

export function deckDrawPoints(arena, count, width, height, unit) {
	const gap = nativeDrawMotion.deckGap * unit;
	const start = (arena.width - width - gap * (count - 1)) / 2;
	return Array.from({ length: count }, (_, i) => ({ x: start + gap * i, y: (arena.height - height) / 2 }));
}

export function seatDrawPoints(seat, count, width, height, unit, arriving = false) {
	const gap = arriving ? nativeDrawMotion.arrivalGap * unit : 0;
	const start = seat.left + (seat.width - width - gap * (count - 1)) / 2;
	const y = seat.top + (arriving ? (seat.height - height) / 2 : nativeDrawMotion.seatSourceY * unit);
	return Array.from({ length: count }, (_, i) => ({ x: start + gap * i, y }));
}

export function drawControlPoint(start, end, arenaHeight, unit, seatToSeat = false) {
	if (!seatToSeat) return { x: end.x, y: end.y + nativeDrawMotion.cardWidth * unit };
	const dx = end.x - start.x, dy = end.y - start.y, length = Math.hypot(dx, dy);
	const middle = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
	if (!length) return middle;
	const ccw = start.x > end.x ? middle.y > arenaHeight / 2 : middle.y <= arenaHeight / 2;
	const distance = Math.max(length / 2, nativeDrawMotion.minBend * unit);
	return { x: middle.x + (ccw ? -dy : dy) / length * distance, y: middle.y + (ccw ? dx : -dx) / length * distance };
}

export function drawPosition(start, end, control, t) {
	const u = 1 - t;
	return {
		x: control ? u * u * start.x + 2 * u * t * control.x + t * t * end.x : start.x + (end.x - start.x) * t,
		y: control ? u * u * start.y + 2 * u * t * control.y + t * t * end.y : start.y + (end.y - start.y) * t,
		scale: start.scale + (end.scale - start.scale) * t,
	};
}

export function drawMotionFrames(start, end, control, hand = false, duration) {
	const n = nativeDrawMotion, moveMs = duration ?? (hand ? n.handMs : n.flyMs);
	const total = hand ? moveMs : n.fadeDelayMs + n.fadeMs;
	const frames = Array.from({ length: 31 }, (_, i) => {
		const time = moveMs * i / 30;
		return { offset: time / total, transform: drawTransform(drawPosition(start, end, control, sineOut(i / 30))), opacity: 1 };
	});
	if (!hand) for (let i = 0; i <= 30; i++) frames.push({
		offset: (n.fadeDelayMs + n.fadeMs * i / 30) / total,
		transform: drawTransform(end), opacity: 1 - sineOut(i / 30),
	});
	return { frames, duration: total };
}
