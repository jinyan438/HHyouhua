// Adapted from 启动界面美化 1.2.1 by 缘伴随行 (GPL-3.0).
import { startupAssetPath, loadStartupMedia, disposeStartupBackground, prepareStartupVideo, playStartupMedia, defaultStartupMusic, startupMusicFile } from './startupMedia.js';
import { createStartupLobby } from './startupLobby.js';

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
            lib.init.css(lib.assetURL + startupAssetPath.slice(0, -1), "lobby");
            //——————————分割线——————————//
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
                // Four native lobby entries share the existing media lifecycle.
                var main = list.zone ? () => createStartupLobby({ lib, game, ui, get, _status, background }) : undefined;
                background.mainFun = main;
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
                    const returningFromSettlement = this.hhSettlementLobby;
                    delete this.hhSettlementLobby;
                    //当window.inSplash被赋值时，执行效果（即美化启动界面）
                    ui.beautifyStartInterface({
                        music: startupMusicFile(lib, lib.config.extension_HH优化_backgroundMusicChoose || defaultStartupMusic),
                        volume: lib.config.volumn_background / 8,
                        video: (lib.config.extension_HH优化_backgroundVideoChoose || "孙尚香") + ".mp4",
                        zone: true,
                        ...(returningFromSettlement ? { preview: "style2" } : {}),
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
                        music: startupMusicFile(lib, lib.config.extension_HH优化_backgroundMusicChoose || defaultStartupMusic),
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
                init: defaultStartupMusic,
                item: {
                    [defaultStartupMusic]: defaultStartupMusic,
                },
                onclick: function(item) {
                    game.saveConfig("extension_HH优化_backgroundMusicChoose", item);
                    //动态修正
                    if (ui.beautifyStartInterface_background?.music) {
                        const background = ui.beautifyStartInterface_background;
                        background.music.src = lib.assetURL + startupAssetPath + "music/" + startupMusicFile(lib, item);
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
                            music: startupMusicFile(lib, lib.config.extension_HH优化_backgroundMusicChoose || defaultStartupMusic),
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
