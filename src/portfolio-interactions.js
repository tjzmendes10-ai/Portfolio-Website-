export function initCounters() {
  const values = [...document.querySelectorAll("[data-count]")];
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (!("IntersectionObserver" in window) || motion.matches) return;
  const states = values.map((node) => ({
    node,
    target: Number(node.dataset.count),
    elapsed: 0,
    last: 0,
    active: false,
    done: false,
  }));
  let frame = 0;
  states.forEach(({ node }) => {
    node.textContent = "0";
  });
  function draw(time) {
    frame = 0;
    states
      .filter((state) => state.active && !state.done)
      .forEach((state) => {
        state.elapsed += state.last ? Math.min(time - state.last, 80) : 0;
        state.last = time;
        const amount = Math.min(1, state.elapsed / 1100);
        state.node.textContent = String(
          Math.round(state.target * (1 - (1 - amount) ** 3)),
        );
        if (amount === 1) state.done = true;
      });
    if (states.some((state) => state.active && !state.done) && !document.hidden)
      frame = requestAnimationFrame(draw);
  }
  const observer = new IntersectionObserver(
    (entries) => {
      entries
        .filter((entry) => entry.isIntersecting)
        .forEach((entry) => {
          const state = states.find((item) => item.node === entry.target);
          state.active = true;
          observer.unobserve(entry.target);
        });
      if (!frame && !document.hidden) frame = requestAnimationFrame(draw);
    },
    { threshold: 0.65 },
  );
  values.forEach((node) => observer.observe(node));
  document.addEventListener("visibilitychange", () => {
    cancelAnimationFrame(frame);
    frame = 0;
    states.forEach((state) => {
      state.last = 0;
    });
    if (!document.hidden && states.some((state) => state.active && !state.done))
      frame = requestAnimationFrame(draw);
  });
  motion.addEventListener("change", () => {
    if (!motion.matches) return;
    cancelAnimationFrame(frame);
    frame = 0;
    observer.disconnect();
    states.forEach((state) => {
      state.node.textContent = String(state.target);
      state.done = true;
    });
  });
}
