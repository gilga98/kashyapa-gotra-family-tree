/* Mobile-first static Family Tree (D3 + Fuse) */

const VIEWPORT_BREAKPOINT = 768;
const MAX_RESULTS = 25;

const el = {
  svg: document.getElementById("treeSvg"),
  viewport: document.getElementById("viewport"),

  searchFab: document.getElementById("searchFab"),
  searchOverlay: document.getElementById("searchOverlay"),
  searchInput: document.getElementById("searchInput"),
  searchResults: document.getElementById("searchResults"),
  searchMeta: document.getElementById("searchMeta"),
  closeSearch: document.getElementById("closeSearch"),

  profileModal: document.getElementById("profileModal"),
  closeProfile: document.getElementById("closeProfile"),
  closeProfileBottom: document.getElementById("closeProfileBottom"),
  profileTitle: document.getElementById("profileTitle"),
  profileDates: document.getElementById("profileDates"),
  profileNotes: document.getElementById("profileNotes"),
  profilePhoto: document.getElementById("profilePhoto"),
  profileFamily: document.getElementById("profileFamily"),

  btnReset: document.getElementById("btnReset"),
};

let appData = null;
let people = [];
let peopleById = new Map();

// D3 state
let svg = null;
let g = null;
let gLinks = null;
let gNodes = null;
let zoom = null;

let root = null;
let stratifiedRoot = null;
let nodeById = new Map();
let fuse = null;

// layout config
const CARD_W = 160;
const CARD_H = 56;
const CARD_RX = 12;

const NODE_GAP_X = 40; // sibling separation
const NODE_GAP_Y = 90; // generation separation (vertical layout)

// ---------------------
// Boot
// ---------------------
(async function init() {
  appData = await fetchJSON("./data.json");
  people = (appData.people || []).map(normalizePerson);
  peopleById = new Map(people.map(p => [p.id, p]));

  // Fuse config per PRD
  fuse = new Fuse(people, {
    keys: ["name", "maidenName", "nickname"],
    threshold: 0.3,
    ignoreLocation: true
  });

  initUI();
  initD3();
  buildHierarchy();
  initialRender();

  // Deep link
  const deepId = getDeepLinkId();
  if (deepId) {
    // Allow initial render to settle, then teleport
    setTimeout(() => searchAndZoom(deepId, { k: isMobileLayout() ? 1.25 : 1.1 }), 60);
  }
})();

// ---------------------
// UI init
// ---------------------
function initUI() {
  el.searchFab.addEventListener("click", openSearch);
  el.closeSearch.addEventListener("click", closeSearch);

  el.searchOverlay.addEventListener("click", (e) => {
    // Tap outside sheet closes
    if (e.target === el.searchOverlay) closeSearch();
  });

  el.searchInput.addEventListener("input", onSearchInput);
  el.searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeSearch();
  });

  el.closeProfile.addEventListener("click", closeProfile);
  el.closeProfileBottom.addEventListener("click", closeProfile);
  el.profileModal.addEventListener("click", (e) => {
    if (e.target === el.profileModal) closeProfile();
  });

  el.btnReset.addEventListener("click", () => {
    resetView();
  });

  window.addEventListener("resize", onResize);
  window.addEventListener("hashchange", () => {
    const id = getDeepLinkId();
    if (id) searchAndZoom(id);
  });
}

function openSearch() {
  el.searchOverlay.classList.remove("hidden");
  el.searchOverlay.setAttribute("aria-hidden", "false");
  el.searchInput.value = "";
  el.searchResults.innerHTML = "";
  el.searchMeta.textContent = "Type to search…";
  setTimeout(() => el.searchInput.focus(), 0);
}

function closeSearch() {
  el.searchOverlay.classList.add("hidden");
  el.searchOverlay.setAttribute("aria-hidden", "true");
}

function closeProfile() {
  el.profileModal.classList.add("hidden");
  el.profileModal.setAttribute("aria-hidden", "true");
}

function openProfile(personId) {
  const p = peopleById.get(personId);
  if (!p) return;

  el.profileTitle.textContent = p.name || "Unknown";
  el.profileDates.textContent = formatDateLine(p);
  el.profileNotes.textContent = (p.notes || "").trim() || "—";

  renderPhoto(p);
  renderImmediateFamily(p);

  el.profileModal.classList.remove("hidden");
  el.profileModal.setAttribute("aria-hidden", "false");
}

