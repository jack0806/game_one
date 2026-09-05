// ============================================================
//  ActorAnimationDB.ts — 逐帧动作、固定枢轴与逐帧武器挂点
// ============================================================
export type ActorAction = 'idle' | 'walk' | 'run' | 'jump' | 'attack' | 'attackMelee' |
    'hit' | 'defeated' | 'skill' | 'skill2' | 'skill3' | 'skill4' | 'skill5';
export type ActorView = 'front' | 'side' | 'back';
export interface AnimationFrame {
    /** 网格帧编号，从左到右、从上到下。 */
    index: number;
    /** 原始单帧画布的归一化枢轴，禁止按当帧透明包围盒重新居中。 */
    pivot: [number, number];
    /** 与这一帧实际枪口/施法手对应的归一化位置。 */
    muzzle?: [number, number];
    seconds: number;
    event?: 'fire' | 'land' | 'strike' | 'cast';
}
export interface ActorClip {
    sheet: string;
    columns: number;
    rows: number;
    cellSize: number;
    /** 各方向稿的统一尺度标定；渲染和挂点必须同时使用。 */
    displayScale?: number;
    loop: boolean;
    frames: AnimationFrame[];
}
export type ActorAnimationSet = Partial<Record<ActorView, Partial<Record<ActorAction, ActorClip>>>>;

/** 同一方向共用尺度和枢轴；枪口按姿势分别标定，不能随透明裁边漂移。 */
function createDirectionClips(sheet: string, sockets: [number, number][][],
    pivots?: [number, number][], attackEvent: 'fire' | 'strike' = 'fire', displayScale = 1, rows = 8): Partial<Record<ActorAction, ActorClip>> {
    const actions: ActorAction[] = ['idle', 'walk', 'run', 'jump', 'attack', 'hit', 'defeated', 'skill'];
    const seconds = [0.22, 0.12, 0.09, 0.13, 0.065, 0.09, 0.18, 0.13];
    const result: Partial<Record<ActorAction, ActorClip>> = {};
    actions.slice(0, rows).forEach((action, row) => {
        result[action] = {
            sheet, columns: 4, rows, cellSize: 256, displayScale, loop: row < 3,
            frames: [0, 1, 2, 3].map(column => ({
                index: row * 4 + column, pivot: (row !== 6 && pivots?.[column]) || [0.5, 0.56], seconds: seconds[row],
                muzzle: sockets[row]?.[column],
                ...(action === 'attack' && column === 1 ? { event: attackEvent } : {}),
                ...(action === 'jump' && column === 3 ? { event: 'land' as const } : {}),
                ...(action === 'skill' && column === 2 ? { event: 'cast' as const } : {}),
            })),
        };
    });
    return result;
}

/** 单独重绘的四帧动作，以整行动作替换，避免误用大图中的装备缺失姿势。 */
function supplementalClip(sheet: string, row: number, action: ActorAction,
    sockets: [number, number][] = []): ActorClip {
    return {
        sheet, columns: 4, rows: 2, cellSize: 256, loop: false,
        frames: [0, 1, 2, 3].map(column => ({
            index: row * 4 + column, pivot: [0.5, 0.56], muzzle: sockets[column],
            seconds: action === 'attack' || action === 'attackMelee' ? 0.065 : action === 'defeated' ? 0.18 : action === 'skill' ? 0.13 : 0.09,
            ...(action === 'attack' && column === 1 ? { event: 'fire' as const } : {}),
            ...(action === 'attackMelee' && column === 1 ? { event: 'strike' as const } : {}),
            ...(action === 'skill' && column === 2 ? { event: 'cast' as const } : {}),
        })),
    };
}

/** 英雄Q/E/R专属三方向稿：每张图按正/侧/背三行排列，第三帧结算技能。 */
function heroSkillClip(sheet: string, row: number, muzzles: [number, number][] = [], displayScale = 1): ActorClip {
    return {
        sheet, columns: 4, rows: 3, cellSize: 448, displayScale, loop: false,
        frames: [0, 1, 2, 3].map(column => ({
            index: row * 4 + column,
            pivot: [0.5, 0.56],
            muzzle: muzzles[column],
            seconds: column === 2 ? 0.14 : 0.1,
            ...(column === 2 ? { event: 'cast' as const } : {}),
        })),
    };
}

const vivianFront = createDirectionClips('anim_vivian_front', [
    [], [], [], [],
    [[0.19, 0.40], [0.12, 0.33], [0.12, 0.34], [0.18, 0.38]],
    [], [],
    [[0.18, 0.30], [0.18, 0.30], [0.19, 0.31], [0.18, 0.30]],
]);
vivianFront.hit = supplementalClip('anim_vivian_front_hit_death', 0, 'hit');
vivianFront.defeated = supplementalClip('anim_vivian_front_hit_death', 1, 'defeated');
// 第29格把遥控器画成了炮头，不进入播放序列；第30格仍保留cast事件。
vivianFront.skill.frames = vivianFront.skill.frames.filter(frame => frame.index !== 29);

const vivianBack = createDirectionClips('anim_vivian_back', [
    [], [], [], [], [], [], [],
    [[0.22, 0.29], [0.20, 0.34], [0.20, 0.34], [0.20, 0.34]],
]);
vivianBack.attack = supplementalClip('anim_vivian_back_attack_death', 0, 'attack',
    [[0.313, 0.301], [0.262, 0.258], [0.293, 0.320], [0.262, 0.328]]);
vivianBack.defeated = supplementalClip('anim_vivian_back_attack_death', 1, 'defeated');

/** 不同来源动作统一身体尺度；校准画布时同时保持脚底到逻辑根的距离。 */
function calibrateClip(clip: ActorClip, displayScale = 1, baseline = 232, xs?: number[]): ActorClip {
    return { ...clip, displayScale,
        frames: clip.frames.map((frame, index) => ({ ...frame,
            pivot: [xs?.[index] ?? frame.pivot[0], baseline / clip.cellSize - (232 / 256 - 0.56) / displayScale],
        })),
    };
}

const oliaFront = createDirectionClips('anim_olia_front', [], undefined, 'fire', 1, 7);
oliaFront.attack = supplementalClip('anim_olia_front_combat', 0, 'attack',
    [[0.411,0.486],[0.176,0.312],[0.178,0.311],[0.226,0.385]]);
oliaFront.attackMelee = supplementalClip('anim_olia_front_combat', 1, 'attackMelee',
    [[0.32,0.17],[0.299,0.33],[0.31,0.60],[0.31,0.17]]);
oliaFront.skill = calibrateClip(supplementalClip('anim_olia_front_back_skill', 0, 'skill',
    [[0.27,0.58],[0.23,0.58],[0.23,0.58],[0.23,0.58]]), 1.04, 240);

const oliaSide = createDirectionClips('anim_olia_side', [
    [], [], [], [], [[0.845,0.389],[0.788,0.411],[0.734,0.425],[0.674,0.435]],
], undefined, 'fire', 1, 7);
oliaSide.attackMelee = supplementalClip('anim_olia_side_melee_skill', 0, 'attackMelee',
    [[0.70,0.45],[0.75,0.35],[0.66,0.53],[0.70,0.45]]);
oliaSide.skill = calibrateClip(supplementalClip('anim_olia_side_melee_skill', 1, 'skill',
    [[0.72,0.49],[0.59,0.41],[0.76,0.33],[0.70,0.49]]), 1.04);

const oliaBack = createDirectionClips('anim_olia_back', [], undefined, 'fire', 1, 7);
for (const action of Object.keys(oliaBack)) oliaBack[action] = calibrateClip(oliaBack[action], 1.07);
oliaBack.attack = calibrateClip({ ...supplementalClip('anim_olia_back_combat', 0, 'attack',
    [[0.781,0.246],[0.775,0.325],[0.807,0.277],[0.742,0.491]]), cellSize: 320 }, 1.25, 300);
oliaBack.attackMelee = calibrateClip({ ...supplementalClip('anim_olia_back_combat', 1, 'attackMelee',
    [[0.70,0.36],[0.756,0.351],[0.70,0.69],[0.72,0.57]]), cellSize: 320 }, 1.25, 300,
    [0.439,0.402,0.469,0.485]);
oliaBack.skill = calibrateClip(supplementalClip('anim_olia_front_back_skill', 1, 'skill',
    [[0.84,0.61],[0.81,0.61],[0.78,0.61],[0.75,0.61]]), 1.13, 240);

function archerAttack(row: number, xs: number[], sockets: [number, number][]): ActorClip {
    return calibrateClip({
        sheet: 'anim_archer_combat', columns: 4, rows: 3, cellSize: 320, loop: false,
        frames: [0.1, 0.09, 0.08, 0.13].map((seconds, column) => ({
            index: row * 4 + column, pivot: [0.5, 0.56], muzzle: sockets[column], seconds,
            ...(column === 1 ? { event: 'fire' as const } : {}),
        })),
    }, 1.6, 256, xs);
}

function archerMotion(sheet: string, seconds: number, xs: number[], rows = 2, start = 0): ActorClip {
    return calibrateClip({
        sheet, columns: 4, rows, cellSize: 320, loop: true,
        frames: xs.map((_, index) => ({ index: start + index, pivot: [0.5, 0.56], seconds })),
    }, 1.6, 256, xs);
}

const archerFrontBody = createDirectionClips('anim_archer_front_body', []);
for (const action of ['walk', 'run', 'attack']) delete archerFrontBody[action];
for (const action of Object.keys(archerFrontBody)) {
    archerFrontBody[action] = calibrateClip({ ...archerFrontBody[action], cellSize: 320 },
        1.6, 256, [0.498,0.464,0.438,0.412]);
}

function archerBodyClips(sheet: string, xs: number[][]): Partial<Record<ActorAction, ActorClip>> {
    const actions: ActorAction[] = ['idle', 'jump', 'hit', 'defeated', 'skill'];
    const durations = [0.22, 0.13, 0.09, 0.18, 0.13];
    const result: Partial<Record<ActorAction, ActorClip>> = {};
    actions.forEach((action, row) => {
        result[action] = calibrateClip({
            sheet, columns: 4, rows: 5, cellSize: 320, loop: action === 'idle',
            frames: [0,1,2,3].map(column => ({
                index: row*4+column, pivot: [0.5,0.56], seconds: durations[row],
                ...(action === 'jump' && column === 3 ? { event: 'land' as const } : {}),
                ...(action === 'skill' && column === 2 ? { event: 'cast' as const } : {}),
            })),
        }, 1.6, 256, xs[row] ?? xs[0]);
    });
    return result;
}

const archerSideBody = archerBodyClips('anim_archer_side_body', [
    [0.5304,0.4089,0.4044,0.3774], [0.5608,0.4449,0.428,0.3549],
    [0.5405,0.464,0.4213,0.3943], [0.563,0.482,0.4741,0.4066],
    [0.5675,0.4483,0.446,0.3943],
]);
const archerBackBody = archerBodyClips('anim_archer_back_body', [[0.5968,0.482,0.4741,0.4044]]);

const shieldFront = createDirectionClips('anim_shield_front', [], undefined, 'strike', 2);
for (const action of Object.keys(shieldFront)) {
    shieldFront[action] = calibrateClip({ ...shieldFront[action], cellSize: 384 }, 2, 324);
}
const shieldSide = createDirectionClips('anim_shield_side', [], undefined, 'strike', 2);
for (const action of Object.keys(shieldSide)) {
    shieldSide[action] = calibrateClip({ ...shieldSide[action], cellSize: 384 }, 2, 324);
}
shieldSide.attack = calibrateClip({
    sheet: 'anim_shield_side_attack', columns: 4, rows: 1, cellSize: 384, displayScale: 2, loop: false,
    frames: [0,1,2,3].map(column => ({
        index: column, pivot: [0.5,0.56], seconds: 0.085,
        ...(column === 1 ? { event: 'strike' as const } : {}),
    })),
}, 2, 324, [0.445,0.428,0.386,0.383]);
const shieldBack = createDirectionClips('anim_shield_back', [], undefined, 'strike', 2);
for (const action of Object.keys(shieldBack)) {
    shieldBack[action] = calibrateClip({ ...shieldBack[action], cellSize: 384 }, 2, 324);
}

/** 爆炸怪的主稿不伪造缺失的受击行；第六行是爆炸后塌落，第七行是蓄热。 */
function exploderDirection(sheet: string, hitSheet: string, hitDisplayScale = 2): Partial<Record<ActorAction, ActorClip>> {
    const rows: [ActorAction, number, boolean][] = [
        ['idle',0,true], ['walk',1,true], ['run',2,true], ['jump',3,false],
        ['attack',4,false], ['defeated',5,false], ['skill',6,false],
    ];
    const result: Partial<Record<ActorAction, ActorClip>> = {};
    for (const [action,row,loop] of rows) {
        result[action] = calibrateClip({
            sheet, columns: 4, rows: 7, cellSize: 448, displayScale: 2, loop,
            frames: [0,1,2,3].map(column => ({
                index: row*4+column, pivot: [0.5,0.56],
                seconds: action === 'run' ? 0.08 : action === 'walk' ? 0.12
                    : action === 'defeated' ? 0.18 : 0.13,
                ...(action === 'jump' && column === 3 ? { event: 'land' as const } : {}),
                ...(action === 'attack' && column === 1 ? { event: 'strike' as const } : {}),
                ...(action === 'skill' && column === 2 ? { event: 'cast' as const } : {}),
            })),
        }, 2, 378);
    }
    result.hit = calibrateClip({
        sheet: hitSheet, columns: 4, rows: 1, cellSize: 448, displayScale: hitDisplayScale, loop: false,
        frames: [0,1,2,3].map(index => ({ index, pivot: [0.5,0.56], seconds: 0.09 })),
    }, hitDisplayScale, 378);
    return result;
}

