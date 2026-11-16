import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { defaultSettings } from '../defaults.js';
import { getPlayerStyleSizing, playerStyleBaseline, playerFrameGeometry, playerGlowGeometry } from '../src/ui/playerStyleSizing.js';

const source = fs.readFileSync(new URL('../hh-features.js', import.meta.url), 'utf8');
const removed = ['player_border_width', 'glow_border_width', 'glow_border_left', 'hp_right_offset', 'border_left_offset', 'faction_left_offset', 'name_left_offset'];
function configuration() {
	const calls = [], lib = { config: { extension_HH优化_player_width: '136' } }, game = { hhSelectionCardLayout: { width: 136 }, saveConfig: (...args) => calls.push(args) }, window = { _speedControlUpdateStyle() { calls.push(['refresh']); } };
	const realm = vm.createContext({ lib, game, window, get: {}, ui: {}, ai: {}, _status: {}, getPlayerStyleSizing });
	vm.runInContext(source.replace(/^import .*;\r?\n/gm, '').replace('export function ', 'function ') + '\nglobalThis.options = createHHFeatures(lib, game, ui, get, ai, _status).config;', realm);
	return { ...realm, calls };
}

function rendered(width) {
	const sheet = { cssRules: [], insertRule(rule, index) { this.cssRules.splice(index, 0, rule); }, deleteRule(index) { this.cssRules.splice(index, 1); } };
	const style = {}, lib = { config: { extension_HH优化_player_width: width } }, glow = { sheet };
	// Previously saved independent controls must no longer affect appearance.
	for (const key of removed) lib.config['extension_HH优化_' + key] = '999';
	const document = { getElementById: () => glow, body: { appendChild() {} } }, window = {};
	const start = source.indexOf('const updateCustomStyle = function() {');
	const end = source.indexOf('// 初始化时应用样式', start);
	const code = source.slice(start, end) + '\nupdateCustomStyle();';
	vm.runInNewContext(code, { lib, document, window, customStyleEl: style, getPlayerStyleSizing, playerGlowGeometry, console });
	return { css: style.textContent, glow: sheet.cssRules };
}

test('the approved 136px appearance stays exact and only width remains in its settings group', () => {
	assert.deepEqual(playerStyleBaseline, { width: 136, borderWidth: 401, glowWidth: 220, glowLeft: -50, hpRight: 134, borderLeft: -15, factionLeft: 13, nameInset: 26 });
	const sizing = getPlayerStyleSizing(136);
	for (const [key, value] of Object.entries(playerStyleBaseline)) assert.equal(sizing[key], value, key);
	assert.equal(sizing.delta, 0); assert.equal(sizing.borderGrow, 0); assert.equal(sizing.borderShift, 0);
	const { options } = configuration(), keys = Object.keys(options);
	assert.deepEqual(keys.slice(keys.indexOf('ui_style_separator') + 1, keys.indexOf('ui_crop_separator')), ['player_width']);
	assert.equal(options.player_width.init, '136');
	for (const key of removed) { assert.equal(options[key], undefined); assert.equal(defaultSettings[key], undefined); }
});

test('width input saves just the width, refreshes styles and invalidates stale opening measurements', () => {
	const h = configuration(), input = { innerHTML: '160<br>' };
	h.options.player_width.onblur.call(input);
	assert.equal(input.innerHTML, 160); assert.equal(h.lib.config.extension_HH优化_player_width, '160');
	assert.equal(h.game.hhSelectionCardLayout, undefined); assert.deepEqual(h.calls, [['extension_HH优化_player_width', '160'], ['refresh']]);
	for (const [inputValue, expected] of [['500', 200], ['20', 80], ['invalid', 136]]) {
		input.innerHTML = inputValue; h.options.player_width.onblur.call(input); assert.equal(input.innerHTML, expected);
	}
});

