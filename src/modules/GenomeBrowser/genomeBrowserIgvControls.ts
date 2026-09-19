const VISIBLE_NAV_BUTTONS = new Set([
  "Select Tracks",
  "Crosshairs",
  "Center Line",
  "Track Labels"
]);

function setStyle(element: HTMLElement | null | undefined, property: string, value: string) {
  if (!element) return;
  if (element.style.getPropertyValue(property) !== value || element.style.getPropertyPriority(property) !== "important") {
    element.style.setProperty(property, value, "important");
  }
}

function setAttr(element: Element | null, name: string, value: string) {
  if (element?.getAttribute(name) !== value) element?.setAttribute(name, value);
}

export function syncIgvToggleButtons(root: ShadowRoot, browser: any) {
  const active: Record<string, boolean> = {
    "Select Tracks": Boolean(browser?.navbar?.getEnableTrackSelection?.()),
    Crosshairs: Boolean(browser?.doShowCursorGuide),
    "Center Line": Boolean(browser?.doShowCenterLine),
    "Track Labels": Boolean(browser?.doShowTrackLabels)
  };
  root.querySelectorAll<HTMLElement>(".igv-navbar-text-button, .igv-navbar-icon-button").forEach((button) => {
    const title = button.title.trim();
    setStyle(button, "display", !title || VISIBLE_NAV_BUTTONS.has(title) ? "inline-flex" : "none");
    if (title in active) button.dataset.rnametaToggleActive = active[title] ? "true" : "false";
  });
}

export function syncIgvToolbarDensity(container: HTMLElement, browser: any) {
  const root = container.shadowRoot;
  const navbar = root?.querySelector(".igv-navbar");
  if (!root || !navbar) return;

  const targetClass = "igv-navbar-text-button";
  container.classList.add("rnameta-igv-toolbar-wide");
  container.classList.remove("rnameta-igv-toolbar-compact");
  if (
    browser?.navbar &&
    browser.navbar.currentClass !== targetClass &&
    typeof browser.fireEvent === "function"
  ) {
    browser.navbar.currentClass = targetClass;
    browser.fireEvent("navbar-resize", [targetClass]);
  }
}

