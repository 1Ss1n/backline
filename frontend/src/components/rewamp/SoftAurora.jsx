import { memo, useEffect, useRef } from 'react'

// RewampUI SoftAuroraShowcase (see README). Bake its sinusoidal shader on
// size/theme changes; CSS moves the ribbons, without a perpetual render loop.
const vertex = `attribute vec2 position;
void main() { gl_Position = vec4(position, 0., 1.); }`
const fragment = `precision mediump float;
uniform vec2 u_resolution;
uniform vec3 u_main;
uniform vec3 u_secondary;
uniform vec3 u_accent;
void main() {
  vec2 p = gl_FragCoord.xy / u_resolution.xy;
  p.x *= u_resolution.x / u_resolution.y;
  float t = .7;
  float wave1 = sin(p.x * 2. + t) * .5 + .5;
  float wave2 = sin(p.y * 3. - t * 1.5 + wave1) * .5 + .5;
  float wave3 = sin((p.x + p.y) * 2. + t + wave2 * 2.) * .5 + .5;
  vec3 layer = mix(mix(u_main, u_secondary, wave1), u_accent, wave2);
  float mask = clamp(smoothstep(.4, .6, wave3) * sin(p.y * 3.14) * 1.2, 0., 1.);
  gl_FragColor = vec4(layer, mask * .4 + smoothstep(.7, 1., wave2) * .12);
}`

function SoftAurora({ theme, intensity = 'ambient' }) {
  const canvasRef = useRef(null)
  useEffect(() => {
    const canvas = canvasRef.current
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: false, powerPreference: 'low-power', preserveDrawingBuffer: true })
    if (!gl) return // CSS gradient is the no-WebGL fallback.
    const shaders = []
    const program = gl.createProgram()
    let buffer
    const cleanup = () => {
      if (buffer) gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
      shaders.forEach((shader) => gl.deleteShader(shader))
    }
    for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
      const shader = gl.createShader(type)
      shaders.push(shader)
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { cleanup(); return }
      gl.attachShader(program, shader)
    }
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { cleanup(); return }
    gl.useProgram(program)
    buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW)
    const position = gl.getAttribLocation(program, 'position')
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
    const palette = theme === 'light'
      ? [[.88,.65,.74], [.83,.76,.88], [.98,.91,.94]]
      : [[.60,.02,.22], [.34,.15,.33], [.28,.09,.19]]
    ;['u_main', 'u_secondary', 'u_accent'].forEach((name, index) => gl.uniform3fv(gl.getUniformLocation(program, name), palette[index]))
    const draw = () => {
      const bounds = canvas.parentElement.getBoundingClientRect()
      const scale = Math.min(1, (window.innerWidth <= 768 ? 320 : 640) / Math.max(bounds.width, 1))
      canvas.width = Math.max(1, Math.round(bounds.width * scale))
      canvas.height = Math.max(1, Math.round(bounds.height * scale))
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.uniform2f(gl.getUniformLocation(program, 'u_resolution'), canvas.width, canvas.height)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
    }
    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(canvas.parentElement)
    return () => { observer.disconnect(); cleanup() }
  }, [theme])
  return <div className={`soft-aurora soft-aurora--${intensity}`} aria-hidden="true"><canvas ref={canvasRef} /><div className="soft-aurora-shade" /></div>
}
export default memo(SoftAurora)
