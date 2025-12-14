// org-chart.js - Pure organizational chart layout engine
// No dependencies, works with any family tree data

class OrgChart {
  constructor(treeData) {
    this.treeData = treeData;
    this.peopleMap = new Map();
    this.positions = new Map();
    
    // Configuration
    this.nodeWidth = window.innerWidth < 768 ? 140 : 200;
    this.nodeHeight = 100;
    this.verticalGap = window.innerWidth < 768 ? 60 : 100;
    this.horizontalGap = window.innerWidth < 768 ? 30 : 50;
    
    this.init();
  }

  init() {
    // Build people map
    if (this.treeData && this.treeData.people) {
      for (const person of this.treeData.people) {
        this.peopleMap.set(person.id, person);
      }
    }
  }

  /**
   * Calculate positions for all people in hierarchical layout
   */
  calculatePositions() {
    this.positions.clear();
    
    if (!this.treeData || !this.treeData.people) return;

    // Find root nodes (Generation 1)
    const roots = this.treeData.people.filter(p => (p.generation || 1) === 1);
    
    if (roots.length === 0) return;

    // Calculate positions recursively
    let maxX = 0;
    let currentX = 0;
    
    for (const root of roots) {
      currentX = this.positionNode(root, currentX, 0);
      currentX += this.nodeWidth + this.horizontalGap;
    }
  }

  /**
   * Position a node and all its descendants
   */
  positionNode(person, x, y) {
    if (this.positions.has(person.id)) return x;

    // Get children
    const children = (person.children || [])
      .map(id => this.peopleMap.get(id))
      .filter(c => c && !this.positions.has(c.id));

    let nodeX = x;
    let childStartX = x;

    // If has children, position them first to center under parent
    if (children.length > 0) {
      let childWidth = 0;
      for (const child of children) {
        childWidth += this.nodeWidth + this.horizontalGap;
      }
      childWidth -= this.horizontalGap;

      // Center children under parent
      childStartX = x - (childWidth - this.nodeWidth) / 2;
      
      // Position children
      let currentChildX = childStartX;
      for (const child of children) {
        currentChildX = this.positionNode(
          child, 
          currentChildX, 
          y + this.nodeHeight + this.verticalGap
        );
        currentChildX += this.nodeWidth + this.horizontalGap;
      }

      nodeX = x;
    }

    // Store position
    this.positions.set(person.id, {
      x: nodeX,
      y: y,
      person: person,
      children: children
    });

    return x + this.nodeWidth + this.horizontalGap;
  }

  /**
   * Render the org chart
   */
  render() {
    this.calculatePositions();
    
    const wrapper = document.getElementById('treeWrapper');
    const container = document.getElementById('nodesContainer');
    const svg = document.getElementById('chartSvg');
    
    if (!wrapper || !container) return;

    // Clear previous nodes
    container.innerHTML = '';
    svg.innerHTML = '';

    if (this.positions.size === 0) return;

    // Calculate SVG dimensions
    let maxX = 0, maxY = 0;
    for (const [, pos] of this.positions) {
      maxX = Math.max(maxX, pos.x + this.nodeWidth);
      maxY = Math.max(maxY, pos.y + this.nodeHeight);
    }

    const padding = 40;
    const totalWidth = maxX + padding;
    const totalHeight = maxY + padding;

    svg.setAttribute('viewBox', `0 0 ${totalWidth} ${totalHeight}`);
    svg.setAttribute('width', totalWidth);
    svg.setAttribute('height', totalHeight);

    // Render nodes
    for (const [personId, pos] of this.positions) {
      this.renderNode(personId, pos, container);
    }

    // Draw connection lines
    this.drawConnections(svg);
  }

  /**
   * Render a single node
   */
  renderNode(personId, pos, container) {
    const person = this.peopleMap.get(personId);
    if (!person) return;

    const nodeDiv = document.createElement('div');
    nodeDiv.className = 'node';
    nodeDiv.setAttribute('data-id', personId);
    nodeDiv.style.left = pos.x + 'px';
    nodeDiv.style.top = pos.y + 'px';

    const card = document.createElement('div');
    card.className = 'card';
    card.setAttribute('data-name', person.name || 'Unknown');

    // Avatar
    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = person.gender === 'male' ? '♂' : 
                        person.gender === 'female' ? '♀' : '•';

    // Name
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = (person.name || 'Unknown').substring(0, 20);

    // Children count
    const childCount = (person.children || []).length;
    const children = document.createElement('div');
    children.className = 'children-count';
    children.textContent = childCount ? `${childCount} child${childCount > 1 ? 'ren' : ''}` : '—';

    card.appendChild(avatar);
    card.appendChild(name);
    card.appendChild(children);

    // Hover effect
    card.addEventListener('mouseenter', () => {
      card.classList.add('highlight');
    });

    card.addEventListener('mouseleave', () => {
      card.classList.remove('highlight');
    });

    nodeDiv.appendChild(card);
    container.appendChild(nodeDiv);
  }

