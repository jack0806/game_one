// ============================================================
//  MetaProgressionDB.ts — 全单位图鉴档案
// ============================================================
// 名称、图像和出现地点取自玩法数据；文案只描述稳定的战斗特征。

import { CHARS } from './CharacterDB';
import { BOSSES, MINI_BOSSES, TEST_BOSSES, TEST_GRUNTS, UNIT_CATALOG } from './BossDB';
import { MAPS } from './LevelIndex';

export type CodexCategory = 'hero' | 'boss' | 'miniboss' | 'grunt';

export interface CodexEntry {
    id: string;
    category: CodexCategory;
    name: string;
    subtitle: string;
    desc: string;
    combat: string;
    artKey: string;
    color: string;
    traits: string[];
    encounter: string;
}

type Note = [subtitle: string, desc: string, combat: string, traits: string[]];

const HERO_NOTES: Record<string, Note> = {
    kai: ['青能炮击 / 远程火力', '右臂义肢炮是凯尔的主武器，以穿透弹道和范围炮击打开敌群缺口。', '保持射线通路，利用炮击击穿密集目标。', ['炮击', '穿透', '爆发']],
    vivian: ['工程部署 / 阵地控制', '薇薇安以飞炮和机械装置组建交叉火力，在持续战斗中扩展阵地。', '提前部署飞炮，让炮口覆盖敌人的必经路线。', ['飞炮', '召唤', '持续输出']],
    reik: ['双斧突进 / 近身压制', '雷克以双斧冲入敌群，靠高风险近战和生命回复维持攻势。', '观察血量与敌群间距，选择冲锋时机。', ['双斧', '近战', '吸血']],
    olia: ['时序装置 / 战场修正', '奥莉亚利用时间能力重排攻防节奏，兼具机动与大范围控制。', '在包围形成前使用时序能力调整站位。', ['时间', '机动', '控制']],
    graf: ['混沌核心 / 爆发连锁', '紫黑石甲保护着格雷夫胸前的混沌核心，技能会引发连锁冲击。', '利用技能范围制造连续命中。', ['混沌', '重甲', '范围攻击']],
    liana: ['冰霜长枪 / 精准狙击', '白色兜帽与冰蓝长枪是利亚娜的标记，远程点杀与冰霜控制相互配合。', '拉开射击距离，利用冰霜效果阻断追击。', ['狙击', '冰霜', '远程']],
    via: ['双刃窃技 / 反制火力', '薇娅以蓝色短刃穿行战场，窃取敌方招式并将火力反制回去。', '留意可窃取的敌方攻击，在合适时机反击。', ['窃取', '双刃', '反制']],
    mortis: ['灵魂法杖 / 亡灵军团', '莫提斯驱使骸骨仆从作战，以积累的灵魂强化军团与自身。', '让召唤物牵制敌人，同时保护灵魂层数。', ['召唤', '灵魂', '成长']],
};

