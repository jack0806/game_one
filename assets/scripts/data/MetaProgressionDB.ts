// ============================================================
//  MetaProgressionDB.ts — 任务树与图鉴的可扩展占位数据
// ============================================================
// 当前内容仅用于页面结构与视觉验证。正式策划数据确定后，可直接替换数组
// 内容；UI 只依赖这些接口，不需要调整节点布局或交互代码。

export type QuestBranch = 'main' | 'side';
export type QuestState = 'completed' | 'active' | 'available' | 'locked';

export interface QuestDef {
    id: string;
    branch: QuestBranch;
    chapter: string;
    name: string;
    desc: string;
    objective: string;
    progress: number;
    goal: number;
    reward: string;
    rewardIcon: string;
    state: QuestState;
    prerequisite?: string;
}

/** 主线/支线均为占位任务；顺序即任务树中的前后依赖顺序。 */
export const QUESTS: QuestDef[] = [
    {
        id: 'main_01', branch: 'main', chapter: '序章', name: '首次校准',
        desc: '完成一次战斗部署，确认海克斯核心可以正常运转。',
        objective: '完成任意一局战斗', progress: 1, goal: 1,
        reward: '核心币 × 100', rewardIcon: 'gold', state: 'completed',
    },
    {
        id: 'main_02', branch: 'main', chapter: '第一章', name: '废土信号',
        desc: '追踪废土深处的异常脉冲，并清理阻断路线的敌群。',
        objective: '击败 80 个敌人', progress: 42, goal: 80,
        reward: '强化样本 × 1', rewardIcon: 'summon', state: 'active', prerequisite: 'main_01',
    },
    {
        id: 'main_03', branch: 'main', chapter: '第一章', name: '领主残响',
        desc: '信号源被大型生命体占据，需要完成一次首领讨伐。',
        objective: '击败第一章首领', progress: 0, goal: 1,
        reward: '核心币 × 240', rewardIcon: 'crit', state: 'locked', prerequisite: 'main_02',
    },
    {
        id: 'main_04', branch: 'main', chapter: '第二章', name: '熔炉之门',
        desc: '前往钢铁工厂。后续目标将在正式任务配置完成后开放。',
        objective: '占位目标：抵达第二章', progress: 0, goal: 1,
        reward: '未知奖励', rewardIcon: 'chaos', state: 'locked', prerequisite: 'main_03',
    },
    {
        id: 'side_01', branch: 'side', chapter: '行动记录', name: '火力测试',
        desc: '记录不同强化组合的作战表现，为后续部署提供样本。',
        objective: '单局装备 3 个强化', progress: 3, goal: 3,
        reward: '核心币 × 60', rewardIcon: 'gold', state: 'completed',
    },
    {
        id: 'side_02', branch: 'side', chapter: '英雄档案', name: '轮换出击',
        desc: '使用不同英雄完成行动，补全作战适配数据。',
        objective: '使用 3 名不同英雄', progress: 2, goal: 3,
        reward: '档案碎片 × 2', rewardIcon: 'summon', state: 'active',
    },
    {
        id: 'side_03', branch: 'side', chapter: '资源回收', name: '拾荒协议',
        desc: '回收战场上的六角货币，验证资源循环流程。',
        objective: '累计获得 1200 金币', progress: 760, goal: 1200,
        reward: '刷新许可 × 1', rewardIcon: 'speed', state: 'available',
    },
    {
        id: 'side_04', branch: 'side', chapter: '隐藏记录', name: '未命名委托',
        desc: '任务内容尚未配置，将在后续版本中替换。',
        objective: '占位目标', progress: 0, goal: 1,
        reward: '未知奖励', rewardIcon: 'chaos', state: 'locked',
    },
];

export type CodexCategory = 'monster' | 'hero';
export type CodexRarity = '普通' | '精英' | '首领' | '英雄';

export interface CodexEntry {
    id: string;
    category: CodexCategory;
    name: string;
    subtitle: string;
    desc: string;
    artKey: string;
    color: string;
    rarity: CodexRarity;
    traits: string[];
    unlocked: boolean;
}

