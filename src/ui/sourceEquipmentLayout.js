// Classic client AMt.LayoutEquipCards, fns.UpdateCardFace and xUt.updateUI.
export const nativeEquipmentLayout = Object.freeze({ width: 146, rowHeight: 30, rows: 4 });

export function sourceEquipmentLayout(entries, available = {}) {
	const open = type => available[type] !== false && !entries.some(entry => entry.subtype === type || entry.subtypes?.includes(type));
	const defenseOpen = open("equip3"), attackOpen = open("equip4"), treasureOpen = open("equip5");
	const halfHorses = !defenseOpen && !attackOpen && !treasureOpen;
	const plan = entries.map(entry => {
		const type = entry.subtype, slot = Number(type?.slice(5));
		let row = slot === 1 ? 0 : slot === 2 ? 1 : slot === 3 ? 2 : 3, left = 0, width = 1;
		if (type === "equip3" || type === "equip4") {
			if (available.mountCombined || entry.subtypes?.includes("equip3") && entry.subtypes?.includes("equip4")) row = 2;
			else if (entry.status === "disabled" || entry.status === "skill") {
				width = treasureOpen ? 1 : .5;
				if (type === "equip4") { row = treasureOpen ? 3 : 2; left = treasureOpen ? 0 : .5; }
			} else {
				width = halfHorses ? .5 : 1;
				if (type === "equip4") {
					row = defenseOpen ? 2 : treasureOpen ? 3 : 2;
					left = defenseOpen || treasureOpen ? 0 : .5;
				}
			}
		}
		return { ...entry, row, left, width };
	});
	// Noname can expand a slot or add special equipment. Keep every real node selectable within four rows.
	for (let row = 0; row < 4; row++) {
		const items = plan.filter(item => item.row === row).sort((a, b) => a.left - b.left);
		const groups = new Map();
		for (const item of items) {
			const key = `${item.left}:${item.width}`;
			if (!groups.has(key)) groups.set(key, []);
			groups.get(key).push(item);
		}
		const lanes = [...groups.values()];
		const overlap = lanes.some((lane, i) => lanes.some((other, j) => j > i && lane[0].left < other[0].left + other[0].width && other[0].left < lane[0].left + lane[0].width));
		if (overlap) items.forEach((item, i) => { item.left = i / items.length; item.width = 1 / items.length; });
		else for (const lane of lanes) {
			const start = lane[0].left, width = lane[0].width / lane.length;
			lane.forEach((item, i) => { item.left = start + i * width; item.width = width; });
		}
	}
	return plan.map(item => ({ ...item, halfHorse: ["equip3", "equip4"].includes(item.subtype) && item.width < 1 }));
}
