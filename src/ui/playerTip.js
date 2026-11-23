// Shared by the normal phase/card hints and the sequential rescue prompt.
export function createPlayerTip(lib, className, imageName, document = globalThis.document, suffix = '') {
	const image = document.createElement('img');
	image.src = `${lib.assetURL || ''}extension/HH优化/ui/assets/lbtn/shoushatip/${imageName}`;
	const tip = suffix ? document.createElement('div') : image;
	tip.className = `tipshow ${className}`;
	const style = lib.config?.extension_HH优化_newDecadeStyle;
	tip.style.cssText = style !== 'on' && style !== 'othersOff'
		? 'display:block;position:absolute;z-index:91;--w:133px;--h:calc(var(--w)*50/431);width:var(--w);height:var(--h);bottom:-22px;'
		: 'display:block;position:absolute;z-index:92;--w:129px;--h:calc(var(--w)*50/431);width:var(--w);height:var(--h);bottom:-20px;transform:scale(1.2);';
	if (suffix) {
		image.alt = '';
		image.style.cssText = 'display:block;position:static;width:100%;height:auto;pointer-events:none;';
		const label = document.createElement('span');
		label.textContent = suffix;
		label.style.cssText = 'position:absolute;display:flex;align-items:center;left:100%;top:0;height:100%;white-space:nowrap;font:12px shousha,sans-serif;color:#ffe9b3;text-shadow:0 1px 2px #000;pointer-events:none;';
		tip.append(image, label);
	}
	return tip;
}
