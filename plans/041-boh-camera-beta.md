# 041 · BOH Camera Beta：图库内嵌实时滤镜取景与拍摄

- **状态**：WIP —— 提交 1 + 提交 2 已落地（2026-11-05 17:40）；提交 3（探针 / 降级态 / 真机）未做。用户口径：**只服务浏览器**，微信降级不再作为阻塞项。
- **日期**：2026-11-05
- **触发**：用户需求「推出 BOH Camera Beta，支持将现有滤镜库直接调用相机实时预览滤镜取景和拍摄，入口放在图库里，一个相机图标 Beta，先做简单的试试看」
- **影响文件（计划）**：
  - 新增：`src/views/Camera/index.vue`、`src/composables/useCameraStream.js`、`src/utils/camera-capture-bridge.js`、`tests/unit/camera-capture.test.js`、`scripts/probes/probe-camera-live.mjs`
  - 修改：`src/views/user-center/Cloud+/CloudPlusMain.vue`、`src/views/Forum/components/ImageEditorFilmFx.vue`、`src/router/routes/user-space.ts`
  - 搬迁（行为等价）：`src/views/Forum/composables/image-editor-filters.js` → `src/utils/image-editor-filters.js`
- **关联**：`plans/021`（输入框自动增高，同一套「真源+探针」纪律）、`plans/039`（图库格子/回收站）、`utils/image-editor-export.js`（胶片合成管线）

---

## 1. 需求口径

1. **形态**：网页版相机（HTML5 `getUserMedia`），不是原生 App、不是小程序。
2. **滤镜**：直接复用现有 11 档胶片预设（`IMAGE_EDITOR_FILTERS`），支持 0–100% 强度；**取景所见即拍摄所得**，与图片编辑器里的成片观感一致。
3. **入口**：图库页（`/user-space/note`）头部动作区的相机图标，带 `Beta` 角标。
4. **落点**：拍完的成片进入图库——v1 走「打开新建面板 + 图片已进上传队列」，用户补不补标题都能发布（`publishEntry` 已允许纯图片条目）。
5. **不可用环境**：不是死路。降级为系统相机拍一张静态帧，照样套同一份滤镜、走同一个落点。

## 2. 可复用资产（这是本方案成立的前提）

| 资产 | 位置 | 相机里的角色 | 改动 |
|---|---|---|---|
| 11 档预设 + 强度插值 | `views/Forum/composables/image-editor-filters.js:81` `resolveFilterLook()` | 取景、合成、导出共用同一份 look | **搬到 `utils/`**（纯模块，零依赖） |
| 胶片物理层 DOM 实现 | `views/Forum/components/ImageEditorFilmFx.vue` | 直接盖在 `<video>` 上（现在盖在 `<img>` 上） | 增加视频源支持（halation 层） |
| 画布合成器 | `utils/image-editor-export.js:457` `renderDocToCanvas()` | 快门 = 把一帧喂进去，只跑一次 | 零改动 |
| JPEG 导出 | `utils/image-editor-export.js:512` `exportCanvasToJpegFile()` | ≤1600 长边、q0.9，与发帖压缩档同值 | 零改动 |
| 颗粒噪声块 | `utils/image-editor-grain.js` | 预览用 `background-image` 平铺，导出用 `drawImage` | 零改动 |
| 上传/额度/压缩链路 | `CloudPlusMain.vue:2959` `handleImageSelection()` | 成片走同一条队列 | 抽出 `addFilesToDraft(files)` |

**结论：需要新写的只有「取流 + 取景页 + 一次抓帧」，约 350–450 行，加一支探针。**

## 3. 三个硬决定

### 3.1 取景用 DOM/CSS，快门用 canvas 一次性合成

- 取景：`<video>` 上直接挂 `filter: <look.css>`，物理层由 `ImageEditorFilmFx` 盖上去。全部走 GPU 合成，JS 每帧开销 ≈ 0。
- 快门：`drawImage(video)` → `renderDocToCanvas(frame, [], { look })` → `exportCanvasToJpegFile()`。只跑一次，代价可接受。
- **反例（明确不做）**：用 canvas 逐帧重绘做实时预览。`applyFilmLook()` 每帧要做「全画幅拷贝 + 模糊副本 + 颗粒平铺」，手机上会掉到 15fps 以下。

### 3.2 滤镜表搬到 `utils/`

