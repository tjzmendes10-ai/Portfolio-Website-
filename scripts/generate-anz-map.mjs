// Development-only asset generation. The browser never downloads the source datasets.
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
const places = await dataset("ne_50m_populated_places_simple.geojson");
const mercator = ([longitude, latitude]) => [
  (longitude * Math.PI) / 180,
  -Math.log(Math.tan(Math.PI / 4 + (latitude * Math.PI) / 360)),
];
const rings = [];
for (const country of countries.features) {
  if (!["Australia", "New Zealand"].includes(country.properties.ADMIN))
    continue;
  const polygons =
    country.geometry.type === "MultiPolygon"
      ? country.geometry.coordinates
      : [country.geometry.coordinates];
  for (const polygon of polygons) {
    const ring = polygon[0];
    // Keep mainland/coastal islands in the ANZ frame; omit distant overseas islands.
    if (
      ring.every(
        ([lon, lat]) => lon > 110 && lon < 180 && lat > -50 && lat < -9,
      )
    ) {
      rings.push({
        country: country.properties.ADMIN,
        points: ring.map(mercator),
      });
    }
  }
}
const coordinates = rings.flatMap((ring) => ring.points);
const minX = Math.min(...coordinates.map(([x]) => x));
const maxX = Math.max(...coordinates.map(([x]) => x));
const minY = Math.min(...coordinates.map(([, y]) => y));
const maxY = Math.max(...coordinates.map(([, y]) => y));
const width = 1000,
  height = 680,
  padding = 35;
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
function simplify(points, tolerance = 0.4) {
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
const paths = [];
for (const ring of rings) {
  let points = ring.points.map(project);
  const area = Math.abs(
    points.reduce((sum, point, index) => {
      const next = points[(index + 1) % points.length];
      return sum + point[0] * next[1] - next[0] * point[1];
    }, 0) / 2,
  );
  if (area < 3) continue;
  points = simplify(points);
  if (points.length < 4) continue;
  if (points[0][0] === points.at(-1)[0] && points[0][1] === points.at(-1)[1])
    points.pop();
  let d = `M${xy(midpoint(points.at(-1), points[0]))}`;
  points.forEach((point, index) => {
    d += `Q${xy(point)} ${xy(midpoint(point, points[(index + 1) % points.length]))}`;
  });
  paths.push(
    `<path data-country="${ring.country}" vector-effect="non-scaling-stroke" d="${d}Z"/>`,
  );
}
const cityOrder = [
  "Sydney",
  "Melbourne",
  "Brisbane",
  "Auckland",
  "Perth",
  "Adelaide",
  "Canberra",
  "Wellington",
  "Gold Coast",
  "Newcastle",
  "Wollongong",
  "Hobart",
  "Darwin",
  "Christchurch",
];
// Satellite cities sit close to a larger neighbour, so their markers are drawn smaller.
const minorCities = new Set(["Gold Coast", "Newcastle", "Wollongong"]);
// Natural Earth 1:50m has no Wollongong, so it uses its published coordinates instead.
const supplemental = { Wollongong: [150.8931, -34.4278] };
const cities = cityOrder.map((name) => {
  const feature = places.features.find(
    (place) =>
      (place.properties.name || place.properties.NAME) === name &&
      place.geometry.coordinates[0] > 110,
  );
  const coordinates = feature?.geometry.coordinates ?? supplemental[name];
  if (!coordinates) throw new Error(`City coordinates not found: ${name}`);
  const [x, y] = project(mercator(coordinates));
  return {
    id: name.toLowerCase().replaceAll(" ", "-"),
    name,
    x: number(x),
    y: number(y),
    ...(minorCities.has(name) && { minor: true }),
  };
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" class="anz-map" aria-hidden="true" focusable="false"><title>Australia and New Zealand</title><metadata>Natural Earth 1:50m, public domain; Mercator projection; source commit ${commit}.</metadata><defs><g id="anz-land" fill="none" stroke-linejoin="round" stroke-linecap="round">${paths.join("")}</g></defs><use class="anz-outline" href="#anz-land"/></svg>\n`;
await mkdir(path.join(root, "src/assets"), { recursive: true });
await mkdir(path.join(root, "src/data"), { recursive: true });
await writeFile(path.join(root, "src/assets/anz-outline.svg"), svg);
await writeFile(
  path.join(root, "src/data/anz-map.json"),
  JSON.stringify(
    {
      width,
      height,
      cities,
      source: {
        commit,
        countries: source + "ne_50m_admin_0_countries.geojson",
        places: source + "ne_50m_populated_places_simple.geojson",
        licence: "Public domain",
        terms: "https://www.naturalearthdata.com/about/terms-of-use/",
      },
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Generated ${paths.length} coastline paths and ${cities.length} city anchors. SVG: ${Buffer.byteLength(svg)} bytes.`,
);
