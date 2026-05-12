"""OpenGL CRT presenter for the pygame adapter."""

from __future__ import annotations

import ctypes

from .crt_tuning import CRTTuning


class OpenGLCRTDisplay:
    """Present a pygame surface through a GPU CRT shader."""

    def __init__(self, pygame: object, logical_size: tuple[int, int]) -> None:
        self.pygame = pygame
        self.logical_size = logical_size
        self.tuning = CRTTuning()
        self.area = "dungeon"
        self.texture_size: tuple[int, int] | None = None
        self.overlay_texture_size: tuple[int, int] | None = None
        self.noise_texture_size: tuple[int, int] | None = None

        from OpenGL import GL
        from OpenGL.GL import shaders
        import numpy as np

        self.gl = GL
        self._noise_rng = np.random.default_rng()
        self.program = shaders.compileProgram(
            shaders.compileShader(_VERTEX_SHADER, GL.GL_VERTEX_SHADER),
            shaders.compileShader(_FRAGMENT_SHADER, GL.GL_FRAGMENT_SHADER),
        )
        self.overlay_program = shaders.compileProgram(
            shaders.compileShader(_OVERLAY_VERTEX_SHADER, GL.GL_VERTEX_SHADER),
            shaders.compileShader(_OVERLAY_FRAGMENT_SHADER, GL.GL_FRAGMENT_SHADER),
        )
        self.vertex_buffer = GL.glGenBuffers(1)
        self.texture = GL.glGenTextures(1)
        self.overlay_texture = GL.glGenTextures(1)
        self.noise_texture = GL.glGenTextures(1)
        self._setup_gl_state()
        self._cache_locations()

    def set_area(self, area: str) -> None:
        self.area = area

    def apply_tuning(self, tuning: CRTTuning) -> None:
        self.tuning = tuning

    def present(
        self,
        source: object,
        window_size: tuple[int, int],
        ticks: int | None = None,
        overlay: object | None = None,
    ) -> None:
        gl = self.gl
        tuning = self.tuning
        width, height = window_size
        container_rect = _crt_container_rect(window_size)
        game_rect = _game_container_rect(container_rect)
        frame_ticks = self.pygame.time.get_ticks() if ticks is None else ticks
        overworld = self.area == "overworld"
        brightness = tuning.brightness_overworld if overworld else tuning.brightness_dungeon
        saturation = tuning.saturation_overworld if overworld else tuning.saturation_dungeon

        self._upload_source(source)
        if tuning.noise:
            self._upload_noise(source.get_size(), tuning)

        gl.glViewport(0, 0, width, height)
        gl.glClearColor(0.0, 0.0, 0.0, 1.0)
        gl.glClear(gl.GL_COLOR_BUFFER_BIT)
        gl.glUseProgram(self.program)

        gl.glUniform1i(self.locations["uSampler"], 0)
        gl.glUniform1i(self.locations["uNoiseSampler"], 1)
        gl.glUniform1f(self.locations["uTime"], frame_ticks * 0.001)
        gl.glUniform2f(self.locations["uLogicalSize"], source.get_width(), source.get_height())
        gl.glUniform2f(self.locations["uOutputSize"], width, height)
        gl.glUniform4f(self.locations["uContainerRect"], *container_rect)
        gl.glUniform4f(self.locations["uRect"], *game_rect)
        gl.glUniform1i(self.locations["uScanlines"], int(tuning.scanlines))
        gl.glUniform1i(self.locations["uCurvature"], int(tuning.curvature))
        gl.glUniform1i(self.locations["uGlow"], int(tuning.glow))
        gl.glUniform1i(self.locations["uNoise"], int(tuning.noise))
        gl.glUniform1f(self.locations["uBrightness"], brightness)
        gl.glUniform1f(self.locations["uContrast"], tuning.contrast)
        gl.glUniform1f(self.locations["uSaturation"], saturation)
        gl.glUniform1f(self.locations["uShaderScanlineStrength"], tuning.shader_scanline_strength)
        gl.glUniform1f(self.locations["uGlowStrength"], tuning.glow_strength)
        gl.glUniform1f(self.locations["uOverlayScanlineAlpha"], tuning.overlay_scanline_alpha)
        gl.glUniform1f(self.locations["uBlurStrength"], tuning.blur_strength)
        gl.glUniform1f(self.locations["uVignetteStrength"], tuning.vignette_strength)
        gl.glUniform1f(self.locations["uScreenHighlightAlpha"], tuning.screen_highlight_alpha)
        gl.glUniform1f(self.locations["uScreenEdgeShadowAlpha"], tuning.screen_edge_shadow_alpha)
        gl.glUniform1f(self.locations["uMonitorGlowStrength"], tuning.monitor_glow_strength)
        gl.glUniform1f(self.locations["uBezelShadowStrength"], tuning.bezel_shadow_strength)
        gl.glUniform1f(self.locations["uScreenCornerRadius"], tuning.screen_corner_radius)

        gl.glBindBuffer(gl.GL_ARRAY_BUFFER, self.vertex_buffer)
        gl.glEnableVertexAttribArray(self.locations["aPosition"])
        gl.glVertexAttribPointer(
            self.locations["aPosition"],
            2,
            gl.GL_FLOAT,
            False,
            0,
            ctypes.c_void_p(0),
        )
        gl.glDrawArrays(gl.GL_TRIANGLE_STRIP, 0, 4)
        gl.glDisableVertexAttribArray(self.locations["aPosition"])

        if overlay is not None:
            self._draw_overlay(overlay)

    def _setup_gl_state(self) -> None:
        gl = self.gl
        import numpy as np

        quad = np.asarray(
            [
                -1.0,
                -1.0,
                1.0,
                -1.0,
                -1.0,
                1.0,
                1.0,
                1.0,
            ],
            dtype=np.float32,
        )

        gl.glDisable(gl.GL_DEPTH_TEST)
        gl.glDisable(gl.GL_BLEND)
        gl.glBindBuffer(gl.GL_ARRAY_BUFFER, self.vertex_buffer)
        gl.glBufferData(gl.GL_ARRAY_BUFFER, quad.nbytes, quad, gl.GL_STATIC_DRAW)

        gl.glActiveTexture(gl.GL_TEXTURE0)
        gl.glBindTexture(gl.GL_TEXTURE_2D, self.texture)
        gl.glTexParameteri(gl.GL_TEXTURE_2D, gl.GL_TEXTURE_WRAP_S, gl.GL_CLAMP_TO_EDGE)
        gl.glTexParameteri(gl.GL_TEXTURE_2D, gl.GL_TEXTURE_WRAP_T, gl.GL_CLAMP_TO_EDGE)
        gl.glTexParameteri(gl.GL_TEXTURE_2D, gl.GL_TEXTURE_MIN_FILTER, gl.GL_NEAREST)
        gl.glTexParameteri(gl.GL_TEXTURE_2D, gl.GL_TEXTURE_MAG_FILTER, gl.GL_NEAREST)

        gl.glBindTexture(gl.GL_TEXTURE_2D, self.overlay_texture)
        gl.glTexParameteri(gl.GL_TEXTURE_2D, gl.GL_TEXTURE_WRAP_S, gl.GL_CLAMP_TO_EDGE)
        gl.glTexParameteri(gl.GL_TEXTURE_2D, gl.GL_TEXTURE_WRAP_T, gl.GL_CLAMP_TO_EDGE)
        gl.glTexParameteri(gl.GL_TEXTURE_2D, gl.GL_TEXTURE_MIN_FILTER, gl.GL_LINEAR)
        gl.glTexParameteri(gl.GL_TEXTURE_2D, gl.GL_TEXTURE_MAG_FILTER, gl.GL_LINEAR)

        gl.glActiveTexture(gl.GL_TEXTURE1)
        gl.glBindTexture(gl.GL_TEXTURE_2D, self.noise_texture)
        gl.glTexParameteri(gl.GL_TEXTURE_2D, gl.GL_TEXTURE_WRAP_S, gl.GL_CLAMP_TO_EDGE)
        gl.glTexParameteri(gl.GL_TEXTURE_2D, gl.GL_TEXTURE_WRAP_T, gl.GL_CLAMP_TO_EDGE)
        gl.glTexParameteri(gl.GL_TEXTURE_2D, gl.GL_TEXTURE_MIN_FILTER, gl.GL_NEAREST)
        gl.glTexParameteri(gl.GL_TEXTURE_2D, gl.GL_TEXTURE_MAG_FILTER, gl.GL_NEAREST)
        gl.glActiveTexture(gl.GL_TEXTURE0)

    def _cache_locations(self) -> None:
        gl = self.gl
        self.locations = {
            "aPosition": gl.glGetAttribLocation(self.program, "aPosition"),
            "uSampler": gl.glGetUniformLocation(self.program, "uSampler"),
            "uNoiseSampler": gl.glGetUniformLocation(self.program, "uNoiseSampler"),
            "uTime": gl.glGetUniformLocation(self.program, "uTime"),
            "uLogicalSize": gl.glGetUniformLocation(self.program, "uLogicalSize"),
            "uOutputSize": gl.glGetUniformLocation(self.program, "uOutputSize"),
            "uContainerRect": gl.glGetUniformLocation(self.program, "uContainerRect"),
            "uRect": gl.glGetUniformLocation(self.program, "uRect"),
            "uScanlines": gl.glGetUniformLocation(self.program, "uScanlines"),
            "uCurvature": gl.glGetUniformLocation(self.program, "uCurvature"),
            "uGlow": gl.glGetUniformLocation(self.program, "uGlow"),
            "uNoise": gl.glGetUniformLocation(self.program, "uNoise"),
            "uBrightness": gl.glGetUniformLocation(self.program, "uBrightness"),
            "uContrast": gl.glGetUniformLocation(self.program, "uContrast"),
            "uSaturation": gl.glGetUniformLocation(self.program, "uSaturation"),
            "uShaderScanlineStrength": gl.glGetUniformLocation(self.program, "uShaderScanlineStrength"),
            "uGlowStrength": gl.glGetUniformLocation(self.program, "uGlowStrength"),
            "uOverlayScanlineAlpha": gl.glGetUniformLocation(self.program, "uOverlayScanlineAlpha"),
            "uBlurStrength": gl.glGetUniformLocation(self.program, "uBlurStrength"),
            "uVignetteStrength": gl.glGetUniformLocation(self.program, "uVignetteStrength"),
            "uScreenHighlightAlpha": gl.glGetUniformLocation(self.program, "uScreenHighlightAlpha"),
            "uScreenEdgeShadowAlpha": gl.glGetUniformLocation(self.program, "uScreenEdgeShadowAlpha"),
            "uMonitorGlowStrength": gl.glGetUniformLocation(self.program, "uMonitorGlowStrength"),
            "uBezelShadowStrength": gl.glGetUniformLocation(self.program, "uBezelShadowStrength"),
            "uScreenCornerRadius": gl.glGetUniformLocation(self.program, "uScreenCornerRadius"),
        }
        self.overlay_locations = {
            "aPosition": gl.glGetAttribLocation(self.overlay_program, "aPosition"),
            "uOverlay": gl.glGetUniformLocation(self.overlay_program, "uOverlay"),
        }

    def _upload_source(self, source: object) -> None:
        gl = self.gl
        size = source.get_size()
        pixels = self.pygame.image.tostring(source, "RGBA", True)
        gl.glActiveTexture(gl.GL_TEXTURE0)
        gl.glBindTexture(gl.GL_TEXTURE_2D, self.texture)
        if self.texture_size != size:
            self.texture_size = size
            gl.glTexImage2D(
                gl.GL_TEXTURE_2D,
                0,
                gl.GL_RGBA,
                size[0],
                size[1],
                0,
                gl.GL_RGBA,
                gl.GL_UNSIGNED_BYTE,
                pixels,
            )
            return
        gl.glTexSubImage2D(
            gl.GL_TEXTURE_2D,
            0,
            0,
            0,
            size[0],
            size[1],
            gl.GL_RGBA,
            gl.GL_UNSIGNED_BYTE,
            pixels,
        )

    def _upload_noise(self, logical_size: tuple[int, int], tuning: CRTTuning) -> None:
        gl = self.gl
        size = _noise_canvas_size(logical_size)
        pixels = _build_noise_canvas_frame(self._noise_rng, size, tuning.static_probability, tuning.static_alpha)
        data = pixels.tobytes()
        gl.glActiveTexture(gl.GL_TEXTURE1)
        gl.glBindTexture(gl.GL_TEXTURE_2D, self.noise_texture)
        if self.noise_texture_size != size:
            self.noise_texture_size = size
            gl.glTexImage2D(
                gl.GL_TEXTURE_2D,
                0,
                gl.GL_RGBA,
                size[0],
                size[1],
                0,
                gl.GL_RGBA,
                gl.GL_UNSIGNED_BYTE,
                data,
            )
            return
        gl.glTexSubImage2D(
            gl.GL_TEXTURE_2D,
            0,
            0,
            0,
            size[0],
            size[1],
            gl.GL_RGBA,
            gl.GL_UNSIGNED_BYTE,
            data,
        )

    def _draw_overlay(self, overlay: object) -> None:
        gl = self.gl
        self._upload_overlay(overlay)
        gl.glUseProgram(self.overlay_program)
        gl.glUniform1i(self.overlay_locations["uOverlay"], 0)
        gl.glEnable(gl.GL_BLEND)
        gl.glBlendFunc(gl.GL_SRC_ALPHA, gl.GL_ONE_MINUS_SRC_ALPHA)
        gl.glBindBuffer(gl.GL_ARRAY_BUFFER, self.vertex_buffer)
        gl.glEnableVertexAttribArray(self.overlay_locations["aPosition"])
        gl.glVertexAttribPointer(
            self.overlay_locations["aPosition"],
            2,
            gl.GL_FLOAT,
            False,
            0,
            ctypes.c_void_p(0),
        )
        gl.glDrawArrays(gl.GL_TRIANGLE_STRIP, 0, 4)
        gl.glDisableVertexAttribArray(self.overlay_locations["aPosition"])
        gl.glDisable(gl.GL_BLEND)

    def _upload_overlay(self, overlay: object) -> None:
        gl = self.gl
        size = overlay.get_size()
        pixels = self.pygame.image.tostring(overlay, "RGBA", True)
        gl.glActiveTexture(gl.GL_TEXTURE0)
        gl.glBindTexture(gl.GL_TEXTURE_2D, self.overlay_texture)
        if self.overlay_texture_size != size:
            self.overlay_texture_size = size
            gl.glTexImage2D(
                gl.GL_TEXTURE_2D,
                0,
                gl.GL_RGBA,
                size[0],
                size[1],
                0,
                gl.GL_RGBA,
                gl.GL_UNSIGNED_BYTE,
                pixels,
            )
            return
        gl.glTexSubImage2D(
            gl.GL_TEXTURE_2D,
            0,
            0,
            0,
            size[0],
            size[1],
            gl.GL_RGBA,
            gl.GL_UNSIGNED_BYTE,
            pixels,
        )