`image-editor-filters.js` 是纯数据 + 纯函数（无 Vue 依赖），放在 `views/Forum/composables/` 只是历史位置。相机页在另一个 view 下，直接反向 import 别人的 composable 会把依赖方向搞乱，也违反「utils 不许反向依赖 views」的对偶。

搬迁是**行为等价**的：`tests/unit/image-editor-filters.test.js` 原样通过即为证；只需改 `ImageEditModal.vue` 与测试的 import 路径。

### 3.3 halation 层从 `<img>` 换成「第二路 `<video>`」

`ImageEditorFilmFx` 的高光泛光是「同一张图模糊后 screen 叠加」。相机场景没有静态图，必须改成第二个 `<video>` 绑**同一个** `MediaStream`，套相同的 `filter` + `blur`。否则要么预览少一层光晕、要么成片多一层——这正是「预览≠成片」的经典坑。

实现：给组件加可选 props `halationStream`（有则渲染 `<video>`，无则保持现在的 `<img>`），模糊半径/不透明度的换算逻辑**不外移**（唯一真源仍在组件内）。

## 4. 页面规格

### 4.1 入口（图库头部）

`CloudPlusMain.vue` 的 `.gallery-header-actions`（`:48`）内，「选择」按钮左侧插入：

```
[🔍 搜索] [筛选] [刷新] [📷 Beta] [选择] [＋ 新建]
```

- 图标：`lucide-vue-next` 的 `Camera`（仓库已在用 `Search` / `CheckSquare` / `ImagePlus`）。
- 角标：`Beta` 做 9px 上标 chip，不是独立按钮。
- 样式复用 `.refresh-btn`；≤640px 断点下该行会换行，**改完必须在 390×844 截图确认不挤爆**（这条规则见 `:124` 的注释）。

### 4.2 取景页（`/user-space/note/camera`）

```
┌─────────────────────────────┐
│ ×            Beta      ⇄    │  ← 关闭 / 角标 / 切前后摄
├─────────────────────────────┤
│                             │
│        <video> 3:4          │  ← 满铺 cover，object-fit: cover
│      + CSS filter + 胶片层   │
│                             │
├─────────────────────────────┤
│ 原图 负片 日光 反转 黑白 …   │  ← 11 档横向 chip（swatch 取自预设）
│ ──────●────── 强度 70%      │
│            ◯                │  ← 快门
└─────────────────────────────┘
```

- 取景框 3:4，`position: relative` + `overflow: hidden`（胶片层会溢出色块，`ImageEditorFilmFx` 的注释已写明这一点）。
- 快门后：白闪一帧 → 结果层（成片 + 「重拍」/「用这张」）。
- 「用这张」→ `stashCameraCapture(file)` → `router.replace('/user-space/note')`。
- 页面 meta：`requiresLogin: true`、`hideNavbar: true`、`hideFooter: true`、不加 keepAlive。

### 4.3 降级态（微信 / 无权限 / 桌面无摄像头）

```
相机在这个浏览器里不可用
  ① [用系统相机拍一张]   ← <input type="file" accept="image/*" capture="environment">
  ② 在 Safari / Chrome 中打开可实时取景
```

系统相机拍到的静态帧照样进 `resolveFilterLook` + `renderDocToCanvas`，然后走同一个 bridge。**降级不是"没有滤镜"，只是"没有实时取景"。**

## 5. 状态机

```
idle ──点击入口──> requesting ──授权──> live ──快门──> captured ──用这张──> handing-off
                      │                   │                  │
                      └─拒绝/无设备─> unavailable          └─重拍─> live
                                          └─系统相机─> captured
live ──页面隐藏──> suspended ──回到前台──> requesting（重新取流）
```

- `unavailable` 必须写明原因（无 API / 权限被拒 / 设备被占用 `NotReadableError`），三种文案不同。
- 离开页面（`onBeforeUnmount` + 路由守卫）必须 `track.stop()`，否则相机指示灯常亮。

## 6. 文件改动清单

### 6.1 新增 `src/composables/useCameraStream.js`

```js
export function isCameraSupported()            // !!navigator.mediaDevices?.getUserMedia
export function useCameraStream()              // { stream, status, error, facing, start, stop, flip }
```

要点：

- `start()` 的约束：`{ video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false }`。
- `visibilitychange`：隐藏时 `stop()`，可见且此前是 live 时重新 `start()`（iOS 挂起后旧流不可恢复）。
- `track.onended` → 置 `unavailable`，别静默黑屏。
- 单例保护：重复 `start()` 先 `stop()`（iOS 不允许两路并发取流）。