/** 图鉴条目使用现有角色/敌人资源占位；未解锁条目不会加载图片。 */
export const CODEX_ENTRIES: CodexEntry[] = [
    { id: 'grunt', category: 'monster', name: '腐肉行者', subtitle: '废土基础感染体',
      desc: '数量庞大的近战单位，会从战场边缘持续逼近。单体威胁不高，但容易形成包围。',
      artKey: 'enemy_grunt', color: '#ff6258', rarity: '普通', traits: ['近战', '群聚', '感染体'], unlocked: true },
    { id: 'shield', category: 'monster', name: '护盾兵', subtitle: '重装防线单位',
      desc: '携带能量护盾的前排单位。正面承伤能力突出，优先绕行或集中火力击破护盾。',
      artKey: 'enemy_shield', color: '#5599ff', rarity: '普通', traits: ['护盾', '重装', '近战'], unlocked: true },
    { id: 'exploder', category: 'monster', name: '爆裂寄生体', subtitle: '高危自爆单位',
      desc: '接近英雄后会进入短暂引爆阶段。危险轮廓亮起时应立即拉开距离。',
      artKey: 'enemy_exploder', color: '#ff9a3c', rarity: '普通', traits: ['自爆', '范围伤害', '高速'], unlocked: true },
    { id: 'golem', category: 'monster', name: '石像鬼', subtitle: '高耐久重甲单位',
      desc: '移动迟缓但极难击退，常用于压缩安全空间。持续伤害与穿透攻击更有效。',
      artKey: 'enemy_golem', color: '#a7b0bd', rarity: '精英', traits: ['重甲', '高生命', '抗击退'], unlocked: true },
    { id: 'elite_grunt', category: 'monster', name: '猩红精英', subtitle: '强化感染样本',
      desc: '被海克斯辐射强化的行者，速度、生命与攻击均高于普通个体。',
      artKey: 'enemy_grunt', color: '#ff55e8', rarity: '精英', traits: ['强化', '追击', '高威胁'], unlocked: true },
    { id: 'boss_ch1', category: 'monster', name: '废土领主·腐肉', subtitle: '第一章区域首领',
      desc: '尚未完成全部生态记录。击败对应首领后将公开完整资料。',
      artKey: 'enemy_boss_ch1', color: '#ff493d', rarity: '首领', traits: ['首领', '冲锋', '阶段变化'], unlocked: false },
    { id: 'boss_ch2', category: 'monster', name: '钢铁之王·熔炉', subtitle: '第二章区域首领',
      desc: '档案被加密。抵达钢铁工厂并完成首次交战后解锁。',
      artKey: 'enemy_boss_ch2', color: '#ffad55', rarity: '首领', traits: ['首领', '机械', '高温'], unlocked: false },
    { id: 'boss_ch3', category: 'monster', name: '海克斯异变体', subtitle: '第三章区域首领',
      desc: '未知样本。当前仅记录到高强度海克斯能量反应。',
      artKey: 'enemy_boss_ch3', color: '#31e6b1', rarity: '首领', traits: ['未知', '异变', '能量体'], unlocked: false },
    { id: 'kai', category: 'hero', name: '炮击手·凯尔', subtitle: '穿透火力 / 远程输出',
      desc: '使用义肢炮持续压制敌群，擅长穿透弹道与大范围爆炸输出。',
      artKey: 'char_kai', color: '#00ffcc', rarity: '英雄', traits: ['远程', '穿透', '爆发'], unlocked: true },
    { id: 'vivian', category: 'hero', name: '工程师·薇薇安', subtitle: '炮台网络 / 持续输出',
      desc: '部署机械炮台建立交叉火力，以召唤单位控制战场节奏。',
      artKey: 'char_vivian', color: '#00aaff', rarity: '英雄', traits: ['召唤', '炮台', '控制'], unlocked: true },
    { id: 'reik', category: 'hero', name: '狂战士·雷克', subtitle: '近战吸血 / 风险爆发',
      desc: '生命越低战斗力越强，依靠冲锋和吸血在敌群中心持续作战。',
      artKey: 'char_reik', color: '#ff4444', rarity: '英雄', traits: ['近战', '吸血', '狂暴'], unlocked: true },
    { id: 'olia', category: 'hero', name: '时空行者·奥莉亚', subtitle: '时间操控 / 战场控制',
      desc: '通过时间倒流和全场冻结修正战局，拥有最高的机动能力。',
      artKey: 'char_olia', color: '#aaddff', rarity: '英雄', traits: ['冻结', '机动', '控制'], unlocked: true },
    { id: 'graf', category: 'hero', name: '混沌傀儡·格雷夫', subtitle: '混沌联动 / 随机构筑',
      desc: '英雄档案尚未完全解锁。达成解锁条件后显示完整资料。',
      artKey: 'char_graf', color: '#cc44ff', rarity: '英雄', traits: ['混沌', '随机', '联动'], unlocked: false },
    { id: 'liana', category: 'hero', name: '冰霜狙击手·利亚娜', subtitle: '精准狙击 / 冰霜控制',
      desc: '英雄档案尚未完全解锁。达成解锁条件后显示完整资料。',
      artKey: 'char_liana', color: '#00ccff', rarity: '英雄', traits: ['狙击', '冰霜', '高伤害'], unlocked: false },
];

export function questsByBranch(branch: QuestBranch): QuestDef[] {
    return QUESTS.filter(q => q.branch === branch);
}

export function codexByCategory(category: CodexCategory): CodexEntry[] {
    return CODEX_ENTRIES.filter(e => e.category === category);
}
