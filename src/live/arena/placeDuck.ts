import type { Group } from "three";

/**
 * Put a duck (outer group: ground position) in place: lift the duck and its
 * tags by `y`, face it, and shrink its ground shadow as it rises.
 */
export function placeDuck(g: Group, x: number, y: number, z: number, heading: number) {
  g.position.set(x, 0, z);
  const lift = g.children[0];
  if (lift) {
    lift.position.y = y;
    const duck = lift.children[0];
    if (duck) duck.rotation.y = heading;
  }
  const shadow = g.children[1];
  if (shadow) shadow.scale.setScalar(1 / (1 + y * 0.45));
}

