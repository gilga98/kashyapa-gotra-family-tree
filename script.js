// Global variables
let familyData = null;
let root = null;
let svg, g, zoom, tree;
let fuse = null;
let currentOrientation = window.innerWidth > 768 ? 'horizontal' : 'vertical';

// Constants
const NODE_WIDTH = 180;
const NODE_HEIGHT = 60;
const NODE_SPACING_X = 220;
const NODE_SPACING_Y = 100;

// Initialize the application
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await loadFamilyData();
        initializeTree();
        initializeSearch();
        initializeEventListeners();
        handleDeepLink();
        hideLoading();
    } catch (error) {
        console.error('Error initializing app:', error);
        alert('Failed to load family tree data. Please refresh the page.');
    }
});

// Load family data from JSON
async function loadFamilyData() {
    const response = await fetch('family-tree.json');
    familyData = await response.json();
    
    // Convert persons object to array for D3
    const personsArray = Object.values(familyData.persons).map(person => ({
        ...person,
        _expanded: true, // Initially expand all nodes
        _children: person.children || []
    }));
    
    // Create hierarchy
    root = d3.stratify()
        .id(d => d.id)
        .parentId(d => d.parents && d.parents[0] ? d.parents[0] : null)
        (personsArray);
    
    root.x0 = 0;
    root.y0 = 0;
}

// Initialize D3 tree
function initializeTree() {
    const container = document.getElementById('tree-container');
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    // Create SVG
    svg = d3.select('#family-tree')
        .attr('width', width)
        .attr('height', height);
    
    // Create main group for zoom/pan
    g = svg.append('g');
    
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
    
    // Center on root
    centerNode(root);
}

// Update tree layout based on orientation
function updateTreeLayout() {
    const container = document.getElementById('tree-container');
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    if (currentOrientation === 'horizontal') {
        tree = d3.tree()
            .size([height - 100, width - 300])
            .nodeSize([NODE_SPACING_Y, NODE_SPACING_X]);
    } else {
        tree = d3.tree()
            .size([width - 100, height - 300])
            .nodeSize([NODE_SPACING_X, NODE_SPACING_Y]);
    }
}

// Update tree visualization
function update(source) {
    const duration = 750;
    
    // Compute new tree layout
    const treeData = tree(root);
    const nodes = treeData.descendants();
    const links = treeData.links();
    
    // Normalize for fixed-depth
    nodes.forEach(d => {
        if (currentOrientation === 'horizontal') {
            d.y = d.depth * NODE_SPACING_X;
        } else {
            d.y = d.depth * NODE_SPACING_Y;
        }
    });
    
    // Update nodes
    const node = g.selectAll('g.node')
        .data(nodes, d => d.id || (d.id = ++i));
    
    // Enter new nodes
    const nodeEnter = node.enter().append('g')
        .attr('class', 'node node-card')
        .attr('transform', d => {
            if (currentOrientation === 'horizontal') {
                return `translate(${source.y0},${source.x0})`;
            } else {
                return `translate(${source.x0},${source.y0})`;
            }
        })
        .on('click', (event, d) => showProfile(d.data));
    
    // Add node rectangle
    nodeEnter.append('rect')
        .attr('class', 'node-rect')
        .attr('width', NODE_WIDTH)
        .attr('height', NODE_HEIGHT)
        .attr('x', -NODE_WIDTH / 2)
        .attr('y', -NODE_HEIGHT / 2)
        .attr('fill', d => d.data.gender === 'M' ? 
            'var(--node-male)' : 'var(--node-female)')
        .attr('stroke', 'var(--node-border)');
    
    // Add name text
    nodeEnter.append('text')
        .attr('class', 'node-name')
        .attr('dy', '-0.5em')
        .attr('text-anchor', 'middle')
        .text(d => {
            const name = d.data.name;
            return name.length > 20 ? name.substring(0, 18) + '...' : name;
        });
    
    // Add generation/dates text
    nodeEnter.append('text')
        .attr('class', 'node-dates')
        .attr('dy', '1em')
        .attr('text-anchor', 'middle')
        .text(d => {
            if (d.data.birth || d.data.death) {
                return `${d.data.birth || '?'} - ${d.data.death || 'Present'}`;
            }
            return `Generation ${d.data.generation}`;
        });
    
    // Add expand/collapse indicator for nodes with children
    nodeEnter.append('circle')
        .attr('class', 'expand-indicator')
        .attr('r', 8)
        .attr('cy', NODE_HEIGHT / 2 + 15)
        .attr('fill', 'rgba(255, 255, 255, 0.8)')
        .attr('stroke', 'var(--accent-color)')
        .attr('stroke-width', 2)
        .style('display', d => d.data._children.length > 0 ? 'block' : 'none')
        .on('click', (event, d) => {
            event.stopPropagation();
            toggleNode(d);
        });
    
    nodeEnter.append('text')
        .attr('class', 'expand-text')
        .attr('cy', NODE_HEIGHT / 2 + 15)
        .attr('dy', '0.35em')
        .attr('text-anchor', 'middle')
        .attr('fill', 'var(--accent-color)')
        .attr('font-size', '10px')
        .attr('font-weight', 'bold')
        .style('pointer-events', 'none')
        .style('display', d => d.data._children.length > 0 ? 'block' : 'none')
        .text(d => `+${d.data._children.length}`);
    
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
    const nodeExit = node.exit().transition()
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
        .data(links, d => d.target.id);
    
    // Enter new links
    const linkEnter = link.enter().insert('path', 'g')
        .attr('class', 'link')
        .attr('d', d => {
            const o = {x: source.x0, y: source.y0};
            return createStepPath(o, o);
        });
    
    // Update existing links
    const linkUpdate = linkEnter.merge(link);
    
    linkUpdate.transition()
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
        return `M${source.y},${source.x}
                H${(source.y + target.y) / 2}
                V${target.x}
                H${target.y}`;
    } else {
        return `M${source.x},${source.y}
                V${(source.y + target.y) / 2}
                H${target.x}
                V${target.y}`;
    }
}