const exploderFront = exploderDirection('anim_exploder_front', 'anim_exploder_front_hit');
const exploderSide = exploderDirection('anim_exploder_side', 'anim_exploder_side_hit', 1.65);
const exploderBack = exploderDirection('anim_exploder_back', 'anim_exploder_back_hit');

/** 石像鬼按真实重拳落地点触发命中；正面主稿缺失死亡行，使用独立碎裂序列。 */
function golemDirection(sheet: string, displayScale: number, frontSevenRows = false): Partial<Record<ActorAction, ActorClip>> {
    const actions: ActorAction[] = frontSevenRows
        ? ['idle', 'walk', 'run', 'jump', 'attack', 'hit', 'skill']
        : ['idle', 'walk', 'run', 'jump', 'attack', 'hit', 'defeated', 'skill'];
    const result: Partial<Record<ActorAction, ActorClip>> = {};
    actions.forEach((action, row) => {
        result[action] = calibrateClip({
            sheet, columns: 4, rows: actions.length, cellSize: 384, displayScale,
            loop: action === 'idle' || action === 'walk' || action === 'run',
            frames: [0, 1, 2, 3].map(column => ({
                index: row * 4 + column, pivot: [0.5, 0.56],
                seconds: action === 'idle' ? 0.25 : action === 'walk' ? 0.15
                    : action === 'run' ? 0.10 : action === 'defeated' ? 0.20 : 0.13,
                ...(action === 'jump' && column === 3 ? { event: 'land' as const } : {}),
                // 原稿第三帧才是拳面接地；命中帧不能沿用普通近战的第二帧。
                ...(action === 'attack' && column === 2 ? { event: 'strike' as const } : {}),
                ...(action === 'skill' && column === 2 ? { event: 'cast' as const } : {}),
            })),
        }, displayScale, 330);
    });
    return result;
}

const golemFront = golemDirection('anim_golem_front', 1.35, true);
golemFront.defeated = calibrateClip({
    sheet: 'anim_golem_front_defeated', columns: 4, rows: 1, cellSize: 384,
    displayScale: 1.35, loop: false,
    frames: [0, 1, 2, 3].map(index => ({ index, pivot: [0.5, 0.56], seconds: 0.20 })),
}, 1.35, 330);
const golemSide = golemDirection('anim_golem_side', 1.40);
const golemBack = golemDirection('anim_golem_back', 1.52);

/** 精英腐肉的镰爪交叉帧才结算伤害；背面技能独立移除错误的背部晶核。 */
function eliteDirection(sheet: string, displayScale: number, backSevenRows = false): Partial<Record<ActorAction, ActorClip>> {
    const actions: ActorAction[] = backSevenRows
        ? ['idle', 'walk', 'run', 'jump', 'attack', 'hit', 'defeated']
        : ['idle', 'walk', 'run', 'jump', 'attack', 'hit', 'defeated', 'skill'];
    const result: Partial<Record<ActorAction, ActorClip>> = {};
    actions.forEach((action, row) => {
        result[action] = calibrateClip({
            sheet, columns: 4, rows: actions.length, cellSize: 448, displayScale,
            loop: action === 'idle' || action === 'walk' || action === 'run',
            frames: [0, 1, 2, 3].map(column => ({
                index: row * 4 + column, pivot: [0.5, 0.56],
                seconds: action === 'idle' ? 0.22 : action === 'walk' ? 0.12
                    : action === 'run' ? 0.085 : action === 'defeated' ? 0.18 : 0.11,
                ...(action === 'jump' && column === 3 ? { event: 'land' as const } : {}),
                ...(action === 'attack' && column === 2 ? { event: 'strike' as const } : {}),
                ...(action === 'skill' && column === 2 ? { event: 'cast' as const } : {}),
            })),
        }, displayScale, 390);
    });
    return result;
}

const eliteFront = eliteDirection('anim_elite_front', 1.55);
const eliteSide = eliteDirection('anim_elite_side', 1.68);
const eliteBack = eliteDirection('anim_elite_back', 1.58, true);
eliteBack.skill = calibrateClip({
    sheet: 'anim_elite_back_skill', columns: 4, rows: 1, cellSize: 448,
    displayScale: 1.58, loop: false,
    frames: [0, 1, 2, 3].map((index) => ({
        index, pivot: [0.5, 0.56], seconds: 0.11,
        ...(index === 2 ? { event: 'cast' as const } : {}),
    })),
}, 1.58, 390);

/** 锈齿扑兵的第三帧是咬合/突扑落点；背面技能使用无背部反应炉的修正版。 */
function rustBiterDirection(sheet: string, displayScale: number, backSevenRows = false): Partial<Record<ActorAction, ActorClip>> {
    const actions: ActorAction[] = backSevenRows
        ? ['idle', 'walk', 'run', 'jump', 'attack', 'hit', 'defeated']
        : ['idle', 'walk', 'run', 'jump', 'attack', 'hit', 'defeated', 'skill'];
    const result: Partial<Record<ActorAction, ActorClip>> = {};
    actions.forEach((action, row) => {
        result[action] = calibrateClip({
            sheet, columns: 4, rows: actions.length, cellSize: 384, displayScale,
            loop: action === 'idle' || action === 'walk' || action === 'run',
            frames: [0, 1, 2, 3].map(column => ({
                index: row * 4 + column, pivot: [0.5, 0.56],
                seconds: action === 'idle' ? 0.22 : action === 'walk' ? 0.12
                    : action === 'run' ? 0.075 : action === 'defeated' ? 0.18 : 0.10,
                ...(action === 'jump' && column === 3 ? { event: 'land' as const } : {}),
                ...(action === 'attack' && column === 2 ? { event: 'strike' as const } : {}),
                ...(action === 'skill' && column === 2 ? { event: 'cast' as const } : {}),
            })),
        }, displayScale, 350);
    });
    return result;
}

const rustBiterFront = rustBiterDirection('anim_rust_biter_front', 1.06);
const rustBiterSide = rustBiterDirection('anim_rust_biter_side', 1.06);
const rustBiterBack = rustBiterDirection('anim_rust_biter_back', 1.16, true);
rustBiterBack.skill = calibrateClip({
    sheet: 'anim_rust_biter_back_skill', columns: 4, rows: 1, cellSize: 384,
    displayScale: 1.16, loop: false,
    frames: [0, 1, 2, 3].map(index => ({
        index, pivot: [0.5, 0.56], seconds: 0.10,
        ...(index === 2 ? { event: 'cast' as const } : {}),
    })),
}, 1.16, 325);

/** 断针射手的三连针统一读取第二帧真实针尖；正面技能改用未截断的短束修正版。 */
function needleGunnerDirection(sheet: string, displayScale: number, fireMuzzle: [number, number], frontSevenRows = false): Partial<Record<ActorAction, ActorClip>> {
    const actions: ActorAction[] = frontSevenRows
        ? ['idle', 'walk', 'run', 'jump', 'attack', 'hit', 'defeated']
        : ['idle', 'walk', 'run', 'jump', 'attack', 'hit', 'defeated', 'skill'];
    const result: Partial<Record<ActorAction, ActorClip>> = {};
    actions.forEach((action, row) => {
        result[action] = calibrateClip({
            sheet, columns: 4, rows: actions.length, cellSize: 384, displayScale,
            loop: action === 'idle' || action === 'walk' || action === 'run',
            frames: [0, 1, 2, 3].map(column => ({
                index: row * 4 + column, pivot: [0.5, 0.56],
                seconds: action === 'idle' ? 0.22 : action === 'walk' ? 0.12
                    : action === 'run' ? 0.075 : action === 'defeated' ? 0.18 : 0.09,
                ...(action === 'attack' && column === 1 ? { event: 'fire' as const, muzzle: fireMuzzle } : {}),
                ...(action === 'jump' && column === 3 ? { event: 'land' as const } : {}),
                ...(action === 'skill' && column === 2 ? { event: 'cast' as const } : {}),
            })),
        }, displayScale, 330);
    });
    return result;
}

const needleGunnerFront = needleGunnerDirection('anim_needle_gunner_front', 1.12, [0.418, 0.688], true);
needleGunnerFront.skill = calibrateClip({
    sheet: 'anim_needle_gunner_front_skill', columns: 4, rows: 1, cellSize: 384,
    displayScale: 1.12, loop: false,
    frames: [0, 1, 2, 3].map(index => ({
        index, pivot: [0.5, 0.56], seconds: 0.10,
        ...(index === 2 ? { event: 'cast' as const } : {}),
    })),
}, 1.12, 330);
const needleGunnerSide = needleGunnerDirection('anim_needle_gunner_side', 1.12, [0.656, 0.612]);
const needleGunnerBack = needleGunnerDirection('anim_needle_gunner_back', 1.18, [0.508, 0.292]);

/** 酸囊投手的第三帧是酸球离爪时刻；背面受击与死亡使用独立无遮挡修正版。 */
function acidSacDirection(sheet: string, displayScale: number,
    fireMuzzle: [number, number]): Partial<Record<ActorAction, ActorClip>> {
    const actions: ActorAction[] = ['idle', 'walk', 'run', 'jump', 'attack', 'hit', 'defeated', 'skill'];
    const result: Partial<Record<ActorAction, ActorClip>> = {};
    actions.forEach((action, row) => {
        result[action] = calibrateClip({
            sheet, columns: 4, rows: 8, cellSize: 448, displayScale,
            loop: action === 'idle' || action === 'walk' || action === 'run',
            frames: [0, 1, 2, 3].map(column => ({
                index: row * 4 + column, pivot: [0.5, 0.56],
                seconds: action === 'idle' ? 0.22 : action === 'walk' ? 0.14
                    : action === 'run' ? 0.09 : action === 'defeated' ? 0.18
                    : action === 'attack' ? 0.11 : action === 'skill' ? 0.12 : 0.09,
                ...(action === 'attack' && column === 2 ? { event: 'fire' as const, muzzle: fireMuzzle } : {}),
                ...(action === 'jump' && column === 3 ? { event: 'land' as const } : {}),
                ...(action === 'skill' && column === 2 ? { event: 'cast' as const } : {}),
            })),
        }, displayScale, 400);
    });
    return result;
}

const acidSacFront = acidSacDirection('anim_acid_sac_front', 1.12, [0.735, 0.755]);
const acidSacSide = acidSacDirection('anim_acid_sac_side', 1.16, [0.74, 0.63]);
const acidSacBack: Partial<Record<ActorAction, ActorClip>> = {};
for (const [action, row, loop] of [
    ['idle', 0, true], ['walk', 1, true], ['run', 2, true], ['jump', 3, false],
    ['attack', 4, false], ['skill', 6, false],
] as [ActorAction, number, boolean][]) {
    acidSacBack[action] = calibrateClip({
        sheet: 'anim_acid_sac_back', columns: 4, rows: 7, cellSize: 448,
        displayScale: 1.12, loop,
        frames: [0, 1, 2, 3].map(column => ({
            index: row * 4 + column, pivot: [0.5, 0.56],
            seconds: action === 'idle' ? 0.22 : action === 'walk' ? 0.14
                : action === 'run' ? 0.09 : action === 'attack' ? 0.11 : action === 'skill' ? 0.12 : 0.09,
            ...(action === 'attack' && column === 2
                ? { event: 'fire' as const, muzzle: [0.72, 0.365] as [number, number] } : {}),
            ...(action === 'jump' && column === 3 ? { event: 'land' as const } : {}),
            ...(action === 'skill' && column === 2 ? { event: 'cast' as const } : {}),
        })),
    }, 1.12, 400);
}
acidSacBack.hit = calibrateClip({
    sheet: 'anim_acid_sac_back_hit', columns: 4, rows: 1, cellSize: 448,
    displayScale: 1.12, loop: false,
    frames: [0, 1, 2, 3].map(index => ({ index, pivot: [0.5, 0.56], seconds: 0.09 })),
}, 1.12, 400);
acidSacBack.defeated = calibrateClip({
    sheet: 'anim_acid_sac_back_defeated', columns: 4, rows: 1, cellSize: 448,
    displayScale: 1.12, loop: false,
    frames: [0, 1, 2, 3].map(index => ({ index, pivot: [0.5, 0.56], seconds: 0.18 })),
}, 1.12, 400);

