declare module "d3-force-3d" {
  interface Force {
    (alpha: number): void;
    initialize?(
      nodes: unknown[],
      random?: () => number,
      numDimensions?: number,
    ): void;
    strength(value: number): Force;
  }
  export function forceCollide(radius: number): Force;
  export function forceX(x: number): Force;
  export function forceY(y: number): Force;
  export function forceZ(z: number): Force;
}
