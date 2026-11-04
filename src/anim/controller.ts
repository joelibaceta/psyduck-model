// Animation controller: a behavior state machine that writes target bone poses,
// eased each frame for smooth blending, with spring secondary motion (hair/tail),
// IK limbs (walk steps, hands to head), squash & stretch and anticipation.
import type { Psyduck } from '../character/psyduck';
import type { StageView } from '../rig/mesh';
import { Spring, smooth, clamp, lerp } from '../rig/spring';
import { solveLimbDown } from '../rig/ik';

export type Intent =
  | 'idle' | 'walk_left' | 'walk_right' | 'jump'
  | 'touch_head' | 'wave' | 'happy' | 'confused';

interface TP { dx: number; dy: number; drot: number; sx: number; sy: number; }

const LEG_L1 = 0.27, LEG_L2 = 0.20;
const ARM_L1 = 0.50, ARM_L2 = 0.42;
const X_LIMIT = 2.5;

export class Controller {
  private s: Psyduck['skel'];
  private B: Psyduck['B'];
  private tp: TP[];                 // per-bone target pose (this frame)
  view: StageView = {
    rootX: 0, rootY: 0, scaleX: 1, scaleY: 1, flip: 1,
    unitsVisible: 8.6, aspect: 1, feetFrac: 0.24,
    outlineW: 0.045, outlineColor: [0.12, 0.09, 0.07],
  };

  behavior: Intent = 'idle';
  private phase = 0;                // seconds in current behavior
  private worldX = 0;
  private facing = 1;

  // springs (secondary motion)
  private hair = [0, 1, 2].map(() => ({ base: new Spring(0, 90, 11), tip: new Spring(0, 70, 8) }));
  private tail = new Spring(0, 80, 10);
  private bob = new Spring(0, 160, 16);

  // blink
  private blinkT = 1.2; private blinkV = 1;

  // walk target & IK memory
  private hipL = { x: -0.33, y: 0.47 };
  private hipR = { x: 0.33, y: 0.47 };
  private shL = { x: -0.72, y: 1.6 };
  private shR = { x: 0.72, y: 1.6 };
  private prevRootX = 0; private prevRootY = 0;
  private emote = ''; // emitted bubble text, read by UI

  constructor(private p: Psyduck) {
    this.s = p.skel;
    this.B = p.B;
    this.tp = this.s.bones.map(() => ({ dx: 0, dy: 0, drot: 0, sx: 1, sy: 1 }));
  }

  takeEmote(): string { const e = this.emote; this.emote = ''; return e; }

  trigger(intent: Intent) {
    if (intent === this.behavior && intent !== 'jump') {
      // re-triggering walk just extends it; others restart
      if (intent === 'walk_left' || intent === 'walk_right') { this.phase = 0; return; }
    }
    this.behavior = intent;
    this.phase = 0;
  }

  private reset() {
    for (const t of this.tp) { t.dx = 0; t.dy = 0; t.drot = 0; t.sx = 1; t.sy = 1; }
  }
  private rot(name: string, v: number) { this.tp[this.B[name]].drot = v; }
  private scale(name: string, sx: number, sy: number) { const t = this.tp[this.B[name]]; t.sx = sx; t.sy = sy; }

  private footIK(hip: { x: number; y: number }, upName: string, loName: string, tx: number, ty: number) {
    const r = solveLimbDown(hip.x, hip.y, LEG_L1, LEG_L2, tx, ty, +1);
    this.rot(upName, r.upper); this.rot(loName, r.lower);
  }
  private handIK(sh: { x: number; y: number }, upName: string, foreName: string, tx: number, ty: number, bend: number) {
    const r = solveLimbDown(sh.x, sh.y, ARM_L1, ARM_L2, tx, ty, bend);
    this.rot(upName, r.upper); this.rot(foreName, r.lower);
  }

  update(dt: number, t: number) {
    this.phase += dt;
    this.reset();

    switch (this.behavior) {
      case 'walk_left': this.walk(dt, t, -1); break;
      case 'walk_right': this.walk(dt, t, +1); break;
      case 'jump': this.jump(t); break;
      case 'touch_head': this.touchHead(t); break;
      case 'wave': this.wave(t); break;
      case 'happy': this.happy(t); break;
      case 'confused': this.confused(t); break;
      default: this.idle(t);
    }

    this.view.flip = this.facing;
    this.view.rootX = this.worldX;

    // ease bone poses toward target (smooth blending between behaviors)
    const rate = 18;
    for (let i = 0; i < this.s.bones.length; i++) {
      const b = this.s.bones[i], g = this.tp[i];
      b.pose.dx = smooth(b.pose.dx, g.dx, rate, dt);
      b.pose.dy = smooth(b.pose.dy, g.dy, rate, dt);
      b.pose.drot = smooth(b.pose.drot, g.drot, rate, dt);
      b.pose.sx = smooth(b.pose.sx, g.sx, rate, dt);
      b.pose.sy = smooth(b.pose.sy, g.sy, rate, dt);
    }

    this.secondaryMotion(dt, t);
    this.doBlink(dt);

    this.s.update();

    // remember joint world positions for next frame's IK
    const wp = (id: number, o: { x: number; y: number }) => { o.x = this.s.bones[id].world[4]; o.y = this.s.bones[id].world[5]; };
    wp(this.B.legL_up, this.hipL); wp(this.B.legR_up, this.hipR);
    wp(this.B.armL_up, this.shL); wp(this.B.armR_up, this.shR);

    for (const part of this.p.parts) part.mesh.skin(this.s);
    this.prevRootX = this.worldX; this.prevRootY = this.view.rootY;
  }