/** 铆甲兽用运动/战斗小批次组合，第三帧对应护板接触和冲锋爆发。 */
function rivetBeastDirection(motionSheet: string, combatSheet: string,
    displayScale: number): Partial<Record<ActorAction, ActorClip>> {
    const result: Partial<Record<ActorAction, ActorClip>> = {};
    const motion: [ActorAction, number, boolean, number][] = [
        ['idle', 0, true, 0.25], ['walk', 1, true, 0.16],
        ['run', 2, true, 0.11], ['jump', 3, false, 0.14],
    ];
    const combat: [ActorAction, number, number][] = [
        ['attack', 0, 0.12], ['hit', 1, 0.10], ['defeated', 2, 0.20], ['skill', 3, 0.11],
    ];
    for (const [action, row, loop, seconds] of motion) {
        result[action] = calibrateClip({
            sheet: motionSheet, columns: 4, rows: 4, cellSize: 448, displayScale, loop,
            frames: [0, 1, 2, 3].map(column => ({
                index: row * 4 + column, pivot: [0.5, 0.56], seconds,
                ...(action === 'jump' && column === 3 ? { event: 'land' as const } : {}),
            })),
        }, displayScale, 400);
    }
    for (const [action, row, seconds] of combat) {
        result[action] = calibrateClip({
            sheet: combatSheet, columns: 4, rows: 4, cellSize: 448, displayScale, loop: false,
            frames: [0, 1, 2, 3].map(column => ({
                index: row * 4 + column, pivot: [0.5, 0.56], seconds,
                ...(action === 'attack' && column === 2 ? { event: 'strike' as const } : {}),
                ...(action === 'skill' && column === 2 ? { event: 'cast' as const } : {}),
            })),
        }, displayScale, 400);
    }
    return result;
}

const rivetBeastFront = rivetBeastDirection('anim_rivet_beast_front_motion', 'anim_rivet_beast_front_combat', 1.10);
const rivetBeastSide = rivetBeastDirection('anim_rivet_beast_side_motion', 'anim_rivet_beast_side_combat', 1.12);
const rivetBeastBack = rivetBeastDirection('anim_rivet_beast_back_motion', 'anim_rivet_beast_back_combat', 1.10);

/** 掠金虫没有伤害动作；战斗图首行只是拾取警觉，技能行对应受击后的逃逸加速。 */
function goldScavengerDirection(motionSheet: string, combatSheet: string,
    displayScale: number, frontRun?: string, frontJump?: string,
    combatDisplayScale = displayScale): Partial<Record<ActorAction, ActorClip>> {
    const result: Partial<Record<ActorAction, ActorClip>> = {};
    const motionRows = frontRun ? 2 : 4;
    for (const [action, row, loop, seconds] of [
        ['idle', 0, true, 0.24], ['walk', 1, true, 0.13],
    ] as [ActorAction, number, boolean, number][]) {
        result[action] = calibrateClip({
            sheet: motionSheet, columns: 4, rows: motionRows, cellSize: 448,
            displayScale, loop,
            frames: [0, 1, 2, 3].map(column => ({
                index: row * 4 + column, pivot: [0.5, 0.56], seconds,
            })),
        }, displayScale, 400);
    }
    for (const [action, sheet, row, rows, loop, seconds] of [
        ['run', frontRun ?? motionSheet, frontRun ? 0 : 2, frontRun ? 1 : 4, true, 0.075],
        ['jump', frontJump ?? motionSheet, frontJump ? 0 : 3, frontJump ? 1 : 4, false, 0.13],
    ] as [ActorAction, string, number, number, boolean, number][]) {
        result[action] = calibrateClip({
            sheet, columns: 4, rows, cellSize: 448, displayScale, loop,
            frames: [0, 1, 2, 3].map(column => ({
                index: row * 4 + column, pivot: [0.5, 0.56], seconds,
                ...(action === 'jump' && column === 3 ? { event: 'land' as const } : {}),
            })),
        }, displayScale, 400);
    }
    for (const [action, row, seconds] of [
        ['attack', 0, 0.13], ['hit', 1, 0.10],
        ['defeated', 2, 0.20], ['skill', 3, 0.10],
    ] as [ActorAction, number, number][]) {
        result[action] = calibrateClip({
            sheet: combatSheet, columns: 4, rows: 4, cellSize: 448,
            displayScale: combatDisplayScale, loop: false,
            frames: [0, 1, 2, 3].map(column => ({
                index: row * 4 + column, pivot: [0.5, 0.56], seconds,
                ...(action === 'skill' && column === 2 ? { event: 'cast' as const } : {}),
            })),
        }, combatDisplayScale, 400);
    }
    return result;
}

const goldScavengerFront = goldScavengerDirection(
    'anim_gold_scavenger_front_motion', 'anim_gold_scavenger_front_combat', 1.06,
    'anim_gold_scavenger_front_run', 'anim_gold_scavenger_front_jump', 1.02,
);
const goldScavengerSide = goldScavengerDirection(
    'anim_gold_scavenger_side_motion', 'anim_gold_scavenger_side_combat', 1.10,
    undefined, undefined, 1.24,
);
const goldScavengerBack = goldScavengerDirection(
    'anim_gold_scavenger_back_motion', 'anim_gold_scavenger_back_combat', 1.06,
);

/** 熔爆蜱的接近/击杀都只启动倒计时；身体攻击行不直接产生伤害事件。 */
function blastTickDirection(sheet: string, displayScale: number,
    rows = 8): Partial<Record<ActorAction, ActorClip>> {
    const actions: ActorAction[] = ['idle', 'walk', 'run', 'jump', 'attack', 'hit', 'defeated', 'skill'];
    const seconds = [0.24, 0.13, 0.08, 0.13, 0.12, 0.09, 0.20, 0.12];
    const result: Partial<Record<ActorAction, ActorClip>> = {};
    actions.slice(0, rows).forEach((action, row) => {
        result[action] = calibrateClip({
            sheet, columns: 4, rows, cellSize: 448, displayScale,
            loop: action === 'idle' || action === 'walk' || action === 'run',
            frames: [0, 1, 2, 3].map(column => ({
                index: row * 4 + column, pivot: [0.5, 0.56], seconds: seconds[row],
                ...(action === 'jump' && column === 3 ? { event: 'land' as const } : {}),
                ...(action === 'skill' && column === 2 ? { event: 'cast' as const } : {}),
            })),
        }, displayScale, 400);
    });
    return result;
}

const blastTickFront = blastTickDirection('anim_blast_tick_front', 1.05);
const blastTickSide = blastTickDirection('anim_blast_tick_side', 1.08);
const blastTickBack = blastTickDirection('anim_blast_tick_back', 1.05, 7);
blastTickBack.skill = calibrateClip({
    sheet: 'anim_blast_tick_back_skill', columns: 4, rows: 1, cellSize: 448,
    displayScale: 1.05, loop: false,
    frames: [0, 1, 2, 3].map(column => ({
        index: column, pivot: [0.5, 0.56], seconds: 0.12,
        ...(column === 2 ? { event: 'cast' as const } : {}),
    })),
}, 1.05, 400);

/** 施法单位的小批次图集：运动与战斗分离，施法第三帧绑定真实发射点。 */
function splitCasterDirection(motionSheet: string, combatSheet: string,
    motionScale: number, combatScale: number,
    muzzles: [number, number][]): Partial<Record<ActorAction, ActorClip>> {
    const result: Partial<Record<ActorAction, ActorClip>> = {};
    for (const [action, row, loop, seconds] of [
        ['idle', 0, true, 0.24], ['walk', 1, true, 0.14],
        ['run', 2, true, 0.09], ['jump', 3, false, 0.13],
    ] as [ActorAction, number, boolean, number][]) {
        result[action] = calibrateClip({
            sheet: motionSheet, columns: 4, rows: 4, cellSize: 448,
            displayScale: motionScale, loop,
            frames: [0, 1, 2, 3].map(column => ({
                index: row * 4 + column, pivot: [0.5, 0.56], seconds,
                ...(action === 'jump' && column === 3 ? { event: 'land' as const } : {}),
            })),
        }, motionScale, 400);
    }
    for (const [action, row, seconds] of [
        ['attack', 0, 0.10], ['hit', 1, 0.09],
        ['defeated', 2, 0.20], ['skill', 3, 0.12],
    ] as [ActorAction, number, number][]) {
        result[action] = calibrateClip({
            sheet: combatSheet, columns: 4, rows: 4, cellSize: 448,
            displayScale: combatScale, loop: false,
            frames: [0, 1, 2, 3].map(column => ({
                index: row * 4 + column, pivot: [0.5, 0.56], seconds,
                ...(action === 'attack' ? { muzzle: muzzles[column] } : {}),
                ...(action === 'attack' && column === 2 ? { event: 'cast' as const } : {}),
                ...(action === 'skill' && column === 2 ? { event: 'cast' as const } : {}),
            })),
        }, combatScale, 400);
    }
    return result;
}

const emberAcolyteFront = splitCasterDirection(
    'anim_ember_acolyte_front_motion', 'anim_ember_acolyte_front_combat', 0.90, 1.08,
    [[0.246, 0.87], [0.192, 0.87], [0.14, 0.88], [0.172, 0.88]],
);
const emberAcolyteSide = splitCasterDirection(
    'anim_ember_acolyte_side_motion', 'anim_ember_acolyte_side_combat', 1.10, 1.17,
    [[0.92, 0.70], [0.85, 0.70], [0.80, 0.70], [0.83, 0.71]],
);
const emberAcolyteBack = splitCasterDirection(
    'anim_ember_acolyte_back_motion', 'anim_ember_acolyte_back_combat', 1.08, 1.00,
    [[0.71, 0.35], [0.65, 0.31], [0.64, 0.31], [0.57, 0.34]],
);

const frostAcolyteFront = splitCasterDirection(
    'anim_frost_acolyte_front_motion', 'anim_frost_acolyte_front_combat', 1.00, 1.05,
    [[0.50, 0.52], [0.50, 0.52], [0.50, 0.52], [0.50, 0.52]],
);
frostAcolyteFront.skill = calibrateClip({
    sheet: 'anim_frost_acolyte_front_skill', columns: 4, rows: 1, cellSize: 448,
    displayScale: 0.89, loop: false,
    frames: [0, 1, 2, 3].map(column => ({
        index: column, pivot: [0.5, 0.56], seconds: 0.12,
        ...(column === 2 ? { event: 'cast' as const } : {}),
    })),
}, 0.89, 400);

const frostAcolyteSide = splitCasterDirection(
    'anim_frost_acolyte_side_motion', 'anim_frost_acolyte_side_combat', 1.15, 1.05,
    [[0.48, 0.50], [0.48, 0.50], [0.48, 0.50], [0.48, 0.50]],
);
frostAcolyteSide.attack = calibrateClip({
    sheet: 'anim_frost_acolyte_side_attack_skill', columns: 4, rows: 2, cellSize: 448,
    displayScale: 0.91, loop: false,
    frames: [0, 1, 2, 3].map(column => ({
        index: column, pivot: [0.5, 0.56], muzzle: [0.48, 0.50] as [number, number], seconds: 0.10,
        ...(column === 2 ? { event: 'cast' as const } : {}),
    })),
}, 0.91, 400);
frostAcolyteSide.skill = calibrateClip({
    sheet: 'anim_frost_acolyte_side_attack_skill', columns: 4, rows: 2, cellSize: 448,
    displayScale: 0.91, loop: false,
    frames: [0, 1, 2, 3].map(column => ({
        index: 4 + column, pivot: [0.5, 0.56], seconds: 0.12,
        ...(column === 2 ? { event: 'cast' as const } : {}),
    })),
}, 0.91, 400);

const frostAcolyteBack = splitCasterDirection(
    'anim_frost_acolyte_back_motion', 'anim_frost_acolyte_back_combat', 1.05, 1.05,
    [[0.50, 0.50], [0.50, 0.50], [0.50, 0.50], [0.50, 0.50]],
);

const arcLeechFront = splitCasterDirection(
    'anim_arc_leech_front_motion', 'anim_arc_leech_front_combat', 1.00, 1.00,
    [[0.497, 0.514], [0.492, 0.508], [0.493, 0.513], [0.487, 0.521]],
);
const arcLeechSide = splitCasterDirection(
    'anim_arc_leech_side_motion', 'anim_arc_leech_side_combat', 1.00, 1.00,
    [[0.875, 0.631], [0.839, 0.638], [0.769, 0.631], [0.720, 0.624]],
);
const arcLeechBack = splitCasterDirection(
    'anim_arc_leech_back_motion', 'anim_arc_leech_back_combat', 1.00, 1.00,
    [[0.500, 0.420], [0.500, 0.440], [0.470, 0.317], [0.480, 0.420]],
);

