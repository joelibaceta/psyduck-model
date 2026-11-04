// Animated Pokémon-style forest, fully procedural in a fragment shader.
import { createGL, createProgram, FULLSCREEN_VS, type Program } from '../gl/gl';

const FOREST_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;          // 0..2 (fullscreen triangle)
out vec4 frag;
uniform float u_time;
uniform vec2  u_res;

// ---------- noise toolbox ----------
float hash21(vec2 p){ p = fract(p*vec2(123.34,345.45)); p += dot(p, p+34.345); return fract(p.x*p.y); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  float a = hash21(i), b = hash21(i+vec2(1,0));
  float c = hash21(i+vec2(0,1)), d = hash21(i+vec2(1,1));
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
float fbm(vec2 p){
  float s = 0.0, a = 0.5;
  for(int i=0;i<5;i++){ s += a*vnoise(p); p *= 2.02; a *= 0.5; }
  return s;
}

// A soft blobby foliage mass. 'sway' shifts horizontally with height for wind.
float foliage(vec2 uv, float scale, float sway, float seed){
  vec2 p = uv * scale;
  p.x += sway;
  p += seed;
  float n = fbm(p + vec2(0.0, seed*3.1));
  n += 0.35*fbm(p*2.3 + 7.0);
  return n;
}

vec3 toLin(vec3 c){ return pow(c, vec3(2.2)); }
vec3 toSrgb(vec3 c){ return pow(c, vec3(1.0/2.2)); }

void main(){
  // Aspect-correct coords: x in [-asp,asp], y in [0,1] bottom->top
  float asp = u_res.x / u_res.y;
  vec2 uv = v_uv * 0.5;                 // 0..1
  vec2 p = vec2((uv.x-0.5)*asp, uv.y);  // centered x
  float t = u_time;

  // ---------- sky / deep forest light ----------
  vec3 top    = toLin(vec3(0.62, 0.78, 0.44)); // bright canopy light
  vec3 mid    = toLin(vec3(0.20, 0.42, 0.24));
  vec3 deep   = toLin(vec3(0.05, 0.16, 0.12));
  vec3 col = mix(deep, mid, smoothstep(0.0, 0.62, uv.y));
  col = mix(col, top, smoothstep(0.55, 1.0, uv.y));

  // ---------- god rays (diagonal light shafts) ----------
  float rayDir = (p.x*0.6 - uv.y);
  float rays = 0.0;
  rays += 0.5 * sin(rayDir*10.0 + 1.0);
  rays += 0.5 * sin(rayDir*17.0 + t*0.15 + 3.0);
  rays = smoothstep(0.3, 1.0, rays*0.5+0.5);
  rays *= smoothstep(0.1, 1.0, uv.y);                 // fade near ground
  rays *= 0.14 * (0.7 + 0.3*sin(t*0.3));
  col += toLin(vec3(0.95,1.0,0.6)) * rays;

  // ---------- far canopy (top blobs) ----------
  float wind = sin(t*0.4);
  float canopy = foliage(vec2(p.x, uv.y*0.5), 2.6, wind*0.05, 11.0);
  // hanging lower edge so the canopy drapes from the top
  float canopyEdge = 0.66 + 0.10*fbm(vec2(p.x*2.5 + wind*0.1, 7.0));
  float canopyMask = smoothstep(canopyEdge-0.04, canopyEdge+0.04, uv.y)
                   * smoothstep(0.45, 0.62, canopy);
  col = mix(col, toLin(vec3(0.09,0.26,0.13)), canopyMask*0.95);
  // dapple bright leaves on the canopy
  float dapple = foliage(vec2(p.x, uv.y)+3.0, 6.0, wind*0.12, 4.0);
  col += toLin(vec3(0.55,0.7,0.28)) * smoothstep(0.58,0.9,dapple) * canopyMask * 0.6;

  // ---------- distant tree trunks (vertical pillars, parallax) ----------
  {
    float layerShift = wind*0.03;
    vec2 tp = vec2(p.x*0.9 + layerShift, 0.0);
    float cell = tp.x*2.2;
    float id = floor(cell);
    float fx = fract(cell);
    float h = hash21(vec2(id, 3.0));
    float trunkW = 0.10 + 0.06*h;
    float trunk = smoothstep(trunkW, trunkW-0.03, abs(fx-0.5));
    float topY = 0.60 + 0.05*h;
    trunk *= smoothstep(topY, topY-0.05, uv.y) * smoothstep(0.24, 0.30, uv.y);
    col = mix(col, toLin(vec3(0.06,0.14,0.10)) * (0.7+0.3*h), trunk*0.8);
  }

  // ---------- mid foliage band (depth) ----------
  float tz = foliage(vec2(p.x*1.3, uv.y*0.8), 2.0, wind*0.08, 30.0);
  float midEdge = 0.50 + 0.08*fbm(vec2(p.x*3.0, 20.0));
  float trees = smoothstep(midEdge+0.03, midEdge-0.03, uv.y) * smoothstep(0.45,0.6,tz) * smoothstep(0.24,0.3,uv.y);
  col = mix(col, toLin(vec3(0.06,0.18,0.11)), trees*0.7);

  // ---------- foreground bushes (bottom) ----------
  float bush = foliage(vec2(p.x*1.1, uv.y) + 50.0, 3.2, wind*0.18, 61.0);
  float bushTop = 0.34 + 0.10*fbm(vec2(p.x*4.0 + wind*0.2, 61.0));
  float bushMask = smoothstep(bushTop+0.03, bushTop-0.03, uv.y);
  col = mix(col, toLin(vec3(0.04,0.13,0.08)), bushMask);
  // rim light on bush tops (sun catching the leaves)
  col += toLin(vec3(0.45,0.65,0.22)) * smoothstep(bushTop+0.0, bushTop+0.05, uv.y)
       * smoothstep(bushTop+0.09, bushTop+0.05, uv.y) * (0.6+0.4*bush);

  // ---------- ground ----------
  float groundLine = 0.26 + 0.015*fbm(vec2(p.x*3.0, 0.0));
  float ground = smoothstep(groundLine+0.01, groundLine-0.01, uv.y);
  vec3 groundCol = mix(toLin(vec3(0.18,0.30,0.14)), toLin(vec3(0.10,0.18,0.08)), uv.y/groundLine);
  // soft grass texture
  groundCol += toLin(vec3(0.1,0.15,0.05)) * fbm(vec2(p.x*40.0, uv.y*20.0))*0.25;
  col = mix(col, groundCol, ground);

  // ---------- floating pollen / dust ----------
  float pollen = 0.0;
  for(int i=0;i<3;i++){
    float fi = float(i);
    vec2 gp = vec2(p.x, uv.y)*(6.0+fi*3.0);
    gp.y += t*(0.08+fi*0.04);
    gp.x += sin(t*0.3+fi)*0.3;
    vec2 id = floor(gp);
    vec2 f  = fract(gp)-0.5;
    float h = hash21(id+fi*13.0);
    float d = length(f - (vec2(h,fract(h*31.0))-0.5)*0.6);
    pollen += smoothstep(0.08, 0.0, d) * step(0.93, h);
  }
  col += toLin(vec3(1.0,0.95,0.6)) * pollen * 0.8 * smoothstep(0.1,0.6,uv.y);

  // ---------- mist bands ----------
  float mist = fbm(vec2(p.x*1.5 + t*0.05, uv.y*3.0));
  mist *= smoothstep(0.35, 0.1, uv.y);
  col = mix(col, toLin(vec3(0.5,0.62,0.5)), mist*0.14);

  // ---------- vignette ----------
  float vig = smoothstep(1.3, 0.3, length((uv-0.5)*vec2(asp,1.0)));
  col *= mix(0.72, 1.0, vig);

  frag = vec4(toSrgb(max(col, 0.0)), 1.0);
}`;

export class Forest {
  private program: Program;
  constructor(private gl: WebGL2RenderingContext) {
    this.program = createProgram(gl, FULLSCREEN_VS, FOREST_FS, ['u_time', 'u_res']);
  }
  render(time: number, w: number, h: number) {
    const gl = this.gl;
    this.program.use();
    gl.uniform1f(this.program.uniforms.u_time, time);
    gl.uniform2f(this.program.uniforms.u_res, w, h);
    gl.disable(gl.DEPTH_TEST);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}

export { createGL };
