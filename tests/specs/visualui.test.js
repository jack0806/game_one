'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const screenSource = fs.readFileSync(path.join(root, 'assets/scripts/ui/ScreenManager.ts'), 'utf8');
const metaSource = fs.readFileSync(path.join(root, 'assets/scripts/ui/MetaPageUI.ts'), 'utf8');
const gameSource = fs.readFileSync(path.join(root, 'assets/scripts/core/GameManager.ts'), 'utf8');
const playerSource = fs.readFileSync(path.join(root, 'assets/scripts/entities/PlayerController.ts'), 'utf8');
const enemySource = fs.readFileSync(path.join(root, 'assets/scripts/entities/EnemyBase.ts'), 'utf8');
const bossSource = fs.readFileSync(path.join(root, 'assets/scripts/entities/BossController.ts'), 'utf8');
const hudSource = fs.readFileSync(path.join(root, 'assets/scripts/ui/HUD.ts'), 'utf8');
const shopSource = fs.readFileSync(path.join(root, 'assets/scripts/ui/ShopUI.ts'), 'utf8');
const statsSource = fs.readFileSync(path.join(root, 'assets/scripts/ui/StatsPanel.ts'), 'utf8');
const touchSource = fs.readFileSync(path.join(root, 'assets/scripts/ui/TouchControls.ts'), 'utf8');
const inputSource = fs.readFileSync(path.join(root, 'assets/scripts/systems/InputManager.ts'), 'utf8');
const fitSource = fs.readFileSync(path.join(root, 'assets/scripts/core/ScreenFit.ts'), 'utf8');
const webBuild = JSON.parse(fs.readFileSync(path.join(root, 'tools/build-web-desktop.json'), 'utf8'));
const webBuildMobile = JSON.parse(fs.readFileSync(path.join(root, 'tools/build-web-mobile.json'), 'utf8'));

test('首页背景已移除烧录按钮，操作区不再绘制不透明遮挡方框', () => {
    assert.match(screenSource, /setContentSize\(568, 410\)/);
    assert.match(screenSource, /new Node\('MenuActions'\)/);
    assert.doesNotMatch(screenSource, /menuActions\.addComponent\(Graphics\)/);
    assert.doesNotMatch(screenSource, /fillRect\(-284, -205, 568, 410\)/);
    assert.doesNotMatch(screenSource, /dockG\.fillRect/);
});

test('首页任务树、图鉴、成就均进入独立全屏页面', () => {
    assert.match(screenSource, /'任务树'/);
    assert.match(screenSource, /'图鉴'/);
    assert.match(screenSource, /'成就档案'/);
    assert.match(screenSource, /transition\('menu', 'tasks'\)/);
    assert.match(screenSource, /transition\('menu', 'codex'\)/);
    assert.match(screenSource, /transition\('menu', 'achievements'\)/);
    assert.doesNotMatch(screenSource, /_buildAchievementWall/);
});

test('任务页使用主支线节点链路、状态着色和独立任务详情', () => {
    assert.match(metaSource, /'主线任务'/);
    assert.match(metaSource, /'支线任务'/);
    assert.match(metaSource, /new Node\('Links'\)/);
    assert.match(metaSource, /completed: '已完成'/);
    assert.match(metaSource, /active: '进行中'/);
    assert.match(metaSource, /'奖励预览'/);
});

