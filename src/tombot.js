// TomBot: the scripted "Ask about Tom" chat. There is no AI and no network call: every reply is written copy
// from the FAQ list, and a typed question is matched to the closest answer by keyword (data-keywords).
const EMAIL = "thomasjoemendes@gmail.com";
const COFFEE = `mailto:${EMAIL}?subject=Coffee%3F`;
const EASTER_EGG = "Onion on top, obviously. Bunnings rules apply.";
const FALLBACK = `Good question. That one’s best over a coffee. Drop Tom a line at ${EMAIL}.`;
const NUDGE = "Sounds like we should talk.";
const NUDGE_AFTER = 3; // answers seen before the nudge appears
const TYPING_MS = [900, 1200]; // how long "TomBot is thinking…" shows before an answer starts

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const normalise = (text) => text.toLowerCase().replace(/[’‘]/g, "'");
// Keywords match from the start of a word ("build" finds "builds"); very short ones must be whole words.
const keywordPattern = (keyword) =>
  new RegExp(
    `(^|[^a-z0-9])${escapeRegExp(keyword)}${keyword.length <= 3 ? "s?($|[^a-z0-9])" : ""}`,
  );

export function initTomBot() {
  const source = document.querySelector("[data-chat-source]");
  const widget = document.querySelector(".tom-chat");
  const log = widget.querySelector(".tom-chat-log");
  const choices = widget.querySelector(".tom-chat-questions");
  const form = widget.querySelector(".tom-chat-form");
  const input = widget.querySelector(".tom-chat-input");
  const announcer = widget.querySelector(".tom-chat-announcer");
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const copy = [...source.querySelectorAll("details")].map((detail) => ({
    question: detail.querySelector("summary > span:nth-child(2)").textContent.trim(),
    answer: detail.querySelector(".faq-answer p").textContent.replace(/\s+/g, " ").trim(),
    keywords: (detail.dataset.keywords || "")
      .split(",")
      .map((keyword) => normalise(keyword.trim()))
      .filter(Boolean)
      .map((keyword) => ({ keyword, pattern: keywordPattern(keyword) })),
  }));

  let pending = null; // the answer in progress: { answer, typing, paragraph }
  let timer = 0;
  let frame = 0;
  let lastTime = 0;
  let elapsed = 0;
  let follow = true;
  let seen = 0; // answers delivered in this conversation
  let nudged = false;
  let nudgeTimer = 0;
  let waveTimer = 0;

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
  // Final text for an answer. An email address becomes a link once the answer has finished.
  function render(paragraph, answer) {
    const at = answer.indexOf(EMAIL);
    if (at === -1) {
      paragraph.textContent = answer;
      return;
    }
    const link = document.createElement("a");
    link.href = `mailto:${EMAIL}`;
    link.textContent = EMAIL;
    paragraph.replaceChildren(answer.slice(0, at), link, answer.slice(at + EMAIL.length));
  }
  function typingBubble() {
    const node = document.createElement("div");
    node.className = "tom-message tom-answer tom-typing-bubble";
    node.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.textContent = "TomBot is thinking…";
    const dots = document.createElement("span");
    dots.className = "tom-typing";
    for (let index = 0; index < 3; index++) dots.append(document.createElement("i"));
    node.append(label, dots);
    log.append(node);
    scroll();
    return node;
  }
  // The robot pulses its antenna while TomBot is thinking, and waves when an answer arrives.
  function setTyping(on) {
    widget.classList.toggle("is-typing", on);
    if (on) log.setAttribute("aria-busy", "true");
    else log.removeAttribute("aria-busy");
  }
  function wave() {
    widget.classList.remove("is-waving");
    void widget.offsetWidth;
    widget.classList.add("is-waving");
    clearTimeout(waveTimer);
    waveTimer = window.setTimeout(() => widget.classList.remove("is-waving"), 1200);
  }

  function showNudge() {
    nudgeTimer = 0;
    const paragraph = bubble(NUDGE);
    const link = document.createElement("a");
    link.className = "tom-nudge";
    link.href = COFFEE;
    link.textContent = "Grab a coffee";
    paragraph.parentElement.append(link);
    scroll();
  }
  function flushNudge() {
    if (!nudgeTimer) return;
    clearTimeout(nudgeTimer);
    showNudge();
  }
  function answered() {
    seen += 1;
    if (seen < NUDGE_AFTER || nudged) return;
    nudged = true;
    if (motion.matches) showNudge();
    else nudgeTimer = window.setTimeout(showNudge, 700);
  }

  function finish(count = true) {
    clearTimeout(timer);
    cancelAnimationFrame(frame);
    timer = 0;
    frame = 0;
    lastTime = 0;
    if (!pending) return;
    const done = pending;
    pending = null;
    done.typing?.remove();
    const paragraph = done.paragraph ?? bubble("");
    render(paragraph, done.answer);
    announcer.textContent = done.answer;
    setTyping(false);
    scroll();
    if (count) answered();
  }
  function type(time) {
    if (!pending?.paragraph || document.hidden) return;
    elapsed += lastTime ? Math.min(time - lastTime, 100) : 0;
    lastTime = time;
    const length = Math.min(pending.answer.length, Math.floor(elapsed / 10));
    pending.paragraph.textContent = pending.answer.slice(0, length);
    scroll();
    if (length === pending.answer.length) finish();
    else frame = requestAnimationFrame(type);
  }
  function begin() {
    if (!pending) return;
    pending.typing.remove();
    pending.typing = null;
    pending.paragraph = bubble("");
    elapsed = 0;
    lastTime = 0;
    wave();
    if (!document.hidden) frame = requestAnimationFrame(type);
  }
  function converse(question, answer, button = null) {
    finish();
    flushNudge();
    follow = true;
    choices
      .querySelectorAll("button")
      .forEach((choice) => choice.setAttribute("aria-pressed", String(choice === button)));
    bubble(question, true);
    pending = { answer, typing: null, paragraph: null };
    setTyping(true);
    announcer.textContent = "TomBot is thinking.";
    if (motion.matches) {
      finish();
      return;
    }
    pending.typing = typingBubble();
    const [shortest, longest] = TYPING_MS;
    timer = window.setTimeout(begin, shortest + Math.random() * (longest - shortest));
  }

  // Simple keyword matching: the question with the most (and longest) keyword hits wins; ties go to the first.
  function answerFor(text) {
    const words = normalise(text);
    if (/(^|[^a-z])(snag|sausage)/.test(words)) return EASTER_EGG;
    let best = null;
    let bestScore = 0;
    copy.forEach((item) => {
      const score = item.keywords.reduce(
        (sum, { keyword, pattern }) =>
          pattern.test(words)
            ? sum + (keyword.includes(" ") ? 2 : 1) + keyword.length / 100
            : sum,
        0,
      );
      if (score > bestScore) {
        best = item;
        bestScore = score;
      }
    });
    return best ? best.answer : FALLBACK;
  }

  copy.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = item.question;
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => converse(item.question, item.answer, button));
    choices.append(button);
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    converse(text, answerFor(text));
  });
  widget.querySelector(".tom-chat-reset").addEventListener("click", () => {
    finish(false);
    clearTimeout(nudgeTimer);
    nudgeTimer = 0;
    seen = 0;
    nudged = false;
    log.replaceChildren();
    follow = true;
    bubble("Choose a question below.");
    announcer.textContent = "";
    input.value = "";
    choices
      .querySelectorAll("button")
      .forEach((button) => button.setAttribute("aria-pressed", "false"));
  });
  document.addEventListener("visibilitychange", () => {
    cancelAnimationFrame(frame);
    frame = 0;
    lastTime = 0;
    if (!document.hidden && pending?.paragraph) frame = requestAnimationFrame(type);
  });
  motion.addEventListener("change", () => {
    if (motion.matches) finish();
  });
  source.hidden = true;
  widget.hidden = false;
}
