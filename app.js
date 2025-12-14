'use strict';

/**
 * app.js
 * - Loads family-tree.json
 * - Assigns generations via BFS from roots (parent->child)
 * - Propagates generation across spouse edges (so spouses don't default to Gen 1)
 * - Builds "display units": single-person or couple (1-to-1 pair)
 * - Renders units grouped by unit.generation
 */

// -------------------- State --------------------
let treeData = null;
const peopleMap = new Map();
let currentFilter = 'all';
// Global connector instance
let treeConnector = null;


// -------------------- DOM --------------------
const els = {
  totalMembers: document.getElementById('totalMembers'),
  totalGens: document.getElementById('totalGens'),
  totalMarriages: document.getElementById('totalMarriages'),

  searchInput: document.getElementById('searchInput'),
  treeContainer: document.getElementById('treeContainer'),

  genButtons: Array.from(document.querySelectorAll('.gen-filter')),
  expandAllBtn: document.getElementById('expandAllBtn'),
  collapseBtn: document.getElementById('collapseBtn'),
  resetBtn: document.getElementById('resetBtn'),

  modal: document.getElementById('detailModal'),
  closeModalBtn: document.getElementById('closeModalBtn'),
  modalCloseBtnBottom: document.getElementById('modalCloseBtnBottom'),
  modalAvatar: document.getElementById('modalAvatar'),
  modalName: document.getElementById('modalName'),
  modalGender: document.getElementById('modalGender'),
  modalGen: document.getElementById('modalGen'),

  datesSection: document.getElementById('datesSection'),
  datesContent: document.getElementById('datesContent'),

  spouseSection: document.getElementById('spouseSection'),
  spouseLinks: document.getElementById('spouseLinks'),

  parentsSection: document.getElementById('parentsSection'),
  parentLinks: document.getElementById('parentLinks'),

  childrenSection: document.getElementById('childrenSection'),
  childLinks: document.getElementById('childLinks'),

  notesSection: document.getElementById('notesSection'),
  modalNotes: document.getElementById('modalNotes'),
};

// -------------------- Init --------------------
document.addEventListener('DOMContentLoaded', () => {
  wireUI();
  loadTree();
  
  // Initialize SVG connector system
  treeConnector = new TreeConnector('#treeContainer');
});


function wireUI() {
  // Search
  els.searchInput.addEventListener('input', () => {
    renderTree(els.searchInput.value.trim().toLowerCase());
  });

  // Generation filter buttons
  els.genButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      els.genButtons.forEach(b => b.classList.remove('active'));
      e.currentTarget.classList.add('active');
      currentFilter = e.currentTarget.dataset.gen;
      renderTree(els.searchInput.value.trim().toLowerCase());
    });
  });

  // View options
  els.expandAllBtn.addEventListener('click', () => {
    setFilterButton('all');
    renderTree(els.searchInput.value.trim().toLowerCase());
  });

  // Collapse = show only "Recent" (8+)
  els.collapseBtn.addEventListener('click', () => {
    setFilterButton('9');
    renderTree(els.searchInput.value.trim().toLowerCase());
  });

  els.resetBtn.addEventListener('click', () => {
    els.searchInput.value = '';
    setFilterButton('all');
    renderTree('');
  });

  // Modal close buttons
  els.closeModalBtn.addEventListener('click', closeModal);
  els.modalCloseBtnBottom.addEventListener('click', closeModal);

  // Click outside closes
  els.modal.addEventListener('click', (e) => {
    if (e.target === els.modal) closeModal();
  });

  // Esc closes
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && els.modal.classList.contains('active')) closeModal();
  });
}

function setFilterButton(genValue) {
  currentFilter = genValue;
  els.genButtons.forEach(b => b.classList.toggle('active', b.dataset.gen === genValue));
}

