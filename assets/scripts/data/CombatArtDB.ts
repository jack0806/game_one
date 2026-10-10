/** 敌方弹体的正式材质层；弹体随真实速度移动，不与程序轮廓叠绘。 */
export const ENEMY_PROJECTILE_ART: Record<string, { key: string; aspect: number; scale: number; spin?: number }> = {
    needle:       { key: 'fx_enemy_needle', aspect: 1, scale: 5.5 },
    shrimp_spike: { key: 'fx_enemy_needle', aspect: 1, scale: 5.8 },
    frost:        { key: 'fx_enemy_frost', aspect: 1, scale: 5.2 },
    water_spike:  { key: 'fx_enemy_water_lance', aspect: 0.8, scale: 5.8 },
    poison:       { key: 'fx_enemy_toxic', aspect: 1, scale: 3.6, spin: 42 },
    toxin_dart:   { key: 'fx_enemy_toxic', aspect: 1, scale: 4.8 },
    venom_sting:  { key: 'fx_enemy_stinger', aspect: 0.8, scale: 5.2 },
    water_bomb:   { key: 'fx_enemy_water_bomb', aspect: 1, scale: 3.8, spin: 30 },
    gear:         { key: 'fx_enemy_saw', aspect: 1, scale: 4.1, spin: 260 },
    rail:         { key: 'fx_enemy_rail', aspect: 1, scale: 7.2 },
    blade:        { key: 'fx_enemy_void_blade', aspect: 1, scale: 6.3 },
    chaos:        { key: 'fx_enemy_void_blade', aspect: 1, scale: 5.6, spin: 100 },
    sonic:        { key: 'fx_enemy_bell_wave', aspect: 1, scale: 3.9 },
    arc:          { key: 'fx_enemy_arc', aspect: 1, scale: 4.0 },
    homing:       { key: 'fx_enemy_missile', aspect: 0.8, scale: 4.0 },
    beam:         { key: 'fx_enemy_plasma', aspect: 0.8, scale: 5.6 },
};

/** 全单位释放主体；同机制共享形状，身份由元素、体量、动画与实际轨迹区分。 */
export const UNIT_ATTACK_ART: Record<string, string> = {
    grunt: 'fx_enemy_claw_slash', shield: 'fx_damage_shield', exploder: 'fx_explosion',
    golem: 'fx_damage_golem', elite_grunt: 'fx_enemy_claw_slash', archer: 'fx_enemy_toxic',
    miniboss: 'fx_enemy_void_blade', rust_biter: 'fx_enemy_claw_slash',
    needle_gunner: 'fx_enemy_needle', ember_acolyte: 'fx_enemy_ember_brand',
    frost_acolyte: 'fx_enemy_frost', acid_sac: 'fx_enemy_toxic', rivet_beast: 'fx_damage_rivet_beast',
    arc_leech: 'fx_enemy_arc', gold_scavenger: 'fx_hex_ring', blast_tick: 'fx_explosion',
    squid: 'fx_enemy_water_bomb', turtle: 'fx_damage_turtle', shrimp: 'fx_enemy_claw_slash',
    jelly: 'fx_enemy_toxic', drone_a: 'fx_enemy_arc', drone_s: 'fx_heal',
    chain_hound: 'fx_enemy_claw_slash', prism_snail: 'fx_enemy_frost',
    triune_priest: 'fx_enemy_arc', rail_butcher: 'fx_enemy_saw', bell_devourer: 'fx_enemy_bell_wave',
    boss_ch1: 'fx_enemy_claw_slash', boss_ch2: 'fx_enemy_ember_brand',
    boss_ch3: 'fx_enemy_arc', boss_ch4: 'fx_enemy_void_blade', boss_mech: 'fx_enemy_void_blade',
    boss_abyss: 'fx_enemy_water_bomb', boss_vespa: 'fx_enemy_claw_slash',
    boss_crucible_city: 'fx_enemy_ember_brand', boss_manyfold: 'fx_enemy_void_blade',
    boss_invader: 'fx_enemy_ember_brand',
};


