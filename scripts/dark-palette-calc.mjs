// Palette calculator for the BOHLITE Dark 2.0 proposal.
// Converts OKLCH -> sRGB hex and reports WCAG contrast ratios so every
// token ships with a measured number instead of a claim.
function oklchToHex(L, C, Hdeg) {
  const h = (Hdeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  let R = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  let G = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  let B = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  const gam = (c) => {
    const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, v)) * 255);
  };
  const out = [gam(R), gam(G), gam(B)];
  const clip = out.some((v, i) => {
    const raw = [R, G, B][i];
    return raw < 0 || raw > 1;
  });
  return { hex: '#' + out.map((v) => v.toString(16).padStart(2, '0')).join(''), clipped: clip };
}
function lum(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function ratio(fg, bg) {
  const a = lum(fg), b = lum(bg);
  return +(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2));
}
// Alpha compositing: a token declared as rgba(255,255,255,.x) over a surface.
function over(fgHex, alpha, bgHex) {
  const f = [1, 3, 5].map((i) => parseInt(fgHex.slice(i, i + 2), 16));
  const g = [1, 3, 5].map((i) => parseInt(bgHex.slice(i, i + 2), 16));
  return '#' + f.map((v, i) => Math.round(v * alpha + g[i] * (1 - alpha)).toString(16).padStart(2, '0')).join('');
}

const H = 264; // single neutral hue for the whole dark system

const surfaces = {
  'canvas        ': [0.165, 0.013],
  'surface-1     ': [0.207, 0.015],
  'surface-2     ': [0.248, 0.017],
  'surface-3     ': [0.292, 0.019],
  'surface-4     ': [0.340, 0.021],
};
const texts = {
  'text-1        ': [0.955, 0.006],
  'text-2        ': [0.822, 0.014],
  'text-3        ': [0.705, 0.020],
  'text-4 (faint) ': [0.625, 0.022],
};
const accents = {
  'brand         ': [0.720, 0.135, 244],
  'brand-soft    ': [0.845, 0.062, 244],
  'link          ': [0.775, 0.120, 236],
  'success       ': [0.760, 0.150, 155],
  'warning       ': [0.800, 0.145, 85],
  'danger        ': [0.665, 0.205, 22],
  'danger-soft   ': [0.790, 0.105, 20],
  'info          ': [0.745, 0.110, 232],
  'decor-violet  ': [0.730, 0.150, 300],
};

const S = {}, T = {};
for (const [k, [L, C]] of Object.entries(surfaces)) S[k.trim()] = oklchToHex(L, C, H);
for (const [k, [L, C]] of Object.entries(texts)) T[k.trim()] = oklchToHex(L, C, H);

