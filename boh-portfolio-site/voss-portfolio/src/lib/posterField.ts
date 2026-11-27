const POSTER_VERTEX = `
precision highp float;
attribute vec2 aUv;
uniform vec3 uPosition;
uniform vec3 uRotation;
uniform vec2 uSize;
uniform vec2 uPointer;
uniform float uAspect;
uniform float uBend;
uniform float uTime;
uniform float uSeed;
varying vec2 vUv;
varying float vDepth;
varying float vLight;
void main() {
  vUv = aUv;
  vec3 p = vec3((aUv.x - 0.5) * uSize.x, (0.5 - aUv.y) * uSize.y, 0.0);
  float wave = aUv.x * 3.8 + aUv.y * 1.4 + uTime * 0.65 + uSeed;
  p.z += sin(wave) * uBend;
  p.x += sin(aUv.y * 3.14159) * uBend * 0.16;
  vLight = 0.96 + cos(wave) * uBend * 0.12;
  vec3 c = cos(uRotation), s = sin(uRotation);
  p = vec3(p.x, c.x * p.y - s.x * p.z, s.x * p.y + c.x * p.z);
  p = vec3(c.y * p.x + s.y * p.z, p.y, -s.y * p.x + c.y * p.z);
  p = vec3(c.z * p.x - s.z * p.y, s.z * p.x + c.z * p.y, p.z);
  p += uPosition;
  p.xy -= uPointer;
  vDepth = p.z;
  gl_Position = vec4(1.78 * p.x / uAspect, 1.78 * p.y, 1.006 * p.z - 0.602, p.z);
}`;

const POSTER_FRAGMENT = `
precision highp float;
uniform sampler2D uAtlas;
uniform vec2 uGrid;
uniform vec2 uAtlasSize;
uniform float uIndex;
uniform float uFlight;
uniform float uArrival;
varying vec2 vUv;
varying float vDepth;
varying float vLight;
void main() {
  vec2 cell = vec2(mod(uIndex, uGrid.x), floor(uIndex / uGrid.x));
  vec2 tile = uAtlasSize / uGrid;
  vec2 uv = (cell * tile + mix(tile * 0.005, tile * 0.995, vUv)) / uAtlasSize;
  vec3 color = texture2D(uAtlas, uv).rgb * vLight;
  float atmosphere = mix(1.0, 1.0 - smoothstep(28.0, 59.0, vDepth) * 0.82, uFlight);
  // View depth in alpha lets the lens soften the poster silhouettes as well as their content.
  gl_FragColor = vec4(color * atmosphere * uArrival, clamp(vDepth / 100.0, 0.003, 1.0));
}`;

