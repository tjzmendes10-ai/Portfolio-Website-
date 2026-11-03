// The diagram is static inline SVG, so it works with no JavaScript. This only adds a one-off animation:
// the discs appear one by one, then dots flow through. Three enter, one drops out at Qualify, the other
// two pass through Close, split at Expand into four, and run out past Reference and fade.
// The generator (scripts/generate-pipeline-diagram.mjs) writes each dot's route into the SVG's data-flow.
const DRAW_MS = 1000; // the discs stagger in over about 1.5s; the dots start as the last ones arrive
const FLOW_MS = 5200; // the dots' whole journey, left to right
const ease = (t) => 0.5 - 0.5 * Math.cos(Math.PI * t); // gentle in and out, so each stage reads
const clamp = (value) => Math.max(0, Math.min(1, value));

export function initPipelineDiagram() {
  const figure = document.querySelector(".pipeline");
  if (!figure) return;
  blurMapBehind(figure);
  const still = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (still.matches || !("IntersectionObserver" in window)) return;

  figure.classList.add("is-armed");
  const observer = new IntersectionObserver(
    ([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      play(figure);
    },
    { threshold: 0.35 },
  );
  observer.observe(figure);
}

// Value at `position` along a list of [position, value] stops (flat outside the first and last).
function between(stops, position) {
  if (position <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [to, toValue] = stops[i];
    if (position <= to) {
      const [from, fromValue] = stops[i - 1];
      return fromValue + ((toValue - fromValue) * (position - from)) / (to - from);
    }
  }
  return stops.at(-1)[1];
}

function play(figure) {
  // Whichever drawing is on screen (horizontal or vertical) gets the travelling dots.
  const svg = [...figure.querySelectorAll(".pipeline-svg")].find(
    (node) => getComputedStyle(node).display !== "none",
  );
  const { axis, start, end, dots: routes } = JSON.parse(svg.dataset.flow);
  const [along, across] = axis === "x" ? ["cx", "cy"] : ["cy", "cx"];
  const dots = routes.map((route, index) => ({
    ...route,
    node: svg.querySelector(`.pl-dot[data-dot="${index}"]`),
  }));
  const rest = dots.map(({ node }) => ({
    node,
    cx: node.getAttribute("cx"),
    cy: node.getAttribute("cy"),
  }));

  figure.classList.add("is-playing");
  const begin = performance.now() + DRAW_MS;
  const frame = (now) => {
    const elapsed = now - begin;
    if (elapsed < 0) return requestAnimationFrame(frame);
    const progress = clamp(elapsed / FLOW_MS);
    const position = start + (end - start) * ease(progress);
    dots.forEach(({ node, keys, show: [from, full, fade, gone] }) => {
      node.setAttribute(along, position.toFixed(2));
      node.setAttribute(across, between(keys, position).toFixed(2));
      const visible = clamp((position - from) / (full - from)) * clamp((gone - position) / (gone - fade));
      node.style.opacity = visible.toFixed(3);
    });
    if (progress < 1) return requestAnimationFrame(frame);
    // Put every dot back where the markup has it (hidden), then hand back to plain CSS.
    rest.forEach(({ node, cx, cy }) => {
      node.setAttribute("cx", cx);
      node.setAttribute("cy", cy);
      node.style.opacity = "";
    });
    figure.classList.remove("is-armed", "is-playing");
    figure.classList.add("is-done");
  };
  requestAnimationFrame(frame);
}

// The map steps back and softens while the diagram is in view, so the discs and labels read cleanly.
function blurMapBehind(figure) {
  const layer = document.querySelector("#anz-background");
  if (!layer || !("IntersectionObserver" in window)) return;
  new IntersectionObserver(
    ([entry]) => layer.classList.toggle("is-blurred", entry.isIntersecting),
    { rootMargin: "-15% 0px -15% 0px" },
  ).observe(figure.closest(".pipeline-wrap") || figure);
}
