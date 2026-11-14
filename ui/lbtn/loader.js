/**
 * @fileoverview Lbtn模块加载器
 */
import { lib, game, ui, get, ai, _status } from "noname";
import { createLbtnPlugin } from "./plugin.js";
import { registerPlugin } from "../utils.js";

createLbtnPlugin(window.lib, window.game, window.ui, window.get, window.ai, window._status, window.app)
	.then(registerPlugin)
	.catch(e => console.error("[HH优化] Lbtn模块加载失败:", e));
