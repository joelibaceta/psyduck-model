// Procedural mesh builders. No external assets — shapes are generated so the
// silhouette IS the geometry (MSAA handles edges) and shading fakes volume.
import type { MeshData } from './mesh';

export type WeightFn = (x: number, y: number) => [number, number, number, number]; // b0,w0,b1,w1

export function emptyMesh(): MeshData {
  return { pos: [], uv: [], nrm: [], bone: [], wt: [], idx: [] };
}

function push(m: MeshData, x: number, y: number, ux: number, uy: number, nx: number, ny: number, w: [number, number, number, number]): number {
  const i = m.pos.length / 2;
  m.pos.push(x, y); m.uv.push(ux, uy); m.nrm.push(nx, ny);
  m.bone.push(w[0], w[2]); m.wt.push(w[1], w[3]);
  return i;
}

/** Rounded blob (ellipse), sphere-shaded. Optional weightFn for 2-bone blends. */
export function blob(
  m: MeshData, cx: number, cy: number, rx: number, ry: number, segs: number,
  bone: number, weightFn?: WeightFn,
): void {
  const w = (x: number, y: number): [number, number, number, number] =>
    weightFn ? weightFn(x, y) : [bone, 1, bone, 0];
  const center = push(m, cx, cy, 0, 0, 0, 0, w(cx, cy));
  const ring: number[] = [];
  for (let k = 0; k <= segs; k++) {
    const a = (k / segs) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    const x = cx + ca * rx, y = cy + sa * ry;
    let nx = ca / rx, ny = sa / ry;
    const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    ring.push(push(m, x, y, ca, sa, nx, ny, w(x, y)));
  }
  for (let k = 0; k < segs; k++) m.idx.push(center, ring[k], ring[k + 1]);
}

export interface Joint { x: number; y: number; r: number; bone: number; }

/**
 * Tube along a polyline of joints, cylinder-shaded. Weights blend linearly
 * between each segment's two bones → the limb bends like rubber, not a hinge.
 */
export function limb(
  m: MeshData, joints: Joint[],
  opts: { subdiv?: number; capStart?: boolean; capEnd?: boolean } = {},
): void {
  const sub = opts.subdiv ?? 6;
  const rings: { l: number; r: number }[] = [];

  const segDir = (i: number) => {
    const a = joints[i], b = joints[i + 1];
    let dx = b.x - a.x, dy = b.y - a.y;
    const l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l] as const;
  };

  for (let s = 0; s < joints.length - 1; s++) {
    const a = joints[s], b = joints[s + 1];
    const [dx, dy] = segDir(s);
    const px = -dy, py = dx; // perpendicular
    const steps = s === 0 ? sub : sub; // rings per segment
    for (let i = 0; i <= steps; i++) {
      if (s > 0 && i === 0) continue; // shared ring with previous segment's end
      const t = i / steps;
      const cx = a.x + (b.x - a.x) * t;
      const cy = a.y + (b.y - a.y) * t;
      const rr = a.r + (b.r - a.r) * t;
      const w: [number, number, number, number] = [a.bone, 1 - t, b.bone, t];
      const li = push(m, cx - px * rr, cy - py * rr, -1, t, -px, -py, w);
      const ri = push(m, cx + px * rr, cy + py * rr, 1, t, px, py, w);
      rings.push({ l: li, r: ri });
    }
  }
  for (let i = 0; i < rings.length - 1; i++) {
    const a = rings[i], b = rings[i + 1];
    m.idx.push(a.l, a.r, b.r, a.l, b.r, b.l);
  }

  // rounded caps
  const cap = (j: Joint, dir: readonly [number, number], _outward: 1 | -1) => {
    const [dx, dy] = dir;
    const px = -dy, py = dx;
    const ox = dx, oy = dy; // outward along axis
    const segsC = 10;
    const center = push(m, j.x, j.y, 0, 0, 0, 0, [j.bone, 1, j.bone, 0]);
    const arc: number[] = [];
    for (let k = 0; k <= segsC; k++) {
      const th = Math.PI * (k / segsC - 0.5); // -pi/2..pi/2
      const sx = Math.sin(th), co = Math.cos(th);
      const vx = j.x + px * sx * j.r + ox * co * j.r;
      const vy = j.y + py * sx * j.r + oy * co * j.r;
      let nx = px * sx + ox * co, ny = py * sx + oy * co;
      const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
      arc.push(push(m, vx, vy, sx, 0, nx, ny, [j.bone, 1, j.bone, 0]));
    }
    for (let k = 0; k < segsC; k++) m.idx.push(center, arc[k], arc[k + 1]);
  };

  if (opts.capStart) {
    const [dx, dy] = segDir(0);
    cap(joints[0], [-dx, -dy], -1);
  }
  if (opts.capEnd) {
    const [dx, dy] = segDir(joints.length - 2);
    cap(joints[joints.length - 1], [dx, dy], 1);
  }
}
