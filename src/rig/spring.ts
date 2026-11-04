// Critically-dampable spring for secondary motion and value smoothing.
// Gives lag + overshoot ("alma") instead of instant snapping.
export class Spring {
  value: number;
  vel = 0;
  target: number;
  constructor(value = 0, public stiffness = 120, public damping = 14) {
    this.value = value; this.target = value;
  }
  step(dt: number): number {
    // semi-implicit Euler; clamp dt for stability on frame hitches
    const h = Math.min(dt, 1 / 30);
    const a = this.stiffness * (this.target - this.value) - this.damping * this.vel;
    this.vel += a * h;
    this.value += this.vel * h;
    return this.value;
  }
  nudge(impulse: number) { this.vel += impulse; }
}

/** Exponential smoothing toward a target (frame-rate independent). */
export function smooth(current: number, target: number, rate: number, dt: number): number {
  const k = 1 - Math.exp(-rate * dt);
  return current + (target - current) * k;
}

export function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
export function clamp(v: number, lo: number, hi: number): number { return v < lo ? lo : v > hi ? hi : v; }
