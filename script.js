// Global variables
let familyData = null;
let root = null;
let svg, g, zoom, tree;
let fuse = null;
let currentOrientation = 'horizontal';
let nodeIdCounter = 0;

// Constants
const NODE_WIDTH = 180;
const NODE_HEIGHT = 60;
const NODE_SPACING_X = 220;
const NODE_SPACING_Y = 100;

// Check if DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

// Main initialization function
async function initApp() {
    console.log('Initializing Family Tree Application...');
    
    try {
        // Verify required libraries
        if (typeof d3 === 'undefined') {
            throw new Error('D3.js library not loaded');
        }
        if (typeof Fuse === 'undefined') {
            throw new Error('Fuse.js library not loaded');
        }
        
        // Verify DOM elements exist
        const requiredElements = [
            'tree-container', 'family-tree', 'search-fab', 
            'search-overlay', 'profile-modal', 'loading'
        ];
        
        for (const id of requiredElements) {
            if (!document.getElementById(id)) {
                throw new Error(`Required element #${id} not found in DOM`);
            }
        }
        
        await loadFamilyData();
        initializeTree();
        initializeSearch();
        initializeEventListeners();
        handleDeepLink();
        hideLoading();
        
        console.log('Application initialized successfully');
    } catch (error) {
        console.error('Error initializing app:', error);
        showError(error.message);
    }
}

// Show error message
function showError(message) {
    const loading = document.getElementById('loading');
    if (loading) {
        loading.innerHTML = `
            <div style="text-align: center; color: white;">
                <i class="fas fa-exclamation-triangle" style="font-size: 3rem; margin-bottom: 1rem;"></i>
                <h2>Error Loading Family Tree</h2>
                <p>${message}</p>
                <button onclick="location.reload()" style="margin-top: 1rem; padding: 0.5rem 1rem; border-radius: 8px; border: none; background: rgba(255,255,255,0.2); color: white; cursor: pointer;">
                    Reload Page
                </button>
            </div>
        `;
    }
}

// Load family data from JSON
async function loadFamilyData() {
    try {
        const response = await fetch('family-tree.json');
        if (!response.ok) {
            throw new Error(`Failed to load family-tree.json: ${response.status}`);
        }
        
        familyData = await response.json();
        console.log('Family data loaded:', familyData.metadata);
        
        // Convert persons object to array for D3
        const personsArray = Object.values(familyData.persons).map(person => {
            return {
                id: person.id,
                name: person.name,
                generation: person.generation,
                gender: person.gender,
                birth: person.birth,
                death: person.death,
                biography: person.biography,
                photo: person.photo,
                maidenName: person.maidenName,
                nickname: person.nickname,
                parentId: (person.parents && person.parents[0]) ? person.parents[0] : null,
                parents: person.parents || [],
                children: person.children || [],
                _expanded: true
            };
        });
        
        // Create hierarchy using stratify
        root = d3.stratify()
            .id(d => d.id)
            .parentId(d => d.parentId)
            (personsArray);
        
        // Initialize positions
        root.x0 = 0;
        root.y0 = 0;
        
        // Expand all initially
        root.descendants().forEach(d => {
            d._children = d.children;
        });
        
        console.log('Tree hierarchy created with', root.descendants().length, 'nodes');
        
    } catch (error) {
        console.error('Error loading family data:', error);
        throw error;
    }
}

// Initialize D3 tree
function initializeTree() {
    const container = document.getElementById('tree-container');
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    console.log('Initializing tree with dimensions:', width, 'x', height);
    
    // Determine orientation based on screen size
    currentOrientation = width > 768 ? 'horizontal' : 'vertical';
    
    // Create SVG
    svg = d3.select('#family-tree')
        .attr('width', width)
        .attr('height', height);
    
    // Clear any existing content
    svg.selectAll('*').remove();
    
    // Create main group for zoom/pan
    g = svg.append('g').attr('class', 'tree-group');
    
    // Setup zoom behavior
    zoom = d3.zoom()
        .scaleExtent([0.1, 3])
        .on('zoom', (event) => {
            g.attr('transform', event.transform);
        });
    
    svg.call(zoom);
    
    // Create tree layout
    updateTreeLayout();
    
    // Initial render
    update(root);
    
    // Center on root after a short delay
    setTimeout(() => centerNode(root), 100);
}

