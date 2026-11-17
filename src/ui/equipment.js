/** Original OL equipment artwork; only the compact equipment label is changed. */
// Vite resolves directory URLs without their trailing slash in development.
const assetRoot = new URL("../../assets/equipment/", import.meta.url).href.replace(/\/?$/, "/");
const types = { equip1: 3, equip2: 4, equip3: 5, equip4: 6, equip5: 7 };
const ranks = ["", "a", "2", "3", "4", "5", "6", "7", "8", "9", "10", "j", "q", "k"];
const compactNames = { zhuge: "诸葛弩", cixiong: "雌雄剑", bagua: "八卦" };
const observers = new WeakMap();
const partClasses = ["equip-icon", "equip-suit", "equip-number", "equip-name", "equip-range"];

export function refreshEquipmentDisplay(card, get) {
	const label = card?.node?.name2;
	if (!label) return;
	const subtype = get.subtype(card, false) || card.dataset.cardSubtype;
	if (!subtype?.startsWith("equip")) return;

	// These labels can contain a granted skill name or a disabled-slot message.
	// Keep the engine's text intact when it updates those special slots.
	if (/^(feichu_|empty_)/.test(card.name)) return;

	const doc = label.ownerDocument;
	const make = (className, text = "", resource) => {
		const span = doc.createElement("span");
		span.className = className;
		span.textContent = text;
		if (resource) span.style.backgroundImage = `url("${assetRoot}${resource}.png")`;
		return span;
	};
	const suit = card.suit;
	const hasSuit = ["spade", "heart", "club", "diamond"].includes(suit);
	const rank = ranks[Number(card.number)];
	const info = get.info(card, false) || {};
	let range = "";
	if (subtype === "equip1") range = String(1 - (info.distance?.attackFrom || 0));
	else if (subtype === "equip3" && info.distance?.globalTo) range = `+${info.distance.globalTo}`;
	else if (subtype === "equip4" && info.distance?.globalFrom) range = String(info.distance.globalFrom);
	const cardName = card.viewAs || card.name;
	let name = compactNames[cardName] || get.translation(cardName);
	if (card.classList.contains("fakeequip")) name = `[${name}]`;
	const signature = JSON.stringify([subtype, suit, rank, name, range]);
	// A subtree observer also receives our own writes. Leave an intact label alone
	// so native updates can be repaired without creating a mutation loop.
	if (label._hhEquipmentSignature === signature && label.children.length === partClasses.length
		&& partClasses.every((className, index) => label.children[index].className === className)
		&& label.children[3].textContent === name && label.children[4].textContent === range) return;

	const icon = make("equip-icon", "", types[subtype] ? `new_equip_type_${types[subtype]}_new` : undefined);
	const suitNode = make("equip-suit", hasSuit ? get.translation(suit) : "", hasSuit ? `other_equip_${suit}_new` : undefined);
	const numberNode = make("equip-number", hasSuit && rank ? rank.toUpperCase() : "", hasSuit && rank ? `other_equip_${suit === "heart" || suit === "diamond" ? "red" : "black"}_${rank}_new` : undefined);
	const nameNode = make("equip-name", name);
	const rangeNode = make("equip-range", range);
	label.replaceChildren(icon, suitNode, numberNode, nameNode, rangeNode);
	label.classList.add("hh-source-equipment");
	label.style.setProperty("--hh-equip-name-length", Math.max(1, Array.from(name).length));
	label.style.setProperty("--hh-equip-range-units", range ? (range.length > 1 ? "27" : "16") : "3");
	label.$name = nameNode;
	label._hhEquipmentSignature = signature;
}

export function refreshPlayerEquipment(player, get) {
	for (const card of player?.node?.equips?.childNodes || []) refreshEquipmentDisplay(card, get);
}

/** Native broadcast/reconnect code can replace name2 without calling our hooks. */
export function observePlayerEquipment(player, get, Observer = globalThis.MutationObserver) {
	const equips = player?.node?.equips;
	if (!equips || !Observer) return;
	if (observers.has(equips)) return observers.get(equips);
	const observer = new Observer(mutations => {
		const cards = new Set();
		for (const mutation of mutations) {
			if (mutation.target === equips) {
				for (const card of equips.childNodes) cards.add(card);
			} else {
				const target = mutation.target.nodeType === 1 ? mutation.target : mutation.target.parentElement;
				const card = target?.closest?.(".card");
				if (card?.parentNode === equips) cards.add(card);
			}
		}
		for (const card of cards) refreshEquipmentDisplay(card, get);
	});
	observer.observe(equips, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["data-suit", "data-card-subtype"] });
	observers.set(equips, observer);
	refreshPlayerEquipment(player, get);
	return observer;
}
