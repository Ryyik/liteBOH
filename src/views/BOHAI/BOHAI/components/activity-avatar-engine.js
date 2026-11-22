/**
 * activity-avatar-engine.js — 活动行「角色状态机」引擎（2026-11-21 用户口径）
 *
 * 口径来源：Grok Bot 2026-09 官方设计（x.ai/news/designing-grok-bot，"The avatar now
 * shows what the Bot is doing as well as which Bot it is"）+ 社区逆向测量
 * （ArvinYin1/grokbot-animation-anatomy、jeremy-prt/bloub）：
 *   · 身体 = 近完美圆形/方块头的深色填充形，眼睛 = 两只亮色形状独立变形
 *   · 眨眼 0.26s、45% 相位全闭；切换 = 指数缓动不过冲（"body never overshoots"）
 *   · 静止的生命感 = 视线漂移 + 眨眼（"The life is gaze drift and blinking"）
 *   · 状态间全参数连续 morph，无硬切；否决三点动画（分不清工作/卡住）与逐步文字
 *
 * 本引擎 = Grok 状态机 × BOH MC 主题皮肤（用户口径）：
 *   · 等距方块头（正面/顶面/侧面三灰度面）+ 掉落物式旋转浮动
 *   · 低帧率步进（时间量化 ~10fps —— MC sprite 动画的灵魂）
 *   · 像素方眼（8 格脸）+ 像素嘴（flat/⌣/∩）+ 方块破裂粒子 + 受伤反色闪
 *   · 纯黑白：--ink 身体 / --card 眼睛（零彩色，2026-11-21 用户口径）
 *
 * 边界：
 *   · 框架无关（不 import vue）—— BohActivityAvatar.vue 薄壳管挂载/降级/清理
 *   · 状态由壳层喂：BOH 活动阶段 → STAGE_STATE 映射（本文件唯一真源），引擎只管演
 *   · reduced-motion 不归引擎管：壳层直接 v-if 摘掉 canvas
 *   · 颜色恒定不随主题反转（黑身白五官），引擎不读任何 CSS 变量
 */

/* 六个角色状态：目标参数 + hover 动作文（action 由壳层用于 aria/tooltip） */
export const AVATAR_STATES = {
  idle: {
    action: '待命中',
    eyeH: 1.0,
    eyeW: 1.0,
    tilt: 0,
    energy: 0.15,
    happy: 0,
    gaze: 'drift',
    yaw: 0,
    mouthW: 2,
    mouthOpen: 0.12,
    mouthCurve: 'flat',
  },
  thinking: {
    action: '正在思考',
    eyeH: 0.5, // round(2×0.5)=1 格 ⇒ 眯成 2×1 横缝（眼形就是表情；3 格宽会在中心合体成通栏）
    eyeW: 1.0,
    tilt: 8,
    energy: 0.5,
    happy: 0,
    gaze: 'think',
    yaw: 0.55,
    mouthW: 1,
    mouthOpen: 0.1,
    mouthCurve: 'flat',
  },
  working: {
    action: '正在执行',
    eyeH: 1.35, // round(2×1.35)=3 格 ⇒ 睁大
    eyeW: 1.0,
    tilt: 0,
    energy: 1,
    happy: 0,
    gaze: 'scan',
    yaw: 0,
    mouthW: 2,
    mouthOpen: 0.9,
    mouthCurve: 'flat',
  },
  waiting: {
    action: '等待输入',
    eyeH: 0.45, // round(2×0.45)=1 格 ⇒ 半闭
    eyeW: 1.0,
    tilt: -2,
    energy: 0.25,
    happy: 0,
    gaze: 'up',
    yaw: -0.25,
    mouthW: 3,
    mouthOpen: 0.08,
    mouthCurve: 'flat',
  },
  blocked: {
    action: '需要帮助',
    eyeH: 0.8,
    eyeW: 1.1,
    tilt: -6,
    energy: 0.3,
    happy: 0,
    gaze: 'down',
    yaw: -0.4,
    mouthW: 3,
    mouthOpen: 0.15,
    mouthCurve: 'frown',
  },
  done: {
    action: '已完成',
    eyeH: 1.0,
    eyeW: 1.0,
    tilt: 0,
    energy: 0.4,
    happy: 1,
    gaze: 'center',
    yaw: 0,
    mouthW: 3,
    mouthOpen: 0.5,
    mouthCurve: 'smile',
  },
  /* sleeping：小方挂件长时间无操作的待机态（眼闭合）——挂件专用，
     不在 STAGE_STATE 映射里（BOH 阶段机不产出它） */
  sleeping: {
    action: '睡眠中',
    eyeH: 0.12,
    eyeW: 1.0,
    tilt: 0,
    energy: 0.05,
    happy: 0,
    gaze: 'center',
    yaw: 0,
    mouthW: 2,
    mouthOpen: 0.05,
    mouthCurve: 'flat',
  },
};