test('图鉴显示怪物英雄统计、条目图片和未解锁问号详情', () => {
    assert.match(metaSource, /'怪物档案'/);
    assert.match(metaSource, /'英雄档案'/);
    assert.match(metaSource, /怪物 \$\{monsters/);
    assert.match(metaSource, /this\._mkLabel\(card, 0, 28, 88, 88, '\?'/);
    assert.match(metaSource, /未解锁条目使用问号隐藏视觉与身份信息/);
});

test('成就墙一屏展示数量、稀有度特殊性、图片、进度与奖励', () => {
    assert.match(metaSource, /ACHIEVEMENTS\.forEach/);
    assert.match(metaSource, /`ui_icon_\$\{def\.artKey\}`/);
    assert.match(metaSource, /稀有度代表达成条件的特殊性/);
    assert.match(metaSource, /`奖励  \$\{def\.reward\}`/);
    assert.match(metaSource, /已解锁 \$\{unlocked\} \/ \$\{ACHIEVEMENTS\.length\}/);
});

test('角色介绍卡有统一底板，底部为「选择出战/英雄介绍」双按钮', () => {
    assert.match(screenSource, /setContentSize\(360, 280\)/);
    assert.match(screenSource, /cardG\.fillRect\(-180, -140, 360, 280\)/);
    assert.match(screenSource, /cardG\.rect\(-180, -140, 360, 280\)/);
    assert.match(screenSource, /cardG\.lineWidth = locked \? 1 : 2/);
    assert.match(screenSource, /const corner = 18/);
    assert.match(screenSource, /frameN\.setPosition\(new Vec3\(0, 84, 0\)\)/);
    assert.match(screenSource, /this\._loadPortrait\(card, `char_\$\{charId\}`, 88, 84\)/);
    assert.match(screenSource, /skN\.setPosition\(new Vec3\(0, -40, 0\)\)/);
    assert.match(screenSource, /const cy = 100 - row \* 295/);
    assert.match(screenSource, /hintN\.setPosition\(new Vec3\(0, -110, 0\)\)/);
    // 选择出战按钮直接开战；整张卡不再绑定开局回调，看介绍时不会误触
    assert.match(screenSource, /'选择出战'/);
    assert.match(screenSource, /selBtn\.on\(Node\.EventType\.TOUCH_END,\s*\(\) => this\.onCharSelected\?\.\(CHARS\[idx\]!\), this\);/);
    assert.doesNotMatch(screenSource, /card\.on\(Node\.EventType\.TOUCH_END/);
});

test('选人页与英雄介绍文字保持可读字号：速览14px、锁定提示14px', () => {
    // 卡片速览正文不再使用11/12px小字
    assert.match(screenSource, /skLbl\.fontSize = 14/);
    assert.match(screenSource, /skLbl\.lineHeight = 21/);
    assert.match(screenSource, /hintLbl\.fontSize = 14/);
    assert.match(screenSource, /lockLbl\.fontSize = 22/);
    // 双按钮40px高（_mkBtn按0.36比例≈14px字），避免13px以下的按钮小字
    assert.match(screenSource, /'选择出战', -85, -110, 150, 40/);
    assert.match(screenSource, /'英雄介绍', 85, -110, 150, 40/);
    assert.doesNotMatch(screenSource, /skLbl\.fontSize = 1[123]/);
});

test('英雄介绍弹窗展示被动与Q/E/R详细描述、冷却与基础属性', () => {
    // 入口：卡片「英雄介绍」按钮打开 charDetail 模态弹窗
    assert.match(screenSource, /'英雄介绍'/);
    assert.match(screenSource, /introBtn\.on\(Node\.EventType\.TOUCH_END,\s*\(\) => this\.showCharDetail\(CHARS\[idx\]!\), this\);/);
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
    assert.match(screenSource, /loadArtSprite\(`char_\$\{def\.id\}`/);
    assert.match(screenSource, /ui_icon_\$\{def\.skillIcons/);
    // 弹窗内可直接出战或返回
    assert.match(screenSource, /if \(this\._detailDef\) this\.onCharSelected\?\.\(this\._detailDef\);/);
    assert.match(screenSource, /\(\) => this\.hide\('charDetail'\), this\);/);
});

test('英雄介绍弹窗文字放大后保持可读：属性16px、技能标题19px、说明16px', () => {
    assert.match(screenSource, /this\._detailTitle\.fontSize = 32/);
    assert.match(screenSource, /this\._detailStats\.fontSize = 16/);
    assert.match(screenSource, /this\._detailStats\.lineHeight = 27/);
    assert.match(screenSource, /hl\.fontSize = 19/);
    assert.match(screenSource, /dl\.fontSize = 16/);
    assert.match(screenSource, /dl\.lineHeight = 24/);
    // 底部按钮52px高（≈19px字），返回/出战不再是小字按钮
    assert.match(screenSource, /'选择出战', -130, -234, 260, 52/);
    assert.match(screenSource, /'返回', 130, -234, 260, 52/);
    // 说明文字不再使用13px小字
    assert.doesNotMatch(screenSource, /dl\.fontSize = 1[345]/);
});

test('未解锁角色遮罩位于立绘上方,不会再把Portrait推回前景', () => {
    assert.match(screenSource, /const dim = new Node\('LockDim'\); dim\.setParent\(card\)/);
    assert.doesNotMatch(screenSource, /dim\.setSiblingIndex\(1\)/);
    assert.match(screenSource, /dim\.setPosition\(Vec3\.ZERO\)/);
    assert.match(screenSource, /setContentSize\(360, 280\)/);
    assert.match(screenSource, /fillRect\(-180, -140, 360, 280\)/);
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
    assert.match(hudSource, /ShieldFg', -500, 320/);
    assert.match(hudSource, /HpLbl', -380, 338/);
    assert.match(hudSource, /ShieldLbl', -380, 326/);
    assert.match(hudSource, /生命  \$\{Math\.ceil\(d\.hp\)\} \/ \$\{Math\.round\(d\.maxHp\)\}/);
    assert.match(hudSource, /护盾  \$\{Math\.ceil\(d\.shield\)\} \/ \$\{Math\.round\(d\.maxShield\)\}/);
    assert.match(hudSource, /BossRoot', -this\.BOSS_W \/ 2, 282/);
    assert.match(hudSource, /ln\.setPosition\(new Vec3\(this\.BOSS_W \/ 2, this\.BOSS_H \/ 2, 0\)\)/);
});

test('商店使用不透明独立面板，神秘强化作为二级模态弹窗', () => {
    assert.match(shopSource, /new Color\(8, 13, 23, 252\)/);
    assert.match(shopSource, /resume\(\) \{ this\.node\.active = true; \}/);
    assert.match(gameSource, /case 'augment':[\s\S]*this\._shopUI\.hide\(\)[\s\S]*this\._shopUI\.resume\(\)/);
});

test('炮台使用固定俯视底座与独立旋转炮筒并保留接触阴影', () => {
    assert.match(gameSource, /new SpriteNodePool\(this\._gameLayer, 24, 'TurretBase'/);
    assert.match(gameSource, /new SpriteNodePool\(this\._gameLayer, 24, 'TurretBarrel'/);
    assert.match(gameSource, /applyArtSprite\(baseSp, 'turret_base_vivian'\)/);
    assert.match(gameSource, /applyArtSprite\(barrelSp, 'turret_barrel_vivian'\)/);
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

test('技能按钮按参考图排成右下曲线弧,按下即触发且带冷却显示', () => {
    // 左低右高的曲线弧，锚点相对可见右缘（fromRight），1280宽时为Q(290,-240) E(400,-195) R(530,-170)
    assert.match(touchSource, /q: \{ fromRight: -350, y: -240, r: 52 \}/);
    assert.match(touchSource, /e: \{ fromRight: -240, y: -195, r: 52 \}/);
    assert.match(touchSource, /r: \{ fromRight: -110, y: -170, r: 64 \}/);
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
    assert.match(touchSource, /mk\('暂停', new Color\(70, 90, 130, 255\)/);
    assert.match(touchSource, /mk\('属性', new Color\(40, 150, 190, 255\)/);
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
    assert.match(gameSource, /this\._touchUI\.onViewResized = \(\) => this\._fitBackgroundToVisible\(\);/);
    // 触控层：摇杆/触摸区贴左缘，技能按钮与右上角按钮贴右缘
    assert.match(touchSource, /private _layoutByVisible\(\)/);
    assert.match(touchSource, /this\._joyHomeX = -right \+ 190;/);
    assert.match(touchSource, /btn\.node\.setPosition\(new Vec3\(right \+ a\.fromRight, a\.y, 0\)\);/);
    assert.match(touchSource, /this\._topRightBtns\[0\]\.setPosition\(new Vec3\(right - 88, 322, 0\)\);/);
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

test('Web Desktop发布外壳与设计画布都锁定1280×720', () => {
    assert.deepEqual(webBuild.designResolution, { width: 1280, height: 720, policy: 4 });
    assert.deepEqual(webBuild.packages['web-desktop'].resolution, { designWidth: 1280, designHeight: 720 });
});

test('角色详情将十个词条排成2列×5行，技能名与说明保持同行', () => {
    assert.match(statsSource, /const augColX = \[132, 398\]/);
    assert.match(statsSource, /Math\.floor\(i \/ 2\) \* rowH/);
    assert.match(statsSource, /nn\.setPosition\(new Vec3\(-410, y, 0\)\)/);
    assert.match(statsSource, /dn\.setPosition\(new Vec3\(-186, y, 0\)\)/);
    assert.match(statsSource, /dn\.addComponent\(UITransform\)\.setContentSize\(318, 24\)/);
    assert.match(statsSource, /dl\.fontSize = 14/);
    assert.match(statsSource, /dl\.enableWrapText = false/);
    assert.match(statsSource, /row\.desc\.string = detail \? `— \$\{detail\}` : ''/);
    assert.match(statsSource, /sk\?\.desc\?\.split\('—'\)/);
});

test('战斗英雄呼吸动画保持等比缩放', () => {
    assert.match(gameSource, /const uniformScale = 1 \+ breathe/);
    assert.match(gameSource, /facing \* facingPose\.turnScaleX \* uniformScale, uniformScale, 1/);
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
    assert.match(enemySource, /const isDrone = type === 'drone_a' \|\| type === 'drone_s'/);
    assert.match(enemySource, /this\.directionalFrames = !isDrone/);
    assert.match(bossSource, /if \(this\.isCharging\)[\s\S]*this\._chargeVx, this\._chargeVy/);
    assert.match(bossSource, /const standDistance = Math\.max\(1, contactDistance - 2\)/);
    assert.match(bossSource, /bossHeavy/);
    assert.match(bossSource, /bossHover/);
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