// Update tree layout based on orientation
function updateTreeLayout() {
    const container = document.getElementById('tree-container');
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    if (currentOrientation === 'horizontal') {
        tree = d3.tree()
            .size([height - 100, width - 300])
            .separation((a, b) => a.parent === b.parent ? 1 : 1.5);
    } else {
        tree = d3.tree()
            .size([width - 100, height - 300])
            .separation((a, b) => a.parent === b.parent ? 1 : 1.5);
    }
}

// Update tree visualization
function update(source) {
    const duration = 750;
    
    // Compute new tree layout
    const treeData = tree(root);
    const nodes = treeData.descendants();
    const links = treeData.links();
    
    // Normalize depth
    nodes.forEach(d => {
        if (currentOrientation === 'horizontal') {
            d.y = d.depth * NODE_SPACING_X;
        } else {
            d.y = d.depth * NODE_SPACING_Y;
        }
    });
    
    // Update nodes
    const node = g.selectAll('g.node')
        .data(nodes, d => d.data.id);
    
    // Enter new nodes
    const nodeEnter = node.enter().append('g')
        .attr('class', 'node node-card')
        .attr('transform', d => {
            if (currentOrientation === 'horizontal') {
                return `translate(${source.y0 || 0},${source.x0 || 0})`;
            } else {
                return `translate(${source.x0 || 0},${source.y0 || 0})`;
            }
        })
        .on('click', (event, d) => {
            event.stopPropagation();
            showProfile(d.data);
        });
    
    // Add node rectangle
    nodeEnter.append('rect')
        .attr('class', 'node-rect')
        .attr('width', NODE_WIDTH)
        .attr('height', NODE_HEIGHT)
        .attr('x', -NODE_WIDTH / 2)
        .attr('y', -NODE_HEIGHT / 2)
        .attr('fill', d => d.data.gender === 'M' ? 'var(--node-male)' : 'var(--node-female)')
        .attr('stroke', 'var(--node-border)');
    
    // Add name text
    nodeEnter.append('text')
        .attr('class', 'node-name')
        .attr('dy', '-0.3em')
        .attr('text-anchor', 'middle')
        .text(d => {
            const name = d.data.name || 'Unknown';
            return name.length > 22 ? name.substring(0, 20) + '...' : name;
        });
    
    // Add dates/generation text
    nodeEnter.append('text')
        .attr('class', 'node-dates')
        .attr('dy', '1.2em')
        .attr('text-anchor', 'middle')
        .text(d => {
            if (d.data.birth || d.data.death) {
                return `${d.data.birth || '?'} - ${d.data.death || 'Present'}`;
            }
            return `Gen ${d.data.generation}`;
        });
    
    // Add expand/collapse indicator for nodes with children
    const hasChildren = nodeEnter.filter(d => d.data.children && d.data.children.length > 0);
    
    hasChildren.append('circle')
        .attr('class', 'expand-indicator')
        .attr('r', 10)
        .attr('cy', NODE_HEIGHT / 2 + 18)
        .attr('fill', 'rgba(255, 255, 255, 0.9)')
        .attr('stroke', 'var(--accent-color)')
        .attr('stroke-width', 2)
        .on('click', function(event, d) {
            event.stopPropagation();
            toggleNode(d);
        });
    
    hasChildren.append('text')
        .attr('class', 'expand-text')
        .attr('y', NODE_HEIGHT / 2 + 18)
        .attr('dy', '0.35em')
        .attr('text-anchor', 'middle')
        .attr('fill', 'var(--accent-color)')
        .attr('font-size', '12px')
        .attr('font-weight', 'bold')
        .style('pointer-events', 'none')
        .text(d => `+${d.data.children.length}`);
    
    // Update existing nodes
    const nodeUpdate = nodeEnter.merge(node);
    
    nodeUpdate.transition()
        .duration(duration)
        .attr('transform', d => {
            if (currentOrientation === 'horizontal') {
                return `translate(${d.y},${d.x})`;
            } else {
                return `translate(${d.x},${d.y})`;
            }
        });
    
    // Remove exiting nodes
    node.exit().transition()
        .duration(duration)
        .attr('transform', d => {
            if (currentOrientation === 'horizontal') {
                return `translate(${source.y},${source.x})`;
            } else {
                return `translate(${source.x},${source.y})`;
            }
        })
        .remove();
    
    // Update links
    const link = g.selectAll('path.link')
        .data(links, d => d.target.data.id);
    
    // Enter new links
    const linkEnter = link.enter().insert('path', 'g')
        .attr('class', 'link')
        .attr('d', d => {
            const o = {x: source.x0 || 0, y: source.y0 || 0};
            return createStepPath(o, o);
        });
    
    // Update existing links
    linkEnter.merge(link).transition()
        .duration(duration)
        .attr('d', d => createStepPath(d.source, d.target));
    
    // Remove exiting links
    link.exit().transition()
        .duration(duration)
        .attr('d', d => {
            const o = {x: source.x, y: source.y};
            return createStepPath(o, o);
        })
        .remove();
    
    // Store old positions
    nodes.forEach(d => {
        d.x0 = d.x;
        d.y0 = d.y;
    });
}