/**
 * BOH 活动阶段 → 角色状态（唯一映射真源）。
 * 覆盖 resolveBohActivityStage 的全部非空产出（boh-activity.js）——
 * web-results/community 还在跑工具 ⇒ working；thinking 对号入座。
 */
export const STAGE_STATE = {
  'web-searching': 'working',
  'web-results': 'working',
  community: 'working',
  thinking: 'thinking',
  answering: 'working',
};

export const DEFAULT_STATE = 'idle';

/* MC 面纹理噪点格（8×8 网格坐标；固定值 ⇒ 不随帧闪烁；
   只撒顶/底两行，避开眼（2.5-5.5 行）与嘴（6.4-7.4 行）区域） */
const TEX_SPECKLES = [
  [0, 0],
  [2, 0],
  [5, 0],
  [7, 0],
  [1, 1],
  [6, 1],
  [1, 7],
  [4, 7],
  [6, 7],
];

const rand = (a, b) => a + Math.random() * (b - a);
/* 指数缓动因子：帧率无关、纯收敛不过冲（"body never overshoots"） */
const easeK = (dt, rate) => 1 - Math.exp(-dt * rate);

/**
 * @param {{
 *   canvas: HTMLCanvasElement,
 *   size?: number,
 *   onState?: (state: string) => void,
 * }} opts
 * @returns {{ setState: (s: string) => void,
 *             pause: () => void, resume: () => void, destroy: () => void }}
 */
