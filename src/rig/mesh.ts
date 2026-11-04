// A skinned, shaded mesh part. CPU linear-blend skinning (≤2 bones/vertex),
// re-uploaded each frame. Shading fakes volume from a per-fragment normal so a
// flat 2D shape reads as a rounded, lit object instead of a cardboard cut-out.
import { createProgram, type Program } from '../gl/gl';
import type { Skeleton } from './skeleton';

export interface MeshData {
  pos: number[];   // rest positions, model space (2 per vertex)
  uv: number[];    // shading coords, [-1,1] (2 per vertex)
  nrm: number[];   // rest outward normals (2 per vertex)
  bone: number[];  // two bone indices per vertex
  wt: number[];    // two weights per vertex (sum ~1)
  idx: number[];   // triangle indices
}

export interface Material {
  color: [number, number, number];
  shadeMode: 0 | 1;            // 0 = cylinder (limbs), 1 = sphere (blobs)
  rim?: [number, number, number];
  outline?: boolean;           // draw dark outline pass (default true)
}

const PART_VS = /* glsl */ `#version 300 es
precision highp float;
in vec2 a_pos;
in vec2 a_uv;
in vec2 a_nrm;
out vec2 v_uv;
uniform vec2  u_root;        // character world position
uniform vec2  u_scale;       // whole-body squash & stretch
uniform float u_flip;        // +1 / -1 facing
uniform float u_unitsVisible;
uniform float u_aspect;
uniform float u_feetFrac;
uniform float u_outline;     // 0 fill, 1 outline
uniform float u_outlineW;    // world units
uniform float u_z;           // layer depth hint (-1..1)
void main(){
  vec2 m = a_pos * u_scale;
  vec2 n = a_nrm;
  m.x *= u_flip; n.x *= u_flip;
  vec2 world = u_root + m + n * (u_outline * u_outlineW);
  float screenY = u_feetFrac + world.y / u_unitsVisible;
  float clipX = (world.x / u_unitsVisible) * 2.0 / u_aspect;
  float clipY = screenY * 2.0 - 1.0;
  gl_Position = vec4(clipX, clipY, u_z, 1.0);
  v_uv = a_uv;
}`;