// Create step path for links
function createStepPath(source, target) {
    if (currentOrientation === 'horizontal') {
        const midY = (source.y + target.y) / 2;
        return `M${source.y},${source.x} H${midY} V${target.x} H${target.y}`;
    } else {
        const midY = (source.y + target.y) / 2;
        return `M${source.x},${source.y} V${midY} H${target.x} V${target.y}`;
    }
}

// Toggle node expansion
function toggleNode(d) {
    if (d.children) {
        d._children = d.children;
        d.children = null;
    } else {
        d.children = d._children;
    }
    update(d);
}

// Center view on a specific node
function centerNode(d) {
    const scale = 0.75;
    const container = document.getElementById('tree-container');
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    let x, y;
    if (currentOrientation === 'horizontal') {
        x = -d.y * scale + width / 3;
        y = -d.x * scale + height / 2;
    } else {
        x = -d.x * scale + width / 2;
        y = -d.y * scale + height / 3;
    }
    
    svg.transition()
        .duration(750)
        .call(zoom.transform, d3.zoomIdentity.translate(x, y).scale(scale));
}

// Initialize Fuse.js search
function initializeSearch() {
    const personsArray = Object.values(familyData.persons);
    
    fuse = new Fuse(personsArray, {
        keys: ['name', 'maidenName', 'nickname'],
        threshold: 0.3,
        includeScore: true,
        minMatchCharLength: 2
    });
    
    console.log('Search initialized with', personsArray.length, 'persons');
}

// Perform search and display results
function performSearch(query) {
    const resultsContainer = document.getElementById('search-results');
    
    if (!query || query.trim().length < 2) {
        resultsContainer.innerHTML = '';
        return;
    }
    
    const results = fuse.search(query);
    
    if (results.length === 0) {
        resultsContainer.innerHTML = '<div class="no-results"><i class="fas fa-search"></i><p>No matching family members found.</p></div>';
        return;
    }
    
    resultsContainer.innerHTML = results.slice(0, 50).map(result => {
        const person = result.item;
        const father = person.parents && person.parents[0] ? familyData.persons[person.parents[0]] : null;
        
        return `
            <div class="search-result-item" data-id="${person.id}">
                <div class="search-result-name">${person.name}</div>
                <div class="search-result-meta">
                    ${person.birth ? `Born: ${person.birth}` : `Generation ${person.generation}`}
                    ${father ? ` • ${person.gender === 'M' ? 'Son' : 'Daughter'} of ${father.name}` : ''}
                </div>
            </div>
        `;
    }).join('');
    
    // Add click handlers
    resultsContainer.querySelectorAll('.search-result-item').forEach(item => {
        item.addEventListener('click', () => {
            const id = item.getAttribute('data-id');
            searchAndZoom(id);
        });
    });
}