function renderPhoto(p) {
  el.profilePhoto.innerHTML = "";
  if (p.photoUrl) {
    const img = document.createElement("img");
    img.alt = `${p.name} photo`;
    img.src = p.photoUrl;
    el.profilePhoto.appendChild(img);
    return;
  }
  const initials = document.createElement("div");
  initials.className = "initials";
  initials.textContent = getInitials(p.name);
  el.profilePhoto.appendChild(initials);
}

function renderImmediateFamily(p) {
  el.profileFamily.innerHTML = "";

  const parents = (p.parents || []).map(id => peopleById.get(id)).filter(Boolean);
  const spouses = (p.spouses || []).map(id => peopleById.get(id)).filter(Boolean);
  const children = (p.children || []).map(id => peopleById.get(id)).filter(Boolean);

  addFamilyGroup("Parents", parents);
  addFamilyGroup("Spouses", spouses);
  addFamilyGroup("Children", children);

  if (el.profileFamily.innerHTML.trim() === "") {
    const empty = document.createElement("div");
    empty.className = "notes";
    empty.textContent = "No immediate family links recorded.";
    el.profileFamily.appendChild(empty);
  }

  function addFamilyGroup(label, list) {
    if (!list.length) return;

    const title = document.createElement("div");
    title.className = "section-title";
    title.textContent = label;
    el.profileFamily.appendChild(title);

    list.forEach(person => {
      const row = document.createElement("div");
      row.className = "pill";

      const left = document.createElement("div");
      left.textContent = person.name;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = "Go";
      btn.addEventListener("click", () => {
        closeProfile();
        closeSearch();
        setHashId(person.id);
        searchAndZoom(person.id);
      });

      row.appendChild(left);
      row.appendChild(btn);
      el.profileFamily.appendChild(row);
    });
  }
}

function onSearchInput() {
  const q = (el.searchInput.value || "").trim();
  if (!q) {
    el.searchResults.innerHTML = "";
    el.searchMeta.textContent = "Type to search…";
    return;
  }

  const matches = fuse.search(q).slice(0, MAX_RESULTS).map(r => r.item);
  el.searchMeta.textContent = `${matches.length} result(s)`;

  el.searchResults.innerHTML = "";
  matches.forEach(p => {
    const row = document.createElement("div");
    row.className = "result-row";
    row.setAttribute("role", "listitem");

    const title = document.createElement("div");
    title.className = "result-title";
    title.textContent = formatResultTitle(p);

    const sub = document.createElement("div");
    sub.className = "result-sub";
    sub.textContent = formatResultSub(p);

    row.appendChild(title);
    row.appendChild(sub);

    row.addEventListener("click", () => {
      closeSearch();
      setHashId(p.id);
      searchAndZoom(p.id, { k: isMobileLayout() ? 1.25 : 1.1 });
    });

    el.searchResults.appendChild(row);
  });
}

// ---------------------
// D3 init
// ---------------------
function initD3() {
  svg = d3.select(el.svg);
  svg.selectAll("*").remove();

  // Main zoom layer
  g = svg.append("g").attr("class", "zoom-layer");
  gLinks = g.append("g").attr("class", "links");
  gNodes = g.append("g").attr("class", "nodes");

  zoom = d3.zoom()
    .scaleExtent([0.35, 2.5])
    .on("zoom", (event) => {
      g.attr("transform", event.transform);
    });

  svg.call(zoom);
  svg.on("dblclick.zoom", null); // optional: avoid accidental double-tap zoom

  // Background tap closes modals/overlays if needed (no-op)
}

function buildHierarchy() {
  // d3.stratify needs exactly one parentId.
  // Choose a "primary parent" (prefer male parent if available) so data becomes a tree.
  const derived = people.map(p => {
    const parentId = getPrimaryParentId(p);
    return { ...p, parentId: parentId || null };
  });

  // Ensure exactly one root; if multiple, attach to a synthetic root.
  const roots = derived.filter(d => !d.parentId);
  let stratifyData = derived;

  if (roots.length !== 1) {
    const SYN_ID = "__synthetic_root__";
    stratifyData = [
      { id: SYN_ID, parentId: null, name: "Family", gender: "unknown", notes: "", birthDate: "", deathDate: "", parents: [], spouses: [], children: [], isSynthetic: true },
      ...derived.map(d => (d.parentId ? d : { ...d, parentId: SYN_ID }))
    ];
  }

  const stratify = d3.stratify()
    .id(d => d.id)
    .parentId(d => d.parentId);

  stratifiedRoot = stratify(stratifyData);

  // Convert to d3.hierarchy-like node with children toggling
  root = stratifiedRoot;

  // Collapse beyond depth 1 by default (keeps it friendly on mobile)
  root.each(d => {
    d._children = null;
  });

  root.children?.forEach(c => collapseDeep(c, 1));

  rebuildNodeIndex();
}