const ENEMY_NOTES: Record<string, Note> = {
    boss_ch1: ['腐肉军团统御者', '废土领主以骨爪、冲锋和感染体压迫战场。', '留出冲锋路线，避开正面突进。', ['腐肉', '冲锋', '召唤']],
    boss_ch2: ['熔炉重甲统御者', '钢铁之王把高温炉心和厚重机械结合，持续挤压安全区域。', '识别炉心亮起后的攻击节奏，保持侧向移动。', ['机械', '高温', '重甲']],
    boss_ch3: ['海克斯失控核心', '无限核将实验室能量聚成异变形体，以扩散能量封锁空间。', '观察能量释放方向，在间隙穿越封锁区。', ['海克斯', '异变', '能量']],
    boss_ch4: ['终焉之门化身', '混沌深渊以虚空结构和范围打击撕裂战场。', '提早离开危险区域，保留机动技能应对连击。', ['虚空', '范围', '阶段']],
    boss_mech: ['天罚领域机械巨神', '机械高达X-剑以巨剑和机械火力交替压制。', '在剑击与远程火力间切换站位。', ['巨剑', '机械', '连击']],
    boss_abyss: ['深海领域掠食者', '深海恐惧以触手和深海能量构筑连续攻击。', '观察触手展开方向，从未覆盖的侧面突围。', ['深海', '触手', '范围']],
    boss_vespa: ['疫晶蛛群母体', '维斯帕以毒晶与蛛网封锁路径，多足身形让突袭方向难以预测。', '绕开蛛网和毒晶，保持移动空间。', ['蛛网', '毒晶', '突袭']],
    boss_crucible_city: ['磁潮铸城巨兽', '坩埚背负铸造设施，将磁力、装甲与炮火合成大范围压制。', '离开持续磁场，再寻找装甲攻击的空档。', ['磁潮', '铸造', '装甲']],
    boss_manyfold: ['折界位面的裁缝', '万相以折叠空间和分裂攻击干扰方位判断。', '根据本体的动作预判攻击，避免多向夹击。', ['折界', '分裂', '位移']],
    boss_invader: ['最终机械灾厄', '灭世机神·天罚是第六图终局首领，机甲形态与密集火力共同覆盖战场。', '辨识攻击前摇，再利用间歇集中输出。', ['终局', '机甲', '阶段']],
    boss_joker: ['隐藏首领 / 滑稽猴', '体形小、动作快的彩蛋首领，以挥掌和恶作剧打乱节奏。', '保持距离，留意突然的贴身突进。', ['彩蛋', '高速', '近身']],
    squid: ['深海触手型小首领', '深海鱿鱼从多方向伸展触手，近身时占据较大的行动空间。', '沿触手间隙移动，避免被逼至边角。', ['触手', '深海', '包围']],
    turtle: ['厚甲防御型小首领', '盾龟以坚固外壳缓慢推进，擅长吸收正面火力。', '绕至侧面输出，避免在正面消耗过久。', ['护甲', '防御', '缓行']],
    shrimp: ['双刃突进型小首领', '锯齿剑虾依靠锋利前肢快速斩击。', '在其突进前让出路线，抓住收招间隙。', ['双刃', '突进', '连斩']],
    jelly: ['毒刺漂浮型小首领', '鬼水母在空中飘动，以毒刺控制周围空间。', '保持与触须的距离，避开持续危险区域。', ['漂浮', '毒刺', '范围']],
    drone_a: ['攻击型机械无人机', '机动无人机从战线后方持续寻找远程射击角度。', '优先处理远程火力，避免被多架包夹。', ['无人机', '远程', '机动']],
    drone_s: ['支援型机械无人机', '支援无人机为敌群提供辅助，放大其他单位的威胁。', '先切断支援，再清理被保护的目标。', ['无人机', '支援', '协同']],
    chain_hound: ['铆链追猎型小首领', '卡扣以链甲和四足步态高速追猎，切入英雄的移动路线。', '横向调整路线，避免持续直线逃跑。', ['四足', '追猎', '铆链']],
    prism_snail: ['棱镜防护型小首领', '澜镜背负棱壳，晶面承载光束和防御结构。', '观察棱壳朝向，从侧后寻找攻击角度。', ['棱镜', '防护', '光束']],
    triune_priest: ['三相施法型小首领', '赫黎以三相仪式切换攻击，远处施法也能改变战场压力。', '分辨当前相位，优先打断危险蓄力。', ['三相', '施法', '转换']],
    rail_butcher: ['磁轨斩击型小首领', '零扳机将磁轨武器与近身斩击结合，覆盖两个攻击距离。', '避开武器指向的直线，利用转向间隙反击。', ['磁轨', '斩击', '直线']],
    bell_devourer: ['葬钟声波型小首领', '赫兹以沉重钟体和声波震荡制造持续压迫。', '远离声波中心，等待震荡结束再靠近。', ['声波', '重击', '压制']],
    grunt: ['废土近战基础兵', '成群从外围逼近，以数量封堵退路。', '清理前排并保留撤退通道。', ['近战', '群聚', '感染']],
    shield: ['重装护盾兵', '护盾保护前排身躯，也为身后的远程敌人争取时间。', '集中火力破盾，或从侧面穿过防线。', ['护盾', '前排', '重装']],
    exploder: ['高危自爆体', '接近后进入引爆阶段，短暂预警后造成范围冲击。', '看到引爆预警立即拉开距离。', ['自爆', '范围', '突进']],
    golem: ['高耐久石甲体', '厚重石甲让石像鬼缓慢而稳定地推进。', '利用穿透与持续输出处理厚甲。', ['石甲', '高耐久', '缓行']],
    elite_grunt: ['强化感染精英', '精英感染体比普通行者更坚韧，常混在敌潮之中。', '辨识特殊轮廓，避免当作普通小兵。', ['精英', '追击', '高威胁']],
    archer: ['远程毒箭手', '毒射手躲在队伍后方发射弹体。', '穿过前排间隙，优先压制后方射手。', ['远程', '毒素', '骚扰']],
    miniboss: ['暗影猎手 / 精英兵', '暗影猎手以突进节奏切入战线，是小兵群中的高危个体。', '留心突进方向，预留闪避空间。', ['追猎', '突进', '精英']],
    rust_biter: ['废土扑咬型小兵', '锈齿扑兵从废墟中扑近，以锈蚀口器袭击。', '在扑击前将其击退或清除。', ['扑咬', '近战', '废土']],
    needle_gunner: ['工业远程射手', '断针射手以细长枪口持续射击，常躲在重装单位背后。', '利用掩体截断弹道，优先处理枪手。', ['远程', '弹道', '机械']],
    ember_acolyte: ['熔焰施法型小兵', '焚芯咒仆在后排蓄积火焰能量。', '蓄力时横向移动，避开火焰覆盖。', ['火焰', '施法', '远程']],
    frost_acolyte: ['冰霜施法型小兵', '冻脉咒仆释放冰霜攻击，帮助敌潮缩小包围圈。', '脱离冰霜区域，保持机动。', ['冰霜', '减速', '远程']],
    acid_sac: ['酸液投射型小兵', '酸囊投手把腐蚀液团投向远处。', '观察落点并离开酸液区域。', ['酸液', '投射', '区域']],
    rivet_beast: ['重甲四足型小兵', '铆甲兽以结实的机械外壳缓慢推进，担当前排。', '绕开正面装甲，先处理后方远程威胁。', ['四足', '护甲', '前排']],
    arc_leech: ['电弧寄生型小兵', '闪弧寄生体携带不稳定电能，靠近会压缩安全空间。', '避免贴身停留，及时清除。', ['电弧', '寄生', '机动']],
    gold_scavenger: ['高速掠夺型小兵', '掠金虫行动迅速，携带高额战利品。', '看到金色轮廓时优先追击。', ['高速', '金币', '逃逸']],
    blast_tick: ['熔爆自毁型小兵', '熔爆蜱体形虽小，靠近目标会引发灼热爆炸。', '及早辨识亮橙核心，避免贴身。', ['爆炸', '火焰', '高速']],
};