// Teleport function - search and zoom to specific node
function searchAndZoom(id) {
    // Close search overlay
    const searchOverlay = document.getElementById('search-overlay');
    const searchInput = document.getElementById('search-input');
    
    if (searchOverlay) searchOverlay.classList.add('hidden');
    if (searchInput) searchInput.value = '';
    
    // Find the node in the tree
    const node = root.descendants().find(d => d.data.id === id);
    
    if (!node) {
        console.error('Node not found:', id);
        alert('Person not found in tree');
        return;
    }
    
    // Expand path from node to root
    let current = node;
    while (current.parent) {
        if (!current.parent.children) {
            current.parent.children = current.parent._children;
        }
        current = current.parent;
    }
    
    // Update tree to show expanded path
    update(root);
    
    // Wait for update, then center and highlight
    setTimeout(() => {
        centerNode(node);
        
        // Add pulse highlight
        setTimeout(() => {
            const nodeElement = g.selectAll('g.node')
                .filter(d => d.data.id === id)
                .select('rect');
            
            if (nodeElement.node()) {
                nodeElement.classed('pulse-highlight', true);
                setTimeout(() => {
                    nodeElement.classed('pulse-highlight', false);
                }, 2000);
            }
        }, 800);
    }, 100);
}

// Show profile modal
function showProfile(person) {
    const modal = document.getElementById('profile-modal');
    const photoDiv = document.getElementById('profile-photo');
    const nameEl = document.getElementById('profile-name');
    const datesEl = document.getElementById('profile-dates');
    const bioEl = document.getElementById('profile-bio');
    const familyEl = document.getElementById('profile-family');
    
    if (!modal) return;
    
    // Set photo
    if (person.photo) {
        photoDiv.innerHTML = `<img src="${person.photo}" alt="${person.name}">`;
    } else {
        const icon = person.gender === 'M' ? 'fa-male' : 'fa-female';
        photoDiv.innerHTML = `<i class="fas ${icon}"></i>`;
    }
    
    // Set name and dates
    nameEl.textContent = person.name || 'Unknown';
    
    const dateInfo = [];
    if (person.birth) dateInfo.push(`Born: ${person.birth}`);
    if (person.death) dateInfo.push(`Died: ${person.death}`);
    if (dateInfo.length === 0) dateInfo.push(`Generation ${person.generation}`);
    datesEl.textContent = dateInfo.join(' • ');
    
    // Set biography
    if (person.biography) {
        bioEl.innerHTML = `<p>${person.biography}</p>`;
        bioEl.style.display = 'block';
    } else {
        bioEl.style.display = 'none';
    }
    
    // Build family links HTML
    let familyHTML = '';
    
    // Parents
    if (person.parents && person.parents.length > 0) {
        const parentLinks = person.parents
            .map(parentId => {
                const parent = familyData.persons[parentId];
                return parent ? `<span class="family-link" data-id="${parentId}">${parent.name}</span>` : '';
            })
            .filter(html => html)
            .join('');
        
        if (parentLinks) {
            familyHTML += `<div class="family-section"><h3>Parents</h3><div class="family-links">${parentLinks}</div></div>`;
        }
    }
    
    // Children
    if (person.children && person.children.length > 0) {
        const childLinks = person.children
            .map(childId => {
                const child = familyData.persons[childId];
                return child ? `<span class="family-link" data-id="${childId}">${child.name}</span>` : '';
            })
            .filter(html => html)
            .join('');
        
        if (childLinks) {
            familyHTML += `<div class="family-section"><h3>Children (${person.children.length})</h3><div class="family-links">${childLinks}</div></div>`;
        }
    }
    
    familyEl.innerHTML = familyHTML || '<p style="opacity: 0.7; text-align: center;">No family connections recorded.</p>';
    
    // Add click handlers to family links
    familyEl.querySelectorAll('.family-link').forEach(link => {
        link.addEventListener('click', () => {
            const id = link.getAttribute('data-id');
            modal.classList.add('hidden');
            setTimeout(() => searchAndZoom(id), 300);
        });
    });
    
    // Show modal
    modal.classList.remove('hidden');
}

