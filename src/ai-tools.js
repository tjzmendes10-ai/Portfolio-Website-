import {
  siClaude,
  siGit,
  siGithubactions,
  siGooglegemini,
  siPerplexity,
  siV0,
} from "simple-icons";

const icons = {
  siClaude,
  siGit,
  siGithubactions,
  siGooglegemini,
  siPerplexity,
  siV0,
};
const svgNs = "http://www.w3.org/2000/svg";

// Official simple-icons paths, filled with currentColor so CSS sets the tint.
// Tools without a data-icon keep their text and become text tags.
export function initAiTools() {
  document.querySelectorAll(".ai-tool").forEach((item) => {
    const name = item.dataset.name;
    const icon = icons[item.dataset.icon];
    if (!icon) {
      item.classList.add("is-text");
      item.title = name;
      return;
    }
    const svg = document.createElementNS(svgNs, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", name);
    const title = document.createElementNS(svgNs, "title");
    title.textContent = name;
    const path = document.createElementNS(svgNs, "path");
    path.setAttribute("d", icon.path);
    path.setAttribute("fill", "currentColor");
    svg.append(title, path);
    item.replaceChildren(svg);
  });
}
