// ============================================================
//  ArtRemap.ts — 美术资源重映射表
// ============================================================
//
// 人工逐张核实 assets/resources/art/*.png 后发现，部分背景素材生成时
// 文件名与实际像素内容错位。为避免直接改磁盘文件名扰动 Cocos 已生成的
// uuid/meta/library 缓存（有外部改名/uuid丢失风险），这里用一层
// 资源key重定向代替：所有读取 art/ 目录素材的代码都必须先经过
// resolveArtKey() / artPath()，再去 resources.load()。
//
// 角色和角色头像素材现已按语义文件名重新生成，不再需要旧的角色映射。
// hexblast-py 参考版本全程未做任何改动，此映射只影响本项目 TS 代码。

export const ART_REMAP: Record<string, string> = {
    // 2026-08-18：四张章节背景已按语义重新生成（bg_chapter1.png 内容=第1章
    // 废土街道……bg_chapter4.png 内容=第4章混沌位面，经视觉逐一核实），
    // 原有的 bg_chapter1↔bg_chapter4 互换映射反而会把第1章显示成混沌位面、
    // 第4章显示成废土街道，故删除。表保留为空：将来再有文件名/内容错位
    // 的素材时在此登记即可，artPath() 机制不变。
};

/**
 * 把一个"语义资源key"（如 'enemy_golem'）解析成磁盘上真正装着对应内容
 * 的文件名（不含 'art/' 前缀、不含扩展名）。未在 ART_REMAP 里登记的 key
 * 原样返回（文件名与内容本就一致）。
 */
export function resolveArtKey(key: string): string {
    return ART_REMAP[key] ?? key;
}

/**
 * 便捷方法：直接构造 resources.load(path, SpriteFrame, cb) 用的路径。
 *
 * 根因说明：Cocos 导入一张图片时，会在 bundle config 里注册三条 path 记录——
 * 'art/xxx'（cc.ImageAsset）、'art/xxx/texture'（cc.Texture2D）、
 * 'art/xxx/spriteFrame'（cc.SpriteFrame）——三者路径不同、类型也不同。
 * resources.load(path, type, cb) 先按 path 精确匹配，再按 type 过滤；
 * 若只传 'art/xxx' 去加载 SpriteFrame，path 命中的是 ImageAsset 记录，
 * type 对不上，引擎直接抛 "Bundle resources doesn't contain art/xxx"
 * （与 asset-db 是否已收录该资源、bundle 快照是否过期都无关）。
 * 所以这里必须显式拼接 '/spriteFrame' 后缀。
 */
export function artPath(key: string): string {
    return `art/${resolveArtKey(key)}/spriteFrame`;
}