/** 常规敌弹按碰撞体定档，保留最小可读尺寸，同时限制贴图占屏面积。 */
export function enemyProjectileSize(radius: number, art: { key: string; scale: number }): number {
    const limit = art.key === 'fx_enemy_toxic' ? 30 : art.key === 'fx_enemy_void_blade' ? 52 : 44;
    return Math.max(radius * 2, Math.min(limit, Math.max(22, radius * art.scale)));
}

/** 受击上下文跟随弹体进入伤害结算，避免离场敌人或对象池复用丢失身份。 */
export interface EnemyHitContext { source?: string; kind?: string; angle?: number }

/** 每行四张独立绘制的接触、爆发、碎裂、消散帧。无攻击单位不分配假受击动画。 */
export const ENEMY_HIT_ROWS: string[][] = [
    [
        "grunt",
        "shield",
        "exploder",
        "golem"
    ],
    [
        "elite_grunt",
        "archer",
        "miniboss",
        "rust_biter"
    ],
    [
        "needle_gunner",
        "ember_acolyte",
        "frost_acolyte",
        "acid_sac"
    ],
    [
        "rivet_beast",
        "arc_leech",
        "blast_tick",
        "squid"
    ],
    [
        "turtle",
        "shrimp",
        "jelly",
        "drone_a"
    ],
    [
        "chain_hound",
        "prism_snail",
        "triune_priest",
        "rail_butcher"
    ],
    [
        "bell_devourer",
        "boss_ch1",
        "boss_ch2",
        "boss_ch3"
    ],
    [
        "boss_ch4",
        "boss_mech",
        "boss_abyss",
        "boss_vespa"
    ],
    [
        "boss_crucible_city",
        "boss_manyfold",
        "boss_invader",
        "physical"
    ]
];

export const ENEMY_HIT_ART: Record<string, { key: string; size: number }> = {};
for (const row of ENEMY_HIT_ROWS) {
    for (const source of row) ENEMY_HIT_ART[source] = {
        key: 'fx_damage_' + source,
        size: source.startsWith('boss_') ? 72 : ['golem', 'turtle', 'rail_butcher', 'bell_devourer'].indexOf(source) >= 0 ? 64 : 56,
    };
}

const PROJECTILE_HIT_SOURCE: Record<string, string> = {
    needle: 'needle_gunner', shrimp_spike: 'shrimp', frost: 'frost_acolyte', water_spike: 'boss_abyss',
    poison: 'acid_sac', toxin_dart: 'archer', venom_sting: 'jelly', water_bomb: 'squid', gear: 'boss_ch2',
    rail: 'rail_butcher', blade: 'boss_mech', chaos: 'boss_manyfold', sonic: 'bell_devourer',
    arc: 'arc_leech', homing: 'boss_ch3', beam: 'drone_a',
};

/** 同一单位的特殊元素攻击优先匹配材质；普通攻击仍使用该单位的独立图行。 */
export function enemyHitArt(hit: EnemyHitContext = {}): { key: string; size: number } {
    let source = hit.source;
    if (source === 'boss_ch1' && hit.kind === 'poison') source = 'acid_sac';
    else if (source === 'drone_a' && hit.kind === 'sonic') source = 'bell_devourer';
    else if (source === 'triune_priest' && hit.kind === 'frost') source = 'prism_snail';
    else if (source === 'triune_priest' && hit.kind === 'fire') source = 'ember_acolyte';
    else if (source === 'boss_mech' && hit.kind === 'explosion') source = 'boss_invader';
    else if (source === 'boss_invader' && hit.kind === 'beam') source = 'boss_ch3';
    else if (source === 'boss_vespa' && ['vespa_poison_pool', 'vespa_rain', 'vespa_shell'].indexOf(hit.kind ?? '') >= 0) source = 'acid_sac';
    else if (source === 'boss_crucible_city' && ['crucible_pistons', 'crucible_scrap', 'crucible_billets'].indexOf(hit.kind ?? '') >= 0) source = 'rivet_beast';
    return ENEMY_HIT_ART[source ?? ''] ?? ENEMY_HIT_ART[PROJECTILE_HIT_SOURCE[hit.kind ?? '']] ?? ENEMY_HIT_ART.physical;
}
