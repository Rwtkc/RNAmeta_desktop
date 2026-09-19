import {
  arrangeIgvNavbar,
  lockIgvLocusInput,
  syncIgvToggleButtons,
  syncIgvToolbarDensity
} from "./genomeBrowserIgvControls";

const IGV_THEME = `
:host { --rnameta-text:#2f3930; --rnameta-muted:#6d7569; --rnameta-surface:#fffdf8; --rnameta-soft:#f8f2ea; --rnameta-border:#d8cebf; --rnameta-accent:#65795b; --rnameta-accent-soft:#e8ede2; }
.igv-container,.igv-root-div { min-height:360px; font-family:sans-serif!important; color:var(--rnameta-text); background:#fff; }
.igv-navbar { display:flex!important; align-items:center!important; gap:5px!important; min-height:56px!important; padding:10px!important; box-sizing:border-box!important; border:1px solid rgba(133,155,122,.22)!important; border-radius:.6rem .6rem 0 0!important; background:linear-gradient(180deg,#fffdf8 0%,#f8f2ea 100%)!important; box-shadow:0 6px 16px rgba(58,49,38,.06)!important; overflow:visible!important; }
.igv-navbar-left-container,.igv-navbar-right-container,.igv-navbar-genomic-location,.igv-locus-size-group,.igv-zoom-widget { display:flex!important; align-items:center!important; min-width:0!important; }
.igv-navbar-left-container { flex:1 1 auto!important; justify-content:flex-start!important; gap:7px!important; overflow:visible!important; }
.igv-navbar-genomic-location,.igv-locus-size-group { justify-content:flex-start!important; gap:6px!important; }
.igv-navbar-right-container { flex:0 0 auto!important; min-width:0!important; }
.igv-navbar-toggle-button-container { display:flex!important; flex:0 1 auto!important; min-width:0!important; }
.igv-search-container { flex:1 1 14rem!important; max-width:18rem!important; min-width:0!important; display:flex!important; align-items:center!important; }
.igv-logo { display:flex!important; align-items:center!important; justify-content:center!important; height:30px!important; line-height:1!important; }
.igv-logo svg { display:block!important; width:38px!important; height:26px!important; }
.igv-current-genome { display:none!important; }
.igv-navbar input,.igv-navbar select { height:34px!important; min-height:34px!important; box-sizing:border-box!important; border:1px solid var(--rnameta-border)!important; border-radius:.6rem!important; background:var(--rnameta-surface)!important; color:var(--rnameta-text)!important; box-shadow:none!important; font-size:.9rem!important; font-weight:700!important; }
.igv-navbar .igv-search-input { width:100%!important; min-width:0!important; font-size:0.8rem!important; }
.igv-search-input:disabled { opacity:1!important; cursor:default!important; }
.igv-navbar-text-button { height:30px!important; margin-left:5px!important; border-radius:.6rem!important; }
.igv-navbar-text-button svg { height:30px!important; overflow:visible!important; }
.igv-navbar-text-button svg rect { fill:var(--rnameta-soft)!important; stroke:var(--rnameta-border)!important; stroke-width:1.2px!important; rx:8px!important; ry:8px!important; }
.igv-navbar-text-button svg text,.igv-navbar-text-button svg tspan { fill:var(--rnameta-text)!important; font-family:sans-serif!important; font-size:13px!important; font-weight:700!important; dominant-baseline:middle!important; text-anchor:middle!important; }
.igv-navbar-text-button:hover svg rect { fill:var(--rnameta-accent-soft)!important; stroke:rgba(101,121,91,.72)!important; }
.igv-navbar-text-button[data-rnameta-toggle-active="true"] svg rect { fill:var(--rnameta-accent)!important; stroke:var(--rnameta-accent)!important; }
.igv-navbar-text-button[data-rnameta-toggle-active="true"] svg text,.igv-navbar-text-button[data-rnameta-toggle-active="true"] svg tspan { fill:#fff!important; }
.igv-navbar-icon-button[title="Select Tracks"],.igv-navbar-icon-button[title="Crosshairs"],.igv-navbar-icon-button[title="Center Line"],.igv-navbar-icon-button[title="Track Labels"] { display:inline-flex!important; align-items:center!important; justify-content:center!important; width:auto!important; min-width:92px!important; height:30px!important; flex:0 0 auto!important; margin-left:5px!important; padding:0 10px!important; box-sizing:border-box!important; border:1px solid var(--rnameta-border)!important; border-radius:.6rem!important; background:var(--rnameta-soft)!important; color:var(--rnameta-text)!important; font:700 13px/30px sans-serif!important; white-space:nowrap!important; }
.igv-navbar-icon-button[title="Select Tracks"]::after { content:"Select Tracks"; }
.igv-navbar-icon-button[title="Crosshairs"]::after { content:"Crosshairs"; }
.igv-navbar-icon-button[title="Center Line"]::after { content:"Center Line"; }
.igv-navbar-icon-button[title="Track Labels"]::after { content:"Track Labels"; }
.igv-navbar-icon-button[title="Select Tracks"] > svg,.igv-navbar-icon-button[title="Crosshairs"] > svg,.igv-navbar-icon-button[title="Center Line"] > svg,.igv-navbar-icon-button[title="Track Labels"] > svg { display:none!important; }
.igv-navbar-icon-button[title="Select Tracks"]:hover,.igv-navbar-icon-button[title="Crosshairs"]:hover,.igv-navbar-icon-button[title="Center Line"]:hover,.igv-navbar-icon-button[title="Track Labels"]:hover { background:var(--rnameta-accent-soft)!important; border-color:rgba(101,121,91,.72)!important; }
.igv-navbar-icon-button[data-rnameta-toggle-active="true"] { border-color:var(--rnameta-accent)!important; background:var(--rnameta-accent)!important; color:#fff!important; }
.rnameta-igv-save-image-button { display:inline-flex!important; align-items:center!important; justify-content:center!important; flex:0 0 auto!important; height:30px!important; min-width:96px!important; margin-left:5px!important; padding:0 10px!important; border:1px solid var(--rnameta-border)!important; border-radius:.6rem!important; background:var(--rnameta-soft)!important; color:var(--rnameta-text)!important; font:700 13px/1 sans-serif!important; cursor:pointer!important; white-space:nowrap!important; transition:background-color 120ms ease,border-color 120ms ease,color 120ms ease!important; }
.rnameta-igv-save-image-button:hover { background:var(--rnameta-accent-soft)!important; border-color:rgba(101,121,91,.72)!important; color:var(--rnameta-accent)!important; }
.rnameta-igv-save-image-button:active { background:var(--rnameta-accent)!important; border-color:var(--rnameta-accent)!important; color:#fff!important; }
.igv-track-label { color:var(--rnameta-text)!important; border:1px solid rgba(101,121,91,.32)!important; border-radius:.6rem!important; background:rgba(255,253,248,.94)!important; font-weight:800!important; }
.igv-ui-popover { box-sizing:border-box!important; z-index:2048!important; width:19rem!important; max-width:calc(100vw - 1rem)!important; overflow:visible!important; border:1px solid var(--rnameta-border)!important; border-radius:1rem!important; background:var(--rnameta-surface)!important; box-shadow:0 .55rem 1.3rem rgba(58,49,38,.18)!important; color:var(--rnameta-text)!important; font-family:sans-serif!important; font-size:.74rem!important; line-height:1.4!important; }
.igv-ui-popover > div:first-child { box-sizing:border-box!important; display:flex!important; align-items:center!important; justify-content:space-between!important; min-height:2rem!important; padding:.3rem .55rem!important; border-bottom:1px solid var(--rnameta-border)!important; border-radius:1rem 1rem 0 0!important; background:var(--rnameta-soft)!important; }
.igv-ui-popover > div:first-child > div:first-child { flex:1 1 auto!important; min-width:0!important; overflow:hidden!important; text-overflow:ellipsis!important; white-space:nowrap!important; color:var(--rnameta-text)!important; font-size:.68rem!important; font-weight:800!important; text-transform:uppercase!important; }
.igv-ui-popover > div:first-child > div:first-child:empty::before { content:"Feature details"; }
.igv-ui-popover > div:first-child > div:last-child { display:flex!important; align-items:center!important; justify-content:center!important; flex:0 0 1.25rem!important; width:1.25rem!important; min-width:1.25rem!important; height:1.25rem!important; margin:0!important; border-radius:.6rem!important; color:var(--rnameta-muted)!important; cursor:pointer!important; }
.igv-ui-popover > div:first-child > div:last-child:hover { background:var(--rnameta-accent-soft)!important; color:var(--rnameta-accent)!important; }
.igv-ui-popover > div:first-child svg { width:.8rem!important; height:.8rem!important; }
.igv-ui-popover > div:last-child { display:grid!important; gap:.06rem!important; max-width:100%!important; padding:.35rem .6rem!important; box-sizing:border-box!important; border-radius:0 0 1rem 1rem!important; background:var(--rnameta-surface)!important; }
.igv-ui-popover > div:last-child > div { min-width:0!important; padding:.22rem 0!important; border-bottom:1px solid rgba(216,206,191,.55)!important; color:var(--rnameta-text)!important; overflow-wrap:anywhere!important; }
.igv-ui-popover > div:last-child > div:last-child { border-bottom:0!important; }
.igv-ui-popover > div:last-child > div > span { display:inline-block!important; min-width:4.2rem!important; margin-right:.25rem!important; color:var(--rnameta-muted)!important; font-weight:800!important; }
.igv-ruler-tooltip { z-index:96!important; height:auto!important; overflow:visible!important; }
.igv-ruler-tooltip > div { box-sizing:border-box!important; width:auto!important; min-width:4.8rem!important; padding:.28rem .5rem!important; border:1px solid var(--rnameta-border)!important; border-radius:.6rem!important; background:var(--rnameta-surface)!important; box-shadow:0 .35rem .85rem rgba(58,49,38,.16)!important; color:var(--rnameta-text)!important; font-family:sans-serif!important; font-size:.78rem!important; font-weight:750!important; line-height:1.2!important; text-align:center!important; white-space:nowrap!important; transform:translate(-50%,.25rem)!important; }
.igv-ruler-tooltip > div::after { content:" bp"; }
.igv-navbar { flex-wrap:nowrap!important; overflow:hidden!important; }
`;

