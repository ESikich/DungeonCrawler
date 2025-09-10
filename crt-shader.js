// CRT Shader Implementation (moved from index.html)
class CRTShader {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');

    if (!this.gl) {
      console.warn('WebGL not supported, falling back to CSS effects');
      return;
    }

    this.initShaders();
    this.initBuffers();
    this.setupTexture();

    // All effects on by default
    this.settings = {
      scanlines: true,
      curvature: true,
      glow: true,
      noise: true,
      brightness: 1.3,
      contrast: 1.0,
      saturation: 1.3
    };
  }

  initShaders() {
    const vertexShaderSource = `
      attribute vec4 aVertexPosition;
      attribute vec2 aTextureCoord;
      varying vec2 vTextureCoord;

      void main() {
        gl_Position = aVertexPosition;
        vTextureCoord = aTextureCoord;
      }
    `;

    const fragmentShaderSource = `
      precision mediump float;
      varying vec2 vTextureCoord;
      uniform sampler2D uSampler;
      uniform float uTime;
      uniform bool uScanlines;
      uniform bool uCurvature;
      uniform bool uGlow;
      uniform bool uNoise;
      uniform float uBrightness;
      uniform float uContrast;
      uniform float uSaturation;

      vec2 curve(vec2 uv) {
        if (!uCurvature) return uv;
        uv = uv * 2.0 - 1.0;
        vec2 offset = abs(uv.yx) / vec2(6.0, 4.0);
        uv = uv + uv * offset * offset;
        uv = uv * 0.5 + 0.5;
        return uv;
      }

      float random(vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
      }

      void main() {
        vec2 uv = curve(vTextureCoord);

        vec4 color = texture2D(uSampler, uv);

        // brightness/contrast
        color.rgb = ((color.rgb - 0.5) * uContrast + 0.5) * uBrightness;

        // saturation (note: >1 boosts saturation)
        float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
        color.rgb = mix(vec3(gray), color.rgb, uSaturation);

        // scanlines
        if (uScanlines) {
          float scanline = sin(uv.y * 800.0) * 0.04;
          color.rgb -= scanline;
        }

        // glow (simple additive blur tap)
        if (uGlow) {
          vec4 glow = texture2D(uSampler, uv);
          color.rgb += glow.rgb * 0.1;
        }

        // noise
        if (uNoise) {
          float n = random(uv + uTime) * 0.05;
          color.rgb += n;
        }

        // vignette
        vec2 vigUV = vTextureCoord;
        vigUV *= 1.0 - vigUV.yx;
        float vignette = vigUV.x * vigUV.y * 15.0;
        vignette = pow(vignette, 0.25);
        color.rgb *= vignette;

        // edge fade
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
          color = vec4(0.0);
        }

        gl_FragColor = color;
      }
    `;

    this.shaderProgram = this.createShaderProgram(vertexShaderSource, fragmentShaderSource);
    this.programInfo = {
      attribLocations: {
        vertexPosition: this.gl.getAttribLocation(this.shaderProgram, 'aVertexPosition'),
        textureCoord: this.gl.getAttribLocation(this.shaderProgram, 'aTextureCoord'),
      },
      uniformLocations: {
        uSampler: this.gl.getUniformLocation(this.shaderProgram, 'uSampler'),
        uTime: this.gl.getUniformLocation(this.shaderProgram, 'uTime'),
        uScanlines: this.gl.getUniformLocation(this.shaderProgram, 'uScanlines'),
        uCurvature: this.gl.getUniformLocation(this.shaderProgram, 'uCurvature'),
        uGlow: this.gl.getUniformLocation(this.shaderProgram, 'uGlow'),
        uNoise: this.gl.getUniformLocation(this.shaderProgram, 'uNoise'),
        uBrightness: this.gl.getUniformLocation(this.shaderProgram, 'uBrightness'),
        uContrast: this.gl.getUniformLocation(this.shaderProgram, 'uContrast'),
        uSaturation: this.gl.getUniformLocation(this.shaderProgram, 'uSaturation'),
      },
    };
  }

  createShaderProgram(vertexSource, fragmentSource) {
    const vertexShader = this.createShader(this.gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = this.createShader(this.gl.FRAGMENT_SHADER, fragmentSource);

    const shaderProgram = this.gl.createProgram();
    this.gl.attachShader(shaderProgram, vertexShader);
    this.gl.attachShader(shaderProgram, fragmentShader);
    this.gl.linkProgram(shaderProgram);

    if (!this.gl.getProgramParameter(shaderProgram, this.gl.LINK_STATUS)) {
      console.error('Unable to initialize shader program:', this.gl.getProgramInfoLog(shaderProgram));
      return null;
    }
    return shaderProgram;
  }

  createShader(type, source) {
    const shader = this.gl.createShader(type);
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      console.error('Error compiling shader:', this.gl.getShaderInfoLog(shader));
      this.gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  initBuffers() {
    // Fullscreen quad (triangle strip)
    const positions = [
      -1.0,  1.0,
       1.0,  1.0,
      -1.0, -1.0,
       1.0, -1.0,
    ];
    this.positionBuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(positions), this.gl.STATIC_DRAW);

    const textureCoords = [
      0.0, 0.0,
      1.0, 0.0,
      0.0, 1.0,
      1.0, 1.0,
    ];
    this.textureCoordBuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.textureCoordBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(textureCoords), this.gl.STATIC_DRAW);
  }

  setupTexture() {
    this.texture = this.gl.createTexture();
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST);
  }

  render(sourceCanvas) {
    if (!this.gl || !this.shaderProgram) return;

    // Update texture with source canvas
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
    this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, sourceCanvas);

    // Set viewport
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);

    // Use shader
    this.gl.useProgram(this.shaderProgram);

    // Uniforms
    this.gl.uniform1f(this.programInfo.uniformLocations.uTime, Date.now() * 0.001);
    this.gl.uniform1i(this.programInfo.uniformLocations.uScanlines, this.settings.scanlines);
    this.gl.uniform1i(this.programInfo.uniformLocations.uCurvature, this.settings.curvature);
    this.gl.uniform1i(this.programInfo.uniformLocations.uGlow, this.settings.glow);
    this.gl.uniform1i(this.programInfo.uniformLocations.uNoise, this.settings.noise);
    this.gl.uniform1f(this.programInfo.uniformLocations.uBrightness, this.settings.brightness);
    this.gl.uniform1f(this.programInfo.uniformLocations.uContrast, this.settings.contrast);
    this.gl.uniform1f(this.programInfo.uniformLocations.uSaturation, this.settings.saturation);

    // Texture binding
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
    this.gl.uniform1i(this.programInfo.uniformLocations.uSampler, 0);

    // Attributes
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuffer);
    this.gl.vertexAttribPointer(this.programInfo.attribLocations.vertexPosition, 2, this.gl.FLOAT, false, 0, 0);
    this.gl.enableVertexAttribArray(this.programInfo.attribLocations.vertexPosition);

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.textureCoordBuffer);
    this.gl.vertexAttribPointer(this.programInfo.attribLocations.textureCoord, 2, this.gl.FLOAT, false, 0, 0);
    this.gl.enableVertexAttribArray(this.programInfo.attribLocations.textureCoord);

    // Draw
    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
  }
}

// Initialize CRT effects when the page loads
window.addEventListener('load', function () {
  const gameCanvas   = document.getElementById('gameCanvas');
  const shaderCanvas = document.getElementById('crtShaderCanvas');

  let crtShader = null;
  let useWebGL = true;

  try {
    crtShader = new CRTShader(shaderCanvas);
    if (!crtShader.gl) useWebGL = false;
  } catch (e) {
    console.warn('Failed to initialize WebGL CRT shader:', e);
    useWebGL = false;
  }

  if (useWebGL && crtShader) {
    shaderCanvas.style.display = 'block';

    // minor base-canvas polish for text/tiles
    gameCanvas.style.filter = `
      contrast(1.0)
      brightness(1.2)
      saturate(1.3)
      blur(1.0px)
    `;

    (function renderCRT() {
      crtShader.render(gameCanvas);
      requestAnimationFrame(renderCRT);
    })();
  } else {
    // Hide WebGL canvas and rely on CSS overlays
    shaderCanvas.style.display = 'none';
    console.log('Using CSS-based CRT effects');
  }
});