/** 深海鱿鱼的三种技能使用独立动作；水弹和水刺按方向绑定真实释放点。 */
function squidDirection(motionSheet: string, combatSheet: string, skillsSheet: string,
    motionScale: number, combatScale: number, skillsScale: number,
    bombSockets: [number, number][], spikeSockets: [number, number][],
    bombEventColumn = 2): Partial<Record<ActorAction, ActorClip>> {
    const result: Partial<Record<ActorAction, ActorClip>> = {};
    for (const [action, row, loop, seconds] of [
        ['idle', 0, true, 0.24], ['walk', 1, true, 0.14],
        ['run', 2, true, 0.09], ['jump', 3, false, 0.13],
    ] as [ActorAction, number, boolean, number][]) {
        result[action] = calibrateClip({
            sheet: motionSheet, columns: 4, rows: 4, cellSize: 448,
            displayScale: motionScale, loop,
            frames: [0, 1, 2, 3].map(column => ({
                index: row * 4 + column, pivot: [0.5, 0.56], seconds,
                ...(action === 'jump' && column === 3 ? { event: 'land' as const } : {}),
            })),
        }, motionScale, 420);
    }
    for (const [action, row, seconds] of [
        ['attack', 0, 0.10], ['hit', 1, 0.09],
        ['defeated', 2, 0.20], ['skill', 3, 0.12],
    ] as [ActorAction, number, number][]) {
        result[action] = calibrateClip({
            sheet: combatSheet, columns: 4, rows: 4, cellSize: 448,
            displayScale: combatScale, loop: false,
            frames: [0, 1, 2, 3].map(column => ({
                index: row * 4 + column, pivot: [0.5, 0.56], seconds,
                ...(action === 'skill' ? { muzzle: bombSockets[column] } : {}),
                ...(action === 'attack' && column === 2 ? { event: 'strike' as const } : {}),
                ...(action === 'skill' && column === bombEventColumn ? { event: 'cast' as const } : {}),
            })),
        }, combatScale, 420);
    }
    for (const [action, row, seconds] of [
        ['skill2', 0, 0.12], ['skill3', 1, 0.11],
    ] as [ActorAction, number, number][]) {
        result[action] = calibrateClip({
            sheet: skillsSheet, columns: 4, rows: 2, cellSize: 448,
            displayScale: skillsScale, loop: false,
            frames: [0, 1, 2, 3].map(column => ({
                index: row * 4 + column, pivot: [0.5, 0.56], seconds,
                ...(action === 'skill2' ? { muzzle: spikeSockets[column] } : {}),
                ...(column === 2 ? { event: 'cast' as const } : {}),
            })),
        }, skillsScale, 420);
    }
    return result;
}

const squidFront = squidDirection(
    'anim_squid_front_motion', 'anim_squid_front_combat', 'anim_squid_front_skills',
    1.00, 1.00, 1.00,
    [[0.50, 0.78], [0.49, 0.82], [0.45, 0.88], [0.50, 0.78]],
    [[0.50, 0.78], [0.49, 0.83], [0.46, 0.89], [0.50, 0.78]],
);
const squidSide = squidDirection(
    'anim_squid_side_motion', 'anim_squid_side_combat', 'anim_squid_side_skills',
    1.00, 1.00, 1.00,
    [[0.78, 0.71], [0.81, 0.71], [0.82, 0.72], [0.78, 0.71]],
    [[0.78, 0.71], [0.83, 0.72], [0.89, 0.72], [0.78, 0.71]],
);
const squidBack = squidDirection(
    'anim_squid_back_motion', 'anim_squid_back_combat', 'anim_squid_back_skills',
    1.00, 1.00, 1.00,
    [[0.50, 0.36], [0.49, 0.33], [0.48, 0.31], [0.45, 0.27]],
    [[0.50, 0.28], [0.50, 0.20], [0.50, 0.15], [0.50, 0.28]],
    3,
);

/** 盾龟把贴壳护盾与高速碰撞分为两套技能动作。 */
function turtleDirection(motionSheet: string, combatSheet: string,
    motionScale: number, combatScale: number, chargeRow: number): Partial<Record<ActorAction, ActorClip>> {
    const result: Partial<Record<ActorAction, ActorClip>> = {};
    for (const [action, row, loop, seconds] of [
        ['idle', 0, true, 0.28], ['walk', 1, true, 0.18],
        ['run', 2, true, 0.11], ['jump', 3, false, 0.15],
    ] as [ActorAction, number, boolean, number][]) {
        result[action] = calibrateClip({
            sheet: motionSheet, columns: 4, rows: 4, cellSize: 448,
            displayScale: motionScale, loop,
            frames: [0, 1, 2, 3].map(column => ({
                index: row * 4 + column, pivot: [0.5, 0.56], seconds,
                ...(action === 'jump' && column === 3 ? { event: 'land' as const } : {}),
            })),
        }, motionScale, 420);
    }
    for (const [action, row, seconds] of [
        ['attack', 0, 0.12], ['hit', 1, 0.10],
        ['defeated', 2, 0.22], ['skill', 3, 0.13],
    ] as [ActorAction, number, number][]) {
        result[action] = calibrateClip({
            sheet: combatSheet, columns: 4, rows: 4, cellSize: 448,
            displayScale: combatScale, loop: false,
            frames: [0, 1, 2, 3].map(column => ({
                index: row * 4 + column, pivot: [0.5, 0.56], seconds,
                ...(action === 'attack' && column === 2 ? { event: 'strike' as const } : {}),
                ...(action === 'skill' && column === 2 ? { event: 'cast' as const } : {}),
            })),
        }, combatScale, 420);
    }
    result.skill2 = calibrateClip({
        sheet: 'anim_turtle_charge', columns: 4, rows: 3, cellSize: 448,
        displayScale: combatScale, loop: false,
        frames: [0, 1, 2, 3].map(column => ({
            index: chargeRow * 4 + column, pivot: [0.5, 0.56], seconds: 0.11,
            ...(column === 2 ? { event: 'cast' as const } : {}),
        })),
    }, combatScale, 420);
    return result;
}

const turtleFront = turtleDirection('anim_turtle_front_motion', 'anim_turtle_front_combat', 1.00, 1.00, 0);
const turtleSide = turtleDirection('anim_turtle_side_motion', 'anim_turtle_side_combat', 1.00, 1.00, 1);
const turtleBack = turtleDirection('anim_turtle_back_motion', 'anim_turtle_back_combat', 1.00, 1.00, 2);

/** 剑虾将钳击、背刺发射与甩尾眩晕绑定到三套不同动作。 */
function shrimpDirection(motionSheet: string, combatSheet: string, tailRow: number,
    spikeSockets: [number, number][], jumpSheet?: string): Partial<Record<ActorAction, ActorClip>> {
    const result: Partial<Record<ActorAction, ActorClip>> = {};
    for (const [action, row, loop, seconds] of [
        ['idle', 0, true, 0.24], ['walk', 1, true, 0.14],
        ['run', 2, true, 0.085], ['jump', 3, false, 0.14],
    ] as [ActorAction, number, boolean, number][]) {
        const separateJump = action === 'jump' && jumpSheet;
        result[action] = calibrateClip({
            sheet: separateJump ? jumpSheet : motionSheet,
            columns: 4, rows: separateJump ? 1 : 4, cellSize: 448,
            displayScale: 1, loop,
            frames: [0, 1, 2, 3].map(column => ({
                index: separateJump ? column : row * 4 + column,
                pivot: [0.5, 0.56], seconds,
                ...(action === 'jump' && column === 3 ? { event: 'land' as const } : {}),
            })),
        }, 1, 420);
    }
    for (const [action, row, seconds] of [
        ['attack', 0, 0.11], ['hit', 1, 0.10],
        ['defeated', 2, 0.22], ['skill', 3, 0.12],
    ] as [ActorAction, number, number][]) {
        result[action] = calibrateClip({
            sheet: combatSheet, columns: 4, rows: 4, cellSize: 448,
            displayScale: 1, loop: false,
            frames: [0, 1, 2, 3].map(column => ({
                index: row * 4 + column, pivot: [0.5, 0.56], seconds,
                ...(action === 'attack' && column === 2 ? { event: 'strike' as const } : {}),
                ...(action === 'skill' ? { muzzle: spikeSockets[column] } : {}),
                ...(action === 'skill' && column === 2 ? { event: 'cast' as const } : {}),
            })),
        }, 1, 420);
    }
    result.skill2 = calibrateClip({
        sheet: 'anim_shrimp_tail_whip', columns: 4, rows: 3, cellSize: 448,
        displayScale: 1, loop: false,
        frames: [0, 1, 2, 3].map(column => ({
            index: tailRow * 4 + column, pivot: [0.5, 0.56], seconds: 0.105,
            ...(column === 2 ? { event: 'cast' as const } : {}),
        })),
    }, 1, 420);
    return result;
}

const shrimpFront = shrimpDirection('anim_shrimp_front_motion', 'anim_shrimp_front_combat', 0,
    [[0.50,0.44],[0.50,0.40],[0.50,0.48],[0.50,0.44]], 'anim_shrimp_front_jump');
const shrimpSide = shrimpDirection('anim_shrimp_side_motion', 'anim_shrimp_side_combat', 1,
    [[0.57,0.48],[0.55,0.44],[0.50,0.41],[0.57,0.48]]);
const shrimpBack = shrimpDirection('anim_shrimp_back_motion', 'anim_shrimp_back_combat', 2,
    [[0.50,0.31],[0.50,0.27],[0.50,0.22],[0.50,0.31]]);

/** 鬼水母以独立毒针图集表现三方向伸刺，隐身则使用战斗图集的渐隐行。 */
function jellyDirection(motionSheet: string, combatSheet: string, venomRow: number,
    venomSockets: [number, number][]): Partial<Record<ActorAction, ActorClip>> {
    const result: Partial<Record<ActorAction, ActorClip>> = {};
    const motionScale = 1.2;
    for (const [action, row, loop, seconds] of [
        ['idle', 0, true, 0.28], ['walk', 1, true, 0.18],
        ['run', 2, true, 0.12], ['jump', 3, false, 0.16],
    ] as [ActorAction, number, boolean, number][]) {
        result[action] = calibrateClip({
            sheet: motionSheet, columns: 4, rows: 4, cellSize: 448,
            displayScale: motionScale, loop,
            frames: [0, 1, 2, 3].map(column => ({
                index: row * 4 + column, pivot: [0.5, 0.56], seconds,
                ...(action === 'jump' && column === 3 ? { event: 'land' as const } : {}),
            })),
        }, motionScale, 420);
    }
    for (const [action, row, seconds] of [
        ['attack', 0, 0.12], ['hit', 1, 0.10],
        ['defeated', 2, 0.22], ['skill', 3, 0.14],
    ] as [ActorAction, number, number][]) {
        result[action] = calibrateClip({
            sheet: combatSheet, columns: 4, rows: 4, cellSize: 448,
            displayScale: 1, loop: false,
            frames: [0, 1, 2, 3].map(column => ({
                index: row * 4 + column, pivot: [0.5, 0.56], seconds,
                ...(action === 'attack' && column === 2 ? { event: 'strike' as const } : {}),
                ...(action === 'skill' && column === 2 ? { event: 'cast' as const } : {}),
            })),
        }, 1, 420);
    }
    result.skill2 = calibrateClip({
        sheet: 'anim_jelly_venom_sting', columns: 4, rows: 3, cellSize: 448,
        displayScale: 1, loop: false,
        frames: [0, 1, 2, 3].map(column => ({
            index: venomRow * 4 + column, pivot: [0.5, 0.56], seconds: 0.12,
            muzzle: venomSockets[column],
            ...(column === 2 ? { event: 'cast' as const } : {}),
        })),
    }, 1, 420);
    return result;
}

const jellyFront = jellyDirection('anim_jelly_front_motion', 'anim_jelly_front_combat', 0,
    [[0.49,0.76],[0.50,0.88],[0.54,0.93],[0.49,0.76]]);
const jellySide = jellyDirection('anim_jelly_side_motion', 'anim_jelly_side_combat', 1,
    [[0.77,0.52],[0.86,0.51],[0.94,0.51],[0.77,0.53]]);
const jellyBack = jellyDirection('anim_jelly_back_motion', 'anim_jelly_back_combat', 2,
    [[0.50,0.25],[0.50,0.14],[0.54,0.11],[0.50,0.24]]);

/** 攻击无人机以独立声波和锁定光束动作表现两种远程技能。 */
function attackDroneDirection(motionSheet: string, combatSheet: string,
    sonicSockets: [number, number][], beamSockets: [number, number][]): Partial<Record<ActorAction, ActorClip>> {
    const result: Partial<Record<ActorAction, ActorClip>> = {};
    for (const [action, row, loop, seconds] of [
        ['idle', 0, true, 0.24], ['walk', 1, true, 0.15],
        ['run', 2, true, 0.09], ['jump', 3, false, 0.14],
    ] as [ActorAction, number, boolean, number][]) {
        result[action] = calibrateClip({
            sheet: motionSheet, columns: 4, rows: 4, cellSize: 448,
            displayScale: 1, loop,
            frames: [0, 1, 2, 3].map(column => ({
                index: row * 4 + column, pivot: [0.5,0.5], seconds,
                ...(action === 'jump' && column === 3 ? { event: 'land' as const } : {}),
            })),
        }, 1, 376);
    }
    const combat = (action: ActorAction, row: number, seconds: number,
        sockets?: [number, number][]): ActorClip => calibrateClip({
        sheet: combatSheet, columns: 4, rows: 4, cellSize: 448,
        displayScale: 1, loop: false,
        frames: [0, 1, 2, 3].map(column => ({
            index: row * 4 + column, pivot: [0.5,0.5], seconds,
            ...(sockets ? { muzzle: sockets[column] } : {}),
            ...(sockets && column === 2 ? { event: 'cast' as const } : {}),
        })),
    }, 1, 376);
    result.attack = combat('attack', 0, 0.11, sonicSockets);
    result.hit = combat('hit', 1, 0.10);
    result.defeated = combat('defeated', 2, 0.20);
    result.skill = combat('skill', 0, 0.11, sonicSockets);
    result.skill2 = combat('skill2', 3, 0.11, beamSockets);
    return result;
}

