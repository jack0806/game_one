// 英雄展示图与单位图鉴共用的等比图像视口，遮罩负责限制卡框边界。
import { Color, Graphics, Mask, Node, Sprite, SpriteFrame, UITransform } from 'cc';
import { imageLayout, ImageFitMode } from './ImageLayout';
import { loadArtSprite } from './SpriteUtils';

export function createPortraitViewport(parent: Node, name: string, width: number, height: number,
                                       x = 0, y = 0, radius = 8): Sprite {
    const viewport = new Node(name); viewport.setParent(parent); viewport.setPosition(x, y);
    viewport.addComponent(UITransform).setContentSize(width, height);
    const mask = viewport.addComponent(Mask); mask.type = Mask.Type.GRAPHICS_STENCIL;
    const g = viewport.getComponent(Graphics) ?? viewport.addComponent(Graphics);
    g.fillColor = Color.WHITE;
    g.roundRect(-width / 2, -height / 2, width, height, radius); g.fill();
    const image = new Node('Image'); image.setParent(viewport);
    image.addComponent(UITransform).setContentSize(width, height);
    const sprite = image.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.trim = true;
    return sprite;
}

export function fitPortraitFrame(sprite: Sprite, frame: SpriteFrame, width: number, height: number,
                                 mode: ImageFitMode = 'contain', topAligned = false): void {
    // 使用导入器记录的可见裁切区域；透明留白不占展示面积，轮廓宽高比仍保持不变。
    const layout = imageLayout(frame.rect.width, frame.rect.height, width, height, mode, topAligned);
    sprite.spriteFrame = frame;
    sprite.node.getComponent(UITransform)!.setContentSize(layout.width, layout.height);
    sprite.node.setPosition(layout.x, layout.y);
}

export function loadPortraitArt(parent: Node, key: string, width: number, height: number,
                                x = 0, y = 0, mode: ImageFitMode = 'contain', topAligned = false): Sprite {
    const sprite = createPortraitViewport(parent, `Portrait_${key}`, width, height, x, y);
    loadArtSprite(key, frame => {
        if (frame && sprite.isValid) fitPortraitFrame(sprite, frame, width, height, mode, topAligned);
    });
    return sprite;
}
