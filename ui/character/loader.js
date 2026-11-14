/**
 * @fileoverview Character模块加载器
 */
import { lib, game, ui, get, ai, _status } from "noname";
import { createCharacterPlugin } from "./plugin.js";
import { registerPlugin } from "../utils.js";

createCharacterPlugin(window.lib, window.game, window.ui, window.get, window.ai, window._status, window.app)
	.then(registerPlugin)
	.catch(e => console.error("[HH优化] Character模块加载失败:", e));