function collapseDeep(node, depthFromHere) {
  // collapse grandchildren and beyond
  if (!node) return;
  if (depthFromHere >= 1 && node.children && node.children.length) {
    node._children = node.children;
    node.children = null;
  }
  const kids = node._children || node.children || [];
  kids.forEach(k => collapseDeep(k, depthFromHere + 1));
}

function rebuildNodeIndex() {
  nodeById = new Map();
  root.each(d => {
    nodeById.set(d.id, d);
  });
}

// ---------------------
// Render/update
// ---------------------
function initialRender() {
  update(root);

  // Fit view to root
  setTimeout(() => {
    resetView();
  }, 0);
}

function update(source) {
  rebuildNodeIndex();

  const { width, height } = el.svg.getBoundingClientRect();
  svg.attr("viewBox", [0, 0, width, height]);

  const vertical = isMobileLayout();

  // Layout: d3.tree expects x/y on nodes; we will interpret them based on orientation.
  const treeLayout = d3.tree()
    .nodeSize([NODE_GAP_X + CARD_W, NODE_GAP_Y]);

  treeLayout(root);

  // Compute extents for positioning
  const nodes = root.descendants();
  const links = root.links();

  // Centering offsets: keep everything in positive space with some padding
  const pad = 80;

  const xs = nodes.map(d => d.x);
  const ys = nodes.map(d => d.y);

  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);

  // Offsets depend on orientation because we swap rendered coords
  // Rendered:
  // - vertical: x = d.x, y = d.y
  // - horizontal: x = d.y, y = d.x
  const offsetX = pad + (vertical ? -minX : -minY);
  const offsetY = pad + (vertical ? -minY : -minX);

  // Links (step / right-angle look)
  const linkPath = (d) => stepLinkPath(d, { vertical, offsetX, offsetY });

  const linkSel = gLinks.selectAll("path.link")
    .data(links, d => d.target.id);

  linkSel.enter()
    .append("path")
    .attr("class", "link")
    .attr("d", linkPath)
    .attr("opacity", 0.0)
    .transition().duration(250)
    .attr("opacity", 1.0);

  linkSel.transition().duration(250).attr("d", linkPath);

  linkSel.exit()
    .transition().duration(150)
    .attr("opacity", 0.0)
    .remove();

  // Nodes
  const nodeSel = gNodes.selectAll("g.node")
    .data(nodes, d => d.id);

  const nodeEnter = nodeSel.enter()
    .append("g")
    .attr("class", "node")
    .attr("data-id", d => d.id)
    .attr("transform", d => `translate(${renderX(d, vertical, offsetX)}, ${renderY(d, vertical, offsetY)})`)
    .attr("opacity", 0);

  // Card group
  const card = nodeEnter.append("g")
    .attr("class", "node-card")
    .style("cursor", d => (d.data?.isSynthetic ? "default" : "pointer"))
    .on("click", (event, d) => {
      // Synthetic root does nothing
      if (d.data?.isSynthetic) return;
      openProfile(d.id);
    });

  card.append("rect")
    .attr("x", -CARD_W / 2)
    .attr("y", -CARD_H / 2)
    .attr("width", CARD_W)
    .attr("height", CARD_H)
    .attr("rx", CARD_RX);

  card.append("text")
    .attr("class", "name")
    .attr("x", 0)
    .attr("y", -4)
    .attr("text-anchor", "middle")
    .text(d => d.data?.isSynthetic ? "" : (d.data?.name || "Unknown"));

  card.append("text")
    .attr("class", "dates")
    .attr("x", 0)
    .attr("y", 14)
    .attr("text-anchor", "middle")
    .text(d => d.data?.isSynthetic ? "" : formatYears(d.data));

  // Child (+) indicator: toggles expand/collapse (separate from opening modal)
  const indicator = nodeEnter.append("g")
    .attr("class", "child-indicator")
    .style("cursor", "pointer")
    .on("click", (event, d) => {
      event.stopPropagation();
      if (d.data?.isSynthetic) return;
      toggleNode(d);
      update(d);
    });

  indicator.append("circle")
    .attr("r", 12)
    .attr("cx", 0)
    .attr("cy", CARD_H / 2 + 16);

  indicator.append("text")
    .attr("x", 0)
    .attr("y", CARD_H / 2 + 16)
    .text(d => (hasHiddenOrVisibleChildren(d) ? (d.children ? "–" : "+") : ""));

  // Hide indicator for leaf nodes
  indicator.attr("display", d => hasHiddenOrVisibleChildren(d) ? null : "none");

  // Hide synthetic root card visually (but keep it in layout)
  nodeEnter.attr("display", d => d.data?.isSynthetic ? "none" : null);

  nodeEnter.transition().duration(250).attr("opacity", 1);

  nodeSel.transition().duration(250)
    .attr("transform", d => `translate(${renderX(d, vertical, offsetX)}, ${renderY(d, vertical, offsetY)})`)
    .attr("opacity", 1)
    .select(".child-indicator text")
    .text(d => (hasHiddenOrVisibleChildren(d) ? (d.children ? "–" : "+") : ""));

  nodeSel.select(".child-indicator")
    .attr("display", d => hasHiddenOrVisibleChildren(d) ? null : "none");

  nodeSel.exit()
    .transition().duration(150)
    .attr("opacity", 0)
    .remove();
}

