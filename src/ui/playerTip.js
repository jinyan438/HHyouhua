// Shared by the normal phase/card hints and the sequential rescue prompt.
export function createPlayerTip(lib, className, imageName, document = globalThis.document) {
	const image = document.createElement('img');
	image.className = `tipshow ${className}`;
	image.src = `${lib.assetURL || ''}extension/HH优化/ui/assets/lbtn/shoushatip/${imageName}`;
	const style = lib.config?.extension_HH优化_newDecadeStyle;
	image.style.cssText = style !== 'on' && style !== 'othersOff'
		? 'display:block;position:absolute;z-index:91;--w:133px;--h:calc(var(--w)*50/431);width:var(--w);height:var(--h);bottom:-22px;'
		: 'display:block;position:absolute;z-index:92;--w:129px;--h:calc(var(--w)*50/431);width:var(--w);height:var(--h);bottom:-20px;transform:scale(1.2);';
	return image;
}
