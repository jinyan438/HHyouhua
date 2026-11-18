# 原版装备栏

资源来自 `E:/AI/sanguosha/extract/unity/sprite/assets/res/picture/game/seat/`，逐文件复制到 `assets/equipment/`，未修改图像。来源、SHA-256 和原版绘制类记录在该目录的 `sources.json`。

- 底图：`new_equip_card_bg_new.png`，140×30。
- 武器、防具、防御坐骑、进攻坐骑、宝物：`new_equip_type_3_new` 至 `new_equip_type_7_new`。
- 花色及点数：`other_equip_*_new`，黑色牌采用原版黑底白描边，红色牌采用原版红色字形。
- 装备名与范围：复用 `assets/general-font/FZLBGBK.woff2`，常规字重 400、颜色 `#FFF7F7`。

底图在现有装备栏的左、右两侧各延伸 2px，装备文字、图标和点击区域的位置与宽度保持不变；独立装备栏的空槽共用同一延伸量。

原版 `sanguosha2/work/main.js` 的 `fns`（`EquipCardUi`）将图标、花色、点数、名称的横坐标设为 3、22、38、60，图标大小 20，名称字号 22。本扩展按这些比例适配已有装备栏宽度；独立装备栏行高 27px，武将牌中的装备条按栏宽缩放，长名称使用剩余宽度。武器显示自身范围，坐骑显示实际距离修正。

只改卡牌的装备名称节点，完整手牌、出牌、牌堆及装备移动动画继续使用原有牌面。原生置入虚拟装备及更新装备栏后刷新名称节点，保留转换装备的方括号、装备技能文字、空槽和废除状态。

装备区同时监听栏内节点和文字变化。原生广播、重连及其它后续更新直接重写 `name2` 时，也会依据真实牌名、花色和点数重建图标；完整且未变的节点不再重写，避免观察器触发自身循环。每个装备区只注册一个观察器，不影响空槽及废除栏的原生文字。

开发服务器 Vite 会把 `new URL("../../assets/equipment/", import.meta.url)` 的目录参数转换成不含末尾斜杠的路径。拼接文件名前必须补齐斜杠，否则会请求不存在的 `assets/equipmentnew_equip_type_4_new.png` 等地址。回归检查须导入 `127.0.0.1:8080` 实际转换后的模块，验证图标、花色和点数图片的响应及加载结果。

整套入栏逻辑来自 `sanguosha2/work/main.js` 的身份局实现：`GMt.onCreateCardMotion → onFirstMotionComplete → showACardMotion → onMotionComplete → AMt.setAEquipCardActive → LayoutEquipCards → Yki.Run`。`Seat_Equipment / startEquipCardMotion` 通过 `SHOW_A_CARD_MOTION` 传递目标坐标、缩小比例 0.1 和结束回调。原版使用 Laya 显示对象；扩展移植相同阶段、缓动及回调顺序，显示坐标按 HH 武将牌与实际装备栏换算。

`VUt` 的默认参数：普通玩家先用 200ms 的 `sineOut` 放大至 1.2 倍并抬升 15 个原版单位，再用 200ms 线性缩到 0.1；本地玩家两个阶段均为 267ms，抬升 30。放大时 x、y 各补偿牌宽、牌高的 0.1。原版基准武将框为 174×232、牌面 126×174；Web Animations 对原版正弦进度采样，移动与缩放使用同一进度。1500ms 看门狗对应客户端的兜底清理。来源哈希、调用链及参数记录在 `assets/equipment/motion-source.json`。

牌面完成缩小后才显示装备条并横向滑入：原版 `M_EQUIP_SIZE.width` 为 146，从 `seatX - 146` 移到 `seatX + 27`，距离 173，耗时 300ms、线性移动。扩展按实际栏宽换算 173/146 的滑入距离；底图资源自身的 140px 宽度不作为布局常量。关闭“装备牌移动优化”时直接滑入。已有装备、同栏排序及文字刷新不重播；转移至另一玩家重新滑入，移走、替换和对局结束会取消等待及动画，恢复原有样式。只移动视觉内容，选牌、点击及原生结算不等待动画。
