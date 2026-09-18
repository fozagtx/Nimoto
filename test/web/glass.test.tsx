import { describe, expect, it } from 'vitest';
import { lensDisplacement, type LensShape } from '@/web/lib/glass.js';

const shape: LensShape = { width: 120, height: 40, radius: 20, curvature: 18, splay: 1.6 };

describe('lensDisplacement', () => {
  it('leaves the flat centre and everything outside the lens alone', () => {
    for (const [x, y] of [[0, 0], [100, 0], [0, 30]] as const) {
      const { dx, dy } = lensDisplacement(x, y, shape);
      expect(Math.abs(dx)).toBe(0);
      expect(Math.abs(dy)).toBe(0);
    }
  });

  it('bends pixels near the rim toward the centre, strongest at the edge', () => {
    const nearRim = lensDisplacement(0, 18, shape);
    const midway = lensDisplacement(0, 10, shape);
    expect(nearRim.dy).toBeLessThan(0);
    expect(Math.abs(nearRim.dy)).toBeGreaterThan(Math.abs(midway.dy));
    expect(lensDisplacement(0, -18, shape).dy).toBeCloseTo(-nearRim.dy);
    expect(lensDisplacement(58, 0, shape).dx).toBeLessThan(0);
  });
});
