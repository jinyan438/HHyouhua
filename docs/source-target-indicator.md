# 原版双剑选中指示

“出牌指示”中原来的“大司马”双锤替换为“OL双剑”。保留旧设置键 `dasima`，已有设置直接生效；其它样式继续可选，所有样式都只在角色具有 `selected` 黄框状态时播放。仅有 `selectable` 蓝框时不显示，取消选中、关闭特效、角色离场和对局结束时清除。

资源来自本机 `E:/AI/sanguosha/sanguosha2/yoka.game_g_android_4.0.2.apk`，原路径为 `/res/assets/animate/game/seat/FX_paiju_guoduhu`。APK 缓存的 CRC32 文件名为：骨骼 `58c5e272`、图集 `cf0295ce`、贴图 `33fb3847`。直接按路径校验提取，未采用旧导出目录中依靠图形相似度配对的贴图。原版 `main.js` 中 `GetAttackEffNameById()` 的 `attackEffArrULaya[1]` 选择此资源，`Seat_SelectedChanged` 在状态 2 调用 `OnShowAttackedEffect`，以角色中心为锚点循环播放 `play`；其它状态调用 `OnHideAttackedEffect`。

`assets/animation/ol-selected-swords/` 保存原始 `.skel`、`.atlas.txt`、PNG 及兼容现有播放器的 JSON、atlas。`tools/import-target-indicator.mjs` 只把 Spine 4.0.56 的序列化转换为现有 3.6 播放器格式。原贴图字节、骨骼变换、旋转与平移关键帧、闪光透明度、逐帧粒子、混合方式和 1 秒周期全部保留；未烘焙帧图或重画动画。显示缩放为 0.66，较初始版本放大 20%，仍以角色中心为锚点。`sources.json` 记录来源及所有文件的 SHA-256。

`targetIndicator.js` 统一管理初始化、菜单切换与选中状态。每名角色同时最多持有一个播放或加载请求；异步资源加载完成后再次检查选中状态和配置版本，避免取消后迟到的特效残留。重复 class 更新不重播；多选角色分别播放，取消其中一个不会移除其它角色的动画。

测试对比原始 Spine 4.0 二进制和转换后实际播放器的 120 个时间点，核对附件、世界坐标顶点、UV、透明度与混合模式；另验证蓝框无特效、黄框多选、取消、菜单切换、关闭、对局结束与加载期间快速切换。
