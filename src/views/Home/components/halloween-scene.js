/**
 * 万圣夜开屏场景（纯函数，无 Vue / 无 DOM 依赖）
 *
 * 为什么单独抽出来：这是一整张「像素画」，坐标与调色都是逐像素手调出来的，
 * 塞进 .vue 会和文案、CTA、拖拽逻辑混在一起，改一个像素要翻半屏组件代码。
 * 抽成纯函数后：① 单测可以直接断言「确定性 / 无脚本注入 / 尺寸自适应」；
 * ② 管理台的预览与线上开屏共用同一份，不会出现「后台预览和线上不一样」。
 *
 * 画布约定：所有坐标都是整数格，调用方按 3 CSS px/格 放大，
 * 配合 shape-rendering="crispEdges" 保证边缘是方块而不是糊边。
 */
export const SCENE_HEIGHT = 212;
export const SCENE_MIN_WIDTH = 90;
export const SCENE_MAX_WIDTH = 460;

const PALETTE = {
  body: ['#3F1204', '#6B2206', '#96330A', '#C24A0E', '#E86A17', '#FF8C33', '#FFAE5E'],
  hole: '#FFF6D8',
  holeDeep: '#FFD79A',
  stem: '#4F6B33',
  stem2: '#33471F',
  townFar: '#1A0F26',
  townNear: '#0B0614',
  win: '#FFB86B',
  winDim: '#6B4A2E',
  moon: '#FFF6E2',
  moon2: '#EFDDAE',
  moon3: '#CFB384',
};

const SKY_STOPS = [
  [0.0, '#07040D'], [0.05, '#0B0714'], [0.145, '#120A1C'], [0.25, '#1A0E27'],
  [0.36, '#241230'], [0.46, '#30163A'], [0.54, '#3D1A3F'], [0.6, '#4E2140'],
  [0.66, '#5C2740'], [0.75, '#6E3441'], [0.86, '#7A3A48'], [1.0, '#8C4449'],
];

const CLOUD = [
  '...####.......',
  '..######..###.',
  '.#############',
  '..###########.',
];

const BAT_A = [
  '.#.............#.',
  '###...........###',
  '.####.......####.',
  '..#####...#####..',
  '...###########...',
  '.....#######.....',
  '.......###.......',
];

const BAT_B = [
  '.......###.......',
  '.....#######.....',
  '...###########...',
  '..#####...#####..',
  '.####.......####.',
  '###...........###',
  '.#.............#.',
];

/** 只保留确定性随机：同一份配置在任何设备上都要画出一模一样的画 */
function makeRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

/**
 * 生成整张场景的 SVG 字符串。
 * @param {{ width?: number, height?: number }} options
 *   width 由容器宽高比决定（竖屏 126、横屏按比例加宽），高度恒定 212。
 */
