'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const screenSource = fs.readFileSync(path.join(root, 'assets/scripts/ui/ScreenManager.ts'), 'utf8');
const metaSource = fs.readFileSync(path.join(root, 'assets/scripts/ui/MetaPageUI.ts'), 'utf8');
const saveSelectSource = fs.readFileSync(path.join(root, 'assets/scripts/ui/SaveSelectUI.ts'), 'utf8');
const lobbySource = fs.readFileSync(path.join(root, 'assets/scripts/ui/LobbyUI.ts'), 'utf8');
const gameSource = fs.readFileSync(path.join(root, 'assets/scripts/core/GameManager.ts'), 'utf8');
const playerSource = fs.readFileSync(path.join(root, 'assets/scripts/entities/PlayerController.ts'), 'utf8');
const enemySource = fs.readFileSync(path.join(root, 'assets/scripts/entities/EnemyBase.ts'), 'utf8');
const bossSource = fs.readFileSync(path.join(root, 'assets/scripts/entities/BossController.ts'), 'utf8');
const particleSource = fs.readFileSync(path.join(root, 'assets/scripts/systems/ParticleManager.ts'), 'utf8');
const hudSource = fs.readFileSync(path.join(root, 'assets/scripts/ui/HUD.ts'), 'utf8');
const shopSource = fs.readFileSync(path.join(root, 'assets/scripts/ui/ShopUI.ts'), 'utf8');
const statsSource = fs.readFileSync(path.join(root, 'assets/scripts/ui/StatsPanel.ts'), 'utf8');
const touchSource = fs.readFileSync(path.join(root, 'assets/scripts/ui/TouchControls.ts'), 'utf8');
const inputSource = fs.readFileSync(path.join(root, 'assets/scripts/systems/InputManager.ts'), 'utf8');
const fitSource = fs.readFileSync(path.join(root, 'assets/scripts/core/ScreenFit.ts'), 'utf8');
const webShellSource = fs.readFileSync(path.join(root, 'build-templates/web-desktop/index.ejs'), 'utf8');
const webShellStyle = fs.readFileSync(path.join(root, 'build-templates/web-desktop/style.css'), 'utf8');
const webBuild = JSON.parse(fs.readFileSync(path.join(root, 'tools/build-web-desktop.json'), 'utf8'));
const webBuildMobile = JSON.parse(fs.readFileSync(path.join(root, 'tools/build-web-mobile.json'), 'utf8'));

test('首页标题与按钮为真实节点，独立按钮直接叠在场景上', () => {
    assert.match(screenSource, /setContentSize\(568, 410\)/);
    assert.match(screenSource, /new Node\('MenuActions'\)/);
    assert.doesNotMatch(screenSource, /menuPanelG/);
    assert.doesNotMatch(screenSource, /fillRect\(-284, -205, 568, 410\)/);
    assert.doesNotMatch(screenSource, /dockG\.fillRect/);
});

