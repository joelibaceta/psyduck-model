// Minimal WebGL2 helpers: shader compile/link + typed uniform setters.

export function createGL(canvas: HTMLCanvasElement): WebGL2RenderingContext {
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: true,
    premultipliedAlpha: false,
  });
  if (!gl) throw new Error('WebGL2 no disponible en este navegador');
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  return gl;
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    const kind = type === gl.VERTEX_SHADER ? 'vertex' : 'fragment';
    throw new Error(`Error compilando ${kind} shader:\n${log}\n---\n${withLineNumbers(src)}`);
  }
  return sh;
}

function withLineNumbers(src: string): string {
  return src.split('\n').map((l, i) => `${String(i + 1).padStart(3)}| ${l}`).join('\n');
}

export interface Program {
  prog: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
  attribs: Record<string, number>;
  use(): void;
}

export function createProgram(
  gl: WebGL2RenderingContext,
  vsSrc: string,
  fsSrc: string,
  uniformNames: string[] = [],
  attribNames: string[] = [],
): Program {
  const vs = compile(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(`Error enlazando programa:\n${gl.getProgramInfoLog(prog)}`);
  }
  const uniforms: Record<string, WebGLUniformLocation | null> = {};
  for (const n of uniformNames) uniforms[n] = gl.getUniformLocation(prog, n);
  const attribs: Record<string, number> = {};
  for (const n of attribNames) attribs[n] = gl.getAttribLocation(prog, n);
  return { prog, uniforms, attribs, use: () => gl.useProgram(prog) };
}

/** A full-screen triangle, drawn without any vertex buffer (gl_VertexID based). */
export const FULLSCREEN_VS = /* glsl */ `#version 300 es
out vec2 v_uv;
void main() {
  // Covers the screen with a single oversized triangle.
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  v_uv = p; // 0..2
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;
