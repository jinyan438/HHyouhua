# 原版装备栏

资源来自 `E:/AI/sanguosha/extract/unity/sprite/assets/res/picture/game/seat/`，逐文件复制到 `assets/equipment/`，未修改图像。来源、SHA-256 和原版绘制类记录在该目录的 `sources.json`。

- 底图：`new_equip_card_bg_new.png`，140×30。
- 武器、防具、防御坐骑、进攻坐骑、宝物：`new_equip_type_3_new` 至 `new_equip_type_7_new`。
- 花色及点数：`other_equip_*_new`，黑色牌采用原版黑底白描边，红色牌采用原版红色字形。
- 装备名与范围：复用 `assets/general-font/FZLBGBK.woff2`，常规字重 400、颜色 `#FFF7F7`。

原版 `sanguosha2/work/main.js` 的 `fns`（`EquipCardUi`）将图标、花色、点数、名称的横坐标设为 3、22、38、60，图标大小 20，名称字号 22。本扩展按这些比例适配已有装备栏宽度；独立装备栏行高 27px，武将牌中的装备条按栏宽缩放，长名称使用剩余宽度。武器显示自身范围，坐骑显示实际距离修正。

只改卡牌的装备名称节点，完整手牌、出牌、牌堆及装备移动动画继续使用原有牌面。原生置入虚拟装备及更新装备栏后刷新名称节点，保留转换装备的方括号、装备技能文字、空槽和废除状态。

装备区同时监听栏内节点和文字变化。原生广播、重连及其它后续更新直接重写 `name2` 时，也会依据真实牌名、花色和点数重建图标；完整且未变的节点不再重写，避免观察器触发自身循环。每个装备区只注册一个观察器，不影响空槽及废除栏的原生文字。

开发服务器 Vite 会把 `new URL("../../assets/equipment/", import.meta.url)` 的目录参数转换成不含末尾斜杠的路径。拼接文件名前必须补齐斜杠，否则会请求不存在的 `assets/equipmentnew_equip_type_4_new.png` 等地址。回归检查须导入 `127.0.0.1:8080` 实际转换后的模块，验证图标、花色和点数图片的响应及加载结果。