function toggleNode(d) {
  if (d.children) {
    d._children = d.children;
    d.children = null;
  } else if (d._children) {
    d.children = d._children;
    d._children = null;
  }
}

function hasHiddenOrVisibleChildren(d) {
  return (d.children && d.children.length) || (d._children && d._children.length);
}

// Step link path using d3.line + curveStep for right-angle style
function stepLinkPath(link, { vertical, offsetX, offsetY }) {
  const s = link.source;
  const t = link.target;

  const sx = renderX(s, vertical, offsetX);
  const sy = renderY(s, vertical, offsetY);
  const tx = renderX(t, vertical, offsetX);
  const ty = renderY(t, vertical, offsetY);

  // Anchor to edges of cards
  // If vertical: link from bottom of parent to top of child
  // If horizontal: link from right of parent to left of child
  const start = vertical
    ? [sx, sy + CARD_H / 2]
    : [sx + CARD_W / 2, sy];

  const end = vertical
    ? [tx, ty - CARD_H / 2]
    : [tx - CARD_W / 2, ty];

  const line = d3.line().curve(d3.curveStep);
  return line([start, end]);
}

function renderX(d, vertical, offsetX) {
  return (vertical ? d.x : d.y) + offsetX;
}
function renderY(d, vertical, offsetY) {
  return (vertical ? d.y : d.x) + offsetY;
}

// ---------------------
// Teleport / deep linking
// ---------------------
function searchAndZoom(id, { k = 1.2, duration = 750 } = {}) {
  const target = nodeById.get(id);
  if (!target) return;

  // Expand ancestors to root so the node becomes visible
  let n = target;
  while (n) {
    if (n._children) {
      n.children = n._children;
      n._children = null;
    }
    n = n.parent;
  }

  // Re-render so coordinates are current
  update(root);

  const t = nodeById.get(id);
  if (!t) return;

  const vertical = isMobileLayout();
  const renderedX = renderX(t, vertical, 0);
  const renderedY = renderY(t, vertical, 0);

  // We must account for the offsets used during update().
  // Recompute offsets quickly in the same way update() does:
  const nodes = root.descendants();
  const xs = nodes.map(d => d.x);
  const ys = nodes.map(d => d.y);
  const pad = 80;

  const minX = Math.min(...xs), minY = Math.min(...ys);

  const offsetX = pad + (vertical ? -minX : -minY);
  const offsetY = pad + (vertical ? -minY : -minX);

  const x = (vertical ? t.x : t.y) + offsetX;
  const y = (vertical ? t.y : t.x) + offsetY;

  const { width, height } = el.svg.getBoundingClientRect();

  const transform = d3.zoomIdentity
    .translate(width / 2 - x * k, height / 2 - y * k)
    .scale(k);

  svg.transition()
    .duration(duration)
    .call(zoom.transform, transform);

  // Highlight
  const sel = gNodes.select(`[data-id="${CSS.escape(id)}"]`);
  sel.classed("pulse-highlight", true);
  setTimeout(() => sel.classed("pulse-highlight", false), 2000);
}

