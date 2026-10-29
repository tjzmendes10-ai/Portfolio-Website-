import outline from "./assets/anz-outline.svg?raw";
import map from "./data/anz-map.json";
import "./anz-background.css";

const ns = "http://www.w3.org/2000/svg";
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const smooth = (value) => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};
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
  const thresholds = [0.24, 0.34, 0.44, 0.54, 0.64, 0.74, 0.84, 0.92];

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

  const routesGroup = element("g", { class: "anz-routes" });
  const nodesGroup = element("g", { class: "anz-cities" });
  const ambientGroup = element("g", { class: "anz-ambient-network" });
  svg.append(ambientGroup, routesGroup, nodesGroup);

  // Each arriving city connects to one or two earlier cities. These are an aspirational motif, not past-work locations.
  const connections = [
    [1, 0],
    [2, 0],
    [2, 1],
    [3, 0],
    [3, 2],
    [4, 1],
    [4, 0],
    [5, 1],
    [5, 4],
    [6, 0],
    [6, 1],
    [7, 3],
    [7, 0],
  ];
  const routes = connections.map(([to, from], index) => {
    const secondary = index > 0 && connections[index - 1][0] === to;
    const group = element("g", {
      class: `anz-route-group${secondary ? " is-secondary" : ""}`,
    });
    const attributes = {
      fill: "none",
      pathLength: 1,
      "stroke-dasharray": 1,
      "stroke-dashoffset": 1,
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

  const cities = map.cities.map((city, index) => {
    const group = element("g", { opacity: 0, "data-city": city.id });
    const aura = element("circle", {
      cx: city.x,
      cy: city.y,
      r: 9,
      class: "anz-city-aura",
    });
    const ring = element("circle", {
      cx: city.x,
      cy: city.y,
      r: 5,
      class: "anz-city-ring",
    });
    const core = element("circle", {
      cx: city.x,
      cy: city.y,
      r: city.id === "sydney" ? 2.4 : 1.9,
      class: "anz-city-core",
    });
    group.append(aura, ring, core);
    let label;
    if (city.id === "sydney") {
      label = element("text", {
        x: city.x + 11,
        y: city.y - 9,
        class: "anz-sydney-label",
      });
      label.textContent = "Sydney";
      group.append(label);
    }
    nodesGroup.append(group);
    return { ...city, group, aura, ring, label, index };
  });

  const ambientPoints = Array.from({ length: 30 }, (_, index) => {
    const angle = index * 2.399963;
    const radius = 0.32 + Math.sqrt((index + 1) / 30) * 0.68;
    const point = {
      x: 700 + Math.cos(angle) * 220 * radius,
      y: 300 + Math.sin(angle) * 205 * radius,
      target: map.cities[index % map.cities.length],
      phase: index * 1.71,
      node: element("circle", {
        r: index % 7 === 0 ? 2.3 : 1.3,
        class: "anz-ambient-node",
      }),
    };
    ambientGroup.append(point.node);
    return point;
  });
  const ambientEdges = ambientPoints.flatMap((point, from) =>
    ambientPoints
      .map((other, to) => ({
        to,
        distance: Math.hypot(point.x - other.x, point.y - other.y),
      }))
      .filter((other) => other.to > from)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 2)
      .map(({ to }) => {
        const line = element("path", {
          class: "anz-ambient-line",
          fill: "none",
          "vector-effect": "non-scaling-stroke",
        });
        ambientGroup.prepend(line);
        return { from, to, line };
      }),
  );

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
    const ambientOpacity = still ? 0 : 1 - smooth((value - 0.08) / 0.23);
    const mouseX = ((pointer.x - bounds.left) / bounds.width) * map.width;
    const mouseY = ((pointer.y - bounds.top) / bounds.height) * map.height;
    const interactive =
      pointer.active && finePointer.matches && !still && !small;
    svg.style.setProperty(
      "--outline-opacity",
      ((0.11 + value * 0.045) * morph).toFixed(3),
    );
    cursorOutline.style.opacity = morph;
    svg.classList.toggle("is-compact", small);
    footer.classList.toggle("is-network-complete", value >= 0.99);

    ambientGroup.setAttribute("opacity", ambientOpacity.toFixed(3));
    const showAmbient = ambientOpacity > 0.001;
    ambientGroup.style.display = showAmbient ? "" : "none";
    const positions = showAmbient
      ? ambientPoints.map((point, index) => {
          const driftX = still ? 0 : Math.sin(time * 0.00023 + point.phase) * 7;
          const driftY = still ? 0 : Math.cos(time * 0.00019 + point.phase) * 6;
          const x = (point.x + driftX) * (1 - morph) + point.target.x * morph;
          const y = (point.y + driftY) * (1 - morph) + point.target.y * morph;
          point.node.setAttribute("cx", x.toFixed(2));
          point.node.setAttribute("cy", y.toFixed(2));
          point.node.setAttribute(
            "opacity",
            index < 8 || (small && index >= 18) ? 0 : 0.45,
          );
          return { x, y };
        })
      : map.cities;
    if (showAmbient)
      ambientEdges.forEach(({ from, to, line }) => {
        if (small && (from >= 18 || to >= 18)) {
          line.style.display = "none";
          return;
        }
        line.style.display = "";
        const start = positions[from],
          end = positions[to];
        const nearby = interactive
          ? Math.max(
              0,
              1 -
                Math.hypot(
                  (start.x + end.x) / 2 - mouseX,
                  (start.y + end.y) / 2 - mouseY,
                ) /
                  170,
            )
          : 0;
        line.setAttribute(
          "d",
          `M${start.x.toFixed(2)},${start.y.toFixed(2)} L${end.x.toFixed(2)},${end.y.toFixed(2)}`,
        );
        line.setAttribute("opacity", (0.14 + nearby * 0.22).toFixed(3));
      });

    cities.forEach((city) => {
      const activation = still
        ? 1
        : smooth((value - thresholds[city.index]) / 0.065);
      city.group.setAttribute(
        "transform",
        `translate(${(positions[city.index].x - city.x).toFixed(2)},${(positions[city.index].y - city.y).toFixed(2)})`,
      );
      if (city.label) city.label.setAttribute("opacity", activation.toFixed(3));
      city.group.setAttribute(
        "opacity",
        Math.min(
          0.67,
          activation * (small ? 0.56 : 0.67) +
            ambientOpacity * (1 - morph) * 0.38,
        ).toFixed(3),
      );
      // Keep the geographic core fixed; only the aura breathes gently around it.
      const breath = still
        ? 0.5
        : 0.5 + Math.sin(time * 0.00065 + city.index * 1.2) * 0.5;
      city.aura.setAttribute("r", (8 + breath * 3).toFixed(2));
      city.aura.setAttribute("opacity", (0.055 + breath * 0.045).toFixed(3));
      city.ring.setAttribute("r", (4.2 + breath * 1.1).toFixed(2));
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
      const d = `M${from.x},${from.y} Q${controlX.toFixed(2)},${controlY.toFixed(2)} ${to.x},${to.y}`;
      [route.line, route.glow].forEach((path) => {
        path.setAttribute("d", d);
        path.setAttribute("stroke-dashoffset", (1 - amount).toFixed(4));
      });
      route.line.setAttribute(
        "opacity",
        (
          amount *
          ((small ? 0.16 : 0.22) +
            (interactive
              ? Math.max(
                  0,
                  1 - Math.hypot(controlX - mouseX, controlY - mouseY) / 180,
                ) * 0.17
              : 0))
        ).toFixed(3),
      );
      route.glow.setAttribute("opacity", (amount * 0.025).toFixed(3));

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
          (0.32 * Math.sin(Math.PI * t)).toFixed(3),
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
  updateGeometry();
  progress = motion.matches ? 1 : targetProgress;
  sync();
}
