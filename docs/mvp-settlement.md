# MVP 结算

2.0.31 在胜负画面与 MVP 画面增加“查看战绩”，打开原版风格的全屏表格；点击空白或按 Esc 返回打开前的画面，不跳过原有的两次继续。战绩与 MVP 共用结束时的一份评分快照，重复查看不会加分或重复记录 MVP 次数。详见 [战绩说明](battle-record.md)。

开启“扩展 → HH优化 → 启用MVP结算画面”，游戏结束后先显示原版胜利、失败或平局动画。点击“继续”进入全屏 MVP，展示当前对局 MVP 的武将皮肤、昵称及总评分；再次继续直接返回大厅。支持点击画面和 Esc、Enter，胜负画面保留 1.8 秒入场防误触，MVP 保留 1.5 秒防误触。

2.0.29 接入用户本地客户端 `ResultBeforeMVPWindow`（`main.js` 的 `class aps`）常规胜负表现：`FX_PaiJu_JieSuan_Shengli_new`、`FX_PaiJu_JieSuan_ShiBai_new` 和 `FX_PaiJu_JieSuan_PingJu_new` 原始 Spine 4.0.56 骨骼、图集与图片，以及对应 `ui_zhandoushengli.ogg`、`ui_zhandoushibai.ogg`、`ui_zhandoupingju.ogg`。入场分别为 1.7、1.3、1.2 秒，结束后循环原始 `play2` 停留动画。12 个原始文件约 4.94 MiB，位于 `assets/game-result/`，附源路径及 SHA-256；可用 `tools/import-game-result.py` 重新提取。

`src/ui/gameResultFlow.js` 在本体结束处理期间隐藏旧战绩弹窗，拦截旧 `effect/win`、`effect/lose`、`effect/tie` 音效，并播放本次胜负对应的新音效，沿用音量及音效开关。仍由本体处理奖励、录像、原始统计表序列化、胜负记录与联机消息；本体延迟重开不会抢先跳过“继续”。不再显示原来的“重新开始／全场最佳”收尾控件。官方银两、地主豆等服务器奖励不填入本地虚构数值。

MVP 继续通过一次性 `hhReturnLobby` 参数返回启动大厅。HH 预加载在本体选择模式之前临时启用本次大厅入口，清除直接开始的临时标志；不保存或更改玩家原来的启动显示偏好。返回时跳过开场视频，直接呈现大厅，下一次正常启动仍遵守原设置。

2.0.30 修复返回后只显示龙纹占位背景的问题。此前把 `preview: "style2"` 同时用于跳过开场视频与设置预览，导致真正的大厅挂在 `ui.background` 底层，被占位图遮挡。现以 `skipIntro` 独立跳过开场，保持大厅直接挂到 `document.body`，大厅建好后移除占位图。回归测试执行真实大厅构建、检查挂载层级与四个模式入口，并确认后续正常启动仍播放原配置的开场视频。浏览器已使用游戏实际启动页验证返回、点击经典场进入选将，以及再次返回大厅。

画面采用用户本地 `E:\AI\sanguosha` 客户端的 `GameMvpWindow` 常规皮肤分支：421 × 540 武将图居中，循环播放 `FX_PaiJu_JieSuan_kuang`，右侧播放一次 `FX_PaiJu_JieSuan_QCZJ` 并保留标题，分数与资料栏按原版位置排列。宽屏、手机横屏按比例适配，竖屏改为上下排列。

2.0.28 修复游戏界面缩放时武将图、评分、资料栏与火焰动画错位。布局使用结算层的本地 CSS 尺寸，WebGL 接收同一逻辑视口，画布像素分辨率继续使用实际显示尺寸。兼容 HH 的 `body.style.zoom` 与本体的 `body.style.transform`，不修改玩家的缩放设置。结算范围内禁用游戏默认 `div` 过渡，窗口变化时直接同步图像与动画。

原始 Spine 4.0.56 骨骼、图集描述、图集纹理、背景及 `ui_quanchangzuijia.ogg` 直接从本地 APK 缓存提取；资料栏、静态标题和备用边框从原图集无损裁切。11 个文件约 5.52 MiB，位于 `assets/mvp-fullscreen/`，`sources.json` 记录原始路径、缓存键、裁切范围、字节数和 SHA-256。`tools/import-mvp.py` 可重复导入。

原窗口代码位于 `sanguosha2/work/main.js` 的 `class T4i`，注册名为 `GameMvpWindow`；主要参考 `initUI`、`loadGeneralRes`、`playGeneralSpine`、`addImgClick` 与 `CloseWindow`。原客户端的 MVP 及分数由服务器提供，因此本地沿用 HH 原有攻击、治疗、辅助、局势和惩罚计分，显示值为技术分除以 10，保留一位小数。终局快照包括阵亡角色，敌友查询使用本体 `includeDie` 参数，不临时替换 `game.players`，重新查看不重复累计局势分。

本机玩家获得 MVP 时记录本月次数，AI 和录像不累计；次数从本次替换后开始记录。未接入的官方官阶、点赞、微信分享及服务器次数不伪造。当前武将画像直接使用对局皮肤，支持扩展武将和 DB/blob 图片。

胜负画面先播放原始胜负音效；进入 MVP 后播放原始 MVP 播报，随后播放当前武将的一条技能语音，遵守游戏音量和语音开关。每次切换先停止上一画面的动画与音频。原窗口没有独立的 MVP 背景音乐切换逻辑，游戏背景音乐继续按原设置播放。旧 `asqx.mp3` 及旧 MVP 图片保留，但新入口不再引用。

`src/ui/mvpSettlement.js` 负责终局快照、资料、次数和交互，`src/effects/mvpEffects.js` 使用现有独立 Spine 4 模块及 WebGL 渲染器；不替换动态皮肤的全局运行库。关闭后取消帧循环、延迟语音、音频和 resize 监听，释放纹理与 WebGL 上下文，并恢复焦点。动画加载失败或不支持 WebGL 时保留原图集的静态结算，仍可正常继续。

验证命令：`node --test tests/game-result-flow.test.mjs tests/mvp-settlement.test.mjs tests/kill-combo.test.mjs`。浏览器已检查胜利、失败动画及“胜负 → MVP → 大厅”的两次继续，包含实际页面导航和返回标记消费；原有宽屏、手机布局和缩放检查继续保留。自动化测试使用本体真实 `game.over` 检查统计、奖励、录像、记录、旧弹窗／音效拦截、两阶段继续、重复点击、联机客户端早返回、主机延迟重开、静音设置及返回大厅的一次性行为，并检查全部原始动画与音频哈希。

缩放回归：使用本体实际 `layout/default/layout.css` 和游戏两种文档缩放方式，在浏览器重现了 62.5% 缩放下的原错位，再验证修复后的 62.5%、150% 以及用户截图的 2760 × 1256 尺寸。自动化测试在 50%、62.5%、80%、100%、150%、200%、300% 下比较 DOM 位置与真实渲染器生成的屏幕几何，包含扫光结束后标题保留，防止单独预览正常而游戏内错位。