export const createAvatarEngine = ({ canvas, size = 28, onState }) => {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const R = size * 0.42; // 头占比提升：表情/眼嘴在行内尺寸下才可读（2026-11-22 用户口径）
  const cx = size / 2;
  const cy = size / 2;

  /* 活参数（全部向状态目标指数缓动 —— 状态间无硬切的实现方式） */
  const P = {
    eyeH: 1,
    eyeW: 1,
    tilt: 0,
    energy: 0.15,
    happy: 0,
    gx: 0,
    gy: 0,
    yaw: 0,
    mouthOpen: 0.1,
    mouthW: 2,
  };
  let stateName = DEFAULT_STATE;
  let blinkP = 1; // 1 = 睁着；0..1 = 眨眼进行中
  let nextBlink = 1.2;
  let doubleBlink = 0;
  let saccadeAt = 0;
  let gazeTarget = { x: 0, y: 0 };
  let bobImpulse = 0;
  let parts = []; // MC 方块碎粒
  let flashT = 0; // 受伤反色闪倒计时
  let gazeOverride = null; // 外部视线注入（挂件眼神跟随）：{x, y} ∈ [-1, 1]，null = 关
  let gazeDraw = { x: 0, y: 0 }; // 上次实际绘制的视线偏移（半格量化 + 迟滞防抖）
  let spawnAt = 0;
  let raf = 0;
  let last = 0;
  let paused = true;
  let t = 0;

  /* 颜色恒定（2026-11-22 用户口径「表情不应该是白色的吗」）：Grok 同款 ——
     黑色身体 + 白色表情，**不随明暗主题反转**。暗色页面上靠三面灰度差 + 白五官立住
     （Grok 的黑 blob 在暗色底上就是这个原理）。全部为引擎内常量，不读 CSS 变量。 */
  const bodyCol = '#1d1d1f'; // 身体恒近黑
  const eyeCol = '#ffffff'; // 表情恒白（眼/嘴）
  const faceTop = '#45454a'; // 顶面（三面中最亮）
  const faceSide = '#2e2e33'; // 侧面
  const partCol = '#5a5a60'; // 方块碎粒
  const texCol = '#3d3d42'; // 面纹理噪点

  function setState(s) {
    if (!AVATAR_STATES[s] || stateName === s) return;
    stateName = s;
    if (s === 'done') {
      bobImpulse = 1;
      spawnBurst();
    }
    if (s === 'blocked') flashT = 0.09;
    if (onState) onState(s);
  }

  /* MC 方块破裂粒子：方块边缘溅出灰阶小方块，带重力 */
  function spawnBurst() {
    for (let i = 0; i < 12; i += 1) {
      parts.push({
        x: cx + rand(-R * 0.5, R * 0.5),
        y: cy - R * 0.6,
        vx: rand(-40, 40),
        vy: rand(-90, -30),
        life: rand(0.4, 0.7),
        age: 0,
        cell: rand(1.5, 2.5),
      });
    }
  }
  function spawnChip() {
    parts.push({
      x: cx + rand(-R * 0.5, R * 0.5),
      y: cy + R * 0.55,
      vx: rand(-18, 18),
      vy: rand(-55, -25),
      life: rand(0.3, 0.5),
      age: 0,
      cell: rand(1.2, 2),
    });
  }

  function updateGaze(dt, now) {
    const g = AVATAR_STATES[stateName].gaze;
    const reach = R * 0.16;
    let tx = 0;
    let ty = 0;
    if (gazeOverride && (g === 'drift' || g === 'center' || g === 'think')) {
      /* 眼神跟随：挂件把鼠标相对方向喂进来（归一化 [-1,1]） */
      tx = gazeOverride.x * reach * 0.8;
      ty = gazeOverride.y * reach * 0.8;
    } else if (g === 'drift') {
      if (now > saccadeAt) {
        gazeTarget = { x: rand(-1, 1), y: rand(-0.6, 0.6) };
        saccadeAt = now + rand(900, 2200);
      }
      tx = gazeTarget.x * reach;
      ty = gazeTarget.y * reach;
    } else if (g === 'think') {
      const ph = Math.sin(t * 1.6);
      tx = ph * reach * 0.9 + Math.sin(t * 9) * reach * 0.06;
      ty = -reach * 0.75 + Math.cos(t * 7) * reach * 0.08;
    } else if (g === 'scan') {
      tx = Math.sin(t * 6.5) * reach;
      ty = reach * 0.18 + Math.sin(t * 13) * reach * 0.1;
    } else if (g === 'up') {
      tx = Math.sin(t * 0.7) * reach * 0.4;
      ty = -reach * 0.95 + Math.sin(t * 1.1) * reach * 0.12;
    } else if (g === 'down') {
      tx = -reach * 0.5 + Math.sin(t * 0.9) * reach * 0.15;
      ty = reach * 0.7;
    }
    const k = easeK(dt, 9);
    P.gx += (tx - P.gx) * k;
    P.gy += (ty - P.gy) * k;
  }

  function updateBlink(dt) {
    if (blinkP < 1) {
      blinkP += dt / 0.26;
      if (blinkP >= 1) {
        const base = AVATAR_STATES[stateName].gaze === 'scan' ? rand(1.4, 2.6) : rand(2.2, 4.6);
        if (doubleBlink > 0) {
          doubleBlink -= 1;
          nextBlink = 0.12;
        } else {
          nextBlink = base;
          if ((stateName === 'thinking' || stateName === 'working') && Math.random() < 0.3) {
            doubleBlink = 1;
          }
        }
        blinkP = 1;
      }
    } else {
      nextBlink -= dt;
      if (nextBlink <= 0) blinkP = 0;
    }
    /* openAmt 不单独存：MC 皮肤的眼睛阶梯化用 blinkStep（见 drawMC），
       平滑 open 值只在原版圆皮肤里才需要 */
  }

  function tick(now) {
    if (paused) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t += dt;
    const T = AVATAR_STATES[stateName];

    const k1 = easeK(dt, 8);
    const k2 = easeK(dt, 5);
    P.eyeH += (T.eyeH - P.eyeH) * k1;
    P.eyeW += (T.eyeW - P.eyeW) * k1;
    P.happy += (T.happy - P.happy) * k1;
    P.tilt += ((T.tilt * Math.PI) / 180 - P.tilt) * k2;
    P.energy += (T.energy - P.energy) * k2;
    P.yaw += (T.yaw - P.yaw) * k2;
    P.mouthOpen += (T.mouthOpen - P.mouthOpen) * k1;
    P.mouthW += (T.mouthW - P.mouthW) * k1;

    updateGaze(dt, now);
    updateBlink(dt);

    bobImpulse *= Math.pow(0.02, dt);
    if (flashT > 0) flashT -= dt;

    /* working：周期性溅方块碎粒（MC 破坏方块的粒子语言） */
    if (stateName === 'working' && t > spawnAt) {
      spawnAt = t + 0.4;
      spawnChip();
      spawnChip();
    }

    const e = P.energy;
    const bobY = Math.sin(t * 9) * R * 0.055 * e - bobImpulse * R * 0.16;
    const squash = 1 + 0.02 * Math.sin(t * 2) * (1 - e) + 0.05 * e * Math.sin(t * 9);

    for (const pt of parts) {
      pt.age += dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vy += 220 * dt;
    }
    parts = parts.filter((pt) => pt.age < pt.life);

    draw(bobY, squash);
    raf = requestAnimationFrame((n) => tick(n));
  }

  function drawMC(bobY, squash) {
    const S = R * 1.8; // 方块头占画布 ~65%（28→32px 尺寸下表情要有足够像素）
    const d = S * 0.3;
    const CELL = S / 8; // 8 格脸（MC 贴图网格）
    /* 低帧率步进：MC sprite 的灵魂 —— 绘制时间全部量化到 10fps */
    const tq = Math.floor(t * 10) / 10;
    const idleYaw = Math.sin(tq * 2.2) * 0.18 * (0.4 + P.energy);
    const workYaw = stateName === 'working' ? Math.sin(tq * 18) * 0.1 : 0;
    const yaw = P.yaw + idleYaw + workYaw;
    const floatY = Math.round(Math.sin(tq * 2.2) * CELL * 0.5);

    ctx.save();
    ctx.translate(cx, cy + bobY + floatY);
    ctx.rotate(P.tilt * 0.4);
    ctx.scale(1 / Math.sqrt(squash), squash);

    const flash = flashT > 0;
    const frontCol = flash ? eyeCol : bodyCol;
    const topCol = flash ? faceSide : faceTop;
    const sideCol = flash ? bodyCol : faceSide;
    const eyeColFlash = flash ? bodyCol : eyeCol;

    /* 三面：正面 + 顶面 + 露出的侧面（oblique 投影，yaw 决定露出哪侧） */
    const offX = yaw * d;
    const offY = -d * 0.55;
    const h = S / 2;
    const g0 = S / 8;
    ctx.fillStyle = frontCol;
    ctx.fillRect(-h, -h, S, S);
    /* MC 面纹理：固定位置的灰阶噪点格（确定性，不随帧闪） */
    if (!flash) {
      ctx.fillStyle = texCol;
      for (const [col, row] of TEX_SPECKLES) {
        ctx.fillRect(-h + col * g0, -h + row * g0, g0, g0);
      }
    }
    ctx.fillStyle = topCol;
    ctx.beginPath();
    ctx.moveTo(-h, -h);
    ctx.lineTo(h, -h);
    ctx.lineTo(h + offX, -h + offY);
    ctx.lineTo(-h + offX, -h + offY);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = sideCol;
    ctx.beginPath();
    if (offX >= 0) {
      ctx.moveTo(h, -h);
      ctx.lineTo(h + offX, -h + offY);
      ctx.lineTo(h + offX, h + offY);
      ctx.lineTo(h, h);
    } else {
      ctx.moveTo(-h, -h);
      ctx.lineTo(-h + offX, -h + offY);
      ctx.lineTo(-h + offX, h + offY);
      ctx.lineTo(-h, h);
    }
    ctx.closePath();
    ctx.fill();

    /* 像素眼：8 格脸网格，**眼形随状态量化成整格** —— 小尺寸下「眼形变化」就是
       表情本身（28px 上 0.3 格的细线画不出来，2026-11-22 用户报「看不到表情」）：
       idle 2×2 / thinking 3×1 眯缝 / working 2×3 睁大 / waiting 2×1 半闭。
       眨眼阶梯化 3 帧；happy → 像素「∩」笑眼 */
    const g = CELL;
    const blinkStep = blinkP < 1 ? Math.floor(blinkP * 3) : -1;
    /* 视线偏移 = 半格量化 + 迟滞（2026-11-22 用户报障「hover 狂闪」）：
       眼神跟随的目标随鼠标微动连续变化，直接 round 会在 0.5 格边界上反复横跳
       （每跳 = g/2 的整格位移，行内尺寸下就是狂闪）。死区 1.2 半格：原始值移出
       上次绘制位 ±1.2 半格才更新 ⇒ 阶梯感保留、抖动消失 */
    const rawGy = P.gy / g;
    const rawGx = P.gx / g;
    if (Math.abs(rawGy * 2 - gazeDraw.y) > 1.2) gazeDraw.y = Math.round(rawGy * 2) / 2;
    if (Math.abs(rawGx * 2 - gazeDraw.x) > 1.2) gazeDraw.x = Math.round(rawGx * 2) / 2;
    const gy = gazeDraw.y * g * 0.5;
    const gx = gazeDraw.x * g * 0.5;
    const eyeY = -g * 1.5 + gy;
    const happyOn = P.happy > 0.5;
    const lidPad = stateName === 'waiting' || stateName === 'blocked' ? g * 0.5 : 0;
    const ehCells = Math.max(1, Math.min(3, Math.round(2 * P.eyeH)));
    const ewCells = Math.max(2, Math.min(3, Math.round(2 * P.eyeW)));
    for (const side of [-1, 1]) {
      const exx = Math.round(side * g * 1.5 - (ewCells * g) / 2 + gx);
      ctx.fillStyle = eyeColFlash;
      if (happyOn) {
        const bx = Math.round(side * g * 1.5 - g * 1.5 + gx);
        const by = eyeY + g * 0.5;
        ctx.fillRect(bx, by, g, g);
        ctx.fillRect(bx + g * 2, by, g, g);
        ctx.fillRect(bx + g, by - g, g, g);
      } else if (blinkStep === 1) {
        ctx.fillRect(exx, eyeY + (ehCells * g) / 2 - g * 0.15, ewCells * g, Math.max(1, g * 0.3));
      } else {
        const half = blinkStep === 0 || blinkStep === 2;
        const hh = Math.max(g * 0.6, ehCells * g * (half ? 0.5 : 1) - lidPad);
        ctx.fillRect(exx, eyeY + lidPad, ewCells * g, hh);
      }
    }

    /* 像素嘴：宽度/开合随状态缓动（flat / ⌣笑 / ∩苦），量化到网格 */
    const mouthW = Math.max(1, Math.round(P.mouthW));
    const openCells = P.mouthOpen > 0.55 ? 2 : P.mouthOpen > 0.3 ? 1 : 0;
    const curve = happyOn ? 'smile' : stateName === 'blocked' ? 'frown' : 'flat';
    const mw = mouthW * g;
    const mx0 = Math.round(-mw / 2 + gx * 0.5);
    const my0 = Math.round(g * 2.4 + gy * 0.5);
    const lineH = g; // 整格高度：0.3 格细线在行内尺寸下画不出来（2026-11-22 实测翻车）
    ctx.fillStyle = eyeColFlash;
    if (curve === 'smile') {
      ctx.fillRect(mx0, my0 - g, g, lineH);
      ctx.fillRect(mx0 + mw - g, my0 - g, g, lineH);
      ctx.fillRect(mx0 + g * 0.5, my0, mw - g, lineH);
      if (openCells > 0) {
        ctx.fillRect(mx0 + g * 0.5, my0 + g, mw - g, lineH * 0.8);
      }
    } else if (curve === 'frown') {
      ctx.fillRect(mx0, my0, g, lineH);
      ctx.fillRect(mx0 + mw - g, my0, g, lineH);
      ctx.fillRect(mx0 + g * 0.5, my0 - g, mw - g, lineH);
      if (openCells > 0) {
        ctx.fillRect(mx0 + g * 0.5, my0 + g, mw - g, lineH * 0.6);
      }
    } else {
      ctx.fillRect(mx0, my0, mw, lineH);
      if (openCells > 0) {
        ctx.fillRect(mx0 + g * 0.25, my0 + g, mw - g * 0.5, lineH * (openCells === 2 ? 1 : 0.6));
      }
    }
    ctx.restore();

    /* 方块碎粒（渐隐） */
    ctx.fillStyle = partCol;
    for (const pt of parts) {
      ctx.globalAlpha = Math.max(0, 1 - pt.age / pt.life);
      ctx.fillRect(
        Math.round(pt.x) - pt.cell / 2,
        Math.round(pt.y) - pt.cell / 2,
        pt.cell,
        pt.cell,
      );
    }
    ctx.globalAlpha = 1;
  }

  function draw(bobY, squash) {
    ctx.clearRect(0, 0, size, size);
    drawMC(bobY, squash);
  }

  function tickStart(now) {
    last = now;
    raf = requestAnimationFrame((n) => tick(n));
  }

  function pause() {
    paused = true;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function resume() {
    if (!paused || raf) return;
    paused = false;
    tickStart(performance.now());
  }

  /** 关动效静帧：画一帧当前状态（reduce-motion / 挂件定格用） */
  function renderStatic() {
    draw(0, 1); // 眼睛开合由 blinkP 决定（当前值即当前帧）
  }

  /** 外部视线注入：挂件眼神跟随用（{x,y} ∈ [-1,1] 相对脸心方向；null 关闭） */
  function setGazeTarget(v) {
    gazeOverride = v && {
      x: Math.max(-1, Math.min(1, v.x)),
      y: Math.max(-1, Math.min(1, v.y)),
    };
  }

  resume();
  return {
    setState,
    renderStatic,
    setGazeTarget,
    burst: spawnBurst, // 顶部爆粒（庆祝/摸头/落地反馈）
    pause,
    resume,
    destroy: pause,
  };
};
