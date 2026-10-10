// ============================================================
//  EffectAnimationDB.ts — 独立绘制的特效序列与发射点标定
// ============================================================
import type { ActorClip } from './ActorAnimationDB';
import { ENEMY_HIT_ROWS, ENEMY_HIT_ART } from './CombatArtDB';

function effectRow(sheet: string, row: number, pivot: [number, number], seconds: number[], pivots?: [number, number][]): ActorClip {
    return {
        sheet, columns: 4, rows: 4, cellSize: 313.5, loop: false,
        frames: seconds.map((duration, column) => ({
            index: row * 4 + column, pivot: pivots?.[column] ?? pivot, seconds: duration,
        })),
    };
}

/** 语义key可沿用旧特效调用；实际只加载clip.sheet，不加载不存在的独立PNG。 */
export const EFFECT_ANIMATIONS: Record<string, ActorClip> = {
    fx_ground_acid: { ...effectRow('anim_fx_ground_residue', 0, [0.5, 0.5], [.16, .16, .16, .16]), cellSize: 315.25, cellHeight: 311.75, loop: true },
    fx_ground_ember: { ...effectRow('anim_fx_ground_residue', 1, [0.5, 0.5], [.16, .16, .16, .16]), cellSize: 315.25, cellHeight: 311.75, loop: true },
    fx_ground_water: { ...effectRow('anim_fx_ground_residue', 2, [0.5, 0.5], [.16, .16, .16, .16]), cellSize: 315.25, cellHeight: 311.75, loop: true },
    fx_ground_dust: { ...effectRow('anim_fx_ground_residue', 3, [0.5, 0.5], [.16, .16, .16, .16]), cellSize: 315.25, cellHeight: 311.75, loop: true },
    fx_enemy_water_lance: { ...effectRow('anim_fx_enemy_payloads', 0, [0.5, 0.5], [.06, .06, .06, .06]), cellSize: 350.5, cellHeight: 280.5, loop: true },
    fx_enemy_missile: { ...effectRow('anim_fx_enemy_payloads', 1, [0.5, 0.5], [.06, .06, .06, .06]), cellSize: 350.5, cellHeight: 280.5, loop: true },
    fx_enemy_plasma: { ...effectRow('anim_fx_enemy_payloads', 2, [0.5, 0.5], [.06, .06, .06, .06]), cellSize: 350.5, cellHeight: 280.5, loop: true },
    fx_enemy_stinger: { ...effectRow('anim_fx_enemy_payloads', 3, [0.5, 0.5], [.06, .06, .06, .06]), cellSize: 350.5, cellHeight: 280.5, loop: true },
    // 薇薇安炮台使用整套机械炮管逐帧图；只播放首行的充能→后坐→复位。
    fx_turret_barrel_fire: {
        sheet: 'anim_turret_barrel_fire', columns: 4, rows: 4, cellSize: 448, loop: false,
        frames: [0, 1, 2, 3].map((index) => ({
            index, pivot: [0.36, 0.5], seconds: index === 0 ? 0.06 : 0.055,
        })),
    },
    fx_weapon_cyan: effectRow('anim_fx_weapons', 0, [0.5, 0.5], [0.025, 0.045, 0.04, 0.05]),
    fx_weapon_charged: effectRow('anim_fx_weapons', 1, [0.5, 0.5], [0.03, 0.07, 0.07, 0.07]),
    fx_explosion: effectRow('anim_fx_weapons', 2, [0.5, 0.5], [0.04, 0.1, 0.12, 0.14]),
    fx_weapon_ice: effectRow('anim_fx_weapons', 3, [0.5, 0.5], [0.025, 0.055, 0.05, 0.05]),
    fx_cold_arrow: effectRow('anim_fx_elements', 0, [0.5, 0.5], [0.04, 0.1, 0.12, 0.14]),
    fx_enemy_claw_slash: effectRow('anim_fx_elements', 1, [0.5, 0.5], [0.035, 0.065, 0.08, 0.08]),
    fx_heal: effectRow('anim_fx_elements', 2, [0.5, 0.5], [0.06, 0.12, 0.14, 0.18]),
    fx_frost_aura: effectRow('anim_fx_elements', 3, [0.5, 0.5], [0.06, 0.14, 0.18, 0.22]),
    fx_weapon_chaos: effectRow('anim_fx_chrono_chaos', 0, [0.5, 0.5], [0.03, 0.045, 0.05, 0.06]),
    fx_weapon_time: effectRow('anim_fx_chrono_chaos', 1, [0.5, 0.5], [0.025, 0.045, 0.04, 0.05]),
    fx_time_blade: effectRow('anim_fx_chrono_chaos', 2, [0.5, 0.5], [0.035, 0.065, 0.08, 0.08]),
    fx_chaos_pulse: effectRow('anim_fx_chrono_chaos', 3, [0.5, 0.5], [0.06, 0.14, 0.16, 0.16]),
    fx_weapon_toxic: effectRow('anim_fx_toxic_shield', 0, [0.5, 0.5], [0.025, 0.045, 0.05, 0.06]),
    fx_toxic_impact: effectRow('anim_fx_toxic_shield', 1, [0.5, 0.5], [0.025, 0.065, 0.075, 0.09]),
    fx_poison: effectRow('anim_fx_toxic_shield', 2, [0.5, 0.5], [0.05, 0.11, 0.13, 0.16]),
    fx_shield_break: effectRow('anim_fx_toxic_shield', 3, [0.5, 0.5], [0.035, 0.075, 0.11, 0.16]),
    fx_hex_ring: effectRow('anim_fx_runic_reik', 0, [0.5, 0.5], [0.06, 0.11, 0.14, 0.19]),
    fx_reik_cleave: effectRow('anim_fx_runic_reik', 1, [0.5, 0.5], [0.04, 0.07, 0.08, 0.11]),
    fx_reik_warcry: effectRow('anim_fx_runic_reik', 2, [0.5, 0.5], [0.07, 0.14, 0.17, 0.24]),
    fx_reik_death_will: effectRow('anim_fx_runic_reik', 3, [0.5, 0.5], [0.8, 0.8, 0.8, 0.8]),
    fx_enemy_bell_wave: effectRow('anim_fx_enemy_impacts', 0, [0.5, 0.5], [0.06, 0.12, 0.16, 0.21]),
    fx_enemy_ember_brand: effectRow('anim_fx_enemy_impacts', 1, [0.5, 0.5], [0.07, 0.13, 0.18, 0.22]),
    fx_hit: effectRow('anim_fx_enemy_impacts', 2, [0.5, 0.5], [0.025, 0.05, 0.07, 0.1]),
    fx_ignite: effectRow('anim_fx_enemy_impacts', 3, [0.5, 0.5], [0.05, 0.1, 0.14, 0.19]),
};

for (let sheet = 0; sheet < ENEMY_HIT_ROWS.length; sheet++) {
    ENEMY_HIT_ROWS[sheet].forEach((source, row) => {
        EFFECT_ANIMATIONS[ENEMY_HIT_ART[source].key] = effectRow(
            'anim_hit_units_' + (sheet + 1), row, [0.5, 0.5], [0.035, 0.16, 0.10, 0.105],
        );
    });
}
