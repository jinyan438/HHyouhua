import { sourceEquipmentLayout } from "./sourceEquipmentLayout.js";

/** Original OL equipment artwork and four-row seat layout. */
// Vite resolves directory URLs without their trailing slash in development.
const assetRoot = new URL("../../assets/equipment/", import.meta.url).href.replace(/\/?$/, "/");
const types = { equip1: 3, equip2: 4, equip3: 5, equip4: 6, equip5: 7 };
const ranks = ["", "a", "2", "3", "4", "5", "6", "7", "8", "9", "10", "j", "q", "k"];
const compactNames = { zhuge: "诸葛弩", cixiong: "雌雄剑", bagua: "八卦" };
const observers = new WeakMap();
const partClasses = ["equip-icon", "equip-suit", "equip-number", "equip-name", "equip-range"];

function equipmentSubtype(card, get) {
	const special = card.name?.match(/^(?:feichu_|empty_)equip(\d+)/);
	return special ? `equip${special[1]}` : get.subtypes?.(card, false)?.[0] || get.subtype(card, false) || card.dataset?.cardSubtype;
}

function refreshSlotDisplay(card, get, subtype) {
	const label = card.node.name2, disabled = card.name?.startsWith("feichu_") && !card.extraEquip;
	const own = label._hhSlotSignature && label.children.length === 2 && label.children[0].className === "equip-icon"
		&& label.children[1].className === "equip-slot-text" && label.children[1].textContent === label._hhSlotText;
	const original = own ? label._hhSlotOriginal : label.textContent || "";
	const text = disabled ? `废除${subtype === "equip3" ? "+1" : subtype === "equip4" ? "−1" : ""}` : original;
	const signature = JSON.stringify([subtype, text, original]);
	if (own && label._hhSlotSignature === signature) return;
	const icon = label.ownerDocument.createElement("span"), content = label.ownerDocument.createElement("span");
	icon.className = "equip-icon"; icon.style.backgroundImage = `url("${assetRoot}new_equip_type_${types[subtype] || 7}_new.png")`;
	content.className = "equip-slot-text"; content.textContent = text;
	label.replaceChildren(icon, content); label.classList.add("hh-source-equipment", "hh-source-equipment-slot");
	label.style.setProperty("--hh-equip-name-length", Math.max(1, Array.from(text).length));
	label._hhSlotSignature = signature; label._hhSlotText = text; label._hhSlotOriginal = original;
}

export function refreshEquipmentDisplay(card, get) {
	const label = card?.node?.name2;
	if (!label) return;
	const subtype = equipmentSubtype(card, get);
	if (!subtype?.startsWith("equip")) return;

	if (/^(feichu_|empty_)/.test(card.name)) { refreshSlotDisplay(card, get, subtype); return; }

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
	const signature = JSON.stringify([subtype, suit, rank, name, range, "four-row"]);
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
	const modifier = range.match(/^([+-])(\d+)$/);
	if (modifier) rangeNode.replaceChildren(make("equip-modifier", modifier[1]), make("equip-distance", modifier[2]));
	label.replaceChildren(icon, suitNode, numberNode, nameNode, rangeNode);
	label.classList.add("hh-source-equipment");
	label.style.setProperty("--hh-equip-name-length", Math.max(1, Array.from(name).length));
	label.style.setProperty("--hh-equip-range-units", range ? (range.length > 1 ? "27" : "16") : "3");
	label.style.setProperty("--hh-equip-distance-x", subtype === "equip4" ? "9" : "11");
	label.$name = nameNode;
	label._hhEquipmentSignature = signature;
}

export function refreshPlayerEquipment(player, get) {
	for (const card of player?.node?.equips?.childNodes || []) refreshEquipmentDisplay(card, get);
	refreshEquipmentLayout(player, get);
}

export function refreshEquipmentLayout(player, get) {
	const equips = player?.node?.equips;
	if (!equips?.classList || !equips.style) return;
	if (!equips.classList.contains("hh-source-equipment-layout")) equips.classList.add("hh-source-equipment-layout");
	const cards = Array.from(equips.childNodes).filter(card => card.node?.name2 && equipmentSubtype(card, get)?.startsWith("equip"));
	const entries = cards.filter(card => !card.classList.contains("hidden") && (!/^empty_equip\d+$/.test(card.name) || card.extraEquip)).map(card => ({
		card, subtype: equipmentSubtype(card, get), subtypes: get.subtypes?.(card, false),
		status: card.extraEquip || card.name?.startsWith("empty_") ? "skill" : card.name?.startsWith("feichu_") ? "disabled" : "card",
	}));
	const available = {};
	available.mountCombined = get.is?.mountCombined?.() === true;
	for (const type of ["equip3", "equip4", "equip5"]) {
		if (typeof player.hasEnabledSlot === "function") available[type] = player.hasEnabledSlot(type);
		else if (player.disabledSlots?.[type]) available[type] = false;
	}
	const plan = sourceEquipmentLayout(entries, available), positions = new Map(plan.map(item => [item.card, item]));
	const property = (style, key, value) => { if (style.getPropertyValue(key) !== value) style.setProperty(key, value); };
	for (const card of cards) {
		const item = positions.get(card);
		const mode = !item ? "empty" : item.halfHorse ? "horse" : item.width < 1 ? "compact" : "full";
		if (card.dataset.hhEquipLayout !== mode) card.dataset.hhEquipLayout = mode;
		if (!item) continue;
		property(card.style, "--hh-equip-row", String(item.row));
		property(card.style, "--hh-equip-left", `${item.left * 100}%`);
		property(card.style, "--hh-equip-width", `${item.width * 100}%`);
		property(card.style, "--hh-equip-share", String(Math.min(1, item.width * 2)));
		property(card.style, "--hh-equip-fraction", String(item.width));
		property(card.style, "--hh-equip-bg-left", item.left === 0 ? "-2px" : "0px");
		property(card.style, "--hh-equip-bg-right", item.left + item.width >= .9999 ? "-2px" : "0px");
	}
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
		refreshEquipmentLayout(player, get);
	});
	observer.observe(equips, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["data-suit", "data-card-subtype", "class"] });
	observers.set(equips, observer);
	refreshPlayerEquipment(player, get);
	return observer;
}