// -------------------- Load + Normalize --------------------
async function loadTree() {
  try {
    const res = await fetch('./family-tree.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`Failed to load family-tree.json (${res.status})`);

    const data = await res.json();
    treeData = normalizeData(data);

    indexPeople(treeData.people);

    assignGenerations(treeData.people);
    propagateSpouseGenerations(treeData.people); // IMPORTANT for spouse gen
    updateStats();

    renderTree('');
  } catch (err) {
    console.error(err);
    els.treeContainer.innerHTML = `<div class="empty-state">Error loading family-tree.json. Open Console for details.</div>`;
  }
}

function normalizeData(data) {
  const people = Array.isArray(data?.people) ? data.people : [];
  for (const p of people) {
    p.parents = Array.isArray(p.parents) ? p.parents : [];
    p.children = Array.isArray(p.children) ? p.children : [];
    p.spouses = Array.isArray(p.spouses) ? p.spouses : [];
    p.gender = (p.gender || '').toLowerCase(); // 'male' / 'female'
  }
  return { people };
}

function indexPeople(people) {
  peopleMap.clear();
  for (const p of people) peopleMap.set(p.id, p);
}

// -------------------- Generation assignment --------------------
function assignGenerations(people) {
  // Roots: no parents
  const roots = people.filter(p => !p.parents || p.parents.length === 0);
  const visited = new Set();

  const queue = roots.map(r => ({ person: r, gen: 1 }));

  while (queue.length) {
    const { person, gen } = queue.shift();
    if (!person || visited.has(person.id)) continue;

    visited.add(person.id);
    person.generation = gen;

    for (const childId of (person.children || [])) {
      const child = peopleMap.get(childId);
      if (child && !visited.has(child.id)) queue.push({ person: child, gen: gen + 1 });
    }
  }

  // Any unreachable people get gen 1 for now (spouse propagation will fix many)
  for (const p of people) {
    if (!Number.isFinite(p.generation)) p.generation = 1;
  }
}

/**
 * Make spouses share the deeper generation (max of the two), so spouse-only nodes
 * don't stick in Gen 1 when they are connected only via spouse link.
 */
function propagateSpouseGenerations(people) {
  let changed = true;

  while (changed) {
    changed = false;

    for (const p of people) {
      const pg = p.generation || 1;

      for (const sid of (p.spouses || [])) {
        const s = peopleMap.get(sid);
        if (!s) continue;

        const sg = s.generation || 1;
        const g = Math.max(pg, sg);

        if (p.generation !== g) { p.generation = g; changed = true; }
        if (s.generation !== g) { s.generation = g; changed = true; }
      }
    }
  }
}

// -------------------- Stats --------------------
function updateStats() {
  const total = treeData.people.length;
  const maxGen = Math.max(1, ...treeData.people.map(p => p.generation || 1));
  const marriages = countUniqueMarriages(treeData.people);

  els.totalMembers.textContent = String(total);
  els.totalGens.textContent = String(maxGen);
  els.totalMarriages.textContent = String(marriages);
}

function countUniqueMarriages(people) {
  const pairs = new Set();

  for (const p of people) {
    for (const sid of (p.spouses || [])) {
      if (!peopleMap.has(sid)) continue;

      const a = String(p.id);
      const b = String(sid);
      const key = a < b ? `${a}__${b}` : `${b}__${a}`;
      pairs.add(key);
    }
  }
  return pairs.size;
}

// -------------------- Display units (single / couple) --------------------
/**
 * Couples are combined ONLY when both sides are a clean mutual 1-to-1 spouse link:
 *   p.spouses = [s.id] and s.spouses = [p.id]
 * This avoids weird rendering for multiple marriages.
 */
function buildDisplayUnits(people) {
  const used = new Set();
  const units = [];

  for (const p of people) {
    if (used.has(p.id)) continue;

    if (p.spouses?.length === 1) {
      const s = peopleMap.get(p.spouses[0]);
      const isPair =
        s &&
        !used.has(s.id) &&
        s.spouses?.length === 1 &&
        s.spouses[0] === p.id;

      if (isPair) {
        const gen = Math.max(p.generation || 1, s.generation || 1);
        units.push({ type: 'couple', a: p, b: s, generation: gen });
        used.add(p.id);
        used.add(s.id);
        continue;
      }
    }

    units.push({ type: 'single', p, generation: p.generation || 1 });
    used.add(p.id);
  }

  return units;
}

// Search matcher for UNITS
function unitMatchesSearch(unit, term) {
  if (!term) return true;
  const t = term.toLowerCase();

  if (unit.type === 'couple') {
    const aName = (unit.a?.name || '').toLowerCase();
    const bName = (unit.b?.name || '').toLowerCase();
    return aName.includes(t) || bName.includes(t);
  }

  // single: match person name OR spouse names (useful when not merged, e.g. multiple spouses)
  const p = unit.p;
  const name = (p?.name || '').toLowerCase();
  if (name.includes(t)) return true;

  for (const sid of (p.spouses || [])) {
    const spouse = peopleMap.get(sid);
    if (spouse && (spouse.name || '').toLowerCase().includes(t)) return true;
  }
  return false;
}

// -------------------- Rendering (GROUP BY unit.generation) --------------------
function renderTree(searchTerm = '') {
  const term = (searchTerm || '').toLowerCase();

  const units = buildDisplayUnits(treeData.people);

  // Group units by generation
  const groups = {};
  for (const u of units) {
    const g = u.generation || 1;
    if (!groups[g]) groups[g] = [];
    groups[g].push(u);
  }

  const gens = Object.keys(groups).map(Number).sort((a, b) => a - b);

  // Build DOM
  const frag = document.createDocumentFragment();
  let anyShown = false;

  for (const gen of gens) {
    if (!passesGenFilter(gen)) continue;

    const genUnits = groups[gen].filter(u => unitMatchesSearch(u, term));
    if (genUnits.length === 0) continue;

    anyShown = true;

    const genDiv = document.createElement('div');
    genDiv.className = 'generation';

    const label = document.createElement('div');
    label.className = 'gen-label';
    label.textContent = `Generation ${gen}`;
    genDiv.appendChild(label);

    for (const u of genUnits) {
      if (u.type === 'couple') genDiv.appendChild(createCoupleCard(u.a, u.b, term));
      else genDiv.appendChild(createPersonCard(u.p, term));
    }

    frag.appendChild(genDiv);
  }

  els.treeContainer.innerHTML = '';
  if (!anyShown) {
    els.treeContainer.innerHTML = `<div class="empty-state">No matches found. Try a different search.</div>`;
    return;
  }
  els.treeContainer.appendChild(frag);

  // UPDATE: Render SVG connectors
  if (treeConnector) {
    treeConnector.updateConnectors(peopleMap);
  }
}

function passesGenFilter(gen) {
  if (currentFilter === 'all') return true;
  if (currentFilter === '1') return gen === 1;
  if (currentFilter === '5') return gen <= 5;   // Gen 1–5
  if (currentFilter === '9') return gen >= 8;   // Recent (8+)
  return true;
}

// -------------------- Card builders --------------------
function createPersonCard(person, term) {
  const card = document.createElement('div');
  card.className = 'person-card';
  card.setAttribute('data-person-id', person.id);

  const nameLower = (person.name || '').toLowerCase();

  let spouseNames = '';
  if (person.spouses?.length) {
    spouseNames = person.spouses
      .map(id => peopleMap.get(id)?.name)
      .filter(Boolean)
      .join(', ');
  }

  const highlight =
    term &&
    (nameLower.includes(term) || (spouseNames || '').toLowerCase().includes(term));

  if (highlight) card.classList.add('highlight');

  card.addEventListener('click', () => showDetails(person.id));

  const avatar = document.createElement('div');
  avatar.className = 'person-avatar';
  avatar.textContent = genderIcon(person.gender);

  const name = document.createElement('div');
  name.className = 'person-name';
  name.textContent = person.name || '(Unnamed)';

  const details = document.createElement('div');
  details.className = 'person-details';
  const childCount = person.children?.length || 0;
  details.textContent = childCount ? `${childCount} child${childCount === 1 ? '' : 'ren'}` : 'No children listed';

  card.appendChild(avatar);
  card.appendChild(name);
  card.appendChild(details);

  if (spouseNames) {
    const st = document.createElement('div');
    st.className = 'spouse-tag';
    st.textContent = spouseNames;
    card.appendChild(st);
  }

  return card;
}

function createCoupleCard(a, b, term) {
  const card = document.createElement('div');
  card.className = 'person-card';
  card.setAttribute('data-person-id', a.id);

  const bothNames = `${a.name || ''} ${b.name || ''}`.toLowerCase();
  if (term && bothNames.includes(term)) card.classList.add('highlight');

  // Open details for partner A (modal will show spouse links to B)
  card.addEventListener('click', () => showDetails(a.id));

  const avatars = document.createElement('div');
  avatars.className = 'couple-avatars';

  const avA = document.createElement('div');
  avA.className = 'person-avatar';
  avA.textContent = genderIcon(a.gender);

  const avB = document.createElement('div');
  avB.className = 'person-avatar';
  avB.textContent = genderIcon(b.gender);

  avatars.appendChild(avA);
  avatars.appendChild(avB);

  const name = document.createElement('div');
  name.className = 'person-name';
  name.textContent = `${a.name || '(Unnamed)'} & ${b.name || '(Unnamed)'}`;

  const details = document.createElement('div');
  details.className = 'person-details';

  // union of children arrays
  const childIds = new Set([...(a.children || []), ...(b.children || [])]);
  const childCount = childIds.size;
  details.textContent = childCount ? `${childCount} child${childCount === 1 ? '' : 'ren'}` : 'No children listed';

  card.appendChild(avatars);
  card.appendChild(name);
  card.appendChild(details);

  return card;
}

function genderIcon(g) {
  return g === 'male' ? '♂' : (g === 'female' ? '♀' : '•');
}

// -------------------- Modal --------------------
function showDetails(personId) {
  const person = peopleMap.get(personId);
  if (!person) return;

  els.modalAvatar.textContent = genderIcon(person.gender);
  els.modalName.textContent = person.name || '(Unnamed)';
  els.modalGender.textContent =
    person.gender === 'male' ? 'Male' :
    person.gender === 'female' ? 'Female' : 'Unknown';
  els.modalGen.textContent = String(person.generation || 1);

  // Dates
  const dateParts = [];
  if (person.birthDate) dateParts.push(`Birth: ${person.birthDate}`);
  if (person.deathDate) dateParts.push(`Death: ${person.deathDate}`);

  if (dateParts.length) {
    els.datesSection.style.display = '';
    els.datesContent.textContent = dateParts.join(' | ');
  } else {
    els.datesSection.style.display = 'none';
    els.datesContent.textContent = '';
  }

  // Spouses / parents / children
  renderRelationLinks(els.spouseSection, els.spouseLinks, person.spouses, 'No spouses recorded');
  renderRelationLinks(els.parentsSection, els.parentLinks, person.parents, 'Root ancestor');
  renderRelationLinks(els.childrenSection, els.childLinks, person.children, 'No children recorded');

  // Notes
  if (person.notes) {
    els.notesSection.style.display = '';
    els.modalNotes.textContent = person.notes;
  } else {
    els.notesSection.style.display = 'none';
    els.modalNotes.textContent = '';
  }

  els.modal.classList.add('active');
  els.modal.setAttribute('aria-hidden', 'false');
}

function renderRelationLinks(sectionEl, listEl, ids, emptyText) {
  listEl.innerHTML = '';
  const arr = Array.isArray(ids) ? ids : [];

  sectionEl.style.display = '';

  const validPeople = arr
    .map(id => peopleMap.get(id))
    .filter(Boolean);

  if (validPeople.length === 0) {
    const div = document.createElement('div');
    div.textContent = emptyText;
    listEl.appendChild(div);
    return;
  }

  for (const p of validPeople) {
    const link = document.createElement('span');
    link.className = 'relation-link';
    link.textContent = p.name || String(p.id);
    link.addEventListener('click', (e) => {
      e.stopPropagation();
      showDetails(p.id);
    });
    listEl.appendChild(link);
  }
}

function closeModal() {
  els.modal.classList.remove('active');
  els.modal.setAttribute('aria-hidden', 'true');
}