// Initialize all event listeners
function initializeEventListeners() {
    // Search FAB
    const searchFab = document.getElementById('search-fab');
    if (searchFab) {
        searchFab.addEventListener('click', () => {
            const overlay = document.getElementById('search-overlay');
            const input = document.getElementById('search-input');
            if (overlay) overlay.classList.remove('hidden');
            if (input) {
                setTimeout(() => input.focus(), 100);
            }
        });
    }
    
    // Close search
    const closeSearch = document.getElementById('close-search');
    if (closeSearch) {
        closeSearch.addEventListener('click', () => {
            const overlay = document.getElementById('search-overlay');
            const input = document.getElementById('search-input');
            if (overlay) overlay.classList.add('hidden');
            if (input) input.value = '';
        });
    }
    
    // Search input
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            performSearch(e.target.value);
        });
    }
    
    // Close modal
    const closeModal = document.getElementById('close-modal');
    if (closeModal) {
        closeModal.addEventListener('click', () => {
            const modal = document.getElementById('profile-modal');
            if (modal) modal.classList.add('hidden');
        });
    }
    
    // Close on backdrop click
    const searchOverlay = document.getElementById('search-overlay');
    if (searchOverlay) {
        searchOverlay.addEventListener('click', (e) => {
            if (e.target === searchOverlay) {
                searchOverlay.classList.add('hidden');
            }
        });
    }
    
    const profileModal = document.getElementById('profile-modal');
    if (profileModal) {
        profileModal.addEventListener('click', (e) => {
            if (e.target === profileModal) {
                profileModal.classList.add('hidden');
            }
        });
    }
    
    // Zoom controls
    const zoomIn = document.getElementById('zoom-in');
    const zoomOut = document.getElementById('zoom-out');
    const zoomReset = document.getElementById('zoom-reset');
    
    if (zoomIn) {
        zoomIn.addEventListener('click', () => {
            svg.transition().duration(300).call(zoom.scaleBy, 1.3);
        });
    }
    
    if (zoomOut) {
        zoomOut.addEventListener('click', () => {
            svg.transition().duration(300).call(zoom.scaleBy, 0.7);
        });
    }
    
    if (zoomReset) {
        zoomReset.addEventListener('click', () => {
            centerNode(root);
        });
    }
    
    // Handle window resize with debounce
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            const newOrientation = window.innerWidth > 768 ? 'horizontal' : 'vertical';
            if (newOrientation !== currentOrientation) {
                currentOrientation = newOrientation;
                const container = document.getElementById('tree-container');
                svg.attr('width', container.clientWidth).attr('height', container.clientHeight);
                updateTreeLayout();
                update(root);
                centerNode(root);
            }
        }, 300);
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const overlay = document.getElementById('search-overlay');
            const modal = document.getElementById('profile-modal');
            if (overlay && !overlay.classList.contains('hidden')) {
                overlay.classList.add('hidden');
            }
            if (modal && !modal.classList.contains('hidden')) {
                modal.classList.add('hidden');
            }
        }
        
        if ((e.key === '/' || (e.ctrlKey && e.key === 'f')) && e.target.tagName !== 'INPUT') {
            e.preventDefault();
            const fab = document.getElementById('search-fab');
            if (fab) fab.click();
        }
    });
    
    console.log('Event listeners initialized');
}

// Handle deep linking via URL hash
function handleDeepLink() {
    const hash = window.location.hash;
    if (hash && hash.startsWith('#id=')) {
        const id = hash.substring(4);
        console.log('Deep link detected:', id);
        setTimeout(() => searchAndZoom(id), 1500);
    }
}

// Hide loading indicator
function hideLoading() {
    const loading = document.getElementById('loading');
    if (loading) {
        setTimeout(() => {
            loading.classList.add('hidden');
        }, 500);
    }
}