  // ---------- behaviors ----------
  private idle(t: number) {
    const breath = Math.sin(t * 1.8);
    this.scale('chest', 1 - 0.02 * breath, 1 + 0.035 * breath);
    this.scale('spine', 1, 1 + 0.02 * breath);
    this.rot('neck', 0.04 * Math.sin(t * 1.0 + 0.5));
    this.rot('head', 0.03 * Math.sin(t * 0.8));
    this.rot('armL_up', 0.05 * Math.sin(t * 1.2) + 0.04);
    this.rot('armR_up', -0.05 * Math.sin(t * 1.2) - 0.04);
    this.footIK(this.hipL, 'legL_up', 'legL_lo', -0.33, 0.0);
    this.footIK(this.hipR, 'legR_up', 'legR_lo', 0.33, 0.0);
    this.bob.target = 0.03 * breath;
  }

  private walk(dt: number, t: number, dir: number) {
    this.facing = dir;
    const speed = 1.1;
    this.worldX = clamp(this.worldX + dir * speed * dt, -X_LIMIT, X_LIMIT);
    if ((dir < 0 && this.worldX <= -X_LIMIT) || (dir > 0 && this.worldX >= X_LIMIT)) {
      this.trigger('idle'); return;
    }
    const cad = 2.1;
    const ph = t * cad * Math.PI * 2;
    const stride = 0.22, lift = 0.17;
    const legT = (p: number, hip: { x: number; y: number }, up: string, lo: string) => {
      const fx = hip.x + Math.cos(p) * stride * dir;
      const fy = Math.max(0, Math.sin(p)) * lift;
      this.footIK(hip, up, lo, fx, fy);
    };
    legT(ph, this.hipL, 'legL_up', 'legL_lo');
    legT(ph + Math.PI, this.hipR, 'legR_up', 'legR_lo');
    // body bob (twice per stride) + forward lean
    this.bob.target = 0.06 + 0.05 * Math.abs(Math.cos(ph));
    this.rot('spine', 0.08 * dir);
    this.rot('chest', 0.05 * dir);
    this.rot('neck', -0.05 * dir);
    // arm swing opposite to legs
    this.rot('armL_up', 0.5 * Math.sin(ph + Math.PI) + 0.05);
    this.rot('armR_up', 0.5 * Math.sin(ph) - 0.05);
    this.rot('armL_fore', 0.2);
    this.rot('armR_fore', 0.2);
  }

  private jump(t: number) {
    const p = this.phase;
    const dur = 0.95;
    if (p >= dur) { this.trigger('idle'); return; }
    if (p < 0.16) {               // anticipation crouch
      const k = p / 0.16;
      this.view.scaleX = lerp(1, 1.14, k); this.view.scaleY = lerp(1, 0.82, k);
      this.bob.target = lerp(0, -0.12, k);
      this.footIK(this.hipL, 'legL_up', 'legL_lo', -0.33, 0.12);
      this.footIK(this.hipR, 'legR_up', 'legR_lo', 0.33, 0.12);
    } else if (p < 0.66) {        // airborne arc
      const u = (p - 0.16) / 0.5;
      const h = Math.sin(u * Math.PI) * 1.25;
      this.bob.target = h;
      this.view.scaleX = lerp(1.14, 0.92, Math.min(1, u * 2)); this.view.scaleY = lerp(0.82, 1.12, Math.min(1, u * 2));
      this.footIK(this.hipL, 'legL_up', 'legL_lo', -0.3, -0.05);
      this.footIK(this.hipR, 'legR_up', 'legR_lo', 0.3, -0.05);
      this.rot('armL_up', -1.4); this.rot('armR_up', 1.4);
    } else {                      // land + recover
      const k = (p - 0.66) / 0.29;
      this.view.scaleX = lerp(1.18, 1, k); this.view.scaleY = lerp(0.8, 1, k);
      this.bob.target = lerp(-0.1, 0, k);
      this.footIK(this.hipL, 'legL_up', 'legL_lo', -0.33, 0.0);
      this.footIK(this.hipR, 'legR_up', 'legR_lo', 0.33, 0.0);
    }
    void t;
  }

