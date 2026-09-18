/**
 * BOH App（Android 客户端）发布信息的单一真相源。
 *
 * 任何展示层（本落地页、导航、资源中心）都从这里取值，
 * 禁止在组件内另写一份 URL 或版本号——改这里就够。
 *
 * ⚠️ `version` / `versionCode` 必须与 `android-twa/twa-manifest.json` 的
 *    appVersion / appVersionCode 保持一致：那份文件是构建 APK 的唯一输入，
 *    这里只是它的对外展示镜像。发新版外壳时两处一起改。
 */

/** GitHub Release 的滚动 tag：CI 每次构建都覆盖同一个 Release，链接永久有效。 */
const RELEASE_TAG = 'android-latest';
const REPO = 'Ryyik/liteBOH';

export const ANDROID_APP_RELEASE = {
  /** 直接下载地址（仓库公开，免登录）。APK 文件名固定为 boh.apk，覆盖安装不会变成两个应用。 */
  downloadUrl: `https://github.com/${REPO}/releases/download/${RELEASE_TAG}/boh.apk`,
  /** 发布说明页：用户想核对版本 / 看更新日志时用 */
  releasePageUrl: `https://github.com/${REPO}/releases/tag/${RELEASE_TAG}`,
  version: '1.0.0',
  versionCode: 1,
  /** 展示用的体积文案。实测量级 <1MB，外壳极小是 TWA 的特性之一。 */
  sizeLabel: '不足 1 MB',
  minAndroidLabel: 'Android 5.0+',
  packageId: 'cn.blockofhome.app',
  minSdk: 21,
  /** 桌面长按图标可用的快捷入口，与 twa-manifest.json 的 shortcuts 对应。 */
  shortcuts: [
    { label: '论坛', path: '/#/forum' },
    { label: '活动', path: '/#/activities-wall' },
    { label: '消息', path: '/#/user-space/messages' },
  ],
};

/**
 * 判定访问者所处的平台，用于决定下载区的主次引导。
 * 只做粗粒度分流，判不出来一律按桌面处理（展示全部选项）。
 * @returns {'android'|'ios'|'standalone'|'desktop'}
 */
export const detectPlatform = () => {
  if (typeof window === 'undefined') return 'desktop';

  // 已在 App 外壳内运行（TWA 独立窗口）——不必再引导安装
  const isStandalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;
  if (isStandalone) return 'standalone';

  const ua = String(window.navigator.userAgent || '');
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
};
