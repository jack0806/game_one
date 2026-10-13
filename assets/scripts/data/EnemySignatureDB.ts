// 首领与小首领的施法色彩和碎屑方向。动作帧、弹体与地面资源负责技能主体。
// shape 只控制碎屑向前或向四周散开，不再绘制贴在角色身上的几何线框。
export type SignatureShape = 'fang' | 'ripple' | 'spoke' | 'fork' | 'plate' |
    'coil' | 'cross' | 'web' | 'shard' | 'orbit' | 'rail' | 'pulse';

export interface SignatureSpec {
    shape: SignatureShape;
    color: string;
    accent: string;
    count: number;
    radius: number;
}

type Skill = 'attack' | 'skill1' | 'skill2' | 'skill3' | 'skill4' | 'skill5' | 'phase' | 'charge' | 'summon';
type UnitSignatures = Partial<Record<Skill, SignatureSpec>>;
const spec = (shape: SignatureShape, color: string, accent: string, count: number, radius: number): SignatureSpec =>
    ({ shape, color, accent, count, radius });

export const ENEMY_SIGNATURES: Record<string, UnitSignatures> = {
    squid: { attack: spec('fang', '#45c9df', '#b8f5ed', 3, 25), skill1: spec('coil', '#36b9db', '#dafaff', 3, 34), skill2: spec('fork', '#82e6ee', '#e9ffff', 3, 40), skill3: spec('web', '#288caf', '#a6eaff', 6, 34) },
    turtle: { attack: spec('plate', '#6cb876', '#d8e3a2', 5, 28), skill1: spec('orbit', '#65c879', '#d6ec91', 5, 38), skill2: spec('rail', '#8bc379', '#e8f3b0', 2, 40) },
    shrimp: { attack: spec('fang', '#f28252', '#ffe1a3', 2, 36), skill1: spec('shard', '#ffae66', '#fff2c3', 5, 32), skill2: spec('fork', '#ff6f4d', '#ffd584', 2, 42) },
    jelly: { attack: spec('ripple', '#c684e8', '#f2cafa', 3, 28), skill1: spec('pulse', '#a367ca', '#efd8ff', 4, 38), skill2: spec('fang', '#c771dd', '#e1f59d', 5, 30) },
    drone_a: { attack: spec('cross', '#fc736e', '#ffe3a5', 4, 24), skill1: spec('ripple', '#ff8e70', '#fff4bc', 3, 35), skill2: spec('rail', '#ff4c5b', '#fff0cf', 3, 37) },
    drone_s: { attack: spec('plate', '#65de9d', '#dbffec', 4, 23), skill1: spec('orbit', '#4de2a6', '#e3fff4', 3, 40), skill2: spec('plate', '#67bdf3', '#e1f6ff', 6, 43), skill3: spec('spoke', '#75f7d1', '#ffffff', 3, 48) },
    chain_hound: { attack: spec('fang', '#ee5f4f', '#f8c78a', 4, 31), skill1: spec('rail', '#d84b40', '#ffc481', 2, 44), skill2: spec('cross', '#de8054', '#ffd99b', 4, 40) },
    prism_snail: { attack: spec('shard', '#98dfec', '#fff3b9', 4, 30), skill1: spec('fork', '#9fe9fc', '#faffd3', 5, 45), skill2: spec('plate', '#c1efff', '#ffe9ad', 6, 43) },
    triune_priest: { attack: spec('spoke', '#c8f0fa', '#f7ffff', 3, 31), skill1: spec('shard', '#ff8a44', '#ffe5a2', 3, 40), skill2: spec('plate', '#85dff5', '#efffff', 3, 41), skill3: spec('fork', '#a6dfff', '#fff7ce', 3, 46) },
    rail_butcher: { attack: spec('fang', '#f56a9e', '#ffdda1', 3, 34), skill1: spec('rail', '#ff4fb9', '#ffe1ec', 2, 54), skill2: spec('orbit', '#ec914b', '#ffe8ad', 5, 46), skill3: spec('cross', '#70bbf0', '#f3e4ff', 4, 49) },
    bell_devourer: { attack: spec('ripple', '#d2b67a', '#fff4c6', 3, 35), skill1: spec('ripple', '#f5df9e', '#fdf4db', 6, 50), skill2: spec('coil', '#bb82d9', '#f2dcff', 4, 48), skill3: spec('pulse', '#e1d4a8', '#fff9db', 4, 55), skill4: spec('spoke', '#f7d99c', '#fffafa', 8, 53) },
    boss_ch1: { attack: spec('fang', '#db554a', '#dbe481', 4, 39), skill1: spec('pulse', '#a1bf53', '#e7e987', 6, 54), charge: spec('rail', '#c74b39', '#f6d789', 2, 52), summon: spec('coil', '#87ad52', '#dcde88', 3, 49), phase: spec('spoke', '#d14d35', '#e9d174', 5, 58) },
    boss_ch2: { attack: spec('plate', '#e4a057', '#fff0ad', 5, 43), skill1: spec('orbit', '#efa55d', '#ffe0a5', 8, 56), charge: spec('rail', '#da784a', '#ffdf93', 3, 56), summon: spec('spoke', '#e5a066', '#ffeed0', 4, 53), phase: spec('pulse', '#f09253', '#fff1b8', 6, 61) },
    boss_ch3: { attack: spec('fork', '#45cdb5', '#ddfff5', 4, 43), skill1: spec('orbit', '#39dcb6', '#f7ffdd', 3, 58), charge: spec('cross', '#45ddc6', '#fff6ab', 6, 55), summon: spec('web', '#65d9b5', '#ecffcb', 6, 52), phase: spec('spoke', '#5af1d1', '#ffffff', 6, 60) },
    boss_ch4: { attack: spec('shard', '#ad63d7', '#e7c7ff', 5, 44), skill1: spec('fork', '#bd65e8', '#ffb4e7', 7, 58), charge: spec('coil', '#9e56cb', '#ead2ff', 4, 55), summon: spec('web', '#a264ce', '#f8c8f4', 5, 53), phase: spec('pulse', '#d783ea', '#fbdcff', 7, 62) },
    boss_mech: { attack: spec('fang', '#9fcaf1', '#f8ffff', 2, 48), skill1: spec('fang', '#c4e8ff', '#ffffff', 4, 57), skill2: spec('spoke', '#a4d5ff', '#f9ffff', 12, 62), skill3: spec('plate', '#94c1ef', '#faffff', 6, 52), skill4: spec('cross', '#a6d7f6', '#ffffff', 4, 65), phase: spec('spoke', '#86c6ff', '#f3ffff', 6, 60) },
    boss_abyss: { attack: spec('coil', '#4db2c8', '#d4faff', 3, 45), skill1: spec('fork', '#57c6dd', '#e1ffff', 6, 56), skill2: spec('spoke', '#5fc6d1', '#eaffff', 8, 61), skill3: spec('plate', '#b7e7f4', '#ffffff', 4, 53), skill4: spec('rail', '#58bdd4', '#edffff', 3, 53), skill5: spec('coil', '#64cfe3', '#f7ffff', 5, 57), phase: spec('ripple', '#6adce9', '#f6ffff', 5, 60) },
    boss_vespa: { attack: spec('fang', '#87df5b', '#dfff8e', 2, 45), skill1: spec('web', '#8de268', '#e4ffa2', 6, 61), skill2: spec('rail', '#95ef69', '#eeffba', 3, 54), skill3: spec('shard', '#ace965', '#e1ff9b', 8, 58), skill4: spec('coil', '#b8ee67', '#f7ffca', 5, 56), skill5: spec('plate', '#b2eb75', '#f8ffcd', 6, 59), phase: spec('fang', '#9ff06a', '#ffffff', 6, 63) },
    boss_crucible_city: { attack: spec('rail', '#eb9756', '#fff0c3', 3, 51), skill1: spec('cross', '#e08852', '#7dc6f0', 4, 62), skill2: spec('plate', '#f49b52', '#ffe6bb', 3, 63), skill3: spec('orbit', '#b87954', '#f5cf90', 4, 58), skill4: spec('rail', '#f5af71', '#fff0b6', 6, 61), skill5: spec('pulse', '#ff9b48', '#fff1af', 8, 67), phase: spec('spoke', '#f3a35e', '#fff2cc', 6, 65) },
    boss_manyfold: { attack: spec('shard', '#be8ee1', '#ffe2ff', 3, 47), skill1: spec('rail', '#c19ae9', '#f9ddff', 3, 62), skill2: spec('cross', '#d1a4ec', '#ffffff', 4, 58), skill3: spec('coil', '#b084d3', '#f8d8ff', 4, 58), skill4: spec('shard', '#d3a5ec', '#ffffff', 6, 64), skill5: spec('web', '#c590e5', '#ffe3ff', 6, 66), phase: spec('cross', '#d7a7ef', '#ffffff', 6, 63) },
    boss_invader: { attack: spec('plate', '#e99758', '#fff1be', 4, 46), skill1: spec('cross', '#ff8856', '#ffeac3', 6, 61), skill2: spec('spoke', '#f7a04f', '#ffe9ad', 6, 60), skill3: spec('rail', '#ffb155', '#fff0b1', 2, 53), skill4: spec('pulse', '#ffaa55', '#fff8ce', 8, 70), phase: spec('plate', '#ff995c', '#fff3c9', 6, 62) },
    boss_joker: { attack: spec('fang', '#f5cb59', '#fff1c0', 1, 29), skill1: spec('orbit', '#f2b84d', '#f8e48d', 3, 38), skill2: spec('coil', '#efaa68', '#df83d9', 4, 36), skill3: spec('fang', '#f8dc74', '#ffffff', 1, 45), phase: spec('spoke', '#f2c85c', '#ffffff', 5, 47) },
};