### 6.2 新增 `src/utils/camera-capture-bridge.js`

```js
stashCameraCapture(file) / takeCameraCapture() / hasCameraCapture()
```

内存单例，**不落 localStorage / sessionStorage**：一个几 MB 的 File 塞进 storage 会直接撞配额，且跨会话复用没有意义（拍完必须马上用掉，刷新即丢）。

### 6.3 新增 `src/views/Camera/index.vue`

- 取景、滤镜条、强度、快门、结果层、降级态。
- 抓帧必须**先落一张原生分辨率的中间画布**再进合成器：

```js
const frame = document.createElement('canvas');
frame.width = video.videoWidth;
frame.height = video.videoHeight;
frame.getContext('2d').drawImage(video, 0, 0);
const composed = renderDocToCanvas(frame, [], { look: resolveFilterLook(id, strength) });
const file = await exportCanvasToJpegFile(composed, { name: 'boh-camera.jpg' });
```

  ⚠️ 不能把 `<video>` 直接传给 `renderDocToCanvas`：`applyFilmLook` 里用 `source.width/height` 建画布，而 `<video>` 这两个属性是**布局尺寸**（可能是 390×520），不是 `videoWidth/videoHeight`——滤镜参数按 390 宽换算，颗粒和暗角会整片错位。

### 6.4 修改 `src/views/Forum/components/ImageEditorFilmFx.vue`

- 新增 prop `halationStream`；有值时 halation 层渲染 `<video muted playsinline autoplay>` 并 `srcObject = stream`，样式与现在完全一致。
- 图片编辑器不传该 prop，行为零变化（由现有快照/单测保证）。

### 6.5 修改 `CloudPlusMain.vue`

1. 头部加相机按钮（`data-testid="gallery-camera-entry"`）。
2. 把 `handleImageSelection(event)` 的「取文件之后的逻辑」抽成 `addFilesToDraft(files, input)`，input 分支与相机分支共用（`retryFailedUploads()` 已经在用 DataTransfer 造 mock event，抽出后它可以简化）。
3. `onMounted` + `onActivated` 各消费一次 bridge：

```js
function consumeCameraCapture() {
  const file = takeCameraCapture();
  if (!file) return;
  openComposer();
  void addFilesToDraft([file]);
}
```

  ⚠️ **两个钩子都要挂**：Cloud+ 是外包一层组件渲染的，首次挂载不会触发 `onActivated`（`:3984` 已记录这条实测）。只写 `onActivated` 会导致「第一次从相机返回时什么都不发生」。

### 6.6 修改 `src/router/routes/user-space.ts`

```ts
{ path: '/user-space/note/camera', name: 'BOHCamera',
  component: () => import('../../views/Camera/index.vue'),
  meta: { ...userSpaceMeta, hideNavbar: true, hideFooter: true } }
```

不挂 keepAlive（相机页每次进来都要重新取流，缓存只会留下一个死掉的 stream）。

## 7. 已识别的坑（实施时逐条对照）

| # | 坑 | 处置 |
|---|---|---|
| 1 | iOS 必须在用户手势内调 `getUserMedia` / `video.play()`；`setTimeout`、`Promise.then` 里调会被静默拒绝 | 起流只由按钮 click 触发，不在 `onMounted` 里自动起 |
| 2 | `<video>` 缺 `playsinline` 会在 iOS 上全屏接管页面 | 模板固定 `playsinline muted autoplay` |
| 3 | 前置摄像头预览镜像、成片不镜像 | `transform: scaleX(-1)` 只作用于取景 `<video>`；合成器拿的是原始帧 |
| 4 | 切后台/来电后流会死 | `visibilitychange` 停机 + 回前台重取（见 6.1） |
| 5 | 离开路由不 stop → 指示灯常亮 | `onBeforeUnmount` + 路由离开双保险 |
| 6 | 相机页是黑底，可能撞 `check:dark-tokens` | 取景底色走 `--color-media-shell`（新增 token）并注释说明「媒体容器，非主题色」 |
| 7 | 两个 `<video>` 共用一路流在部分机型可能不起 | 起流失败即隐藏 halation 层并降级（预览少一层光晕，成片不变） |
| 8 | 低端安卓多层 `mix-blend-mode` 掉帧 | v1 先量：探针里读 `requestAnimationFrame` 帧间隔；掉到 <24fps 再考虑移动时隐藏颗粒层 |

## 8. 验收（不许只说"跑绿了"）

