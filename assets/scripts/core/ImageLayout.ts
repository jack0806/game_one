// 展示图一律等比缩放；cover 的溢出部分由固定视口裁切。
export type ImageFitMode = 'contain' | 'cover';

export function imageLayout(sourceW: number, sourceH: number, width: number, height: number,
                            mode: ImageFitMode = 'contain', topAligned = false) {
    const w = Math.max(1, sourceW), h = Math.max(1, sourceH);
    const scale = mode === 'cover' ? Math.max(width / w, height / h) : Math.min(1, width / w, height / h);
    return { width: w * scale, height: h * scale, x: 0, y: topAligned ? (height - h * scale) / 2 : 0 };
}
