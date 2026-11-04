// Psyduck: a 2D cutout rig built entirely from procedural meshes.
// Bones bend the limbs via smooth skin weights; shapes carry fake volume.
import { Skeleton, Bone } from '../rig/skeleton';
import { SkinnedMesh, type Material, type StageView } from '../rig/mesh';
import { blob, limb, emptyMesh, type WeightFn } from '../rig/shapes';

const CREAM: [number, number, number] = [0.97, 0.85, 0.46];
const CREAM_HI: [number, number, number] = [0.99, 0.93, 0.68];
const CREAM_SH: [number, number, number] = [0.90, 0.74, 0.37];
const DARK: [number, number, number] = [0.16, 0.14, 0.12];
const WHITE: [number, number, number] = [0.98, 0.98, 0.95];
const RIM: [number, number, number] = [0.85, 0.9, 0.55];

export interface Part { name: string; mesh: SkinnedMesh; }

export class Psyduck {
  skel = new Skeleton();
  parts: Part[] = [];
  B: Record<string, number> = {}; // bone ids by name

  constructor(private gl: WebGL2RenderingContext) {
    this.buildSkeleton();
    this.skel.bind();
    this.buildMeshes();
  }

  private bone(name: string, parent: string | null, x: number, y: number) {
    const p = parent === null ? -1 : this.B[parent];
    this.B[name] = this.skel.add(new Bone(name, p, x, y));
  }

  private buildSkeleton() {
    this.bone('root', null, 0, 0);
    this.bone('pelvis', 'root', 0, 0.55);
    this.bone('spine', 'pelvis', 0, 0.5);
    this.bone('chest', 'spine', 0, 0.5);
    this.bone('neck', 'chest', 0, 0.4);
    this.bone('head', 'neck', 0, 0.5);
    this.bone('beak', 'head', 0, -0.18);
    this.bone('eyeL', 'head', -0.4, 0.28);
    this.bone('eyeR', 'head', 0.4, 0.28);
    // three head hairs (2 bones each for a springy curve)
    this.bone('hairB0', 'head', 0, 1.02); this.bone('hairB1', 'hairB0', 0, 0.42);
    this.bone('hairL0', 'head', -0.16, 0.98); this.bone('hairL1', 'hairL0', -0.12, 0.42);
    this.bone('hairR0', 'head', 0.16, 0.98); this.bone('hairR1', 'hairR0', 0.12, 0.42);
    // arms (shoulder -> elbow -> hand), pointing down in rest
    this.bone('armL_up', 'chest', -0.72, 0.05); this.bone('armL_fore', 'armL_up', 0, -0.5); this.bone('armL_hand', 'armL_fore', 0, -0.42);
    this.bone('armR_up', 'chest', 0.72, 0.05); this.bone('armR_fore', 'armR_up', 0, -0.5); this.bone('armR_hand', 'armR_fore', 0, -0.42);
    // legs (hip -> knee -> foot)
    this.bone('legL_up', 'pelvis', -0.33, -0.08); this.bone('legL_lo', 'legL_up', 0, -0.27); this.bone('legL_ft', 'legL_lo', 0, -0.2);
    this.bone('legR_up', 'pelvis', 0.33, -0.08); this.bone('legR_lo', 'legR_up', 0, -0.27); this.bone('legR_ft', 'legR_lo', 0, -0.2);
    // tail
    this.bone('tail', 'pelvis', 0, 0.05);
  }

  private add(name: string, data: ReturnType<typeof emptyMesh>, mat: Material) {
    this.parts.push({ name, mesh: new SkinnedMesh(this.gl, data, mat) });
  }