const attackDroneFront = attackDroneDirection('anim_drone_attack_front_motion', 'anim_drone_attack_front_combat',
    [[0.50,0.61],[0.50,0.69],[0.50,0.75],[0.50,0.64]],
    [[0.50,0.61],[0.50,0.70],[0.50,0.79],[0.50,0.64]]);
const attackDroneSide = attackDroneDirection('anim_drone_attack_side_motion', 'anim_drone_attack_side_combat',
    [[0.68,0.50],[0.76,0.50],[0.70,0.50],[0.71,0.50]],
    [[0.68,0.50],[0.77,0.50],[0.74,0.50],[0.71,0.50]]);
const attackDroneBack = attackDroneDirection('anim_drone_attack_back_motion', 'anim_drone_attack_back_combat',
    [[0.50,0.36],[0.50,0.27],[0.50,0.20],[0.50,0.33]],
    [[0.50,0.36],[0.50,0.26],[0.50,0.18],[0.50,0.33]]);

/** 支援无人机把治疗、护盾与呼叫增援分成三套可辨识动作。 */
function supportDroneDirection(motionSheet: string, combatSheet: string,
    summonRow: number): Partial<Record<ActorAction, ActorClip>> {
    const result: Partial<Record<ActorAction, ActorClip>> = {};
    for (const [action, row, loop, seconds] of [
        ['idle', 0, true, 0.24], ['walk', 1, true, 0.16],
        ['run', 2, true, 0.09], ['jump', 3, false, 0.14],
    ] as [ActorAction, number, boolean, number][]) {
        result[action] = calibrateClip({
            sheet: motionSheet, columns: 4, rows: 4, cellSize: 448,
            displayScale: 1, loop,
            frames: [0, 1, 2, 3].map(column => ({
                index: row * 4 + column, pivot: [0.5,0.5], seconds,
                ...(action === 'jump' && column === 3 ? { event: 'land' as const } : {}),
            })),
        }, 1, 386);
    }
    const combat = (action: ActorAction, row: number, seconds: number,
        event = false): ActorClip => calibrateClip({
        sheet: combatSheet, columns: 4, rows: 4, cellSize: 448,
        displayScale: 1, loop: false,
        frames: [0, 1, 2, 3].map(column => ({
            index: row * 4 + column, pivot: [0.5,0.5], seconds,
            ...(event && column === 2 ? { event: 'cast' as const } : {}),
        })),
    }, 1, 386);
    result.attack = combat('attack', 0, 0.13, true);
    result.hit = combat('hit', 1, 0.10);
    result.defeated = combat('defeated', 2, 0.20);
    result.skill = combat('skill', 0, 0.13, true);
    result.skill2 = combat('skill2', 3, 0.13, true);
    result.skill3 = calibrateClip({
        sheet: 'anim_drone_support_summon', columns: 4, rows: 3, cellSize: 448,
        displayScale: 1, loop: false,
        frames: [0, 1, 2, 3].map(column => ({
            index: summonRow * 4 + column, pivot: [0.5,0.5], seconds: 0.14,
            ...(column === 2 ? { event: 'cast' as const } : {}),
        })),
    }, 1, 402);
    return result;
}

const supportDroneFront = supportDroneDirection(
    'anim_drone_support_front_motion', 'anim_drone_support_front_combat', 0);
const supportDroneSide = supportDroneDirection(
    'anim_drone_support_side_motion', 'anim_drone_support_side_combat', 1);
const supportDroneBack = supportDroneDirection(
    'anim_drone_support_back_motion', 'anim_drone_support_back_combat', 2);

/** 铆链猎犬把高速冲猎和尾部回收夹部署分别登记为两个技能。 */
function chainHoundDirection(motionSheet: string, combatSheet: string, chargeRow: number,
    jumpSheet?: string): Partial<Record<ActorAction, ActorClip>> {
    const result: Partial<Record<ActorAction, ActorClip>> = {};
    for (const [action, row, loop, seconds] of [
        ['idle', 0, true, 0.24], ['walk', 1, true, 0.15], ['run', 2, true, 0.085],
    ] as [ActorAction, number, boolean, number][]) {
        result[action] = calibrateClip({
            sheet: motionSheet, columns: 4, rows: jumpSheet ? 3 : 4, cellSize: 448,
            displayScale: 1, loop,
            frames: [0, 1, 2, 3].map(column => ({
                index: row * 4 + column, pivot: [0.5,0.5], seconds,
            })),
        }, 1, 388);
    }
    result.jump = calibrateClip({
        sheet: jumpSheet ?? motionSheet, columns: 4, rows: jumpSheet ? 1 : 4, cellSize: 448,
        displayScale: 1, loop: false,
        frames: [0, 1, 2, 3].map(column => ({
            index: jumpSheet ? column : 12 + column, pivot: [0.5,0.5], seconds: 0.14,
            ...(column === 3 ? { event: 'land' as const } : {}),
        })),
    }, 1, 388);
    const combat = (action: ActorAction, row: number, seconds: number,
        event?: 'strike' | 'cast'): ActorClip => calibrateClip({
        sheet: combatSheet, columns: 4, rows: 4, cellSize: 448,
        displayScale: 1, loop: false,
        frames: [0, 1, 2, 3].map(column => ({
            index: row * 4 + column, pivot: [0.5,0.5], seconds,
            ...(event && column === 2 ? { event } : {}),
        })),
    }, 1, 388);
    result.attack = combat('attack', 0, 0.11, 'strike');
    result.hit = combat('hit', 1, 0.10);
    result.defeated = combat('defeated', 2, 0.20);
    result.skill2 = combat('skill2', 3, 0.12, 'cast');
    result.skill = calibrateClip({
        sheet: 'anim_chain_hound_charge', columns: 4, rows: 3, cellSize: 448,
        displayScale: 1, loop: false,
        frames: [0, 1, 2, 3].map(column => ({
            index: chargeRow * 4 + column, pivot: [0.5,0.5], seconds: 0.10,
            ...(column === 2 ? { event: 'cast' as const } : {}),
        })),
    }, 1, 402);
    return result;
}

const chainHoundFront = chainHoundDirection(
    'anim_chain_hound_front_motion', 'anim_chain_hound_front_combat', 0,
    'anim_chain_hound_front_jump');
const chainHoundSide = chainHoundDirection(
    'anim_chain_hound_side_motion', 'anim_chain_hound_side_combat', 1);
const chainHoundBack = chainHoundDirection(
    'anim_chain_hound_back_motion', 'anim_chain_hound_back_combat', 2);

/** 棱壳巡灯兽以镜片扫射和三方向闭壳分别表现两段机制技能。 */
function prismSnailDirection(motionSheet: string, combatSheet: string,
    shellRow: number): Partial<Record<ActorAction, ActorClip>> {
    const result: Partial<Record<ActorAction, ActorClip>> = {};
    for (const [action, row, loop, seconds] of [
        ['idle', 0, true, 0.25], ['walk', 1, true, 0.18],
        ['run', 2, true, 0.10], ['jump', 3, false, 0.15],
    ] as [ActorAction, number, boolean, number][]) {
        result[action] = calibrateClip({
            sheet: motionSheet, columns: 4, rows: 4, cellSize: 448,
            displayScale: 1, loop,
            frames: [0, 1, 2, 3].map(column => ({
                index: row * 4 + column, pivot: [0.5,0.5], seconds,
                ...(action === 'jump' && column === 3 ? { event: 'land' as const } : {}),
            })),
        }, 1, 390);
    }
    const combat = (action: ActorAction, row: number, seconds: number,
        event?: 'strike' | 'cast'): ActorClip => calibrateClip({
        sheet: combatSheet, columns: 4, rows: 4, cellSize: 448,
        displayScale: 1, loop: false,
        frames: [0, 1, 2, 3].map(column => ({
            index: row * 4 + column, pivot: [0.5,0.5], seconds,
            ...(event && column === 2 ? { event } : {}),
        })),
    }, 1, 390);
    result.attack = combat('attack', 0, 0.12, 'strike');
    result.hit = combat('hit', 1, 0.10);
    result.defeated = combat('defeated', 2, 0.22);
    result.skill = combat('skill', 3, 0.18, 'cast');
    result.skill2 = calibrateClip({
        sheet: 'anim_prism_snail_shell', columns: 4, rows: 3, cellSize: 448,
        displayScale: 1, loop: false,
        frames: [0, 1, 2, 3].map(column => ({
            index: shellRow * 4 + column, pivot: [0.5,0.5], seconds: 0.20,
            ...(column === 2 ? { event: 'cast' as const } : {}),
        })),
    }, 1, 402);
    return result;
}

const prismSnailFront = prismSnailDirection(
    'anim_prism_snail_front_motion', 'anim_prism_snail_front_combat', 0);
const prismSnailSide = prismSnailDirection(
    'anim_prism_snail_side_motion', 'anim_prism_snail_side_combat', 1);
const prismSnailBack = prismSnailDirection(
    'anim_prism_snail_back_motion', 'anim_prism_snail_back_combat', 2);

/** 三相祭司的火、冰、雷轮转各占一个技能槽，避免颜色与机关语义混淆。 */
function triunePriestDirection(motionSheet: string, combatSheet: string,
    skillRow: number): Partial<Record<ActorAction, ActorClip>> {
    const result: Partial<Record<ActorAction, ActorClip>> = {};
    for (const [action, row, loop, seconds] of [
        ['idle', 0, true, 0.25], ['walk', 1, true, 0.17],
        ['run', 2, true, 0.095], ['jump', 3, false, 0.15],
    ] as [ActorAction, number, boolean, number][]) {
        result[action] = calibrateClip({
            sheet: motionSheet, columns: 4, rows: 4, cellSize: 448,
            displayScale: 1, loop,
            frames: [0, 1, 2, 3].map(column => ({
                index: row * 4 + column, pivot: [0.5,0.5], seconds,
                ...(action === 'jump' && column === 3 ? { event: 'land' as const } : {}),
            })),
        }, 1, 388);
    }
    const combat = (action: ActorAction, row: number, seconds: number,
        event?: 'strike' | 'cast'): ActorClip => calibrateClip({
        sheet: combatSheet, columns: 4, rows: 4, cellSize: 448,
        displayScale: 1, loop: false,
        frames: [0, 1, 2, 3].map(column => ({
            index: row * 4 + column, pivot: [0.5,0.5], seconds,
            ...(event && column === 2 ? { event } : {}),
        })),
    }, 1, 388);
    const triuneSkill = (sheet: string, action: ActorAction, seconds: number): ActorClip => calibrateClip({
        sheet, columns: 4, rows: 3, cellSize: 448,
        displayScale: 1, loop: false,
        frames: [0, 1, 2, 3].map(column => ({
            index: skillRow * 4 + column, pivot: [0.5,0.5], seconds,
            ...(column === 2 ? { event: 'cast' as const } : {}),
        })),
    }, 1, 390);
    result.attack = combat('attack', 0, 0.12, 'strike');
    result.hit = combat('hit', 1, 0.10);
    result.defeated = combat('defeated', 2, 0.22);
    result.skill = combat('skill', 3, 0.14, 'cast');
    result.skill2 = triuneSkill('anim_triune_priest_ice', 'skill2', 0.14);
    result.skill3 = triuneSkill('anim_triune_priest_arc', 'skill3', 0.14);
    return result;
}

const triunePriestFront = triunePriestDirection(
    'anim_triune_priest_front_motion', 'anim_triune_priest_front_combat', 0);
const triunePriestSide = triunePriestDirection(
    'anim_triune_priest_side_motion', 'anim_triune_priest_side_combat', 1);
const triunePriestBack = triunePriestDirection(
    'anim_triune_priest_back_motion', 'anim_triune_priest_back_combat', 2);

/** 磁轨屠夫的本体炮击、回转锯与磁力拖拽分别对应三段固定轮转。 */
function railButcherDirection(motionSheet: string, combatSheet: string,
    skillRow: number): Partial<Record<ActorAction, ActorClip>> {
    const result: Partial<Record<ActorAction, ActorClip>> = {};
    for (const [action, row, loop, seconds] of [
        ['idle', 0, true, 0.25], ['walk', 1, true, 0.18],
        ['run', 2, true, 0.10], ['jump', 3, false, 0.16],
    ] as [ActorAction, number, boolean, number][]) {
        result[action] = calibrateClip({
            sheet: motionSheet, columns: 4, rows: 4, cellSize: 448,
            displayScale: 1, loop,
            frames: [0, 1, 2, 3].map(column => ({
                index: row * 4 + column, pivot: [0.5,0.5], seconds,
                ...(action === 'jump' && column === 3 ? { event: 'land' as const } : {}),
            })),
        }, 1, 390);
    }
    const combat = (action: ActorAction, row: number, seconds: number,
        event?: 'strike' | 'cast'): ActorClip => calibrateClip({
        sheet: combatSheet, columns: 4, rows: 4, cellSize: 448,
        displayScale: 1, loop: false,
        frames: [0, 1, 2, 3].map(column => ({
            index: row * 4 + column, pivot: [0.5,0.5], seconds,
            ...(event && column === 2 ? { event } : {}),
        })),
    }, 1, 390);
    const mechanism = (sheet: string, action: ActorAction, seconds: number): ActorClip => calibrateClip({
        sheet, columns: 4, rows: 3, cellSize: 448,
        displayScale: 1, loop: false,
        frames: [0, 1, 2, 3].map(column => ({
            index: skillRow * 4 + column, pivot: [0.5,0.5], seconds,
            ...(column === 2 ? { event: 'cast' as const } : {}),
        })),
    }, 1, 390);
    result.attack = combat('attack', 0, 0.12, 'strike');
    result.hit = combat('hit', 1, 0.10);
    result.defeated = combat('defeated', 2, 0.22);
    result.skill = combat('skill', 3, 0.18, 'cast');
    result.skill2 = mechanism('anim_rail_butcher_saw', 'skill2', 0.16);
    result.skill3 = mechanism('anim_rail_butcher_drag', 'skill3', 0.18);
    return result;
}