export function arrangeIgvNavbar(container: HTMLElement, browser: any, onSaveImage?: () => void) {
  const root = container.shadowRoot;
  if (!root) return;
  const navbar = root.querySelector<HTMLElement>(".igv-navbar");
  const left = root.querySelector<HTMLElement>(".igv-navbar-left-container");
  const right = root.querySelector<HTMLElement>(".igv-navbar-right-container");
  const buttons = root.querySelector<HTMLElement>(".igv-navbar-toggle-button-container");
  const genome = root.querySelector<HTMLElement>(".igv-current-genome");
  const location = root.querySelector<HTMLElement>(".igv-navbar-genomic-location");
  const locusGroup = root.querySelector<HTMLElement>(".igv-locus-size-group");
  const searchContainer = root.querySelector<HTMLElement>(".igv-search-container");
  const searchInput = root.querySelector<HTMLInputElement>(".igv-search-input");
  const searchIcon = root.querySelector<HTMLElement>(".igv-search-icon-container");
  if (!navbar || !left || !right || !buttons || !location || !locusGroup || !searchContainer || !searchInput) return;

  setStyle(navbar, "height", "56px");
  setStyle(navbar, "min-height", "56px");
  setStyle(navbar, "padding", "10px");
  setStyle(navbar, "box-sizing", "border-box");
  setStyle(navbar, "overflow-x", "hidden");
  setStyle(navbar, "overflow-y", "hidden");
  setStyle(navbar, "flex-wrap", "nowrap");

  setStyle(left, "flex", "0 1 auto");
  setStyle(left, "flex-wrap", "nowrap");
  setStyle(left, "width", "auto");
  setStyle(left, "gap", "7px");
  setStyle(left, "overflow", "visible");
  setStyle(genome, "display", "none");

  setStyle(right, "flex", "0 0 auto");
  setStyle(right, "min-width", "0");
  setStyle(right, "max-width", "none");
  setStyle(right, "flex-wrap", "nowrap");
  setStyle(right, "row-gap", "0");
  setStyle(buttons, "display", "flex");
  setStyle(buttons, "flex-wrap", "nowrap");
  setStyle(buttons, "width", "auto");
  setStyle(buttons, "flex", "0 0 auto");
  setStyle(buttons, "min-width", "0");
  setStyle(buttons, "max-width", "none");

  setStyle(location, "width", "auto");
  setStyle(location, "flex", "0 1 auto");
  setStyle(location, "flex-wrap", "nowrap");
  setStyle(location, "gap", "7px");
  setStyle(location, "min-height", "34px");
  setStyle(locusGroup, "height", "34px");
  setStyle(locusGroup, "min-height", "34px");
  setStyle(locusGroup, "gap", "6px");
  setStyle(locusGroup, "flex-wrap", "nowrap");

  const text = searchInput.value || searchInput.placeholder || "Locus Search";
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (context) context.font = getComputedStyle(searchInput).font;
  const measured = Math.ceil((context?.measureText(text).width || 180) + 76);
  // The web app uses a compact 10px root font; use pixel bounds here so the
  // desktop toolbar keeps the same physical proportions under its 16px root.
  const width = `clamp(180px, ${measured}px, 220px)`;
  setStyle(searchContainer, "height", "34px");
  setStyle(searchContainer, "min-height", "34px");
  setStyle(searchContainer, "flex", `0 1 ${width}`);
  setStyle(searchContainer, "width", width);
  setStyle(searchContainer, "min-width", "120px");
  setStyle(searchContainer, "max-width", width);
  setStyle(searchContainer, "display", "flex");
  setStyle(searchContainer, "align-items", "center");
  setStyle(searchInput, "height", "34px");
  setStyle(searchInput, "min-height", "34px");
  setStyle(searchInput, "max-height", "34px");
  setStyle(searchInput, "box-sizing", "border-box");
  setStyle(searchInput, "margin", "0");
  setStyle(searchInput, "min-width", "0");
  setStyle(searchInput, "flex", "1 1 auto");
  setStyle(searchIcon, "flex", "0 0 auto");
  setStyle(searchIcon, "margin-left", "8px");

  syncIgvToggleButtons(root, browser);
  const nativeSaveButton = root.querySelector<HTMLElement>('.igv-navbar-text-button[title="Save Image"]');
  const firstButton = root.querySelector<HTMLElement>('.igv-navbar-text-button[title="Select Tracks"]');
  setStyle(nativeSaveButton, "display", "none");
  if (firstButton && firstButton.parentElement === buttons) {
    let saveButton = buttons.querySelector<HTMLButtonElement>(".rnameta-igv-save-image-button");
    if (!saveButton) {
      saveButton = document.createElement("button");
      saveButton.type = "button";
      saveButton.className = "rnameta-igv-save-image-button";
      saveButton.title = "Save Image";
      saveButton.textContent = "Save Image";
      buttons.insertBefore(saveButton, firstButton);
    }
    saveButton.onclick = (event) => {
      event.preventDefault();
      onSaveImage?.();
    };
  }
  root.querySelectorAll<HTMLElement>(".igv-navbar-text-button").forEach((button) => {
    const svg = button.querySelector<SVGElement>("svg");
    const rect = svg?.querySelector<SVGRectElement>("rect");
    const textNode = svg?.querySelector<SVGTextElement>("text");
    if (!svg || !rect || !textNode) return;
    const viewBox = svg.getAttribute("viewBox")?.split(/\s+/).map(Number) || [];
    const baseWidth = Number(button.dataset.rnametaBaseWidth) || viewBox[2] || 80;
    const widthPx = Math.ceil(baseWidth + 16);
    button.dataset.rnametaBaseWidth = String(baseWidth);
    setAttr(svg, "width", `${widthPx}px`);
    setAttr(svg, "height", "30px");
    setAttr(svg, "viewBox", `0 0 ${widthPx} 30`);
    setAttr(rect, "x", "0.5");
    setAttr(rect, "y", "0.5");
    setAttr(rect, "width", String(widthPx - 1));
    setAttr(rect, "height", "29");
    setAttr(rect, "rx", "8");
    setAttr(rect, "ry", "8");
    setAttr(textNode, "x", "50%");
    setAttr(textNode, "y", "15");
    setAttr(textNode, "font-size", "13");
    setAttr(textNode, "font-weight", "700");
    setAttr(textNode, "dominant-baseline", "middle");
    setAttr(textNode, "text-anchor", "middle");
    textNode.removeAttribute("letter-spacing");
  });
}

export function lockIgvLocusInput(container: HTMLElement, browser: any) {
  const input = browser?.navbar?.searchInput || container.shadowRoot?.querySelector<HTMLInputElement>(".igv-search-input");
  if (!input) return;
  input.readOnly = true;
  input.disabled = true;
  input.title = "Current locus (read-only)";
  input.setAttribute("aria-readonly", "true");
  input.setAttribute("aria-disabled", "true");
}