### 8.1 单测 `tests/unit/camera-capture.test.js`

- `isCameraSupported()` 在无 `mediaDevices` / 无 `getUserMedia` / 有 API 三种环境下的判定。
- 抓帧尺寸换算：1920×1440 输入 + 1600 上限 → 1600×1200（复用 `computeExportDimensions`，不新增公式）。
- bridge 的 take 语义：取一次后为空、二次调用返回 `null`。
- 预设完整性：11 档全部能 `resolveFilterLook` 出非空 look（防止搬家后丢掉一个导出）。

### 8.2 探针 `scripts/probes/probe-camera-live.mjs`

用 Playwright + Chromium 假摄像头（`--use-fake-device-for-media-stream`、`--use-fake-ui-for-media-stream`），断言：

1. 图库头部存在 `[data-testid="gallery-camera-entry"]`，且含 `Beta` 文本。
2. 进入 `/user-space/note/camera` 后 `video.readyState >= 2` 且 `videoWidth > 0`。
3. 依次点过 11 档 chip，`getComputedStyle(video).filter` 逐档等于 `resolveFilterLook(id).css`（强度 100%）。
4. 强度拖到 0 → `filter` 为 `none`（"强度 0 必须严格等于原图"这条在相机侧也要成立）。
5. 快门 → `takeCameraCapture()` 能取到 `File`，`type === 'image/jpeg'`，长边 ≤1600。
6. `addInitScript` 删掉 `navigator.mediaDevices` → 页面出现降级 UI，且「用系统相机」入口存在。
7. 离开路由后 `stream.getTracks()` 全部 `readyState === 'ended'`（用探针注入的全局引用读）。
8. 竖屏 390×844 + 横屏 844×390 各跑一遍，取景框不与滤镜条重叠。

### 8.3 反证（必须做）

- 撤掉 6.5 的 `onMounted` 消费 → 断言「返回图库后草稿里有 1 张图」必红。
- 把 `renderDocToCanvas` 的输入换回 `<video>` 元素 → 断言 3（颗粒/暗角参数换算）必红。
- 只测「修复后全绿」不算自证。

### 8.4 门禁

`npm run verify:fast` → `npm run verify` → `node scripts/probes/probe-camera-live.mjs`；动过 `CloudPlusMain` 还要跑 `node scripts/probes/probe-messages-select.mjs` 之外相关的图库探针（若有），并截图对比头部换行。

## 9. v1 明确不做

- 录像、连拍、定时拍摄、网格/水平仪。
- 手电筒、手动曝光、手动对焦、HDR、人像模式（**iOS Safari 全无**，安卓 Chrome 只有 `torch`/`zoom`，做了也是半残）。
- 美颜、贴纸、裁切（拍完想改：可以后续接现有图片编辑器，v1 不接）。
- 「拍完即发布」：v1 走「新建面板 + 已就位」，让用户决定标题与心情。
- 真正的全屏取景（iPhone Safari 没有 `requestFullscreen`）——只能做到"页面内满铺 + 安全区"。
- PWA 离线拍摄。

## 10. 风险与真机未知

| 风险 | 影响 | 处置 |
|---|---|---|
| **微信内置浏览器**（iOS WKWebView / 安卓 X5）大概率拿不到 `getUserMedia` | 分享链路的主要人群用不了实时取景 | 降级 UI + 「在浏览器中打开」引导；**上线前必须真机实测**，结论决定 Beta 的宣传口径 |
| 低端安卓合成帧耗时 | 快门后 0.5–1.5s 无反馈 | 快门立即白闪 + 结果层骨架，别让用户以为没拍到 |
| 权限一次性被拒 | 后续点击无反应 | 文案区分「被拒绝」与「设备占用」，引导去系统设置 |
| `_headers` 未来迁 Cloudflare Pages 时误配 `Permissions-Policy: camera=()` | 功能整体失效 | 在 `public/_headers` 留注释：**不得**限制 `camera` |

## 11. 落地顺序（三个提交）

1. **基建**：滤镜表搬到 `utils/` + `ImageEditorFilmFx` 支持 `halationStream` + 单测回归（行为零变化，可单独 review）。
2. **相机**：`useCameraStream` + `Camera/index.vue` + 路由 + bridge + 图库入口 + `addFilesToDraft` 抽取。
3. **自证**：探针 + 降级态文案 + 390/844 截图 + 反证记录。

每步都能独立回滚；第 1 步不改变线上任何行为，第 2 步不通过探针不许合。