test('live styles stretch the portrait area, ignore legacy overrides and retain height and the left column', () => {
	for (const width of [80, 136, 160, 200]) {
		const s = getPlayerStyleSizing(width), output = rendered(String(width));
		for (const [property, value, unit] of [['left', s.borderLeft + s.borderShift, 'px'], ['right', s.hpRight, 'px'], ['left', s.factionLeft, 'px'], ['left', s.nameInset, '%'], ['right', s.nameInset, '%']]) {
			assert.ok(output.css.includes(`${property}: ${value}${unit} !important;`), `${property} at width ${width}`);
		}
		assert.ok(output.css.includes(`--hh-configured-player-width: ${width}px;`));
		assert.ok(output.css.includes(`--hh-configured-hp-right: ${s.hpRight}px;`));
		const playerRule = output.css.slice(output.css.indexOf('/* 只修改宽度'), output.css.indexOf('/* 武将头像'));
		assert.ok(playerRule.includes('#arena.fewplayer')); assert.ok(playerRule.includes(`width: ${width}px !important;`));
		assert.equal(/height\s*:/.test(playerRule), false);
		assert.ok(output.css.includes(`width: calc(401% + ${s.borderGrow}px)`));
		assert.ok(output.glow.every(rule => rule.includes('transform-origin: left center') && !rule.includes('scaleY')));
		assert.equal(s.factionLeft, 13); assert.equal(s.nameInset, 26); assert.equal(width - s.hpRight, 2);
		assert.equal(width - s.armorLeft, 16);
	}
	assert.equal(getPlayerStyleSizing(undefined).width, 136); assert.equal(getPlayerStyleSizing('invalid').width, 136);
});

function cssArgument(text, name) {
	const start = text.indexOf(name + '(') + name.length + 1; assert.ok(start > name.length);
	let depth = 1, end = start;
	while (depth && end < text.length) { if (text[end] === '(') depth++; if (text[end] === ')') depth--; end++; }
	assert.equal(depth, 0); return text.slice(start, end - 1);
}

