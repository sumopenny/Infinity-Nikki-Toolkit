/** Fixed-step damped wave field. Rendering and input are independent of display refresh rate. */
export class HomeWaterField {
  current: Float32Array
  private previous: Float32Array
  private next: Float32Array
  readonly normals: Uint8Array

  constructor(
    readonly width: number,
    readonly height: number,
    readonly damping = 0.95
  ) {
    this.current = new Float32Array(width * height)
    this.previous = new Float32Array(width * height)
    this.next = new Float32Array(width * height)
    this.normals = new Uint8Array(width * height * 4)
  }

  disturb(x: number, y: number, power: number) {
    const cx = x * (this.width - 1)
    const cy = y * (this.height - 1)
    const radius = 4.5
    for (
      let iy = Math.max(1, Math.floor(cy - radius));
      iy < Math.min(this.height - 1, cy + radius);
      iy++
    ) {
      for (
        let ix = Math.max(1, Math.floor(cx - radius));
        ix < Math.min(this.width - 1, cx + radius);
        ix++
      ) {
        const distance = Math.hypot(ix - cx, iy - cy) / radius
        if (distance < 1) {
          const index = iy * this.width + ix
          this.current[index] = Math.max(
            -12,
            Math.min(12, this.current[index] + power * (Math.cos(distance * Math.PI) + 1) * 0.5)
          )
        }
      }
    }
  }

  step() {
    let peak = 0
    for (let y = 1; y < this.height - 1; y++) {
      for (let x = 1; x < this.width - 1; x++) {
        const i = y * this.width + x
        const value =
          ((this.current[i - 1] +
            this.current[i + 1] +
            this.current[i - this.width] +
            this.current[i + this.width]) *
            0.5 -
            this.previous[i]) *
          this.damping
        this.next[i] = value
        peak = Math.max(peak, Math.abs(value))
      }
    }
    const old = this.previous
    this.previous = this.current
    this.current = this.next
    this.next = old
    return peak
  }

  encodeNormals() {
    this.normals.fill(128)
    for (let y = 1; y < this.height - 1; y++) {
      for (let x = 1; x < this.width - 1; x++) {
        const i = y * this.width + x
        this.normals[i * 4] = Math.max(
          0,
          Math.min(255, Math.round(128 + (this.current[i + 1] - this.current[i - 1]) * 24))
        )
        this.normals[i * 4 + 1] = Math.max(
          0,
          Math.min(
            255,
            Math.round(128 + (this.current[i + this.width] - this.current[i - this.width]) * 24)
          )
        )
      }
    }
    return this.normals
  }

  clear() {
    this.current.fill(0)
    this.previous.fill(0)
    this.next.fill(0)
  }
}

/** GPU refraction preserves wallpaper resolution; only the small wave field runs on the CPU. */
export function createHomeWaterRenderer(canvas: HTMLCanvasElement, image: HTMLImageElement) {
  const gl = canvas.getContext('webgl', {
    alpha: false,
    antialias: false,
    depth: false,
    preserveDrawingBuffer: false
  })
  if (!gl) return null
  const shaders: WebGLShader[] = []
  const textures: WebGLTexture[] = []
  let program: WebGLProgram | null = null
  let buffer: WebGLBuffer | null = null
  const dispose = () => {
    textures.forEach((texture) => gl.deleteTexture(texture))
    shaders.forEach((shader) => gl.deleteShader(shader))
    gl.deleteBuffer(buffer)
    gl.deleteProgram(program)
  }
  try {
    function shader(type: number, source: string) {
      const result = gl!.createShader(type)
      if (!result) throw new Error('Shader unavailable')
      shaders.push(result)
      gl!.shaderSource(result, source)
      gl!.compileShader(result)
      if (!gl!.getShaderParameter(result, gl!.COMPILE_STATUS))
        throw new Error('Shader compilation failed')
      return result
    }
    program = gl.createProgram()
    if (!program) throw new Error('Program unavailable')
    gl.attachShader(
      program,
      shader(
        gl.VERTEX_SHADER,
        `
      attribute vec2 position;
      varying vec2 uv;
      void main() { uv = vec2(position.x * .5 + .5, .5 - position.y * .5); gl_Position = vec4(position, 0., 1.); }
    `
      )
    )
    gl.attachShader(
      program,
      shader(
        gl.FRAGMENT_SHADER,
        `
      precision mediump float;
      varying vec2 uv;
      uniform sampler2D wallpaper;
      uniform sampler2D normals;
      uniform vec2 cover;
      uniform vec2 size;
      void main() {
        vec2 slope = (texture2D(normals, uv).rg * 255. - 128.) / 24. * 2.5;
        vec2 displaced = clamp(uv + slope * 6. / size, vec2(0.), vec2(1.));
        vec3 color = texture2D(wallpaper, (displaced - .5) * cover + .5).rgb;
        float light = clamp((slope.x * .6 - slope.y) * 5., -22., 22.) / 255.;
        gl_FragColor = vec4(color + light, 1.);
      }
    `
      )
    )
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Shader link failed')
    gl.useProgram(program)
    buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    )
    const position = gl.getAttribLocation(program, 'position')
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
    for (let i = 0; i < 2; i++) {
      const texture = gl.createTexture()
      if (!texture) throw new Error('Texture unavailable')
      textures.push(texture)
      gl.activeTexture(gl.TEXTURE0 + i)
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    }
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, textures[0])
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)
    if (gl.getError() !== gl.NO_ERROR) throw new Error('Wallpaper texture unavailable')
    gl.uniform1i(gl.getUniformLocation(program, 'wallpaper'), 0)
    gl.uniform1i(gl.getUniformLocation(program, 'normals'), 1)
    const coverLocation = gl.getUniformLocation(program, 'cover')
    const sizeLocation = gl.getUniformLocation(program, 'size')
    return {
      draw(field: HomeWaterField, width: number, height: number) {
        const ratio = Math.min(
          window.devicePixelRatio || 1,
          1.5,
          Math.sqrt(2400000 / (width * height))
        )
        const pixelWidth = Math.max(1, Math.round(width * ratio))
        const pixelHeight = Math.max(1, Math.round(height * ratio))
        if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
          canvas.width = pixelWidth
          canvas.height = pixelHeight
        }
        gl.viewport(0, 0, canvas.width, canvas.height)
        const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight)
        gl.uniform2f(
          coverLocation,
          width / (image.naturalWidth * scale),
          height / (image.naturalHeight * scale)
        )
        gl.uniform2f(sizeLocation, width, height)
        gl.activeTexture(gl.TEXTURE1)
        gl.bindTexture(gl.TEXTURE_2D, textures[1])
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          field.width,
          field.height,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          field.encodeNormals()
        )
        gl.drawArrays(gl.TRIANGLES, 0, 6)
      },
      dispose
    }
  } catch {
    dispose()
    return null
  }
}
