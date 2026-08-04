import { parseTopology } from "./topologyParser.js";
import { DEFAULT_CATEGORY, TYPE_CATEGORIES } from "./typeInference.js";
import { BlockDiagramRenderer } from "./blockDiagramRenderer.js";

const elements = {
  canvas: document.querySelector("#diagram-canvas"),
  stateLayer: document.querySelector("#state-layer"),
  stateEyebrow: document.querySelector("#state-eyebrow"),
  stateTitle: document.querySelector("#state-title"),
  stateMessage: document.querySelector("#state-message"),
  openButton: document.querySelector("#open-log-button"),
  openButtonLabel: document.querySelector(".open-button-label"),
  emptyOpenButton: document.querySelector("#empty-open-button"),
  searchInput: document.querySelector("#search-input"),
  searchStatus: document.querySelector("#search-status"),
  expandAllButton: document.querySelector("#expand-all-button"),
  fitViewButton: document.querySelector("#fit-view-button"),
  canvasMeta: document.querySelector("#canvas-meta"),
  canvasHint: document.querySelector("#canvas-hint"),
  componentCount: document.querySelector("#component-count"),
  fileName: document.querySelector("#file-name"),
  detailsPlaceholder: document.querySelector("#details-placeholder"),
  detailsContent: document.querySelector("#details-content"),
  detailSwatch: document.querySelector("#detail-swatch"),
  detailCategory: document.querySelector("#detail-category"),
  detailName: document.querySelector("#detail-name"),
  detailPath: document.querySelector("#detail-path"),
  detailType: document.querySelector("#detail-type"),
  detailSize: document.querySelector("#detail-size"),
  legendGrid: document.querySelector("#legend-grid")
};

let topologyLoaded = false;

const diagram = new BlockDiagramRenderer(elements.canvas, {
  onSelect: showDetails
});

function countNodes(node) {
  return 1 + (node.children ?? []).reduce((total, child) => total + countNodes(child), 0);
}

function renderLegend() {
  const categories = [...TYPE_CATEGORIES, DEFAULT_CATEGORY];
  for (const rule of categories) {
    const item = document.createElement("div");
    item.className = "legend-item";

    const swatch = document.createElement("span");
    swatch.style.setProperty("--swatch", rule.color);
    swatch.setAttribute("aria-hidden", "true");

    const label = document.createElement("span");
    label.textContent = rule.category;

    item.append(swatch, label);
    elements.legendGrid.append(item);
  }
}

function showDetails(node) {
  if (!node) {
    elements.detailsPlaceholder.hidden = false;
    elements.detailsContent.hidden = true;
    return;
  }

  elements.detailsPlaceholder.hidden = true;
  elements.detailsContent.hidden = false;
  elements.detailSwatch.style.backgroundColor = node.color;
  elements.detailCategory.textContent = node.category;
  elements.detailName.textContent = node.name;
  elements.detailPath.textContent = node.path;
  elements.detailType.textContent = node.type;
  elements.detailSize.textContent = node.size;
}

function setControlsEnabled(enabled) {
  elements.searchInput.disabled = !enabled;
  elements.expandAllButton.disabled = !enabled;
  elements.fitViewButton.disabled = !enabled;
}

function showEmptyState() {
  topologyLoaded = false;
  diagram.clear();
  setControlsEnabled(false);
  elements.stateLayer.hidden = false;
  elements.stateLayer.classList.remove("is-error");
  elements.canvasMeta.classList.remove("is-error");
  elements.stateEyebrow.textContent = "Ready to inspect";
  elements.stateTitle.textContent = "See your UVM testbench as a block diagram.";
  elements.stateMessage.innerHTML =
    "Open a simulator log containing <code>uvm_top.print_topology()</code> output to map every testbench component as familiar nested UVM architecture blocks.";
  elements.emptyOpenButton.textContent = "Open a UVM log…";
  elements.canvasMeta.hidden = true;
  elements.canvasHint.hidden = true;
  elements.searchInput.value = "";
  elements.searchStatus.textContent = "";
  showDetails(null);
}

