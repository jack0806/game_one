# 敌方图鉴与形象卡片复查

覆盖当前 `UNIT_CATALOG` 的 11 种首领、11 种小首领、16 种小兵。逐个核对现有分层稿、战斗静态图与图鉴资源映射。

## 发现与修正

原静态图由 `bake_enemy_rigs.py` 把 256×256 战斗帧放大到 512×512，仍然保留了低分辨率边缘和为动作预留的大幅透明空白。图鉴放大后，鱿鱼、铆链猎犬、磁潮铸城兽与最终机械首领等单位尤其容易模糊。

新增 38 张 `assets/resources/art/ui_unit_display_<id>.png`，由 `tools/bake_unit_displays.py` 复用已定稿的原始部件和待机关节姿态，直接以三倍绘图密度渲染。绘制完成后仅收紧画布，四边保留 24 像素安全边距，按原始长宽比例导出；不从低分辨率战斗帧放大，也不重新设计角色。源稿、战斗资源 key、输出尺寸与透明轮廓记录在 [manifest.json](manifest.json)。

图鉴列表与详情共用 `PortraitArt` 的等比 contain 视口。圆角遮罩限制边界，狭长枪管、兽尾、长触腕与蛛足均保留完整；英雄卡片继续使用上一批的独立半身展示图。战斗测试房的英雄选择浮层也同步使用高清展示图与裁切视口。

## 验证

渲染器新增的 `pixel_scale` 参数默认值仍为 1。通过 38 单位 × 3 方向 × 待机/走路/攻击共 342 个样本，与修改前渲染器进行逐像素比较，结果完全一致；此次新建的展示资源不覆盖战斗图集。

资源回归检查保证 38 个目录条目与 38 张展示图一一对应，PNG 尺寸与 Cocos meta 一致，完整轮廓位于安全边距内。运行 `python tools/bake_unit_displays.py` 可重建全部展示图并保留已有 UUID。

## 实机逐项复核

在 Cocos Creator 3.8.8 Web Desktop 构建中遍历全部七页列表，逐个点选 38 个条目并截取详情卡。下列复核图仅排列真实游戏截图，已检查全部条目的身份、完整轮廓、比例、清晰度与名称对应关系。

- [详情复核 1：首领前八项](qa/unit-review-1.jpg)
- [详情复核 2：其余首领与前五种小首领](qa/unit-review-2.jpg)
- [详情复核 3：其余小首领、基础小兵与护盾兵](qa/unit-review-3.jpg)
- [详情复核 4：爆炸怪至焚芯咒仆](qa/unit-review-4.jpg)
- [详情复核 5：冻脉咒仆至熔爆蜱](qa/unit-review-5.jpg)

完整列表：[首领第一页](qa/unit-overview-boss-1.png)、[首领第二页](qa/unit-overview-boss-2.png)、[小首领第一页](qa/unit-overview-miniboss-1.png)、[小首领第二页](qa/unit-overview-miniboss-2.png)、[小兵第一页](qa/unit-overview-grunt-1.png)、[小兵第二页](qa/unit-overview-grunt-2.png)、[小兵第三页](qa/unit-overview-grunt-3.png)。

[测试房英雄形象卡片](qa/unit-room-hero-picker.png)也已替换并实机复核。

验证结果：类型检查通过，688 项测试通过，Cocos Web Desktop 构建成功，游戏页面控制台无错误。第一次全套测试的既有随机概率采样用例出现 14.1% 超过 14% 阈值的波动，未修改该用例或玩法代码，复跑全套通过。提交前已恢复本地测试桩并按锁文件安装依赖，项目命令 `npm test`（688/688）与 `npm run typecheck` 均通过。
