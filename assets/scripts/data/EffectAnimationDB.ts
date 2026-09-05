// ============================================================
//  EffectAnimationDB.ts — 独立绘制的特效序列与发射点标定
// ============================================================
import type { ActorClip } from './ActorAnimationDB';

function effectRow(sheet: string, row: number, pivot: [number, number], seconds: number[], pivots?: [number, number][]): ActorClip {
    return {
        sheet, columns: 4, rows: 4, cellSize: 256, loop: false,
        frames: seconds.map((duration, column) => ({
            index: row * 4 + column, pivot: pivots?.[column] ?? pivot, seconds: duration,
        })),
    };
}

/** 语义key可沿用旧特效调用；实际只加载clip.sheet，不加载不存在的独立PNG。 */
export const EFFECT_ANIMATIONS: Record<string, ActorClip> = {
    // 薇薇安炮台使用整套机械炮管逐帧图；只播放首行的充能→后坐→复位。
    fx_turret_barrel_fire: {
        sheet: 'anim_turret_barrel_fire', columns: 4, rows: 4, cellSize: 448, loop: false,
        frames: [0, 1, 2, 3].map((index) => ({
            index, pivot: [0.36, 0.5], seconds: index === 0 ? 0.06 : 0.055,
        })),
    },
    fx_weapon_cyan: effectRow('anim_fx_weapons', 0, [0.37, 0.49], [0.025, 0.045, 0.04, 0.05],
        [[0.392,0.487],[0.361,0.486],[0.37,0.491],[0.37,0.49]]),
    fx_weapon_charged: effectRow('anim_fx_weapons', 1, [0.34, 0.46], [0.03, 0.07, 0.07, 0.07],
        [[0.378,0.458],[0.356,0.453],[0.336,0.458],[0.34,0.46]]),
    fx_explosion: effectRow('anim_fx_weapons', 2, [0.5, 0.5], [0.04, 0.1, 0.12, 0.14]),
    fx_weapon_ice: effectRow('anim_fx_weapons', 3, [0.336, 0.445], [0.025, 0.055, 0.05, 0.05],
        [[0.395,0.447],[0.315,0.444],[0.336,0.445],[0.336,0.445]]),
    fx_cold_arrow: effectRow('anim_fx_elements', 0, [0.5, 0.5], [0.04, 0.1, 0.12, 0.14]),
    fx_enemy_claw_slash: effectRow('anim_fx_elements', 1, [0.5, 0.5], [0.035, 0.065, 0.08, 0.08]),
    fx_heal: effectRow('anim_fx_elements', 2, [0.5, 0.5], [0.06, 0.12, 0.14, 0.18]),
    fx_frost_aura: effectRow('anim_fx_elements', 3, [0.5, 0.5], [0.06, 0.14, 0.18, 0.22]),
    fx_weapon_chaos: effectRow('anim_fx_chrono_chaos', 0, [0.32, 0.575], [0.03, 0.045, 0.05, 0.06],
        [[0.533,0.57],[0.32,0.575],[0.32,0.575],[0.32,0.575]]),
    fx_weapon_time: effectRow('anim_fx_chrono_chaos', 1, [0.348, 0.531], [0.025, 0.045, 0.04, 0.05],
        [[0.508,0.535],[0.348,0.531],[0.348,0.531],[0.348,0.531]]),
    fx_time_blade: effectRow('anim_fx_chrono_chaos', 2, [0.53, 0.45], [0.035, 0.065, 0.08, 0.08]),
    fx_chaos_pulse: effectRow('anim_fx_chrono_chaos', 3, [0.5, 0.38], [0.06, 0.14, 0.16, 0.16],
        [[0.539,0.383],[0.5,0.379],[0.5,0.36],[0.49,0.395]]),
    fx_weapon_toxic: effectRow('anim_fx_toxic_shield', 0, [0.25, 0.585], [0.025, 0.045, 0.05, 0.06],
        [[0.39,0.58],[0.25,0.585],[0.25,0.585],[0.25,0.585]]),
    fx_toxic_impact: effectRow('anim_fx_toxic_shield', 1, [0.4, 0.525], [0.025, 0.065, 0.075, 0.09],
        [[0.46,0.52],[0.4,0.525],[0.4,0.525],[0.4,0.525]]),
    fx_poison: effectRow('anim_fx_toxic_shield', 2, [0.52, 0.48], [0.05, 0.11, 0.13, 0.16]),
    fx_shield_break: effectRow('anim_fx_toxic_shield', 3, [0.5, 0.36], [0.035, 0.075, 0.11, 0.16]),
    fx_hex_ring: effectRow('anim_fx_runic_reik', 0, [0.5, 0.5], [0.06, 0.11, 0.14, 0.19]),
    fx_reik_cleave: effectRow('anim_fx_runic_reik', 1, [0.38, 0.5], [0.04, 0.07, 0.08, 0.11]),
    fx_reik_warcry: effectRow('anim_fx_runic_reik', 2, [0.5, 0.5], [0.07, 0.14, 0.17, 0.24]),
    fx_reik_death_will: effectRow('anim_fx_runic_reik', 3, [0.5, 0.5], [0.8, 0.8, 0.8, 0.8]),
    fx_enemy_bell_wave: effectRow('anim_fx_enemy_impacts', 0, [0.5, 0.5], [0.06, 0.12, 0.16, 0.21]),
    fx_enemy_ember_brand: effectRow('anim_fx_enemy_impacts', 1, [0.5, 0.5], [0.07, 0.13, 0.18, 0.22]),
    fx_hit: effectRow('anim_fx_enemy_impacts', 2, [0.5, 0.5], [0.025, 0.05, 0.07, 0.1]),
    fx_ignite: effectRow('anim_fx_enemy_impacts', 3, [0.5, 0.56], [0.05, 0.1, 0.14, 0.19]),
};
