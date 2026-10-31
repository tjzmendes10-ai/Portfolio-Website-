import {
  siClaude,
  siGit,
  siGooglegemini,
  siPerplexity,
  siV0,
} from "simple-icons";
import openaiSvg from "./assets/logos/openai-blossom-black.svg?raw";
import lovableSvg from "./assets/logos/lovable-logomark-black.svg?raw";
import gammaSvg from "./assets/logos/gamma-single-colour.svg?raw";
import githubSvg from "./assets/logos/github-invertocat-black.svg?raw";
import paperSvg from "./assets/logos/paper-design-mark.svg?raw";
import awsLogo from "./assets/logos/aws-logo.png";
import vscodeLogo from "./assets/logos/vscode.svg";

const icons = {
  siClaude,
  siGit,
  siGooglegemini,
  siPerplexity,
  siV0,
};
// Press-kit SVGs, used as supplied: only the fill is swapped for currentColor.
const pressSvgs = {
  openai: openaiSvg,
  lovable: lovableSvg,
  gamma: gammaSvg,
  github: githubSvg,
  paper: paperSvg,
};
// Press-kit files with effects or transparency, used unmodified and tinted
// through a CSS mask. ratio is the file's width / height.
const pressImages = {
  aws: { src: awsLogo, ratio: "1254 / 750" },
  vscode: { src: vscodeLogo, ratio: "1" },
};
const svgNs = "http://www.w3.org/2000/svg";

function label(svg, name) {
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", name);
  const title = document.createElementNS(svgNs, "title");
  title.textContent = name;
  svg.append(title);
}

function simpleIcon(icon, name) {
  const svg = document.createElementNS(svgNs, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  label(svg, name);
  const path = document.createElementNS(svgNs, "path");
  path.setAttribute("d", icon.path);
  path.setAttribute("fill", "currentColor");
  svg.append(path);
  return svg;
}

function pressSvg(markup, name) {
  const source = new DOMParser().parseFromString(markup, "image/svg+xml");
  const svg = document.createElementNS(svgNs, "svg");
  label(svg, name);
  const group = document.createElementNS(svgNs, "g");
  source.querySelectorAll("path").forEach((original) => {
    const path = document.createElementNS(svgNs, "path");
    path.setAttribute("d", original.getAttribute("d"));
    ["fill-rule", "clip-rule"].forEach((attr) => {
      if (original.hasAttribute(attr))
        path.setAttribute(attr, original.getAttribute(attr));
    });
    path.setAttribute("fill", "currentColor");
    group.append(path);
  });
  svg.append(group);
  return { svg, group };
}

function pressImage({ src, ratio }, name) {
  const mark = document.createElement("span");
  mark.className = "ai-mask";
  mark.setAttribute("role", "img");
  mark.setAttribute("aria-label", name);
  mark.title = name;
  mark.style.setProperty("--ai-mask", `url("${src}")`);
  mark.style.aspectRatio = ratio;
  return mark;
}

// Tools without a logo keep their text and become text tags.
export function initAiTools() {
  document.querySelectorAll(".ai-tool").forEach((item) => {
    const { name, icon, press } = item.dataset;
    if (icon in icons) {
      item.replaceChildren(simpleIcon(icons[icon], name));
    } else if (press in pressSvgs) {
      const { svg, group } = pressSvg(pressSvgs[press], name);
      item.replaceChildren(svg);
      // Trim the artboard padding so the mark fills its 22px height.
      const { x, y, width, height } = group.getBBox();
      svg.setAttribute("viewBox", `${x} ${y} ${width} ${height}`);
    } else if (press in pressImages) {
      item.replaceChildren(pressImage(pressImages[press], name));
    } else {
      item.classList.add("is-text");
      item.title = name;
    }
  });
}