  private buildMeshes() {
    const B = this.B;
    // Body spans pelvis -> chest; weight blends by height so it bends organically.
    const bodyW: WeightFn = (_x, y) => {
      const t = Math.max(0, Math.min(1, (y - 0.1) / 2.1));
      return [B.pelvis, 1 - t, B.chest, t];
    };

    // --- tail (behind everything) ---
    { const m = emptyMesh(); blob(m, 0, 0.62, 0.34, 0.30, 20, B.tail); this.add('tail', m, { color: CREAM_SH, shadeMode: 1, rim: RIM }); }

    // --- hairs (behind head so roots hide) ---
    const hairMat: Material = { color: DARK, shadeMode: 0, rim: [0.4, 0.45, 0.3] };
    { const m = emptyMesh(); limb(m, [
        { x: -0.16, y: 3.43, r: 0.085, bone: B.hairL0 },
        { x: -0.30, y: 3.72, r: 0.055, bone: B.hairL0 },
        { x: -0.42, y: 3.92, r: 0.02, bone: B.hairL1 },
      ], { capEnd: true }); this.add('hairL', m, hairMat); }
    { const m = emptyMesh(); limb(m, [
        { x: 0, y: 3.47, r: 0.09, bone: B.hairB0 },
        { x: 0, y: 3.82, r: 0.055, bone: B.hairB0 },
        { x: 0, y: 4.08, r: 0.02, bone: B.hairB1 },
      ], { capEnd: true }); this.add('hairB', m, hairMat); }
    { const m = emptyMesh(); limb(m, [
        { x: 0.16, y: 3.43, r: 0.085, bone: B.hairR0 },
        { x: 0.30, y: 3.72, r: 0.055, bone: B.hairR0 },
        { x: 0.42, y: 3.92, r: 0.02, bone: B.hairR1 },
      ], { capEnd: true }); this.add('hairR', m, hairMat); }

    // --- legs + feet ---
    const legMat: Material = { color: CREAM, shadeMode: 0, rim: RIM };
    const footMat: Material = { color: CREAM_SH, shadeMode: 1, rim: RIM };
    const leg = (side: number, up: number, lo: number, ft: number) => {
      const x = 0.33 * side;
      const m = emptyMesh();
      limb(m, [
        { x, y: 0.47, r: 0.17, bone: up },
        { x, y: 0.22, r: 0.15, bone: lo },
        { x, y: 0.06, r: 0.13, bone: ft },
      ], {});
      return m;
    };
    this.add('legL', leg(-1, B.legL_up, B.legL_lo, B.legL_ft), legMat);
    this.add('legR', leg(1, B.legR_up, B.legR_lo, B.legR_ft), legMat);
    { const m = emptyMesh(); blob(m, -0.33, 0.05, 0.28, 0.13, 16, B.legL_ft); this.add('footL', m, footMat); }
    { const m = emptyMesh(); blob(m, 0.33, 0.05, 0.28, 0.13, 16, B.legR_ft); this.add('footR', m, footMat); }

    // --- body + belly ---
    { const m = emptyMesh(); blob(m, 0, 1.15, 0.98, 1.08, 40, B.spine, bodyW); this.add('body', m, { color: CREAM, shadeMode: 1, rim: RIM }); }
    { const m = emptyMesh(); blob(m, 0, 0.98, 0.62, 0.72, 28, B.spine); this.add('belly', m, { color: CREAM_HI, shadeMode: 1, rim: RIM, outline: false }); }

    // --- head ---
    { const m = emptyMesh(); blob(m, 0, 2.45, 1.06, 1.04, 44, B.head); this.add('head', m, { color: CREAM, shadeMode: 1, rim: RIM }); }
    // --- beak ---
    { const m = emptyMesh(); blob(m, 0, 2.18, 0.56, 0.33, 28, B.beak); this.add('beak', m, { color: CREAM_HI, shadeMode: 1, rim: RIM }); }
    // --- eyes + pupils ---
    { const m = emptyMesh(); blob(m, -0.38, 2.74, 0.18, 0.23, 20, B.eyeL); this.add('eyeL', m, { color: WHITE, shadeMode: 1, rim: [0.6, 0.65, 0.7] }); }
    { const m = emptyMesh(); blob(m, 0.38, 2.74, 0.18, 0.23, 20, B.eyeR); this.add('eyeR', m, { color: WHITE, shadeMode: 1, rim: [0.6, 0.65, 0.7] }); }
    { const m = emptyMesh(); blob(m, -0.38, 2.70, 0.06, 0.07, 12, B.eyeL); this.add('pupL', m, { color: DARK, shadeMode: 1, outline: false }); }
    { const m = emptyMesh(); blob(m, 0.38, 2.70, 0.06, 0.07, 12, B.eyeR); this.add('pupR', m, { color: DARK, shadeMode: 1, outline: false }); }

    // --- arms (drawn last so raised hands appear on top of head/face) ---
    const armMat: Material = { color: CREAM, shadeMode: 0, rim: RIM };
    const arm = (side: number, up: number, fore: number, hand: number) => {
      const x = 0.72 * side;
      const m = emptyMesh();
      limb(m, [
        { x, y: 1.6, r: 0.17, bone: up },
        { x, y: 1.12, r: 0.145, bone: fore },
        { x, y: 0.7, r: 0.125, bone: hand },
      ], { capEnd: true });
      return m;
    };
    this.add('armL', arm(-1, B.armL_up, B.armL_fore, B.armL_hand), armMat);
    this.add('armR', arm(1, B.armR_up, B.armR_fore, B.armR_hand), armMat);
  }

  /** Recompute world matrices and skin all parts (call after animation writes poses). */
  pose() {
    this.skel.update();
    for (const p of this.parts) p.mesh.skin(this.skel);
  }

  draw(view: StageView) {
    for (const p of this.parts) p.mesh.draw(view);
  }
}