test('图鉴/成就档案入口迁入存档大厅,任务树入口已移除,首页不再展示', () => {
    // 两个元进度入口随存档会话进入大厅左侧"情报终端"；任务树按玩家要求下线
    assert.doesNotMatch(lobbySource, /'任务树'/);
    assert.doesNotMatch(lobbySource, /\['tasks'/);
    assert.match(lobbySource, /\['codex', '图鉴'/);
    assert.match(lobbySource, /\['achievements', '成就档案', GOLD\]/);
    assert.match(lobbySource, /this\._callbacks\.onMetaPage\(name\)/);
    // 首页已无元进度导航（MetaDock 整体移除）
    assert.doesNotMatch(screenSource, /MetaDock/);
    assert.doesNotMatch(screenSource, /'任务树'/);
    assert.doesNotMatch(screenSource, /'图鉴'/);
    assert.doesNotMatch(screenSource, /'成就档案'/);
    assert.doesNotMatch(screenSource, /transition\('menu', 'tasks'\)/);
    assert.doesNotMatch(screenSource, /transition\('menu', 'codex'\)/);
    assert.doesNotMatch(screenSource, /transition\('menu', 'achievements'\)/);
    // 元进度页返回目标从首页改为存档大厅
    assert.match(screenSource, /transition\(this\._currentMetaPage\(\), 'lobby'\)/);
    assert.match(metaSource, /'返回大厅'/);
    assert.doesNotMatch(metaSource, /'返回首页'/);
});

test('进入游戏直达作战大厅:档案切换在大厅内,传送门经地图和难度进选人,对局退出回大厅', () => {
    // 2026-10-20 流程改版：开始游戏直达大厅（档案选择挪进大厅，存档页变切换器）
    assert.match(gameSource, /onPlayPressed     = \(\) => \{\s*this\._setState\('lobby'\);\s*this\._maybeStartLobbyTutorial\(\);/);
    assert.match(gameSource, /onSaveSelectBack  = \(\) => this\._setState\('lobby'\)/, '档案列表返回回大厅');
    assert.match(gameSource, /onSwitchSave      = \(\) => this\._setState\('saveSelect'\)/, '大厅切换档案 → 档案列表');
    assert.match(lobbySource, /切换档案/, '大厅档案面板带切换入口');
    // 选定槽位 → 切换 SaveSystem 当前槽并进入大厅
    assert.match(gameSource, /onSlotPicked      = \(slot\) => \{[\s\S]*?SaveSystem\.selectSlot\(slot\);[\s\S]*?this\._setState\('lobby'\);/);
    // 大厅传送门 → 选图 → 图内章节 → 难度选择 → 选人页；难度页/选人页都可返回大厅
    assert.match(gameSource, /onLobbyPortal     = \(\) => this\._setState\('mapSelect'\)/, '传送门先进选图页');
    assert.match(gameSource, /onMapPicked        = \(mapId\) => \{[\s\S]*?this\._selectedMap = mapId;[\s\S]*?this\._setState\('chapterSelect'\)/, '选图后进图内章节页');
    assert.match(gameSource, /onChapterPicked    = \(chapterId\) => \{[\s\S]*?this\._selectedChapter = chapterId;[\s\S]*?this\._setState\('difficultySelect'\)/, '选章节后进难度选择');
    assert.match(gameSource, /onMapBack          = \(\) => this\._setState\('lobby'\)/, '选图页返回大厅');
    assert.match(gameSource, /onQueryChapterUnlock = \(\) => SaveSystem\.unlockedChapterCount\(\)/, '章节解锁链查询');
    assert.match(screenSource, /_buildMapSelectPanel\(\);/, '选图页构建');
    assert.match(screenSource, /_buildChapterSelectPanel\(\);/, '图内章节页构建');
    assert.match(screenSource, /'选择作战地图'/, 'v5 选图页标题');
    assert.match(screenSource, /六图 × 每图五章 · 一局一章 15 波/, '一局一章副标题');
    assert.doesNotMatch(screenSource, /无尽 · 天罚循环/, '无尽入口卡已按玩家要求移除');
    assert.match(gameSource, /onDifficultyPicked = \(d\) => \{[\s\S]*?this\._difficulty = d;[\s\S]*?this\._setState\('charSelect'\);/);
    assert.match(gameSource, /onDifficultyBack  = \(\) => this\._setState\('lobby'\)/);
    assert.match(gameSource, /onCharSelectBack  = \(\) => this\._setState\('lobby'\)/);
    // 状态机加入新状态并显示对应面板
    assert.match(gameSource, /'menu' \| 'saveSelect' \| 'lobby' \| 'difficultySelect' \| 'charSelect' \| 'playing'/);
    assert.match(gameSource, /case 'saveSelect':[\s\S]*?this\._screenMgr\.show\('saveSelect'\)/);
    assert.match(gameSource, /case 'lobby':[\s\S]*?this\._screenMgr\.show\('lobby'\)/);
    assert.match(gameSource, /onSaveSelectBack  = \(\) => this\._setState\('lobby'\)/, '存档页(切换器)返回回大厅');
    assert.match(gameSource, /onLobbyBack\s*= \(\) => this\._setState\('menu'\)/);
    assert.match(screenSource, /onBack: \(\) => this\.onSaveSelectBack\?\.\(\)/);
    assert.match(screenSource, /onBack: \(\) => this\.onLobbyBack\?\.\(\)/);
    assert.match(gameSource, /case 'difficultySelect':[\s\S]*?this\._screenMgr\.show\('difficultySelect'\)/);
    // 难度选择页由 DIFFICULTIES 数据驱动四张卡；测试房间不注入难度
    assert.match(screenSource, /DIFFICULTIES\.forEach/);
    assert.match(gameSource, /this\._difficulty = undefined;/);
    // 对局内退出按会话来源分流：正式局回大厅、测试房回首页
    assert.match(gameSource, /this\._setState\(this\._pauseReturn === 'testRoom' \? 'menu' : 'lobby'\)/);
    assert.match(gameSource, /this\._pauseReturn = 'playing';/);
    assert.match(gameSource, /this\._pauseReturn = 'testRoom';/);
    // 启动时把旧单档案一次性迁移进 1 号槽
    assert.match(gameSource, /SaveSystem\.migrateLegacyProfile\(\)/);
    // 选人页新增返回大厅按钮
    assert.match(screenSource, /'返回大厅', -540, 320, 160,\s*sys\.hasFeature\(sys\.Feature\.INPUT_TOUCH\) \? 72 : 42/);
    assert.match(screenSource, /onCharSelectBack\?\.\(\)/);
});

test('存档选择页:3槽卡片,空槽新建/已有槽继续,删除两步确认', () => {
    assert.match(saveSelectSource, /'选择存档'/);
    assert.match(saveSelectSource, /SaveSystem\.listSlots\(\)/);
    assert.match(saveSelectSource, /this\._callbacks\.onSlotPicked\(slot\)/);
    // 已有槽展示进度概览，空槽显示"+"引导
    assert.match(saveSelectSource, /总局数 \$\{p\.totalRuns\}/);
    assert.match(saveSelectSource, /成就 \$\{achCount\}\/\$\{ACHIEVEMENTS\.length\}/);
    assert.match(saveSelectSource, /最后游玩/);
    assert.match(saveSelectSource, /点按新建存档/);
    // 删除两步确认：第一次 armed 变红,第二次才真正删档并刷新
    assert.match(saveSelectSource, /'确认删除'/);
    assert.match(saveSelectSource, /SaveSystem\.deleteSlot\(view\.slot\)/);
    assert.match(saveSelectSource, /this\.refresh\(\);/);
});

test('存档大厅:右侧动画传送门,点击进入选人,左侧展示当前存档概要', () => {
    assert.match(lobbySource, /'作战大厅'/);
    assert.match(lobbySource, /'出击传送门'/);
    assert.match(lobbySource, /this\._callbacks\.onPortalPressed\(\)/);
    // 传送门锚定在画布右半区,由 ScreenManager.update 逐帧驱动旋转符文环
    assert.match(lobbySource, /new Vec3\(430, -20, 0\)/);
    assert.match(lobbySource, /update\(dt: number\)/);
    assert.match(lobbySource, /this\._drawPortal\(this\._portalT\)/);
    assert.match(screenSource, /this\._lobby\?\.update\(dt\)/);
    // 左侧存档概要读取当前选中槽
    assert.match(lobbySource, /SaveSystem\.currentSlot\(\)/);
    assert.match(lobbySource, /SaveSystem\.load\(\)/);
    // 大厅显示时刷新概要;存档选择页显示时刷新槽位卡
    assert.match(screenSource, /name === 'saveSelect'[\s\S]*?this\._saveSelect\.refresh\(\)/);
    assert.match(screenSource, /name === 'lobby'[\s\S]*?this\._lobby\.refresh\(\)/);
});

test('任务树页与章节任务线已按玩家要求整体移除', () => {
    // 元进度页只剩图鉴/成就两页，无任务分支/详情节点
    assert.doesNotMatch(metaSource, /'主线任务'/);
    assert.doesNotMatch(metaSource, /'支线任务'/);
    assert.doesNotMatch(metaSource, /'挑战任务'/);
    assert.doesNotMatch(metaSource, /QuestBranch/);
    assert.doesNotMatch(metaSource, /questsByBranch/);
    // 章节选择页无任务线连线与任务行
    assert.doesNotMatch(screenSource, /QuestLine/);
    assert.doesNotMatch(screenSource, /_questLineGfx/);
    assert.doesNotMatch(screenSource, /任务：/);
    assert.doesNotMatch(screenSource, /推进任务线/);
    // MetaProgressionDB 只导出图鉴数据
    const mpSource = fs.readFileSync(path.join(root, 'assets/scripts/data/MetaProgressionDB.ts'), 'utf8');
    assert.doesNotMatch(mpSource, /QUESTS/);
    assert.doesNotMatch(mpSource, /QuestDef/);
});

test('图鉴以四类单位分页，原画和详情可阅读', () => {
    for (const type of ["'hero'", "'boss'", "'miniboss'", "'grunt'"]) assert.ok(metaSource.includes(type));
    assert.match(metaSource, /_turnCodexPage/);
    assert.match(metaSource, /defs\.slice\(this\._codexPage \* 6/);
    assert.match(metaSource, /loadPortraitArt\(card, def\.artKey/);
    assert.match(metaSource, /fitPortraitFrame\(this\._codexArtSprite/);
    assert.match(metaSource, /发现地 \/ /);
    assert.match(screenSource, /ui_hero_display_\$\{def\.id\}/, '选人页使用专门绘制的高清展示图');
});

test('成就墙按稀有度页签重建(2026-10-19定稿),排版游标=本地顶缘,未解锁置灰', () => {
    // 页签 = 普通/稀有/史诗/传奇（玩家定稿：不再按 挑战/探索/收集 分类分组）
    assert.match(metaSource, /_rebuildAchievementTabs/, '页签重建');
    assert.match(metaSource, /\['普通', '稀有', '史诗', '传奇'\]/, '页签即四档稀有度');
    assert.match(metaSource, /_achieveRarity/, '选中态按稀有度记忆');
    assert.match(metaSource, /_rebuildAchievementCards/, '卡片按页签重建');
    assert.match(metaSource, /SaveSystem\.allAchievements\(\)/, '数据走后台合并列表');
    assert.match(metaSource, /a\.rarity === this\._achieveRarity/, '页签过滤本稀有度成就');
    assert.match(metaSource, /`ui_icon_\$\{def\.artKey\}`/);
    assert.match(metaSource, /`奖励  \$\{def\.reward\}`/);
    assert.match(metaSource, /已解锁 \$\{unlocked\} \/ \$\{total\}/);
    // 排版游标从内容节点本地顶缘(contentH/2)起步——contentH 顶缘会把整卡
    // 顶出 Mask 视口（2026-10-19 修复"还有遮掩"）
    assert.match(metaSource, /let y = contentH \/ 2 - 6/);
    // 内容高度按"行数"（每行3张）估算，不再按卡片张数
    assert.match(metaSource, /Math\.ceil\(list\.length \/ 3\)/);
    // 未解锁整卡置灰 / 解锁彩色
    assert.match(metaSource, /view\.reward\.color = done \? GOLD : new Color\(/, '奖励行随解锁状态变色');
    // 滚动容器：Mask 视口 + 内容节点钳制滚动 + 滚轮/拖拽与滚动条（修复"下翻不了"）
    assert.match(metaSource, /AchieveViewport/);
    assert.match(metaSource, /Mask\.Type\.GRAPHICS_STENCIL/);
    assert.match(metaSource, /MOUSE_WHEEL/);
    assert.match(metaSource, /this\._achieveScroll = Math\.max\(0, Math\.min\(this\._achieveMaxScroll, s\)\)/);
    assert.match(metaSource, /AchieveScrollbar/);
});

test('设置页接入后台管理入口,面板含密码门/参数配置/成就管理', () => {
    const adminSource = fs.readFileSync(path.join(root, 'assets/scripts/ui/AdminUI.ts'), 'utf8');
    const configSource = fs.readFileSync(path.join(root, 'assets/scripts/data/GameConfig.ts'), 'utf8');
    const adminData = fs.readFileSync(path.join(root, 'assets/scripts/systems/AchievementAdmin.ts'), 'utf8');
    // 设置页入口
    assert.match(screenSource, /'后台管理'/);
    assert.match(screenSource, /_adminUI\?\.open\(\)/);
    // 密码门与管理员身份
    assert.match(adminSource, /请输入管理员密码/);
    assert.match(adminSource, /isAdminUnlocked/);
    assert.match(adminSource, /退出管理员/);
    assert.match(configSource, /DEFAULT_ADMIN_PASSWORD = 'hex2026'/);
    // 页签1 系统参数：注册表驱动滑条,改即存,恢复默认
    assert.match(adminSource, /_renderConfigTab/);
    assert.match(adminSource, /GameConfig\.set\(item\.key, v\)/);
    assert.match(adminSource, /全部恢复默认/);
    assert.match(configSource, /hexblast_admin_config_v1/);
    // 页签2 成就管理：稀有度分组（2026-10-19 分类改版）/新增/编辑/下架/删除
    assert.match(adminSource, /_renderAchievementsTab/);
    assert.match(adminSource, /\+ 新增成就/);
    assert.match(adminSource, /稀有度（分组）/, '左栏按稀有度分组');
    assert.doesNotMatch(adminSource, /新建分类/, '分类体系已移除');
    assert.match(adminSource, /AchievementAdmin\.setOverride/);
    assert.match(adminSource, /AchievementAdmin\.deleteCustom/);
    assert.match(adminData, /hexblast_admin_achievements_v1/);
    assert.match(adminData, /retired/);
    // 参数在公式出口消费（抽点验证）
    const economySource = fs.readFileSync(path.join(root, 'assets/scripts/systems/Economy.ts'), 'utf8');
    assert.match(economySource, /GameConfig\.get\('goldGainMult'\)/);
    const waveSource = fs.readFileSync(path.join(root, 'assets/scripts/data/WaveData.ts'), 'utf8');
    assert.match(waveSource, /GameConfig\.get\('waveCountMult'\)/);
    const gameMgr = fs.readFileSync(path.join(root, 'assets/scripts/core/GameManager.ts'), 'utf8');
    assert.match(gameMgr, /GameConfig\.get\('coreCoinsRate'\)/);
    assert.match(gameMgr, /GameConfig\.get\('freeRefreshCount'\)/);
});

test('英雄名单点击只切换预览，出战必须确认且锁定英雄不能开局', () => {
    assert.match(screenSource, /tile\.on\(Node\.EventType\.TOUCH_END, \(\) => focusHero\(i\)/);
    assert.match(screenSource, /if \(def\.unlocked\) this\.onCharSelected\?\.\(def\)/);
    assert.match(screenSource, /UI_PALETTE\.reward, locked/);
    assert.match(screenSource, /def\.unlockHint/);
});

test('英雄介绍弹窗展示被动与Q/E/R详细描述、冷却与基础属性', () => {
    // 入口：卡片「英雄介绍」按钮打开 charDetail 模态弹窗
    assert.match(screenSource, /'英雄介绍'/);
    assert.match(screenSource, /detail\.on\(Node\.EventType\.TOUCH_END,\s*\(\) => this\.showCharDetail\(def\), this\);/);
    assert.match(screenSource, /'charDetail'/);
    // 遮罩拦截触摸，防止点击穿透到背后的选人卡
    assert.match(screenSource, /const block = \(ev: any\) => \{ ev\.propagationStopped = true; \};/);
    // 技能标题带键位与冷却；冷却支持按角色定制（qCd/eCd），缺省回落共享常量
    assert.match(screenSource, /`Q · \$\{splitSkillText\(def\.skills\.q\)\[0\]\} · 冷却 \$\{def\.qCd \?\? SKILL_Q_CD\} 秒`/);
    assert.match(screenSource, /`E · \$\{splitSkillText\(def\.skills\.e\)\[0\]\} · 冷却 \$\{def\.eCd \?\? SKILL_E_CD\} 秒`/);
    assert.match(screenSource, /`R · \$\{splitSkillText\(def\.skills\.r\)\[0\]\} · 充能 \$\{def\.ultCd\} 秒`/);
    // 详细效果说明来自「名称 — 说明」的说明段
    assert.match(screenSource, /splitSkillText\(def\.skills\.q\)\[1\]/);
    // 基础属性与立绘
    assert.match(screenSource, /攻击方式  \$\{def\.attackType === 'melee' \? '近战' : '远程'\}/);
    assert.match(screenSource, /loadArtSprite\(`ui_hero_display_\$\{def\.id\}`/);
    assert.match(screenSource, /ui_icon_\$\{def\.skillIcons/);
    // 弹窗内可直接出战或返回
    assert.match(screenSource, /if \(this\._detailDef\) this\.onCharSelected\?\.\(this\._detailDef\);/);
    assert.match(screenSource, /\(\) => this\.hide\('charDetail'\), this\);/);
});

test('英雄介绍弹窗以大幅立绘和四张技能卡呈现，文字保持可读', () => {
    assert.match(screenSource, /this\._detailTitle\.fontSize = 32/);
    assert.match(screenSource, /this\._detailStats\.fontSize = 16/);
    assert.match(screenSource, /this\._detailStats\.lineHeight = 23/);
    assert.match(screenSource, /createPortraitViewport\(dlg, 'HeroDetailPortrait', 230, 230/);
    assert.match(screenSource, /for \(const y of \[127, 27, -73, -173\]\)/);
    assert.match(screenSource, /tap\.on\(Node\.EventType\.TOUCH_END, \(\) => this\._showCharSkillDetail\(k\)\)/);
    assert.match(screenSource, /this\._detailSkillFullDesc\.string = slot === 0 \? def\.desc : skill!\[1\]/);
    assert.match(screenSource, /hl\.fontSize = 19/);
    assert.match(screenSource, /dl\.fontSize = 16/);
    assert.match(screenSource, /dl\.lineHeight = 24/);
    // 桌面保持52px，触屏增至72px且左右留缝。
    assert.match(screenSource, /'选择出战', -174, -268,\s*260, touch \? 72 : 52/);
    assert.match(screenSource, /'返回', 174, -268,\s*260, touch \? 72 : 52/);
    // 只检查详情弹窗的说明 Label；地图页另有独立的 15px 描述。
    const detailSource = screenSource.slice(screenSource.indexOf('private _buildCharDetailPanel()'),
        screenSource.indexOf('private _buildGameoverPanel()'));
    assert.doesNotMatch(detailSource, /dl\.fontSize = 1[345]/);
});

test('玩家护盾在粒子上层包住角色，敌人持续护盾仍使用能量壳', () => {
    assert.match(gameSource, /e\.shieldActive && e\.shieldHp > 0 && e\.maxShieldHp > 0/);
    assert.match(gameSource, /g\.arc\(ex, ey, shieldR \+ 2, start, start \+ 0\.52, false\)/);
    assert.match(gameSource, /p\.maxShield > 0/);
    assert.match(gameSource, /const shieldR = Math\.max\(44,/);
    assert.match(gameSource, /g\.arc\(px, py, shieldR \+ 2\.5, start, start \+ 0\.48, false\)/);
    assert.match(gameSource, /ParticleLayer 位于所有实体之上/);
});

test('战斗角色关闭auto-trim，避免裁剪框被强塞为正方形后横向拉宽', () => {
    assert.match(playerSource, /this\.sprite\.trim = false/);
});

test('玩家生命、护盾与Boss条使用独立区域并钳制宽度', () => {
    assert.match(hudSource, /Math\.min\(1, d\.shield \/ d\.maxShield\)/);
    assert.match(hudSource, /'HpFg', 95, 25/);
    assert.match(hudSource, /'ShieldFg', 114, 7/);
    assert.match(hudSource, /'HpLbl', 201, 34, 208, 22, 16/);
    assert.match(hudSource, /'ShieldLbl', 251, 11, 66, 16, 11/);
    assert.match(hudSource, /Math\.max\(0, Math\.ceil\(d\.hp\)\)/);
    assert.match(hudSource, /Math\.max\(0, Math\.ceil\(d\.shield\)\)/);
    assert.match(hudSource, /BossRoot', -this\.BOSS_W \/ 2, 267/);
    assert.match(hudSource, /'BossLbl', this\.BOSS_W \/ 2, 26/);
    assert.match(hudSource, /this\._portraitId !== id/);
    assert.match(hudSource, /Mask\.Type\.GRAPHICS_STENCIL/);
    assert.match(hudSource, /this\._moveHintRoot\.active = v/);
});

test('商店使用不透明独立面板，神秘强化作为二级模态弹窗', () => {
    assert.match(shopSource, /drawHexPanel\(pg, -340, -320, 680, 640, UI_PALETTE\.muted, 252\)/);
    assert.match(shopSource, /resume\(\) \{[\s\S]*this\.node\.active = true;[\s\S]*this\.fitToVisible\(\)/);
    assert.match(gameSource, /case 'augment':[\s\S]*this\._shopUI\.hide\(\)[\s\S]*this\._shopUI\.resume\(\)/);
});

test('炮台使用固定俯视底座与独立旋转炮筒并保留接触阴影', () => {
    assert.match(gameSource, /new SpriteNodePool\(this\._gameLayer, 24, 'TurretBase'/);
    assert.match(gameSource, /new SpriteNodePool\(this\._gameLayer, 24, 'TurretBarrel'/);
    assert.match(gameSource, /applyArtSprite\(baseSp, 'turret_base_vivian'\)/);
    assert.match(gameSource, /applyAnimationFrame\(barrelSp, turretClip, turretClip\.frames\[fireIndex\]\)/);
    assert.match(gameSource, /barrelTransform\.setAnchorPoint\(0\.36, 0\.5\)/);
    assert.match(gameSource, /barrel\.setRotationFromEuler/);
    assert.doesNotMatch(gameSource, /base\.setRotationFromEuler/);
    assert.doesNotMatch(gameSource, /Math\.sin\(this\._visualTime \* 4 \+ t\.x\)/);
    assert.match(gameSource, /const deployAim = Math\.atan2\(this\._input\.mouse\.y - player\.y/);
    assert.match(gameSource, /const deployDistance = 68/);
    assert.match(gameSource, /fanIndex \* 0\.62/);
    assert.doesNotMatch(gameSource, /followOwner \? followSide \* 52 : \(Math\.random\(\) - 0\.5\) \* 100/);
    assert.match(gameSource, /g\.ellipse\(tx, ty - r \* 0\.72, r \* 1\.15, r \* 0\.34\)/);
});

test('移动端虚拟操控：左下角常驻静态摇杆，触摸可浮动锚定且y轴翻转', () => {
    // 摇杆区占画布左半（560×580），顶部避开HUD
    assert.match(touchSource, /new Node\('StickZone'\)/);
    assert.match(touchSource, /setPosition\(new Vec3\(-360, -70, 0\)\)/);
    assert.match(touchSource, /setContentSize\(560, 580\)/);
    // 静态摇杆常驻左下角：onLoad即显示在默认位，松手回到默认位并保持可见
    assert.match(touchSource, /private _joyHomeX = -450;/);
    assert.match(touchSource, /private _joyHomeY = -190;/);
    assert.match(touchSource, /this\._joyRoot\.setPosition\(new Vec3\(this\._joyHomeX, this\._joyHomeY, 0\)\);\s*\n\s*this\._joyRoot\.active = true;\s*\n\s*this\._drawJoyBase\(\);/);
    assert.match(touchSource, /_onStickEnd[\s\S]*?this\._joyHomeX, this\._joyHomeY[\s\S]*?this\._joyRoot\.active = true;[\s\S]*?this\._input\?\.setStick\(0, 0\);/);
    assert.match(touchSource, /Node\.EventType\.TOUCH_CANCEL, this\._onStickEnd/);
    // 拖动钳制在STICK_R内；UI坐标y向上→画布y向下需取负
    assert.match(touchSource, /this\._input\?\.setStick\(dx \/ this\.STICK_R, -dy \/ this\.STICK_R\);/);
});

test('技能按钮与A图同排装甲方框,按下即触发且带冷却显示', () => {
    assert.match(touchSource, /q: \{ fromRight: -240, y: -276, r: 26 \}/);
    assert.match(touchSource, /e: \{ fromRight: -150, y: -276, r: 26 \}/);
    assert.match(touchSource, /r: \{ fromRight: -60, y: -276, r: 26 \}/);
    assert.match(hudSource, /private readonly SKILL_R = 26/);
    assert.match(hudSource, /right - 240 \+ i \* 90/);
    assert.match(touchSource, /drawCombatSkill\(g, btn\.radius, ratio\)/);
    assert.match(hudSource, /drawCombatSkill\(g, this\.SKILL_R, ratio\)/);
    // 按下(TOUCH_START)即出手，与键盘Q/E/R同一按下沿语义
    assert.match(touchSource, /this\._input\?\.fireSkillPressed\(slot\);/);
    // 冷却环与数字：Q/E显示剩余秒数，R显示充能百分比
    assert.match(touchSource, /btn\.slot === 'r'[\s\S]*Math\.round\(ratio \* 100\)\}%/);
    assert.match(touchSource, /Math\.max\(1, Math\.ceil\(sk\.cd\)\)/);
    // 触屏端才显示摇杆与技能按钮
    assert.match(touchSource, /sys\.hasFeature\(sys\.Feature\.INPUT_TOUCH\)/);
});

test('移动端默认横屏全屏：竖屏遮罩提示旋转,首次触摸请求全屏并锁定横屏', () => {
    // 竖屏检测：按物理画布比例每帧切换遮罩
    assert.match(touchSource, /view\.getFrameSize\(\)/);
    assert.match(touchSource, /f\.height > f\.width/);
    assert.match(touchSource, /请横屏游玩/);
    assert.match(touchSource, /new Node\('RotateHint'\)/);
    // 首次触摸（全局手势）请求全屏：画布优先、documentElement兜底；成功才置位、失败可重试
    assert.match(touchSource, /input\.on\(Input\.EventType\.TOUCH_START, this\._tryFullscreen, this\);/);
    assert.match(touchSource, /tryTarget\(game\?\.canvas\)\.catch\(\(\) => tryTarget\(doc\.documentElement\)\)/);
    assert.match(touchSource, /t\?\.requestFullscreen \|\| t\?\.webkitRequestFullscreen/);
    assert.match(touchSource, /\.then\(\(\) => \{\s*this\._fsRequested = true;/);
    assert.match(touchSource, /lock\?\.\('landscape'\)/);
    assert.match(touchSource, /this\._fsRequested \|\| !this\._touchMode \|\| !sys\.isBrowser/);
    // 遮罩逃生口：全屏不可用（微信等）时不会困死在遮罩上
    assert.match(touchSource, /继续游戏（竖屏小窗）/);
    assert.match(touchSource, /this\._hintDismissed = true;/);
    assert.match(touchSource, /!this\._hintDismissed && f\.height > f\.width/);
    // 黑屏修复：全屏/旋转分多步改视口，跟随窗口尺寸并多档延迟重设适配（动态策略）
    assert.match(touchSource, /view\.resizeWithBrowserSize\(true\)/);
    assert.match(touchSource, /applyScreenPolicy\(\);/);
    assert.match(touchSource, /setTimeout\(apply, 150\);/);
    assert.match(touchSource, /setTimeout\(apply, 400\);/);
    assert.match(touchSource, /fullscreenchange/);
    assert.match(touchSource, /orientationchange/);
    // Web Mobile构建配置锁定横屏与1280×720
    assert.equal(webBuildMobile.platform, 'web-mobile');
    assert.equal(webBuildMobile.packages['web-mobile'].orientation, 'landscape');
    assert.deepEqual(webBuildMobile.designResolution, { width: 1280, height: 720, policy: 4 });
});

test('右上角常驻「暂停/属性」按钮,触屏端替代Esc/M键', () => {
    assert.match(touchSource, /mk\('暂停', \(\) => this\.onPausePressed/);
    assert.match(touchSource, /mk\('属性', \(\) => this\.onStatsPressed/);
    // GameManager接线：暂停进暂停面板（属性面板开着时则返回战斗）；属性按钮为开关
    assert.match(gameSource, /this\._touchUI\.onPausePressed = \(\) => \{[\s\S]*?this\._pauseCombat\(\);/);
    assert.match(gameSource, /if \(this\.state === 'stats'\) this\._setState\(this\._pauseReturn\);/);
    assert.match(gameSource, /this\._touchUI\.onStatsPressed/);
    // 战斗/属性面板期间常驻，其它状态隐藏
    assert.match(gameSource, /this\._touchUI\.node\.active  = \(s === 'playing' \|\| s === 'testRoom' \|\| s === 'stats'\);/);
    assert.match(gameSource, /this\._touchUI\.refresh\(this\._player\);/);
    // 触屏端HUD右下技能环由触摸按钮替代
    assert.match(gameSource, /this\._hud\.setSkillRingsVisible\(!sys\.hasFeature\(sys\.Feature\.INPUT_TOUCH\)\);/);
});

test('全面屏横屏铺满：宽于16:9用FIXED_HEIGHT横向延展,边缘控件按可见宽度锚定', () => {
    // 策略动态选择：宽屏FIXED_HEIGHT铺满全宽，更方的屏回退SHOW_ALL保高
    assert.match(fitSource, /FIXED_HEIGHT : ResolutionPolicy\.SHOW_ALL/);
    assert.match(fitSource, /export function visibleDesignWidth/);
    assert.match(gameSource, /applyScreenPolicy\(\);/);
    // 战斗背景与调色层按可见宽度铺满（resize后由 onViewResized 重新铺）
    assert.match(gameSource, /private _fitBackgroundToVisible/);
    // resize 后除铺满背景外，还要强制刷新全部 Label（最大化窗口后字形不跟随缩放的修复）
    assert.match(gameSource, /this\._touchUI\.onViewResized = \(\) => \{[\s\S]*?this\._fitBackgroundToVisible\(\);[\s\S]*?this\._refreshLabelsAfterResize\(\);/);
    assert.match(gameSource, /refreshAllLabels/);
    assert.match(fs.readFileSync(path.join(root, 'assets/scripts/core/LabelUtils.ts'), 'utf8'), /export function refreshAllLabels/);
    // 触控层：摇杆/触摸区贴左缘，技能按钮与右上角按钮贴右缘
    assert.match(touchSource, /private _layoutByVisible\(\)/);
    assert.match(touchSource, /this\._joyHomeX = -right \+ 190;/);
    assert.match(touchSource, /right \+ a\.fromRight,[\s\S]*a\.y \+ \(this\._testRoomMode \? 110 : 0\)/);
    assert.match(touchSource, /right - 35, 332/);
    assert.match(touchSource, /const width = this\._touchMode \? 76 : 38;/);
    assert.match(gameSource, /this\._hud\.fitToVisible\(\)/);
    assert.match(hudSource, /-right \+ 14, 274/);
    // 全面屏的触点坐标按实际可见宽度居中，否则动态摇杆会向右错位。
    assert.match(touchSource, /loc\.x - visibleDesignWidth\(\) \/ 2/);
    // 主菜单立绘按可见宽度铺满，页面底板超宽绘制避免黑边
    assert.match(screenSource, /const menuW = Math\.max\(1280, visibleDesignWidth\(\)\);/);
    assert.match(screenSource, /bg\.fillRect\(-1600, -360, 3200, 720\)/);
});

test('PC端WASD与虚拟摇杆在moveX/moveY合并,键盘优先', () => {
    assert.match(inputSource, /return k !== 0 \? k : this\._stickX;/);
    assert.match(inputSource, /return k !== 0 \? k : this\._stickY;/);
    assert.match(inputSource, /fireSkillPressed\(slot: 'q' \| 'e' \| 'r'\)/);
    assert.match(inputSource, /isKeyQPressed\(\): boolean \{ return this\.justPressedCode\(KeyCode\.KEY_Q\) \|\| this\._virtualPressedSlot\('q'\); \}/);
    // 冲刺接口已移除
    assert.doesNotMatch(inputSource, /isDash/);
    assert.doesNotMatch(playerSource, /isDash|_dashCd|phaseDash/);
});

test('Web Desktop设计画布保持1280×720，发布外壳铺满宽屏', () => {
    assert.deepEqual(webBuild.designResolution, { width: 1280, height: 720, policy: 4 });
    assert.deepEqual(webBuild.packages['web-desktop'].resolution, { designWidth: 1280, designHeight: 720 });
    assert.match(webShellSource, /<title>Hexblast<\/title>/);
    assert.doesNotMatch(webShellSource, /class="header"|Created with Cocos Creator/);
    assert.match(webShellStyle, /width: 100vw !important/);
    assert.match(webShellStyle, /height: 100vh !important/);
    assert.match(gameSource, /fillLeft\.setPosition\(new Vec3\(-CANVAS_W, 0, 0\)\)/);
    assert.match(gameSource, /world\.addComponent\(UITransform\)\.setContentSize\(CANVAS_W, CANVAS_H\)/);
    assert.match(webShellStyle, /overflow: hidden/);
    assert.match(webShellStyle, /border: 0/);
});

test('水分身、影分身与炮台都使用真实逐帧动作', () => {
    assert.match(gameSource, /_initSummonActor\(c, 'enemy_boss_abyss'/);
    assert.match(gameSource, /_initSummonActor\(c, player\.spriteKey \?\? `char_token_\$\{player\.charId\}`/);
    assert.match(gameSource, /c\._actorRequested = 'attack'/);
    assert.match(gameSource, /applyAnimationFrame\(sprite, t\._actorAnimation\.clip, t\._actorAnimation\.currentFrame\)/);
    assert.match(gameSource, /EFFECT_ANIMATIONS\.fx_turret_barrel_fire/);
    assert.match(gameSource, /t\._fireAnimT = 0\.18/g);
    assert.doesNotMatch(gameSource, /分身使用角形人形剪影/);
});

test('角色详情以立绘、作战参数和技能为概览，海克斯构筑独立分页并保留详情', () => {
    assert.match(statsSource, /_selectTab\('overview'\)/);
    assert.match(statsSource, /button\.on\(Node\.EventType\.TOUCH_END, \(\) => this\._selectTab\(def\.name\)\)/);
    assert.match(statsSource, /applyArtSprite\(this\._portrait, `char_\$\{d\.charId\}`\)/);
    assert.match(statsSource, /applyArtSprite\(row\.icon, `ui_icon_\$\{d\.skillIcons\[key\]\}`\)/);
    assert.match(statsSource, /const augColX = \[-273, 273\], y0 = 180, rowH = 87/);
    assert.match(statsSource, /this\._emptyAug\.active = this\._augments\.length === 0/);
    assert.match(statsSource, /this\._augDetail\.active = true/);
    assert.match(statsSource, /row\.on\(Node\.EventType\.TOUCH_END, \(\) => this\._showSkillDetail\(i\)\)/);
    assert.match(statsSource, /passiveTap\.on\(Node\.EventType\.TOUCH_END, \(\) => this\._showPassiveDetail\(\)\)/);
    assert.match(gameSource, /this\._statsUI\.onClose = \(\) => this\._setState\(this\._pauseReturn\)/);
});

test('战斗英雄呼吸动画保持等比缩放', () => {
    assert.match(gameSource, /const uniformScale = 1 \+ breathe/);
    assert.match(gameSource, /facing \* facingPose\.turnScaleX \* uniformScale \* walkPose\.bodyScaleX/);
    assert.match(gameSource, /uniformScale \* walkPose\.bodyScaleY/);
    assert.doesNotMatch(gameSource, /new Vec3\(facing \* \(1 \+ breathe\), 1 - breathe, 1\)/);
});

test('英雄、普通怪和Boss接入真实动作帧且不再绘制假腿', () => {
    assert.match(gameSource, /advanceLocomotion\([\s\S]*e\.locomotionKind/);
    assert.match(gameSource, /advanceLocomotion\([\s\S]*p\.locomotion[\s\S]*p\.locomotionKind/);
    assert.match(gameSource, /directionalArtKey\(entity\.spriteKey, facing\.view, pose\.frameIndex\)/);
    assert.match(gameSource, /_syncDirectionalFrame\(e, walkPose, facingPose\)/);
    assert.match(gameSource, /_syncDirectionalFrame\(p, walkPose, facingPose\)/);
    assert.doesNotMatch(gameSource, /_drawLocomotionRig/);
    assert.doesNotMatch(gameSource, /new Color\(pCol\.r, pCol\.g, pCol\.b, 185\)/);
});

test('英雄朝移动输入转身，敌人按行为状态选择合理朝向', () => {
    assert.match(gameSource, /p\.directionalFacing,[\s\S]*p\.facingX,[\s\S]*p\.facingY/);
    assert.doesNotMatch(gameSource, /p\.directionalFacing,[\s\S]*this\._input\.mouse\.x - p\.x/);
    assert.match(gameSource, /const \[faceDx, faceDy\] = e\.getVisualFacing/);
    assert.match(gameSource, /e\.directionalFacing, faceDx, faceDy/);
    assert.doesNotMatch(gameSource, /const facing = walkPose\.directionX < -0\.025/);
    assert.match(playerSource, /preloadArt\(directionalArtKeys\(this\.spriteKey\)\)/);
    assert.match(gameSource, /enemy\.directionalFrames === false[\s\S]*\[enemy\.spriteKey\][\s\S]*directionalArtKeys\(enemy\.spriteKey\)/);
    assert.match(enemySource, /const usesSingleTopdownSprite = true/);
    assert.match(enemySource, /this\.directionalFrames = !usesSingleTopdownSprite/);
    assert.match(bossSource, /if \(this\.isCharging\)[\s\S]*this\._chargeVx, this\._chargeVy/);
    assert.match(bossSource, /const standDistance = contactDistance\(this, player\)/);
    assert.match(bossSource, /bossHeavy/);
    assert.match(bossSource, /bossHover/);
});

test('专属敌人彻底移除旧程序线框附件', () => {
    assert.doesNotMatch(gameSource, /_attachLegacyCombatSilhouette|CombatSilhouette|legacy_art_fallback/);
    assert.doesNotMatch(enemySource, /accentNode/);
});

test('敌方技能使用材质资源池覆盖弹体、陷阱、近战与钟波', () => {
    for (const key of [
        'fx_enemy_needle', 'fx_enemy_frost', 'fx_enemy_toxic', 'fx_enemy_water_bomb',
        'fx_enemy_saw', 'fx_enemy_void_blade', 'fx_enemy_bell_wave', 'fx_enemy_ember_brand',
        'fx_enemy_claw_slash', 'fx_enemy_web', 'fx_enemy_arc', 'fx_enemy_rail',
    ]) assert.match(gameSource + enemySource + particleSource + fs.readFileSync(path.join(root, 'assets/scripts/data/CombatArtDB.ts'), 'utf8'), new RegExp(key), key);
    assert.match(gameSource, /new SpriteNodePool\(this\._gameLayer, 220, 'EnemyArt'/);
    assert.match(gameSource, /this\._enemyArtPool\.releaseAll\(\)/);
    assert.match(gameSource, /enemyProjectileArt\(b\.enemyFx, b\.hitSource\)/);
    assert.match(enemySource, /actionRecoil/);
    assert.match(bossSource, /actionRecoil/);
});

test('高密金币降低远距亮度并在玩家附近恢复全亮', () => {
    assert.match(gameSource, /this\._economy\.drops\.length > 48/);
    assert.match(gameSource, /Vec\.dist\(drop\.x, drop\.y, this\._player\.x, this\._player\.y\) < 150/);
    assert.match(gameSource, /crowdedCoins && !nearPlayer \? 150 : 255/);
});

test('章节结算清空 Boss 阶段浮字与战斗残影', () => {
    assert.match(gameSource, /s === 'chapterClear'[\s\S]*this\._floatText\?\.clear\(\)/);
    assert.match(gameSource, /for \(const label of this\._floatLabels\) label\.active = false/);
    assert.match(gameSource, /this\._particles\?\.clear\(\)/);
    assert.match(gameSource, /this\._coinPool\?\.releaseAll\(\)/);
    assert.match(gameSource, /for \(const enemy of this\._enemies\)[\s\S]*enemy\.node\.active = false/);
});

test('屏幕适配使用新版windowSize API,避免Creator预览控制台持续输出弃用警告', () => {
    assert.match(fitSource, /screen\.windowSize/);
    assert.doesNotMatch(fitSource, /view\.getFrameSize\(\)/);
});

test('暂停与属性页清理上一帧浮字但不销毁持续战斗特效', () => {
    assert.match(gameSource, /if \(s === 'paused' \|\| s === 'stats'\) \{[\s\S]*this\._floatText\?\.clear\(\)/);
    assert.doesNotMatch(gameSource, /if \(s === 'paused' \|\| s === 'stats'\) \{[\s\S]{0,180}this\._particles\?\.clear\(\)/);
});

test('海克斯卡片改版:固定+5%机制移除,每卡显示本波出现率(数据层pin保留备用)', () => {
    const augSource = fs.readFileSync(path.join(root, 'assets/scripts/ui/AugSelectUI.ts'), 'utf8');
    // 固定机制 UI 整体移除（2026-10-20 新稀有度曲线改版）
    assert.doesNotMatch(augSource, /'固定 \+5%'/);
    assert.doesNotMatch(augSource, /_togglePin/);
    assert.doesNotMatch(augSource, /pinBtn/);
    // 每张卡左上角出现率徽标：按稀有度从 ctx.odds() 取本波概率，随刷新更新
    assert.match(augSource, /const oddsLbl = oddsN\.addComponent\(Label\)/);
    assert.match(augSource, /出现率 \$\{pct \?\? 0\}%/);
    assert.match(augSource, /_paintCard\(c, aug, gold, (?:true|false), odds\)/);
    // 数据层 pin 契约保留（GameManager 侧备用），但 UI 不再调用
    assert.match(gameSource, /pin: \(card\) => this\._augMgr\.pinCard\(card\)/);
    // 波间商店开页仍走 shopOptions
    assert.match(gameSource, /this\._augMgr\.shopOptions\(3, this\._waveMgr\.templateWave\(\)/);
});

test('固定强化数据层保留但UI不调用:开页不带固定状态,unpin仍由管理器提供', () => {
    const augSource = fs.readFileSync(path.join(root, 'assets/scripts/ui/AugSelectUI.ts'), 'utf8');
    assert.doesNotMatch(augSource, /_pinned/);
    assert.match(gameSource, /unpin: \(card\) => this\._augMgr\.unpinCard\(card\.id\)/);
    assert.match(gameSource, /pinnedIds: \(\) => this\._augMgr\.pinnedCards\.map\(p => p\.id\)/);
    // 波间商店/开局战备/神秘强化开页都走 shopOptions
    assert.match(gameSource, /this\._augMgr\.shopOptions\(3, this\._waveMgr\.templateWave\(\)/);
    assert.match(gameSource, /this\._augMgr\.shopOptions\(3, 1, \{\}\)/);
    assert.match(gameSource, /this\._augMgr\.shopOptions\(3, Math\.max\(1, this\._waveMgr\.templateWave\(\)\)\)/);
});

test('海克斯卖出=显式按钮+确认弹窗:标签本体不绑定卖出,确认后才调ctx.sell', () => {
    const augSource = fs.readFileSync(path.join(root, 'assets/scripts/ui/AugSelectUI.ts'), 'utf8');
    // 每格右缘内嵌「卖 N」按钮，是唯一卖出入口；按钮直接标注回收额
    assert.match(augSource, /const sellSkin = applyHexButtonSkin\(sellBtn, 52, 36/);
    assert.match(augSource, /sellBtn\.on\(Node\.EventType\.TOUCH_END, \(\) => this\._requestSell\(i\), this\)/);
    assert.match(augSource, /chip\.sellLabel\.string = `卖 \$\{Math\.round\(\(inst\.paid \?\? 0\) \* 0\.75\)\}`/);
    // 标签本体不再绑定 TOUCH_END 卖出（防连点误卖）
    assert.doesNotMatch(augSource, /chip\.on\(Node\.EventType\.TOUCH_END, \(\) => this\._sell\(i\), this\)/);
    assert.doesNotMatch(augSource, /再点一次确认卖出/);
    // 确认弹窗：模态（BlockInputEvents + keyboardModalScope），确认后才调 ctx.sell
    assert.match(augSource, /private _buildSellConfirm\(\)/);
    assert.match(augSource, /registerKeyboardModalScope\(n\)/);
    assert.match(augSource, /private _confirmSell\(\)[\s\S]*?this\._closeConfirm\(\);[\s\S]*?if \(id\) this\._ctx\?\.sell\(\{ id \} as AugDef\)/);
    // 开页重置弹窗（不残留上一次确认目标）
    assert.match(augSource, /this\._chipPage = 0;\s*this\._closeConfirm\(\);/);
    // 底部提示文字同步新玩法
    assert.match(augSource, /点「卖」按钮并确认后回收 75% 购价/);
});
