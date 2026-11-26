# MVP 结算

开启“扩展 → HH优化 → 启用MVP结算画面”，游戏结束后显示全屏结算。展示当前对局 MVP 的武将皮肤、昵称及总评分，点击画面或按 Esc、Enter 返回战绩。沿用客户端 1.5 秒防误触；战绩下方的“全场最佳”可重新打开。

画面采用用户本地 `E:\AI\sanguosha` 客户端的 `GameMvpWindow` 常规皮肤分支：421 × 540 武将图居中，循环播放 `FX_PaiJu_JieSuan_kuang`，右侧播放一次 `FX_PaiJu_JieSuan_QCZJ` 并保留标题，分数与资料栏按原版位置排列。宽屏、手机横屏按比例适配，竖屏改为上下排列。

原始 Spine 4.0.56 骨骼、图集描述、图集纹理、背景及 `ui_quanchangzuijia.ogg` 直接从本地 APK 缓存提取；资料栏、静态标题和备用边框从原图集无损裁切。11 个文件约 5.52 MiB，位于 `assets/mvp-fullscreen/`，`sources.json` 记录原始路径、缓存键、裁切范围、字节数和 SHA-256。`tools/import-mvp.py` 可重复导入。

原窗口代码位于 `sanguosha2/work/main.js` 的 `class T4i`，注册名为 `GameMvpWindow`；主要参考 `initUI`、`loadGeneralRes`、`playGeneralSpine`、`addImgClick` 与 `CloseWindow`。原客户端的 MVP 及分数由服务器提供，因此本地沿用 HH 原有攻击、治疗、辅助、局势和惩罚计分，显示值为技术分除以 10，保留一位小数。终局快照包括阵亡角色，敌友查询使用本体 `includeDie` 参数，不临时替换 `game.players`，重新查看不重复累计局势分。

本机玩家获得 MVP 时记录本月次数，AI 和录像不累计；次数从本次替换后开始记录。未接入的官方官阶、点赞、微信分享及服务器次数不伪造。当前武将画像直接使用对局皮肤，支持扩展武将和 DB/blob 图片。

音频采用原始 MVP 播报音效，随后播放当前武将的一条技能语音，遵守游戏音量和语音开关。原窗口没有独立的 MVP 背景音乐切换逻辑，游戏背景音乐继续按原设置播放。旧 `asqx.mp3` 及旧 MVP 图片保留，但新入口不再引用。

`src/ui/mvpSettlement.js` 负责终局快照、资料、次数和交互，`src/effects/mvpEffects.js` 使用现有独立 Spine 4 模块及 WebGL 渲染器；不替换动态皮肤的全局运行库。关闭后取消帧循环、延迟语音、音频和 resize 监听，释放纹理与 WebGL 上下文，并恢复焦点。动画加载失败或不支持 WebGL 时保留原图集的静态结算，仍可正常继续。

验证命令：`node --test tests/mvp-settlement.test.mjs tests/kill-combo.test.mjs tests/native-kill-effect.test.mjs`。浏览器已检查真实 WebGL 渲染、标题结束后保留、关闭重开以及 1920 × 900、844 × 390、390 × 844 布局，控制台无错误。自动化测试验证源文件哈希、原始动画逐帧几何、终局计分、次数、资源回收、延迟加载取消和无 WebGL 降级。
