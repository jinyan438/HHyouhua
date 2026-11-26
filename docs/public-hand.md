# 公开手牌

资源和代码取自 `E:\AI\sanguosha\sanguosha2\yoka.game_g_android_4.0.2.apk` 与 `sanguosha2/work/main.js`。

`assets/public-hand/skillTipShowBg.png` 从原 APK 的 `res/assets/game/seat.png` 图集无损切出，保留透明通道，以原版 `30,30,30,30` 九宫格拉伸。常驻侧边列表的 `other_hand_card_bg.png` 来自 `res/assets/game/seatBottom.png`，沿用 `4,4,4,4` 九宫格。来源缓存键、坐标和 SHA-256 记录在同目录的 `sources.json`；`tools/import-public-hand.py` 可重新导入。该窗口没有独立音效。

`Sns`（ShowHandCardTip）、`Ins`（队友手牌）和 `pns`（手牌数入口）的原始代码保存在 `tests/fixtures/original-public-hand.json`。窗口沿用原版 126×174 牌面的 0.85 倍、每行最多四张、间隔 6；单行高度 220、两行 380、更多牌 400 并纵向滚动。背景按原版 expoOut 横向展开 200 毫秒，牌面同步横向展开；关闭时清除牌面，背景按 quadOut 收起 150 毫秒。按游戏窗口高度相对 750 的比例缩放，窄屏时进一步缩小到牌桌内；右侧角色向左展开，左侧角色向右展开。

2.0.36 恢复常驻的侧边手牌列表，补齐原版 `Oki` 的显示逻辑。列表按原版 47×108 尺寸、四行牌名和五张起显示省略号，随角色高度缩放，在角色朝向牌桌的一侧显示；火杀、雷杀、冰杀保留属性简称。无需先打开弹窗即可看到有权查看的队友手牌。列表、牌面和入口共用同一权限判断，手牌清空、权限失去或切换到自己时一起隐藏。刷新也能补接在管理器建立前已初始化的角色。

2.0.37 补齐 `jx.Create` 的原版字体与文字布局。客户端移动端默认字体 `rB.SemiBold` 实际为 `fzlbgbk`，复用已经从同一 APK 的 `fontApp/FZLBGBK.ttf` 无损压缩的 `assets/general-font/FZLBGBK.woff2`；不再沿用 `yuanli`。文字为 20 号、非加粗、颜色 `#CCB78E`、字距 1、行间附加距离 0，四行总高 80，顶部偏移 5。底图改成独立子节点，避免 CSS 的 4 像素边框把文字区域缩成 39 像素并把文字向下推移。完整 47 像素文字区按 Laya 不计末尾字距的方式居中，不添加文字阴影。原始 `jx.Create` 和字体映射一并存入来源快照。

手牌栏的样式表独立声明 `hh-source-public-hand` 字体，不依赖武将姓名样式。同步网页成品与 Android 资源时补齐原版字体文件及其来源记录，避免字体缺失后回退为系统字形。

点击侧边列表或手牌数展开完整牌面，点击外侧、再次点击入口或按 Escape 关闭；关闭后侧边列表继续显示。手牌框在列表外侧展开，避免盖住列表。不暂停对局、不改变卡牌和目标选择。触屏直接处理点按，避免引擎抑制合成鼠标点击导致无法打开；窗口阻止滚动手势进入游戏的全局拖牌处理。窗口内仅显示牌面和“武将名的手牌”。

沿用引擎的 `shownCard`、角色控制权和 `viewHandcard` 技能权限，斗地主队友关系由原生 `doudizhu_viewHandcard` 判断。部分明置时只复制可见牌，其余位置创建没有真实卡牌引用的牌背；不开放额外查看权限。摸牌、失牌、明置／取消明置、技能增减和切换控制时刷新；死亡、角色清除、失去权限、切后台及结束游戏时移除窗口和相应观察器。更新中不重复播放展开动画。

验证包括原客户端可执行布局对照、两张素材的哈希、权限收回、未知牌引用隔离、动态更新及观察器清理。实际斗地主验证左右两个农民视角不点击时列表已显示、点击列表展开、17 张牌的省略号、竖屏、自身控制切换，以及真实触摸打开和滑动。截图和运行结果保存在 `F:\noname\artifacts\hh-public-hand-summary-20261126`。

样式核对使用 APK 中的 Laya HTML 渲染器及原始 `Oki`／`jx`，对照“火杀／铁索／杀／雷杀”。原版和 CSS 的字形外接范围同为 `(5,7)-(43,81)`；实际游戏另核对字体已加载、20 号字、1 像素字距、20 像素行高和 47 像素文本区。文字渲染、截图与结果保存在 `F:\noname\artifacts\hh-public-hand-style-20261126`。渲染器抗锯齿仍可能有细微像素差异，资源和布局参数一致。

相关测试：`node --test tests/public-hand.test.mjs tests/hand-selection.test.mjs tests/doudizhu-layout.test.mjs tests/source-reveal.test.mjs tests/player-confirm-lifecycle.test.mjs`。