const PART_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 frag;
uniform vec3  u_color;
uniform vec3  u_rim;
uniform int   u_shadeMode;
uniform float u_outline;
uniform vec3  u_outlineColor;
void main(){
  if (u_outline > 0.5) { frag = vec4(u_outlineColor, 1.0); return; }
  vec3 n;
  if (u_shadeMode == 1) {
    vec2 p = v_uv;
    float r2 = dot(p, p);
    float z = sqrt(max(0.0, 1.0 - r2));
    n = normalize(vec3(p, z + 0.0001));
  } else {
    float ax = clamp(v_uv.x, -1.0, 1.0);
    float z = sqrt(max(0.0, 1.0 - ax * ax));
    n = normalize(vec3(ax, 0.0, z + 0.0001));
  }
  vec3 L = normalize(vec3(-0.35, 0.65, 0.72));
  float diff = clamp(dot(n, L), 0.0, 1.0);
  float shade = 0.5 + 0.68 * diff;
  float rim = pow(1.0 - n.z, 2.5);
  vec3 col = u_color * shade + u_rim * rim * 0.55;
  frag = vec4(col, 1.0);
}`;

let shared: Program | null = null;
function program(gl: WebGL2RenderingContext): Program {
  if (!shared) {
    shared = createProgram(gl, PART_VS, PART_FS,
      ['u_root', 'u_scale', 'u_flip', 'u_unitsVisible', 'u_aspect', 'u_feetFrac',
       'u_outline', 'u_outlineW', 'u_z', 'u_color', 'u_rim', 'u_shadeMode', 'u_outlineColor'],
      ['a_pos', 'a_uv', 'a_nrm']);
  }
  return shared;
}

export interface StageView {
  rootX: number; rootY: number;
  scaleX: number; scaleY: number;
  flip: number;
  unitsVisible: number;
  aspect: number;
  feetFrac: number;
  outlineW: number;
  outlineColor: [number, number, number];
}

export class SkinnedMesh {
  private prog: Program;
  private vao: WebGLVertexArrayObject;
  private posBuf: WebGLBuffer;
  private nrmBuf: WebGLBuffer;
  private indexCount: number;

  private restPos: Float32Array;
  private restNrm: Float32Array;
  private boneIdx: Int32Array;
  private boneWt: Float32Array;
  private outPos: Float32Array;
  private outNrm: Float32Array;

  z = 0;

  constructor(private gl: WebGL2RenderingContext, data: MeshData, public material: Material) {
    this.prog = program(gl);
    this.restPos = new Float32Array(data.pos);
    this.restNrm = new Float32Array(data.nrm);
    this.boneIdx = new Int32Array(data.bone);
    this.boneWt = new Float32Array(data.wt);
    this.outPos = new Float32Array(data.pos.length);
    this.outNrm = new Float32Array(data.nrm.length);
    this.indexCount = data.idx.length;

    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);

    this.posBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.outPos, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.prog.attribs.a_pos);
    gl.vertexAttribPointer(this.prog.attribs.a_pos, 2, gl.FLOAT, false, 0, 0);

    const uvBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data.uv), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(this.prog.attribs.a_uv);
    gl.vertexAttribPointer(this.prog.attribs.a_uv, 2, gl.FLOAT, false, 0, 0);

    this.nrmBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nrmBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.outNrm, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.prog.attribs.a_nrm);
    gl.vertexAttribPointer(this.prog.attribs.a_nrm, 2, gl.FLOAT, false, 0, 0);

    const ebo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(data.idx), gl.STATIC_DRAW);

    gl.bindVertexArray(null);
  }

  /** Recompute skinned vertices + normals from current skeleton pose, upload. */
  skin(skel: Skeleton) {
    const bones = skel.bones;
    const rp = this.restPos, rn = this.restNrm, bi = this.boneIdx, bw = this.boneWt;
    const op = this.outPos, on = this.outNrm;
    const n = rp.length / 2;
    for (let v = 0; v < n; v++) {
      const i2 = v * 2;
      const px = rp[i2], py = rp[i2 + 1];
      const nx = rn[i2], ny = rn[i2 + 1];
      const b0 = bones[bi[i2]].skin, b1 = bones[bi[i2 + 1]].skin;
      const w0 = bw[i2], w1 = bw[i2 + 1];
      op[i2] = w0 * (b0[0] * px + b0[2] * py + b0[4]) + w1 * (b1[0] * px + b1[2] * py + b1[4]);
      op[i2 + 1] = w0 * (b0[1] * px + b0[3] * py + b0[5]) + w1 * (b1[1] * px + b1[3] * py + b1[5]);
      let mnx = w0 * (b0[0] * nx + b0[2] * ny) + w1 * (b1[0] * nx + b1[2] * ny);
      let mny = w0 * (b0[1] * nx + b0[3] * ny) + w1 * (b1[1] * nx + b1[3] * ny);
      const len = Math.hypot(mnx, mny) || 1;
      on[i2] = mnx / len; on[i2 + 1] = mny / len;
    }
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, op);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nrmBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, on);
  }

  private drawPass(outline: number) {
    const gl = this.gl, u = this.prog.uniforms;
    gl.uniform1f(u.u_outline, outline);
    gl.uniform1f(u.u_z, this.z);
    gl.uniform3fv(u.u_color, this.material.color);
    gl.uniform3fv(u.u_rim, this.material.rim ?? [0.7, 0.85, 0.5]);
    gl.uniform1i(u.u_shadeMode, this.material.shadeMode);
    gl.bindVertexArray(this.vao);
    gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);
  }

  /** Call once per frame per part (shared uniforms are set by the stage). */
  draw(view: StageView) {
    const gl = this.gl, u = this.prog.uniforms;
    this.prog.use();
    gl.uniform2f(u.u_root, view.rootX, view.rootY);
    gl.uniform2f(u.u_scale, view.scaleX, view.scaleY);
    gl.uniform1f(u.u_flip, view.flip);
    gl.uniform1f(u.u_unitsVisible, view.unitsVisible);
    gl.uniform1f(u.u_aspect, view.aspect);
    gl.uniform1f(u.u_feetFrac, view.feetFrac);
    gl.uniform1f(u.u_outlineW, view.outlineW);
    gl.uniform3fv(u.u_outlineColor, view.outlineColor);
    if (this.material.outline !== false) this.drawPass(1);
    this.drawPass(0);
  }
}
