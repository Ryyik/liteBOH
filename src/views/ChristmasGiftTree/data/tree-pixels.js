/**
 * 圣诞树场景（像素画，纯函数，不依赖 Vue / DOM）
 *
 * 范式对齐 `views/Home/components/halloween-scene.js`：
 *  ① 所有坐标都是**整数格**，调用方按容器宽度放大；
 *  ② 用 `<rect width="1" height="1">` 逐格铺，靠 `shape-rendering="crispEdges"`
 *     保证边缘是方块而不是糊边；
 *  ③ 渐变一律拆成硬色带（像素画里没有平滑过渡）；
 *  ④ 随机全部走确定性种子，同一份配置在任何设备上画出来都一样。
 *
 * 画布 100 × 120 格，比例 0.8333 —— 与 tree-layout 的 600×720 **严格同比例**，
 * 所以挂饰那套百分比坐标可以直接叠上来，不需要第二套换算。
 *
 * 🔴 **别再提高分辨率**。试过 140×168：手机上树容器约 350px，140 格 ⇒ 2.5px/格，
 * crispEdges 会让每格在 2px / 3px 之间跳，树冠变成一层抖动噪点，星的方块光芒和
 * 灯晕全部碎掉 —— 比 100 格时明显更脏。像素画的锐利度取决于「格子数 × 整数倍缩放」，
 * 容器宽度是响应式的、保证不了整数倍，所以 100 格（≈3.5px）是这块地方的上限。
 *
 * 树形与 tree-layout 的 TREE_SHAPE 对齐：
 *   顶点 10/120 ≈ 8.3%、底边 108/120 = 90%、底半宽 42/100 = 42%。
 *   改任何一边都要同步另一边，否则头像会挂在树冠外面。
 */
export const PIXEL_W = 100;
export const PIXEL_H = 120;

const CX = 50;

/** 分层树冠：y0/y1 是行号，half0/half1 是该层在首尾两行的半宽（格） */
const LAYERS = [
  { y0: 10, y1: 42, half0: 4, half1: 16 },
  { y0: 34, y1: 64, half0: 9, half1: 24 },
  { y0: 56, y1: 86, half0: 14, half1: 32 },
  { y0: 78, y1: 108, half0: 18, half1: 42 },
];

/**
 * 6 档绿。像素画的体积感来自"几条固定色阶"而不是渐变。
 * body 必须够亮：整体压暗会让树在夜色里糊成一块墨绿，灯和彩带反而成了唯一亮点。
 */
const GREEN = {
  shade: '#0a2f20',
  dark: '#124932',
  body: '#1b6a47',
  mid: '#238059',
  light: '#2f9668',
  rim: '#43b07c',
};

/** 枝头压的雪：只在每层顶部撒几粒，多了就成"落了一树灰" */
const BRANCH_SNOW = '#d3e2f5';

const LAMP_COLORS = [
  { core: '#fffaea', halo: 'rgba(255,232,175,0.5)', glow: 'rgba(255,199,102,0.26)' },
  { core: '#fff2ee', halo: 'rgba(255,196,178,0.48)', glow: 'rgba(255,138,114,0.24)' },
  { core: '#f4feff', halo: 'rgba(196,240,255,0.48)', glow: 'rgba(142,224,255,0.24)' },
];

/**
 * 彩带走红丝带，不是金色：树上的挂牌本身就是金框 + 金挂绳，
 * 彩带再用金色会和主角抢，整棵树变成一片黄。红色在深绿上跳得出来，
 * 又比黄色退得远，正好当背景装饰。
 */
const RIBBON = {
  hi: '#f4717a',
  body: '#bf2a36',
  low: '#8a1a24',
  deep: '#5f0f17',
};

function makeRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

/** 五角星逐格判定：极坐标里余弦调制半径，比手写 ASCII 更好调 */
function inStar(dx, dy, radius) {
  const distance = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);
  const petal = Math.cos(5 * (angle + Math.PI / 2));
  // 0.6 + 0.4 而不是 0.52 + 0.48：后者花瓣太瘦，渲染出来像一枚十字飞镖
  return distance <= radius * (0.6 + 0.4 * petal);
}

/**
 * 像素圆：逐行算半宽，每行一个 rect。
 * 光晕绝不能用矩形 —— 方角叠在夜空上是"脏黄方块"，这是第一版最刺眼的问题。
 */
