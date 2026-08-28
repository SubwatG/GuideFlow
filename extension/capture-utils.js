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

if (typeof module !== "undefined") {
  module.exports = { calculateCapturePositions };
}
