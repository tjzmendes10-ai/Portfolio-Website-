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
  "Christchurch",
  "Queenstown",
  "Gold Coast",
  "Newcastle",
  "Wollongong",
  "Hobart",
  "Darwin",
];
// Satellite cities sit close to a larger neighbour, so their markers are drawn smaller.
const minorCities = new Set(["Gold Coast", "Newcastle", "Wollongong"]);
// Natural Earth 1:50m has no Wollongong or Queenstown, so they use their published coordinates.
const supplemental = {
  Wollongong: [150.8931, -34.4278],
  Queenstown: [168.6626, -45.0312],
};
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

// ---- Europe: the opening state, in the same 1000x680 frame so the glide to ANZ needs no transform. ----
// London is the hub; the other cities are the "business bridges" drawn from it.
const europeOrder = [
  "London",
  "Edinburgh",
  "Dublin",
  "Paris",
  "Madrid",
  "Lisbon",
  "Bern",
  "Amsterdam",
  "Brussels",
  "Berlin",
  "Copenhagen",
  "Oslo",
  "Stockholm",
  "Helsinki",
  "Warsaw",
  "Rome",
  "Milan",
  "Prague",
  "Reykjavik",
  "Athens",
  "Cluj-Napoca",
  "Budapest",
];
// Natural Earth 1:50m may omit smaller cities, so any missing one uses its published coordinates.
const europeSupplemental = { "Cluj-Napoca": [23.5899, 46.7712] };
// Natural Earth lists some cities by local name; match on its ASCII name, with an alias for the English one.
const europeAliases = { Copenhagen: "Kobenhavn" };
const inEurope = ([lon, lat]) => lon > -30 && lon < 45 && lat > 34 && lat < 72;
const europeRaw = europeOrder.map((name) => {
  // Several names also exist elsewhere (Dublin GA, Paris TX), so keep European matches and prefer the largest.
  const feature = places.features
    .filter(
      (place) =>
        [place.properties.name, place.properties.nameascii].includes(
          europeAliases[name] ?? name,
        ) && inEurope(place.geometry.coordinates),
    )
    .sort((a, b) => b.properties.pop_max - a.properties.pop_max)[0];
  const coordinates = feature?.geometry.coordinates ?? europeSupplemental[name];
  if (!coordinates) throw new Error(`City coordinates not found: ${name}`);
  return { name, point: mercator(coordinates) };
});
const europeX = europeRaw.map(({ point }) => point[0]);
const europeY = europeRaw.map(({ point }) => point[1]);
const europeMinX = Math.min(...europeX),
  europeMinY = Math.min(...europeY);
const europeW = Math.max(...europeX) - europeMinX;
const europeH = Math.max(...europeY) - europeMinY;
const europeScale = Math.min(
  (width - padding * 2) / europeW,
  (height - padding * 2) / europeH,
);
const europeCities = europeRaw.map(({ name, point }) => ({
  id: name.toLowerCase().replaceAll(" ", "-"),
  name,
  x: number(
    (width - europeW * europeScale) / 2 + (point[0] - europeMinX) * europeScale,
  ),
  y: number(
    (height - europeH * europeScale) / 2 +
      (point[1] - europeMinY) * europeScale,
  ),
}));

// Faint Europe coastline, in the same projection and frame as the dots. Land polygons run on into Asia and
// Africa, so keep only the points inside a box around the frame; segments that would cross the box are
// dropped, which leaves open coastlines rather than a straight edge along the box.
const land = await dataset("ne_50m_land.geojson");
const europeBox = { west: -32, east: 42, south: 32, north: 70 };
const insideBox = ([lon, lat]) =>
  lon > europeBox.west &&
  lon < europeBox.east &&
  lat > europeBox.south &&
  lat < europeBox.north;
const europeProject = ([x, y]) => [
  (width - europeW * europeScale) / 2 + (x - europeMinX) * europeScale,
  (height - europeH * europeScale) / 2 + (y - europeMinY) * europeScale,
];
const europePaths = [];
for (const feature of land.features) {
  const polygons =
    feature.geometry.type === "MultiPolygon"
      ? feature.geometry.coordinates
      : [feature.geometry.coordinates];
  for (const [ring] of polygons) {
    let run = [];
    const flush = () => {
      if (run.length > 2) {
        const points = simplify(run.map(mercator).map(europeProject), 0.5);
        europePaths.push(
          `<path vector-effect="non-scaling-stroke" d="M${points.map(xy).join("L")}"/>`,
        );
      }
      run = [];
    };
    for (const point of ring) insideBox(point) ? run.push(point) : flush();
    flush();
  }
}
const europeSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"><metadata>Natural Earth 1:50m land, public domain; Mercator projection; source commit ${commit}.</metadata><g class="europe-outline" fill="none" stroke-linejoin="round" stroke-linecap="round">${europePaths.join("")}</g></svg>\n`;
await writeFile(path.join(root, "src/assets/europe-outline.svg"), europeSvg);

// Pair each ANZ city with a European dot by rough relative position. Minimising the total squared
// distance (on bounding-box-normalised coordinates) also keeps the glide paths from crossing.
// London is pinned to Sydney so the hub moves; the 7 unmatched European dots fade out instead.
const normaliser = (points) => {
  const xs = points.map((point) => point.x),
    ys = points.map((point) => point.y);
  const left = Math.min(...xs),
    top = Math.min(...ys);
  const spanX = Math.max(...xs) - left,
    spanY = Math.max(...ys) - top;
  return (point) => [(point.x - left) / spanX, (point.y - top) / spanY];
};
const europeNorm = europeCities.map(normaliser(europeCities));
const anzNorm = cities.map(normaliser(cities));
const cost = (europeIndex, anzIndex) =>
  europeIndex === 0 || anzIndex === 0
    ? europeIndex === anzIndex
      ? 0
      : 1e6
    : Math.hypot(
        europeNorm[europeIndex][0] - anzNorm[anzIndex][0],
        europeNorm[europeIndex][1] - anzNorm[anzIndex][1],
      ) ** 2;
// slots[anzIndex] = europe index. Start with London first, then improve by swapping until stable.
const slots = europeCities.map((_, index) => index);
for (let improved = true; improved;) {
  improved = false;
  for (let a = 0; a < slots.length; a++)
    for (let b = a + 1; b < slots.length; b++) {
      const aIsAnz = a < cities.length,
        bIsAnz = b < cities.length;
      if (!aIsAnz && !bIsAnz) continue;
      const before =
        (aIsAnz ? cost(slots[a], a) : 0) + (bIsAnz ? cost(slots[b], b) : 0);
      const after =
        (aIsAnz ? cost(slots[b], a) : 0) + (bIsAnz ? cost(slots[a], b) : 0);
      if (after < before - 1e-9) {
        [slots[a], slots[b]] = [slots[b], slots[a]];
        improved = true;
      }
    }
}
slots.slice(0, cities.length).forEach((europeIndex, anzIndex) => {
  europeCities[europeIndex].target = cities[anzIndex].id;
});
await writeFile(
  path.join(root, "src/data/europe-map.json"),
  JSON.stringify(
    { width, height, hub: "london", cities: europeCities },
    null,
    2,
  ) + "\n",
);
console.log(
  europeCities
    .map((city) => `${city.name} -> ${city.target ?? "(fades out)"}`)
    .join("\n"),
);

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