export function buildHalloweenSceneSvg(options = {}) {
  const height = Number(options.height) || SCENE_HEIGHT;
  const width = Math.min(
    SCENE_MAX_WIDTH,
    Math.max(SCENE_MIN_WIDTH, Math.round(Number(options.width) || SCENE_MIN_WIDTH)),
  );
  const cx = Math.round(width / 2);
  const horizon = 150;
  const moonX = width - 25;
  const moonY = 33;
  const moonR = 9;

  const parts = [];
  const rnd = makeRandom(20261031);
  const srnd = makeRandom(777);

  const rect = (x, y, w, h, fill, extra = '') => {
    parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${extra}/>`);
  };

  /* 天空：硬分段色带（像素画的渐变是「一条条颜色」，不是平滑过渡） */
  let gradient = '<defs><linearGradient id="gs-sky" x1="0" y1="0" x2="0" y2="1">';
  for (let i = 0; i < SKY_STOPS.length; i += 1) {
    const [offset, color] = SKY_STOPS[i];
    gradient += `<stop offset="${offset}" stop-color="${color}"/>`;
    if (i < SKY_STOPS.length - 1) {
      gradient += `<stop offset="${SKY_STOPS[i + 1][0]}" stop-color="${color}"/>`;
    }
  }
  gradient += '</linearGradient></defs>';
  parts.push(gradient);
  rect(0, 0, width, horizon + 2, 'url(#gs-sky)');

  /* 星星：1×1 与十字两种，闪烁走 steps（保持「像素在跳」） */
  for (let i = 0; i < 52; i += 1) {
    const x = Math.floor(srnd() * width);
    const y = Math.floor(4 + srnd() * 74);
    const dx = x - moonX;
    const dy = y - moonY;
    if (dx * dx + dy * dy < 190) continue;
    const delay = (srnd() * 4).toFixed(2);
    const extra = ` class="gs-tw" style="animation-delay:${delay}s"`;
    if (srnd() > 0.82) {
      rect(x - 1, y, 3, 1, '#CFC3E0', extra);
      rect(x, y - 1, 1, 3, '#CFC3E0', extra);
    } else {
      rect(x, y, 1, 1, srnd() > 0.5 ? '#E6DEF2' : '#9E93B8', extra);
    }
  }

  /* 月亮：像素圆 + 多圈极低 alpha 的光晕（圈数够多就看不到硬边） */
  /* 光晕用椭圆而不是「逐格圆盘」：一格一个 rect 的写法在 7 圈时会生成上万个节点，
     手机首屏直接卡住（实测 6.9 万 rect）。光本身没有硬边，用椭圆没有视觉损失。 */
  [[16, 0.030], [26, 0.022], [38, 0.014], [52, 0.008]].forEach(([radius, alpha]) => {
    parts.push(
      `<ellipse cx="${moonX}" cy="${moonY}" rx="${radius}" ry="${radius}" fill="rgba(255,226,170,${alpha})"/>`,
    );
  });
  const craters = [[2, -3], [3, -3], [2, -2], [-4, 3], [-3, 3], [-4, 4], [-1, -5], [-2, 5], [4, 1], [3, 2]];
  let moonCells = '';
  for (let y = -moonR; y <= moonR; y += 1) {
    for (let x = -moonR; x <= moonR; x += 1) {
      const d2 = x * x + y * y;
      if (d2 > moonR * moonR) continue;
      let color = PALETTE.moon2;
      if (x < -2 && y < 1) color = PALETTE.moon;
      if (d2 > (moonR - 2) * (moonR - 2)) color = PALETTE.moon3;
      if (craters.some(([ax, ay]) => ax === x && ay === y)) color = PALETTE.moon3;
      moonCells += `<rect x="${moonX + x}" y="${moonY + y}" width="1" height="1" fill="${color}"/>`;
    }
  }
  parts.push(moonCells);

  /* 云：像素块 + 缓慢横移 */
  const cloud = (ox, oy, alpha, delay) => {
    let group = `<g class="gs-drift" style="animation-delay:${delay}s">`;
    CLOUD.forEach((row, ry) => {
      [...row].forEach((ch, rx) => {
        if (ch === '#') {
          group += `<rect x="${ox + rx}" y="${oy + ry}" width="1" height="1" fill="rgba(128,86,152,${alpha})"/>`;
        }
      });
    });
    parts.push(`${group}</g>`);
  };
  cloud(Math.round(width * 0.5), 66, 0.22, 0);
  cloud(Math.round(width * 0.1), 74, 0.15, 6);

  /* 城镇剪影：按画布宽度铺满（横屏不会在两侧露出空白） */
  const town = (baseY, color, winColor, winChance, minW, maxW, minH, maxH) => {
    let x = -12;
    while (x < width + 12) {
      const w = minW + Math.floor(rnd() * (maxW - minW + 1));
      const h = minH + Math.floor(rnd() * (maxH - minH + 1));
      const roof = Math.floor(rnd() * 4);
      rect(x, baseY - h, w, h, color);
      if (roof === 1) {
        rect(x + 1, baseY - h - 1, Math.max(1, w - 2), 1, color);
        rect(x + 3, baseY - h - 2, Math.max(1, w - 6), 1, color);
      }
      if (roof === 2) rect(x + Math.floor(w / 2) - 1, baseY - h - 3, 2, 3, color);
      if (roof === 3) rect(x + Math.floor(w / 2), baseY - h - 4, 1, 4, color);
      for (let wy = baseY - h + 3; wy < baseY - 2; wy += 3) {
        for (let wx = x + 2; wx < x + w - 1; wx += 3) {
          if (rnd() > winChance) continue;
          rect(wx, wy, 1, 1, winColor);
        }
      }
      x += w + 1;
    }
  };
  town(horizon, PALETTE.townFar, PALETTE.winDim, 0.16, 7, 12, 7, 19);
  town(156, PALETTE.townNear, PALETTE.win, 0.13, 10, 14, 9, 23);

  /* 地面 */
  rect(0, 150, width, 3, '#2A1F36');
  rect(0, 153, width, 9, '#1A1226');
  rect(0, 162, width, 12, '#120C1C');
  rect(0, 174, width, height - 174, '#0A0614');
  for (let i = 0; i < 44; i += 1) {
    rect(Math.floor(srnd() * width), 164 + Math.floor(srnd() * 36), srnd() > 0.6 ? 2 : 1, 1, '#171122');
  }
  for (let i = 0; i < 26; i += 1) {
    rect(Math.floor(srnd() * width), 151 + Math.floor(srnd() * 5), 1, 1, 'rgba(150,110,190,0.13)');
  }

  /* 墓园（右侧） */
  const tombs = [
    [width - 40, 168, 7, 11],
    [width - 31, 173, 6, 8],
    [width - 22, 164, 9, 14],
    [width - 10, 171, 6, 9],
  ];
  tombs.forEach(([x, y, w, h], index) => {
    rect(x, y, w, h, '#151022');
    rect(x, y, w, 1, '#2A2040');
    if (index === 2) {
      rect(x + 3, y - 4, 2, 4, '#151022');
      rect(x + 2, y - 2, 4, 1, '#151022');
    }
  });

  /* 左侧矮栅栏 */
  for (let x = 0; x < 32; x += 6) rect(x + 1, 152, 1, 10, '#0A0512');
  rect(0, 153, 33, 1, '#0A0512');
  rect(0, 158, 33, 1, '#0A0512');

  /* 地面小南瓜 */
  const miniPumpkin = (px, py) => {
    rect(px - 3, py, 7, 5, '#B8430D');
    rect(px - 3, py - 1, 7, 1, '#E86A17');
    rect(px - 2, py - 3, 2, 2, PALETTE.stem);
    rect(px - 2, py + 1, 2, 1, '#FFD08A');
    rect(px + 1, py + 1, 2, 1, '#FFD08A');
    rect(px - 1, py + 3, 3, 1, '#8E3009');
    for (let i = 0; i < 6; i += 1) rect(px - 4 + i, py + 5, 1, 1, 'rgba(255,150,70,0.10)');
  };
  miniPumpkin(17, 186);
  miniPumpkin(width - 17, 188);

  /* 贴底草丛：把画面底边压住 */
  for (let x = 0; x < width; x += 1) {
    if (srnd() > 0.55) continue;
    const h = 1 + Math.floor(srnd() * 3);
    rect(x, height - h, 1, h, '#050209');
    if (srnd() > 0.86) rect(x, height - h - 3, 1, 3, '#050209');
  }

  /* ---------------- 主角：南瓜灯 ---------------- */
  /* 横屏画布（宽度 > 160）把南瓜放到右侧 64%：左侧留给文案，
     否则「文案在左、南瓜居中」在 844×390 这种矮容器里会叠在一起。 */
  const pumpkinX = width > 160 ? Math.round(width * 0.64) : cx;
  const pumpkinY = 116;
  const bodyRX = 28.5;
  const bodyRY = 24.5;
  const lobes = [-13, 0, 13];
  const lobeRX = 15.5;

  /* 光晕 */
  [[36, 31, 0.030], [50, 43, 0.022], [66, 57, 0.014], [86, 74, 0.008]].forEach(([rx, ry, alpha]) => {
    parts.push(
      `<ellipse cx="${pumpkinX}" cy="${pumpkinY}" rx="${rx}" ry="${ry}" fill="rgba(255,132,44,${alpha})"/>`,
    );
  });

  /* 地面暖光：稀疏像素，整块半透明椭圆在深色地面上会像脏斑 */
  for (let i = 0; i < 150; i += 1) {
    const x = pumpkinX - 34 + Math.floor(srnd() * 68);
    const y = 150 + Math.floor(srnd() * 15);
    if (srnd() < Math.abs(x - pumpkinX) / 40) continue;
    rect(x, y, 1, 1, 'rgba(255,150,70,0.16)');
  }

  const field = (x, y) => {
    let best = -9;
    for (let i = 0; i < 3; i += 1) {
      const cxLobe = lobes[i];
      const value = 1 - ((x - cxLobe) / lobeRX) ** 2 - (y / bodyRY) ** 2;
      if (value > best) best = value;
    }
    return best;
  };

  const lightLength = Math.hypot(-0.6, -0.6, 0.53);
  const LIGHT = [-0.6 / lightLength, -0.6 / lightLength, 0.53 / lightLength];

  const shade = new Map();
  const face = new Set();
  const bodyCells = [];

  for (let y = -Math.ceil(bodyRY); y <= Math.ceil(bodyRY); y += 1) {
    for (let x = -Math.ceil(bodyRX); x <= Math.ceil(bodyRX); x += 1) {
      const fieldValue = field(x, y);
      if (fieldValue <= 0.002) continue;

      /* 用「所属那一瓣」自己的椭球法线：并集高度场在中段几乎是平的，
         照那样算出来整颗瓜只有一个色阶，看着像贴纸。 */
      let bestField = -9;
      let lobe = 0;
      for (let i = 0; i < 3; i += 1) {
        const value = 1 - ((x - lobes[i]) / lobeRX) ** 2 - (y / bodyRY) ** 2;
        if (value > bestField) {
          bestField = value;
          lobe = lobes[i];
        }
      }
      const u = (x - lobe) / lobeRX;
      const v = y / bodyRY;
      const nz = Math.sqrt(Math.max(0.04, 1 - u * u - v * v));
      const lambert = u * LIGHT[0] + v * LIGHT[1] + nz * LIGHT[2];

      const t = (lambert + 0.8) / 1.75;
      const scaled = t * 7;
      let index = Math.floor(scaled);
      if (scaled - index > 0.74 && (x + y) % 2 === 0) index += 1; /* 色阶交界 1px 棋盘抖动 */
      if (Math.abs(Math.abs(x) - 7.5) < 1.5) index -= 1; /* 瓣缝 */
      if (fieldValue < 0.06) index = 0; /* 外轮廓压暗 */
      index = Math.max(0, Math.min(6, index));

      shade.set(`${x},${y}`, index);
      bodyCells.push([x, y]);
    }
  }

  /* 脸：两只三角眼 + 一张带两颗牙的咧嘴 */
  const eyeRows = [
    [-10, -19], [-9, -18], [-8, -17], [-7, -16], [-6, -15], [-5, -14], [-4, -13], [-3, -12],
  ];
  eyeRows.forEach(([y, from]) => {
    for (let x = from; x <= -8; x += 1) {
      face.add(`${x},${y}`);
      face.add(`${-x},${y}`);
    }
  });
  for (let x = -17; x <= 17; x += 1) {
    const bottom = 15 - 0.022 * x * x;
    const top = bottom - 5;
    for (let y = Math.ceil(top); y <= Math.floor(bottom); y += 1) {
      if (Math.abs(x) >= 3 && Math.abs(x) <= 4) continue; /* 两颗牙 */
      face.add(`${x},${y}`);
    }
  }

  const holeSet = new Set();
  const bodySet = new Set();
  bodyCells.forEach(([x, y]) => {
    const key = `${x},${y}`;
    if (face.has(key)) holeSet.add(key);
    else bodySet.add(key);
  });

  /* 逐格发 rect 会有两千多个节点、两百多 KB 字符串（首屏要解析）。
     这里按行做行程合并：同一行里连续同色的格子合成一个宽 rect，
     视觉完全一致，节点数降到原来的 1/5 左右。 */
  const emitRows = (rows, resolveFill) => {
    let output = '';
    rows.forEach((cells, y) => {
      cells.sort((a, b) => a.x - b.x);
      let runStart = null;
      let runFill = null;
      for (let i = 0; i < cells.length; i += 1) {
        const cell = cells[i];
        const fill = resolveFill(cell);
        if (runStart === null) {
          runStart = cell.x;
          runFill = fill;
        } else if (fill !== runFill || cell.x !== cells[i - 1].x + 1) {
          output += `<rect x="${pumpkinX + runStart}" y="${pumpkinY + y}" width="${cells[i - 1].x - runStart + 1}" height="1" fill="${runFill}"/>`;
          runStart = cell.x;
          runFill = fill;
        }
      }
      if (runStart !== null) {
        output += `<rect x="${pumpkinX + runStart}" y="${pumpkinY + y}" width="${cells[cells.length - 1].x - runStart + 1}" height="1" fill="${runFill}"/>`;
      }
    });
    return output;
  };

  const bodyRows = new Map();
  bodyCells.forEach(([x, y]) => {
    const key = `${x},${y}`;
    if (holeSet.has(key)) return;
    let index = shade.get(key);
    const touchingHole =
      holeSet.has(`${x + 1},${y}`) ||
      holeSet.has(`${x - 1},${y}`) ||
      holeSet.has(`${x},${y + 1}`) ||
      holeSet.has(`${x},${y - 1}`);
    if (touchingHole) index = 6; /* 镂空边缘补一圈最亮，做出「光从洞里出来」 */
    if (!bodyRows.has(y)) bodyRows.set(y, []);
    bodyRows.get(y).push({ x, fill: PALETTE.body[index] });
  });
  const bodySvg = emitRows(bodyRows, (cell) => cell.fill);

  const holeRows = new Map();
  holeSet.forEach((key) => {
    const [x, y] = key.split(',').map(Number);
    /* 洞底压一档暖色：让洞有厚度，而不是一块平白 */
    const fill = bodySet.has(`${x},${y + 1}`) ? PALETTE.holeDeep : PALETTE.hole;
    if (!holeRows.has(y)) holeRows.set(y, []);
    holeRows.get(y).push({ x, fill });
  });
  const holeSvg = emitRows(holeRows, (cell) => cell.fill);

  /* 紧贴轮廓外的一圈暖像素：像素画的「发光」靠边缘亮像素，不靠模糊 */
  const outlineRows = new Map();
  bodyCells.forEach(([x, y]) => {
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
      const nx = x + dx;
      const ny = y + dy;
      if (bodySet.has(`${nx},${ny}`)) return;
      if (!outlineRows.has(ny)) outlineRows.set(ny, []);
      outlineRows.get(ny).push({ x: nx, fill: 'rgba(255,150,60,0.34)' });
    });
  });
  const outlineSvg = emitRows(outlineRows, (cell) => cell.fill);

  parts.push(outlineSvg, bodySvg, holeSvg);

  /* 瓜蒂 */
  for (let y = -27; y <= -23; y += 1) {
    for (let x = 2; x <= 5; x += 1) {
      rect(pumpkinX + x, pumpkinY + y, 1, 1, x < 4 ? PALETTE.stem : PALETTE.stem2);
    }
  }
  rect(pumpkinX + 2, pumpkinY - 28, 2, 1, PALETTE.stem);
  rect(pumpkinX + 6, pumpkinY - 26, 1, 2, PALETTE.stem2);

  /* 蝙蝠：两帧扇翅 */
  const bat = (ox, oy, delay) => {
    let frameA = '';
    let frameB = '';
    BAT_A.forEach((row, ry) => {
      [...row].forEach((ch, rx) => {
        if (ch !== '#') return;
        frameA += `<rect x="${ox + rx}" y="${oy + ry}" width="1" height="1" fill="#08040E"/>`;
      });
    });
    BAT_B.forEach((row, ry) => {
      [...row].forEach((ch, rx) => {
        if (ch !== '#') return;
        frameB += `<rect x="${ox + rx}" y="${oy + ry}" width="1" height="1" fill="#08040E"/>`;
      });
    });
    parts.push(`<g class="gs-flap-a" style="animation-delay:${delay}s">${frameA}</g>`);
    parts.push(`<g class="gs-flap-b" style="animation-delay:${delay}s">${frameB}</g>`);
  };
  bat(Math.round(width * 0.63), 20, 0);
  bat(Math.round(width * 0.18), 60, 0.21);

  /* 火星 */
  for (let i = 0; i < 9; i += 1) {
    const x = pumpkinX - 30 + Math.floor(srnd() * 60);
    const y = 138 + Math.floor(srnd() * 10);
    const size = srnd() > 0.6 ? 2 : 1;
    const duration = (7 + srnd() * 6).toFixed(1);
    rect(x, y, size, size, '#FFC27A', ` class="gs-ember" style="animation-delay:${(srnd() * 9).toFixed(2)}s;animation-duration:${duration}s"`);
  }

  /* 暗角 */
  parts.push(
    '<defs><radialGradient id="gs-vig" cx="50%" cy="46%" r="72%">' +
      '<stop offset="45%" stop-color="rgba(0,0,0,0)"/>' +
      '<stop offset="100%" stop-color="rgba(4,1,8,.62)"/>' +
      '</radialGradient></defs>',
  );
  rect(0, 0, width, height, 'url(#gs-vig)');

  /* 动画写在 SVG 自带 <style> 里：这段 HTML 是 v-html 注入的，
     拿不到 scoped 的 data 属性，写进组件样式会整段失效。类名统一 gs- 前缀避免污染全站。 */
  const style = `<style>
    .gs-tw{animation:gsTw 3.6s steps(1,end) infinite}
    @keyframes gsTw{0%,100%{opacity:.18}50%{opacity:.95}}
    .gs-ember{animation:gsRise 9s steps(14,end) infinite}
    @keyframes gsRise{0%{transform:translateY(0);opacity:0}12%{opacity:.9}100%{transform:translateY(-46px);opacity:0}}
    .gs-flap-a{animation:gsFlapA .42s steps(1,end) infinite}
    .gs-flap-b{animation:gsFlapB .42s steps(1,end) infinite}
    @keyframes gsFlapA{0%,49.9%{opacity:1}50%,100%{opacity:0}}
    @keyframes gsFlapB{0%,49.9%{opacity:0}50%,100%{opacity:1}}
    .gs-drift{animation:gsDrift 52s steps(60,end) infinite}
    @keyframes gsDrift{0%{transform:translateX(0)}100%{transform:translateX(18px)}}
    @media (prefers-reduced-motion: reduce){
      .gs-tw,.gs-ember,.gs-flap-a,.gs-flap-b,.gs-drift{animation:none}
      .gs-flap-b{display:none}
    }
  </style>`;

  return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="100%" preserveAspectRatio="none" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${style}${parts.join('')}</svg>`;
}
