// Development-only asset generation. The browser never downloads the source datasets.
// Produces an outline of the UK, Canada and Portugal (Tom's homes before Sydney) in the
// SAME projection/frame as the ANZ outline, so the two can morph into one another.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const commit = "ca96624a56bd078437bca8184e78163e5039ad19";
const source = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${commit}/geojson/`;
const cache = path.join(root, ".deploy/natural-earth");
await mkdir(cache, { recursive: true });

async function dataset(name) {
  const filename = path.join(cache, name);
  let contents;
  try {
    contents = await readFile(filename, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const response = await fetch(source + name);
    if (!response.ok)
      throw new Error(`Natural Earth download failed: ${response.status}`);
    contents = await response.text();
    await writeFile(filename, contents);
  }
  return JSON.parse(contents);
}

const countries = await dataset("ne_50m_admin_0_countries.geojson");
const mercator = ([longitude, latitude]) => [
  (longitude * Math.PI) / 180,
  -Math.log(Math.tan(Math.PI / 4 + (latitude * Math.PI) / 360)),
];

// Mainland only: each country's largest ring by area, so Canada's thousands of
// Arctic islands and Portugal's Atlantic islands (Azores, Madeira) drop out.
const wanted = ["United Kingdom", "Canada", "Portugal"];
const ringArea = (ring) =>
  Math.abs(
    ring.reduce((sum, point, index) => {
      const next = ring[(index + 1) % ring.length];
      return sum + point[0] * next[1] - next[0] * point[1];
    }, 0) / 2,
  );
const mainlands = wanted.map((name) => {
  const country = countries.features.find((f) => f.properties.ADMIN === name);
  if (!country) throw new Error(`Country not found: ${name}`);
  const polygons =
    country.geometry.type === "MultiPolygon"
      ? country.geometry.coordinates
      : [country.geometry.coordinates];
  const rings = polygons.map((polygon) => polygon[0]);
  const projected = rings.map((ring) => ring.map(mercator));
  const largest = projected.reduce((best, ring) =>
    ringArea(ring) > ringArea(best) ? ring : best,
  );
  return { name, points: largest };
});

// Fit all three mainlands into the same 1000x680 frame as the ANZ outline, keeping
// their real relative positions (Canada west, UK/Portugal east) so the morph reads
// as "west to east, old world to new".
const width = 1000,
  height = 680,
  padding = 60;
const coordinates = mainlands.flatMap((m) => m.points);
const minX = Math.min(...coordinates.map(([x]) => x));
const maxX = Math.max(...coordinates.map(([x]) => x));
const minY = Math.min(...coordinates.map(([, y]) => y));
const maxY = Math.max(...coordinates.map(([, y]) => y));
const scale = Math.min(
  (width - padding * 2) / (maxX - minX),
  (height - padding * 2) / (maxY - minY),
);
const offsetX = (width - (maxX - minX) * scale) / 2;
const offsetY = (height - (maxY - minY) * scale) / 2;
const project = ([x, y]) => [
  offsetX + (x - minX) * scale,
  offsetY + (y - minY) * scale,
];

function segmentDistance(point, start, end) {
  const dx = end[0] - start[0],
    dy = end[1] - start[1];
  const amount =
    dx || dy
      ? Math.max(
          0,
          Math.min(
            1,
            ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) /
              (dx * dx + dy * dy),
          ),
        )
      : 0;
  return Math.hypot(
    point[0] - start[0] - amount * dx,
    point[1] - start[1] - amount * dy,
  );
}
function simplify(points, tolerance = 0.5) {
  let furthest = 0,
    distance = 0;
  for (let index = 1; index < points.length - 1; index++) {
    const next = segmentDistance(points[index], points[0], points.at(-1));
    if (next > distance) {
      distance = next;
      furthest = index;
    }
  }
  if (distance <= tolerance) return [points[0], points.at(-1)];
  return [
    ...simplify(points.slice(0, furthest + 1), tolerance).slice(0, -1),
    ...simplify(points.slice(furthest), tolerance),
  ];
}
const number = (value) => Number(value.toFixed(2));
const xy = (point) => `${number(point[0])} ${number(point[1])}`;
const midpoint = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

const paths = mainlands.map(({ name, points: raw }) => {
  let points = raw.map(project);
  points = simplify(points);
  if (points[0][0] === points.at(-1)[0] && points[0][1] === points.at(-1)[1])
    points.pop();
  let d = `M${xy(midpoint(points.at(-1), points[0]))}`;
  points.forEach((point, index) => {
    d += `Q${xy(point)} ${xy(midpoint(point, points[(index + 1) % points.length]))}`;
  });
  return { name, d: `${d}Z` };
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" class="origin-map" aria-hidden="true" focusable="false"><title>United Kingdom, Canada and Portugal</title><metadata>Natural Earth 1:50m, public domain; Mercator projection; source commit ${commit}.</metadata><defs><g id="origin-land" fill="none" stroke-linejoin="round" stroke-linecap="round">${paths.map((p) => `<path data-country="${p.name}" vector-effect="non-scaling-stroke" d="${p.d}"/>`).join("")}</g></defs><use class="origin-outline" href="#origin-land"/></svg>\n`;
await mkdir(path.join(root, "src/assets"), { recursive: true });
await writeFile(path.join(root, "src/assets/origin-outline.svg"), svg);
await writeFile(
  path.join(root, "src/data/origin-countries.json"),
  JSON.stringify(
    {
      width,
      height,
      countries: paths.map((p) => p.name),
      source: {
        commit,
        countries: source + "ne_50m_admin_0_countries.geojson",
        licence: "Public domain",
        terms: "https://www.naturalearthdata.com/about/terms-of-use/",
      },
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Generated ${paths.length} country outlines (${paths.map((p) => p.name).join(", ")}). SVG: ${Buffer.byteLength(svg)} bytes.`,
);