const SCREEN_VERTEX = `
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const SCREEN_FRAGMENT = `
precision highp float;
uniform sampler2D uScene;
uniform vec2 uResolution;
uniform float uFlight;
uniform float uSpeed;
uniform float uWall;
varying vec2 vUv;
float coc(float encodedDepth) {
  if (encodedDepth < 0.001) return 0.0;
  float depth = encodedDepth * 100.0;
  return min(8.0, abs(1.0 - 12.0 / depth) * 7.0) * uFlight;
}
vec3 lens(vec2 uv, float strength) {
  vec2 direction = normalize((uv - 0.5) * vec2(0.6, 1.0) + vec2(0.0001));
  vec2 offset = direction * strength / uResolution;
  vec3 red = texture2D(uScene, uv + offset).rgb;
  vec3 green = texture2D(uScene, uv).rgb;
  vec3 blue = texture2D(uScene, uv - offset).rgb;
  return vec3(red.r, green.g, blue.b);
}
void main() {
  vec4 center = texture2D(uScene, vUv);
  if (uWall > 0.0) {
    vec3 color = center.rgb * 3.0;
    color /= 3.0;
    color *= 1.0 - smoothstep(0.3, 0.82, length(vUv - 0.5)) * 0.2;
    gl_FragColor = vec4(color, 1.0);
    return;
  }
  float centerCoc = coc(center.a);
  float edge = smoothstep(0.22, 0.68, length((vUv - 0.5) * vec2(1.0, 0.9)));
  float dispersion = (0.1 + edge * 3.0 + centerCoc * 0.12 + uSpeed * (0.4 + edge * 2.0)) * uFlight;
  vec3 color = lens(vUv, dispersion) * 3.0;
  float weight = 3.0;
  for (int i = 0; i < 24; i++) {
    float n = float(i) + 0.5;
    float radius = sqrt(n / 24.0) * 8.0;
    float angle = n * 2.399963;
    vec2 offset = vec2(cos(angle), sin(angle)) * radius;
    vec2 uv = vUv + offset / uResolution;
    vec4 tap = texture2D(uScene, uv);
    float tapCoc = coc(tap.a);
    float reach = max(centerCoc, tapCoc);
    float w = 1.0 - smoothstep(reach - 0.75, reach + 0.75, radius);
    if (center.a > 0.001 && tap.a > center.a + 0.015) w *= min(1.0, centerCoc / 2.0);
    color += lens(uv, dispersion) * w;
    weight += w;
  }
  color /= weight;
  color *= 1.0 - smoothstep(0.3, 0.82, length(vUv - 0.5)) * 0.2;
  gl_FragColor = vec4(color, 1.0);
}`;

type Atlas = { canvas: HTMLCanvasElement; count: number; columns: number; rows: number };
type Pointer = { x: number; y: number };

const clamp = (n: number) => Math.min(1, Math.max(0, n));
const smooth = (a: number, b: number, n: number) => {
  const t = clamp((n - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, n: number) => a + (b - a) * n;
const random = (n: number) => {
  const value = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
};

export function createPosterField(canvas: HTMLCanvasElement, atlas: Atlas) {
  const gl = canvas.getContext('webgl', {
    alpha: false,
    antialias: false,
    powerPreference: 'high-performance',
  });
  if (!gl) throw new Error('WebGL is unavailable');
  const shaders: WebGLShader[] = [];
  const programs: WebGLProgram[] = [];
  const buffers: WebGLBuffer[] = [];
  const textures: WebGLTexture[] = [];
  const framebuffer = gl.createFramebuffer();
  const depth = gl.createRenderbuffer();
  const dispose = () => {
    textures.forEach((texture) => gl.deleteTexture(texture));
    buffers.forEach((buffer) => gl.deleteBuffer(buffer));
    programs.forEach((program) => gl.deleteProgram(program));
    shaders.forEach((shader) => gl.deleteShader(shader));
    gl.deleteFramebuffer(framebuffer);
    gl.deleteRenderbuffer(depth);
  };
  const program = (vertex: string, fragment: string) => {
    const result = gl.createProgram();
    if (!result) throw new Error('Unable to allocate poster program');
    programs.push(result);
    for (const [type, source] of [
      [gl.VERTEX_SHADER, vertex],
      [gl.FRAGMENT_SHADER, fragment],
    ] as const) {
      const shader = gl.createShader(type);
      if (!shader) throw new Error('Unable to allocate poster shader');
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        throw new Error(gl.getShaderInfoLog(shader) || 'Poster shader failed');
      gl.attachShader(result, shader);
    }
    gl.linkProgram(result);
    if (!gl.getProgramParameter(result, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(result) || 'Poster program failed');
    return result;
  };
  const texture = () => {
    const result = gl.createTexture();
    if (!result) throw new Error('Unable to allocate poster texture');
    textures.push(result);
    gl.bindTexture(gl.TEXTURE_2D, result);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return result;
  };
  const buffer = (data: number[]) => {
    const result = gl.createBuffer();
    if (!result) throw new Error('Unable to allocate poster mesh');
    buffers.push(result);
    gl.bindBuffer(gl.ARRAY_BUFFER, result);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    return result;
  };
  try {
    if (!framebuffer || !depth) throw new Error('Unable to allocate poster scene');
    const cards = program(POSTER_VERTEX, POSTER_FRAGMENT);
    const screen = program(SCREEN_VERTEX, SCREEN_FRAGMENT);
    const cardUniforms = Object.fromEntries(
      [
        'uPosition',
        'uRotation',
        'uSize',
        'uPointer',
        'uAspect',
        'uBend',
        'uTime',
        'uSeed',
        'uAtlas',
        'uGrid',
        'uAtlasSize',
        'uIndex',
        'uFlight',
        'uArrival',
      ].map((name) => [name, gl.getUniformLocation(cards, name)]),
    );
    const screenUniforms = Object.fromEntries(
      ['uScene', 'uResolution', 'uFlight', 'uSpeed', 'uWall'].map((name) => [
        name,
        gl.getUniformLocation(screen, name),
      ]),
    );
    const points: number[] = [];
    const subdivisions = 12;
    for (let y = 0; y < subdivisions; y++) {
      for (let x = 0; x < subdivisions; x++) {
        const left = x / subdivisions,
          right = (x + 1) / subdivisions;
        const top = y / subdivisions,
          bottom = (y + 1) / subdivisions;
        points.push(left, top, right, top, left, bottom, left, bottom, right, top, right, bottom);
      }
    }
    const mesh = buffer(points);
    const quad = buffer([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
    const cardPosition = gl.getAttribLocation(cards, 'aUv');
    const screenPosition = gl.getAttribLocation(screen, 'aPosition');
    const atlasTexture = texture();
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas.canvas);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    const anisotropy = gl.getExtension('EXT_texture_filter_anisotropic');
    if (anisotropy)
      gl.texParameterf(
        gl.TEXTURE_2D,
        anisotropy.TEXTURE_MAX_ANISOTROPY_EXT,
        Math.min(4, gl.getParameter(anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT)),
      );
    const sceneTexture = texture();
    let aspect = 1;
    let mobile = false;
    let sized = false;
    let landingRanks: number[] = [];

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const scale = Math.min(window.devicePixelRatio || 1, 1.5, 1800 / Math.max(rect.width, 1));
      const width = Math.max(1, Math.round(rect.width * scale));
      const height = Math.max(1, Math.round(rect.height * scale));
      aspect = rect.width / Math.max(1, rect.height);
      mobile = rect.width < 700;
      const columns = mobile ? 7 : 11;
      const rows = mobile ? 9 : 7;
      const order = Array.from({ length: columns * rows }, (_, index) => ({
        index,
        distance:
          Math.abs((index % columns) - columns * 0.6) * 0.8 +
          Math.abs(Math.floor(index / columns) - rows * 0.62) +
          random(index + 11) * 0.35,
      })).sort((a, b) => a.distance - b.distance);
      landingRanks = [];
      order.forEach(({ index }, rank) => {
        landingRanks[index] = rank;
      });
      if (sized && canvas.width === width && canvas.height === height) return;
      canvas.width = width;
      canvas.height = height;
      sized = true;
      gl.bindTexture(gl.TEXTURE_2D, sceneTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sceneTexture, 0);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
        throw new Error('Poster scene is incomplete');
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    };
    resize();

    const draw = (
      progress: number,
      time: number,
      pointer: Pointer,
      speed: number,
      entrance: number,
    ) => {
      if (gl.isContextLost()) return;
      const spread = smooth(0.3, 0.62, progress);
      const flight = smooth(0.36, 0.66, progress);
      const travel = Math.max(0, progress - 0.42) * 80 + time * 0.65 * flight;
      const wallInfluence = 1 - smooth(0.04, 0.28, progress);
      const idleTime = Math.max(0, time - 2.1);
      const driftX = Math.sin(idleTime * 0.12) * 0.55;
      const driftY = Math.sin(idleTime * 0.09) * 0.4;
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.disable(gl.BLEND);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(cards);
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh);
      gl.enableVertexAttribArray(cardPosition);
      gl.vertexAttribPointer(cardPosition, 2, gl.FLOAT, false, 0, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, atlasTexture);
      gl.uniform1i(cardUniforms.uAtlas, 0);
      gl.uniform2f(cardUniforms.uGrid, atlas.columns, atlas.rows);
      gl.uniform2f(cardUniforms.uAtlasSize, atlas.canvas.width, atlas.canvas.height);
      gl.uniform1f(cardUniforms.uAspect, aspect);
      gl.uniform1f(cardUniforms.uTime, time);
      gl.uniform1f(cardUniforms.uFlight, flight);
      gl.uniform2f(
        cardUniforms.uPointer,
        pointer.x * mix(0.22, 0.85, spread),
        pointer.y * mix(0.15, 0.6, spread),
      );
      const columns = mobile ? 7 : 11;
      const rows = mobile ? 9 : 7;
      const count = columns * rows;
      const wallDepth = mobile ? 13 : 12.8;
      const wallSpacing = mobile ? 1.45 : 1.94;
      const wallWidth = mobile ? 1.25 : 1.72;
      const pitch = 0.1;
      const yaw = 0.65;
      const tilt = -0.08;
      for (let i = 0; i < count; i++) {
        const arrival =
          wallInfluence === 0
            ? 1
            : clamp((entrance * 2.1 - (landingRanks[i] / (count - 1)) * 1.45) / 0.65);
        if (arrival === 0) continue;
        const lift = (1 - arrival) ** 3 * wallInfluence;
        const seed = random(i + 3);
        const angle = i * 2.399963 + seed * 0.45;
        const radius = 4.4 + random(i + 37) * (mobile ? 7 : 10);
        const wallX =
          ((i % columns) - (columns - 1) / 2) * wallSpacing +
          driftX * wallInfluence +
          (seed - 0.5) * lift * 0.8;
        const wallY =
          (Math.floor(i / columns) - (rows - 1) / 2) * wallSpacing * 1.5 +
          driftY * wallInfluence +
          lift * 0.7;
        const wallZ = -2.8 * lift;
        const pitchedY = wallY * Math.cos(pitch) - wallZ * Math.sin(pitch);
        const rotatedX =
          wallX * Math.cos(yaw) +
          wallY * Math.sin(pitch) * Math.sin(yaw) +
          wallZ * Math.cos(pitch) * Math.sin(yaw);
        const wallCenterX = rotatedX * Math.cos(tilt) - pitchedY * Math.sin(tilt);
        const wallCenterY = rotatedX * Math.sin(tilt) + pitchedY * Math.cos(tilt);
        const wallCenterZ =
          wallDepth -
          wallX * Math.sin(yaw) +
          wallY * Math.sin(pitch) * Math.cos(yaw) +
          wallZ * Math.cos(pitch) * Math.cos(yaw);
        const flightDepth = 2.6 + ((((seed * 56 - travel) % 56) + 56) % 56);
        const flightX = Math.cos(angle) * radius * (mobile ? 0.62 : 1.24);
        const flightY = Math.sin(angle) * radius * 0.84;
        const x = mix(wallCenterX, flightX + Math.sin(time * 0.25 + i) * 0.22, spread);
        const y = mix(wallCenterY, flightY + Math.cos(time * 0.3 + i) * 0.25, spread);
        const z = mix(wallCenterZ, flightDepth, spread);
        const size = mix(wallWidth, 2.1 + random(i + 13) * 0.6, spread);
        gl.uniform3f(cardUniforms.uPosition, x, y, z);
        gl.uniform3f(
          cardUniforms.uRotation,
          mix(
            mix(0.12, pitch, wallInfluence) + lift * 0.55,
            Math.sin(seed * 12 + time * 0.13) * 0.38,
            spread,
          ),
          mix(
            mix(-0.14, yaw, wallInfluence) + lift * (seed - 0.5) * 0.5,
            Math.cos(seed * 9 + time * 0.17) * 0.58,
            spread,
          ),
          mix(tilt + lift * (seed - 0.5) * 0.3, Math.sin(seed * 7 + time * 0.09) * 0.55, spread),
        );
        gl.uniform2f(cardUniforms.uSize, size, size * 1.5);
        gl.uniform1f(
          cardUniforms.uBend,
          spread * (0.2 + seed * 0.15 + speed * 0.2) +
            Math.sin(arrival * Math.PI) * 0.25 * wallInfluence,
        );
        gl.uniform1f(cardUniforms.uArrival, smooth(0, 0.2, arrival));
        gl.uniform1f(cardUniforms.uSeed, seed * 12);
        gl.uniform1f(cardUniforms.uIndex, (i * 3 + Math.floor(i / columns)) % atlas.count);
        gl.drawArrays(gl.TRIANGLES, 0, points.length / 2);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.disable(gl.DEPTH_TEST);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(screen);
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.enableVertexAttribArray(screenPosition);
      gl.vertexAttribPointer(screenPosition, 2, gl.FLOAT, false, 0, 0);
      gl.bindTexture(gl.TEXTURE_2D, sceneTexture);
      gl.uniform1i(screenUniforms.uScene, 0);
      gl.uniform2f(screenUniforms.uResolution, canvas.width, canvas.height);
      gl.uniform1f(screenUniforms.uFlight, flight);
      gl.uniform1f(screenUniforms.uSpeed, speed);
      gl.uniform1f(screenUniforms.uWall, wallInfluence);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };
    return { draw, resize, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
