export const defaultBackground = "ext:HH优化/image/background/big_26.png";

export function getBackgroundImage(name) {
	return name.startsWith("ext:") ? `extension/${name.slice(4)}` : `image/background/${name}.jpg`;
}

export async function setupBackgrounds(lib, game, get) {
	const menu = lib.configMenu.appearence.config.image_background;
	if (!lib.config.hiddenBackgroundPack?.includes(defaultBackground)) {
		menu.item = { [defaultBackground]: "金色龙纹", ...menu.item };
	}
	menu.init = defaultBackground;
	const visualMenu = menu.visualMenu;
	menu.visualMenu = function (node, link, name, config) {
		if (link !== defaultBackground) return visualMenu.call(this, node, link, name, config);
		node.className = "button character";
		node.setBackgroundImage(getBackgroundImage(link));
		node.style.backgroundSize = "cover";
		if (node.firstChild) node.firstChild.innerHTML = get.verticalStr(name);
	};

	// Apply the new default once, then keep subsequent background choices.
	if (!lib.config.extension_HH优化_dragonBackgroundInstalled) {
		await game.promises.saveConfig("image_background", defaultBackground);
		lib.init.background();
		await game.promises.saveConfig("extension_HH优化_dragonBackgroundInstalled", true);
	}
}

export function refreshExtensionBackground(lib, game) {
	// Some engines only resolve ext: paths when updating, not during initial creation.
	if (lib.config.image_background === defaultBackground) game.updateBackground();
}
