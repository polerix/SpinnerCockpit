const R = 6371000;
export function distance(a, b) {
  const rad = Math.PI / 180;
  const x = (b[0] - a[0]) * rad * Math.cos(((a[1] + b[1]) / 2) * rad),
    y = (b[1] - a[1]) * rad;
  return Math.hypot(x, y) * R;
}
export function bearing(a, b) {
  return Math.atan2(
    (b[0] - a[0]) * Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180),
    b[1] - a[1],
  );
}
export function makeRoute(points) {
  const lengths = points.slice(1).map((p, i) => distance(points[i], p));
  return { points, lengths, total: lengths.reduce((a, b) => a + b, 0) };
}
export function sampleRoute(route, travel) {
  let d = ((travel % route.total) + route.total) % route.total;
  for (let i = 0; i < route.lengths.length; i++) {
    const n = route.lengths[i];
    if (d <= n || i === route.lengths.length - 1) {
      const t = n ? d / n : 0,
        a = route.points[i],
        b = route.points[i + 1];
      return {
        lon: a[0] + (b[0] - a[0]) * t,
        lat: a[1] + (b[1] - a[1]) * t,
        heading: bearing(a, b),
      };
    }
    d -= n;
  }
}
export function movePosition(lon, lat, heading, meters) {
  return {
    lon:
      lon +
      (((Math.sin(heading) * meters) / (R * Math.cos((lat * Math.PI) / 180))) *
        180) /
        Math.PI,
    lat: lat + (((Math.cos(heading) * meters) / R) * 180) / Math.PI,
  };
}
export function turnToward(current, target, limit) {
  const delta = Math.atan2(
    Math.sin(target - current),
    Math.cos(target - current),
  );
  return current + Math.max(-limit, Math.min(limit, delta));
}