function getDeepLinkId() {
  const h = (window.location.hash || "").replace(/^#/, "");
  if (!h) return null;

  // Support: #id=UUID OR #UUID
  if (h.startsWith("id=")) return decodeURIComponent(h.slice(3));
  return decodeURIComponent(h);
}

function setHashId(id) {
  // keep it simple; deep link format: #id=...
  window.location.hash = `id=${encodeURIComponent(id)}`;
}

// ---------------------
// View helpers
// ---------------------
function resetView() {
  const { width, height } = el.svg.getBoundingClientRect();
  // Focus around root (or first child if synthetic root hidden)
  const focusNode = root.data?.isSynthetic && root.children?.length ? root.children[0] : root;
  if (!focusNode) return;

  const vertical = isMobileLayout();

  // Ensure root is expanded
  if (focusNode._children) {
    focusNode.children = focusNode._children;
    focusNode._children = null;
    update(root);
  }

  // Center root with comfortable zoom
  const k = isMobileLayout() ? 0.9 : 0.85;

  // Similar offset recompute
  const nodes = root.descendants();
  const xs = nodes.map(d => d.x);
  const ys = nodes.map(d => d.y);
  const pad = 80;

  const minX = Math.min(...xs), minY = Math.min(...ys);
  const offsetX = pad + (vertical ? -minX : -minY);
  const offsetY = pad + (vertical ? -minY : -minX);

  const x = (vertical ? focusNode.x : focusNode.y) + offsetX;
  const y = (vertical ? focusNode.y : focusNode.x) + offsetY;

  const transform = d3.zoomIdentity
    .translate(width / 2 - x * k, height / 2 - y * k)
    .scale(k);

  svg.transition().duration(500).call(zoom.transform, transform);
}

function onResize() {
  // Preserve current camera transform while re-layout happens
  const current = d3.zoomTransform(el.svg);
  update(root);
  svg.call(zoom.transform, current);
}

// ---------------------
// Data helpers
// ---------------------
function normalizePerson(p) {
  return {
    id: String(p.id),
    name: p.name || "Unknown",
    maidenName: p.maidenName || "",
    nickname: p.nickname || "",
    gender: p.gender || "unknown",
    birthDate: p.birthDate || "",
    deathDate: p.deathDate || "",
    photoUrl: p.photoUrl || "",
    notes: p.notes || "",
    parents: Array.isArray(p.parents) ? p.parents : [],
    spouses: Array.isArray(p.spouses) ? p.spouses : [],
    children: Array.isArray(p.children) ? p.children : []
  };
}

function getPrimaryParentId(p) {
  const parents = (p.parents || []).map(id => peopleById.get(id)).filter(Boolean);
  if (!parents.length) return null;

  const father = parents.find(x => x.gender === "male");
  return (father || parents[0]).id;
}

function formatYears(p) {
  const b = extractYear(p.birthDate);
  const d = extractYear(p.deathDate);
  if (!b && !d) return "";
  if (b && !d) return `${b} –`;
  if (!b && d) return `– ${d}`;
  return `${b} – ${d}`;
}

function formatDateLine(p) {
  const b = p.birthDate ? `Born: ${p.birthDate}` : "";
  const d = p.deathDate ? `Died: ${p.deathDate}` : "";
  if (b && d) return `${b} • ${d}`;
  return b || d || "Dates not recorded";
}

function extractYear(s) {
  if (!s) return "";
  const m = String(s).match(/(\d{4})/);
  return m ? m[1] : "";
}

function formatResultTitle(p) {
  const by = extractYear(p.birthDate);
  return by ? `${p.name} (${by})` : p.name;
}

function formatResultSub(p) {
  const parents = (p.parents || []).map(id => peopleById.get(id)).filter(Boolean);
  if (!parents.length) return "—";

  const father = parents.find(x => x.gender === "male");
  const parent = father || parents[0];
  const rel = (p.gender === "female") ? "Daughter of" : (p.gender === "male" ? "Son of" : "Child of");
  return `${rel} ${parent.name}`;
}

function getInitials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] || "?";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

function isMobileLayout() {
  return window.matchMedia(`(max-width: ${VIEWPORT_BREAKPOINT}px)`).matches;
}

async function fetchJSON(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return res.json();
}
