// ============================================================
//  ArenaCollisionMasks.ts — 独立残骸的可见像素碰撞轮廓
// ============================================================
// 每张图按 alpha >= 128 裁去透明外边，再采样成 32×16 格；排除低亮投影后每格至少
// 1/8 为实体像素才计入。行内 bit 0 对应贴图左侧。Sprite.trim=true
// 会将裁切后的可见区域铺满 visualW×visualH，故数据与渲染使用同一坐标。
export const ARENA_COLLISION_MASKS: Readonly<Record<string, readonly string[]>> = {
    arena_barrier_ch1: [
        '00000000','00000000','07c00000','07e00000','0ffc0000','0ffff000','0ffffe00','1ffffe00',
        '1ffffe00','1c7ffe00','000fff00','0001ff80','00003f80','00003e00','00001c00','00000000',
    ],
    arena_console_ch3: [
        '00000000','003e0000','007f0000','01ff8000','07fff000','07ffffc0','07ffffe0','0ffffff0',
        '0ffffff8','07fffff8','01fffff8','003ffff8','0007fff0','0000ffc0','00000f80','00000200',
    ],
    arena_conveyor_ch2: [
        '00000000','00000000','03100000','0ffc0000','3fff8000','7fffc038','7fffe1fe','7ffffffe',
        'fffffffe','ffffffff','ffffffff','33fffff7','007fff00','002fe000','00078000','00000000',
    ],
    arena_machine_ch2: [
        '00000000','00780000','01ff0000','0fffe800','3ffffc00','7fffff80','7fffffc0','7ffffff0',
        '7ffffff0','7ffffff8','0ffffff8','01fffff8','007ffff0','0003ffc0','00001e00','00000000',
    ],
    arena_mech_ch5: [
        '001f0000','007fc000','00ffe000','01ffec00','03fff780','0ffff3c0','1dfff3e0','3dffdfe0',
        '7efffff0','7cfffffc','ffbefffe','7fbff7ff','fffd86f7','370000b0','00000000','00000000',
    ],
    arena_pillar_ch4: [
        '00000000','0000003c','000001fe','00001ffe','00007ffe','0007fffe','007fffff','03ffffff',
        '07fffff8','07ffff00','0ffff000','0fff8000','03fe0000','00f80000','00000000','00000000',
    ],
    arena_portal_ch4: [
        '00000000','000000fc','000000fe','200001fc','7e0003fc','7f000ffe','7f803ffe','7fe0fffe',
        '7ffffffe','fffffffe','7ffffff8','7dfffff8','3fffffc0','03fffe00','01fe0000','00000000',
    ],
    arena_rail_ch5: [
        '00000000','00000000','07e00000','0ff00000','1fffe000','3ffff800','7fffffe0','fffffff0',
        'ffffdff8','67bff7f8','0301fffc','00003fff','00000fff','000002fe','00000010','00000000',
    ],
    arena_reactor_ch6: [
        '00000000','00078000','000ffc00','00fffe00','07ffff00','0fffffc0','1ffffff0','7ffffff0',
        '7ffffff8','fffffffc','fffffffe','3ffffff0','3ffff800','0fffc000','00100000','00000000',
    ],
    arena_support_ch6: [
        '000001c0','000003f0','000007f0','00003ff0','0000fffc','0007fffc','03fffffc','0fffffff',
        '3fffeffe','1ffffffc','7ffffff0','7fffb600','ffff0000','fffc0000','9ff00000','05800000',
    ],
    arena_vat_ch3: [
        '00002000','0007fe00','001fff00','001fff00','003fff00','03ffff00','0fffffc0','1ffffff0',
        '1ffffff0','1ffffff8','07fffff0','01ffffe0','007fff80','00003e00','00000800','00000000',
    ],
    arena_wall_ch1: [
        '00000020','000000f0','00000ff8','0000fff8','003ffff8','007ffff8','01fffff8','01ffffb8',
        '03fffff8','07fffec0','0ffff000','1fff0000','0ffe0000','07300000','00000000','00000000',
    ],
    arena_wreck_ch1: [
        '00000000','00200000','03fc0000','0fffe000','1ffff800','1ffff400','3fff9f00','1fffffc0',
        '0ffdffe0','0ffffff0','0f7ffff0','0c7effe0','000cff80','0000fe00','0000c000','00000000',
    ],
};
