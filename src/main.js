import "./style.css";
import { initAnzBackground } from "./anz-background.js";
import "./portfolio-update.css";
import { initCounters, initTomChat } from "./portfolio-interactions.js";
import { initAiTools } from "./ai-tools.js";
import { initAnzTextScrim } from "./anz-text-scrim.js";

document.querySelector("#year").textContent = new Date().getFullYear();
const sydneyClock = document.querySelector("#sydney-time");
const updateClock = () => {
  sydneyClock.textContent = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
};
updateClock();
setInterval(updateClock, 60_000);

const menu = document.querySelector(".nav-links");
const menuButton = document.querySelector(".menu-toggle");
function setMenu(open) {
  menu.classList.toggle("is-open", open);
  menuButton.setAttribute("aria-expanded", String(open));
  menuButton.setAttribute(
    "aria-label",
    open ? "Close navigation" : "Open navigation",
  );
}
menuButton.addEventListener("click", () =>
  setMenu(menuButton.getAttribute("aria-expanded") !== "true"),
);
menu.addEventListener("click", (event) => {
  if (event.target.closest("a")) setMenu(false);
});
document.addEventListener("keydown", (event) => {
  if (
    event.key === "Escape" &&
    menuButton.getAttribute("aria-expanded") === "true"
  ) {
    setMenu(false);
    menuButton.focus();
  }
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".site-header")) setMenu(false);
});
window.matchMedia("(min-width: 851px)").addEventListener("change", (event) => {
  if (event.matches) setMenu(false);
});

// Native details remains usable without JavaScript. Keep one answer open in older browsers too.
const questions = [...document.querySelectorAll(".faq-list details")];
questions.forEach((question) =>
  question.addEventListener("toggle", () => {
    if (question.open)
      questions.forEach((other) => {
        if (other !== question) other.open = false;
      });
  }),
);

initAnzBackground();
initAnzTextScrim();
initAiTools();
initCounters();
initTomChat();