  private touchHead(t: number) {
    if (this.phase >= 2.6) { this.trigger('idle'); return; }
    const wob = Math.sin(t * 9) * (0.06 + 0.02 * Math.sin(t * 2));
    // both hands pressed to the sides/top of head (the headache pose)
    const hx = 0.46, hy = 2.95;
    this.handIK(this.shL, 'armL_up', 'armL_fore', -hx + Math.sin(t * 8) * 0.02, hy, -1);
    this.handIK(this.shR, 'armR_up', 'armR_fore', hx + Math.sin(t * 8) * 0.02, hy, +1);
    this.rot('head', wob); this.rot('neck', wob * 0.5);
    this.scale('chest', 1.03, 0.97);
    this.bob.target = -0.04 + Math.sin(t * 4) * 0.02;
    if (this.phase < 0.05) this.emote = 'psy… psy-duck…';
  }

  private wave(t: number) {
    if (this.phase >= 2.2) { this.trigger('idle'); return; }
    this.facing = 1;
    const waveX = 0.95 + Math.sin(t * 10) * 0.18;
    this.handIK(this.shR, 'armR_up', 'armR_fore', waveX, 3.0, +1);
    this.rot('armL_up', 0.1);
    this.rot('head', 0.05 * Math.sin(t * 3));
    this.rot('neck', 0.06);
    this.bob.target = 0.05 + 0.03 * Math.abs(Math.sin(t * 3));
    this.footIK(this.hipL, 'legL_up', 'legL_lo', -0.33, 0.0);
    this.footIK(this.hipR, 'legR_up', 'legR_lo', 0.33, 0.0);
    if (this.phase < 0.05) this.emote = '¡Psy psy!';
  }

  private happy(t: number) {
    if (this.phase >= 1.8) { this.trigger('idle'); return; }
    const hop = Math.abs(Math.sin(this.phase * 7));
    this.bob.target = hop * 0.35;
    const squashed = hop < 0.15;
    this.view.scaleY = squashed ? 0.9 : 1.05;
    this.view.scaleX = squashed ? 1.08 : 0.97;
    this.rot('armL_up', -1.2 + 0.2 * Math.sin(t * 12));
    this.rot('armR_up', 1.2 - 0.2 * Math.sin(t * 12));
    this.rot('head', 0.08 * Math.sin(t * 6));
    const fy = Math.max(0, this.bob.target - 0.05);
    this.footIK(this.hipL, 'legL_up', 'legL_lo', -0.33, fy);
    this.footIK(this.hipR, 'legR_up', 'legR_lo', 0.33, fy);
    if (this.phase < 0.05) this.emote = '¡Psy~! ♪';
  }

  private confused(t: number) {
    if (this.phase >= 2.2) { this.trigger('idle'); return; }
    this.rot('head', 0.35 * Math.sin(t * 2.5));
    this.rot('neck', 0.18 * Math.sin(t * 2.5));
    this.scale('chest', 0.98, 1.0);
    this.rot('armL_up', 0.2); this.rot('armR_up', -0.2);
    this.footIK(this.hipL, 'legL_up', 'legL_lo', -0.33, 0.0);
    this.footIK(this.hipR, 'legR_up', 'legR_lo', 0.33, 0.0);
    this.bob.target = 0;
    if (this.phase < 0.05) this.emote = '¿…psy?';
  }

  // ---------- secondary motion & blink ----------
  private secondaryMotion(dt: number, t: number) {
    const velX = (this.worldX - this.prevRootX) / Math.max(dt, 1e-3);
    const velY = (this.view.rootY - this.prevRootY) / Math.max(dt, 1e-3);
    this.bob.step(dt);
    this.view.rootY = this.bob.value;

    const breeze = Math.sin(t * 1.5) * 0.06;
    const drag = -velX * 0.12 - velY * 0.05;
    const names = [['hairL0', 'hairL1'], ['hairB0', 'hairB1'], ['hairR0', 'hairR1']];
    for (let i = 0; i < 3; i++) {
      const h = this.hair[i];
      h.base.target = breeze * (1 + i * 0.1) + drag;
      h.base.step(dt);
      h.tip.target = h.base.value * 1.1;
      h.tip.step(dt);
      this.s.bone(names[i][0]).pose.drot += h.base.value;
      this.s.bone(names[i][1]).pose.drot += h.tip.value;
    }
    this.tail.target = -velX * 0.1 + Math.sin(t * 1.2) * 0.05;
    this.tail.step(dt);
    this.s.bone('tail').pose.drot += this.tail.value;
  }

  private doBlink(dt: number) {
    // blinkV snaps to 0 (closed) on each trigger, then reopens to 1.
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blinkT = 2 + Math.random() * 3; this.blinkV = 0; }
    if (this.blinkV < 1) this.blinkV = Math.min(1, this.blinkV + dt * 10);
    const openness = lerp(0.12, 1, this.blinkV);
    this.s.bone('eyeL').pose.sy = openness;
    this.s.bone('eyeR').pose.sy = openness;
  }
}
