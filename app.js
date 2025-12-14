
'use strict';

document.addEventListener('DOMContentLoaded', () => {
    const state = {
        treeData: null,
        peopleMap: new Map(),
        genFilter: 'all',
        genderFilter: 'all', 
    };

    const els = {
        totalMembers: document.getElementById('totalMembers'),
        totalGens: document.getElementById('totalGens'),
        searchInput: document.getElementById('searchInput'),
        treeContainer: document.getElementById('treeContainer'),
        genFilterContainer: document.getElementById('gen-filter-container'),
        genderFilterContainer: document.getElementById('gender-filter-container'),
        resetBtn: document.getElementById('resetBtn'),
        // Modal elements
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

    async function init() {
        await loadTree();
        wireUI();
    }

    async function loadTree() {
        try {
            const res = await fetch('./family-tree.json', { cache: 'no-store' });
            if (!res.ok) throw new Error(`Failed to load family-tree.json (${res.status})`);
            const data = await res.json();

            state.treeData = normalizeData(data);
            indexPeople(state.treeData.people);
            assignGenerations(state.treeData.people);
            propagateSpouseGenerations(state.treeData.people);

            updateStats();
            generateFilters();
            renderTree();
        } catch (err) {
            console.error(err);
            els.treeContainer.innerHTML = `<p>Error loading family tree data.</p>`;
        }
    }

    function normalizeData(data) {
        const people = Array.isArray(data?.people) ? data.people : [];
        for (const p of people) {
            p.parents = p.parents || [];
            p.children = p.children || [];
            p.spouses = p.spouses || [];
            p.gender = (p.gender || '').toLowerCase();
        }
        return { people };
    }

    function indexPeople(people) {
        state.peopleMap.clear();
        for (const p of people) {
            state.peopleMap.set(p.id, p);
        }
    }

    function assignGenerations(people) {
        const roots = people.filter(p => p.parents.length === 0);
        const visited = new Set();
        const queue = roots.map(r => ({ person: r, gen: 1 }));

        while (queue.length > 0) {
            const { person, gen } = queue.shift();
            if (!person || visited.has(person.id)) continue;

            visited.add(person.id);
            person.generation = gen;

            for (const childId of person.children) {
                const child = state.peopleMap.get(childId);
                if (child && !visited.has(child.id)) {
                    queue.push({ person: child, gen: gen + 1 });
                }
            }
        }
        people.forEach(p => { if (!p.generation) p.generation = 1; });
    }

    function propagateSpouseGenerations(people) {
        let changed = true;
        while (changed) {
            changed = false;
            for (const p of people) {
                const pGen = p.generation || 1;
                const spouseGens = p.spouses.map(sId => state.peopleMap.get(sId)?.generation || 1);
                const maxGen = Math.max(pGen, ...spouseGens);

                if (p.generation !== maxGen) {
                    p.generation = maxGen;
                    changed = true;
                }
                for (const sId of p.spouses) {
                    const spouse = state.peopleMap.get(sId);
                    if (spouse && spouse.generation !== maxGen) {
                        spouse.generation = maxGen;
                        changed = true;
                    }
                }
            }
        }
    }

    function updateStats() {
        els.totalMembers.textContent = state.treeData.people.length;
        const maxGen = Math.max(0, ...state.treeData.people.map(p => p.generation || 0));
        els.totalGens.textContent = maxGen;
    }

    function generateFilters() {
        // Gender Filters
        els.genderFilterContainer.innerHTML = '';
        ['all', 'male', 'female'].forEach(gender => {
            const btn = document.createElement('button');
            btn.className = 'filter-btn';
            if (gender === state.genderFilter) btn.classList.add('active');
            btn.textContent = gender.charAt(0).toUpperCase() + gender.slice(1);
            btn.dataset.gender = gender;
            btn.addEventListener('click', () => setGenderFilter(gender));
            els.genderFilterContainer.appendChild(btn);
        });

        // Generation Filters
        const maxGen = Math.max(0, ...state.treeData.people.map(p => p.generation));
        els.genFilterContainer.innerHTML = '';
        const allBtn = document.createElement('button');
        allBtn.className = 'gen-filter active';
        allBtn.textContent = 'All Gens';
        allBtn.dataset.gen = 'all';
        allBtn.addEventListener('click', () => setGenFilter('all'));
        els.genFilterContainer.appendChild(allBtn);

        for (let i = 1; i <= maxGen; i++) {
            const btn = document.createElement('button');
            btn.className = 'gen-filter';
            btn.textContent = `G${i}`;
            btn.dataset.gen = i;
            btn.addEventListener('click', () => setGenFilter(i));
            els.genFilterContainer.appendChild(btn);
        }
    }

    function setGenderFilter(gender) {
        state.genderFilter = gender;
        document.querySelectorAll('#gender-filter-container .filter-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.gender === gender);
        });
        applySearchAndFilter();
    }

    function setGenFilter(gen) {
        state.genFilter = String(gen);
        document.querySelectorAll('#gen-filter-container .gen-filter').forEach(b => {
            b.classList.toggle('active', b.dataset.gen === String(gen));
        });
        applySearchAndFilter();
    }

    function wireUI() {
        els.searchInput.addEventListener('input', () => applySearchAndFilter());
        els.resetBtn.addEventListener('click', resetFilters);

        // Modal
        els.closeModalBtn.addEventListener('click', closeModal);
        els.modalCloseBtnBottom.addEventListener('click', closeModal);
        window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
        els.modal.addEventListener('click', (e) => { if (e.target === els.modal) closeModal(); });

        // Event delegation for opening modal
        els.treeContainer.addEventListener('click', (e) => {
            const personDiv = e.target.closest('.person-details');
            if (personDiv && personDiv.dataset.personId) {
                openModal(personDiv.dataset.personId);
            }
        });
    }

    function resetFilters() {
        els.searchInput.value = '';
        state.genFilter = 'all';
        state.genderFilter = 'all';
        generateFilters(); // Regenerate to reset active classes
        renderTree(); // Re-render to clear search highlights
    }

    function renderTree() {
        els.treeContainer.innerHTML = '';
        // Find true roots (no parents)
        const roots = state.treeData.people.filter(p => p.parents.length === 0);
        // Sort roots by id or name for consistent order
        roots.sort((a,b) => (a.id - b.id)); 

        const chart = document.createElement('ul');
        chart.className = 'org-chart';

        const rendered = new Set();
        for (const root of roots) {
            // Only render if not already rendered (avoids loops or multi-parent issues somewhat)
            if (!rendered.has(root.id)) {
               chart.appendChild(renderNodeRecursive(root, rendered));
            }
        }
        els.treeContainer.appendChild(chart);
        applySearchAndFilter();
    }

    function renderNodeRecursive(person, rendered) {
        rendered.add(person.id);
        const li = document.createElement('li');

        const capsule = document.createElement('div');
        capsule.className = 'capsule';
        capsule.dataset.personId = person.id;
        capsule.dataset.generation = person.generation;
        capsule.dataset.gender = person.gender;

        // Main person
        const personDiv = createPersonDiv(person);
        capsule.appendChild(personDiv);

        // Spouses
        if (person.spouses && person.spouses.length > 0) {
            person.spouses.forEach(spouseId => {
                // If spouse is already rendered (e.g. as a root or child of someone else - rare in strict tree but possible), skip?
                // Actually, for display purposes in this tree, we usually want to show the spouse here.
                // But we must check if this spouse is a 'blood relative' who might have their own tree branch. 
                // In many simple trees, spouse is just a leaf or attached here.
                if (rendered.has(spouseId)) return; 

                const spouse = state.peopleMap.get(spouseId);
                if (!spouse) return;

                // Avoid duplicates in capsule
                if (!capsule.querySelector(`[data-person-id='${spouseId}']`)){
                    capsule.appendChild(document.createElement('div')).className = 'spouse-separator';
                    capsule.appendChild(createPersonDiv(spouse));
                    rendered.add(spouseId); 
                }
            });
        }

        li.appendChild(capsule);

        // Children
        const children = person.children.map(cId => state.peopleMap.get(cId)).filter(Boolean);

        // Sort children by age or id if possible? default sort order

        if (children.length > 0) {
            const subList = document.createElement('ul');
            let hasChildrenToRender = false;

            children.forEach(child => {
                if(!rendered.has(child.id)){
                    subList.appendChild(renderNodeRecursive(child, rendered));
                    hasChildrenToRender = true;
                }
            });

            if(hasChildrenToRender) {
                li.appendChild(subList);
            }
        }

        return li;
    }

    function createPersonDiv(person) {
        const personDiv = document.createElement('div');
        personDiv.className = 'person-details';
        personDiv.dataset.personId = person.id;
        let emoji = '';
        if (person.gender === 'male') emoji = '👨';
        else if (person.gender === 'female') emoji = '👩';

        personDiv.innerHTML = `<h4>${emoji} ${person.name}</h4>`;
        return personDiv;
    }

    function applySearchAndFilter() {
        const term = els.searchInput.value.toLowerCase().trim();
        let anyVisible = false;

        document.querySelectorAll('.capsule').forEach(capsule => {
            const generation = capsule.dataset.generation;

            const peopleInCapsule = Array.from(capsule.querySelectorAll('.person-details')).map(div => {
                return state.peopleMap.get(div.dataset.personId);
            });

            const isGenMatch = state.genFilter === 'all' || generation === state.genFilter;
            const isGenderMatch = state.genderFilter === 'all' || peopleInCapsule.some(p => p.gender === state.genderFilter);
            const isNameMatch = term === '' || peopleInCapsule.some(p => p.name.toLowerCase().includes(term));

            if (isGenMatch && isGenderMatch && isNameMatch) {
                capsule.style.opacity = '1';
                // capsule.style.display = 'flex'; // Don't hide display, it breaks structure
                capsule.style.pointerEvents = 'auto';
                anyVisible = true;
            } else {
                capsule.style.opacity = '0.1';
                // capsule.style.display = 'flex'; 
                capsule.style.pointerEvents = 'none';
            }
        });
    }

    // Modal Logic
    function openModal(personId) {
        const person = state.peopleMap.get(personId);
        if (!person) return;

        // Basic Info
        els.modalAvatar.textContent = person.gender === 'male' ? '👨' : (person.gender === 'female' ? '👩' : '👤');
        els.modalName.textContent = person.name;
        els.modalGender.textContent = person.gender ? (person.gender.charAt(0).toUpperCase() + person.gender.slice(1)) : 'Unknown';
        els.modalGen.textContent = person.generation;

        // Dates
        if (person.born || person.died) {
            els.datesSection.style.display = 'block';
            const b = person.born || '?';
            const d = person.died ? ` - ${person.died}` : '';
            els.datesContent.textContent = `Born: ${b}${d}`;
        } else {
            els.datesSection.style.display = 'none';
        }

        // Spouses
        renderLinks(els.spouseSection, els.spouseLinks, person.spouses);

        // Parents
        renderLinks(els.parentsSection, els.parentLinks, person.parents);

        // Children
        renderLinks(els.childrenSection, els.childLinks, person.children);

        // Notes
        if (person.notes) {
            els.notesSection.style.display = 'block';
            els.modalNotes.textContent = person.notes;
        } else {
            els.notesSection.style.display = 'none';
        }

        els.modal.classList.add('active');
    }

    function closeModal() {
        els.modal.classList.remove('active');
    }

    function renderLinks(sectionEl, containerEl, ids) {
        containerEl.innerHTML = '';
        if (!ids || ids.length === 0) {
            sectionEl.style.display = 'none';
            return;
        }
        sectionEl.style.display = 'block';
        ids.forEach(id => {
            const p = state.peopleMap.get(id);
            if (p) {
                const tag = document.createElement('span');
                tag.className = 'info-tag';
                tag.textContent = `${p.name} (G${p.generation})`;
                tag.onclick = () => openModal(id);
                containerEl.appendChild(tag);
            }
        });
    }

    init();
});