// Toggle node expansion
function toggleNode(d) {
    if (d.children) {
        d._children = d.children;
        d.children = null;
    } else {
        d.children = d._children;
        d._children = null;
    }
    update(d);
}

// Center view on a specific node
function centerNode(d) {
    const scale = 0.8;
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
        includeScore: true
    });
}

// Search and display results
function performSearch(query) {
    const resultsContainer = document.getElementById('search-results');
    
    if (!query || query.trim() === '') {
        resultsContainer.innerHTML = '';
        return;
    }
    
    const results = fuse.search(query);
    
    if (results.length === 0) {
        resultsContainer.innerHTML = '<div class="no-results">No matching family members found.</div>';
        return;
    }
    
    resultsContainer.innerHTML = results.map(result => {
        const person = result.item;
        const father = person.parents && person.parents[0] ? 
            familyData.persons[person.parents[0]] : null;
        
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
    document.querySelectorAll('.search-result-item').forEach(item => {
        item.addEventListener('click', () => {
            const id = item.getAttribute('data-id');
            searchAndZoom(id);
        });
    });
}

// Teleport function - search and zoom to specific node
function searchAndZoom(id) {
    // Close search overlay
    document.getElementById('search-overlay').classList.add('hidden');
    document.getElementById('search-input').value = '';
    
    // Find the node
    const node = root.descendants().find(d => d.data.id === id);
    
    if (!node) {
        console.error('Node not found:', id);
        return;
    }
    
    // Expand path to root
    let current = node;
    while (current.parent) {
        if (!current.parent.children) {
            current.parent.children = current.parent._children;
        }
        current = current.parent;
    }
    
    // Update tree
    update(root);
    
    // Center on node with animation
    setTimeout(() => {
        centerNode(node);
        
        // Add pulse highlight
        const nodeElement = g.selectAll('g.node')
            .filter(d => d.data.id === id)
            .select('rect');
        
        nodeElement.classed('pulse-highlight', true);
        
        setTimeout(() => {
            nodeElement.classed('pulse-highlight', false);
        }, 2000);
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
    
    // Set photo
    if (person.photo) {
        photoDiv.innerHTML = `<img src="${person.photo}" alt="${person.name}">`;
    } else {
        photoDiv.innerHTML = `<i class="fas fa-user"></i>`;
    }
    
    // Set name and dates
    nameEl.textContent = person.name;
    const dates = [];
    if (person.birth) dates.push(`Born: ${person.birth}`);
    if (person.death) dates.push(`Died: ${person.death}`);
    if (dates.length === 0) dates.push(`Generation ${person.generation}`);
    datesEl.textContent = dates.join(' • ');
    
    // Set biography
    if (person.biography) {
        bioEl.innerHTML = `<p>${person.biography}</p>`;
    } else {
        bioEl.innerHTML = '<p style="opacity: 0.7;">No biography available.</p>';
    }
    
    // Set family links
    let familyHTML = '';
    
    // Parents
    if (person.parents && person.parents.length > 0) {
        familyHTML += '<div class="family-section"><h3>Parents</h3><div class="family-links">';
        person.parents.forEach(parentId => {
            const parent = familyData.persons[parentId];
            if (parent) {
                familyHTML += `<span class="family-link" data-id="${parentId}">${parent.name}</span>`;
            }
        });
        familyHTML += '</div></div>';
    }
    
    // Spouse
    const marriage = familyData.marriages.find(m => 
        m.person1Id === person.id || m.person2Id === person.id
    );
    if (marriage) {
        const spouseId = marriage.person1Id === person.id ? 
            marriage.person2Id : marriage.person1Id;
        const spouse = familyData.persons[spouseId];
        if (spouse) {
            familyHTML += '<div class="family-section"><h3>Spouse</h3><div class="family-links">';
            familyHTML += `<span class="family-link" data-id="${spouseId}">${spouse.name}</span>`;
            familyHTML += '</div></div>';
        }
    }
    
    // Children
    if (person.children && person.children.length > 0) {
        familyHTML += '<div class="family-section"><h3>Children</h3><div class="family-links">';
        person.children.forEach(childId => {
            const child = familyData.persons[childId];
            if (child) {
                familyHTML += `<span class="family-link" data-id="${childId}">${child.name}</span>`;
            }
        });
        familyHTML += '</div></div>';
    }
    
    familyEl.innerHTML = familyHTML || '<p style="opacity: 0.7;">No family connections recorded.</p>';
    
    // Add click handlers to family links
    document.querySelectorAll('.family-link').forEach(link => {
        link.addEventListener('click', () => {
            const id = link.getAttribute('data-id');
            modal.classList.add('hidden');
            setTimeout(() => searchAndZoom(id), 300);
        });
    });
    
    // Show modal
    modal.classList.remove('hidden');
}

// Initialize event listeners
function initializeEventListeners() {
    // Search FAB
    document.getElementById('search-fab').addEventListener('click', () => {
        document.getElementById('search-overlay').classList.remove('hidden');
        document.getElementById('search-input').focus();
    });
    
    // Close search
    document.getElementById('close-search').addEventListener('click', () => {
        document.getElementById('search-overlay').classList.add('hidden');
        document.getElementById('search-input').value = '';
    });
    
    // Search input
    document.getElementById('search-input').addEventListener('input', (e) => {
        performSearch(e.target.value);
    });
    
    // Close modal
    document.getElementById('close-modal').addEventListener('click', () => {
        document.getElementById('profile-modal').classList.add('hidden');
    });
    
    // Close overlay/modal on backdrop click
    document.getElementById('search-overlay').addEventListener('click', (e) => {
        if (e.target.id === 'search-overlay') {
            document.getElementById('search-overlay').classList.add('hidden');
        }
    });
    
    document.getElementById('profile-modal').addEventListener('click', (e) => {
        if (e.target.id === 'profile-modal') {
            document.getElementById('profile-modal').classList.add('hidden');
        }
    });
    
    // Zoom controls
    document.getElementById('zoom-in').addEventListener('click', () => {
        svg.transition().call(zoom.scaleBy, 1.3);
    });
    
    document.getElementById('zoom-out').addEventListener('click', () => {
        svg.transition().call(zoom.scaleBy, 0.7);
    });
    
    document.getElementById('zoom-reset').addEventListener('click', () => {
        centerNode(root);
    });
    
    // Handle window resize
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            const newOrientation = window.innerWidth > 768 ? 'horizontal' : 'vertical';
            if (newOrientation !== currentOrientation) {
                currentOrientation = newOrientation;
                updateTreeLayout();
                update(root);
                centerNode(root);
            }
        }, 250);
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.getElementById('search-overlay').classList.add('hidden');
            document.getElementById('profile-modal').classList.add('hidden');
        }
        if (e.key === '/' || (e.ctrlKey && e.key === 'f')) {
            e.preventDefault();
            document.getElementById('search-fab').click();
        }
    });
}

// Handle deep linking
function handleDeepLink() {
    const hash = window.location.hash;
    if (hash && hash.startsWith('#id=')) {
        const id = hash.substring(4);
        setTimeout(() => searchAndZoom(id), 1000);
    }
}

// Hide loading indicator
function hideLoading() {
    document.getElementById('loading').classList.add('hidden');
}

// Counter for unique IDs
let i = 0;
