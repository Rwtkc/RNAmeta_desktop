(function () {
  var SVG_NS = "http://www.w3.org/2000/svg";
  var container = null;
  var latestKey = "";
  var exportStyleProperties = [
    "fill", "fill-opacity", "stroke", "stroke-width", "stroke-opacity",
    "stroke-dasharray", "opacity", "visibility", "display", "font-family",
    "font-size", "font-weight", "font-style", "text-anchor",
    "dominant-baseline", "alignment-baseline", "paint-order",
    "shape-rendering", "vector-effect"
  ];

  function clean(value) {
    return String(value || "").replace(/\s+/g, "");
  }

  function publish(message, state) {
    window.parent.postMessage({
      type: "rnameta-structure-status",
      message: message || "",
      state: state || ""
    }, "*");
  }

  function constructor() {
    if (window.fornac && typeof window.fornac.FornaContainer === "function") {
      return window.fornac.FornaContainer;
    }
    return window.FornaContainer || null;
  }

  function applyHighlight(start, end) {
    var first = Number(start || 0);
    var last = Number(end || 0);
    document.querySelectorAll("g.gnode").forEach(function (node) {
      var index = Number(String(node.getAttribute("num") || "").replace(/^n/, ""));
      node.classList.toggle("is-highlighted", index >= first && index <= last);
    });
  }

  function labelIntervalFor(length) {
    if (length > 2500) return 100;
    if (length > 1500) return 50;
    if (length > 800) return 25;
    return 10;
  }

  function inlineComputedStyles(sourceSvg, cloneSvg) {
    var sourceNodes = sourceSvg.querySelectorAll("*");
    var cloneNodes = cloneSvg.querySelectorAll("*");
    sourceNodes.forEach(function (sourceNode, index) {
      var cloneNode = cloneNodes[index];
      if (!cloneNode || !cloneNode.style) return;
      var computed = window.getComputedStyle(sourceNode);
      exportStyleProperties.forEach(function (property) {
        var value = computed.getPropertyValue(property);
        if (value) cloneNode.style.setProperty(property, value);
      });
    });
  }

  function tuneExportLabels(cloneSvg) {
    cloneSvg.querySelectorAll("g.gnode").forEach(function (node) {
      if (!node.querySelector('.fornac-node[node_type="nucleotide"]')) return;
      var label = node.querySelector(".fornac-nodeLabel");
      if (label) label.style.setProperty("font-size", "5px");
    });
  }

  function validBounds(bounds) {
    return bounds && Number.isFinite(bounds.x) && Number.isFinite(bounds.y) &&
      Number.isFinite(bounds.width) && Number.isFinite(bounds.height) &&
      bounds.width > 0 && bounds.height > 0;
  }

  function buildExportSvg(svg) {
    var sourcePlot = svg.querySelector("g.fornac-plot");
    var bounds = null;
    try {
      bounds = (sourcePlot || svg).getBBox();
    } catch (_) {
      bounds = null;
    }
    if (!validBounds(bounds)) {
      bounds = {
        x: 0,
        y: 0,
        width: Math.max(1, svg.clientWidth || 1200),
        height: Math.max(1, svg.clientHeight || 800)
      };
    }

    var padding = Math.max(24, Math.min(bounds.width, bounds.height) * 0.04);
    var exportWidth = Math.ceil(bounds.width + padding * 2);
    var exportHeight = Math.ceil(bounds.height + padding * 2);
    var clone = svg.cloneNode(true);
    inlineComputedStyles(svg, clone);
    tuneExportLabels(clone);

    var clonePlot = clone.querySelector("g.fornac-plot");
    if (sourcePlot && clonePlot) {
      clonePlot.setAttribute(
        "transform",
        "translate(" + (padding - bounds.x) + " " + (padding - bounds.y) + ")"
      );
      clonePlot.style.removeProperty("transform");
    } else {
      var wrapper = document.createElementNS(SVG_NS, "g");
      Array.prototype.slice.call(clone.childNodes).forEach(function (child) {
        if (child.nodeType === 1 && String(child.nodeName).toLowerCase() === "defs") return;
        wrapper.appendChild(child);
      });
      wrapper.setAttribute(
        "transform",
        "translate(" + (padding - bounds.x) + " " + (padding - bounds.y) + ")"
      );
      clone.appendChild(wrapper);
    }

    clone.setAttribute("xmlns", SVG_NS);
    clone.setAttribute("width", String(exportWidth));
    clone.setAttribute("height", String(exportHeight));
    clone.setAttribute("viewBox", "0 0 " + exportWidth + " " + exportHeight);
    clone.setAttribute("preserveAspectRatio", "xMidYMid meet");
    clone.style.removeProperty("width");
    clone.style.removeProperty("height");
    clone.style.setProperty("overflow", "visible");
    return new XMLSerializer().serializeToString(clone);
  }

  function render(payload) {
    var sequence = clean(payload.sequence).toUpperCase().replace(/T/g, "U");
    var structure = clean(payload.structure);
    var key = sequence + ":" + structure + ":" + payload.highlightStart + ":" + payload.highlightEnd;
    if (!sequence || !structure || sequence.length !== structure.length) {
      publish("Sequence and dot-bracket structure must have matching lengths.", "error");
      return;
    }
    if (key === latestKey && document.querySelector("#structure-root svg")) return;

    var FornaContainer = constructor();
    if (!FornaContainer) {
      publish("Forna failed to load.", "error");
      return;
    }

    var root = document.getElementById("structure-root");
    root.innerHTML = "";
    container = new FornaContainer("#structure-root", {
      animation: false,
      zoomable: true,
      initialSize: [Math.max(640, root.clientWidth), Math.max(480, root.clientHeight)],
      labelInterval: labelIntervalFor(sequence.length),
      showNucleotideLabels: true,
      transitionDuration: 0
    });
    container.addRNA(structure, {
      structure: structure,
      sequence: sequence,
      name: payload.transcriptId || "RNAmeta Structure"
    });
    if (typeof container.setSize === "function") container.setSize();
    if (typeof container.stopAnimation === "function") container.stopAnimation();
    applyHighlight(payload.highlightStart, payload.highlightEnd);
    window.requestAnimationFrame(function () {
      applyHighlight(payload.highlightStart, payload.highlightEnd);
    });
    latestKey = key;
    publish("Rendered " + sequence.length + " nt.", "ready");
  }

  window.addEventListener("message", function (event) {
    var payload = event.data || {};
    if (payload.type === "rnameta-structure-render") render(payload);
    if (payload.type === "rnameta-structure-export-source") {
      var svg = document.querySelector("#structure-root svg");
      window.parent.postMessage({
        type: "rnameta-structure-svg",
        requestId: payload.requestId,
        markup: svg ? buildExportSvg(svg) : ""
      }, "*");
    }
  });
  window.addEventListener("DOMContentLoaded", function () {
    publish("Ready.", "ready");
  });
})();
