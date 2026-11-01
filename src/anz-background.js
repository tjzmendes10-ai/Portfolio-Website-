import outline from "./assets/anz-outline.svg?raw";
import europeOutline from "./assets/europe-outline.svg?raw";
import map from "./data/anz-map.json";
import europe from "./data/europe-map.json";
import "./anz-background.css";

const ns = "http://www.w3.org/2000/svg";
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const smooth = (value) => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};
const mix = (from, to, amount) => from + (to - from) * amount;
const element = (tag, attributes = {}) => {
  const node = document.createElementNS(ns, tag);
  Object.entries(attributes).forEach(([name, value]) =>
    node.setAttribute(name, value),
  );
  return node;
};

export function initAnzBackground() {
  const layer = document.querySelector("#anz-background");
  const stage = layer.querySelector(".anz-map-stage");
  stage.innerHTML = outline;
  const svg = stage.querySelector("svg");
  const halo = document.querySelector(".cursor-halo");
  const footer = document.querySelector(".site-footer");
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const compact = window.matchMedia("(max-width: 700px), (pointer: coarse)");
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
  // Cities arrive evenly between 20% and 66% of the page scroll, so the finished network is on screen well before the footer.
  const thresholds = map.cities.map(
    (_, index) => 0.2 + (index * 0.46) / (map.cities.length - 1),
  );

  const gradient = element("radialGradient", { id: "anz-cursor-gradient" });
  gradient.append(
    element("stop", { offset: 0, "stop-color": "white", "stop-opacity": 0.8 }),
    element("stop", { offset: 1, "stop-color": "white", "stop-opacity": 0 }),
  );
  const mask = element("mask", {
    id: "anz-cursor-mask",
    maskUnits: "userSpaceOnUse",
    x: 0,
    y: 0,
    width: map.width,
    height: map.height,
  });
  const cursorMask = element("circle", {
    cx: -1000,
    cy: -1000,
    r: 160,
    fill: "url(#anz-cursor-gradient)",
  });
  mask.append(cursorMask);
  svg.querySelector("defs").append(gradient, mask);
  const cursorOutline = element("use", {
    href: "#anz-land",
    class: "anz-cursor-outline",
    mask: "url(#anz-cursor-mask)",
  });
  svg.append(cursorOutline);

  // The Europe coastline lives in the same frame as the ANZ one, so it fades out as the dots glide away.
  const europeLand = document.createElement("div");
  europeLand.innerHTML = europeOutline;
  const europeCoast = europeLand.querySelector(".europe-outline");
  svg.append(europeCoast);

  const routesGroup = element("g", { class: "anz-routes" });
  const nodesGroup = element("g", { class: "anz-cities" });
  const spokesGroup = element("g", { class: "europe-spokes" });
  const launchGroup = element("g", { class: "launch-labels" });
  svg.append(spokesGroup, routesGroup, nodesGroup, launchGroup);

  // Sydney is the hub, so every city links to it. Auckland is the NZ hub and also links to Melbourne, Brisbane and Perth.
  // Each arriving city connects to earlier cities, listed as [arriving city, earlier city], grouped by arriving city. These are an aspirational motif, not past-work locations.
  const connections = [
    ["melbourne", "sydney"],
    ["brisbane", "sydney"],
    ["brisbane", "melbourne"],
    ["auckland", "sydney"],
    ["auckland", "brisbane"],
    ["auckland", "melbourne"],
    ["perth", "melbourne"],
    ["perth", "sydney"],
    ["perth", "auckland"],
    ["adelaide", "melbourne"],
    ["adelaide", "perth"],
    ["adelaide", "sydney"],
    ["canberra", "sydney"],
    ["canberra", "melbourne"],
    ["wellington", "auckland"],
    ["christchurch", "wellington"],
    ["christchurch", "auckland"],
    ["christchurch", "sydney"],
    ["queenstown", "christchurch"],
    ["queenstown", "wellington"],
    ["queenstown", "auckland"],
    ["gold-coast", "sydney"],
    ["gold-coast", "auckland"],
    ["newcastle", "sydney"],
    ["newcastle", "brisbane"],
    ["wollongong", "canberra"],
    ["wollongong", "melbourne"],
    ["wollongong", "sydney"],
    ["hobart", "melbourne"],
    ["hobart", "sydney"],
    ["darwin", "perth"],
    ["darwin", "brisbane"],
    ["darwin", "sydney"],
  ].map((pair) =>
    pair.map((id) => map.cities.findIndex((city) => city.id === id)),
  );
  const routes = connections.map(([to, from], index) => {
    // Compact screens drop the extra links, but keep every Sydney link so the hub still reads.
    const secondary =
      index > 0 && connections[index - 1][0] === to && from !== 0;
    const group = element("g", {
      class: `anz-route-group${secondary ? " is-secondary" : ""}`,
    });
    const attributes = {
      fill: "none",
      "vector-effect": "non-scaling-stroke",
    };
    const glow = element("path", { ...attributes, class: "anz-route-glow" });
    const line = element("path", { ...attributes, class: "anz-route" });
    const packet = element("circle", {
      r: 1.5,
      class: "anz-packet",
      opacity: 0,
    });
    group.append(glow, line, packet);
    routesGroup.append(group);
    return {
      from: map.cities[from],
      to: map.cities[to],
      activation: to,
      secondary,
      group,
      glow,
      line,
      packet,
      index,
    };
  });

  // One marker style for every dot, so a European dot can become an ANZ city without changing look.
  const marker = (x, y, coreRadius) => {
    const group = element("g", { opacity: 0 });
    const aura = element("circle", {
      cx: x,
      cy: y,
      r: 9,
      class: "anz-city-aura",
    });
    const ring = element("circle", {
      cx: x,
      cy: y,
      r: 5,
      class: "anz-city-ring",
    });
    const core = element("circle", {
      cx: x,
      cy: y,
      r: coreRadius,
      class: "anz-city-core",
    });
    group.append(aura, ring, core);
    nodesGroup.append(group);
    return { group, aura, ring, core };
  };
  const cityLabel = (city, text, className) => {
    const label = element("text", {
      x: city.x + 11,
      y: city.y - 9,
      class: className,
    });
    label.textContent = text;
    return label;
  };

  const hub = europe.cities.find((city) => city.id === europe.hub);
  // Spokes go to every other city, nearest first, so the bridges ripple outwards from London.
  const spokeOrder = europe.cities
    .filter((city) => city !== hub)
    .sort(
      (a, b) =>
        Math.hypot(a.x - hub.x, a.y - hub.y) -
        Math.hypot(b.x - hub.x, b.y - hub.y),
    );
  // The opening draws in about 2s of real time (the page loads at the top, so scroll can't drive it).
  const spokeStart = 0.25,
    spokeStagger = 0.065,
    spokeLength = 0.5;
  const spokes = spokeOrder.map((city, index) => {
    const line = element("path", {
      class: "europe-spoke",
      fill: "none",
      "vector-effect": "non-scaling-stroke",
    });
    spokesGroup.append(line);
    const start = spokeStart + index * spokeStagger;
    return { city, line, start, index };
  });
  // Each ANZ city is the landing spot of one European dot; unmatched dots fade out mid-glide.
  const sources = new Map(
    europe.cities
      .filter((city) => city.target)
      .map((city) => [city.target, city]),
  );
  const arrivals = new Map(
    spokes.map((spoke) => [spoke.city.id, spoke.start + spokeLength * 0.7]),
  );

  const cities = map.cities.map((city, index) => {
    const source = sources.get(city.id);
    const parts = marker(
      source.x,
      source.y,
      city.minor ? 1.4 : city.id === "sydney" ? 2.4 : 1.9,
    );
    // Markers are drawn at their European position and translated, so they glide as one group.
    let label, hubLabel;
    if (city.id === "sydney") {
      // Both labels are placed from the London dot; they travel with it and cross-fade.
      label = cityLabel(source, "Sydney", "anz-sydney-label");
      hubLabel = cityLabel(source, "London", "anz-sydney-label");
      parts.group.append(label, hubLabel);
    }
    return { ...city, ...parts, source, label, hubLabel, index };
  });
  // Launch labels sit on the map in SVG units, so they scale and resize with it. `side` is which way the
  // text runs from its dot; `lift` nudges it up where neighbouring dots or spokes would run through it.
  const launches = [
    { id: "oslo", text: "Norway", side: 1, lift: 0 },
    { id: "athens", text: "Greece", side: 1, lift: 20 },
    { id: "berlin", text: "Germany · property", side: 1, lift: 16 },
    { id: "bremen", text: "Renewable energy", side: -1, lift: 14 },
    { id: "reykjavik", text: "Iceland", side: 1, lift: -12 },
  ].map(({ id, text, side, lift }) => {
    const city = europe.cities.find((entry) => entry.id === id);
    const spoke = spokes.find((entry) => entry.city === city);
    const x = city.x + side * 11;
    const label = element("text", {
      x,
      y: city.y - lift,
      class: `launch-label${side < 0 ? " is-left" : ""}`,
      opacity: 0,
    });
    const tag = element("tspan", { class: "launch-tag" });
    tag.textContent = "Opened";
    const name = element("tspan", {
      class: "launch-name",
      x,
      dy: 9,
    });
    name.textContent = text;
    label.append(tag, name);
    launchGroup.append(label);
    // Appear just after the spoke has finished drawing to the dot.
    return { label, appears: spoke.start + spokeLength + 0.1 };
  });

  const landing = new Map(cities.map((city) => [city.source, city]));
  const leftovers = europe.cities
    .filter((city) => !city.target)
    .map((city, index) => ({
      ...city,
      ...marker(city.x, city.y, 1.4),
      index: index + map.cities.length,
    }));

  let bounds = svg.getBoundingClientRect();
  let pointer = { x: -1000, y: -1000, active: false };
  let easedPointer = { x: 0, y: 0, initialized: false };
  let targetProgress = 0;
  let progress = 0;
  let elapsed = 0;
  let frameId = 0;
  let lastPaint = 0;
  let lastTime = 0;

  function updateGeometry() {
    bounds = svg.getBoundingClientRect();
    const available =
      document.documentElement.scrollHeight - window.innerHeight;
    targetProgress = available > 0 ? clamp(window.scrollY / available) : 0;
  }

  function draw(value, time) {
    const still = motion.matches;
    const small = compact.matches;
    const morph = still ? 1 : smooth((value - 0.01) / 0.27);
    const mouseX = ((pointer.x - bounds.left) / bounds.width) * map.width;
    const mouseY = ((pointer.y - bounds.top) / bounds.height) * map.height;
    const interactive =
      pointer.active && finePointer.matches && !still && !small;
    svg.style.setProperty(
      "--outline-opacity",
      ((0.27 + value * 0.1) * morph).toFixed(3),
    );
    cursorOutline.style.opacity = morph;
    svg.classList.toggle("is-compact", small);
    footer.classList.toggle("is-network-complete", value >= 0.99);

    europeCoast.style.opacity = still
      ? 0
      : (smooth(time / 1200) * (1 - morph)).toFixed(3);

    // Dots glide with the same scroll morph the old ambient dots used; each ANZ city is one European dot.
    const seconds = time / 1000;
    const position = (city) => ({
      x: mix(city.source.x, city.x, morph),
      y: mix(city.source.y, city.y, morph),
    });
    const hubPosition = position(cities[0]);
    // Spokes retract over the first few percent of scroll, following the dots as they start to move.
    const spokeFade = still ? 0 : 1 - smooth(value / 0.07);
    spokesGroup.style.display = spokeFade > 0.001 ? "" : "none";
    // Every dot keeps its spoke on compact screens too: the lines are cheap, and a dot with no line looks broken.
    spokes.forEach(({ city, line, start }) => {
      const target = landing.get(city);
      const end = target ? position(target) : city;
      const amount = smooth((seconds - start) / spokeLength);
      if (still || amount === 0) {
        line.style.display = "none";
        return;
      }
      line.style.display = "";
      line.setAttribute(
        "d",
        `M${hubPosition.x.toFixed(2)},${hubPosition.y.toFixed(2)} L${mix(hubPosition.x, end.x, amount).toFixed(2)},${mix(hubPosition.y, end.y, amount).toFixed(2)}`,
      );
      line.setAttribute("opacity", (amount * spokeFade).toFixed(3));
    });

    // Labels leave with the spokes, long before the dots reach Australia. Compact screens show a text line instead.
    launches.forEach(({ label, appears }) => {
      const shown =
        still || small ? 0 : smooth((seconds - appears) / 0.35) * spokeFade;
      label.setAttribute("opacity", shown.toFixed(3));
    });

    const pulse = (dot, size) => {
      // Keep the geographic core fixed; only the aura breathes gently around it.
      const breath = still
        ? 0.5
        : 0.5 + Math.sin(time * 0.00065 + dot.index * 1.2) * 0.5;
      dot.aura.setAttribute("r", ((8 + breath * 3) * size).toFixed(2));
      dot.aura.setAttribute("opacity", (0.11 + breath * 0.08).toFixed(3));
      dot.ring.setAttribute("r", ((4.2 + breath * 1.1) * size).toFixed(2));
    };
    const arrived = (id) =>
      still ? 1 : smooth((seconds - arrivals.get(id)) / 0.25);
    const scale = small ? 0.8 : 0.95;

    cities.forEach((city) => {
      const activation = still
        ? 1
        : smooth((value - thresholds[city.index]) / 0.065);
      const { x, y } = position(city);
      city.group.setAttribute(
        "transform",
        `translate(${(x - city.source.x).toFixed(2)},${(y - city.source.y).toFixed(2)})`,
      );
      // London is on screen from the start; other dots appear as their spoke reaches them.
      const landed =
        city.source === hub ? smooth(seconds / 0.4) : arrived(city.source.id);
      if (city.label) {
        city.label.setAttribute("opacity", activation.toFixed(3));
        city.hubLabel.setAttribute(
          "opacity",
          (still ? 0 : landed * (1 - smooth(morph / 0.35))).toFixed(3),
        );
      }
      // Once a dot has landed it stays; the city's own arrival only adds the label and routes.
      city.group.setAttribute(
        "opacity",
        Math.min(0.95, Math.max(activation, landed) * scale).toFixed(3),
      );
      pulse(city, city.minor ? mix(1, 0.6, morph) : 1);
    });
    leftovers.forEach((dot) => {
      const fade = still ? 0 : arrived(dot.id) * (1 - smooth(morph / 0.6));
      dot.group.style.display = fade > 0.001 ? "" : "none";
      dot.group.setAttribute(
        "opacity",
        Math.min(0.95, fade * scale).toFixed(3),
      );
      pulse(dot, 0.6);
    });

    routes.forEach((route) => {
      if (small && route.secondary) {
        route.group.style.display = "none";
        return;
      }
      route.group.style.display = "";
      const amount = still
        ? 1
        : smooth((value - thresholds[route.activation] - 0.01) / 0.065);
      if (amount === 0) {
        route.group.style.display = "none";
        route.packet.setAttribute("opacity", 0);
        return;
      }
      const { from, to } = route;
      const dx = to.x - from.x,
        dy = to.y - from.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const direction = route.index % 2 ? -1 : 1;
      const sway = still
        ? 0
        : Math.sin(time * 0.00018 + route.index * 1.7) * (small ? 1.3 : 2.8);
      const bow = Math.min(42, distance * 0.13) * direction + sway;
      const controlX = (from.x + to.x) / 2 - (dy / distance) * bow;
      const controlY = (from.y + to.y) / 2 + (dx / distance) * bow;
      // Draw the curve from its start up to `amount`, so it always starts and ends exactly on a city.
      const keep = 1 - amount;
      const endX =
        keep * keep * from.x +
        2 * keep * amount * controlX +
        amount * amount * to.x;
      const endY =
        keep * keep * from.y +
        2 * keep * amount * controlY +
        amount * amount * to.y;
      const partialX = from.x + (controlX - from.x) * amount;
      const partialY = from.y + (controlY - from.y) * amount;
      const d = `M${from.x},${from.y} Q${partialX.toFixed(2)},${partialY.toFixed(2)} ${endX.toFixed(2)},${endY.toFixed(2)}`;
      [route.line, route.glow].forEach((path) => path.setAttribute("d", d));
      route.line.setAttribute(
        "opacity",
        (
          amount *
          ((small ? 0.42 : 0.55) +
            (interactive
              ? Math.max(
                  0,
                  1 - Math.hypot(controlX - mouseX, controlY - mouseY) / 180,
                ) * 0.25
              : 0))
        ).toFixed(3),
      );
      route.glow.setAttribute("opacity", (amount * 0.08).toFixed(3));

      // Fewer routes on mobile; no travelling packets or decorative motion under reduced motion.
      if (!still && !small && amount > 0.98 && route.index % 2 === 0) {
        const t = (time / (14000 + route.index * 900) + route.index * 0.17) % 1;
        const inverse = 1 - t;
        route.packet.setAttribute(
          "cx",
          (
            inverse * inverse * from.x +
            2 * inverse * t * controlX +
            t * t * to.x
          ).toFixed(2),
        );
        route.packet.setAttribute(
          "cy",
          (
            inverse * inverse * from.y +
            2 * inverse * t * controlY +
            t * t * to.y
          ).toFixed(2),
        );
        route.packet.setAttribute(
          "opacity",
          (0.55 * Math.sin(Math.PI * t)).toFixed(3),
        );
      } else route.packet.setAttribute("opacity", 0);
    });

    if (pointer.active && finePointer.matches && !still) {
      if (!easedPointer.initialized) {
        easedPointer = { x: pointer.x, y: pointer.y, initialized: true };
      }
      easedPointer.x += (pointer.x - easedPointer.x) * 0.15;
      easedPointer.y += (pointer.y - easedPointer.y) * 0.15;
      cursorMask.setAttribute(
        "cx",
        (((easedPointer.x - bounds.left) / bounds.width) * map.width).toFixed(
          2,
        ),
      );
      cursorMask.setAttribute(
        "cy",
        (((easedPointer.y - bounds.top) / bounds.height) * map.height).toFixed(
          2,
        ),
      );
      halo.style.transform = `translate3d(${easedPointer.x - 250}px,${easedPointer.y - 250}px,0)`;
      halo.style.opacity = "1";
    } else {
      cursorMask.setAttribute("cx", -1000);
      halo.style.opacity = "0";
    }
  }

  function animate(timestamp) {
    const interval = 1000 / (compact.matches ? 24 : 30);
    if (timestamp - lastPaint >= interval) {
      elapsed += lastTime ? Math.min(timestamp - lastTime, 100) : 0;
      lastTime = timestamp;
      lastPaint = timestamp - ((timestamp - lastPaint) % interval);
      progress += (targetProgress - progress) * 0.14;
      if (Math.abs(targetProgress - progress) < 0.0002)
        progress = targetProgress;
      draw(progress, elapsed);
    }
    frameId = requestAnimationFrame(animate);
  }

  function sync() {
    cancelAnimationFrame(frameId);
    frameId = 0;
    lastTime = 0;
    updateGeometry();
    if (motion.matches) {
      progress = 1;
      draw(1, 0);
    } else if (!document.hidden) {
      draw(progress, elapsed);
      frameId = requestAnimationFrame(animate);
    }
  }
  window.addEventListener(
    "scroll",
    () => {
      const available =
        document.documentElement.scrollHeight - window.innerHeight;
      targetProgress = available > 0 ? clamp(window.scrollY / available) : 0;
    },
    { passive: true },
  );
  window.addEventListener("resize", updateGeometry, { passive: true });
  window.addEventListener(
    "pointermove",
    (event) => {
      pointer = {
        x: event.clientX,
        y: event.clientY,
        active: finePointer.matches && event.pointerType !== "touch",
      };
    },
    { passive: true },
  );
  const clearPointer = () => {
    pointer.active = false;
    halo.style.opacity = "0";
  };
  document.documentElement.addEventListener("pointerleave", clearPointer);
  window.addEventListener("blur", clearPointer);
  document.addEventListener("visibilitychange", sync);
  motion.addEventListener("change", sync);
  compact.addEventListener("change", sync);
  finePointer.addEventListener("change", clearPointer);
  const observer = new ResizeObserver(updateGeometry);
  observer.observe(stage);
  observer.observe(document.body);
  // The timeline reads across the map, so the map steps back while it is in view.
  const journey = document.querySelector(".experience-section");
  if (journey && "IntersectionObserver" in window)
    new IntersectionObserver(
      ([entry]) => layer.classList.toggle("is-quiet", entry.isIntersecting),
      { rootMargin: "-30% 0px -30% 0px" },
    ).observe(journey);
  updateGeometry();
  progress = motion.matches ? 1 : targetProgress;
  sync();
}
