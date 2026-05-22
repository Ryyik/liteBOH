# Asset Source Archive

这里存放图片原始素材或高保真源文件，不参与前端运行时打包。

规则：
- `src/assets/images/` 只保留页面实际使用的 WebP/SVG 等轻量运行时资源。
- PNG/JPG/JPEG 原图放到 `docs/assets-source/images/` 归档。
- 新增图片时，先生成 WebP 放入 `src/assets/images/`，再把原图放到本目录。
- 如确实需要在前端直接使用非 WebP 图片，请在代码评审时说明原因。
