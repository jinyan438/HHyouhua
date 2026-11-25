// Adapted from 启动界面美化 1.2.1 by 缘伴随行 (GPL-3.0).
import { startupAssetPath, loadStartupMedia, disposeStartupBackground, prepareStartupVideo, playStartupMedia } from './startupMedia.js';

export function createStartupInterface(lib, game, ui, get, ai, _status) {
    const startup = {
        content: function(config, pack) {
            disposeStartupBackground(ui);
            //当前不在启动界面的情况下，移除覆盖页面
            if (ui.qdmh_background) {
                ui.qdmh_background.remove();
                delete ui.qdmh_background;
            };
        },
        precontent: async function() { //启动代码
            //引入css文件
            lib.init.css(lib.assetURL + startupAssetPath.slice(0, -1), "extension");
            //——————————分割线——————————//
            //【封装函数】阿罗娜小提示
            game.mhjm_Arona_notice = function(text, parentDiv) {
                //如果已经有记录了，取消后续流程
                if (ui.mhjm_Arona_notice) return;
                //创建容器
                var notice = ui.create.div(".wlmh_Arona_notice", parentDiv || ui.window || document.body);
                //创建阿罗娜图像
                var image = ui.create.div(".wlmh_Arona_notice_image", notice);
                //创建聊天框
                var chatBox = ui.create.div(".wlmh_Arona_notice_chatBox", notice);
                //创建聊天文本
                var chat = ui.create.div(".wlmh_Arona_notice_chatText", chatBox);
                chat.innerHTML = text || "";
                //记录容器，以作后续处理
                ui.mhjm_Arona_notice = notice;
            };
            //【封装函数】个性化模式排序
            game.personalizedModeSorting = function(parentDiv) {
                //覆盖一层半透明的黑色背景
                var openBackground = ui.create.div(".wlmh_background", ui.window || document.body);
                openBackground.style["background-color"] = "rgba(0, 0, 0, 0.5)";
                openBackground.style.zIndex = "3000";
                //创建背景容器
                var background = ui.create.div(".wlmh_modeSort", openBackground);
                //标题区域
                var titleZone = ui.create.div(".wlmh_modeSort_zone", background);
                titleZone.style.display = "flex";
                titleZone.style["justify-content"] = "center";
                titleZone.style["align-items"] = "center";
                titleZone.style["font-family"] = "mhjm_guangyao";
                titleZone.style["font-weight"] = "900";
                titleZone.style["font-size"] = "32px";
                titleZone.style["border-bottom"] = "1px solid rgba(126, 126, 126, 0.25)";
                titleZone.style["text-shadow"] = "none";
                titleZone.style.color = "#2D4664";
                titleZone.innerHTML = "个性化模式排序";
                //特色花边
                var titleImage = ui.create.div({
                    width: "26%",
                    height: "100%",
                    top: "0",
                    left: "0",
                    opacity: "0.65",
                    "background-repeat": "no-repeat",
                    "background-size": "100% 100%",
                }, titleZone);
                titleImage.setBackgroundImage("extension/HH优化/assets/startup/image/other/beautifyingStrip.png");
                //内容区域
                var contentZone = ui.create.div(".wlmh_modeSort_zone", background);
                contentZone.style.height = "80%";
                contentZone.style.backgroundColor = "white";
                //创建按钮
                var button = ui.create.div(".wlmh_modeSort_button", contentZone);
                button.innerHTML = "确定";
                button.onclick = function() {
                    //点击音效
                    game.oncePlayAudio("extension/HH优化/assets/startup/audio/", "click1", 1);
                    //重置定义全模式的数组
                    var list = [];
                    for (var i in moduleZone.modules) {
                        let data = moduleZone.modules[i];
                        let id = lib.config.mhjm_modes.filter(i => lib.mode[i].name == data.name.innerHTML)[0];
                        list.add(id);
                    };
                    //删除容器
                    openBackground.remove();
                    //删除选中模块的记录
                    delete lib.wlmh_currentSelectModule;
                    //删除阿罗娜小提示的记录
                    delete ui.mhjm_Arona_notice;
                    //显示父容器
                    if (parentDiv) parentDiv.style.display = "";
                    //如果两个数组的内容顺序不同，执行效果
                    if (JSON.stringify(list) != JSON.stringify(lib.config.mhjm_modes)) {
                        game.saveConfig("mhjm_modes", list);
                        //重建各区域模块
                        ui.beautifyStartInterface_background.iconZone.remove();
                        ui.beautifyStartInterface_background.zone.remove();
                        ui.beautifyStartInterface_background.specialZone.remove();
                        ui.beautifyStartInterface_background.mainFun();
                    }
                };
                //模块区域
                var moduleZone = ui.create.div(".wlmh_modeSort_moduleZone", contentZone);
                moduleZone.modules = {};
                //全模式列表
                var modes = lib.config.mhjm_modes.slice();
                let count = 0;
                for (var i = 0; i < modes.length; i++) {
                    //创建模块
                    var module = ui.create.div(".wlmh_modeSort_module", moduleZone);
                    moduleZone.modules[i] = module;
                    //设置右间距
                    if (count < 6) module.style["margin-right"] = "1.4%";
                    //设置上间距
                    if (i >= 6) module.style["margin-top"] = "1.8%";
                    //定义模式
                    let mode = modes[i];
                    //本体默认的模式列表
                    let defaultModes = ['identity', 'guozhan', 'versus', 'connect', 'boss', 'doudizhu', 'single', 'chess', 'tafang', 'brawl', 'stone'];
                    //拓展模式图像处理
                    if (!defaultModes.includes(mode)) {
                        if (lib.mode[mode]?.splash?.startsWith("ext:")) module.setBackgroundImage(lib.mode[mode]["splash"].replace(/^ext:/, 'extension/'));
                        else module.setBackgroundDB(lib.mode[mode]["splash"]);
                    }
                    //本体模式图像处理
                    else module.setBackgroundImage("image/splash/style2/" + mode + ".jpg");
                    //名称处理
                    let name = ui.create.div(".wlmh_modeSort_module_name", module);
                    name.innerHTML = lib.mode[mode].name;
                    name.parentDiv = module;
                    module.name = name;
                    //标号处理
                    let grade = ui.create.div(".wlmh_modeSort_module_grade", module);
                    grade.innerHTML = i + 1;
                    grade.parentDiv = module;
                    module.grade = grade;
                    //杂项
                    count++;
                    if (count >= 6) count = 0;
                }
                //处理模块事项
                moduleZone.addEventListener("click", (event) => {
                    let target = event.target;
                    if (target != moduleZone) {
                        //如果是标号或名称，归溯到其父容器
                        if (target.parentDiv) target = target.parentDiv;
                        //没有记录的情况下
                        if (!lib.wlmh_currentSelectModule) {
                            //记录当前被选中的模块
                            lib.wlmh_currentSelectModule = target;
                            //添加选中状态
                            target.classList.add("selecting");
                            //创建阿罗娜小提示
                            game.mhjm_Arona_notice("老师，再点击任意一个模块，就可以与之切换序位了哦", openBackground);
                        } else {
                            //为记录的阿罗娜小提示增添退场伪动画
                            ui.mhjm_Arona_notice.style.transition = "all 0.25s ease-out";
                            ui.mhjm_Arona_notice.style.left = "-2%";
                            ui.mhjm_Arona_notice.style.opacity = "0";
                            setTimeout(() => {
                                ui.mhjm_Arona_notice.remove();
                                delete ui.mhjm_Arona_notice;
                            }, 250);
                            //移除记录模块的选中状态
                            lib.wlmh_currentSelectModule.classList.remove("selecting");
                            //如果记录的和当前选中的不一样
                            if (target != lib.wlmh_currentSelectModule) {
                                //互换模块名称及图像
                                var str = [target.name.innerHTML, target.style.backgroundImage];
                                target.name.innerHTML = lib.wlmh_currentSelectModule.name.innerHTML;
                                lib.wlmh_currentSelectModule.name.innerHTML = str[0];
                                target.style.backgroundImage = lib.wlmh_currentSelectModule.style.backgroundImage;
                                lib.wlmh_currentSelectModule.style.backgroundImage = str[1];
                            }
                            //删除选中模块的记录
                            delete lib.wlmh_currentSelectModule;
                        }
                    }
                });
            };
            //——————————分割线——————————//
            //【封装函数】展出设置栏
            game.mhjm_showSettings = function() {
                //覆盖一层半透明的黑色背景
                var openBackground = ui.create.div(".wlmh_background", ui.window || document.body);
                openBackground.style["background-color"] = "rgba(0, 0, 0, 0.5)";
                openBackground.style.zIndex = "3000";
                //创建背景容器
                var background = ui.create.div(".wlmh_settings", openBackground);
                //标题区域
                var title = ui.create.div(".wlmh_settings_zone", background);
                title.style["border-bottom"] = "1px solid #DEE2E3";
                title.style.overflow = "hidden";
                //特色花边
                var titleImage = ui.create.div({
                    width: "30%",
                    height: "100%",
                    top: "0",
                    left: "0",
                    opacity: "0.65",
                    "background-repeat": "no-repeat",
                    "background-size": "100% 100%",
                }, title);
                titleImage.setBackgroundImage("extension/HH优化/assets/startup/image/other/beautifyingStrip.png");
                //标题内容
                var titleContent = ui.create.div(".wlmh_settings_zone_title", title);
                //电脑端适配
                if (!lib.device) titleContent.style["font-size"] = "5vh";
                titleContent.innerHTML = "设置";
                //修饰线
                var line = ui.create.div(".wlmh_settings_zone_title_line", titleContent);
                //电脑端适配
                if (!lib.device) {
                    line.style.width = "7vw";
                    line.style.height = "1vh";
                }
                //退出口
                var exit = ui.create.div(".wlmh_settings_zone_exit", title);
                exit.onclick = function() {
                    //点击音效
                    game.oncePlayAudio("extension/HH优化/assets/startup/audio/", "click2", 1);
                    //删除容器
                    openBackground.remove();
                };
                //内容区域
                var content = ui.create.div(".wlmh_settings_zone", background);
                content.style.height = "85%";
                content.style.backgroundColor = "white";
                //模块区域
                var moduleZone = ui.create.div(".wlmh_settings_zone_moduleZone", content);
                //子模块列表
                var modules = [
                    ["还原界面", "个性化模式排序"],
                    ["转变布局", "保存当前布局"]
                ];
                for (var i = 0; i < modules.length; i++) {
                    //子模块区域
                    var sonZone = ui.create.div(".wlmh_settings_zone_moduleSonZone", moduleZone);
                    if (i < modules.length - 1) sonZone.style["margin-bottom"] = "3px";
                    for (var j = 0; j < modules[i].length; j++) {
                        //创建模块
                        var module = ui.create.div(".wlmh_settings_module", sonZone);
                        module.onclick = function() {
                            this.style.transform = "scale(0.9)";
                            setTimeout(() => {
                                this.style.transform = "";
                            }, 150);
                            //【还原界面】功能
                            if (this.innerHTML == "还原界面") {
                                //删除设置容器
                                openBackground.remove();
                                disposeStartupBackground(ui);
                                //删除先前的覆盖页面
                                if (ui.qdmh_background) {
                                    ui.qdmh_background.remove();
                                    delete ui.qdmh_background;
                                };
                            } else if (this.innerHTML == "个性化模式排序") {
                                //隐藏设置容器
                                openBackground.style.display = "none";
                                //调用函数
                                game.personalizedModeSorting(openBackground);
                            } else if (this.innerHTML == "转变布局") {
                                if (!ui.beautifyStartInterface_background.turnRecord) ui.beautifyStartInterface_background.turnFun();
                                else ui.beautifyStartInterface_background.unturnFun();
                            } else if (this.innerHTML == "保存当前布局") {
                                var bool = confirm("确认保存？若如此做，【" + ui.beautifyStartInterface_background.video.videoName + "】之后的布局将沿用当前形式！");
                                if (bool) {
                                    if (!ui.beautifyStartInterface_background.turnRecord) lib.config.wlmh_willTurnVideos.remove(ui.beautifyStartInterface_background.video.videoName);
                                    else lib.config.wlmh_willTurnVideos.add(ui.beautifyStartInterface_background.video.videoName);
                                    game.saveConfig("wlmh_willTurnVideos", lib.config.wlmh_willTurnVideos);
                                }
                            }
                        };
                        module.isTouching = false;
                        module.addEventListener(lib.device ? "touchstart" : "mouseover", (event) => {
                            event.target.isTouching = true;
                            event.target.style.transform = "scale(0.9)";
                        });
                        module.addEventListener(lib.device ? "touchend" : "mouseout", (event) => {
                            if (event.target.isTouching) {
                                event.target.isTouching = false;
                                event.target.style.transform = "";
                            }
                        });
                        module.innerHTML = modules[i][j];
                        if (j == 0) module.style.left = "0";
                        else module.style.right = "0";
                    }
                }
            };
            //【封装函数】展出公告栏
            game.mhjm_showAnnouncements = function() {
                //覆盖一层半透明的黑色背景
                var openBackground = ui.create.div(".wlmh_background", ui.window || document.body);
                openBackground.style["background-color"] = "rgba(0, 0, 0, 0.5)";
                openBackground.style.zIndex = "2000";
                //创建背景
                var background = ui.create.div(".wlmh_announcement", openBackground);
                //标题区域
                var title = ui.create.div(".wlmh_announcement_zone", background);
                //左侧小标题
                var leftTitle = ui.create.div(".wlmh_announcement_zone_title", title);
                leftTitle.innerHTML = "无名新闻";
                //退出口
                var exit = ui.create.div(".wlmh_announcement_zone_exit", title);
                exit.onclick = function() {
                    //点击音效
                    game.oncePlayAudio("extension/HH优化/assets/startup/audio/", "click2", 1);
                    //删除容器
                    openBackground.remove();
                };
                //内容区域
                var content = ui.create.div(".wlmh_announcement_zone", background);
                content.style.height = "85%";
                content.style.backgroundColor = "white";
                //内容区域中的主要区域
                var contentZone = ui.create.div(".wlmh_announcement_mainZone", content);
                //主要区域中的标题区域
                var titleZone = ui.create.div(".wlmh_announcement_titleZone", contentZone);
                //初始定位模块
                titleZone.module_index = 1;
                //建立模块列表
                titleZone.modules = {};
                //模块列表，更新必要
                var list = [
                    ["更新日志", "“欢迎连接【什亭之箱】，老师！”<br><br>《v1.2.1版本更新内容》<br><li>修复了一个在联机模式下无法正常游玩的严重性bug<br><br>《v1.2.0版本更新内容》<br><li>针对懒人包会闪出几秒原版启动界面画面的问题，进行了一些不太优雅的优化方式<br><li>对一些扩展模式因为名称过长而导致被模块遮盖的问题，进行了一些字体上的适配优化（模式名称建议在2～4字）<br><br>《v1.1.0正式版更新内容》<br><li>对美化界面进行了全面升级，增添并优化了许多功能！<br><li>对旧版用于切换圆环内模式模块的左右朝向箭头的方法进行了优化，新版已改成：①左右轻轻滑动以切换前后的一个模块（适用于手机端）②摁下键盘上的【←】或【→】方向键来切换前后的一个模块（适用于电脑端）③点击下方框内的圆点直接定位切换到对应的模块（通用推荐）<br><li>在扩展界面添加了当前扩展版本的信息<br><li>此版本开始，未隐藏的模式将会优先显示于已隐藏的模式的前面<br><li>修复了一些bug和问题"],
                    ["小提示", "“老师，这些请您过目！”<br><br><li>本扩展以二次元手游《蔚蓝档案》的UI界面为灵感而创作，但请注意，并不是100%还原！<br><li>本扩展的创作理念是：“乍一眼，似有BA的元素气息，再一眼，却不是BA～”<br><li>本扩展内素材皆来源于网络，不作商业用途，如侵告删！<br><li>未隐藏的模式会比已隐藏的显示得更靠前<br><li>背景音乐的默认音量与本体的背景音量是一致的<br><li>你可以通过点击页面来跳过开场动画（进入游戏后就不行了）<br><li>【个性化模式排序】功能的原理是：依次点击两个不同的模式模块，来交换它们的位序（不影响本体数组）<br><li>位序靠前的8个模式将会显示在主要的模块区域中，而剩下的模式则会整合进特殊的圆环模块中<br><li>目前共有两种布局的形式，默认是主要区域模块靠右、圆环区域模块靠左的，不过你可以在设置中【转变布局】，并且还可以为你的自定义视频【保存当前布局】哦！<br><li>电脑端的玩家可以通过摁一下键盘上的【←】或【→】键，来快速切换圆环模块内的前或后一个模式<br><li>由于作者本人的技术与精力有限，不能做到多端同时适配，因此建议电脑端玩家在窗口全屏的模式下体验更佳！"],
                    ["媒介宣传", "“老师，向您推荐这些！”<br><br><li>关注微信公众号【无名杀扩展交流】，可获取更多游戏解析及扩展资讯～<br><img style='width: 50%;' src=" + lib.assetURL + "extension/HH优化/assets/startup/image/medium/gongzhonghao.jpg></img><br><li>加入QQ群聊【无名杀方舟拓展3群】，来与更多志同道合的人一起友好交流～<br><img style='width: 50%;transform: scale(0.9);' src=" + lib.assetURL + "extension/HH优化/assets/startup/image/medium/groupChat.jpg></img>"],
                    ["《蔚蓝档案》", "“老师，请了解一下这个！”<br><br><li>《蔚蓝档案》，也译作《碧蓝档案》，英文名《Blue Archive》，日文名《ブルーアーカイブ》，是一款由韩国NEXON Games旗下的MX studio开发，上海悠星网络科技有限公司发行的二次元角色扮演游戏。日文版于2021年2月4日上线，中国和日本以外发行的海外版于2021年11月9日上线。简体中文版2023年8月3日上线。<br><li>游戏中玩家将扮演教师，带领性格迥异的学生们通过重重考验，打败敌人，寻找真相。作品亦被改编为同名电视动画片。<br><li>游戏的舞台为数千学园集合构成的巨大学园都市“基沃托斯”，由于学园都市的统治方、联邦学生会长行踪成谜。都市内不但有辍学的不良学生、还有私人军事企业等诸多问题产生。你作为刚到职的老师必须将混乱的局面控制下来。基沃托斯的学生们的特征就是头上的奇异光环，以及她们随时携带的特殊枪械武器，藉由老师的指挥能让她们发挥比平常更强的战力。<br><li>你将与你的学生们在此相会，于朝夕的相处中加深彼此的了解。运用你那大人的不可思议的才能，去守护、去为她们指明正确的成长方向，并在脑海的深处留下那一段段美好的回忆——<br><li>【与你的日常，就是奇迹！】"]
                ];
                //标题区域中建立模块
                for (var i = 1; i <= list.length; i++) {
                    titleZone.modules[i] = ui.create.div(".wlmh_announcement_titleZone_module", titleZone);
                    titleZone.modules[i].innerHTML = list[i - 1][0];
                    titleZone.modules[i].number = i;
                    titleZone.modules[i].onclick = function() {
                        //如果是自己，跳过后续流程
                        if (this.number == titleZone.module_index) return;
                        //点击音效
                        game.oncePlayAudio("extension/HH优化/assets/startup/audio/", "click1", 1);
                        //恢复当前模块颜色
                        titleZone.modules[titleZone.module_index].style.backgroundColor = "#F3F7F8";
                        //定义新的当前模块
                        titleZone.module_index = this.number;
                        //给当前模块染色
                        titleZone.modules[titleZone.module_index].style.backgroundColor = "#D3D3D3";
                        //更新其它模块
                        pictureText.innerHTML = list[titleZone.module_index - 1][0];
                        text.innerHTML = "<br>" + list[titleZone.module_index - 1][1];
                    };
                    if (i == 1) titleZone.modules[i].style.backgroundColor = "#D3D3D3";
                }
                //主要区域中的分割线
                var line = ui.create.div(".wlmh_announcement_line", contentZone);
                //主要区域中的文本区域
                var textZone = ui.create.div(".wlmh_announcement_textZone", contentZone);
                //文本区域中的图像
                var picture = ui.create.div(".wlmh_announcement_textZone_picture", textZone);
                //图像中文字
                var pictureText = ui.create.div(".wlmh_announcement_textZone_pictureText", picture);
                pictureText.innerHTML = list[titleZone.module_index - 1][0];
                //文本区域中的文本
                var text = ui.create.div(".wlmh_announcement_textZone_text", textZone);
                text.innerHTML = "<br>" + list[titleZone.module_index - 1][1];
            }
            //——————————分割线——————————//
            //【封装函数】加载扩展文件夹内的文件
            get.mhjm_extensionDocuments = () => loadStartupMedia(lib, game, startup.config);
            await get.mhjm_extensionDocuments();
            //——————————分割线——————————//
            //【封装函数】一次性音效播放
            //参数：path传路径，name传名称，volume传音量（0～1）
            game.oncePlayAudio = function(path, name, volume) {
                var audio = document.createElement("audio");
                audio.src = lib.assetURL + path + name.replace(".mp3", "") + ".mp3";
                audio.volume = volume || lib.config.volumn_audio / 8;
                document.body.appendChild(audio);
                audio.addEventListener("ended", () => {
                    document.body.removeChild(audio);
                });
                audio.play()["catch"]((error) => {
                    // 浏览器自动播放策略限制，静默处理
                    console.warn("音频播放被阻止（浏览器自动播放策略），点击页面后可正常播放");
                    audio.remove();
                });
            };
            //——————————分割线——————————//
            //【封装函数】美化启动界面
            //参数：传一个完整的数组
            ui.beautifyStartInterface = function(list) {
                if (!list || typeof list != "object") {
                    alert("⚠️：错误，请传一个完整的数组！");
                    return;
                }
                //为全模式列表
                if (!lib.config.mhjm_modes) lib.config.mhjm_modes = Object.keys(lib.mode);
                else lib.config.mhjm_modes = lib.config.mhjm_modes.filter(i => lib.mode[i])["concat"](Object.keys(lib.mode)["filter"](j => !lib.config.mhjm_modes.includes(j)));
                game.saveConfig("mhjm_modes", lib.config.mhjm_modes);
                //排序，未隐藏的在前
                lib.config.mhjm_modes.sort((a, b) => {
                    const A = lib.config.hiddenModePack.includes(a);
                    const B = lib.config.hiddenModePack.includes(b);
                    if (A === B) return 0;
                    if (A) return 1;
                    return -1;
                });
                //记录需转变布局的视频文件
                if (!lib.config.wlmh_willTurnVideos) {
                    lib.config.wlmh_willTurnVideos = ["忧.mp4", "伊吹.mp4"];
                }
                disposeStartupBackground(ui);
                //创建背景容器
                var background = ui.create.div(".wlmh_background", list.preview ? ui.background : document.body);
                //记录当前背景容器
                ui.beautifyStartInterface_background = background;
                //默认与游戏背景保持一致
                background.style["background-image"] = ui.background.style["background-image"];
                //预览效果下界面调整
                if (list.preview) {
                    ui.arena?.hide();
                    ui.backgroundMusic?.pause();
                }
                //创建背景音乐
                if (list.music) {
                    var music = document.createElement("audio");
                    background.music = music;
                    music.volume = list.volume != undefined ? Number(list.volume) : 1;
                    music.loop = true;
                    music.src = lib.assetURL + "extension/HH优化/assets/startup/music/" + list.music;
                    music.musicName = list.music;
                    music.fun = function() {
                        //如果已不存在于页面上，移除之
                        if (!document.body.contains(music)) {
                            document.removeEventListener("visibilitychange", music.fun);
                            return;
                        }
                        if (document.visibilityState === "visible") {
                            if (music.src && music.paused) playStartupMedia(music, background);
                            if (ui.backgroundMusic && !ui.backgroundMusic.paused) ui.backgroundMusic.pause();
                        } else music.pause();
                    };
                    document.addEventListener("visibilitychange", music.fun);
                    background.disposeMedia = () => {
                        document.removeEventListener("visibilitychange", music.fun);
                        music.pause();
                    };
                    background.appendChild(music);
                }
                //创建开头背景视频
                if (list.video && lib.allBackgroundVideos.includes("开场-" + list.video)) {
                    var startVideo = document.createElement("video");
                    background.startVideo = startVideo;
                    prepareStartupVideo(startVideo);
                    startVideo.style.display = "none";
                    startVideo.src = lib.assetURL + "extension/HH优化/assets/startup/video/" + "开场-" + list.video;
                    startVideo.videoName = "开场-" + list.video;
                    startVideo.style.width = "100%";
                    startVideo.style.height = "100%";
                    startVideo.style.left = "0";
                    startVideo.style.top = "0";
                    startVideo.style.position = "absolute";
                    startVideo.style.backgroundSize = "cover";
                    startVideo.style.objectFit = lib.config.extension_HH优化_videoDisplayMode || "cover";
                    background.appendChild(startVideo);
                }
                //预览效果下跳过开场动画
                if (list.preview && list.preview == "style2" && startVideo) {
                    delete background.startVideo;
                    background.removeChild(startVideo);
                    startVideo = undefined;
                }
                //创建背景视频
                if (list.video) {
                    var video = document.createElement("video");
                    background.video = video;
                    prepareStartupVideo(video);
                    video.style.display = "none";
                    video.loop = true;
                    video.src = lib.assetURL + "extension/HH优化/assets/startup/video/" + list.video;
                    video.videoName = list.video;
                    video.style.width = "100%";
                    video.style.height = "100%";
                    video.style.left = "0";
                    video.style.top = "0";
                    video.style.position = "absolute";
                    video.style.backgroundSize = "cover";
                    video.style.objectFit = lib.config.extension_HH优化_videoDisplayMode || "cover";
                    video.style.zIndex = "-1";
                    background.appendChild(video);
                    background.videoName = list.video;
                }
                //模式选择区域
                if (list.zone) {
                    //封装成一个函数来执行
                    var main = function() {
                        //上层图标区域
                        var iconZone = ui.create.div(".wlmh_iconZone_top", background);
                        iconZone.style.left = lib.config.wlmh_willTurnVideos && lib.config.wlmh_willTurnVideos.includes(background.videoName) ? "-72%" : "3%";
                        background.iconZone = iconZone;
                        //仅欣赏背景功能按钮
                        var onlyWatch = ui.create.div(".wlmh_iconZone_icon", iconZone);
                        //电脑端适配
                        if (!lib.device) {
                            onlyWatch.style.width = "6vw";
                            onlyWatch.style.height = "6vw";
                        }
                        onlyWatch.style["margin-right"] = "1%";
                        onlyWatch.setBackgroundImage("extension/HH优化/assets/startup/image/icon/onlyWatch.png");
                        onlyWatch.condition = false;
                        onlyWatch.onclick = function() {
                            if (!video) return;
                            video.style.zIndex = "1000";
                            video.onclick = function() {
                                video.style.zIndex = "-1";
                                video.onclick = function() {};
                            };
                        };
                        onlyWatch.isTouching = false;
                        onlyWatch.addEventListener(lib.device ? "touchstart" : "mouseover", (event) => {
                            onlyWatch.isTouching = true;
                            event.target.style.transform = "translate(-84%, -50%) scale(0.9)";
                        });
                        onlyWatch.addEventListener(lib.device ? "touchend" : "mouseout", (event) => {
                            if (onlyWatch.isTouching) {
                                onlyWatch.isTouching = false;
                                event.target.style.transform = "translate(-84%, -50%)";
                            }
                        });
                        //公告栏按钮
                        var announcement = ui.create.div(".wlmh_iconZone_icon", iconZone);
                        //电脑端适配
                        if (!lib.device) {
                            announcement.style.width = "6vw";
                            announcement.style.height = "6vw";
                        }
                        announcement.style["margin-right"] = "1%";
                        announcement.setBackgroundImage("extension/HH优化/assets/startup/image/icon/announcement.png");
                        announcement.onclick = function() {
                            this.style.transform = "translate(-84%, -50%) scale(0.9)";
                            setTimeout(() => {
                                this.style.transform = "translate(-84%, -50%)";
                            }, 150);
                            game.mhjm_showAnnouncements();
                        };
                        announcement.isTouching = false;
                        announcement.addEventListener(lib.device ? "touchstart" : "mouseover", (event) => {
                            announcement.isTouching = true;
                            event.target.style.transform = "translate(-84%, -50%) scale(0.9)";
                        });
                        announcement.addEventListener(lib.device ? "touchend" : "mouseout", (event) => {
                            if (announcement.isTouching) {
                                announcement.isTouching = false;
                                event.target.style.transform = "translate(-84%, -50%)";
                            }
                        });
                        //设置按钮
                        var settings = ui.create.div(".wlmh_iconZone_icon", iconZone);
                        //电脑端适配
                        if (!lib.device) {
                            settings.style.width = "6vw";
                            settings.style.height = "6vw";
                        }
                        settings.setBackgroundImage("extension/HH优化/assets/startup/image/icon/settings.png");
                        settings.onclick = function() {
                            this.style.transform = "translate(-84%, -50%) scale(0.9)";
                            setTimeout(() => {
                                this.style.transform = "translate(-84%, -50%)";
                            }, 150);
                            game.mhjm_showSettings();
                        };
                        settings.isTouching = false;
                        settings.addEventListener(lib.device ? "touchstart" : "mouseover", (event) => {
                            settings.isTouching = true;
                            event.target.style.transform = "translate(-84%, -50%) scale(0.9)";
                        });
                        settings.addEventListener(lib.device ? "touchend" : "mouseout", (event) => {
                            if (settings.isTouching) {
                                settings.isTouching = false;
                                event.target.style.transform = "translate(-84%, -50%)";
                            }
                        });
                        //区域容器
                        var zone = ui.create.div(".wlmh_zone", background);
                        background.zone = zone;
                        //上方子区域
                        var sonZone1 = ui.create.div(".wlmh_sonZone", zone);
                        sonZone1.style.width = "100%";
                        sonZone1.style.height = "40%";
                        sonZone1.style.top = "0";
                        sonZone1.style.left = "0";
                        //左下子区域
                        var sonZone2 = ui.create.div(".wlmh_sonZone", zone);
                        sonZone2.style.width = "30%";
                        sonZone2.style.height = "60%";
                        sonZone2.style.bottom = "-8%";
                        sonZone2.style.left = "-2.5%";
                        //中下子区域
                        var sonZone3 = ui.create.div(".wlmh_sonZone", zone);
                        sonZone3.style.width = "30%";
                        sonZone3.style.height = "60%";
                        sonZone3.style.bottom = "-8%";
                        sonZone3.style.left = "30%";
                        //中右子区域
                        var sonZone4 = ui.create.div(".wlmh_sonZone", zone);
                        sonZone4.style.width = "30%";
                        sonZone4.style.height = "60%";
                        sonZone4.style.bottom = "-8%";
                        sonZone4.style.right = "8%";
                        //模块1
                        background.module1 = ui.create.div(".wlmh_module", sonZone1);
                        //模块2
                        background.module2 = ui.create.div(".wlmh_module", sonZone1);
                        background.module2.style.left = "5%";
                        //模块3
                        background.module3 = ui.create.div(".wlmh_smallModule", sonZone2);
                        //模块4
                        background.module4 = ui.create.div(".wlmh_smallModule", sonZone2);
                        background.module4.style.top = "6%";
                        background.module4.style.left = "-5%";
                        //模块5
                        background.module5 = ui.create.div(".wlmh_smallModule", sonZone2);
                        background.module5.style.top = "12%";
                        background.module5.style.left = "-9%";
                        //模块6
                        background.module6 = ui.create.div(".wlmh_mediumModule", sonZone3);
                        //模块7
                        background.module7 = ui.create.div(".wlmh_mediumModule", sonZone3);
                        background.module7.style.top = "6%";
                        background.module7.style.left = "-7%";
                        //模块8
                        background.module8 = ui.create.div(".wlmh_highModule", sonZone4);
                        //区域内各模块处理（可容纳8个模式）
                        for (var i = 0; i < 8; i++) {
                            var mode = lib.config.mhjm_modes[i];
                            var div = background["module" + (i + 1)];
                            if (!div || !lib.mode[mode]) { div?.remove(); continue; }
                            //本体默认的模式列表
                            let defaultModes = ['identity', 'guozhan', 'versus', 'connect', 'boss', 'doudizhu', 'single', 'chess', 'tafang', 'brawl', 'stone'];
                            //拓展模式图像处理
                            if (!defaultModes.includes(mode)) {
                                if (lib.mode[mode]?.splash?.startsWith("ext:")) div.setBackgroundImage(lib.mode[mode]["splash"].replace(/^ext:/, 'extension/'));
                                else div.setBackgroundDB(lib.mode[mode]["splash"]);
                            }
                            //本体模式图像处理
                            else div.setBackgroundImage("image/splash/style2/" + mode + ".jpg");
                            div.attribute = {};
                            div.attribute.mode = mode;
                            div.attribute.textStyle = ui.create.div(".wlmh_textStyle", div);
                            div.attribute.textStyle.parentDiv = div;
                            //【封装函数】依据窗口大小变化动态调整样式
                            var testStyleChange = function(currentDiv, parentDiv, length, func) {
                                //记录parentDiv的宽度
                                var str = parentDiv.offsetWidth;
                                //添加定时器
                                var interval = setInterval(() => {
                                    //若currentDiv已不在document.body页面中，移除定时器
                                    if (!document.body.contains(currentDiv)) {
                                        clearInterval(interval);
                                        return;
                                    }
                                    //若没有变化，取消后续流程
                                    if (str === parentDiv.offsetWidth) return;
                                    str = parentDiv.offsetWidth;
                                    //执行函数效果
                                    if (func && typeof func == "function") func(currentDiv, parentDiv, length);
                                }, 100);
                            };
                            if (i <= 1) {
                                //if (!lib.device) div.attribute.textStyle.style["font-size"] = "8vh";
                                div.attribute.textStyle.style["font-size"] = (div.offsetWidth * 0.23 - ((lib.mode[mode].name.length - 2) * 5)) + "px";
                                testStyleChange(div.attribute.textStyle, div, lib.mode[mode].name.length, function(div1, div2, num) {
                                    div1.style["font-size"] = (div2.offsetWidth * 0.23 - ((num - 2) * 5)) + "px";
                                });
                            }
                            if (i > 1 && i < 5) {
                                //div.attribute.textStyle.style["font-size"] = lib.device ? "30px" : "5vh";
                                div.attribute.textStyle.style["font-size"] = (div.offsetWidth * 0.23 - ((lib.mode[mode].name.length - 2) * 2)) + "px";
                                testStyleChange(div.attribute.textStyle, div, lib.mode[mode].name.length, function(div1, div2, num) {
                                    div1.style["font-size"] = (div2.offsetWidth * 0.23 - ((num - 2) * 2)) + "px";
                                });
                                div.attribute.textStyle.style.top = "10%";
                            }
                            if (i >= 5 && i < 7) {
                                //div.attribute.textStyle.style["font-size"] = lib.device ? "35px" : "5vh";
                                div.attribute.textStyle.style["font-size"] = (div.offsetWidth * 0.265 - ((lib.mode[mode].name.length - 2) * 3)) + "px";
                                testStyleChange(div.attribute.textStyle, div, lib.mode[mode].name.length, function(div1, div2, num) {
                                    div1.style["font-size"] = (div2.offsetWidth * 0.265 - ((num - 2) * 3)) + "px";
                                });
                                div.attribute.textStyle.style.top = "10%";
                            }
                            if (i == 7) {
                                //div.attribute.textStyle.style["font-size"] = lib.device ? "45px" : "7vh";
                                div.attribute.textStyle.style["font-size"] = (div.offsetWidth * 0.265 - ((lib.mode[mode].name.length - 2) * 3)) + "px";
                                testStyleChange(div.attribute.textStyle, div, lib.mode[mode].name.length, function(div1, div2, num) {
                                    div1.style["font-size"] = (div2.offsetWidth * 0.265 - ((num - 2) * 3)) + "px";
                                });
                                div.attribute.textStyle.style.top = "10%";
                            }
                            div.attribute.textStyle.innerHTML = lib.mode[mode].name;
                            div.onclick = function() {
                                //移除监听器
                                document.removeEventListener("visibilitychange", music.fun);
                                //移除背景音乐
                                music.remove();
                                //点击音效
                                game.oncePlayAudio("extension/HH优化/assets/startup/audio/", "click2", 1);
                                //缩放伪动画
                                this.style.transform = "skewX(-5deg) scale(0.9)";
                                setTimeout(() => {
                                    //新建背景容器以覆盖
                                    var background = ui.create.div(".wlmh_background", list.preview ? ui.background : document.body);
                                    background.style.zIndex = "1000";
                                    //默认与游戏背景保持一致
                                    background.style["background-image"] = ui.background.style["background-image"];
                                    //指引模式
                                    game.saveConfig("mode", this.attribute.mode);
                                    game.reload();
                                }, 150);
                            }
                            //模块添加一个长按可缩放的伪动画监听效果
                            div.isTouching = false;
                            div.addEventListener(lib.device ? "touchstart" : "mouseover", (event) => {
                                let target = event.target;
                                if (target.className == "wlmh_textStyle") target = event.target.parentDiv;
                                target.isTouching = true;
                                target.style.transform = "skewX(-5deg) scale(0.9)";
                            });
                            div.addEventListener(lib.device ? "touchend" : "mouseout", (event) => {
                                let target = event.target;
                                if (target.className == "wlmh_textStyle") target = event.target.parentDiv;
                                if (target.isTouching) {
                                    target.isTouching = false;
                                    target.style.transform = "skewX(-5deg) scale(1)";
                                }
                            });
                        }
                        //其余模式的区域模块处理
                        if (lib.config.mhjm_modes["length"] > 8) {
                            //本体默认的模式列表
                            var defaultModes = ['identity', 'guozhan', 'versus', 'connect', 'boss', 'doudizhu', 'single', 'chess', 'tafang', 'brawl', 'stone'];
                            //全模式列表
                            //创建区域模块
                            var specialZone = ui.create.div(".wlmh_specialZone", background);
                            specialZone.style.left = "5%";
                            background.specialZone = specialZone;
                            //创建图像区域
                            var specialZone_picture = ui.create.div(".wlmh_specialZone_picture", specialZone);
                            //监听当窗口宽高发生了变化时
                            var resizeFun = function() {
                                if (background.interval) clearInterval(background.interval);
                                background.interval_count = 0;
                                background.interval = setInterval(() => {
                                    //如果已不存在于页面上，进行移除
                                    if (!document.body.contains(specialZone_picture)) {
                                        window.removeEventListener("resize", resizeFun);
                                        clearInterval(background.interval);
                                        return;
                                    }
                                    //进行次数+1
                                    background.interval_count++;
                                    //进行个一百次后就可以移除了
                                    if (background.interval_count >= 100) clearInterval(background.interval);
                                    //修正图像区域的滚动位置
                                    specialZone_picture.scrollLeft = (specialZone_picture.offsetWidth * 0.95) * specialZone_picture.scrollIndex;
                                    specialZone_picture.previousScrollLeft = specialZone_picture.scrollLeft;
                                }, 10);
                            };
                            window.addEventListener("resize", resizeFun);
                            //电脑端适配
                            if (!lib.device) {
                                //移除滚动功能
                                specialZone_picture.style["overflow-x"] = "hidden";
                                //监听左右方向键，以切换上下一个模块
                                document.onkeydown = function(event) {
                                    //如果已不存在于页面上，进行移除
                                    if (!document.body.contains(specialZone_picture)) {
                                        document.onkeydown = null;
                                        return;
                                    }
                                    //ui.background为容器的情况下，取消后续流程
                                    if (ui.background.contains(background)) return;
                                    //如果不是左右方向键，取消后续流程
                                    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
                                    //左方向键处理
                                    if (event.key == "ArrowLeft") {
                                        //记录的模块位数-1
                                        specialZone_picture.scrollIndex--;
                                        //当前圆点恢复默认颜色
                                        specialZoneShows.circle[specialZoneShows.currentCircleIndex].style["background-color"] = "rgba(0, 0, 0, 0.9)";
                                        //切到上一个圆点，并染色
                                        specialZoneShows.currentCircleIndex--;
                                        //若已是第一个，直接切到末位
                                        if (!specialZoneShows.circle[specialZoneShows.currentCircleIndex]) specialZoneShows.currentCircleIndex = Object.keys(specialZoneShows.circle)["length"];
                                        specialZoneShows.circle[specialZoneShows.currentCircleIndex].style["background-color"] = "blue";
                                        //若已是第一位，进行特殊处理
                                        if (specialZone_picture.modules[specialZone_picture.scrollIndex - 1].firstOne) specialZone_picture.specialScrollLeft = "first";
                                    }
                                    //反之，右方向键处理
                                    else {
                                        //记录的模块位数+1
                                        specialZone_picture.scrollIndex++;
                                        //当前圆点恢复默认颜色
                                        specialZoneShows.circle[specialZoneShows.currentCircleIndex].style["background-color"] = "rgba(0, 0, 0, 0.9)";
                                        //切到下一个圆点，并染色
                                        specialZoneShows.currentCircleIndex++;
                                        //若已是最后一个，直接切到首位
                                        if (!specialZoneShows.circle[specialZoneShows.currentCircleIndex]) specialZoneShows.currentCircleIndex = 1;
                                        specialZoneShows.circle[specialZoneShows.currentCircleIndex].style["background-color"] = "blue";
                                        //若已是最后一位，进行特殊处理
                                        if (specialZone_picture.modules[specialZone_picture.scrollIndex - 1].lastOne) specialZone_picture.specialScrollLeft = "last";
                                    }
                                    //添加禁止，以免频繁触发
                                    specialZone_picture.scrollProhibit = true;
                                    //执行效果
                                    specialZone_picture.smoothScrollLeft(specialZone_picture, (specialZone_picture.offsetWidth * 0.95) * specialZone_picture.scrollIndex, 350);
                                    specialZone_picture.previousScrollLeft = (specialZone_picture.offsetWidth * 0.95) * specialZone_picture.scrollIndex;
                                    delete specialZone_picture.scrollProhibit;
                                };
                            }
                            //【封装函数】滚动的动画处理
                            //参数：移动元素、移动到的目标地点、持续时间
                            specialZone_picture.smoothScrollLeft = function(element, targetScrollLeft, duration) {
                                const start = performance.now();
                                const initialScrollLeft = element.scrollLeft;
                                const distance = targetScrollLeft - initialScrollLeft;

                                let animate = function(timestamp) {
                                    const timeElapsed = timestamp - start;
                                    const progress = Math.min(timeElapsed / duration, 1);
                                    const currentScrollLeft = initialScrollLeft + distance * progress;
                                    element.scrollLeft = currentScrollLeft;
                                    if (progress < 1) requestAnimationFrame(animate);
                                    else {
                                        //特殊处理
                                        if (element.specialScrollLeft) {
                                            //最后一位的情况，回到首位
                                            if (element.specialScrollLeft == "last") {
                                                element.scrollIndex = 1;
                                                element.scrollLeft = (element.offsetWidth * 0.95) * element.scrollIndex;
                                                element.previousScrollLeft = element.scrollLeft;
                                            }
                                            //反之，第一位的情况，回到末位
                                            else if (element.specialScrollLeft == "first") {
                                                element.scrollIndex = Object.keys(specialZone_picture.modules)["length"] - 2;
                                                element.scrollLeft = (element.offsetWidth * 0.95) * element.scrollIndex;
                                                element.previousScrollLeft = element.scrollLeft;
                                            }
                                            delete element.specialScrollLeft;
                                        }
                                    }
                                }
                                requestAnimationFrame(animate);
                            };
                            //对区域的滚动进行处理，用于切换模块
                            specialZone_picture.scrollIndex = 1;
                            specialZone_picture.previousScrollLeft = (specialZone_picture.offsetWidth * 0.95) * specialZone_picture.scrollIndex;
                            specialZone_picture.onscroll = function() {
                                //禁止情况下不生效
                                if (this.scrollProhibit) return;
                                //全模块列表
                                let modules = specialZone_picture.modules;
                                //当前模块
                                let module = modules[this.scrollIndex];
                                //添加禁止，以免频繁触发
                                this.scrollProhibit = true;
                                //添加一次性监听器，结束时触发
                                this.addEventListener(lib.device ? "touchend" : "mouseout", () => {
                                    //向右滚动的情况
                                    if (this.scrollLeft > this.previousScrollLeft) {
                                        //滚动到下一模块的情况
                                        if (this.scrollLeft > (specialZone_picture.offsetWidth * 0.95) * (this.scrollIndex + 1) - (specialZone_picture.offsetWidth / 2)) {
                                            this.scrollIndex++;
                                            //当前圆点恢复默认颜色
                                            specialZoneShows.circle[specialZoneShows.currentCircleIndex].style["background-color"] = "rgba(0, 0, 0, 0.9)";
                                            //切到下一个圆点，并染色
                                            specialZoneShows.currentCircleIndex++;
                                            //若已是最后一个，直接切到首位
                                            if (!specialZoneShows.circle[specialZoneShows.currentCircleIndex]) specialZoneShows.currentCircleIndex = 1;
                                            specialZoneShows.circle[specialZoneShows.currentCircleIndex].style["background-color"] = "blue";
                                        }
                                        //若已是最后一位，进行特殊处理
                                        if (modules[this.scrollIndex - 1].lastOne) this.specialScrollLeft = "last";
                                    }
                                    //反之，向左滚动的情况
                                    else if (this.scrollLeft < this.previousScrollLeft) {
                                        //滚动到上一模块的情况
                                        if (this.scrollLeft < (specialZone_picture.offsetWidth * 0.95) * this.scrollIndex - (specialZone_picture.offsetWidth / 2)) {
                                            this.scrollIndex--;
                                            //当前圆点恢复默认颜色
                                            specialZoneShows.circle[specialZoneShows.currentCircleIndex].style["background-color"] = "rgba(0, 0, 0, 0.9)";
                                            //切到上一个圆点，并染色
                                            specialZoneShows.currentCircleIndex--;
                                            //若已是第一个，直接切到末位
                                            if (!specialZoneShows.circle[specialZoneShows.currentCircleIndex]) specialZoneShows.currentCircleIndex = Object.keys(specialZoneShows.circle)["length"];
                                            specialZoneShows.circle[specialZoneShows.currentCircleIndex].style["background-color"] = "blue";
                                        }
                                        //若已是第一位，进行特殊处理
                                        if (modules[this.scrollIndex - 1].firstOne) this.specialScrollLeft = "first";
                                    }
                                    //执行效果
                                    specialZone_picture.smoothScrollLeft(this, (this.offsetWidth * 0.95) * this.scrollIndex, 350);
                                    this.previousScrollLeft = (this.offsetWidth * 0.95) * this.scrollIndex;
                                    delete this.scrollProhibit;
                                }, {
                                    once: true
                                });
                            };
                            //列表全图像模块
                            specialZone_picture.modules = {};
                            //多余模式的列表
                            var list2 = lib.config.mhjm_modes.slice(8);
                            //处理各模式的图像模块
                            for (var i = -1; i <= list2.length; i++) {
                                //额外创建的图像模块，用于过渡切换模式
                                if (i == -1) {
                                    i = list2.length - 1;
                                    var first = true;
                                }
                                if (i == list2.length) {
                                    i = 0;
                                    var last = true;
                                }
                                //创建图像模块
                                if (!first && !last) specialZone_picture.modules[i] = ui.create.div(".wlmh_specialZone_picture_image", specialZone_picture);
                                else {
                                    if (first) {
                                        specialZone_picture.modules[-1] = ui.create.div(".wlmh_specialZone_picture_image", specialZone_picture);
                                        specialZone_picture.modules[-1].firstOne = true;
                                    } else {
                                        specialZone_picture.modules[list2.length] = ui.create.div(".wlmh_specialZone_picture_image", specialZone_picture);
                                        specialZone_picture.modules[list2.length].lastOne = true;
                                    }
                                }
                                //定义一些变量
                                let module = last ? specialZone_picture.modules[list2.length] : specialZone_picture.modules[i];
                                if (first) module = specialZone_picture.modules[-1];
                                let mode = typeof list2[i] == "object" ? list2[i][0] : list2[i];
                                let translation = typeof list2[i] == "object" ? list2[i][1] : lib.mode[mode].name;
                                module.mode = mode;
                                module.translation = translation;
                                //各模块触发效果
                                module.onclick = function() {
                                    //移除监听器
                                    document.removeEventListener("visibilitychange", music.fun);
                                    //移除背景音乐
                                    music.remove();
                                    //点击音效
                                    game.oncePlayAudio("extension/HH优化/assets/startup/audio/", "click2", 1);
                                    //缩放伪动画效果
                                    this.style.transform = "translate(-50%, -50%) scale(0.9)";
                                    setTimeout(() => {
                                        //新建背景容器以覆盖
                                        var background = ui.create.div(".wlmh_background", list.preview ? ui.background : document.body);
                                        background.style.zIndex = "1000";
                                        //默认与游戏背景保持一致
                                        background.style["background-image"] = ui.background.style["background-image"];
                                        //指引模式
                                        game.saveConfig("mode", this.mode);
                                        game.reload();
                                    }, 150);
                                };
                                //拓展模式图像处理
                                if (!defaultModes.includes(mode)) {
                                    if (lib.mode[mode]?.splash?.startsWith("ext:")) module.setBackgroundImage(lib.mode[mode]["splash"].replace(/^ext:/, 'extension/'));
                                    else module.setBackgroundDB(lib.mode[mode]["splash"]);
                                }
                                //本体模式图像处理
                                else module.setBackgroundImage("image/splash/style2/" + mode + ".jpg");
                                //文字样式处理
                                module.textStyle = ui.create.div(".wlmh_textStyle", module);
                                module.textStyle.parentDiv = module;
                                module.textStyle.style["font-size"] = lib.device ? "30px" : "5vh";
                                module.textStyle.style["text-align"] = "center";
                                module.textStyle.style["font-family"] = "xinwei";
                                module.textStyle.style.height = "40%";
                                module.textStyle.style.width = "100%";
                                module.textStyle.style.left = "0";
                                module.textStyle.style.top = "60%";
                                module.textStyle.style.display = "flex";
                                module.textStyle.style["justify-content"] = "center";
                                module.textStyle.style["align-items"] = "center";
                                module.textStyle.innerHTML = translation;
                                //添加一个长按可缩放的伪动画监听效果
                                module.isTouching = false;
                                module.addEventListener(lib.device ? "touchstart" : "mouseover", (event) => {
                                    let target = event.target;
                                    if (target.className == "wlmh_textStyle") target = event.target.parentDiv;
                                    target.isTouching = true;
                                    target.style.transform = "translate(-50%, -50%) scale(0.9)";
                                });
                                module.addEventListener(lib.device ? "touchend" : "mouseout", (event) => {
                                    let target = event.target;
                                    if (target.className == "wlmh_textStyle") target = event.target.parentDiv;
                                    if (target.isTouching) {
                                        target.isTouching = false;
                                        target.style.transform = "translate(-50%, -50%)";
                                    }
                                });
                                //额外处理
                                if (first) {
                                    i = -1;
                                    first = undefined;
                                } else if (last) break;
                            }
                            //定义初始位置
                            specialZone_picture.scrollLeft = specialZone_picture.previousScrollLeft;
                            //其余模式的计数显示框
                            var specialZoneShows = ui.create.div(".wlmh_specialZoneShows", specialZone);
                            specialZoneShows.onclick = function() {
                                if (specialZoneShows.unclick) return;
                                specialZoneShows.unclick = true;
                                specialZoneShows.style.transform = "scale(1.75)";
                                var fun = function(event) {
                                    if (event.target.className == "wlmh_specialZoneShows") return;
                                    background.removeEventListener("click", fun);
                                    specialZoneShows.style.transform = "";
                                    delete specialZoneShows.unclick;
                                };
                                background.addEventListener("click", fun);
                            };
                            specialZoneShows.circle = {};
                            //创建各个圆点显示
                            for (var i = 1; i <= list2.length; i++) {
                                specialZoneShows.circle[i] = ui.create.div(".wlmh_specialZoneShows_circle", specialZoneShows);
                                specialZoneShows.circle[i].onclick = function() {
                                    //当前圆点恢复默认颜色
                                    specialZoneShows.circle[specialZoneShows.currentCircleIndex].style["background-color"] = "rgba(0, 0, 0, 0.9)";
                                    //切到该圆点，并染色
                                    specialZoneShows.currentCircleIndex = this.index;
                                    this.style["background-color"] = "blue";
                                    //调整图像模块数据
                                    specialZone_picture.scrollIndex = this.index;
                                    specialZone_picture.smoothScrollLeft(specialZone_picture, (specialZone_picture.offsetWidth * 0.95) * this.index, 350);
                                    specialZone_picture.previousScrollLeft = (specialZone_picture.offsetWidth * 0.95) * specialZone_picture.scrollIndex;
                                };
                                specialZoneShows.circle[i].index = i;
                                if (i == 1) {
                                    specialZoneShows.currentCircleIndex = i;
                                    specialZoneShows.circle[i].style["background-color"] = "blue";
                                }
                            };
                        }
                        //定义转变布局函数
                        background.turnFun = function() {
                            //记录已转变
                            background.turnRecord = true;
                            zone.style.left = "5%";
                            zone.style.right = "";
                            if (specialZone) { specialZone.style.left = ""; specialZone.style.right = "5%"; }
                            iconZone.style.left = "-72%";
                            var children = Array.from(iconZone.children);
                            for (var i = children.length - 1; i >= 0; i--) {
                                iconZone.appendChild(children[i]);
                                if (children[i].style["margin-right"]) {
                                    children[i].style["margin-right"] = "";
                                    children[i].style["margin-left"] = "1%";
                                }
                            }
                        };
                        //定义反转变布局函数
                        background.unturnFun = function() {
                            //删除转变记录
                            delete background.turnRecord;
                            zone.style.left = "";
                            zone.style.right = "2%";
                            if (specialZone) { specialZone.style.left = "5%"; specialZone.style.right = ""; }
                            iconZone.style.left = "3%";
                            var children = Array.from(iconZone.children);
                            for (var i = children.length - 1; i >= 0; i--) {
                                iconZone.appendChild(children[i]);
                                if (children[i].style["margin-left"]) {
                                    children[i].style["margin-left"] = "";
                                    children[i].style["margin-right"] = "1%";
                                }
                            }
                        };
                        //根据部分视频中人物靠右以调整区域位置的参数，更新必要
                        if (lib.config.wlmh_willTurnVideos && lib.config.wlmh_willTurnVideos.includes(background.videoName)) background.turnFun();
                    };
                    background.mainFun = main;
                }
                const showModes = () => {
                    if (main) { main(); main = undefined; }
                };
                const showLoop = () => {
                    if (startVideo) { startVideo.pause(); startVideo.remove(); delete background.startVideo; }
                    if (video) { video.style.display = ""; playStartupMedia(video, background); }
                };
                if (video) {
                    video.addEventListener("error", () => { video.remove(); showModes(); }, { once: true });
                    video.addEventListener("loadeddata", () => { if (!background.startVideo) showLoop(); }, { once: true });
                }
                if (startVideo) {
                    startVideo.style.display = "";
                    startVideo.onclick = showLoop;
                    startVideo.onended = showLoop;
                    startVideo.addEventListener("error", showLoop, { once: true });
                    playStartupMedia(startVideo, background);
                } else showLoop();
                playStartupMedia(music, background);
                showModes();
            };
            //——————————分割线——————————//
            if (lib.config.extension_HH优化_startupInterface === false) return;
            ui.qdmh_background?.remove();
            disposeStartupBackground(ui);
            //直接先覆盖一层页面，默认是龙纹背景
            var background = ui.create.div({
                position: "absolute",
                width: "100%",
                height: "100%",
                left: "0",
                top: "0",
                "background-repeat": "no-repeat",
                "background-size": "cover",
                "background-position": "center",
                "z-index": "999",
            }, ui.window || document.body);
            background.setBackgroundImage("extension/HH优化/image/background/big_26.png");
            ui.qdmh_background = background;
            //联机模式下移除覆盖页面
            Object.defineProperty(ui, "hall_button", {
                set: function(newValue) {
                    if (ui.qdmh_background) {
                        ui.qdmh_background.remove();
                        delete ui.qdmh_background;
                    };
                    this._inSplashValue = newValue;
                },
                get: function() {
                    return this._inSplashValue;
                },
                enumerable: true,
                configurable: true,
            });
            //使用Object.defineProperty()来定义window.inSplash属性
            Object.defineProperty(window, "inSplash", {
                set: function(newValue) {
                    if (!newValue) { disposeStartupBackground(ui); this._inSplashValue = newValue; return; }
                    //当window.inSplash被赋值时，执行效果（即美化启动界面）
                    ui.beautifyStartInterface({
                        music: (lib.config.extension_HH优化_backgroundMusicChoose || "Aira") + ".mp3",
                        volume: lib.config.volumn_background / 8,
                        video: (lib.config.extension_HH优化_backgroundVideoChoose || "孙尚香") + ".mp4",
                        zone: true,
                    });
                    this._inSplashValue = newValue;
                },
                get: function() {
                    return this._inSplashValue;
                },
                enumerable: true,
                configurable: true,
            });
        },
        config: {
            "startupInterface": {
                name: "启动界面美化",
                init: true,
                restart: true,
            },
            "showAnnouncements": {
                name: "<u>点击此处展出公告</u>",
                clear: true,
                onclick: function() {
                    game.mhjm_showAnnouncements();
                },
            },
            "previewEffect": {
                name: "<font color=orange>预览效果</font>",
                intro: "<li>选择一个你喜欢的样式，然后在背景中观赏一下当前的美化效果吧！",
                init: "none",
                item: {
                    "none": "关闭",
                    "default": "默认",
                    "style1": "仅背景欣赏",
                    "style2": "跳过开场动画",
                },
                onclick: function(item) {
                    game.saveConfig("extension_HH优化_previewEffect", item);
                    if (item == "none") {
                        disposeStartupBackground(ui);
                        ui.arena?.show();
                        if (ui.backgroundMusic) ui.backgroundMusic.play().catch(() => {});
                        return;
                    }
                    var data = {
                        music: (lib.config.extension_HH优化_backgroundMusicChoose || "Aira") + ".mp3",
                        volume: lib.config.volumn_background / 8,
                        video: (lib.config.extension_HH优化_backgroundVideoChoose || "孙尚香") + ".mp4",
                        zone: true,
                        preview: true,
                    }
                    if (item == "style1") delete data.zone;
                    else if (item == "style2") data.preview = item;
                    ui.beautifyStartInterface(data);
                },
            },
            "backgroundMusicChoose": {
                name: "背景音乐选择",
                intro: "<li>选择一个你喜欢的音乐，于背景中循环播放（自行导入文件请放置于HH优化的【assets/startup/music】文件夹内）<br><li>注：音乐音量与本体的背景音量保持一致",
                init: "Aira",
                item: {
                    "Aira": "Aira",
                },
                onclick: function(item) {
                    game.saveConfig("extension_HH优化_backgroundMusicChoose", item);
                    //动态修正
                    if (ui.beautifyStartInterface_background?.music) {
                        const background = ui.beautifyStartInterface_background;
                        background.music.src = lib.assetURL + startupAssetPath + "music/" + item + ".mp3";
                        playStartupMedia(background.music, background);
                    }
                },
            },
            "backgroundVideoChoose": {
                name: "背景视频选择",
                intro: "<li>选择一个你喜欢的视频，作为背景循环播放（自行导入文件请放置于HH优化的【assets/startup/video】文件夹内）",
                init: "孙尚香",
                item: {
                    "孙尚香": "孙尚香",
                },
                onclick: function(item) {
                    game.saveConfig("extension_HH优化_backgroundVideoChoose", item);
                    //重新启动
                    if (ui.beautifyStartInterface_background) {
                        var data = {
                            music: (lib.config.extension_HH优化_backgroundMusicChoose || "Aira") + ".mp3",
                            volume: lib.config.volumn_background / 8,
                            video: (item || "孙尚香") + ".mp4",
                            zone: true,
                            preview: !window.inSplash,
                        };
                        if (lib.config.extension_HH优化_previewEffect && lib.config.extension_HH优化_previewEffect == "style1") delete data.zone;
                        else if (lib.config.extension_HH优化_previewEffect == "style2") data.preview = "style2";
                        ui.beautifyStartInterface(data);
                    }
                },
            },
            "videoDisplayMode": {
                name: "视频显示模式",
                intro: "<li>点击来调整视频播放时的显示模式，默认为【适应】",
                init: "cover",
                item: {
                    "fill": "填充（无比例填充）",
                    "cover": "适应（覆盖填充）",
                },
                onclick: function(item) {
                    game.saveConfig("extension_HH优化_videoDisplayMode", item);
                    //动态修正
                    if (ui.beautifyStartInterface_background) {
                        const background = ui.beautifyStartInterface_background;
                        if (background.video) background.video.style.objectFit = item;
                        if (background.startVideo) background.startVideo.style.objectFit = item;
                    }
                },
            },
        },
    };
    return startup;
}
