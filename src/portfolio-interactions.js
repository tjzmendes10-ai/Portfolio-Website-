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

export function initTomChat() {
  const source = document.querySelector("[data-chat-source]");
  const widget = document.querySelector(".tom-chat");
  const log = widget.querySelector(".tom-chat-log");
  const choices = widget.querySelector(".tom-chat-questions");
  const announcer = widget.querySelector(".tom-chat-announcer");
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const copy = [...source.querySelectorAll("details")].map((detail) => ({
    question: detail
      .querySelector("summary > span:nth-child(2)")
      .textContent.trim(),
    answer: detail
      .querySelector(".faq-answer p")
      .textContent.replace(/\s+/g, " ")
      .trim(),
  }));
  let pending = null;
  let timer = 0;
  let frame = 0;
  let lastTime = 0;
  let elapsed = 0;
  let follow = true;

  function scroll() {
    if (follow) log.scrollTop = log.scrollHeight;
  }
  log.addEventListener(
    "scroll",
    () => {
      follow = log.scrollHeight - log.clientHeight - log.scrollTop < 45;
    },
    { passive: true },
  );
  function bubble(text, customer = false) {
    const node = document.createElement("div");
    node.className = `tom-message ${customer ? "tom-question" : "tom-answer"}`;
    const paragraph = document.createElement("p");
    paragraph.textContent = text;
    node.append(paragraph);
    log.append(node);
    scroll();
    return paragraph;
  }
  function finish() {
    clearTimeout(timer);
    cancelAnimationFrame(frame);
    timer = 0;
    frame = 0;
    if (!pending) return;
    pending.indicator?.remove();
    pending.paragraph.textContent = pending.answer;
    pending.paragraph.removeAttribute("aria-hidden");
    announcer.textContent = pending.answer;
    pending = null;
    log.removeAttribute("aria-busy");
    scroll();
  }
  function type(time) {
    if (!pending || document.hidden) return;
    elapsed += lastTime ? Math.min(time - lastTime, 100) : 0;
    lastTime = time;
    const length = Math.min(pending.answer.length, Math.floor(elapsed / 10));
    pending.paragraph.textContent = pending.answer.slice(0, length);
    scroll();
    if (length === pending.answer.length) finish();
    else frame = requestAnimationFrame(type);
  }
  function ask(item, button) {
    finish();
    follow = true;
    choices
      .querySelectorAll("button")
      .forEach((choice) =>
        choice.setAttribute("aria-pressed", String(choice === button)),
      );
    bubble(item.question, true);
    const paragraph = bubble("");
    const indicator = document.createElement("span");
    indicator.className = "tom-typing";
    indicator.setAttribute("aria-hidden", "true");
    for (let index = 0; index < 3; index++)
      indicator.append(document.createElement("i"));
    paragraph.parentElement.append(indicator);
    pending = { ...item, paragraph, indicator, started: false };
    paragraph.setAttribute("aria-hidden", "true");
    log.setAttribute("aria-busy", "true");
    announcer.textContent = "Preparing answer.";
    scroll();
    if (motion.matches) {
      finish();
      return;
    }
    timer = window.setTimeout(() => {
      if (!pending) return;
      pending.indicator.remove();
      pending.started = true;
      elapsed = 0;
      lastTime = 0;
      if (!document.hidden) frame = requestAnimationFrame(type);
    }, 450);
  }
  copy.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = item.question;
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => ask(item, button));
    choices.append(button);
  });
  widget.querySelector(".tom-chat-reset").addEventListener("click", () => {
    finish();
    log.replaceChildren();
    follow = true;
    bubble("Choose a question below.");
    announcer.textContent = "";
    choices
      .querySelectorAll("button")
      .forEach((button) => button.setAttribute("aria-pressed", "false"));
  });
  document.addEventListener("visibilitychange", () => {
    cancelAnimationFrame(frame);
    frame = 0;
    lastTime = 0;
    if (!document.hidden && pending?.started)
      frame = requestAnimationFrame(type);
  });
  motion.addEventListener("change", () => {
    if (motion.matches) finish();
  });
  source.hidden = true;
  widget.hidden = false;
}
