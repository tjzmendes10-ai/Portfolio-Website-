// The diagram is static inline SVG, so it works with no JavaScript. This only adds the animation: the discs appear
// one by one, then dots flow through on a loop. Five start at the input arrows and converge on disc 01; one drops out
// (fading and drifting away) between 01 and 02 and another between 03 and 04; the other three pass Commit, grow a
// little between 06 and 07, and fade out at 07. After a short pause it starts again.
// The generator (scripts/generate-pipeline-diagram.mjs) writes each dot's route into the SVG's data-flow.
const DRAW_MS = 1000; // the discs stagger in over about 1.5s; the dots start as the last ones arrive
const PAUSE_MS = 1400; // rest between one pass and the next
const INTRO_MS = 450; // the dots fade in at the inputs at the start of each pass
const clamp = (value) => Math.max(0, Math.min(1, value));
// The same gentle ease in and out as before (distance against time).
const ease = (time) => (1 - Math.cos(Math.PI * clamp(time))) / 2;

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
      play(figure, still);
    },
    { threshold: 0.35 },
  );
  observer.observe(figure);
}

// Value at `position` along a list of [position, ...values] stops (flat before the first and after the last).
function between(stops, position) {
  if (position <= stops[0][0]) return stops[0].slice(1);
  for (let i = 1; i < stops.length; i++) {
    const [to, ...toValues] = stops[i];
    if (position <= to) {
      const [from, ...fromValues] = stops[i - 1];
      const share = (position - from) / (to - from);
      return fromValues.map((value, k) => value + (toValues[k] - value) * share);
    }
  }
  return stops.at(-1).slice(1);
}

function play(figure, still) {
  // Whichever drawing is on screen (horizontal or vertical) gets the travelling dots.
  const svg = [...figure.querySelectorAll(".pipeline-svg")].find(
    (node) => getComputedStyle(node).display !== "none",
  );
  const { axis, start, end, ms, dots: routes } = JSON.parse(svg.dataset.flow);
  const [along, across] = axis === "x" ? ["cx", "cy"] : ["cy", "cx"];
  const dots = routes.map((route, index) => ({
    ...route,
    node: svg.querySelector(`.pl-dot[data-dot="${index}"]`),
  }));
  const cycle = ms + PAUSE_MS;

  figure.classList.add("is-playing");
  let clock = -DRAW_MS; // time spent visible; it stands still while the diagram is off screen
  let last = 0;
  let frameId = 0;
  let visible = true;

  const draw = () => {
    const local = clock < 0 ? 0 : clock % cycle;
    const progress = clock < 0 ? 0 : clamp(local / ms);
    const position = start + (end - start) * ease(progress);
    const intro = clock < 0 ? 0 : clamp(local / INTRO_MS);
    dots.forEach(({ node, stops, lag }) => {
      // Each dot sets off a little after the last, so they travel as a loose group.
      const at = start + Math.max(0, position - start - lag);
      const [crossing, radius, opacity] = between(stops, at);
      node.setAttribute(along, at.toFixed(2));
      node.setAttribute(across, crossing.toFixed(2));
      node.setAttribute("r", radius.toFixed(2));
      node.style.opacity = (opacity * intro).toFixed(3);
    });
  };
  const frame = (now) => {
    frameId = 0;
    if (!visible || still.matches) return;
    clock += last ? Math.min(now - last, 100) : 0;
    last = now;
    draw();
    frameId = requestAnimationFrame(frame);
  };
  const run = () => {
    if (frameId || !visible || still.matches) return;
    last = 0;
    frameId = requestAnimationFrame(frame);
  };
  const halt = () => {
    cancelAnimationFrame(frameId);
    frameId = 0;
  };

  // Pause while the diagram is off screen (or the tab is hidden), carry on where it left off.
  new IntersectionObserver(
    ([entry]) => {
      visible = entry.isIntersecting;
      if (visible) run();
      else halt();
    },
    { threshold: 0 },
  ).observe(figure);
  still.addEventListener("change", () => {
    if (still.matches) {
      halt();
      dots.forEach(({ node }) => (node.style.opacity = ""));
    } else run();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) halt();
    else run();
  });
  run();
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