const CANVAS = S['canvas'];
const SURF1 = S['surface-1'];
console.log('\n=== SURFACES (hue ' + H + ') ===');
for (const [k, v] of Object.entries(S)) console.log(k.padEnd(12), v.hex, v.clipped ? 'CLIPPED' : '', 'vs canvas ' + ratio(v.hex, CANVAS.hex).toFixed(2) + ':1');
console.log('\n=== TEXT on every surface ===');
for (const [k, v] of Object.entries(T)) {
  const row = Object.entries(S).map(([sk, sv]) => `${sk.slice(0,9)}:${ratio(v.hex, sv.hex).toFixed(2)}`);
  console.log(k.padEnd(16), v.hex.padEnd(9), row.join('  '), v.clipped ? 'CLIPPED' : '');
}
console.log('\n=== ACCENT / SEMANTIC on every surface ===');
for (const [k, v] of Object.entries(accents)) {
  const hex = oklchToHex(v[0], v[1], v[2]);
  const row = Object.entries(S).map(([sk, sv]) => `${sk.slice(0,9)}:${ratio(hex.hex, sv.hex).toFixed(2)}`);
  const large = Object.entries(S).map(([sk, sv]) => ratio(hex.hex, sv.hex)).sort((a, b) => a - b)[0];
  console.log(k.padEnd(15), hex.hex.padEnd(9), row.join('  '), 'min=' + large.toFixed(2), large >= 4.5 ? 'AA-text' : (large >= 3 ? 'AA-large/3:1 only' : 'FAIL'), hex.clipped ? 'CLIPPED' : '');
}
console.log('\n=== HAIRLINE / STATE-LAYER alpha ladder (effective contrast vs surface-1) ===');
for (const [label, [hex, alpha]] of Object.entries({
  'border-1  white .07': ['#ffffff', 0.07],
  'border-2  white .12': ['#ffffff', 0.12],
  'border-3  white .19': ['#ffffff', 0.19],
  'state-hover white .055': ['#ffffff', 0.055],
  'state-sel   white .09': ['#ffffff', 0.09],
  'state-press white .14': ['#ffffff', 0.14],
})) {
  const c = over(hex, alpha, SURF1.hex);
  console.log(label.padEnd(24), c, 'vs surface-1 ' + ratio(c, SURF1.hex).toFixed(2) + ':1');
}
console.log('\n=== LIGHT-MODE (current app) reference failures, for the report ===');
for (const [fg, bg, note] of [
  ['#71717a', '#252532', 'forum-dark muted on surface'],
  ['#6f7b8b', '#1a1a25', 'boh-text-muted on bg-tertiary'],
  ['#7a7a8a', '#222230', 'nav-label on bg-elevated'],
  ['#0071e3', '#17171e', 'brand blue (light value) on live home bg'],
  ['#6e6e73', '#1c1c24', 'liquid secondary on dark glass'],
  ['#52525b', '#12121a', 'post-detail scrollbar-hover on bg-secondary'],
  ['#8a919c', '#252532', 'liquid tertiary on strongest glass'],
]) console.log(' ', fg, 'on', bg, '=', ratio(fg, bg).toFixed(2) + ':1', note);

console.log('\n=== GLASS + TINT composites (what actually renders) ===');
const g1 = over('#14181f', 0.72, CANVAS.hex);      // glass-1 over canvas
const g2 = over('#1d2129', 0.80, CANVAS.hex);      // glass-2 over canvas
console.log('  glass-1 surface-1@72% over canvas  ->', g1, ' text-1 on it:', ratio(T['text-1'].hex, g1).toFixed(2));
console.log('  glass-2 surface-2@80% over canvas  ->', g2, ' text-1 on it:', ratio(T['text-1'].hex, g2).toFixed(2));
console.log('  overlay/popover surface-4@92%      ->', over('#323843', 0.92, CANVAS.hex));
for (const [n, [hex, alpha]] of Object.entries({
  'brand-tint   brand@14%': ['#4fadf3', 0.14],
  'success-tint succ@14%': ['#52cd86', 0.14],
  'warning-tint warn@14%': ['#e8b53b', 0.14],
  'danger-tint  dang@15%': ['#f84f57', 0.15],
})) {
  const c = over(hex, alpha, SURF1.hex);
  console.log(' ', n.padEnd(22), c, '| brand/semantic text on tint:',
    ratio(hex === '#4fadf3' ? '#4fadf3' : hex, c).toFixed(2), '| text-1 on tint:', ratio(T['text-1'].hex, c).toFixed(2));
}
console.log('  scrim rgba(4,6,9,.72) over canvas  ->', over('#040609', 0.72, CANVAS.hex));
console.log('\n=== Filled button: brand fill + ink text ===');
console.log('  text on brand fill   ', ratio('#08111c', '#4fadf3').toFixed(2), '| white on brand fill', ratio('#ffffff', '#4fadf3').toFixed(2));
console.log('  text on success fill ', ratio('#08111c', '#52cd86').toFixed(2), '| text on warning fill', ratio('#08111c', '#e8b53b').toFixed(2));
