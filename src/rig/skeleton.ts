// A 2D bone hierarchy with linear-blend-skinning matrices.
//
// Each bone has a constant REST local transform and a mutable POSE delta that
// animation writes every frame. The effective local transform is:
//   pos   = rest.(x,y)   + pose.(dx,dy)
//   rot   = rest.rot     + pose.drot
//   scale = rest.(sx,sy) * pose.(sx,sy)
// World matrices are composed down the hierarchy; the skin matrix for a bone is
//   skin = world * inverse(restWorld)
// so a vertex at its bind position follows the bone as it moves from rest.
import { Mat23, m23, fromTRS, mul, invert, identity } from '../math/mat23';

export interface BonePose { dx: number; dy: number; drot: number; sx: number; sy: number; }

export class Bone {
  // rest local
  readonly rx: number; readonly ry: number; readonly rrot: number; readonly rsx: number; readonly rsy: number;
  // pose delta (reset to neutral each frame before animation writes into it)
  pose: BonePose = { dx: 0, dy: 0, drot: 0, sx: 1, sy: 1 };

  local: Mat23 = m23();
  world: Mat23 = m23();
  restWorld: Mat23 = m23();
  restWorldInv: Mat23 = m23();
  skin: Mat23 = m23();

  constructor(
    public name: string,
    public parent: number,
    x: number, y: number, rot = 0, sx = 1, sy = 1,
  ) {
    this.rx = x; this.ry = y; this.rrot = rot; this.rsx = sx; this.rsy = sy;
  }

  resetPose() {
    this.pose.dx = 0; this.pose.dy = 0; this.pose.drot = 0; this.pose.sx = 1; this.pose.sy = 1;
  }
}

export class Skeleton {
  bones: Bone[] = [];
  private index = new Map<string, number>();

  add(bone: Bone): number {
    const i = this.bones.length;
    this.bones.push(bone);
    this.index.set(bone.name, i);
    return i;
  }

  id(name: string): number {
    const i = this.index.get(name);
    if (i === undefined) throw new Error(`Hueso desconocido: ${name}`);
    return i;
  }
  bone(name: string): Bone { return this.bones[this.id(name)]; }

  /** Compute rest world matrices and their inverses (call once after building). */
  bind() {
    const tmp = m23();
    for (const b of this.bones) {
      fromTRS(tmp, b.rx, b.ry, b.rrot, b.rsx, b.rsy);
      if (b.parent < 0) {
        b.restWorld.set(tmp);
      } else {
        mul(b.restWorld, this.bones[b.parent].restWorld, tmp);
      }
      invert(b.restWorldInv, b.restWorld);
    }
  }

  /** Recompute world + skin matrices from current poses. Parents must precede children. */
  update() {
    const local = m23();
    for (const b of this.bones) {
      fromTRS(local, b.rx + b.pose.dx, b.ry + b.pose.dy, b.rrot + b.pose.drot, b.rsx * b.pose.sx, b.rsy * b.pose.sy);
      if (b.parent < 0) {
        b.world.set(local);
      } else {
        mul(b.world, this.bones[b.parent].world, local);
      }
      mul(b.skin, b.world, b.restWorldInv);
    }
  }

  resetPose() { for (const b of this.bones) b.resetPose(); }

  /** Flatten skin matrices for fast vertex access: [a,b,c,d,e,f] * boneCount. */
  skinArray(out: Float32Array) {
    for (let i = 0; i < this.bones.length; i++) out.set(this.bones[i].skin, i * 6);
  }
}

export { identity };
