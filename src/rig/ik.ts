// 2-bone analytic IK for limbs whose rest pose points straight DOWN (-y),
// with the parent bone unrotated (true for our pelvis/chest in rest).
// Returns the pose.drot to apply to the upper and lower bones so the limb's
// tip reaches (targetX, targetY), expressed in the same space as hip.
import { clamp } from './spring';

export interface IKResult { upper: number; lower: number; }

export function solveLimbDown(
  hipX: number, hipY: number,
  l1: number, l2: number,
  targetX: number, targetY: number,
  bend: number, // +1 or -1, which way the knee/elbow folds
): IKResult {
  const dx = targetX - hipX;
  const dy = targetY - hipY;
  const reach = l1 + l2 - 1e-3;
  const minReach = Math.abs(l1 - l2) + 1e-3;
  const dist = clamp(Math.hypot(dx, dy), minReach, reach);
  const base = Math.atan2(dy, dx);
  const cosA = clamp((dist * dist + l1 * l1 - l2 * l2) / (2 * l1 * dist), -1, 1);
  const A = Math.acos(cosA);
  const a1 = base + bend * A;                 // world angle of segment 1
  const kneeX = hipX + Math.cos(a1) * l1;
  const kneeY = hipY + Math.sin(a1) * l1;
  const a2 = Math.atan2(targetY - kneeY, targetX - kneeX); // world angle of segment 2
  // rest segment direction is -y (angle -pi/2); drot = worldAngle + pi/2
  const upper = a1 + Math.PI / 2;
  const lower = a2 - a1;                       // relative to upper
  return { upper, lower };
}