function cssNumber(text, variables = {}, percentBase = 0) {
	let value = text;
	while (/var\(/.test(value)) value = value.replace(/var\((--[\w-]+)\)/g, (_, key) => variables[key]);
	value = value.replace(/calc\(/g, '(').replace(/(-?[\d.]+)%/g, (_, n) => String(Number(n) * percentBase / 100)).replace(/px/g, '');
	assert.match(value, /^[\d.()+\-*/\s]+$/); return vm.runInNewContext(value);
}

test('faction, main and hidden names share the strip center at every card width', () => {
	const native = fs.readFileSync(new URL('../src/styles/player4.css', import.meta.url), 'utf8');
	const font = fs.readFileSync(new URL('../src/styles/source-general-font.css', import.meta.url), 'utf8');
	function declarations(css, selector) {
		const result = {};
		for (const [, selectors, body] of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
			if (!selectors.split(',').some(value => value.trim().replace(/^body\[data-style="onlineUI"\]\s+/, '') === selector)) continue;
			for (const entry of body.split(';')) {
				const colon = entry.indexOf(':'); if (colon < 0) continue;
				const key = entry.slice(0, colon).trim(), raw = entry.slice(colon + 1).trim();
				const important = raw.includes('!important'), value = raw.replace(/\s*!important/, '');
				if (!result[key]?.important || important) result[key] = { value, important };
			}
		}
		return Object.fromEntries(Object.entries(result).map(([key, item]) => [key, item.value]));
	}
	const campWidth = cssNumber(declarations(native, '.player > .camp-wrap').width);
	const strip = declarations(native, '.player > .camp-wrap > .camp-back');
	const stripCenter = (cssNumber(strip.left, {}, campWidth) + campWidth - cssNumber(strip.right, {}, campWidth)) / 2;
	for (const width of [80, 136, 160, 200]) {
		const faction = declarations(native + '\n' + font + '\n' + rendered(width).css, '.player > .camp-wrap > .camp-name');
		const factionLeft = cssNumber(faction.left, {}, campWidth);
		const factionWidth = faction.width === 'auto' ? campWidth - factionLeft - cssNumber(faction.right, {}, campWidth) : cssNumber(faction.width, {}, campWidth);
		const factionCenter = factionLeft + factionWidth / 2;
		assert.equal(faction['writing-mode'], 'vertical-rl', 'Faction and name text must use the same writing axis');
		assert.equal(faction['transform-origin'], 'center center', 'Enlarging the faction glyph must preserve its center');
		for (const name of ['avatar-name', 'avatar-name-default']) {
			const rule = declarations(native + '\n' + font + '\n' + rendered(width).css, '.player > .camp-wrap > .' + name);
			const left = cssNumber(rule.left, {}, campWidth), lineWidth = cssNumber(rule['line-height']);
			const nameWidth = rule.width === 'auto' ? campWidth - left - cssNumber(rule.right, {}, campWidth) : cssNumber(rule.width);
			// In vertical-rl, flex-start aligns the line box to the right edge.
			const center = left + (rule['align-items'] === 'center' ? nameWidth / 2 : nameWidth - lineWidth / 2);
			for (const scale of [.5, 1, 1.4]) {
				assert.ok(Math.abs((center - stripCenter) * scale) < 1e-8, `${name} drifts at width ${width}, scale ${scale}`);
				assert.ok(Math.abs((center - factionCenter) * scale) < 1e-8, `Faction and ${name} differ at width ${width}, scale ${scale}`);
			}
			assert.ok(!rule.transform || rule.transform === 'none', 'Theme translations must not offset the centered name');
		}
	}
});

test('the OL frame visible rails keep their left anchor and gain exactly the card width delta', () => {
	const bytes = fs.readFileSync(new URL('../image/styles/decade/border_campOL5.png', import.meta.url));
	assert.equal(bytes.readUInt32BE(16), playerFrameGeometry.width); assert.equal(bytes.readUInt32BE(20), playerFrameGeometry.height);
	const baseWidth = 45 * 401 / 100, baseLeft = -13 - 15, { left, span } = playerFrameGeometry;
	const baseRails = [baseLeft + baseWidth * left / 228, baseLeft + baseWidth * (left + span) / 228];
	for (const width of [80, 136, 160, 200]) {
		const css = rendered(width).css, rule = css.split('.player > .camp-wrap > .camp-border {')[1].split('}')[0];
		const frameWidth = cssNumber(rule.match(/width:([^;]+)/)[1].replace('!important', ''), {}, 45);
		const frameLeft = -13 + cssNumber(rule.match(/left:([^;]+)/)[1].replace('!important', ''));
		const rails = [frameLeft + frameWidth * left / 228, frameLeft + frameWidth * (left + span) / 228];
		assert.ok(Math.abs(rails[0] - baseRails[0]) < 1e-8, `Left frame drift at ${width}`);
		assert.ok(Math.abs(rails[1] - baseRails[1] - (width - 136)) < 1e-8, `Right frame drift at ${width}`);
	}
});

test('visible glow rails stay aligned for turn, selection and target sprites as width changes', () => {
	const baseScale = 220 / 228, nativeWidth = 228;
	const cases = [
		{ selector: '#arena[data-new-decade-style="onlineUI"] > .player::before', file: 'sprites_shadow_green1.png', left: 50, span: 140, nativeLeft: -62 },
		{ selector: '#arena[data-new-decade-style="onlineUI"] > .player:not([data-position="0"])::after', file: 'sprites_shadow_red.png', left: 76.5, span: 104, nativeLeft: -62 },
		{ selector: '#arena[data-new-decade-style="onlineUI"] > .player.selected:not(.target)::before', file: 'sprites_shadow_orange.png', left: 48.5, span: 143, nativeLeft: -62 },
	];
	for (const profile of cases) {
		const bytes = fs.readFileSync(new URL('../image/ui/effects/' + profile.file, import.meta.url));
		assert.equal(bytes.readUInt32BE(16), playerGlowGeometry.spriteWidth);
		const sourceLeft = profile.left * 253 / 240, sourceRight = (profile.left + profile.span) * 253 / 240;
		const baseTranslation = nativeWidth / 2 * (1 - baseScale) + 5;
		const baseRails = [profile.nativeLeft + baseTranslation + sourceLeft * baseScale, profile.nativeLeft + baseTranslation + sourceRight * baseScale];
		for (const width of [80, 136, 160, 200]) {
			const output = rendered(width), block = output.css.split(profile.selector)[1].split('{')[1].split('}')[0];
			const variables = { '--hh-glow-edge-left': Number(block.match(/--hh-glow-edge-left: ([\d.]+)/)[1]), '--hh-glow-edge-span': Number(block.match(/--hh-glow-edge-span: ([\d.]+)/)[1]) };
			assert.equal(variables['--hh-glow-edge-left'], profile.left); assert.equal(variables['--hh-glow-edge-span'], profile.span);
			const transform = output.glow[0], scale = cssNumber(cssArgument(transform, 'scaleX'), variables), translation = cssNumber(cssArgument(transform, 'translateX'), variables, nativeWidth);
			assert.ok(Math.abs(profile.nativeLeft + translation + sourceLeft * scale - baseRails[0]) < 1e-8, `${profile.file} left drift at ${width}`);
			assert.ok(Math.abs(profile.nativeLeft + translation + sourceRight * scale - baseRails[1] - (width - 136)) < 1e-8, `${profile.file} right drift at ${width}`);
		}
	}
});

test('single portraits keep both baseline insets without gaps and double portraits retain their own rules', () => {
	const baseRight = 136 - 20 - 136 * .849;
	for (const width of [80, 136, 160, 200]) {
		const css = rendered(width).css, rule = css.split('/* Fixed portrait insets;')[1].split('}')[0];
		assert.ok(rule.includes(':not(.fullskin2):not(.double-character)'));
		assert.match(rule, /width: auto !important/);
		const right = Number(rule.match(/right: ([\d.]+)px/)[1]);
		assert.ok(Math.abs(right - baseRight) < 1e-8); assert.ok(width - right - 20 > 0);
	}
});

test('preview health anchor follows live width changes and stays fixed when only the viewport changes', () => {
	const css = fs.readFileSync(new URL('../src/styles/selection-player.css', import.meta.url), 'utf8');
	const rule = css.split('.player.hh-selection-player>.hp-wrap {')[1].split('}')[0];
	assert.match(rule, /left:auto!important/);
	const expression = rule.split('right:')[1].split('!important')[0];
	function evaluate(variables) {
		let value = expression;
		while (/var\(/.test(value)) value = value.replace(/var\((--[\w-]+)(?:,\s*([^()]+))?\)/g, (_, key, fallback) => variables[key] ?? fallback);
		value = value.replace(/calc\(/g, '(').replace(/px/g, ''); assert.match(value, /^[\d.()+\-*/\s]+$/); return vm.runInNewContext(value);
	}
	for (const configured of [80, 136, 160, 200]) {
		const s = getPlayerStyleSizing(configured); let baseline;
		for (const actualWidth of [120, 136, 180]) {
			const right = evaluate({ '--hh-player-width': actualWidth, '--hh-configured-player-width': configured, '--hh-configured-hp-right': s.hpRight });
			const anchor = actualWidth - right;
			if (baseline === undefined) baseline = anchor;
			assert.ok(Math.abs(anchor - baseline) < 1e-9);
			assert.ok(Math.abs(anchor - (configured - s.hpRight)) < 1e-9);
		}
	}
});

test('opening selection keeps native health content width despite the surrounding border-box reset', () => {
	const shared = fs.readFileSync(new URL('../src/styles/selection-player.css', import.meta.url), 'utf8');
	const selection = fs.readFileSync(new URL('../identity-selection.css', import.meta.url), 'utf8');
	const native = fs.readFileSync(new URL('../src/styles/player4.css', import.meta.url), 'utf8');
	// Resolve the actual matching box-sizing rules in import order. The target wrapper
	// has a player ancestor inside the fullscreen root, as in the real chooseButton dialog.
	const target = new Set(['hp-wrap']), ancestors = [new Set(['player', 'fullskin', 'hh-selection-player']), new Set(['hh-identity-selection'])];
	function matches(selector) {
		const parts = selector.trim().split(/\s*>\s*|\s+/), groups = [target, ...ancestors]; let index = 0;
		for (const part of parts.reverse()) {
			const classes = [...part.matchAll(/\.([\w-]+)/g)].map(match => match[1]);
			if (index === 0) { if (!classes.every(cls => target.has(cls))) return false; index++; continue; }
			while (index < groups.length && !classes.every(cls => groups[index].has(cls))) index++;
			if (index === groups.length) return false; index++;
		}
		return true;
	}
	const candidates = [];
	for (const [, selectors, body] of (shared + '\n' + selection).replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
		const declaration = body.match(/box-sizing:\s*(content-box|border-box)(\s*!important)?/);
		if (!declaration) continue;
		for (const selector of selectors.split(',')) if (matches(selector)) candidates.push({ value: declaration[1], score: (declaration[2] ? 10000 : 0) + [...selector.matchAll(/\.[\w-]+/g)].length });
	}
	const computed = candidates.sort((a, b) => a.score - b.score).at(-1)?.value;
	assert.equal(computed, 'content-box', 'The fullscreen reset must not shrink the bordered health wrapper');
	const nativeWrap = native.split('.player > .hp-wrap {')[1].split('}')[0], nativeHealth = native.split('#window > .player:not(.minskin) .hp {')[1].split('}')[0];
	const contentWidth = Number(nativeWrap.match(/\bwidth:\s*([\d.]+)px/)[1]);
	const borders = nativeWrap.match(/border-width:\s*([\d.]+)px ([\d.]+)px ([\d.]+)px ([\d.]+)px/).slice(1).map(Number);
	const hpLeft = Number(nativeHealth.match(/\bleft:\s*([\d.]+)px/)[1]);
	const outerWidth = computed === 'content-box' ? contentWidth + borders[1] + borders[3] : Math.max(contentWidth, borders[1] + borders[3]);
	for (const width of [80, 136, 160, 200]) for (const scale of [.5, 1, 1.4]) {
		const sizing = getPlayerStyleSizing(width);
		const pointLeft = width - sizing.hpRight - outerWidth + borders[3] + hpLeft;
		assert.ok(Math.abs(pointLeft * scale - 2 * scale) < 1e-8, `Health shifted into the portrait at width ${width}, scale ${scale}`);
	}
});