function showErrorState(message, fileName) {
  topologyLoaded = false;
  diagram.clear();
  setControlsEnabled(false);
  elements.stateLayer.hidden = false;
  elements.stateLayer.classList.add("is-error");
  elements.canvasMeta.classList.add("is-error");
  elements.stateEyebrow.textContent = "Could not build hierarchy";
  elements.stateTitle.textContent = "No topology to visualize.";
  elements.stateMessage.textContent = message;
  elements.emptyOpenButton.textContent = "Choose another log…";
  elements.canvasMeta.hidden = false;
  elements.canvasHint.hidden = true;
  elements.componentCount.textContent = "Parse error";
  elements.fileName.textContent = fileName;
  elements.searchInput.value = "";
  elements.searchStatus.textContent = "";
  showDetails(null);
}

function showTopology(root, fileName) {
  topologyLoaded = true;
  setControlsEnabled(true);
  elements.stateLayer.hidden = true;
  elements.stateLayer.classList.remove("is-error");
  elements.canvasMeta.classList.remove("is-error");
  elements.canvasMeta.hidden = false;
  elements.canvasHint.hidden = false;
  elements.searchInput.value = "";
  elements.searchStatus.textContent = "";
  elements.componentCount.textContent = `${countNodes(root)} components`;
  elements.fileName.textContent = fileName;
  showDetails(null);
  diagram.load(root);
}

function setBusy(isBusy) {
  elements.openButton.disabled = isBusy;
  elements.emptyOpenButton.disabled = isBusy;
  elements.openButtonLabel.textContent = isBusy ? "Reading…" : "Open log";
  elements.emptyOpenButton.textContent = isBusy
    ? "Reading log…"
    : elements.stateLayer.classList.contains("is-error")
      ? "Choose another log…"
      : "Open a UVM log…";
}

async function openLog() {
  if (!window.uvmAPI) {
    showErrorState("The desktop file bridge is unavailable. Restart the application and try again.", "Application error");
    return;
  }

  setBusy(true);
  try {
    const result = await window.uvmAPI.openLog();
    if (result.canceled) return;

    if (result.error) {
      showErrorState(result.error, "Unreadable file");
      return;
    }

    const parsed = parseTopology(result.content);
    if (parsed.error) {
      showErrorState(parsed.error, result.fileName);
      return;
    }

    showTopology(parsed.root, result.fileName);
  } catch (error) {
    showErrorState(`The log could not be opened: ${error.message}`, "Open failed");
  } finally {
    setBusy(false);
  }
}

function handleSearch() {
  const query = elements.searchInput.value;
  const matches = diagram.search(query);

  if (!query.trim()) {
    elements.searchStatus.textContent = "";
  } else if (matches.length === 0) {
    elements.searchStatus.textContent = "No matches";
    elements.searchStatus.classList.add("is-empty");
  } else {
    elements.searchStatus.textContent = `${matches.length} ${matches.length === 1 ? "match" : "matches"}`;
    elements.searchStatus.classList.remove("is-empty");
  }
}

elements.openButton.addEventListener("click", openLog);
elements.emptyOpenButton.addEventListener("click", openLog);
elements.searchInput.addEventListener("input", handleSearch);
elements.fitViewButton.addEventListener("click", () => diagram.fitToView());
elements.expandAllButton.addEventListener("click", () => diagram.expandAll());

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f" && topologyLoaded) {
    event.preventDefault();
    elements.searchInput.focus();
    elements.searchInput.select();
  }

  if (event.key === "Escape" && document.activeElement === elements.searchInput) {
    elements.searchInput.value = "";
    handleSearch();
    elements.searchInput.blur();
  }
});

window.uvmAPI?.onOpenRequest(openLog);

const resizeObserver = new ResizeObserver(() => {
  if (topologyLoaded) diagram.fitToView(false);
});
resizeObserver.observe(elements.canvas);

renderLegend();
showEmptyState();
