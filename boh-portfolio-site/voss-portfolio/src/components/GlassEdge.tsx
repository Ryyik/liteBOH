import { useEffect, useRef, type RefObject } from 'react'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`

const FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uAtlas;
uniform vec2 uView;
uniform vec2 uCard;
uniform vec2 uAtlasSize;
uniform float uLeft;
uniform float uTop;
uniform float uGap;
uniform float uCount;
uniform vec2 uLens;
uniform vec2 uLift;
uniform float uTaps;

vec4 scene(vec2 p) {
  float column = floor((p.x - uLeft) / (uCard.x + uGap));
  vec2 local = vec2(p.x - uLeft - column * (uCard.x + uGap), p.y);
  if (column < 0.0 || column >= uCount) return vec4(0.0);
  vec2 q = abs(local - uCard * 0.5) - uCard * 0.5 + 2.0;
  float distance = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 2.0;
  float cover = 1.0 - smoothstep(-0.7, 0.7, distance);
  vec2 uv = clamp(local / uCard, 0.0, 1.0);
  float tile = uAtlasSize.y / uCount;
  uv = vec2(
    (2.0 + uv.x * (uAtlasSize.x - 4.0)) / uAtlasSize.x,
    (column * tile + 2.0 + uv.y * (tile - 4.0)) / uAtlasSize.y
  );
  return vec4(texture2D(uAtlas, uv).rgb, cover);
}

vec2 roll(vec2 p) {
  float side = p.x < uView.x * 0.5 ? -1.0 : 1.0;
  float lens = side < 0.0 ? uLens.x : uLens.y;
  float rim = side < 0.0 ? p.x : uView.x - p.x;
  float edge = clamp(1.0 - rim / lens, 0.0, 1.0);
  float angle = asin(edge * sin(1.42));
  float depth = (1.0 - cos(angle)) / (1.0 - cos(1.42));
  float arc = lens * (1.0 - angle / 1.42);
  float x = side < 0.0 ? arc : uView.x - arc;
  float lift = side < 0.0 ? uLift.x : uLift.y;
  float magnification = 1.0 + lift / uCard.y * depth;
  float anchor = side < 0.0 ? uTop : uTop + uCard.y;
  return vec2(
    mix(p.x, x, smoothstep(0.0, 0.45, edge)),
    (p.y - anchor) / magnification + (side < 0.0 ? 0.0 : uCard.y)
  );
}

void main() {
  vec2 p = vUv * uView;
  float side = p.x < uView.x * 0.5 ? -1.0 : 1.0;
  float lens = side < 0.0 ? uLens.x : uLens.y;
  float rim = side < 0.0 ? p.x : uView.x - p.x;
  float edge = clamp(1.0 - rim / lens, 0.0, 1.0);
  float height = clamp((p.y - uTop) / uCard.y, 0.0, 1.0);
  float corner = smoothstep(0.18, 1.0, side < 0.0 ? height : 1.0 - height);
  float scatter = pow(edge, 1.35) * mix(0.12, 1.0, corner);
  if (scatter < 0.002) {
    gl_FragColor = scene(roll(p));
    return;
  }
  float dispersion = scatter * min(lens * 0.075, 24.0);
  float blur = scatter * min(lens * 0.035, 12.0);
  vec2 refraction = normalize(vec2(side * 0.65, -side));
  vec3 color = vec3(0.0);
  vec3 coverage = vec3(0.0);
  vec3 weights = vec3(0.0);
  for (int i = 0; i < 21; i++) {
    float index = float(i);
    if (index >= uTaps) break;
    float wavelength = mod(index, 7.0) / 6.0;
    float radius = sqrt((index + 0.5) / 21.0);
    vec2 aperture = vec2(cos(index * 2.399963), sin(index * 2.399963)) * radius * blur;
    vec2 offset = aperture + refraction * (wavelength - 0.5) * dispersion * 2.0;
    vec3 weight = max(vec3(0.0), 1.0 - abs(vec3(0.0, 0.5, 1.0) - wavelength) * 2.0);
    vec4 sampleColor = scene(roll(p + offset));
    color += sampleColor.rgb * sampleColor.a * weight;
    coverage += sampleColor.a * weight;
    weights += weight;
  }
  color /= weights;
  coverage /= weights;
  float alpha = max(coverage.r, max(coverage.g, coverage.b));
  if (alpha < 0.001) discard;
  color /= alpha;
  float gloss = exp(-pow((edge - 0.83) / 0.075, 2.0));
  color *= 1.0 - pow(edge, 3.0) * 0.17;
  color += vec3(0.86, 0.94, 1.0) * gloss * 0.085;
  gl_FragColor = vec4(color, alpha);
}`

