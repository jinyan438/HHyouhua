// Original client: ZP.M_CARD_SIZE, Rns.layout, xvi.computeHandCard and GMt.layoutStackCardUis.
export const originalCardLayout = Object.freeze({ width: 126, height: 174, designHeight: 750, handGap: 0, centralScale: 0.87, centralGap: 5 });
export const originalHandScale = 174 / 750;
export const originalDiscardScale = originalHandScale * originalCardLayout.centralScale;

// Keep the previous appearance controls dormant while the original style is authoritative.
export const originalCardStylePriority = true;
export const originalCardConfig = Object.freeze({
	cardScale: originalHandScale,
	discardScale: originalDiscardScale,
	cardkmh: "off",
	cardbj: null,
	enable_online_card_replace: false,
	enable_card_suit_color: false,
	enable_card_suit_blur: false,
	enable_card_suit_image: false,
	enable_card_rank_image: false,
	suit_num_top: "0",
	suit_num_left: "0",
});

export function prioritizeOriginalCardMenu(menu) {
	if (originalCardStylePriority) {
		for (const key of [...Object.keys(originalCardConfig), "cardPrettify", "handFoldMin", "card_suit_blur", "card_suit_image_size", "card_rank_image_height"]) delete menu[key];
	}
	return menu;
}

export const originalCardNames = new Set([
	"sha", "shan", "tao", "bagua", "jueying", "dilu", "zhuahuang", "chitu", "dawan", "zixin", "zhuge", "cixiong", "qinggang", "qinglong", "zhangba", "guanshi", "fangtian", "qilin",
	"wugu", "taoyuan", "nanman", "wanjian", "wuzhong", "juedou", "shunshou", "guohe", "jiedao", "wuxie", "lebu", "shandian", "hanbing", "renwang",
	"jiu", "hualiu", "baiyin", "tengjia", "guding", "zhuque", "huogong", "tiesuo", "bingliang", "muniu",
]);

export function originalCardFilename(name, nature) {
	if (!originalCardNames.has(name)) return null;
	if (name !== "sha" || !nature || (Array.isArray(nature) && !nature.length)) return name;
	const natures = Array.isArray(nature) ? nature : String(nature).split("|");
	return natures.length === 1 && ["fire", "thunder", "ice"].includes(natures[0]) ? `sha_${natures[0]}` : null;
}

export function applyOriginalGlyphs(node, suit, number, assetURL = "") {
	if (!node) return;
	const numberNode = node.$num || node.querySelector("span:first-child");
	const suitNode = node.$suit || node.querySelector(".suit");
	const validSuit = ["spade", "heart", "club", "diamond"].includes(suit);
	const rank = ({ 1: "a", 11: "j", 12: "q", 13: "k" })[number] || String(number);
	const color = suit === "heart" || suit === "diamond" ? "red" : "black";
	for (const [element, file] of [[numberNode, validSuit && Number.isInteger(Number(number)) && number >= 1 && number <= 13 ? `${color}_${rank}` : null], [suitNode, validSuit ? suit : null]]) {
		if (!element) continue;
		if (file) {
			element.dataset.sourceGlyph = "true";
			element.style.backgroundImage = `url("${assetURL}extension/HH优化/assets/original-cards/${file}.png")`;
		} else {
			delete element.dataset.sourceGlyph;
			element.style.removeProperty("background-image");
		}
	}
}

export function applyOriginalCardFace(element, card, assetURL = "") {
	const [suit, number, name, nature] = Array.isArray(card) ? card : [card.suit, card.number, card.name, card.nature];
	const filename = originalCardFilename(name, nature);
	element.classList.toggle("hh-original-card", !!filename);
	if (!filename) {
		applyOriginalGlyphs(element.$suitnum || element.querySelector(".suit-num"), null, null, assetURL);
		return false;
	}
	element.classList.add("decade-card");
	element.style.backgroundImage = `url("${assetURL}extension/HH优化/assets/original-cards/${filename}.png")`;
	applyOriginalGlyphs(element.$suitnum || element.querySelector(".suit-num"), suit, number, assetURL);
	return true;
}

// CSS cards scale about their centre; layout coordinates describe the visible top-left.
export function originalHandRow(count, width, cardWidth) {
	const step = count > 1 ? Math.max(0, Math.min(cardWidth, (width - cardWidth) / (count - 1))) : 0;
	return { step, width: count ? cardWidth + step * (count - 1) : 0 };
}

export function originalCentralRow(count, width, cardWidth, unit) {
	const total = count * cardWidth;
	return total > width
		? { start: 0, step: count > 1 ? (width - cardWidth) / (count - 1) : 0 }
		: { start: (width - total) / 2, step: cardWidth + originalCardLayout.centralGap * unit };
}

export async function migrateOriginalCardLayout(lib, game) {
	const prefix = "extension_HH优化_";
	if (!originalCardStylePriority) return;
	for (const [setting, value] of Object.entries(originalCardConfig)) {
		const key = prefix + setting;
		if (lib.config[key] === value) continue;
		await game.promises.saveConfig(key, value);
		lib.config[key] = value;
	}
	if (lib.config[prefix + "originalCardLayoutVersion"] !== 2) {
		await game.promises.saveConfig(prefix + "originalCardLayoutVersion", 2);
	}
}