export function setupGenomeBrowserTheme(container: HTMLElement, browser: any, onSaveImage?: () => void) {
  const root = container.shadowRoot;
  if (!root) return () => {};
  let style = root.querySelector<HTMLStyleElement>("#rnameta-desktop-igv-theme");
  if (!style) {
    style = document.createElement("style");
    style.id = "rnameta-desktop-igv-theme";
    style.textContent = IGV_THEME;
    root.appendChild(style);
  }
  let frameId: number | null = null;
  let timeoutId: number | null = null;
  const update = () => {
    if (frameId !== null) return;
    frameId = window.requestAnimationFrame(() => {
      frameId = null;
      lockIgvLocusInput(container, browser);
      syncIgvToolbarDensity(container, browser);
      arrangeIgvNavbar(container, browser, onSaveImage);
    });
  };
  const updateSeries = () => { update(); window.setTimeout(update, 80); window.setTimeout(update, 240); window.setTimeout(update, 600); };
  const navbar = root.querySelector(".igv-navbar");
  const observer = new MutationObserver(update);
  if (navbar) observer.observe(navbar, { attributes: true, childList: true, subtree: true, attributeFilter: ["width", "height", "viewBox", "style", "class", "title"] });
  const handleResize = () => { if (timeoutId !== null) window.clearTimeout(timeoutId); timeoutId = window.setTimeout(updateSeries, 120); };
  window.addEventListener("resize", handleResize);
  syncIgvToolbarDensity(container, browser);
  syncIgvToggleButtons(root, browser);
  updateSeries();
  return () => {
    observer.disconnect();
    window.removeEventListener("resize", handleResize);
    if (frameId !== null) window.cancelAnimationFrame(frameId);
    if (timeoutId !== null) window.clearTimeout(timeoutId);
    style?.remove();
  };
}
