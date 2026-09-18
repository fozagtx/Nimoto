/**
 * Displacement maps for the glass effect, after Aave's "Building Glass for the
 * Web": a small PNG whose red/green channels say how far each pixel under the
 * lens bends horizontally/vertically. Neutral (128) leaves a pixel alone. The
 * map only depends on the lens *shape*, so it is generated once per shape and
 * merely moved when the lens travels.
 */

export interface LensShape {
  width: number;
  height: number;
  radius: number;
  /** How far in from the rim the bend reaches, in px. */
  curvature: number;
  /** Falloff exponent: 1 is linear, higher keeps the centre flatter. */
  splay: number;
}

const NEUTRAL = 128;

/** Signed distance to a rounded rectangle centred at the origin; positive inside. */
function roundedRectInset(x: number, y: number, shape: LensShape): { inset: number; nx: number; ny: number } {
  const hx = shape.width / 2 - shape.radius;
  const hy = shape.height / 2 - shape.radius;
  const qx = Math.abs(x) - hx;
  const qy = Math.abs(y) - hy;
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  const outer = Math.hypot(ox, oy);
  const inner = Math.min(Math.max(qx, qy), 0);
  const distance = outer + inner - shape.radius;
  let nx: number;
  let ny: number;
  if (outer > 0) {
    nx = (ox / outer) * Math.sign(x);
    ny = (oy / outer) * Math.sign(y);
  } else if (qx > qy) {
    nx = Math.sign(x);
    ny = 0;
  } else {
    nx = 0;
    ny = Math.sign(y);
  }
  return { inset: -distance, nx, ny };
}

/**
 * Displacement (in units of -1..1) for a point relative to the lens centre.
 * Pixels bend toward the centre, most strongly at the rim, not at all in the
 * flat middle or outside the glass.
 */
export function lensDisplacement(x: number, y: number, shape: LensShape): { dx: number; dy: number } {
  const { inset, nx, ny } = roundedRectInset(x, y, shape);
  if (inset <= 0) return { dx: 0, dy: 0 };
  const t = Math.min(Math.max(1 - inset / shape.curvature, 0), 1);
  const strength = t ** shape.splay;
  return { dx: -nx * strength, dy: -ny * strength };
}

function encode(value: number): number {
  return Math.round(NEUTRAL + value * 127);
}

/**
 * Builds the map as a PNG data URL. Only the top-left quadrant is computed;
 * the other three are mirrored with the matching displacement signs flipped.
 */
export function generateLensMap(shape: LensShape): string {
  const width = Math.max(1, Math.round(shape.width));
  const height = Math.max(1, Math.round(shape.height));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable');
  const image = ctx.createImageData(width, height);
  const data = image.data;

  const put = (px: number, py: number, dx: number, dy: number) => {
    const i = (py * width + px) * 4;
    data[i] = encode(dx);
    data[i + 1] = encode(dy);
    data[i + 2] = NEUTRAL;
    data[i + 3] = 255;
  };

  const halfW = Math.ceil(width / 2);
  const halfH = Math.ceil(height / 2);
  for (let py = 0; py < halfH; py++) {
    for (let px = 0; px < halfW; px++) {
      const x = px + 0.5 - width / 2;
      const y = py + 0.5 - height / 2;
      const { dx, dy } = lensDisplacement(x, y, shape);
      put(px, py, dx, dy);
      put(width - 1 - px, py, -dx, dy);
      put(px, height - 1 - py, dx, -dy);
      put(width - 1 - px, height - 1 - py, -dx, -dy);
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL('image/png');
}
