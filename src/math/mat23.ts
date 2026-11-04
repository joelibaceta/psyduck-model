// 2D affine transforms as [a, b, c, d, e, f] (same convention as canvas setTransform):
//   x' = a*x + c*y + e
//   y' = b*x + d*y + f
export type Mat23 = Float32Array; // length 6

export function m23(): Mat23 {
  const m = new Float32Array(6);
  m[0] = 1; m[3] = 1; // identity
  return m;
}

export function identity(out: Mat23): Mat23 {
  out[0] = 1; out[1] = 0; out[2] = 0; out[3] = 1; out[4] = 0; out[5] = 0;
  return out;
}

/** out = A * B  (apply B first, then A). out may alias neither A nor B. */
export function mul(out: Mat23, A: Mat23, B: Mat23): Mat23 {
  const a0 = A[0], b0 = A[1], c0 = A[2], d0 = A[3], e0 = A[4], f0 = A[5];
  const a1 = B[0], b1 = B[1], c1 = B[2], d1 = B[3], e1 = B[4], f1 = B[5];
  out[0] = a0 * a1 + c0 * b1;
  out[1] = b0 * a1 + d0 * b1;
  out[2] = a0 * c1 + c0 * d1;
  out[3] = b0 * c1 + d0 * d1;
  out[4] = a0 * e1 + c0 * f1 + e0;
  out[5] = b0 * e1 + d0 * f1 + f0;
  return out;
}

export function fromTRS(out: Mat23, x: number, y: number, rot: number, sx: number, sy: number): Mat23 {
  const c = Math.cos(rot), s = Math.sin(rot);
  out[0] = c * sx; out[1] = s * sx;
  out[2] = -s * sy; out[3] = c * sy;
  out[4] = x; out[5] = y;
  return out;
}

export function invert(out: Mat23, A: Mat23): Mat23 {
  const a = A[0], b = A[1], c = A[2], d = A[3], e = A[4], f = A[5];
  let det = a * d - b * c;
  if (det === 0) det = 1e-8;
  const id = 1 / det;
  const ia = d * id, ib = -b * id, ic = -c * id, idd = a * id;
  out[0] = ia; out[1] = ib; out[2] = ic; out[3] = idd;
  out[4] = -(ia * e + ic * f);
  out[5] = -(ib * e + idd * f);
  return out;
}

export function tfPointX(A: Mat23, x: number, y: number): number { return A[0] * x + A[2] * y + A[4]; }
export function tfPointY(A: Mat23, x: number, y: number): number { return A[1] * x + A[3] * y + A[5]; }
export function tfVecX(A: Mat23, x: number, y: number): number { return A[0] * x + A[2] * y; }
export function tfVecY(A: Mat23, x: number, y: number): number { return A[1] * x + A[3] * y; }

export function copy(out: Mat23, A: Mat23): Mat23 { out.set(A); return out; }
