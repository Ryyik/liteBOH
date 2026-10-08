/**
 * 咖啡店的图片资源映射 —— 唯一 import 图片资源的地方
 *
 * 为什么要这一层：core/ 与 systems/ 必须能在 vitest 里直接 import，
 * 而 `import img from '*.webp'` 只在应用构建中有意义。所以数据表只存 key，
 * 由这里把 key 解析成 URL。改文件名只需改这一处。
 */

import cafeBackdrop from '@/assets/images/26coffee4.webp';
import ryyikSkin from '@/assets/images/anniversary-cafe/skins/ryyik-cutout.webp';
import baiyeSkin from '@/assets/images/anniversary-cafe/skins/baiye-cutout.webp';
import chengziSkin from '@/assets/images/anniversary-cafe/skins/chengzi-cutout.webp';
import hamburgerSkin from '@/assets/images/anniversary-cafe/skins/hamburger-cutout.webp';
import xiaoniuSkin from '@/assets/images/anniversary-cafe/skins/xiaoniu-cutout.webp';
import thoikSkin from '@/assets/images/anniversary-cafe/skins/thoik-cutout.webp';
import teacherDingSkin from '@/assets/images/anniversary-cafe/skins/teacher-ding-cutout.webp';
import pufferfishSkin from '@/assets/images/anniversary-cafe/skins/pufferfish-cutout.webp';
import elevenSkin from '@/assets/images/anniversary-cafe/skins/eleven-cutout.webp';
import endSkin from '@/assets/images/anniversary-cafe/skins/end-cutout.webp';
import yufuquSkin from '@/assets/images/anniversary-cafe/skins/yufuqu-cutout.webp';
import fivegeSkin from '@/assets/images/anniversary-cafe/skins/fivege-cutout.webp';
import fourYearsImage from '@/assets/images/2022-7-4years.webp';
import fiveYearsImage from '@/assets/images/2023-7-5years.webp';
import winterMuseumImage from '@/assets/images/2025wintermuseam.webp';
import habitrainImage from '@/assets/images/habitrain.webp';
import fuzhouImage from '@/assets/images/fuzhou.webp';

export const BACKDROP_URL = cafeBackdrop;

const SKIN_URLS = {
  ryyik: ryyikSkin,
  baiye: baiyeSkin,
  chengzi: chengziSkin,
  hamburger: hamburgerSkin,
  xiaoniu: xiaoniuSkin,
  thoik: thoikSkin,
  'teacher-ding': teacherDingSkin,
  pufferfish: pufferfishSkin,
  eleven: elevenSkin,
  end: endSkin,
  yufuqu: yufuquSkin,
  fivege: fivegeSkin,
};

const MEMORY_URLS = {
  '2022-7-4years': fourYearsImage,
  '2023-7-5years': fiveYearsImage,
  '2025wintermuseam': winterMuseumImage,
  habitrain: habitrainImage,
  fuzhou: fuzhouImage,
};

export function skinUrl(imageKey) {
  return SKIN_URLS[imageKey] || SKIN_URLS.ryyik;
}

export function memoryUrl(assetKey) {
  return MEMORY_URLS[assetKey] || '';
}
