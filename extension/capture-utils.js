function calculateCapturePositions(scrollHeight, viewportHeight) {
  const height = Number(scrollHeight);
  const viewport = Number(viewportHeight);
  if (!Number.isFinite(height) || !Number.isFinite(viewport) || height <= 0 || viewport <= 0) {
    return [0];
  }

  const maxScroll = Math.max(0, Math.floor(height - viewport));
  const positions = [];
  for (let position = 0; position < maxScroll; position += viewport) {
    positions.push(Math.floor(position));
  }
  positions.push(maxScroll);
  return [...new Set(positions)];
}

function normalizeCaptureCoords(coords, documentCoords, geometry) {
  const fullPage = documentCoords && geometry?.width > 0 && geometry?.height > 0;
  const source = fullPage ? documentCoords : coords;
  if (!source) return null;
  const scaleX = fullPage ? 100 / geometry.width : 1;
  const scaleY = fullPage ? 100 / geometry.height : 1;
  const x = fullPage ? source.x * scaleX : source.xPercent;
  const y = fullPage ? source.y * scaleY : source.yPercent;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const clamp = value => Math.max(0, Math.min(100, value));
  const result = { xPercent: clamp(x), yPercent: clamp(y) };
  if (source.box) {
    const box = source.box;
    if ([box.left, box.top, box.width, box.height].every(Number.isFinite)) {
      const left = clamp(box.left * scaleX), top = clamp(box.top * scaleY);
      result.box = { left, top, width: Math.max(0, clamp((box.left + box.width) * scaleX) - left), height: Math.max(0, clamp((box.top + box.height) * scaleY) - top) };
    }
  }
  return result;
}

if (typeof module !== "undefined") {
  module.exports = { calculateCapturePositions, normalizeCaptureCoords };
}