type Props = {
  viewport: RefObject<HTMLDivElement>
  track: RefObject<HTMLDivElement>
}

export function GlassEdge({ viewport, track }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const reduced = usePrefersReducedMotion()

  useEffect(() => {
    if (reduced) return
    const canvas = ref.current
    const vp = viewport.current
    const tr = track.current
    const stage = vp?.parentElement
    if (!canvas || !vp || !tr || !stage) return
    const images = Array.from(tr.querySelectorAll('img'))
    const gl = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: false })
    if (!gl || !images.length) return

    const setup = () => {
      let alive = true
      let frame = 0
      let loaded = false
      let visible = true
      let gap = 24
      let lastLeft = Number.NaN
      const shaders: WebGLShader[] = []
      const program = gl.createProgram()
      const buffer = gl.createBuffer()
      const texture = gl.createTexture()
      const uniforms: Record<string, WebGLUniformLocation | null> = {}

      const draw = () => {
        frame = 0
        if (!alive || !loaded || !visible || gl.isContextLost()) return
        const rect = canvas.getBoundingClientRect()
        const first = images[0].getBoundingClientRect()
        const step = Math.abs(first.left - lastLeft)
        lastLeft = first.left
        // Fast motion hides both sparse sampling and lower internal resolution; settle frames redraw full quality.
        const scale = step > 10 ? 0.7 : 1
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5) * scale
        const width = Math.round(rect.width * dpr)
        const height = Math.round(rect.height * dpr)
        if (!width || !height) return
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width
          canvas.height = height
          gap = parseFloat(getComputedStyle(tr).columnGap) || gap
        }
        gl.viewport(0, 0, width, height)
        gl.clear(gl.COLOR_BUFFER_BIT)
        gl.useProgram(program)
        gl.uniform2f(uniforms.uView, rect.width, rect.height)
        gl.uniform2f(uniforms.uCard, first.width, first.height)
        gl.uniform1f(uniforms.uLeft, first.left - rect.left)
        gl.uniform1f(uniforms.uTop, first.top - rect.top)
        gl.uniform1f(uniforms.uGap, gap)
        gl.uniform2f(uniforms.uLens, Math.min(rect.width * 0.32, 510), Math.min(rect.width * 0.16, 250))
        gl.uniform2f(uniforms.uLift, Math.max(0, rect.bottom - first.bottom - 40), Math.max(0, first.top - rect.top - 28))
        gl.uniform1f(uniforms.uTaps, step > 14 ? 8 : step > 5 ? 13 : 21)
        gl.drawArrays(gl.TRIANGLES, 0, 6)
        if (stage.dataset.glass !== 'ready') stage.dataset.glass = 'ready'
      }
      const schedule = () => {
        if (!frame && alive) frame = requestAnimationFrame(draw)
      }
      const resize = new ResizeObserver(schedule)
      const observer = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting
        if (visible) schedule()
      }, { rootMargin: '150px' })

      const dispose = () => {
        if (!alive) return
        alive = false
        cancelAnimationFrame(frame)
        resize.disconnect()
        observer.disconnect()
        vp.removeEventListener('scroll', schedule)
        tr.removeEventListener('gallery:move', schedule)
        if (!gl.isContextLost()) {
          gl.deleteTexture(texture)
          gl.deleteBuffer(buffer)
          gl.deleteProgram(program)
          shaders.forEach((shader) => gl.deleteShader(shader))
        }
        delete stage.dataset.glass
      }

      try {
        if (!program || !buffer || !texture) throw new Error('Unable to allocate gallery renderer')
        const compile = (type: number, source: string) => {
          const shader = gl.createShader(type)
          if (!shader) throw new Error('Unable to allocate gallery shader')
          shaders.push(shader)
          gl.shaderSource(shader, source)
          gl.compileShader(shader)
          if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || 'Gallery shader compilation failed')
          gl.attachShader(program, shader)
        }
        compile(gl.VERTEX_SHADER, VERT)
        compile(gl.FRAGMENT_SHADER, FRAG)
        gl.linkProgram(program)
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'Gallery shader link failed')
        gl.useProgram(program)
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW)
        const position = gl.getAttribLocation(program, 'aPos')
        gl.enableVertexAttribArray(position)
        gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
        for (const name of ['uAtlas', 'uView', 'uCard', 'uAtlasSize', 'uLeft', 'uTop', 'uGap', 'uCount', 'uLens', 'uLift', 'uTaps']) {
          uniforms[name] = gl.getUniformLocation(program, name)
        }
        gl.clearColor(0, 0, 0, 0)
        gl.bindTexture(gl.TEXTURE_2D, texture)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

        Promise.all(images.map((image) => image.decode())).then(() => {
          if (!alive || gl.isContextLost()) return
          const atlas = document.createElement('canvas')
          const limit = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number
          const tileWidth = Math.min(1280, Math.floor((limit / images.length - 4) * 1.5))
          const tileHeight = Math.round(tileWidth / 1.5)
          atlas.width = tileWidth + 4
          atlas.height = (tileHeight + 4) * images.length
          const ctx = atlas.getContext('2d')
          if (!ctx) return
          images.forEach((image, i) => {
            const sourceWidth = Math.min(image.naturalWidth, image.naturalHeight * 1.5)
            const sourceHeight = sourceWidth / 1.5
            ctx.drawImage(image, (image.naturalWidth - sourceWidth) / 2, (image.naturalHeight - sourceHeight) / 2,
              sourceWidth, sourceHeight, 2, i * (tileHeight + 4) + 2, tileWidth, tileHeight)
          })
          gl.bindTexture(gl.TEXTURE_2D, texture)
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas)
          gl.useProgram(program)
          gl.uniform1i(uniforms.uAtlas, 0)
          gl.uniform1f(uniforms.uCount, images.length)
          gl.uniform2f(uniforms.uAtlasSize, atlas.width, atlas.height)
          loaded = true
          schedule()
        }).catch(() => {
          if (alive) delete stage.dataset.glass
        })

        resize.observe(vp)
        resize.observe(images[0])
        observer.observe(stage)
        vp.addEventListener('scroll', schedule, { passive: true })
        tr.addEventListener('gallery:move', schedule)
      } catch (error) {
        console.warn('Studies glass renderer unavailable:', error)
        dispose()
      }
      return dispose
    }

    let dispose = setup()
    const lost = (event: Event) => {
      event.preventDefault()
      dispose()
    }
    const restored = () => {
      dispose = setup()
    }
    canvas.addEventListener('webglcontextlost', lost)
    canvas.addEventListener('webglcontextrestored', restored)
    return () => {
      dispose()
      canvas.removeEventListener('webglcontextlost', lost)
      canvas.removeEventListener('webglcontextrestored', restored)
    }
  }, [viewport, track, reduced])

  return <canvas ref={ref} className="h-glass-lens" aria-hidden="true" />
}
