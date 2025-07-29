/**
 * Fungsi untuk mengecek apakah sebuah titik berada di dalam poligon.
 */
function isPointInPolygon(point, polygon) {
  let isInside = false;
  const { lat, lng } = point;
  if (!polygon || !Array.isArray(polygon)) {
    return false;
  }
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lat, yi = polygon[i].lng;
    const xj = polygon[j].lat, yj = polygon[j].lng;
    const intersect = ((yi > lng) !== (yj > lng)) && (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi);
    if (intersect) isInside = !isInside;
  }
  return isInside;
}

module.exports = { isPointInPolygon };