const railButcherFront = railButcherDirection(
    'anim_rail_butcher_front_motion', 'anim_rail_butcher_front_combat', 0);
const railButcherSide = railButcherDirection(
    'anim_rail_butcher_side_motion', 'anim_rail_butcher_side_combat', 1);
const railButcherBack = railButcherDirection(
    'anim_rail_butcher_back_motion', 'anim_rail_butcher_back_combat', 2);

/** 葬钟吞噬者用本体钟锤演出六连响、回声倒放、静默钟罩与吞音反震。 */
function bellDevourerDirection(motionSheet: string, combatSheet: string,
    skillRow: number): Partial<Record<ActorAction, ActorClip>> {
    const result: Partial<Record<ActorAction, ActorClip>> = {};
    for (const [action, row, loop, seconds] of [
        ['idle', 0, true, 0.25], ['walk', 1, true, 0.18],
        ['run', 2, true, 0.10], ['jump', 3, false, 0.16],
    ] as [ActorAction, number, boolean, number][]) {
        result[action] = calibrateClip({
            sheet: motionSheet, columns: 4, rows: 4, cellSize: 448,
            displayScale: 1, loop,
            frames: [0, 1, 2, 3].map(column => ({
                index: row * 4 + column, pivot: [0.5,0.5], seconds,
                ...(action === 'jump' && column === 3 ? { event: 'land' as const } : {}),
            })),
        }, 1, 390);
    }
    const combat = (action: ActorAction, row: number, seconds: number,
        event?: 'strike' | 'cast', loop = false): ActorClip => calibrateClip({
        sheet: combatSheet, columns: 4, rows: 4, cellSize: 448,
        displayScale: 1, loop,
        frames: [0, 1, 2, 3].map(column => ({
            index: row * 4 + column, pivot: [0.5,0.5], seconds,
            ...(event && column === 2 ? { event } : {}),
        })),
    }, 1, 390);
    const mechanism = (sheet: string, action: ActorAction, seconds: number): ActorClip => calibrateClip({
        sheet, columns: 4, rows: 3, cellSize: 448,
        displayScale: 1, loop: false,
        frames: [0, 1, 2, 3].map(column => ({
            index: skillRow * 4 + column, pivot: [0.5,0.5], seconds,
            ...(column === 2 ? { event: 'cast' as const } : {}),
        })),
    }, 1, 390);
    result.attack = combat('attack', 0, 0.12, 'strike');
    result.hit = combat('hit', 1, 0.10);
    result.defeated = combat('defeated', 2, 0.22);
    result.skill = combat('skill', 3, 0.16, 'cast', true);
    result.skill2 = mechanism('anim_bell_devourer_echo', 'skill2', 0.18);
    result.skill3 = mechanism('anim_bell_devourer_silence', 'skill3', 0.18);
    result.skill4 = mechanism('anim_bell_devourer_counter', 'skill4', 0.18);
    return result;
}

const bellDevourerFront = bellDevourerDirection(
    'anim_bell_devourer_front_motion', 'anim_bell_devourer_front_combat', 0);
const bellDevourerSide = bellDevourerDirection(
    'anim_bell_devourer_side_motion', 'anim_bell_devourer_side_combat', 1);
const bellDevourerBack = bellDevourerDirection(
    'anim_bell_devourer_back_motion', 'anim_bell_devourer_back_combat', 2);

/** 第一章废土领主把毒球、冲锋、召唤与阶段暴怒拆成独立身体动作。 */
function wasteLordDirection(motionSheet: string, combatSheet: string,
    skillRow: number): Partial<Record<ActorAction, ActorClip>> {
    const result: Partial<Record<ActorAction, ActorClip>> = {};
    for (const [action, row, loop, seconds] of [
        ['idle', 0, true, 0.28], ['walk', 1, true, 0.20],
        ['run', 2, true, 0.11], ['jump', 3, false, 0.17],
    ] as [ActorAction, number, boolean, number][]) {
        result[action] = calibrateClip({
            sheet: motionSheet, columns: 4, rows: 4, cellSize: 448,
            displayScale: 1, loop,
            frames: [0, 1, 2, 3].map(column => ({
                index: row * 4 + column, pivot: [0.5,0.5], seconds,
                ...(action === 'jump' && column === 3 ? { event: 'land' as const } : {}),
            })),
        }, 1, 390);
    }
    const combat = (action: ActorAction, row: number, seconds: number,
        event?: 'strike' | 'cast'): ActorClip => calibrateClip({
        sheet: combatSheet, columns: 4, rows: 4, cellSize: 448,
        displayScale: 1, loop: false,
        frames: [0, 1, 2, 3].map(column => ({
            index: row * 4 + column, pivot: [0.5,0.5], seconds,
            ...(event && column === 2 ? { event } : {}),
        })),
    }, 1, 390);
    const bossSkill = (sheet: string, action: ActorAction, seconds: number): ActorClip => calibrateClip({
        sheet, columns: 4, rows: 3, cellSize: 448,
        displayScale: 1, loop: false,
        frames: [0, 1, 2, 3].map(column => ({
            index: skillRow * 4 + column, pivot: [0.5,0.5], seconds,
            ...(column === 2 ? { event: 'cast' as const } : {}),
        })),
    }, 1, 390);
    result.attack = combat('attack', 0, 0.13, 'strike');
    result.hit = combat('hit', 1, 0.11);
    result.defeated = combat('defeated', 2, 0.24);
    result.skill = combat('skill', 3, 0.16, 'cast');
    result.skill2 = bossSkill('anim_boss_ch1_charge', 'skill2', 0.16);
    result.skill3 = bossSkill('anim_boss_ch1_summon', 'skill3', 0.18);
    result.skill4 = bossSkill('anim_boss_ch1_phase', 'skill4', 0.18);
    return result;
}

const wasteLordFront = wasteLordDirection(
    'anim_boss_ch1_front_motion', 'anim_boss_ch1_front_combat', 0);
const wasteLordSide = wasteLordDirection(
    'anim_boss_ch1_side_motion', 'anim_boss_ch1_side_combat', 1);
const wasteLordBack = wasteLordDirection(
    'anim_boss_ch1_back_motion', 'anim_boss_ch1_back_combat', 2);

/** 第二章钢铁之王让齿轮齐射、冲锋、召唤与炉心过载分别使用对应身体动作。 */
function forgeKingDirection(motionSheet: string, combatSheet: string,
    skillRow: number): Partial<Record<ActorAction, ActorClip>> {
    const result: Partial<Record<ActorAction, ActorClip>> = {};
    for (const [action, row, loop, seconds] of [
        ['idle', 0, true, 0.28], ['walk', 1, true, 0.20],
        ['run', 2, true, 0.11], ['jump', 3, false, 0.17],
    ] as [ActorAction, number, boolean, number][]) {
        result[action] = calibrateClip({
            sheet: motionSheet, columns: 4, rows: 4, cellSize: 448,
            displayScale: 1, loop,
            frames: [0, 1, 2, 3].map(column => ({
                index: row * 4 + column, pivot: [0.5,0.5], seconds,
                ...(action === 'jump' && column === 3 ? { event: 'land' as const } : {}),
            })),
        }, 1, 390);
    }
    const combat = (action: ActorAction, row: number, seconds: number,
        event?: 'strike' | 'cast'): ActorClip => calibrateClip({
        sheet: combatSheet, columns: 4, rows: 4, cellSize: 448,
        displayScale: 1, loop: false,
        frames: [0, 1, 2, 3].map(column => ({
            index: row * 4 + column, pivot: [0.5,0.5], seconds,
            ...(event && column === 2 ? { event } : {}),
        })),
    }, 1, 390);
    const bossSkill = (sheet: string, action: ActorAction, seconds: number): ActorClip => calibrateClip({
        sheet, columns: 4, rows: 3, cellSize: 448,
        displayScale: 1, loop: false,
        frames: [0, 1, 2, 3].map(column => ({
            index: skillRow * 4 + column, pivot: [0.5,0.5], seconds,
            ...(column === 2 ? { event: 'cast' as const } : {}),
        })),
    }, 1, 390);
    result.attack = combat('attack', 0, 0.13, 'strike');
    result.hit = combat('hit', 1, 0.11);
    result.defeated = combat('defeated', 2, 0.24);
    result.skill = combat('skill', 3, 0.16, 'cast');
    result.skill2 = bossSkill('anim_boss_ch2_charge', 'skill2', 0.16);
    result.skill3 = bossSkill('anim_boss_ch2_summon', 'skill3', 0.18);
    result.skill4 = bossSkill('anim_boss_ch2_phase', 'skill4', 0.18);
    return result;
}

const forgeKingFront = forgeKingDirection(
    'anim_boss_ch2_front_motion', 'anim_boss_ch2_front_combat', 0);
const forgeKingSide = forgeKingDirection(
    'anim_boss_ch2_side_motion', 'anim_boss_ch2_side_combat', 1);
const forgeKingBack = forgeKingDirection(
    'anim_boss_ch2_back_motion', 'anim_boss_ch2_back_combat', 2);

/** 第三章无限核用独立悬浮、追踪核、冲锋、召唤与阶段过载身体动作。 */
function infiniteCoreDirection(motionSheet: string, combatSheet: string,
    skillRow: number): Partial<Record<ActorAction, ActorClip>> {
    const result: Partial<Record<ActorAction, ActorClip>> = {};
    for (const [action, row, loop, seconds] of [
        ['idle', 0, true, 0.28], ['walk', 1, true, 0.20],
        ['run', 2, true, 0.11], ['jump', 3, false, 0.17],
    ] as [ActorAction, number, boolean, number][]) {
        result[action] = calibrateClip({
            sheet: motionSheet, columns: 4, rows: 4, cellSize: 448,
            displayScale: 1, loop,
            frames: [0, 1, 2, 3].map(column => ({
                index: row * 4 + column, pivot: [0.5,0.5], seconds,
                ...(action === 'jump' && column === 3 ? { event: 'land' as const } : {}),
            })),
        }, 1, 390);
    }
    const combat = (action: ActorAction, row: number, seconds: number,
        event?: 'strike' | 'cast'): ActorClip => calibrateClip({
        sheet: combatSheet, columns: 4, rows: 4, cellSize: 448,
        displayScale: 1, loop: false,
        frames: [0, 1, 2, 3].map(column => ({
            index: row * 4 + column, pivot: [0.5,0.5], seconds,
            ...(event && column === 2 ? { event } : {}),
        })),
    }, 1, 390);
    const bossSkill = (sheet: string, action: ActorAction, seconds: number): ActorClip => calibrateClip({
        sheet, columns: 4, rows: 3, cellSize: 448,
        displayScale: 1, loop: false,
        frames: [0, 1, 2, 3].map(column => ({
            index: skillRow * 4 + column, pivot: [0.5,0.5], seconds,
            ...(column === 2 ? { event: 'cast' as const } : {}),
        })),
    }, 1, 390);
    result.attack = combat('attack', 0, 0.13, 'strike');
    result.hit = combat('hit', 1, 0.11);
    result.defeated = combat('defeated', 2, 0.24);
    result.skill = combat('skill', 3, 0.16, 'cast');
    result.skill2 = bossSkill('anim_boss_ch3_charge', 'skill2', 0.16);
    result.skill3 = bossSkill('anim_boss_ch3_summon', 'skill3', 0.18);
    result.skill4 = bossSkill('anim_boss_ch3_phase', 'skill4', 0.18);
    return result;
}

const infiniteCoreFront = infiniteCoreDirection(
    'anim_boss_ch3_front_motion', 'anim_boss_ch3_front_combat', 0);
const infiniteCoreSide = infiniteCoreDirection(
    'anim_boss_ch3_side_motion', 'anim_boss_ch3_side_combat', 1);
const infiniteCoreBack = infiniteCoreDirection(
    'anim_boss_ch3_back_motion', 'anim_boss_ch3_back_combat', 2);