def _crt_container_rect(window_size: tuple[int, int]) -> tuple[float, float, float, float]:
    window_w, window_h = window_size
    padding = 8 if window_w <= 768 else 12
    available_w = max(1, window_w - padding * 2)
    available_h = max(1, window_h - padding * 2)
    aspect = 860 / 800
    if available_w / available_h <= aspect:
        width = available_w
        height = width / aspect
    else:
        height = available_h
        width = height * aspect
    return (window_w - width) / 2, (window_h - height) / 2, width, height


def _game_container_rect(container_rect: tuple[float, float, float, float]) -> tuple[float, float, float, float]:
    x, y, width, height = container_rect
    left = width * 0.0349
    top = height * 0.05
    right = width * 0.0349
    bottom = height * 0.075
    return x + left, y + top, width - left - right, height - top - bottom


def _noise_canvas_size(logical_size: tuple[int, int]) -> tuple[int, int]:
    width, height = logical_size
    return max(1, width // 4), max(1, height // 4)


def _static_alpha_byte(alpha: float) -> int:
    return max(0, min(255, round(alpha * 255)))


def _build_noise_canvas_frame(
    rng: object,
    size: tuple[int, int],
    probability: float,
    alpha: float,
) -> object:
    import numpy as np

    width, height = size
    pixels = np.empty((height, width, 4), dtype=np.uint8)
    pixels[:, :, 0:3] = rng.integers(0, 256, (height, width, 3), dtype=np.uint8)
    pixels[:, :, 3] = np.where(
        rng.random((height, width), dtype=np.float32) < probability,
        _static_alpha_byte(alpha),
        0,
    ).astype(np.uint8)
    return pixels


_VERTEX_SHADER = """
#version 120
attribute vec2 aPosition;

void main() {
    gl_Position = vec4(aPosition, 0.0, 1.0);
}
"""


_OVERLAY_VERTEX_SHADER = """
#version 120
attribute vec2 aPosition;
varying vec2 vTextureCoord;

void main() {
    gl_Position = vec4(aPosition, 0.0, 1.0);
    vTextureCoord = aPosition * 0.5 + 0.5;
}
"""


_OVERLAY_FRAGMENT_SHADER = """
#version 120
uniform sampler2D uOverlay;
varying vec2 vTextureCoord;

void main() {
    gl_FragColor = texture2D(uOverlay, vTextureCoord);
}
"""


_FRAGMENT_SHADER = """
#version 120
uniform sampler2D uSampler;
uniform sampler2D uNoiseSampler;
uniform float uTime;
uniform vec2 uLogicalSize;
uniform vec2 uOutputSize;
uniform vec4 uContainerRect;
uniform vec4 uRect;
uniform bool uScanlines;
uniform bool uCurvature;
uniform bool uGlow;
uniform bool uNoise;
uniform float uBrightness;
uniform float uContrast;
uniform float uSaturation;
uniform float uShaderScanlineStrength;
uniform float uGlowStrength;
uniform float uOverlayScanlineAlpha;
uniform float uBlurStrength;
uniform float uVignetteStrength;
uniform float uScreenHighlightAlpha;
uniform float uScreenEdgeShadowAlpha;
uniform float uMonitorGlowStrength;
uniform float uBezelShadowStrength;
uniform float uScreenCornerRadius;

vec2 curve(vec2 uv) {
    if (!uCurvature) return uv;
    uv = uv * 2.0 - 1.0;
    vec2 offset = abs(uv.yx) / vec2(6.0, 4.0);
    uv = uv + uv * offset * offset;
    return uv * 0.5 + 0.5;
}

float jsVignette(vec2 uv) {
    vec2 vigUV = uv;
    vigUV *= 1.0 - vigUV.yx;
    float vignette = pow(max(vigUV.x * vigUV.y * 15.0, 0.0), 0.25);
    return mix(1.0, clamp(vignette, 0.0, 1.0), clamp(uVignetteStrength, 0.0, 1.0));
}

float screenOverlayDistance(vec2 screenUV) {
    vec2 overlayUV = (screenUV + vec2(0.05)) / 1.1;
    return length(overlayUV - vec2(0.5)) / 0.70710678;
}

vec3 applyScreenGlassOverlay(vec3 color, vec2 screenUV) {
    float distanceFromCenter = screenOverlayDistance(screenUV);
    float highlightAlpha = max(1.0 - distanceFromCenter / 0.32, 0.0) * uScreenHighlightAlpha;
    color = color * (1.0 - clamp(highlightAlpha, 0.0, 1.0)) + vec3(clamp(highlightAlpha, 0.0, 1.0));

    float edgeAlpha = clamp((distanceFromCenter - 0.56) / 0.44, 0.0, 1.0) * uScreenEdgeShadowAlpha;
    return color * (1.0 - clamp(edgeAlpha, 0.0, 1.0));
}

vec4 sampleGame(vec2 uv) {
    return texture2D(uSampler, vec2(uv.x, 1.0 - uv.y));
}

vec3 glowSample(vec2 uv) {
    vec2 texel = 1.0 / uLogicalSize;
    vec3 glow = sampleGame(uv + texel * vec2(-1.0, -1.0)).rgb * 1.0;
    glow += sampleGame(uv + texel * vec2( 0.0, -1.0)).rgb * 2.0;
    glow += sampleGame(uv + texel * vec2( 1.0, -1.0)).rgb * 1.0;
    glow += sampleGame(uv + texel * vec2(-1.0,  0.0)).rgb * 2.0;
    glow += sampleGame(uv).rgb * 4.0;
    glow += sampleGame(uv + texel * vec2( 1.0,  0.0)).rgb * 2.0;
    glow += sampleGame(uv + texel * vec2(-1.0,  1.0)).rgb * 1.0;
    glow += sampleGame(uv + texel * vec2( 0.0,  1.0)).rgb * 2.0;
    glow += sampleGame(uv + texel * vec2( 1.0,  1.0)).rgb * 1.0;
    return glow / 16.0;
}

vec3 shaderScene(vec2 screenUV) {
    vec2 uv = curve(screenUV);
    vec4 color = sampleGame(uv);

    color.rgb = ((color.rgb - 0.5) * uContrast + 0.5) * uBrightness;

    float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
    color.rgb = mix(vec3(gray), color.rgb, uSaturation);

    if (uScanlines) {
        float scanline = 0.5 + 0.5 * sin(uv.y * 800.0);
        color.rgb *= 1.0 - scanline * uShaderScanlineStrength;
    }

    if (uGlow) {
        color.rgb += glowSample(uv) * uGlowStrength;
    }

    color.rgb *= jsVignette(screenUV);

    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        color.rgb = vec3(0.0);
    }

    return color.rgb;
}

vec3 applyCssColorFilter(vec3 color, float contrast, float brightness, float saturation) {
    color = ((color - 0.5) * contrast + 0.5) * brightness;
    float gray = dot(color, vec3(0.299, 0.587, 0.114));
    return mix(vec3(gray), color, saturation);
}

vec3 shaderCanvasLayer(vec2 screenUV) {
    return clamp(shaderScene(screenUV), 0.0, 1.0);
}

vec3 sourceOver(vec3 base, vec3 overlay, float alpha) {
    return base * (1.0 - alpha) + overlay * alpha;
}

bool insideRect(vec2 pixel, vec4 rect) {
    return (
        pixel.x >= rect.x &&
        pixel.y >= rect.y &&
        pixel.x < rect.x + rect.z &&
        pixel.y < rect.y + rect.w
    );
}

vec3 compositeScene(vec2 screenUV, vec2 pixel) {
    if (!insideRect(pixel, uRect)) {
        return vec3(0.0);
    }

    vec3 color = shaderCanvasLayer(screenUV);

    if (uNoise) {
        vec4 noiseColor = texture2D(uNoiseSampler, screenUV);
        color = sourceOver(color, noiseColor.rgb, noiseColor.a);
    }

    vec2 localPixel = pixel - uRect.xy;
    if (mod(localPixel.y, 4.0) >= 2.0) {
        color = sourceOver(color, vec3(0.0, 1.0, 65.0 / 255.0), uOverlayScanlineAlpha);
    }

    return applyScreenGlassOverlay(color, screenUV);
}

vec3 parentColorFilter(vec3 color) {
    return color;
}

float roundedBoxSdf(vec2 point, vec4 rect, float radius) {
    vec2 center = rect.xy + rect.zw * 0.5;
    vec2 halfSize = rect.zw * 0.5;
    vec2 q = abs(point - center) - (halfSize - vec2(radius));
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
}

float roundedBoxMask(vec2 point, vec4 rect, float radius) {
    return 1.0 - smoothstep(0.0, 1.25, roundedBoxSdf(point, rect, radius));
}

vec3 sourceOverAlpha(vec3 base, vec3 overlay, float alpha) {
    return base * (1.0 - alpha) + overlay * alpha;
}

vec3 bodyBackground(vec2 pixel) {
    vec3 startColor = vec3(10.0, 10.0, 10.0) / 255.0;
    vec3 midColor = vec3(26.0, 26.0, 46.0) / 255.0;
    vec3 endColor = vec3(22.0, 33.0, 62.0) / 255.0;
    float t = clamp((pixel.x + pixel.y) / (uOutputSize.x + uOutputSize.y), 0.0, 1.0);
    return t < 0.5
        ? mix(startColor, midColor, t / 0.5)
        : mix(midColor, endColor, (t - 0.5) / 0.5);
}

vec3 drawMonitor(vec3 color, vec2 pixel) {
    float d = roundedBoxSdf(pixel, uContainerRect, 15.0);
    float outsideGlow = exp(-max(d, 0.0) / 22.0) * uMonitorGlowStrength;
    color += vec3(0.0, 1.0, 65.0 / 255.0) * outsideGlow;

    float shellMask = 1.0 - smoothstep(0.0, 1.25, d);
    vec3 shellColor = vec3(26.0 / 255.0);
    color = sourceOverAlpha(color, shellColor, shellMask);

    float innerShadow = (1.0 - smoothstep(0.0, 34.0, -d)) * shellMask * 0.75;
    color *= 1.0 - innerShadow;
    return color;
}

vec3 drawBezel(vec3 color, vec2 pixel) {
    vec4 bezelRect = vec4(
        uContainerRect.x + uContainerRect.z * 0.0233,
        uContainerRect.y + uContainerRect.w * 0.025,
        uContainerRect.z * (1.0 - 0.0233 * 2.0),
        uContainerRect.w * (1.0 - 0.025 - 0.05)
    );
    float outer = roundedBoxMask(pixel, bezelRect, 8.0);
    vec4 innerRect = vec4(bezelRect.xy + vec2(3.0), bezelRect.zw - vec2(6.0));
    float inner = roundedBoxMask(pixel, innerRect, 5.0);
    float border = clamp(outer - inner, 0.0, 1.0);
    color = sourceOverAlpha(color, vec3(51.0 / 255.0), border);

    float insetDistance = abs(roundedBoxSdf(pixel, innerRect, 5.0));
    float shadow = outer * (1.0 - smoothstep(0.0, 22.0, insetDistance)) * uBezelShadowStrength;
    color *= 1.0 - shadow;
    return color;
}

vec3 drawPowerLed(vec3 color, vec2 pixel) {
    vec2 center = vec2(
        uContainerRect.x + uContainerRect.z * (1.0 - 0.029) - 4.0,
        uContainerRect.y + uContainerRect.w * (1.0 - 0.0188) - 4.0
    );
    float dist = length(pixel - center);
    float glow = exp(-dist / 5.5) * 0.65;
    float core = 1.0 - smoothstep(3.5, 4.5, dist);
    vec3 led = vec3(0.0, 1.0, 65.0 / 255.0);
    color += led * glow;
    return sourceOverAlpha(color, led, core * 0.86);
}

vec3 blurredComposite(vec2 screenUV, vec2 pixel) {
    float blurRadius = max(uBlurStrength, 0.0);
    if (blurRadius <= 0.001) {
        return compositeScene(screenUV, pixel);
    }

    vec2 texel = blurRadius / uRect.zw;
    vec3 color = vec3(0.0);
    for (int y = -2; y <= 2; y++) {
        for (int x = -2; x <= 2; x++) {
            float fx = float(x);
            float fy = float(y);
            float wx = abs(fx) < 0.5 ? 6.0 : (abs(fx) < 1.5 ? 4.0 : 1.0);
            float wy = abs(fy) < 0.5 ? 6.0 : (abs(fy) < 1.5 ? 4.0 : 1.0);
            vec2 offset = vec2(fx, fy);
            color += compositeScene(screenUV + texel * offset, pixel + offset) * wx * wy;
        }
    }
    vec3 blurred = color / 256.0;
    return mix(compositeScene(screenUV, pixel), blurred, clamp(blurRadius, 0.0, 1.0));
}

void main() {
    vec2 topLeftPixel = vec2(gl_FragCoord.x, uOutputSize.y - gl_FragCoord.y);
    vec3 color = bodyBackground(topLeftPixel);
    color = drawMonitor(color, topLeftPixel);

    float gameMask = roundedBoxMask(topLeftPixel, uRect, uScreenCornerRadius);
    vec2 screenUV = clamp((topLeftPixel - uRect.xy) / uRect.zw, vec2(0.0), vec2(1.0));
    vec3 gameColor = parentColorFilter(blurredComposite(screenUV, topLeftPixel));
    color = sourceOverAlpha(color, gameColor, gameMask);
    color = drawBezel(color, topLeftPixel);
    color = drawPowerLed(color, topLeftPixel);

    gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
"""
