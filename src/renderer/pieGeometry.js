/**
 * Geometry utilities for the dynamic radial pie menu.
 * All angles use a -90 ° offset so index 0 starts at 12-o'clock (top).
 * Slices are ring segments (inner radius to outer) so the center is hollow and the pet is clickable.
 */

/** Inner radius as % of full radius (50 in viewBox). Center is hollow for pet clicks. */
export const INNER_RADIUS_PCT = 38;

/**
 * CSS polygon() clip-path for wedge `index` out of `total` equal ring segments.
 * Ring: from inner radius to outer (50%), so center is hollow.
 *
 * @param {number} index     0-based slice index
 * @param {number} total     total number of slices
 * @param {number} gapDeg    angular gap between slices in degrees (default 1)
 * @param {number} arcPoints number of points along each arc (default 12 for smoother crust)
 */
export function computeWedgeClipPath(index, total, gapDeg = 1, arcPoints = 12) {
  const sliceDeg = 360 / total;
  const startDeg = sliceDeg * index + gapDeg / 2 - 90;
  const endDeg   = sliceDeg * (index + 1) - gapDeg / 2 - 90;
  const cx = 50, cy = 50;
  const outerR = 50;
  const innerR = (outerR * INNER_RADIUS_PCT) / 100;

  const points = [];
  for (let i = 0; i <= arcPoints; i++) {
    const angleDeg = startDeg + (endDeg - startDeg) * (i / arcPoints);
    const angleRad = (angleDeg * Math.PI) / 180;
    const x = cx + outerR * Math.cos(angleRad);
    const y = cy + outerR * Math.sin(angleRad);
    points.push(`${x.toFixed(2)}% ${y.toFixed(2)}%`);
  }
  for (let i = arcPoints; i >= 0; i--) {
    const angleDeg = startDeg + (endDeg - startDeg) * (i / arcPoints);
    const angleRad = (angleDeg * Math.PI) / 180;
    const x = cx + innerR * Math.cos(angleRad);
    const y = cy + innerR * Math.sin(angleRad);
    points.push(`${x.toFixed(2)}% ${y.toFixed(2)}%`);
  }

  return `polygon(${points.join(', ')})`;
}

/**
 * Visual centroid of a wedge — good for placing an icon.
 * Uses mid-radius of the ring (between inner and outer) when using hollow center.
 *
 * @param {number} index      0-based slice index
 * @param {number} total      total number of slices
 * @param {number} radiusPct  distance from centre as a % (default: mid-ring ~44)
 * @returns {{ x: number, y: number }} percentages
 */
export function computeWedgeCentroid(index, total, radiusPct = null) {
  const sliceDeg = 360 / total;
  const midDeg   = sliceDeg * index + sliceDeg / 2 - 90;
  const midRad   = (midDeg * Math.PI) / 180;
  const innerR = (50 * INNER_RADIUS_PCT) / 100;
  const r = radiusPct ?? (innerR + 50) / 2;
  return {
    x: 50 + r * Math.cos(midRad),
    y: 50 + r * Math.sin(midRad),
  };
}

/**
 * Hover translation vector — pushes the slice outward from the centre.
 *
 * @param {number} index  0-based slice index
 * @param {number} total  total number of slices
 * @param {number} dist   hover distance in px (default 5)
 * @returns {{ tx: number, ty: number }}
 */
export function computeHoverTranslate(index, total, dist = 5) {
  const sliceDeg = 360 / total;
  const midDeg   = sliceDeg * index + sliceDeg / 2 - 90;
  const midRad   = (midDeg * Math.PI) / 180;
  return {
    tx: Math.cos(midRad) * dist,
    ty: Math.sin(midRad) * dist,
  };
}

/**
 * SVG path `d` for wedge `index` out of `total` (viewBox 0 0 100 100).
 * Use so each wedge is a separate element and gets its own hover/tooltip.
 *
 * @param {number} index     0-based slice index
 * @param {number} total     total number of slices
 * @param {number} gapDeg    angular gap between slices (default 1)
 * @param {number} arcPoints number of points along each arc (default 12)
 */
export function computeWedgePathD(index, total, gapDeg = 1, arcPoints = 12) {
  const sliceDeg = 360 / total;
  const startDeg = sliceDeg * index + gapDeg / 2 - 90;
  const endDeg   = sliceDeg * (index + 1) - gapDeg / 2 - 90;

  const cx = 50, cy = 50;
  const outerR = 50;
  const innerR = (outerR * INNER_RADIUS_PCT) / 100;
  const pts = (r) => {
    const p = [];
    for (let i = 0; i <= arcPoints; i++) {
      const angleDeg = startDeg + (endDeg - startDeg) * (i / arcPoints);
      const angleRad = (angleDeg * Math.PI) / 180;
      p.push(`${(cx + r * Math.cos(angleRad)).toFixed(2)} ${(cy + r * Math.sin(angleRad)).toFixed(2)}`);
    }
    return p;
  };
  const outer = pts(outerR);
  const inner = pts(innerR).reverse();
  return `M ${outer[0]} L ${outer.slice(1).join(' L ')} L ${inner[0]} L ${inner.slice(1).join(' L ')} Z`;
}