  /**
   * Draw L-shaped connection lines
   */
  drawConnections(svg) {
    const drawnLines = new Set();

    for (const [personId, pos] of this.positions) {
      const children = (this.treeData?.people || [])
        .find(p => p.id === personId)?.children || [];

      if (children.length === 0) continue;

      for (const childId of children) {
        const childPos = this.positions.get(childId);
        if (!childPos) continue;

        const key = `${personId}__${childId}`;
        if (drawnLines.has(key)) continue;
        drawnLines.add(key);

        // Calculate path
        const parentX = pos.x + this.nodeWidth / 2;
        const parentY = pos.y + this.nodeHeight;
        const childX = childPos.x + this.nodeWidth / 2;
        const childY = childPos.y;
        const midY = parentY + (childY - parentY) / 2;

        // Create path
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const d = `
          M ${parentX} ${parentY}
          L ${parentX} ${midY}
          L ${childX} ${midY}
          L ${childX} ${childY}
        `;

        path.setAttribute('d', d);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'rgba(255, 255, 255, 0.3)');
        path.setAttribute('stroke-width', window.innerWidth < 768 ? '1' : '1.5');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');

        // Hover effect
        path.addEventListener('mouseenter', () => {
          path.setAttribute('stroke', 'rgba(255, 215, 0, 0.6)');
          
          const parentNode = document.querySelector(`[data-id="${personId}"] .card`);
          const childNode = document.querySelector(`[data-id="${childId}"] .card`);
          
          if (parentNode) parentNode.classList.add('highlight');
          if (childNode) childNode.classList.add('highlight');
        });

        path.addEventListener('mouseleave', () => {
          path.setAttribute('stroke', 'rgba(255, 255, 255, 0.3)');
          
          const parentNode = document.querySelector(`[data-id="${personId}"] .card`);
          const childNode = document.querySelector(`[data-id="${childId}"] .card`);
          
          if (parentNode) parentNode.classList.remove('highlight');
          if (childNode) childNode.classList.remove('highlight');
        });

        svg.appendChild(path);
      }
    }
  }
}

// Global instance
let orgChart = null;

/**
 * Initialize org chart with data
 */
function initChart(treeData) {
  orgChart = new OrgChart(treeData);
  orgChart.render();
}

/**
 * Reset view to show all
 */
function resetView() {
  if (orgChart) {
    orgChart.render();
  }
}

/**
 * Expand all nodes
 */
function expandAll() {
  const cards = document.querySelectorAll('.card');
  cards.forEach(card => {
    card.style.transform = 'scale(1.05)';
  });
}

/**
 * Search function
 */
function searchPeople(query) {
  const cards = document.querySelectorAll('.card');
  const lowerQuery = query.toLowerCase();

  cards.forEach(card => {
    const name = card.getAttribute('data-name') || '';
    if (name.toLowerCase().includes(lowerQuery)) {
      card.style.opacity = '1';
      card.parentElement.style.opacity = '1';
    } else {
      card.style.opacity = '0.3';
      card.parentElement.style.opacity = '0.3';
    }
  });

  if (query === '') {
    cards.forEach(card => {
      card.style.opacity = '1';
      card.parentElement.style.opacity = '1';
    });
  }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchPeople(e.target.value);
    });
  }

  // Load and render tree
  if (typeof FAMILY_TREE_DATA !== 'undefined') {
    initChart(FAMILY_TREE_DATA);
  }
});

// Handle resize
window.addEventListener('resize', () => {
  if (orgChart) {
    orgChart.nodeWidth = window.innerWidth < 768 ? 140 : 200;
    orgChart.verticalGap = window.innerWidth < 768 ? 60 : 100;
    orgChart.horizontalGap = window.innerWidth < 768 ? 30 : 50;
    orgChart.render();
  }
});