// The supplied Tinkercad SVG is a polygon export in millimetres.
export function parseDashboard(svg) {
  const paths = [...svg.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)].flatMap((m) =>
    m[1].split(/(?=[Mm])/).filter((s) => s.trim()),
  );
  const contours = paths.map((path) => {
    if (/[ACHQSTV]/i.test(path.replace(/[eE][-+]?\d+/g, "")))
      throw Error("Dashboard must contain only M/L/Z polygons");
    const numbers = (
      path.match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi) || []
    ).map(Number);
    const xs = numbers.filter((_, i) => i % 2 === 0),
      ys = numbers.filter((_, i) => i % 2 === 1);
    const x = Math.min(...xs),
      y = Math.min(...ys),
      w = Math.max(...xs) - x,
      h = Math.max(...ys) - y;
    return { path, box: [x, y, w, h] };
  });
  const outer = contours.find((c) => c.box[2] > 150);
  if (!outer) throw Error("Dashboard outer contour missing");
  const sort = (a, b) =>
    Math.abs(a.box[1] - b.box[1]) < 0.1
      ? a.box[0] - b.box[0]
      : a.box[1] - b.box[1];
  const strips = contours
    .filter((c) => c.box[2] > 40 && c.box[2] < 80 && c.box[3] < 10)
    .sort(sort);
  const panels = contours
    .filter((c) => c.box[2] > 20 && c.box[2] < 35 && c.box[3] > 15)
    .sort(sort);
  const small = contours
    .filter((c) => c.box[2] > 7 && c.box[2] < 9 && c.box[3] > 7 && c.box[3] < 9)
    .sort(sort);
  const circles = contours
    .filter(
      (c) => Math.abs(c.box[2] - 10) < 0.05 && Math.abs(c.box[3] - 10) < 0.05,
    )
    .sort(sort);
  if (
    strips.length !== 2 ||
    panels.length !== 6 ||
    small.length !== 18 ||
    circles.length !== 2
  )
    throw Error("Unexpected dashboard opening count");
  const x = Math.min(...panels.map((c) => c.box[0])),
    y = Math.min(...panels.map((c) => c.box[1]));
  const right = Math.max(...panels.map((c) => c.box[0] + c.box[2])),
    bottom = Math.max(...panels.map((c) => c.box[1] + c.box[3]));
  const screenW = 146.6;
  const centerX = outer.box[0] + outer.box[2] / 2;
  const screenLeft = centerX - screenW / 2,
    screenRight = centerX + screenW / 2,
    [s0, s1] = strips;
  const decalSize = 6;
  const decalY = s0.box[1] + s0.box[3] / 2 - decalSize / 2;
  const decals = [
    [
      (screenLeft + s0.box[0]) / 2 - decalSize / 2,
      decalY,
      decalSize,
      decalSize,
    ],
    [
      (s0.box[0] + s0.box[2] + s1.box[0]) / 2 - decalSize / 2,
      decalY,
      decalSize,
      decalSize,
    ],
    [
      (s1.box[0] + s1.box[2] + screenRight) / 2 - decalSize / 2,
      decalY,
      decalSize,
      decalSize,
    ],
  ].map((box) => ({ box }));
  return {
    center: [outer.box[0] + outer.box[2] / 2, outer.box[1] + outer.box[3] / 2],
    outer,
    strips,
    panels,
    small,
    circles,
    holes: contours.filter((c) => c !== outer),
    hud: [x, y, right - x, bottom - y],
    decals,
  };
}
