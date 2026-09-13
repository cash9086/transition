/*
 * ink-transition — una sezione nera che viene dipinta di bianco dallo scroll.
 *
 * Simula inchiostro in acqua (Navier-Stokes su GPU, WebGL2), ne registra una
 * volta sola la "mappa di arrivo" — per ogni pixel il progresso a cui l'inchiostro
 * lo raggiunge — e da lì lo scroll scorre quella mappa. Lo scrub è quindi
 * reversibile e costa una lettura di texture per fotogramma.
 *
 * Uso:
 *   InkTransition.mount({ pin: '.ink-pin', stick: '.ink-stick' });
 *
 * Struttura attesa nel documento:
 *   .ink-pin      alto qualche schermata, position: relative
 *     .ink-stick  position: sticky; top: 0; height: 100vh; overflow: hidden
 *       (il canvas viene inserito qui dal modulo)
 *       il tuo testo
 *   la sezione successiva, bianca, viene dopo .ink-pin nel flusso
 */
(function (global) {
  "use strict";

  /* Parametri: quelli messi a punto sul banco di prova. Sovrascrivibili da
     mount({ params: { ... } }) con lo stesso JSON che esporta il banco. */
  var PRESET = {
    pattern: 15, pathRepeat: 1, origin: 1,
    strokes: 22, strokeTilt: 0, strokeAlternate: 1, strokeLength: 1.12,
    strokeScatter: 0.35, strokeAngle: 6, strokeOrder: 0.2, strokeSpan: 0.12,
    strokeEase: 1.2, strokeSoft: 0.08, strokeWindow: 0.86,
    brushWidth: 0.02, brushTip: 0.34, bristle: 0.68, bristleFreq: 150,
    brushLoad: 1.05, brushDrag: 60, brushSplay: 34, brushJitter: 0.5,
    curlAmount: 44, turbulence: 90, noiseScale: 9, noiseSpeed: 0.5, noiseOnInk: 1,
    gravity: 0, velDiss: 0.12, pressureDecay: 0.9, project: 0.94, iterations: 24,
    inkTime: 7, dyeDiss: 0, diffusion: 0.09, inkMax: 1.3,
    expand: 0.64, expandVar: 0.7,
    smoke: 0.45, smokeReach: 0.7,
    threshold: 0.4, softness: 0.05, edgeNoise: 0.25, edgeScale: 16,
    simRes: 128, dyeRes: 1024, advection: 1,
    scrollSmooth: 0.5,
    pathPoints: [
      [0.9926, 0.9905], [0.9736, 0.897], [0.9615, 0.7729], [0.9531, 0.6081],
      [0.9452, 0.4016], [0.9257, 0.1901], [0.8942, 0.0868], [0.8199, 0.0573],
      [0.7663, 0.1434], [0.7236, 0.3524], [0.7036, 0.5233], [0.67, 0.7679],
      [0.6247, 0.902], [0.5663, 0.9315], [0.5052, 0.913], [0.4679, 0.7974],
      [0.4384, 0.6782], [0.4173, 0.4938], [0.4084, 0.3426], [0.3973, 0.1975],
      [0.3605, 0.1188], [0.3095, 0.0647], [0.2474, 0.1151], [0.221, 0.2799],
      [0.2126, 0.4065], [0.2052, 0.6413], [0.1958, 0.7815], [0.1558, 0.8712],
      [0.1063, 0.886], [0.0668, 0.8675], [0.04, 0.7716], [0.0205, 0.5761],
      [0.0084, 0.3167], [0.0016, 0.0352]
    ]
  };

  var BG = "#141416";
  var FRONT_SOFT = 0.026, SMOKE_LEAD = 0.055;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function smoothstep(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function el(target, root) {
    if (!target) return null;
    return typeof target === "string" ? (root || document).querySelector(target) : target;
  }

const NOISE = `
float hash13(vec3 p){
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float vnoise(vec3 x){
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i);
  float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
  return mix(mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
             mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
}
float fbm(vec3 p){
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 11.7; a *= 0.5; }
  return s;
}
`;

const HEAD = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
out vec4 fragColor;
`;

const VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPosition;
out vec2 vUv;
out vec2 vL;
out vec2 vR;
out vec2 vT;
out vec2 vB;
uniform vec2 uTexel;
void main(){
  vUv = aPosition * 0.5 + 0.5;
  vL = vUv - vec2(uTexel.x, 0.0);
  vR = vUv + vec2(uTexel.x, 0.0);
  vT = vUv + vec2(0.0, uTexel.y);
  vB = vUv - vec2(0.0, uTexel.y);
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

/* Semi-Lagrangian advection. Velocity is stored in sim-grid cells per second,
   so the backtrace distance in UV is dt * v * velocityTexelSize regardless of
   the resolution of the field being carried. */
const FS_ADVECT = HEAD + `
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 uVelTexel;
uniform float uDt;
uniform float uDissipation;
uniform float uMax;
void main(){
  vec2 vel = texture(uVelocity, vUv).xy;
  vec2 coord = vUv - uDt * vel * uVelTexel;
  fragColor = min(texture(uSource, coord) / (1.0 + uDissipation * uDt), vec4(uMax));
}`;

/* MacCormack correction: forward + backward advection, error-corrected and
   clamped to the local extrema at the backtrace point. Kills most of the
   numerical diffusion that turns ink filaments into smoke. */
const FS_MACCORMACK = HEAD + `
uniform sampler2D uVelocity;
uniform sampler2D uOrig;
uniform sampler2D uPhi1;
uniform sampler2D uPhi2;
uniform vec2 uVelTexel;
uniform vec2 uSrcTexel;
uniform float uDt;
uniform float uDissipation;
uniform float uMax;
void main(){
  vec2 vel = texture(uVelocity, vUv).xy;
  vec2 coord = vUv - uDt * vel * uVelTexel;
  float a = texture(uOrig, coord + vec2(-uSrcTexel.x, -uSrcTexel.y)).x;
  float b = texture(uOrig, coord + vec2( uSrcTexel.x, -uSrcTexel.y)).x;
  float c = texture(uOrig, coord + vec2(-uSrcTexel.x,  uSrcTexel.y)).x;
  float d = texture(uOrig, coord + vec2( uSrcTexel.x,  uSrcTexel.y)).x;
  float lo = min(min(a, b), min(c, d));
  float hi = max(max(a, b), max(c, d));
  float val = texture(uPhi1, vUv).x + 0.5 * (texture(uOrig, vUv).x - texture(uPhi2, vUv).x);
  val = clamp(val, lo, hi);
  fragColor = vec4(min(val / (1.0 + uDissipation * uDt), uMax), 0.0, 0.0, 1.0);
}`;

/* Molecular diffusion of the dye: one gaussian 3x3 tap, mixed in by amount. */
const FS_DIFFUSE = HEAD + `
uniform sampler2D uSource;
uniform vec2 uTexel;
uniform float uAmount;
void main(){
  float c  = texture(uSource, vUv).x;
  float l  = texture(uSource, vL).x;
  float r  = texture(uSource, vR).x;
  float t  = texture(uSource, vT).x;
  float b  = texture(uSource, vB).x;
  float tl = texture(uSource, vUv + vec2(-uTexel.x,  uTexel.y)).x;
  float tr = texture(uSource, vUv + vec2( uTexel.x,  uTexel.y)).x;
  float bl = texture(uSource, vUv + vec2(-uTexel.x, -uTexel.y)).x;
  float br = texture(uSource, vUv + vec2( uTexel.x, -uTexel.y)).x;
  float blur = (c * 4.0 + (l + r + t + b) * 2.0 + (tl + tr + bl + br)) / 16.0;
  fragColor = vec4(mix(c, blur, uAmount), 0.0, 0.0, 1.0);
}`;

/* Buoyancy (dye is denser or lighter than water) + curl-noise turbulence.
   The noise gradient is normalised by its own scale so the amplitude slider
   stays meaningful when you change the scale. */
/* Self-expansion. Every point steps a little way UP its own density
   gradient, so ink flows into the water around it and the wetted area grows.
   Saturated interiors have no gradient and stay put, which leaves the motion
   confined to the front — the ink creeps outward instead of translating. The
   step is driven by the change in scroll progress, not by elapsed time, so the
   spread is the same whatever the frame rate or the playback speed. */
/* Self-expansion. Every point steps a little way UP its own density
   gradient, so ink flows into the water around it and the wetted area grows.
   Saturated interiors have no gradient and stay put, which leaves the motion
   confined to the front — the ink creeps outward instead of translating. The
   step is driven by the change in scroll progress, not by elapsed time, so the
   spread is the same whatever the frame rate or the playback speed. */
const FS_EXPAND = HEAD + NOISE + `
uniform sampler2D uSource;
uniform float uAspect;
uniform float uStep;
uniform float uVar;
uniform float uNoiseScale;
uniform float uTime;
void main(){
  float c = texture(uSource, vUv).x;
  float l = texture(uSource, vL).x;
  float r = texture(uSource, vR).x;
  float t = texture(uSource, vT).x;
  float b = texture(uSource, vB).x;
  float near = max(max(l, r), max(t, b));
  vec2 gA = vec2((r - l) / uAspect, t - b);
  float mag = length(gA);
  if (mag < 1e-5 || near < 0.0008) { fragColor = vec4(c, 0.0, 0.0, 1.0); return; }
  float sp = uStep * smoothstep(0.0008, 0.01, near);
  if (uVar > 0.0) {
    float n = fbm(vec3(vUv * uNoiseScale * 1.6, uTime * 0.12));
    sp *= mix(1.0, 0.35 + 1.5 * n, uVar);
  }
  vec2 dir = gA / mag;
  fragColor = vec4(texture(uSource, vUv + vec2(dir.x / uAspect, dir.y) * sp).x, 0.0, 0.0, 1.0);
}`;

const FS_FORCES = HEAD + NOISE + `
uniform sampler2D uVelocity;
uniform sampler2D uDye;
uniform float uDt;
uniform float uGravity;
uniform float uTurb;
uniform float uNoiseScale;
uniform float uNoiseSpeed;
uniform float uTime;
uniform float uOnInk;
void main(){
  vec2 v = texture(uVelocity, vUv).xy;
  float d = texture(uDye, vUv).x;
  v.y -= uGravity * d * uDt;
  if (uTurb > 0.0) {
    float e = 0.008 * uNoiseScale;
    float t = uTime * uNoiseSpeed;
    vec2 q = vUv * uNoiseScale;
    float n1 = fbm(vec3(q + vec2(0.0, e), t));
    float n2 = fbm(vec3(q - vec2(0.0, e), t));
    float n3 = fbm(vec3(q + vec2(e, 0.0), t));
    float n4 = fbm(vec3(q - vec2(e, 0.0), t));
    vec2 curlN = vec2(n1 - n2, -(n3 - n4)) / (2.0 * e);
    float mask = mix(1.0, smoothstep(0.002, 0.25, d), uOnInk);
    v += curlN * uTurb * uDt * mask;
  }
  fragColor = vec4(v, 0.0, 1.0);
}`;

const FS_CURL = HEAD + `
uniform sampler2D uVelocity;
void main(){
  float l = texture(uVelocity, vL).y;
  float r = texture(uVelocity, vR).y;
  float t = texture(uVelocity, vT).x;
  float b = texture(uVelocity, vB).x;
  fragColor = vec4(0.5 * ((r - l) - (t - b)), 0.0, 0.0, 1.0);
}`;

/* Vorticity confinement: push velocity back along the gradient of |curl|,
   restoring the small eddies that advection numerically damps out. */
const FS_VORTICITY = HEAD + `
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform float uCurlAmount;
uniform float uDt;
void main(){
  float l = texture(uCurl, vL).x;
  float r = texture(uCurl, vR).x;
  float t = texture(uCurl, vT).x;
  float b = texture(uCurl, vB).x;
  float c = texture(uCurl, vUv).x;
  vec2 force = 0.5 * vec2(abs(t) - abs(b), abs(r) - abs(l));
  force /= length(force) + 0.0001;
  force *= uCurlAmount * c;
  force.y *= -1.0;
  vec2 v = texture(uVelocity, vUv).xy;
  v += force * uDt;
  fragColor = vec4(clamp(v, -1000.0, 1000.0), 0.0, 1.0);
}`;

const FS_DIVERGENCE = HEAD + `
uniform sampler2D uVelocity;
void main(){
  float l = texture(uVelocity, vL).x;
  float r = texture(uVelocity, vR).x;
  float t = texture(uVelocity, vT).y;
  float b = texture(uVelocity, vB).y;
  vec2 c = texture(uVelocity, vUv).xy;
  if (vL.x < 0.0) l = -c.x;
  if (vR.x > 1.0) r = -c.x;
  if (vT.y > 1.0) t = -c.y;
  if (vB.y < 0.0) b = -c.y;
  fragColor = vec4(0.5 * ((r - l) + (t - b)), 0.0, 0.0, 1.0);
}`;

const FS_CLEAR = HEAD + `
uniform sampler2D uTexture;
uniform float uValue;
void main(){ fragColor = uValue * texture(uTexture, vUv); }`;

const FS_PRESSURE = HEAD + `
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
void main(){
  float l = texture(uPressure, vL).x;
  float r = texture(uPressure, vR).x;
  float t = texture(uPressure, vT).x;
  float b = texture(uPressure, vB).x;
  float div = texture(uDivergence, vUv).x;
  fragColor = vec4((l + r + b + t - div) * 0.25, 0.0, 0.0, 1.0);
}`;

/* uProject < 1 leaves the field partly compressible on purpose: sources can
   then actually push outward, which is what lets injected ink expand. */
const FS_GRADIENT = HEAD + `
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
uniform float uProject;
void main(){
  float l = texture(uPressure, vL).x;
  float r = texture(uPressure, vR).x;
  float t = texture(uPressure, vT).x;
  float b = texture(uPressure, vB).x;
  vec2 v = texture(uVelocity, vUv).xy;
  v -= uProject * vec2(r - l, t - b);
  fragColor = vec4(v, 0.0, 1.0);
}`;

/* The brush stamp. A capsule in the brush's own frame: uWidth across the
   travel direction, uTip along it, swept over uHalfLen. Bristle striations
   are a function of the ACROSS coordinate only, so they stay continuous down
   the length of a stroke the way real bristles do. Drawn with additive
   blending inside a scissor box, so one stroke costs a few thousand pixels
   instead of a full-screen pass per stamp. */
const FS_BRUSH = HEAD + NOISE + `
uniform vec2 uPoint;
uniform vec2 uDir;
uniform float uHalfLen;
uniform float uWidth;
uniform float uTip;
uniform float uBristle;
uniform float uBristleFreq;
uniform float uSeed;
uniform float uAspect;
uniform float uAmount;
uniform float uDrag;
uniform float uSplay;
uniform int uIsVel;
void main(){
  vec2 p = vUv - uPoint;
  p.x *= uAspect;
  vec2 t = uDir;
  vec2 nrm = vec2(-t.y, t.x);
  float along = max(abs(dot(p, t)) - uHalfLen, 0.0);
  float across = dot(p, nrm);
  float q = (along * along) / (uTip * uTip) + (across * across) / (uWidth * uWidth);
  float f = exp(-q * 2.2);
  if (uBristle > 0.0) {
    float s1 = fbm(vec3(across * uBristleFreq, uSeed, 0.0));
    float s2 = fbm(vec3(across * uBristleFreq * 0.37, uSeed * 1.7, dot(p, t) * 4.0));
    /* fbm clusters around its mean, so stretch it: without this the striations
       never reach zero and the brush can never run dry. */
    float streak = smoothstep(0.34, 1.16, s1 * 1.1 + s2 * 0.5) * 1.5;
    f *= mix(1.0, streak, uBristle);
  }
  vec3 add = uIsVel == 1
    ? vec3(t * uDrag + nrm * uSplay * clamp(across / uWidth, -1.5, 1.5), 0.0)
    : vec3(uAmount, 0.0, 0.0);
  fragColor = vec4(f * add, 1.0);
}`;

const INK_MASK = `
float inkDensity(sampler2D tex, vec2 uv, float eNoise, float eScale, float time){
  if (eNoise > 0.0) {
    float n1 = fbm(vec3(uv * eScale, time * 0.06));
    float n2 = fbm(vec3(uv * eScale + 37.2, time * 0.06));
    uv += (vec2(n1, n2) - 0.5) * eNoise * 0.06;
  }
  return texture(tex, uv).x;
}
`;

/* The arrival map: for every pixel, the progress at which the ink first
   reached it. Recorded during a forward run, it turns a one-way fluid into
   something that can be scrubbed in both directions for the cost of a single
   texture read. One channel, same format as the dye, sampled without
   filtering — the map is finer than the screen, so there is nothing to gain
   from interpolating it and plenty to lose. */
const FS_ARRIVAL = HEAD + NOISE + INK_MASK + `
uniform sampler2D uDye;
uniform sampler2D uArrival;
uniform float uProgress;
uniform float uThreshold;
uniform float uSoftness;
uniform float uEdgeNoise;
uniform float uEdgeScale;
uniform float uSmokeReach;
uniform float uTime;
uniform float uStep;
uniform float uRef;
void main(){
  float d = inkDensity(uDye, vUv, uEdgeNoise, uEdgeScale, uTime);
  float prev = texture(uArrival, vUv).x;
  float result = prev;
  /* Recording only "it crossed during this step" would stamp one value across
     everything the brush swept in that step — a terrace as wide as the brush
     travels. How far the density overshot the threshold says how early in the
     step the crossing happened, which places the arrival inside the step
     instead of at its end. */
  if (prev > 1.5 && smoothstep(uThreshold - uSoftness, uThreshold + uSoftness, d) > 0.5) {
    float f = clamp((d - uThreshold) / max(uRef - uThreshold, 1e-4), 0.0, 1.0);
    result = uProgress - uStep * f;
  }
  fragColor = vec4(result, 0.0, 0.0, 1.0);
}`;

  /* Il display di produzione legge solo la mappa: niente solver per fotogramma. */
  var FS_DISPLAY = HEAD + [
    "uniform sampler2D uArrival;",
    "uniform float uProgress;",
    "uniform float uFront;",
    "uniform float uSmoke;",
    "uniform float uSmokeLead;",
    "uniform float uQuant;",
    "uniform vec3 uBg;",
    "void main(){",
    "  float arr = max(texture(uArrival, vUv).x",
    "            + (fract(sin(dot(vUv, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * uQuant, 0.0);",
    "  float a = smoothstep(arr, arr + uFront, uProgress);",
    "  float hazeStart = max(arr - uSmokeLead, 0.0);",
    "  a = max(a, smoothstep(hazeStart, max(arr, hazeStart + uFront), uProgress) * uSmoke);",
    "  fragColor = vec4(mix(uBg, vec3(1.0), a), 1.0);",
    "}"
  ].join("\n");

  function hexToRgb(hex) {
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    if (!m) return [0.0784314, 0.0784314, 0.0862745];
    return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255];
  }

  function create(opts) {
    var pin = el(opts.pin);
    if (!pin) return null;
    var stick = el(opts.stick, pin) || pin.firstElementChild || pin;
    var fadeEl = opts.fade ? el(opts.fade, pin) : null;
    var prm = {};
    for (var k in PRESET) if (Object.prototype.hasOwnProperty.call(PRESET, k)) prm[k] = PRESET[k];
    if (opts.params) for (var k2 in opts.params) if (k2 in prm) prm[k2] = opts.params[k2];
    if (opts.params && Array.isArray(opts.params.pathPoints)) prm.pathPoints = opts.params.pathPoints;

    var lead = opts.lead != null ? opts.lead : 0.06;
    var tail = opts.tail != null ? opts.tail : 0.12;
    var bgRgb = hexToRgb(opts.background || BG);

    /* ---- canvas ---- */
    var canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    var cs = canvas.style;
    cs.position = "absolute"; cs.inset = "0"; cs.top = "0"; cs.left = "0";
    cs.width = "100%"; cs.height = "100%"; cs.display = "block";
    cs.zIndex = "0"; cs.pointerEvents = "none";
    cs.background = opts.background || BG;
    if (getComputedStyle(stick).position === "static") stick.style.position = "relative";
    /* i figli esistenti devono stare sopra il canvas */
    for (var i = 0; i < stick.children.length; i++) {
      var ch = stick.children[i];
      if (getComputedStyle(ch).position === "static") ch.style.position = "relative";
      if (!ch.style.zIndex) ch.style.zIndex = "1";
    }
    stick.insertBefore(canvas, stick.firstChild);

    var reduced = global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var gl = null;
    if (!reduced) {
      try {
        gl = canvas.getContext("webgl2", {
          alpha: false, depth: false, stencil: false, antialias: false,
          preserveDrawingBuffer: false, powerPreference: "high-performance"
        });
      } catch (e) { gl = null; }
      if (gl && !gl.getExtension("EXT_color_buffer_float")) gl = null;
    }

    /* Senza WebGL2, o con movimento ridotto richiesto: dissolvenza semplice.
       La sezione fa comunque il suo mestiere, solo senza inchiostro. */
    if (!gl) return plain(canvas, pin, fadeEl, lead, tail, opts);

    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);

    function compile(type, src) {
      var sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.error("[ink] shader:", gl.getShaderInfoLog(sh));
        return null;
      }
      return sh;
    }
    var vertexShader = compile(gl.VERTEX_SHADER, VERT);
    if (!vertexShader) return plain(canvas, pin, fadeEl, lead, tail, opts);

    function Program(fs) {
      this.program = gl.createProgram();
      gl.attachShader(this.program, vertexShader);
      gl.attachShader(this.program, compile(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(this.program);
      this.u = {};
      var n = gl.getProgramParameter(this.program, gl.ACTIVE_UNIFORMS);
      for (var i = 0; i < n; i++) {
        var name = gl.getActiveUniform(this.program, i).name;
        this.u[name] = gl.getUniformLocation(this.program, name);
      }
    }
    Program.prototype.bind = function (tx, ty) {
      gl.useProgram(this.program);
      gl.uniform2f(this.u.uTexel, tx || 0, ty || 0);
      return this.u;
    };

    var P_ADVECT = new Program(FS_ADVECT), P_MACCORMACK = new Program(FS_MACCORMACK);
    var P_DIFFUSE = new Program(FS_DIFFUSE), P_EXPAND = new Program(FS_EXPAND);
    var P_FORCES = new Program(FS_FORCES), P_CURL = new Program(FS_CURL);
    var P_VORTICITY = new Program(FS_VORTICITY), P_DIVERGENCE = new Program(FS_DIVERGENCE);
    var P_CLEAR = new Program(FS_CLEAR), P_PRESSURE = new Program(FS_PRESSURE);
    var P_GRADIENT = new Program(FS_GRADIENT), P_BRUSH = new Program(FS_BRUSH);
    var P_ARRIVAL = new Program(FS_ARRIVAL), P_DISPLAY = new Program(FS_DISPLAY);

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);

    function blit(target) {
      gl.disable(gl.SCISSOR_TEST);
      gl.disable(gl.BLEND);
      if (target === null) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      } else {
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
        gl.viewport(0, 0, target.width, target.height);
      }
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    }

    function blitBox(target, cx, cy, hx, hy) {
      var W = target.width, H = target.height;
      var x0 = Math.max(0, Math.floor((cx - hx) * W));
      var y0 = Math.max(0, Math.floor((cy - hy) * H));
      var x1 = Math.min(W, Math.ceil((cx + hx) * W));
      var y1 = Math.min(H, Math.ceil((cy + hy) * H));
      if (x1 <= x0 || y1 <= y0) return;
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
      gl.viewport(0, 0, W, H);
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(x0, y0, x1 - x0, y1 - y0);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
      gl.disable(gl.BLEND);
      gl.disable(gl.SCISSOR_TEST);
    }

    function createFBO(w, h, internal, format, type, filter) {
      gl.activeTexture(gl.TEXTURE0);
      var texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);
      var fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return {
        texture: texture, fbo: fbo, width: w, height: h, texelX: 1 / w, texelY: 1 / h,
        attach: function (unit) {
          gl.activeTexture(gl.TEXTURE0 + unit);
          gl.bindTexture(gl.TEXTURE_2D, texture);
          return unit;
        },
        dispose: function () { gl.deleteTexture(texture); gl.deleteFramebuffer(fbo); }
      };
    }
    function createDouble(w, h, internal, format, type, filter) {
      return {
        read: createFBO(w, h, internal, format, type, filter),
        write: createFBO(w, h, internal, format, type, filter),
        width: w, height: h, texelX: 1 / w, texelY: 1 / h,
        swap: function () { var t = this.read; this.read = this.write; this.write = t; },
        dispose: function () { this.read.dispose(); this.write.dispose(); }
      };
    }

    var velocity, pressure, dye, dyeTmp1, dyeTmp2, divergence, curl, arrival;
    var simTime = 0, bakeSteps = 420;

    function gridFor(res) {
      var aspect = gl.drawingBufferWidth / gl.drawingBufferHeight;
      if (aspect < 1) aspect = 1 / aspect;
      var mn = Math.round(res), mx = Math.round(res * aspect);
      return gl.drawingBufferWidth > gl.drawingBufferHeight
        ? { w: mx, h: mn } : { w: mn, h: mx };
    }

    function quality() {
      var q = opts.quality || "auto";
      var dye = prm.dyeRes, sim = prm.simRes, steps = Math.round(prm.inkTime * 60);
      var narrow = Math.min(global.innerWidth, global.innerHeight) <= 540 || global.innerWidth <= 760;
      if (q === "low" || (q === "auto" && narrow)) {
        dye = Math.min(dye, 640); sim = Math.min(sim, 96); steps = Math.min(steps, 300);
      }
      return { dye: dye, sim: sim, steps: clamp(steps, 150, 640) };
    }

    function initFramebuffers() {
      var q = quality();
      bakeSteps = q.steps;
      var HALF = gl.HALF_FLOAT, L = gl.LINEAR;
      var sim = gridFor(q.sim), ink = gridFor(q.dye);
      [velocity, pressure, divergence, curl, dye, dyeTmp1, dyeTmp2, arrival].forEach(function (t) {
        if (t && t.dispose) t.dispose();
      });
      velocity = createDouble(sim.w, sim.h, gl.RG16F, gl.RG, HALF, L);
      pressure = createDouble(sim.w, sim.h, gl.R16F, gl.RED, HALF, gl.NEAREST);
      divergence = createFBO(sim.w, sim.h, gl.R16F, gl.RED, HALF, gl.NEAREST);
      curl = createFBO(sim.w, sim.h, gl.R16F, gl.RED, HALF, gl.NEAREST);
      dye = createDouble(ink.w, ink.h, gl.R16F, gl.RED, HALF, L);
      dyeTmp1 = createFBO(ink.w, ink.h, gl.R16F, gl.RED, HALF, L);
      dyeTmp2 = createFBO(ink.w, ink.h, gl.R16F, gl.RED, HALF, L);
      arrival = createDouble(ink.w, ink.h, gl.R16F, gl.RED, HALF, gl.NEAREST);
      clearArrival();
    }

    function clearTarget(t) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
      gl.viewport(0, 0, t.width, t.height);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    function clearArrival() {
      [arrival.read, arrival.write].forEach(function (t) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
        gl.viewport(0, 0, t.width, t.height);
        gl.clearColor(2, 2, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
      });
      gl.clearColor(0, 0, 0, 1);
    }
    function resetSim() {
      [velocity.read, velocity.write, pressure.read, pressure.write,
       dye.read, dye.write, dyeTmp1, dyeTmp2, divergence, curl].forEach(clearTarget);
      simTime = 0;
    }

    /* ---- una pennellata: capsula di inchiostro più la velocità che trascina ---- */
    function stamp(cx, cy, tx, ty, halfLen, width, tip, amount, drag, splay, seed, bristle) {
      var aspect = canvas.width / canvas.height;
      var reachA = halfLen + 2.4 * tip;
      var hx = (Math.abs(tx) * reachA + Math.abs(ty) * 2.4 * width) / aspect;
      var hy = Math.abs(ty) * reachA + Math.abs(tx) * 2.4 * width;
      var u = P_BRUSH.bind();
      gl.uniform2f(u.uPoint, cx, cy);
      gl.uniform2f(u.uDir, tx, ty);
      gl.uniform1f(u.uHalfLen, halfLen);
      gl.uniform1f(u.uWidth, width);
      gl.uniform1f(u.uTip, tip);
      gl.uniform1f(u.uBristle, bristle);
      gl.uniform1f(u.uBristleFreq, prm.bristleFreq);
      gl.uniform1f(u.uSeed, seed);
      gl.uniform1f(u.uAspect, aspect);
      gl.uniform1f(u.uDrag, drag);
      gl.uniform1f(u.uSplay, splay);
      gl.uniform1i(u.uIsVel, 1);
      blitBox(velocity.read, cx, cy, hx, hy);
      gl.uniform1i(u.uIsVel, 0);
      gl.uniform1f(u.uAmount, amount);
      blitBox(dye.read, cx, cy, hx, hy);
    }

    /* ---- un passo di solver ---- */
    function step(dt, dp) {
      simTime += dt;
      var vt = [velocity.texelX, velocity.texelY], u;

      if (prm.curlAmount > 0) {
        u = P_CURL.bind(vt[0], vt[1]);
        gl.uniform1i(u.uVelocity, velocity.read.attach(0));
        blit(curl);
        u = P_VORTICITY.bind(vt[0], vt[1]);
        gl.uniform1i(u.uVelocity, velocity.read.attach(0));
        gl.uniform1i(u.uCurl, curl.attach(1));
        gl.uniform1f(u.uCurlAmount, prm.curlAmount);
        gl.uniform1f(u.uDt, dt);
        blit(velocity.write); velocity.swap();
      }
      if (prm.gravity !== 0 || prm.turbulence > 0) {
        u = P_FORCES.bind(vt[0], vt[1]);
        gl.uniform1i(u.uVelocity, velocity.read.attach(0));
        gl.uniform1i(u.uDye, dye.read.attach(1));
        gl.uniform1f(u.uDt, dt);
        gl.uniform1f(u.uGravity, prm.gravity);
        gl.uniform1f(u.uTurb, prm.turbulence);
        gl.uniform1f(u.uNoiseScale, prm.noiseScale);
        gl.uniform1f(u.uNoiseSpeed, prm.noiseSpeed);
        gl.uniform1f(u.uTime, simTime);
        gl.uniform1f(u.uOnInk, prm.noiseOnInk ? 1 : 0);
        blit(velocity.write); velocity.swap();
      }

      u = P_DIVERGENCE.bind(vt[0], vt[1]);
      gl.uniform1i(u.uVelocity, velocity.read.attach(0));
      blit(divergence);

      u = P_CLEAR.bind();
      gl.uniform1i(u.uTexture, pressure.read.attach(0));
      gl.uniform1f(u.uValue, prm.pressureDecay);
      blit(pressure.write); pressure.swap();

      u = P_PRESSURE.bind(vt[0], vt[1]);
      gl.uniform1i(u.uDivergence, divergence.attach(0));
      for (var i = 0; i < prm.iterations; i++) {
        gl.uniform1i(u.uPressure, pressure.read.attach(1));
        blit(pressure.write); pressure.swap();
      }

      u = P_GRADIENT.bind(vt[0], vt[1]);
      gl.uniform1i(u.uPressure, pressure.read.attach(0));
      gl.uniform1i(u.uVelocity, velocity.read.attach(1));
      gl.uniform1f(u.uProject, prm.project);
      blit(velocity.write); velocity.swap();

      u = P_ADVECT.bind(vt[0], vt[1]);
      gl.uniform1i(u.uVelocity, velocity.read.attach(0));
      gl.uniform1i(u.uSource, velocity.read.attach(0));
      gl.uniform2f(u.uVelTexel, vt[0], vt[1]);
      gl.uniform1f(u.uDt, dt);
      gl.uniform1f(u.uDissipation, prm.velDiss);
      gl.uniform1f(u.uMax, 1e6);
      blit(velocity.write); velocity.swap();

      var dt2 = [dye.texelX, dye.texelY];
      if (prm.advection === 1) {
        u = P_ADVECT.bind(dt2[0], dt2[1]);
        gl.uniform1i(u.uVelocity, velocity.read.attach(0));
        gl.uniform1i(u.uSource, dye.read.attach(1));
        gl.uniform2f(u.uVelTexel, vt[0], vt[1]);
        gl.uniform1f(u.uDt, dt);
        gl.uniform1f(u.uDissipation, 0);
        gl.uniform1f(u.uMax, 1e6);
        blit(dyeTmp1);

        u = P_ADVECT.bind(dt2[0], dt2[1]);
        gl.uniform1i(u.uVelocity, velocity.read.attach(0));
        gl.uniform1i(u.uSource, dyeTmp1.attach(1));
        gl.uniform2f(u.uVelTexel, vt[0], vt[1]);
        gl.uniform1f(u.uDt, -dt);
        gl.uniform1f(u.uDissipation, 0);
        gl.uniform1f(u.uMax, 1e6);
        blit(dyeTmp2);

        u = P_MACCORMACK.bind(dt2[0], dt2[1]);
        gl.uniform1i(u.uVelocity, velocity.read.attach(0));
        gl.uniform1i(u.uOrig, dye.read.attach(1));
        gl.uniform1i(u.uPhi1, dyeTmp1.attach(2));
        gl.uniform1i(u.uPhi2, dyeTmp2.attach(3));
        gl.uniform2f(u.uVelTexel, vt[0], vt[1]);
        gl.uniform2f(u.uSrcTexel, dt2[0], dt2[1]);
        gl.uniform1f(u.uDt, dt);
        gl.uniform1f(u.uDissipation, prm.dyeDiss);
        gl.uniform1f(u.uMax, prm.inkMax);
        blit(dye.write); dye.swap();
      } else {
        u = P_ADVECT.bind(dt2[0], dt2[1]);
        gl.uniform1i(u.uVelocity, velocity.read.attach(0));
        gl.uniform1i(u.uSource, dye.read.attach(1));
        gl.uniform2f(u.uVelTexel, vt[0], vt[1]);
        gl.uniform1f(u.uDt, dt);
        gl.uniform1f(u.uDissipation, prm.dyeDiss);
        gl.uniform1f(u.uMax, prm.inkMax);
        blit(dye.write); dye.swap();
      }

      if (prm.diffusion > 0) {
        u = P_DIFFUSE.bind(dt2[0], dt2[1]);
        gl.uniform1i(u.uSource, dye.read.attach(0));
        gl.uniform2f(u.uTexel, dt2[0], dt2[1]);
        gl.uniform1f(u.uAmount, Math.min(1, prm.diffusion * dt * 60));
        blit(dye.write); dye.swap();
      }

      if (prm.expand > 0 && dp > 0) {
        var total = prm.expand * dp;
        var iters = Math.min(40, Math.max(1, Math.ceil(total / (1.2 * dt2[1]))));
        u = P_EXPAND.bind(dt2[0], dt2[1]);
        gl.uniform1f(u.uAspect, canvas.width / canvas.height);
        gl.uniform1f(u.uStep, total / iters);
        gl.uniform1f(u.uVar, prm.expandVar);
        gl.uniform1f(u.uNoiseScale, prm.noiseScale);
        gl.uniform1f(u.uTime, simTime);
        for (var j = 0; j < iters; j++) {
          gl.uniform1i(u.uSource, dye.read.attach(0));
          blit(dye.write); dye.swap();
        }
      }
    }

    /* ---- il tracciato ---- */
    function mulberry32(a) {
      return function () {
        a = (a + 0x6D2B79F5) | 0;
        var t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    function bez(st, t) {
      var mt = 1 - t, a = mt * mt * mt, b = 3 * mt * mt * t, c = 3 * mt * t * t, d = t * t * t;
      return [a * st.p0[0] + b * st.p1[0] + c * st.p2[0] + d * st.p3[0],
              a * st.p0[1] + b * st.p1[1] + c * st.p2[1] + d * st.p3[1]];
    }
    function bezTangent(st, t) {
      var mt = 1 - t, a = 3 * mt * mt, b = 6 * mt * t, c = 3 * t * t;
      return [a * (st.p1[0] - st.p0[0]) + b * (st.p2[0] - st.p1[0]) + c * (st.p3[0] - st.p2[0]),
              a * (st.p1[1] - st.p0[1]) + b * (st.p2[1] - st.p1[1]) + c * (st.p3[1] - st.p2[1])];
    }
    function pathLen(st, aspect) {
      var total = 0, prev = bez(st, 0);
      for (var k = 1; k <= 10; k++) {
        var q = bez(st, k / 10);
        total += Math.hypot((q[0] - prev[0]) * aspect, q[1] - prev[1]);
        prev = q;
      }
      return total;
    }
    function splineStrokes(pts) {
      var out = [];
      for (var i = 0; i < pts.length - 1; i++) {
        var a = pts[Math.max(0, i - 1)], b = pts[i];
        var c = pts[i + 1], d = pts[Math.min(pts.length - 1, i + 2)];
        out.push({
          p0: b.slice(),
          p1: [b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6],
          p2: [c[0] - (d[0] - b[0]) / 6, c[1] - (d[1] - b[1]) / 6],
          p3: c.slice()
        });
      }
      return out;
    }

    var ORIGINS = [[0.5, 0.5], [0.5, 0.93], [0.5, 0.07], [0.07, 0.5], [0.93, 0.5]];
    var strokes = [];

    function buildStrokes() {
      var n = Math.max(2, prm.strokes);
      var aspect = (canvas.width / canvas.height) || 1;
      var rnd = mulberry32(20260911);
      var out = [], tilt = prm.strokeTilt * Math.PI / 180, continuous = false;
      var toUv = function (ax, ay) { return [0.5 + ax / aspect, 0.5 + ay]; };

      if (prm.pattern === 14) {
        continuous = true;
        var rows = Math.max(2, 2 * Math.round(n / 2));
        var ov = 0.02, xR = 1 + ov, xL = -ov, top = 1.05, bot = -0.05;
        var drop = (top - bot) / (rows - 1), y = top;
        for (var i = 0; i < rows; i++) {
          var goLeft = i % 2 === 0;
          var x0 = goLeft ? xR : xL, x1 = goLeft ? xL : xR;
          var yEnd = y - drop * 0.14, bow = (rnd() - 0.5) * 0.05;
          out.push({ p0: [x0, y], p1: [x0 + (x1 - x0) * 0.33, y + bow],
                     p2: [x0 + (x1 - x0) * 0.66, yEnd - bow * 0.6], p3: [x1, yEnd],
                     seed: rnd() * 100, tin: i === 0, tout: i === rows - 1 });
          if (i < rows - 1) {
            var yB = y - drop, bulge = (goLeft ? -1 : 1) * 0.085;
            out.push({ p0: [x1, yEnd], p1: [x1 + bulge, yEnd - drop * 0.22],
                       p2: [x1 + bulge, yB + drop * 0.22], p3: [x1, yB],
                       seed: rnd() * 100, tin: false, tout: false });
            y = yB;
          }
        }
      } else if (prm.pattern === 15) {
        continuous = true;
        var pts = prm.pathPoints || [];
        if (pts.length >= 2) {
          var a0 = pts[0], b0 = pts[pts.length - 1];
          var dx = (b0[0] - a0[0]) * aspect, dy = b0[1] - a0[1];
          var m = Math.hypot(dx, dy) || 1, nx = -dy / m, ny = dx / m;
          var reps = Math.max(1, prm.pathRepeat);
          for (var k = 0; k < reps; k++) {
            var off = (k - (reps - 1) / 2) * prm.brushWidth * 1.35;
            var ox = nx * off / aspect, oy = ny * off;
            var segs = splineStrokes(pts);
            for (var j = 0; j < segs.length; j++) {
              var st = segs[j];
              out.push({ p0: [st.p0[0] + ox, st.p0[1] + oy], p1: [st.p1[0] + ox, st.p1[1] + oy],
                         p2: [st.p2[0] + ox, st.p2[1] + oy], p3: [st.p3[0] + ox, st.p3[1] + oy],
                         seed: rnd() * 100, tin: j === 0, tout: j === segs.length - 1 });
            }
          }
        }
      } else {
        var nx2 = -Math.sin(tilt), ny2 = Math.cos(tilt);
        var bandExtent = Math.abs(Math.sin(tilt)) * aspect + Math.abs(Math.cos(tilt));
        var org = ORIGINS[prm.origin] || ORIGINS[0];
        var oA = [(org[0] - 0.5) * aspect, org[1] - 0.5];
        var entries = [];
        for (var e1 = 0; e1 < n; e1++) {
          var f = n > 1 ? e1 / (n - 1) : 0.5;
          var offb = (f - 0.5) * bandExtent * 1.08 + (rnd() - 0.5) * 0.16 * prm.strokeScatter;
          entries.push({ ax: offb * nx2, ay: offb * ny2, r1: rnd(), r2: rnd(), r3: rnd(), r4: rnd() });
        }
        entries.sort(function (a, b) {
          return Math.hypot(a.ax - oA[0], a.ay - oA[1]) - Math.hypot(b.ax - oA[0], b.ay - oA[1]);
        });
        entries.forEach(function (e, idx) {
          var cross = prm.pattern === 13 ? (idx % 2 === 0 ? 0.36 : -0.36) : 0;
          var ang = tilt + cross + (e.r1 - 0.5) * 2 * prm.strokeAngle * Math.PI / 180;
          var dir = prm.strokeAlternate && idx % 2 === 1 ? -1 : 1;
          var reach = Math.abs(Math.cos(ang)) * aspect + Math.abs(Math.sin(ang));
          var slide = (e.r2 - 0.5) * 0.34 * prm.strokeScatter;
          var len = prm.strokeLength * reach * (0.94 + 0.16 * e.r3) + 2 * Math.abs(slide);
          var ux = Math.cos(ang), uy = Math.sin(ang);
          var cx = e.ax + slide * ux, cy = e.ay + slide * uy;
          var hx = ux * len * 0.5 * dir, hy = uy * len * 0.5 * dir;
          var bw = (e.r4 - 0.5) * 0.22, bx = -uy * bw, by = ux * bw;
          out.push({
            p0: toUv(cx - hx, cy - hy),
            p1: toUv(cx - hx * 0.34 + bx * 0.6, cy - hy * 0.34 + by * 0.6),
            p2: toUv(cx + hx * 0.34 + bx, cy + hy * 0.34 + by),
            p3: toUv(cx + hx, cy + hy),
            seed: rnd() * 100, tin: true, tout: true
          });
        });
      }

      var wEnd = Math.max(0.1, prm.strokeWindow);
      if (continuous) {
        var w = out.map(function (st) { return Math.pow(pathLen(st, aspect), 0.8); });
        var total = w.reduce(function (a, b) { return a + b; }, 0) || 1, acc = 0;
        out.forEach(function (st, i) {
          var t0 = acc / total;
          acc += w[i];
          st.start = t0 * wEnd;
          st.span = Math.max(0.012, (acc / total - t0) * wEnd * 1.15);
        });
      } else {
        var spanE = Math.min(prm.strokeSpan, Math.max(0.03, wEnd * 0.9));
        var slots = out.map(function (_, i) { return i; });
        if (prm.strokeOrder > 0) {
          var jitter = prm.strokeOrder * out.length * 0.9;
          var keys = out.map(function (_, i) { return i + rnd() * jitter; });
          slots.sort(function (a, b) { return keys[a] - keys[b]; });
        }
        slots.forEach(function (si, slot) {
          var st = out[si];
          st.span = spanE;
          st.start = (out.length > 1 ? slot / (out.length - 1) : 0) * Math.max(0, wEnd - spanE);
        });
      }
      strokes = out;
    }

    /* ---- deposizione lungo il tracciato ---- */
    function easeAt(u, e) { return 1 - Math.pow(1 - u, e); }
    function envAt(u, soft, tin, tout) {
      var k = Math.max(0.005, soft);
      return (tin ? smoothstep(0, k, u) : 1) * (tout ? smoothstep(1, 1 - k, u) : 1);
    }

    var simProgress = 0, simPrev = 0;

    function brushEmit() {
      var aspect = (canvas.width / canvas.height) || 1;
      var width = prm.brushWidth;
      var tip = Math.max(0.004, width * prm.brushTip);
      var stepLen = Math.max(0.003, tip * 0.55);
      var budget = 700;

      for (var i = 0; i < strokes.length; i++) {
        var st = strokes[i];
        if (budget <= 0) break;
        var span = Math.max(0.012, st.span);
        var l1 = (simProgress - st.start) / span;
        var l0 = (simPrev - st.start) / span;
        if (l1 <= 0 || l0 >= 1) continue;
        l1 = Math.min(1, l1);
        l0 = Math.max(0, Math.min(1, l0));
        if (l1 <= l0) continue;

        var a0 = bez(st, easeAt(l0, prm.strokeEase)), a1 = bez(st, easeAt(l1, prm.strokeEase));
        var reach = Math.hypot((a1[0] - a0[0]) * aspect, a1[1] - a0[1]);
        var K = Math.max(1, Math.min(48, Math.ceil(reach / stepLen)));
        K = Math.min(K, budget);
        budget -= K;

        var prev = a0;
        for (var k = 1; k <= K; k++) {
          var u = l0 + (l1 - l0) * k / K;
          var sv = easeAt(u, prm.strokeEase);
          var pt = bez(st, sv);
          var tg = bezTangent(st, sv);
          var tx = tg[0] * aspect, ty = tg[1];
          var m = Math.hypot(tx, ty) || 1;
          tx /= m; ty /= m;
          if (prm.brushJitter > 0) {
            var w = prm.brushJitter * 0.05 *
              (Math.sin(sv * 13.7 + st.seed) * 0.6 + Math.sin(sv * 31.1 + st.seed * 2.3) * 0.25);
            pt = [pt[0] - ty * w / aspect, pt[1] + tx * w];
          }
          var segLen = Math.hypot((pt[0] - prev[0]) * aspect, pt[1] - prev[1]);
          var mx = (pt[0] + prev[0]) * 0.5, my = (pt[1] + prev[1]) * 0.5;
          prev = pt;
          var env = envAt(u, prm.strokeSoft, st.tin !== false, st.tout !== false);
          if (env <= 0.002 || segLen <= 0) continue;
          var perLen = segLen / tip * env;
          stamp(mx, my, tx, ty, segLen * 0.5, width * (0.6 + 0.4 * env), tip,
                prm.brushLoad * perLen, prm.brushDrag * perLen, prm.brushSplay * perLen,
                st.seed, prm.bristle);
        }
      }
    }

    /* Il tempo di fluido si spende per unità di progresso, non di orologio: così
       i vortici vengono identici comunque si scorra. Il passo non viene mai
       allungato oltre un fotogramma, perché un passo lungo è un altro fluido. */
    function advance(pFrom, pTo, cap) {
      var dp = Math.max(0, pTo - pFrom);
      var simTotal = dp * prm.inkTime;
      if (simTotal <= 0) { simPrev = pTo; simProgress = pTo; return; }
      var n = Math.max(1, Math.min(cap || 12, Math.ceil(simTotal / (1 / 60))));
      var dtSub = Math.min(1 / 60, simTotal / n);
      for (var i = 1; i <= n; i++) {
        var a = pFrom + dp * ((i - 1) / n);
        var b = pFrom + dp * (i / n);
        simPrev = a; simProgress = b;
        brushEmit();
        step(dtSub, b - a);
      }
      simPrev = pTo; simProgress = pTo;
    }

    function recordArrival(pAt, stepSize) {
      var u = P_ARRIVAL.bind();
      gl.uniform1i(u.uDye, dye.read.attach(0));
      gl.uniform1i(u.uArrival, arrival.read.attach(1));
      gl.uniform1f(u.uProgress, pAt);
      gl.uniform1f(u.uThreshold, prm.threshold);
      gl.uniform1f(u.uSoftness, prm.softness);
      gl.uniform1f(u.uEdgeNoise, prm.edgeNoise);
      gl.uniform1f(u.uEdgeScale, prm.edgeScale);
      gl.uniform1f(u.uTime, simTime);
      gl.uniform1f(u.uStep, stepSize);
      gl.uniform1f(u.uRef, prm.threshold + (prm.inkMax - prm.threshold) * 0.7);
      blit(arrival.write);
      arrival.swap();
    }

    var baked = false, baking = false, bakeStep = 0;

    function startBake() {
      resetSim();
      clearArrival();
      baking = true; baked = false; bakeStep = 0;
      simProgress = 0; simPrev = 0;
      if (opts.onBakeStart) opts.onBakeStart();
    }

    function bakeChunk(budgetMs) {
      var t0 = (global.performance || Date).now();
      while (baking && (global.performance || Date).now() - t0 < budgetMs) {
        var a = bakeStep / bakeSteps, b = (bakeStep + 1) / bakeSteps;
        advance(a, b, 12);
        recordArrival(b * (1 - FRONT_SOFT), (1 - FRONT_SOFT) / bakeSteps);
        if (++bakeStep >= bakeSteps) {
          baking = false; baked = true;
          resetSim();
          if (opts.onReady) opts.onReady();
        }
      }
      if (opts.onBakeProgress && baking) opts.onBakeProgress(bakeStep / bakeSteps);
    }

    function render(p) {
      var u = P_DISPLAY.bind();
      gl.uniform1i(u.uArrival, arrival.read.attach(0));
      gl.uniform1f(u.uProgress, p);
      gl.uniform1f(u.uFront, FRONT_SOFT);
      gl.uniform1f(u.uSmoke, prm.smoke);
      gl.uniform1f(u.uSmokeLead, SMOKE_LEAD);
      gl.uniform1f(u.uQuant, 1 / bakeSteps);
      gl.uniform3f(u.uBg, bgRgb[0], bgRgb[1], bgRgb[2]);
      blit(null);
    }

    /* ---- lo scroll ---- */
    var progress = 0, lastFade = -1, lastT = 0, rafId = 0, active = false;
    var lastW = 0, lastH = 0;

    function applySize() {
      var dpr = Math.min(global.devicePixelRatio || 1, opts.maxDpr || 2);
      var w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
      if (!w || !h) return false;
      if (canvas.width === w && canvas.height === h) return false;
      canvas.width = w; canvas.height = h;
      return true;
    }

    function computeTarget() {
      var rect = pin.getBoundingClientRect();
      var span = pin.offsetHeight - global.innerHeight;
      var raw = span > 0 ? clamp(-rect.top / span, 0, 1) : (rect.top <= 0 ? 1 : 0);
      return clamp((raw - lead) / Math.max(0.05, 1 - lead - tail), 0, 1);
    }

    function applyFade(p) {
      if (!fadeEl) return;
      var v = 1 - smoothstep(0.06, 0.55, p);
      if (Math.abs(v - lastFade) < 0.004) return;
      lastFade = v;
      fadeEl.style.opacity = v.toFixed(3);
    }

    function frame(now) {
      rafId = global.requestAnimationFrame(frame);
      var dt = lastT ? Math.min((now - lastT) / 1000, 0.25) : 1 / 60;
      lastT = now;

      if (baking) {
        bakeChunk(opts.bakeBudgetMs || 10);
        if (!baking) progress = computeTarget();
        render(progress);
        applyFade(progress);
        return;
      }
      if (!baked) return;

      if (opts.driver === "manual") { render(progress); applyFade(progress); return; }
      var target = computeTarget();
      var tau = 0.02 + prm.scrollSmooth * 0.33;
      var next = progress + (target - progress) * (1 - Math.exp(-dt / tau));
      var lag = target - next;
      if (lag > 0.22) next = target - 0.22;
      else if (lag < -0.22) next = target + 0.22;
      if (Math.abs(target - next) < 0.003) next = target;
      progress = next;
      render(progress);
      applyFade(progress);
    }

    function start() {
      if (active) return;
      active = true;
      if (!arrival || applySize()) {
        applySize();
        initFramebuffers();
        buildStrokes();
        lastW = global.innerWidth; lastH = global.innerHeight;
        baked = false;
      }
      if (!baked && !baking) startBake();
      lastT = 0;
      rafId = global.requestAnimationFrame(frame);
    }
    function stop() {
      active = false;
      if (rafId) global.cancelAnimationFrame(rafId);
      rafId = 0;
    }

    var io = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) start(); else stop();
    }, { rootMargin: (opts.preload || "120%") + " 0px" });
    io.observe(pin);

    /* Su mobile la barra degli indirizzi cambia innerHeight a ogni scroll: un
       ricalcolo a ogni evento resize renderebbe la sezione inservibile. */
    var resizeT = 0;
    function onResize() {
      clearTimeout(resizeT);
      resizeT = setTimeout(function () {
        var wChanged = global.innerWidth !== lastW;
        var hChanged = Math.abs(global.innerHeight - lastH) / Math.max(1, lastH) > 0.2;
        if (!wChanged && !hChanged) return;
        lastW = global.innerWidth; lastH = global.innerHeight;
        applySize();
        initFramebuffers();
        buildStrokes();
        baked = false;
        if (active) startBake();
      }, 250);
    }
    global.addEventListener("resize", onResize);

    return {
      element: canvas,
      get progress() { return progress; },
      get ready() { return baked; },
      /* Porta il progresso a un valore e disegna subito, senza smorzamento.
         Serve per pilotare la sezione da un altro motore di scroll (GSAP,
         Lenis) passando driver: "manual" al mount. */
      seek: function (p) {
        progress = clamp(Number(p) || 0, 0, 1);
        if (baked) { render(progress); applyFade(progress); }
        return progress;
      },
      rebake: function () { baked = false; if (active) startBake(); },
      destroy: function () {
        stop();
        io.disconnect();
        global.removeEventListener("resize", onResize);
        clearTimeout(resizeT);
        [velocity, pressure, divergence, curl, dye, dyeTmp1, dyeTmp2, arrival].forEach(function (t) {
          if (t && t.dispose) t.dispose();
        });
        var lose = gl.getExtension("WEBGL_lose_context");
        if (lose) lose.loseContext();
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      }
    };
  }

  /* Senza WebGL2 o con movimento ridotto: una spazzata morbida, guidata dallo
     stesso progresso. La sezione fa il suo mestiere, senza inchiostro. */
  function plain(canvas, pin, fadeEl, lead, tail, opts) {
    var bg = opts.background || BG, ticking = false, lastFade = -1;
    function paint() {
      ticking = false;
      var rect = pin.getBoundingClientRect();
      var span = pin.offsetHeight - global.innerHeight;
      var raw = span > 0 ? clamp(-rect.top / span, 0, 1) : (rect.top <= 0 ? 1 : 0);
      var p = clamp((raw - lead) / Math.max(0.05, 1 - lead - tail), 0, 1);
      var edge = p * 118 - 9;
      canvas.style.background =
        "linear-gradient(to top, #ffffff " + edge.toFixed(2) + "%, " +
        bg + " " + (edge + 9).toFixed(2) + "%)";
      if (fadeEl) {
        var v = 1 - smoothstep(0.06, 0.55, p);
        if (Math.abs(v - lastFade) >= 0.004) { lastFade = v; fadeEl.style.opacity = v.toFixed(3); }
      }
    }
    function onScroll() {
      if (ticking) return;
      ticking = true;
      global.requestAnimationFrame(paint);
    }
    global.addEventListener("scroll", onScroll, { passive: true });
    global.addEventListener("resize", onScroll);
    paint();
    if (opts.onReady) opts.onReady();
    return {
      element: canvas,
      ready: true,
      rebake: function () {},
      destroy: function () {
        global.removeEventListener("scroll", onScroll);
        global.removeEventListener("resize", onScroll);
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      }
    };
  }

  global.InkTransition = {
    mount: function (options) { return create(options || {}); },
    preset: PRESET
  };
})(typeof window !== "undefined" ? window : this);