/** 第四章终焉之门用独立门环、混沌弹、冲锋、召唤与阶段过载动作。 */
function finalGateDirection(motionSheet: string, combatSheet: string,
    skillRow: number): Partial<Record<ActorAction, ActorClip>> {
    const result: Partial<Record<ActorAction, ActorClip>> = {};
    for (const [action, row, loop, seconds] of [
        ['idle', 0, true, 0.28], ['walk', 1, true, 0.20],
        ['run', 2, true, 0.11], ['jump', 3, false, 0.17],
    ] as [ActorAction, number, boolean, number][]) {
        result[action] = calibrateClip({
            sheet: motionSheet, columns: 4, rows: 4, cellSize: 448,
            displayScale: 1, loop,
            frames: [0, 1, 2, 3].map(column => ({
                index: row * 4 + column, pivot: [0.5,0.5], seconds,
                ...(action === 'jump' && column === 3 ? { event: 'land' as const } : {}),
            })),
        }, 1, 390);
    }
    const combat = (action: ActorAction, row: number, seconds: number,
        event?: 'strike' | 'cast'): ActorClip => calibrateClip({
        sheet: combatSheet, columns: 4, rows: 4, cellSize: 448,
        displayScale: 1, loop: false,
        frames: [0, 1, 2, 3].map(column => ({
            index: row * 4 + column, pivot: [0.5,0.5], seconds,
            ...(event && column === 2 ? { event } : {}),
        })),
    }, 1, 390);
    const bossSkill = (sheet: string, action: ActorAction, seconds: number): ActorClip => calibrateClip({
        sheet, columns: 4, rows: 3, cellSize: 448,
        displayScale: 1, loop: false,
        frames: [0, 1, 2, 3].map(column => ({
            index: skillRow * 4 + column, pivot: [0.5,0.5], seconds,
            ...(column === 2 ? { event: 'cast' as const } : {}),
        })),
    }, 1, 390);
    result.attack = combat('attack', 0, 0.13, 'strike');
    result.hit = combat('hit', 1, 0.11);
    result.defeated = combat('defeated', 2, 0.24);
    result.skill = combat('skill', 3, 0.16, 'cast');
    result.skill2 = bossSkill('anim_boss_ch4_charge', 'skill2', 0.16);
    result.skill3 = bossSkill('anim_boss_ch4_summon', 'skill3', 0.18);
    result.skill4 = bossSkill('anim_boss_ch4_phase', 'skill4', 0.18);
    return result;
}

const finalGateFront = finalGateDirection(
    'anim_boss_ch4_front_motion', 'anim_boss_ch4_front_combat', 0);
const finalGateSide = finalGateDirection(
    'anim_boss_ch4_side_motion', 'anim_boss_ch4_side_combat', 1);
const finalGateBack = finalGateDirection(
    'anim_boss_ch4_back_motion', 'anim_boss_ch4_back_combat', 2);

/** 机械高达 X 剑士：横劈、刀刃风暴、光剑强化与空降落地均使用独立身体动作。 */
function mechBossDirection(motionSheet: string, combatSheet: string,
    skillsSheet: string): Partial<Record<ActorAction, ActorClip>> {
    const result: Partial<Record<ActorAction, ActorClip>> = {};
    for (const [action, row, loop, seconds] of [
        ['idle', 0, true, 0.25], ['walk', 1, true, 0.18],
        ['run', 2, true, 0.10], ['jump', 3, false, 0.16],
    ] as [ActorAction, number, boolean, number][]) {
        result[action] = calibrateClip({
            sheet: motionSheet, columns: 4, rows: 4, cellSize: 448,
            displayScale: 1, loop,
            frames: [0, 1, 2, 3].map(column => ({
                index: row * 4 + column, pivot: [0.5,0.5], seconds,
                ...(action === 'jump' && column === 3 ? { event: 'land' as const } : {}),
            })),
        }, 1, 390);
    }
    const combat = (action: ActorAction, row: number, seconds: number,
        event?: 'strike' | 'cast'): ActorClip => calibrateClip({
        sheet: combatSheet, columns: 4, rows: 4, cellSize: 448,
        displayScale: 1, loop: false,
        frames: [0, 1, 2, 3].map(column => ({
            index: row * 4 + column, pivot: [0.5,0.5], seconds,
            ...(event && column === 2 ? { event } : {}),
        })),
    }, 1, 390);
    const skill = (action: ActorAction, row: number, seconds: number): ActorClip => calibrateClip({
        sheet: skillsSheet, columns: 4, rows: 3, cellSize: 448,
        displayScale: 1, loop: false,
        frames: [0, 1, 2, 3].map(column => ({
            index: row * 4 + column, pivot: [0.5,0.5], seconds,
            ...(column === 2 ? { event: 'cast' as const } : {}),
        })),
    }, 1, 390);
    result.attack = combat('attack', 0, 0.12, 'strike');
    result.hit = combat('hit', 1, 0.10);
    result.defeated = combat('defeated', 2, 0.24);
    result.skill = combat('skill', 3, 0.16, 'cast');
    result.skill2 = skill('skill2', 0, 0.15);
    result.skill3 = skill('skill3', 1, 0.16);
    result.skill4 = skill('skill4', 2, 0.15);
    return result;
}

const mechBossFront = mechBossDirection(
    'anim_boss_mech_front_motion', 'anim_boss_mech_front_combat', 'anim_boss_mech_front_skills');
const mechBossSide = mechBossDirection(
    'anim_boss_mech_side_motion', 'anim_boss_mech_side_combat', 'anim_boss_mech_side_skills');
const mechBossBack = mechBossDirection(
    'anim_boss_mech_back_motion', 'anim_boss_mech_back_combat', 'anim_boss_mech_back_skills');

/** 深海恐惧：五项主动机制各占一套本体动作，场地实体仍由玩法系统生成。 */
function fiveSkillBossDirection(motionSheet: string, combatSheet: string,
    skillsSheet: string): Partial<Record<ActorAction, ActorClip>> {
    const result: Partial<Record<ActorAction, ActorClip>> = {};
    for (const [action, row, loop, seconds] of [
        ['idle', 0, true, 0.28], ['walk', 1, true, 0.20],
        ['run', 2, true, 0.11], ['jump', 3, false, 0.17],
    ] as [ActorAction, number, boolean, number][]) {
        result[action] = calibrateClip({
            sheet: motionSheet, columns: 4, rows: 4, cellSize: 448,
            displayScale: 1, loop,
            frames: [0, 1, 2, 3].map(column => ({
                index: row * 4 + column, pivot: [0.5,0.5], seconds,
                ...(action === 'jump' && column === 3 ? { event: 'land' as const } : {}),
            })),
        }, 1, 390);
    }
    const actionClip = (sheet: string, action: ActorAction, row: number, seconds: number,
        event?: 'strike' | 'cast'): ActorClip => calibrateClip({
        sheet, columns: 4, rows: 4, cellSize: 448,
        displayScale: 1, loop: false,
        frames: [0, 1, 2, 3].map(column => ({
            index: row * 4 + column, pivot: [0.5,0.5], seconds,
            ...(event && column === 2 ? { event } : {}),
        })),
    }, 1, 390);
    result.attack = actionClip(combatSheet, 'attack', 0, 0.13, 'strike');
    result.hit = actionClip(combatSheet, 'hit', 1, 0.11);
    result.defeated = actionClip(combatSheet, 'defeated', 2, 0.24);
    result.skill = actionClip(combatSheet, 'skill', 3, 0.16, 'cast');
    result.skill2 = actionClip(skillsSheet, 'skill2', 0, 0.17, 'cast');
    result.skill3 = actionClip(skillsSheet, 'skill3', 1, 0.17, 'cast');
    result.skill4 = actionClip(skillsSheet, 'skill4', 2, 0.17, 'cast');
    result.skill5 = actionClip(skillsSheet, 'skill5', 3, 0.18, 'cast');
    return result;
}

const abyssBossFront = fiveSkillBossDirection(
    'anim_boss_abyss_front_motion', 'anim_boss_abyss_front_combat', 'anim_boss_abyss_front_skills');
const abyssBossSide = fiveSkillBossDirection(
    'anim_boss_abyss_side_motion', 'anim_boss_abyss_side_combat', 'anim_boss_abyss_side_skills');
const abyssBossBack = fiveSkillBossDirection(
    'anim_boss_abyss_back_motion', 'anim_boss_abyss_back_combat', 'anim_boss_abyss_back_skills');

const vespaBossFront = fiveSkillBossDirection(
    'anim_boss_vespa_front_motion', 'anim_boss_vespa_front_combat', 'anim_boss_vespa_front_skills');
const vespaBossSide = fiveSkillBossDirection(
    'anim_boss_vespa_side_motion', 'anim_boss_vespa_side_combat', 'anim_boss_vespa_side_skills');
const vespaBossBack = fiveSkillBossDirection(
    'anim_boss_vespa_back_motion', 'anim_boss_vespa_back_combat', 'anim_boss_vespa_back_skills');

const crucibleCityBossFront = fiveSkillBossDirection(
    'anim_boss_crucible_city_front_motion', 'anim_boss_crucible_city_front_combat',
    'anim_boss_crucible_city_front_skills');
const crucibleCityBossSide = fiveSkillBossDirection(
    'anim_boss_crucible_city_side_motion', 'anim_boss_crucible_city_side_combat',
    'anim_boss_crucible_city_side_skills');
const crucibleCityBossBack = fiveSkillBossDirection(
    'anim_boss_crucible_city_back_motion', 'anim_boss_crucible_city_back_combat',
    'anim_boss_crucible_city_back_skills');

const manyfoldBossFront = fiveSkillBossDirection(
    'anim_boss_manyfold_front_motion', 'anim_boss_manyfold_front_combat',
    'anim_boss_manyfold_front_skills');
const manyfoldBossSide = fiveSkillBossDirection(
    'anim_boss_manyfold_side_motion', 'anim_boss_manyfold_side_combat',
    'anim_boss_manyfold_side_skills');
const manyfoldBossBack = fiveSkillBossDirection(
    'anim_boss_manyfold_back_motion', 'anim_boss_manyfold_back_combat',
    'anim_boss_manyfold_back_skills');