function enemyColor(id: string, category: string): string {
    if (category === 'miniboss') {
        const def = MINI_BOSSES.find(x => x.id === id);
        return def?.glow ?? '#23d7e8';
    }
    if (category === 'grunt') {
        const def = TEST_GRUNTS.find(x => x.id === id);
        return def?.glow ?? '#ff9b7b';
    }
    const main = BOSSES.find(x => `boss_${x.id}` === id);
    if (main) return main.glow;
    const special = TEST_BOSSES.find(x => x.kind === id.replace(/^boss_/, ''));
    return special?.glow ?? '#ffc85c';
}

function encounterFor(id: string, category: CodexCategory): string {
    if (category === 'hero') return '英雄阵容';
    if (category === 'boss') {
        const mainId = id === 'boss_mech' ? 'ch5' : id === 'boss_invader' ? 'ch6' : id.replace(/^boss_/, '');
        const map = MAPS.find(x => x.bossId === mainId);
        return map ? `${map.name} · 关底` : '战斗测试房';
    }
    const maps = MAPS.filter(map => category === 'miniboss'
        ? [map.miniPool.普通, map.miniPool.史诗, map.miniPool.地狱].some(pool => pool.indexOf(id) >= 0)
        : [...map.roster.melee, ...map.roster.ranged, ...(map.roster.finaleBoost ?? [])].indexOf(id) >= 0);
    return maps.length ? `${maps.slice(0, 2).map(x => x.name).join(' / ')}${maps.length > 2 ? ' 等' : ''}` : '战斗测试房';
}

export const CODEX_ENTRIES: CodexEntry[] = [
    ...CHARS.map((hero): CodexEntry => {
        const [subtitle, desc, combat, traits] = HERO_NOTES[hero.id];
        return { id: hero.id, category: 'hero', name: hero.name, subtitle, desc, combat,
            artKey: `ui_hero_display_${hero.id}`, color: hero.color, traits, encounter: encounterFor(hero.id, 'hero') };
    }),
    ...UNIT_CATALOG.map((unit): CodexEntry => {
        const [subtitle, desc, combat, traits] = ENEMY_NOTES[unit.id];
        return { id: unit.id, category: unit.category, name: unit.label, subtitle, desc, combat,
            artKey: `ui_unit_display_${unit.id}`, color: enemyColor(unit.id, unit.category),
            traits, encounter: encounterFor(unit.id, unit.category) };
    }),
];

export function codexByCategory(category: CodexCategory): CodexEntry[] {
    return CODEX_ENTRIES.filter(entry => entry.category === category);
}
