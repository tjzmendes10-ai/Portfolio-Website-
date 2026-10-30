// A soft dark patch behind every line of text, painted between the map and the page,
// so the map fades back behind copy and stays strong in the gaps between blocks.
const SCALE = 4; // the scrim is drawn at 1/4 size; scaling it up softens the edges
// Each tier is drawn slightly smaller and stacked, giving a smooth falloff.
const TIERS = [
  { grow: 34, alpha: 0.22 },
  { grow: 24, alpha: 0.22 },
  { grow: 15, alpha: 0.22 },
  { grow: 7, alpha: 0.22 },
];
const COLOUR = "#081b17";
const SKIP = ".site-header, #anz-background, .anz-scrim, .cursor-halo";
const NON_TEXT = "script, style, noscript, svg";

export function initAnzTextScrim() {
  const canvas = document.createElement("canvas");
  canvas.className = "anz-scrim";
  canvas.setAttribute("aria-hidden", "true");
  document.body.append(canvas);
  const layer = document.createElement("canvas");

  function lines() {
    const found = [];
    const range = document.createRange();
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!node.nodeValue.trim() || !parent)
            return NodeFilter.FILTER_REJECT;
          if (parent.closest(SKIP) || parent.closest(NON_TEXT))
            return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      },
    );
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (getComputedStyle(node.parentElement).visibility === "hidden")
        continue;
      range.selectNodeContents(node);
      for (const box of range.getClientRects()) {
        if (box.width < 2 || box.height < 2) continue;
        found.push([
          box.left + window.scrollX,
          box.top + window.scrollY,
          box.width,
          box.height,
        ]);
      }
    }
    return found;
  }

  function paint() {
    canvas.style.height = "0px"; // measure the page without the scrim in it
    const width = document.documentElement.clientWidth;
    const height = document.documentElement.scrollHeight;
    const columns = Math.ceil(width / SCALE);
    const rows = Math.ceil(height / SCALE);
    canvas.width = layer.width = columns;
    canvas.height = layer.height = rows;
    const boxes = lines();
    const context = canvas.getContext("2d");
    const stencil = layer.getContext("2d");
    stencil.fillStyle = COLOUR;
    TIERS.forEach(({ grow, alpha }) => {
      stencil.clearRect(0, 0, columns, rows);
      boxes.forEach(([x, y, w, h]) =>
        stencil.fillRect(
          (x - grow) / SCALE,
          (y - grow) / SCALE,
          (w + grow * 2) / SCALE,
          (h + grow * 2) / SCALE,
        ),
      );
      // Overlapping boxes within a tier merge, so dark patches never double up.
      context.globalAlpha = alpha;
      context.drawImage(layer, 0, 0);
    });
    canvas.style.height = `${height}px`;
  }

  let timer = 0;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(paint, 120);
  };
  new ResizeObserver(schedule).observe(document.body);
  window.addEventListener("resize", schedule, { passive: true });
  window.addEventListener("load", schedule);
  document.fonts?.ready.then(schedule);
  paint();
}