/** 已入库的制作稿。缺失方向不得冒充已完成；由原方向图保留人物朝向。 */
export const ACTOR_ANIMATIONS: Record<string, ActorAnimationSet> = {
    enemy_archer: {
        front: {
            ...archerFrontBody,
            attack: archerAttack(0, [0.554,0.497,0.449,0.405],
                [[0.5437,0.9406],[0.4969,0.8531],[0.4375,0.9406],[0.4469,0.925]]),
            walk: archerMotion('anim_archer_front_walk', 0.145, [0.541,0.4541,0.3964,0.3501], 1),
            run: archerMotion('anim_archer_front_run8', 0.06,
                [0.52,0.51,0.505,0.51,0.52,0.51,0.505,0.51]),
        },
        side: {
            ...archerSideBody,
            attack: archerAttack(1, [0.437,0.363,0.353,0.353],
                [[0.8406,0.4938],[0.7719,0.45],[0.7594,0.4938],[0.7281,0.525]]),
            walk: archerMotion('anim_archer_side_walk8', 0.085,
                [0.4976,0.3838,0.3871,0.3936,0.4862,0.3789,0.3789,0.3871]),
            run: archerMotion('anim_archer_side_run8', 0.06,
                [0.5081,0.4188,0.4602,0.4196,0.5081,0.4188,0.4602,0.4196]),
        },
        back: {
            ...archerBackBody,
            attack: archerAttack(2, [0.518,0.465,0.418,0.374],
                [[0.6453,0.2219],[0.6188,0.2313],[0.5406,0.225],[0.4938,0.2188]]),
            walk: archerMotion('anim_archer_back_motion', 0.085,
                [0.54,0.535,0.53,0.54,0.54,0.535,0.53,0.54], 4),
            run: archerMotion('anim_archer_back_motion', 0.06,
                [0.54,0.535,0.53,0.54,0.54,0.535,0.53,0.54], 4, 8),
        },
    },
    enemy_shield: { front: shieldFront, side: shieldSide, back: shieldBack },
    enemy_exploder: { front: exploderFront, side: exploderSide, back: exploderBack },
    enemy_golem: { front: golemFront, side: golemSide, back: golemBack },
    enemy_elite: { front: eliteFront, side: eliteSide, back: eliteBack },
    enemy_rust_biter: { front: rustBiterFront, side: rustBiterSide, back: rustBiterBack },
    enemy_needle_gunner: { front: needleGunnerFront, side: needleGunnerSide, back: needleGunnerBack },
    enemy_acid_sac: { front: acidSacFront, side: acidSacSide, back: acidSacBack },
    enemy_rivet_beast: { front: rivetBeastFront, side: rivetBeastSide, back: rivetBeastBack },
    enemy_gold_scavenger: { front: goldScavengerFront, side: goldScavengerSide, back: goldScavengerBack },
    enemy_blast_tick: { front: blastTickFront, side: blastTickSide, back: blastTickBack },
    enemy_ember_acolyte: { front: emberAcolyteFront, side: emberAcolyteSide, back: emberAcolyteBack },
    enemy_frost_acolyte: { front: frostAcolyteFront, side: frostAcolyteSide, back: frostAcolyteBack },
    enemy_arc_leech: { front: arcLeechFront, side: arcLeechSide, back: arcLeechBack },
    enemy_squid: { front: squidFront, side: squidSide, back: squidBack },
    enemy_turtle: { front: turtleFront, side: turtleSide, back: turtleBack },
    enemy_shrimp: { front: shrimpFront, side: shrimpSide, back: shrimpBack },
    enemy_jelly: { front: jellyFront, side: jellySide, back: jellyBack },
    enemy_drone_attack: { front: attackDroneFront, side: attackDroneSide, back: attackDroneBack },
    enemy_drone_support: { front: supportDroneFront, side: supportDroneSide, back: supportDroneBack },
    enemy_chain_hound: { front: chainHoundFront, side: chainHoundSide, back: chainHoundBack },
    enemy_prism_snail: { front: prismSnailFront, side: prismSnailSide, back: prismSnailBack },
    enemy_triune_priest: { front: triunePriestFront, side: triunePriestSide, back: triunePriestBack },
    enemy_rail_butcher: { front: railButcherFront, side: railButcherSide, back: railButcherBack },
    enemy_bell_devourer: { front: bellDevourerFront, side: bellDevourerSide, back: bellDevourerBack },
    enemy_boss_ch1: { front: wasteLordFront, side: wasteLordSide, back: wasteLordBack },
    enemy_boss_ch2: { front: forgeKingFront, side: forgeKingSide, back: forgeKingBack },
    enemy_boss_ch3: { front: infiniteCoreFront, side: infiniteCoreSide, back: infiniteCoreBack },
    enemy_boss_ch4: { front: finalGateFront, side: finalGateSide, back: finalGateBack },
    enemy_boss_mech: { front: mechBossFront, side: mechBossSide, back: mechBossBack },
    enemy_boss_abyss: { front: abyssBossFront, side: abyssBossSide, back: abyssBossBack },
    enemy_boss_vespa: { front: vespaBossFront, side: vespaBossSide, back: vespaBossBack },
    enemy_boss_crucible_city: {
        front: crucibleCityBossFront, side: crucibleCityBossSide, back: crucibleCityBossBack,
    },
    enemy_boss_manyfold: { front: manyfoldBossFront, side: manyfoldBossSide, back: manyfoldBossBack },
    char_token_olia: { front: oliaFront, side: oliaSide, back: oliaBack },
    char_token_graf: {
        front: createDirectionClips('anim_graf_front', [
            [], [], [], [],
            [[0.31,0.52],[0.76,0.50],[0.78,0.50],[0.31,0.52]],
            [], [], [[0.50,0.56],[0.50,0.56],[0.57,0.57],[0.50,0.56]],
        ], undefined, 'fire', 1.1),
        side: createDirectionClips('anim_graf_side', [
            [], [], [], [],
            [[0.75,0.568],[0.885,0.528],[0.858,0.542],[0.65,0.61]],
            [], [], [[0.50,0.56],[0.50,0.56],[0.80,0.52],[0.50,0.56]],
        ], undefined, 'fire', 1.1),
        back: createDirectionClips('anim_graf_back', [
            [], [], [], [],
            [[0.663,0.344],[0.705,0.344],[0.738,0.275],[0.574,0.61]],
            [], [], [[0.50,0.56],[0.50,0.56],[0.70,0.40],[0.50,0.56]],
        ], undefined, 'fire', 1.1),
    },
    char_token_vivian: {
        front: vivianFront,
        side: { ...createDirectionClips('anim_vivian_side', [
            [], [], [], [],
            [[0.75, 0.33], [0.75, 0.33], [0.77, 0.33], [0.77, 0.33]],
            [], [],
            [[0.76, 0.37], [0.74, 0.37], [0.72, 0.37], [0.70, 0.37]],
        ]),
            walk: {
                sheet: 'anim_vivian_side_walk8', columns: 4, rows: 2, cellSize: 256, loop: true,
                // 人工标定骨盆横坐标，不按透明包围盒居中；上下仍保留源稿的重心变化。
                frames: [0.4478, 0.3940, 0.3845, 0.3371, 0.4478, 0.3898, 0.3929, 0.3371].map((x, index) => ({
                    index, pivot: [x, 0.56], seconds: 0.08,
                    muzzle: [[0.86,0.238],[0.82,0.238],[0.80,0.238],[0.78,0.238],
                        [0.85,0.248],[0.82,0.248],[0.80,0.248],[0.78,0.257]][index] as [number, number],
                })),
            },
            run: {
                sheet: 'anim_vivian_side_run8', columns: 4, rows: 2, cellSize: 256, loop: true,
                frames: [0.4750, 0.4200, 0.4525, 0.3950, 0.4763, 0.4263, 0.4875, 0.4400].map((x, index) => ({
                    index, pivot: [x, 0.56], seconds: 0.055,
                    muzzle: [[0.965,0.281],[0.915,0.332],[0.913,0.297],[0.818,0.278],
                        [0.971,0.304],[0.911,0.354],[0.938,0.334],[0.855,0.289]][index] as [number, number],
                })),
            },
        },
        back: vivianBack,
    },
    char_token_reik: {
        front: createDirectionClips('anim_reik_front', [], undefined, 'strike'),
        side: createDirectionClips('anim_reik_side', [], undefined, 'strike'),
        back: createDirectionClips('anim_reik_back', [], undefined, 'strike'),
    },
    char_token_liana: {
        front: createDirectionClips('anim_liana_front', [
            [[0.86,0.63],[0.86,0.63],[0.86,0.63],[0.86,0.63]],
            [[0.85,0.64],[0.80,0.64],[0.81,0.64],[0.81,0.64]],
            [[0.90,0.66],[0.87,0.66],[0.88,0.66],[0.88,0.66]],
            [[0.90,0.71],[0.87,0.52],[0.83,0.50],[0.85,0.67]],
            [[0.87,0.35],[0.91,0.42],[0.90,0.40],[0.80,0.60]],
            [], [],
            [[0.81,0.73],[0.87,0.38],[0.85,0.36],[0.80,0.70]],
        ]),
        side: createDirectionClips('anim_liana_side', [
            [[0.86,0.44],[0.83,0.44],[0.85,0.44],[0.85,0.44]],
            [[0.85,0.52],[0.84,0.52],[0.83,0.52],[0.83,0.52]],
            [[0.89,0.56],[0.88,0.56],[0.89,0.56],[0.90,0.56]],
            [[0.90,0.65],[0.85,0.48],[0.85,0.46],[0.85,0.66]],
            [[0.85,0.47],[0.86,0.47],[0.85,0.43],[0.83,0.48]],
            [], [],
            [[0.88,0.41],[0.90,0.41],[0.90,0.43],[0.89,0.43]],
        ], undefined, 'fire', 1.2),
        back: createDirectionClips('anim_liana_back', [
            [[0.73,0.12],[0.74,0.12],[0.74,0.12],[0.75,0.12]],
            [[0.70,0.18],[0.68,0.18],[0.67,0.18],[0.68,0.18]],
            [[0.77,0.16],[0.75,0.16],[0.76,0.16],[0.79,0.16]],
            [[0.80,0.24],[0.75,0.18],[0.75,0.14],[0.77,0.24]],
            [[0.85,0.28],[0.85,0.28],[0.84,0.29],[0.83,0.35]],
            [], [],
            [[0.80,0.16],[0.78,0.15],[0.83,0.22],[0.82,0.17]],
        ], undefined, 'fire', 1.05),
    },
    enemy_grunt: {
        front: createDirectionClips('anim_grunt_front', [], undefined, 'strike'),
        side: createDirectionClips('anim_grunt_side', [], undefined, 'strike', 1.15),
        back: createDirectionClips('anim_grunt_back', [], undefined, 'strike'),
    },
    char_token_kai: {
        front: createDirectionClips('anim_kai_front', [
            [[0.71,0.46],[0.71,0.46],[0.71,0.46],[0.71,0.46]],
            [[0.65,0.49],[0.65,0.49],[0.64,0.49],[0.64,0.49]],
            [[0.71,0.55],[0.71,0.53],[0.72,0.52],[0.72,0.54]],
            [[0.75,0.65],[0.76,0.56],[0.74,0.44],[0.76,0.65]],
            [[0.72,0.40],[0.75,0.33],[0.73,0.41],[0.73,0.41]],
            [[0.70,0.52],[0.72,0.42],[0.67,0.46],[0.70,0.53]],
            [],
            [[0.65,0.50],[0.68,0.50],[0.92,0.41],[0.69,0.50]],
        ]),
        back: createDirectionClips('anim_kai_back', [
            [[0.75,0.12],[0.75,0.12],[0.75,0.12],[0.75,0.12]],
            [[0.72,0.27],[0.75,0.23],[0.75,0.24],[0.76,0.24]],
            [[0.78,0.27],[0.80,0.30],[0.78,0.30],[0.83,0.36]],
            [[0.73,0.42],[0.73,0.31],[0.73,0.23],[0.73,0.43]],
            [[0.65,0.24],[0.635,0.165],[0.65,0.23],[0.65,0.24]],
            [],
            [],
            [[0.72,0.25],[0.74,0.26],[0.71,0.29],[0.71,0.26]],
        ]),
        side: { ...createDirectionClips('anim_kai_side', [
            [[0.85,0.37],[0.82,0.37],[0.77,0.37],[0.72,0.37]],
            [[0.85,0.42],[0.77,0.43],[0.77,0.42],[0.72,0.43]],
            [[0.88,0.46],[0.87,0.47],[0.79,0.47],[0.80,0.49]],
            [[0.84,0.48],[0.77,0.33],[0.71,0.32],[0.77,0.49]],
            [[0.88,0.36],[0.86,0.37],[0.78,0.39],[0.71,0.36]],
            [[0.81,0.32],[0.81,0.35],[0.76,0.38],[0.69,0.37]],
            [],
            [[0.86,0.41],[0.90,0.41],[0.81,0.41],[0.74,0.41]],
        ], [[0.47,0.56],[0.43,0.56],[0.39,0.56],[0.35,0.56]]),
            walk: {
                sheet: 'anim_kai_side_walk8', columns: 4, rows: 2, cellSize: 256, loop: true,
                frames: [0,1,2,3,4,5,6,7].map(index => ({
                    index, pivot: [0.49, 0.56], muzzle: [0.85, 0.39], seconds: 0.065,
                })),
            },
        },
    },
};

// 凯尔现有skill行就是强化射击(Q)；新增两套专属稿区分弹幕模式(E)与核心过载(R)。
for (const [view, row] of [['front', 0], ['side', 1], ['back', 2]] as [ActorView, number][]) {
    const clips = ACTOR_ANIMATIONS.char_token_kai[view]!;
    clips.skill2 = heroSkillClip('anim_kai_skill2', row);
    const muzzle: Record<ActorView, [number, number][]> = {
        front: [[0.74,0.47],[0.75,0.46],[0.77,0.45],[0.75,0.47]],
        side: [[0.80,0.43],[0.80,0.43],[0.81,0.42],[0.80,0.43]],
        back: [[0.73,0.36],[0.75,0.36],[0.78,0.35],[0.75,0.36]],
    };
    clips.skill3 = heroSkillClip('anim_kai_skill3', row, muzzle[view]);
}

// 薇薇安skill为部署炮台(Q)；超频指令(E)与炮台风暴(R)使用各自的控制姿势。
for (const [view, row] of [['front', 0], ['side', 1], ['back', 2]] as [ActorView, number][]) {
    const clips = ACTOR_ANIMATIONS.char_token_vivian[view]!;
    clips.skill2 = heroSkillClip('anim_vivian_skill2', row);
    clips.skill3 = heroSkillClip('anim_vivian_skill3', row);
}

// 雷克原skill行表现双斧上举战吼，改绑E；Q怒冲与R死亡意志使用专属三方向稿。
for (const [view, row] of [['front', 0], ['side', 1], ['back', 2]] as [ActorView, number][]) {
    const clips = ACTOR_ANIMATIONS.char_token_reik[view]!;
    const warcry = clips.skill!;
    clips.skill = heroSkillClip('anim_reik_skill', row, [], 1.4);
    clips.skill2 = warcry;
    clips.skill3 = heroSkillClip('anim_reik_skill3', row, [], 1.3);
}

// 奥莉亚原skill表现腕部时核上举蓄能，改绑R奇点；Q瞬移斩与E形态切换使用专属稿。
for (const [view, row] of [['front', 0], ['side', 1], ['back', 2]] as [ActorView, number][]) {
    const clips = ACTOR_ANIMATIONS.char_token_olia[view]!;
    const singularity = clips.skill!;
    clips.skill = heroSkillClip('anim_olia_skill', row, [], 1.25);
    clips.skill2 = heroSkillClip('anim_olia_skill2', row);
    clips.skill3 = singularity;
}

// 格雷夫和莉安娜现有skill分别对应Q混沌脉冲、Q冰晶穿刺；E/R补入专属三方向稿。
for (const [view, row] of [['front', 0], ['side', 1], ['back', 2]] as [ActorView, number][]) {
    const graf = ACTOR_ANIMATIONS.char_token_graf[view]!;
    graf.skill2 = heroSkillClip('anim_graf_skill2', row);
    graf.skill3 = heroSkillClip('anim_graf_skill3', row);
    const liana = ACTOR_ANIMATIONS.char_token_liana[view]!;
    liana.skill2 = heroSkillClip('anim_liana_skill2', row, [], 1.2);
    liana.skill3 = heroSkillClip('anim_liana_skill3', row, [], 1.2);
}

export function actorClip(key: string, view: ActorView, action: ActorAction): ActorClip | undefined {
    return ACTOR_ANIMATIONS[key]?.[view]?.[action];
}
