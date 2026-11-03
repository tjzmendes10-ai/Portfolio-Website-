// The bow-tie diagram is static inline SVG, so it works with no JavaScript. This only adds a one-off
// one-by-one appearance of the discs, then a dot that travels to the "Close" disc and fans out into three.
const DRAW_MS = 1000; // the discs stagger in over about 1.5s; the dot starts as the last ones arrive
const IN_MS = 1300; // dot travels the narrowing side to the Close disc
const OUT_MS = 1000; // then three dots fan out through the growing side
const ease = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
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

function play(figure) {
  // Whichever drawing is on screen (horizontal or vertical) gets the travelling dots.
  const svg = [...figure.querySelectorAll(".pipeline-svg")].find(
    (node) => getComputedStyle(node).display !== "none",
  );
  const main = svg.querySelector('[data-track="main"]');
  const fans = [...svg.querySelectorAll('[data-track="fan"]')];
  const mainDot = svg.querySelector(".pl-dot-main");
  const fanDots = [...svg.querySelectorAll(".pl-dot-fan")];
  const rest = [mainDot, ...fanDots].map((dot) => ({
    dot,
    cx: dot.getAttribute("cx"),
    cy: dot.getAttribute("cy"),
  }));
  const mainLength = main.getTotalLength();
  const fanLengths = fans.map((track) => track.getTotalLength());
  const move = (dot, track, length, t) => {
    const point = track.getPointAtLength(length * ease(clamp(t)));
    dot.setAttribute("cx", point.x.toFixed(2));
    dot.setAttribute("cy", point.y.toFixed(2));
  };

  figure.classList.add("is-playing");
  const start = performance.now() + DRAW_MS;
  const frame = (now) => {
    const elapsed = now - start;
    if (elapsed < 0) return requestAnimationFrame(frame);
    if (elapsed < IN_MS) {
      mainDot.style.opacity = Math.min(1, elapsed / 200);
      move(mainDot, main, mainLength, elapsed / IN_MS);
    } else {
      mainDot.style.opacity = 0;
      const t = (elapsed - IN_MS) / OUT_MS;
      fanDots.forEach((dot, index) => {
        dot.style.opacity = 1;
        move(dot, fans[index], fanLengths[index], t);
      });
    }
    if (elapsed < IN_MS + OUT_MS) return requestAnimationFrame(frame);
    // Finish exactly on the resting positions the markup already has, then hand back to plain CSS.
    rest.forEach(({ dot, cx, cy }) => {
      dot.setAttribute("cx", cx);
      dot.setAttribute("cy", cy);
      dot.style.opacity = "";
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