function pixelCircle(cx, cy, radius, fill, extra = '') {
  const out = [];
  for (let dy = -radius; dy <= radius; dy += 1) {
    const halfW = Math.floor(Math.sqrt(Math.max(0, radius * radius - dy * dy)));
    if (halfW < 0) continue;
    out.push(
      `<rect x="${cx - halfW}" y="${cy + dy}" width="${halfW * 2 + 1}" height="1" fill="${fill}"${extra}/>`,
    );
  }
  return out.join('');
}

export function buildTreeSceneSvg(options = {}) {
  const seed = Number(options.seed) || 20261220;
  const parts = [];
  const rect = (x, y, w, h, fill, extra = '') => {
    parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${extra}/>`);
  };

  /*
   * 天空**不在**这里画：页面背景是整屏的硬色带，SVG 再画一份只会在容器边缘
   * 露出一块「贴上去的矩形」（两边的分段位置对不齐）。这里只负责树、雪、远景、星。
   */

  /* ── 星：1×1 与十字两种，闪烁走 steps（像素是"跳"的，不是渐隐） ── */
  const starRnd = makeRandom(seed + 7);
  for (let i = 0; i < 56; i += 1) {
    const x = Math.floor(starRnd() * PIXEL_W);
    const y = Math.floor(2 + starRnd() * 62);
    // 树身上不撒星
    if (y > 12 && Math.abs(x - CX) < 44) continue;
    const delay = (starRnd() * 4).toFixed(2);
    if (starRnd() > 0.84) {
      rect(x - 1, y, 3, 1, '#cdd8f2', ` class="px-tw" style="animation-delay:${delay}s"`);
      rect(x, y - 1, 1, 3, '#cdd8f2', ` class="px-tw" style="animation-delay:${delay}s"`);
    } else {
      rect(
        x,
        y,
        1,
        1,
        starRnd() > 0.55 ? '#e6ecff' : '#8b96bb',
        ` class="px-tw" style="animation-delay:${delay}s"`,
      );
    }
  }

  /*
   * 远景只留一道雪丘轮廓，而且颜色压到几乎等于夜色。
   * 两层都填到画布底部时，会在树脚和雪原之间露出一条深蓝色横带 ——
   * 那条横带比夜空亮、比雪暗，正好把树"架"在半空。
   */
  const hillRnd = makeRandom(seed + 31);
  let hillX = -20;
  while (hillX < PIXEL_W + 20) {
    const w = 7 + Math.floor(hillRnd() * 4);
    const h = 3 + Math.floor(hillRnd() * 9);
    rect(hillX, 100 - h, w, h, '#141e38');
    hillX += w;
  }

  /* ── 树干：先于雪地绘制，下半截会被雪埋住。
        图层顺序必须是「树干 → 雪地 → 树冠」：雪地压住树干、树冠再压住雪地上沿，
        树才是站在雪里；反过来雪地会把树底横着切一刀，像站在一块白板前。 ── */
  rect(47, 104, 6, 9, '#4a2d14');
  rect(47, 104, 1, 9, '#6b4522');
  rect(49, 104, 1, 9, '#7a4f28');
  rect(52, 104, 1, 9, '#2d190a');

  /* ── 雪地：只在树底铺开，左右用跳块收边 ──
        铺满整幅画布会在桌面大尺寸下变成一条横贯画面的白带，
        树看起来像站在一块台子上，而不是站在雪地里。雪堆的边也不该是一条直线。 */
  const SNOW_HALF = 42;
  const snowRnd = makeRandom(seed + 401);
  let snowX = CX - SNOW_HALF;
  while (snowX < CX + SNOW_HALF) {
    const w = 4 + Math.floor(snowRnd() * 6);
    const mid = snowX + w / 2;
    const far = Math.abs(mid - CX);
    const left = snowX;
    snowX += w;
    if (far > 40) continue;
    // 边缘跳块：雪堆的边是被"啃"出来的，不是刀切的
    if (far > 34 && (Math.round(mid) + 113) % 2 === 0) continue;
    // 只在树干附近（±14 格）堆高、用最亮的一档；两侧逐档压到灰蓝
    const heaped = far < 10;
    // 夜景里的雪不是纯白：纯白会从整幅画里跳出来，变成一块发光的地板
    const fill = heaped ? '#ccdaf1' : far < 26 ? '#a5b9d9' : '#7185ad';
    // 雪堆在树根最高，向两侧缓缓落下（远处雪线更高，近处压低）
    const lift = Math.min(2, Math.round(Math.max(0, far - 12) * 0.1));
    let top = 105 + lift + Math.floor(snowRnd() * 2);
    /*
     * 两端必须**收成薄片**：等厚的雪原在 far=±42 处会留下两道垂直硬边，
     * 远看就是一个白色展台把树托起来。让下沿随距离抬升，边缘只剩一两格厚。
     * 但上沿绝不能抬过 108 —— 那是树底，抬过了树角就悬空。
     */
    // 下沿不再随距离收窄：收窄会在两端留下零星碎块，像浮在空中的雪片。
    // 雪地宽度只比树底宽 4 格，两端靠跳块收边就够了。
    let bottom = 114;
    // 两端斜着收进树底（y≈109）：等宽会在树冠外侧露出两块方形雪角，像雪地里插了两张纸。
    if (far > 32) {
      const shrink = Math.min(1, (far - 32) / 8);
      top = Math.round(top + (109 - top) * shrink);
      bottom = Math.round(bottom - (bottom - 109) * shrink);
    }
    if (bottom <= top) continue;
    rect(left, top, w, bottom - top, fill);
    // 雪脊受光：只在最亮那档上加一条高光，宽了会变成"雪地上刷了白漆"
    if (heaped) rect(left, top, w, 1, '#e6eefc');
    // 下沿两档压暗沉进夜色；一刀切的深色横条会变成"托盘边"
    if (bottom > 110) {
      rect(left, bottom - 2, w, 1, '#41537a');
      rect(left, bottom - 1, w, 1, '#2b3a58');
    }
  }
  // 树根的雪堆由雪原本身在 ±14 格内抬高成形，这里不再额外叠亮块 ——
  // 叠上去会变成一条比树干宽几倍的白色横条，像给树垫了块砖
  // 雪面阴影：随机碎点，读作"被树挡住的那片雪"
  for (let i = 0; i < 26; i += 1) {
    const x = CX - SNOW_HALF + Math.floor(snowRnd() * SNOW_HALF * 2);
    const y = 110 + Math.floor(snowRnd() * 2);
    rect(x, y, 1, 1, '#8fa3c4');
  }

  /* ── 树冠：逐行扫描，每行「底色 + 左受光带 + 右背光带 + 噪点」 ── */
  const leafRnd = makeRandom(seed + 101);

  /**
   * 装饰球：比彩灯大一圈的实体挂饰，是"树上真的有东西"的主要信号。
   * 每层单独画，下层树冠会自然盖住上一层的球底，遮挡关系不用另算。
   */
  const BALL_COLORS = [
    { body: '#dfa733', hi: '#ffe6a2', dark: '#92680f' },
    { body: '#3f8fc8', hi: '#a5d7ff', dark: '#1d5883' },
    { body: '#b9c6de', hi: '#ffffff', dark: '#6d7c99' },
    // 红色只留一档：树上的彩带本身就是红的，红球一多整棵树就糊成一片
    { body: '#cf2f3a', hi: '#ff8f94', dark: '#84121c' },
  ];

  const drawBall = (x, y, r, color) => {
    for (let dy = -r; dy <= r; dy += 1) {
      const hw = Math.floor(Math.sqrt(r * r - dy * dy));
      if (hw < 0) continue;
      // 下四成压暗：球是"上亮下暗"，不是一片均匀的颜色
      rect(x - hw, y + dy, hw * 2 + 1, 1, dy > r * 0.4 ? color.dark : color.body);
    }
    /*
     * 左右各描一格深色轮廓。不描的话球会和树面糊成一团色块 ——
     * 树冠本身有噪点，球没有硬边就分不出来是"球"还是"一块深绿"。
     */
    for (let dy = -r + 1; dy <= r - 1; dy += 1) {
      const hw = Math.floor(Math.sqrt(r * r - dy * dy));
      if (hw < 1) continue;
      rect(x - hw, y + dy, 1, 1, '#102418');
      rect(x + hw, y + dy, 1, 1, '#102418');
    }
    // 左上高光：整块 2×2，一条线在格子这么小时看不出来
    if (r >= 4) rect(x - r + 2, y - r + 3, 2, 2, color.hi);
    else rect(x - 1, y - r + 2, 1, 1, color.hi);
    // 顶上的金挂环：没有它，球就是浮在树面上的色点
    rect(x - 1, y - r - 1, 3, 1, '#c9a24a');
  };

  /**
   * 彩带：一条斜带从层左缘走到层右缘。
   * 正面的螺旋投影就是一条斜线 —— 上层收在右缘、下层从左缘重新出现，
   * 中间那段看不见的部分正好是绕到树后的半圈。所以方向必须层层一致，
   * 交替方向会读成四条各自独立的斜纹，而不是一条绕树的带子。
   * 必须夹在两层之间绘制：下层树冠要盖住它，才接得上前一行画的遮挡关系。
   */
  const drawRibbon = (rows) => {
    if (rows.length < 5) return;
    const span = rows.length - 1;
    let prevX = null;
    for (let i = 0; i <= span; i += 1) {
      const { y, half } = rows[i];
      const p = i / span;
      /*
       * 斜率很缓：每行要横跨 3~4 格才接得上，所以末端绝不能收窄成 1 格 ——
       * 单格高的一行横跨几格，就会断成一串悬空的短横线，像被剪断的红纸。
       */
      const w = half < 8 ? 1 : 2;
      // 末端轻微下垂：彩带挂到枝梢会往下坠一点，比平直切断自然
      const sag = p > 0.94 ? 1 : 0;
      const segY = y + sag;
      const turning = p < 0.09 || p > 0.91;
      // 留 3 格余量：树冠轮廓本身会随机缩进一格，贴到缘上就有红色戳出轮廓
      const reach = Math.max(1, half - w - 3);
      /*
       * 试过按螺旋的真实余弦投影走，结果在树缘变成两根竖直红柱 ——
       * 带子只有两格宽，撑不起曲线，只剩突兀。像素画里这个尺度用直线斜带最干净。
       */
      const x = Math.round(CX - reach + p * reach * 2);
      // 横向补齐上一行到这一行之间：像素斜线不能靠"跳格"实现，会断成虚线
      const from = prevX === null ? x : Math.min(prevX, x);
      const to = prevX === null ? x : Math.max(prevX, x);
      for (let xx = from; xx <= to; xx += 1) {
        // 折面：每几列压一档暗色，布才有褶皱感，不是一个红色实心条
        const fold = (xx * 5 + y * 3) % 11 < 3;
        // 上沿永远最亮：丝带的受光面朝上，这条高光让它从树面上"浮"起来
        rect(xx, segY, 1, 1, turning ? RIBBON.body : fold ? RIBBON.body : RIBBON.hi);
        if (w > 1) {
          rect(xx, segY + 1, 1, 1, turning ? RIBBON.low : fold ? RIBBON.low : RIBBON.body);
        }
      }
      prevX = x;
    }
  };

  LAYERS.forEach((layer, layerIndex) => {
    const rowHalves = [];

    for (let y = layer.y0; y <= layer.y1; y += 1) {
      const t = (y - layer.y0) / (layer.y1 - layer.y0);
      // 底边做阶梯收窄：层的最后两行各缩一格，边缘就不是一条死直线
      const wobble = y === layer.y1 ? -2 : leafRnd() > 0.84 ? -1 : 0;
      const half = Math.max(1, Math.round(layer.half0 + (layer.half1 - layer.half0) * t) + wobble);
      const left = CX - half;
      const width = half * 2 + 1;
      rowHalves.push({ y, half });

      if (y === layer.y1) {
        // 层底一整行最深色：层与层之间靠这条阴影分开（不是靠留白）
        rect(left, y, width, 1, GREEN.shade);
        continue;
      }

      // ① 底色
      rect(left, y, width, 1, GREEN.body);

      /*
       * ② 左受光、右背光。宽度必须**固定几格**，不能按树宽比例：
       * 按比例时树底亮带能到 12 格，配上每行一起变宽就成了一条从顶斜到底的
       * 色带，把整棵树切成两块面。体积靠噪点和层阴影表现，边缘只留窄窄一圈。
       */
      const litW = Math.min(4, Math.max(2, Math.round(width * 0.08)));
      // 右背光比左受光窄一档：两边一样厚会让树看起来"左右各贴了一条边"
      const darkW = Math.min(3, Math.max(2, Math.round(width * 0.05)));
      rect(left, y, 1, 1, GREEN.rim);
      rect(left + 1, y, litW - 1, 1, GREEN.light);
      rect(left + width - darkW, y, darkW - 1, 1, GREEN.dark);
      rect(left + width - 1, y, 1, 1, GREEN.shade);

      // ③ 噪点：随机撒深/中两档，打断横向色带，树面才有颗粒。
      //    密度压在 5% 以内 —— 到 9% 时整棵树会变成一层雪花屏，反而更脏
      const noise = Math.min(4, Math.max(1, Math.round(width * 0.05)));
      for (let i = 0; i < noise; i += 1) {
        const nx = left + 2 + Math.floor(leafRnd() * Math.max(1, width - 4));
        rect(nx, y, 1, 1, leafRnd() > 0.55 ? GREEN.dark : GREEN.mid);
      }
    }

    /* 带子要一直铺到层底：层与层本来就有 8 行重叠，这一圈在这里被下一层树冠
       盖住、下一层又从左缘把它接出来，中间不能留空档 —— 留空档就断成四条斜纹了。
       头顶留 3 行是给星星和树尖让位，那里太窄塞不下一条带子。 */
    drawRibbon(rowHalves.filter((row) => row.y >= layer.y0 + 3 && row.y <= layer.y1 - 1));

    /*
     * 装饰球：每层 2 个。
     * ① 两个球的纵向位置必须错开 —— 都挤在层中段时会叠成一坨；
     * ② 半宽 <14 的行不放（那是树尖），一颗 9 格的球能把整个树尖糊死。
     */
    const ballRnd = makeRandom(seed + 509 + layerIndex * 61);
    for (let i = 0; i < 2; i += 1) {
      const usable = Math.max(1, rowHalves.length - 14);
      const row = rowHalves[6 + Math.floor((i * 0.5 + ballRnd() * 0.42) * usable)];
      if (!row || row.half < 14) continue;
      const r = row.half >= 26 ? 5 : 4;
      const spread = Math.max(1, Math.round(row.half * 0.5) - r);
      const x = CX - spread + Math.floor(ballRnd() * (spread * 2 + 1));
      if (row.y - r - 1 < layer.y0) continue;
      drawBall(x, row.y, r, BALL_COLORS[Math.floor(ballRnd() * BALL_COLORS.length)]);
    }

    /* 每层顶部撒几粒雪 + 一道受光点：像被上面的灯照亮，也是层与层的分界 */
    const topRow = rowHalves[2];
    if (topRow) {
      const snowRnd = makeRandom(seed + 613 + layerIndex * 29);
      const n = Math.max(2, Math.round(topRow.half * 0.35));
      for (let i = 0; i < n; i += 1) {
        const x = CX - topRow.half + 1 + Math.floor(snowRnd() * Math.max(1, topRow.half * 2 - 2));
        rect(x, topRow.y, 1, 1, BRANCH_SNOW);
      }
      for (let x = CX - topRow.half + 3; x < CX + topRow.half - 3; x += 4) {
        rect(x, topRow.y, 1, 1, GREEN.rim);
      }
    }

    /* 垂枝：层底再往外挂几个 2×1 的齿，轮廓才不会像刀切的 */
    const teethRnd = makeRandom(seed + 211 + layerIndex * 17);
    const bottomHalf = layer.half1;
    for (let i = 0; i < 9; i += 1) {
      const x = CX - bottomHalf + 2 + Math.floor(teethRnd() * Math.max(1, bottomHalf * 2 - 4));
      rect(x, layer.y1 + 1, 2, 1, GREEN.dark);
      if (teethRnd() > 0.65) rect(x, layer.y1 + 2, 1, 1, GREEN.shade);
    }
  });

  /* ── 彩灯：沿每层下沿挂一排，灯 = 灯芯 + 三层光晕 ── */
  const lampRnd = makeRandom(seed + 307);
  LAYERS.forEach((layer) => {
    const half = layer.half1 - 1;
    let x = CX - half + 2;
    let index = 0;
    while (x < CX + half - 1) {
      // 灯的 y 抖动 0~3 格：一排严格同高会变成三道横线，像缠了一圈灯带
      const y = layer.y1 - 4 + (index % 4);
      const color = LAMP_COLORS[(index + layer.y1) % LAMP_COLORS.length];
      const cls = ` class="px-lamp" style="animation-delay:${(index * -0.23).toFixed(2)}s"`;
      /*
       * 光晕三层：5×5 淡十字 → 3×3 亮一档 → 1×1 灯芯。
       * 中间那层必须还是**半透明**：用实色会变成一块 3×3 的彩色贴片，不像灯。
       */
      rect(x - 2, y, 5, 1, color.glow, cls);
      rect(x, y - 2, 1, 5, color.glow, cls);
      rect(x - 1, y - 1, 3, 3, color.halo, cls);
      rect(
        x,
        y,
        1,
        1,
        color.core,
        ` class="px-lamp-core" style="animation-delay:${(index * -0.23).toFixed(2)}s"`,
      );
      index += 1;
      x += 7 + (lampRnd() > 0.72 ? 1 : 0);
    }
  });

  /* ── 树底礼物盒：给"节日"一个落点，也让树不是凭空站在雪里 ──
        画在树冠与雪地之后 ⇒ 位于最前景，压在树脚上，符合"礼物堆在树下"。 */
  const drawGift = (x, y, w, h, box, lid, ribbon) => {
    const mid = x + Math.floor(w / 2) - 1;
    rect(x - 1, y, w + 2, 3, lid); // 盒盖比盒身宽一格，才有"盖上去"的厚度
    rect(x, y + 3, w, h - 3, box);
    rect(mid, y + 3, 2, h - 3, ribbon);
    rect(x - 1, y + 1, w + 2, 2, ribbon);
    // 蝴蝶结：左右两个环 + 中间的结
    rect(mid - 2, y - 2, 2, 2, ribbon);
    rect(mid + 2, y - 2, 2, 2, ribbon);
    rect(mid, y - 2, 2, 2, ribbon);
    // 盒子底边压暗：坐在雪上要有一道接触阴影
    rect(x, y + h - 1, w, 1, '#0d1b30');
  };

  drawGift(22, 102, 15, 12, '#b8323c', '#d0454f', '#f0c04a');
  drawGift(60, 105, 13, 9, '#2f6f9f', '#3f83b5', '#e6effb');

  /* ── 树顶星：五圈像素光晕 + 四道光芒 + 逐格五角星 ──
        光晕的 alpha 必须够高：低 alpha 的暖色叠在深蓝上会变成一块"脏褐斑"，
        看起来像污渍而不是光。近圈给到 0.55，叠出来的中心才是暖白。 */
  const starY = 11;
  const starR = 7;
  [
    [17, 0.06],
    [13, 0.11],
    [9, 0.2],
    [5, 0.42],
    [3, 0.6],
  ].forEach(([radius, alpha]) => {
    // 用暖白而不是暖黄：黄色叠在深蓝上会往灰褐走，看起来像污渍而不是光
    parts.push(pixelCircle(CX, starY, radius, `rgba(255,242,205,${alpha})`));
  });

  // 光芒：四向各一道，越远越淡。静态四道比旋转更像"光的形状"，也不掉帧
  [
    [17, 0.08],
    [14, 0.12],
    [11, 0.18],
  ].forEach(([len, alpha]) => {
    rect(CX, starY - len, 1, 2, `rgba(255,238,190,${alpha})`);
    rect(CX, starY + len - 1, 1, 2, `rgba(255,238,190,${alpha})`);
    rect(CX - len, starY, 2, 1, `rgba(255,238,190,${alpha})`);
    rect(CX + len - 1, starY, 2, 1, `rgba(255,238,190,${alpha})`);
  });

  for (let dy = -starR; dy <= starR; dy += 1) {
    for (let dx = -starR; dx <= starR; dx += 1) {
      if (!inStar(dx, dy, starR)) continue;
      // 上半部分更亮，下半部分换暖金，星体才有厚度
      rect(CX + dx, starY + dy, 1, 1, dy < -2 ? '#fff7da' : dy < 0 ? '#ffe9a8' : '#ffc94f');
    }
  }
  rect(CX - 1, starY - 1, 3, 3, '#fffdf0');
  rect(CX, starY, 1, 1, '#ffffff', ' class="px-star-core"');

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PIXEL_W} ${PIXEL_H}"`,
    ' width="100%" height="100%" shape-rendering="crispEdges" aria-hidden="true">',
    parts.join(''),
    '</svg>',
  ].join('');
}
