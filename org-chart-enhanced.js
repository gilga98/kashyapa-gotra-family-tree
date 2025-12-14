// ============================================
// org-chart-enhanced.js - True Org Chart Layout
// ============================================
// Completely restructures the tree container layout
// to display as a proper organizational chart

'use strict';

class OrgChartEnhanced {
  constructor(treeContainerSelector, appState) {
    this.container = document.querySelector(treeContainerSelector);
    this.appState = appState;
    this.ns = 'http://www.w3.org/2000/svg';
    this.isMobile = window.innerWidth < 768;
    
    // Node sizing
    this.nodeWidth = this.isMobile ? 140 : 200;
    this.nodeHeight = 100;
    this.verticalGap = this.isMobile ? 60 : 100;
    this.horizontalGap = this.isMobile ? 30 : 50;
    
    // SVG overlay
    this.svgContainer = null;
    this.chartContainer = null;
    this.positions = new Map();
    
    this.init();
    this.setupResizeHandler();
  }

  init() {
    // Create a new container structure for org chart
    this.container.innerHTML = '';
    
    // Chart wrapper (scrollable)
    this.chartContainer = document.createElement('div');
    this.chartContainer.className = 'org-chart-wrapper';
    Object.assign(this.chartContainer.style, {
      position: 'relative',
      width: '100%',
      overflowX: 'auto',
      overflowY: 'auto',
      minHeight: '600px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-start'
    });
    
    // SVG for connection lines
    this.svgContainer = document.createElementNS(this.ns, 'svg');
    this.svgContainer.setAttribute('class', 'org-chart-lines');
    Object.assign(this.svgContainer.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: '1'
    });
    
    this.chartContainer.appendChild(this.svgContainer);
    this.container.appendChild(this.chartContainer);
  }

  setupResizeHandler() {
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        const wasMobile = this.isMobile;
        this.isMobile = window.innerWidth < 768;
        
        if (wasMobile !== this.isMobile) {
          this.nodeWidth = this.isMobile ? 140 : 200;
          this.verticalGap = this.isMobile ? 60 : 100;
          this.horizontalGap = this.isMobile ? 30 : 50;
        }
        
        // Rebuild layout on resize
        if (this.appState && this.appState.treeData) {
          this.render(this.appState.peopleMap, this.appState.treeData);
        }
      }, 300);
    });
  }

  /**
   * Main render function - restructures tree as org chart
   */
  render(peopleMap, treeData) {
    if (!treeData || !treeData.people) return;
    
    // Clear chart
    Array.from(this.chartContainer.querySelectorAll('.org-node')).forEach(n => n.remove());
    this.positions.clear();
    
    // Find root nodes
    const roots = treeData.people.filter(p => (p.generation || 1) === 1);
    
    // Calculate positions
    let maxWidth = 0;
    let maxHeight = 0;
    
    this.calculatePositions(roots, peopleMap, 0, 0);
    
    for (const [, pos] of this.positions) {
      maxWidth = Math.max(maxWidth, pos.x + this.nodeWidth);
      maxHeight = Math.max(maxHeight, pos.y + this.nodeHeight);
    }
    
    // Update SVG size
    const padding = 40;
    const totalWidth = maxWidth + padding;
    const totalHeight = maxHeight + padding;
    
    this.svgContainer.setAttribute('viewBox', `0 0 ${totalWidth} ${totalHeight}`);
    this.svgContainer.setAttribute('width', totalWidth);
    this.svgContainer.setAttribute('height', totalHeight);
    
    // Render cards in org chart positions
    this.renderCards(peopleMap);
    
    // Draw connection lines
    this.drawConnections(treeData.people, peopleMap);
  }

  /**
   * Calculate hierarchical positions for all nodes
   */
  calculatePositions(nodes, peopleMap, startX = 0, startY = 0) {
    if (!nodes || nodes.length === 0) return startX;
    
    let currentX = startX;
    
    for (const node of nodes) {
      const children = (node.children || [])
        .map(id => peopleMap.get(id))
        .filter(c => c && !this.positions.has(c.id));
      
      // Position current node
      this.positions.set(node.id, {
        x: currentX,
        y: startY,
        width: this.nodeWidth,
        height: this.nodeHeight,
        children: children
      });
      
      currentX += this.nodeWidth + this.horizontalGap;
      
      // Recursively position children
      if (children.length > 0) {
        const childWidth = children.length * (this.nodeWidth + this.horizontalGap);
        const childStartX = currentX - childWidth - this.nodeWidth - this.horizontalGap;
        
        this.calculatePositions(
          children,
          peopleMap,
          childStartX,
          startY + this.nodeHeight + this.verticalGap
        );
      }
    }
    
    return currentX;
  }

  /**
   * Render DOM cards at calculated positions
   */
  renderCards(peopleMap) {
    for (const [personId, pos] of this.positions) {
      const person = peopleMap.get(personId);
      if (!person) continue;
      
      // Create card wrapper with absolute positioning
      const nodeDiv = document.createElement('div');
      nodeDiv.className = 'org-node';
      nodeDiv.setAttribute('data-person-id', personId);
      
      Object.assign(nodeDiv.style, {
        position: 'absolute',
        left: pos.x + 'px',
        top: pos.y + 'px',
        width: this.nodeWidth + 'px',
        height: 'auto',
        zIndex: '10',
        display: 'flex',
        justifyContent: 'center'
      });
      
      // Create card content
      const card = this.createCard(person);
      nodeDiv.appendChild(card);
      
      this.chartContainer.appendChild(nodeDiv);
      
      // Store for later reference
      pos.element = nodeDiv;
      pos.personId = personId;
    }
  }

  /**
   * Create a person card
   */
  createCard(person) {
    const card = document.createElement('div');
    card.className = 'org-person-card';
    
    Object.assign(card.style, {
      width: '100%',
      background: 'rgba(255, 255, 255, 0.12)',
      border: '2px solid rgba(255, 255, 255, 0.2)',
      borderRadius: '12px',
      padding: '8px',
      textAlign: 'center',
      cursor: 'pointer',
      transition: 'all 200ms ease',
      boxSizing: 'border-box'
    });
    
    // Avatar
    const avatar = document.createElement('div');
    Object.assign(avatar.style, {
      width: '40px',
      height: '40px',
      borderRadius: '50%',
      background: 'rgba(255, 255, 255, 0.15)',
      border: '2px solid rgba(255, 255, 255, 0.25)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '1.2rem',
      margin: '0 auto 4px',
      fontWeight: 'bold'
    });
    
    avatar.textContent = person.gender === 'male' ? '♂' : 
                        person.gender === 'female' ? '♀' : '•';
    
    // Name
    const name = document.createElement('div');
    name.style.fontSize = '0.8rem';
    name.style.fontWeight = '700';
    name.style.marginBottom = '2px';
    name.style.color = '#fff';
    name.textContent = (person.name || 'Unknown').substring(0, 20);
    
    // Children count
    const childCount = (person.children || []).length;
    const children = document.createElement('div');
    children.style.fontSize = '0.7rem';
    children.style.color = 'rgba(255,255,255,0.7)';
    children.textContent = childCount ? `${childCount} child${childCount > 1 ? 'ren' : ''}` : '—';
    
    card.appendChild(avatar);
    card.appendChild(name);
    card.appendChild(children);
    
    // Click to show details
    card.addEventListener('click', () => {
      if (window.showDetails) {
        window.showDetails(person.id);
      }
    });
    
    // Hover effect
    card.addEventListener('mouseenter', () => {
      card.style.background = 'rgba(255, 255, 255, 0.18)';
      card.style.borderColor = 'rgba(255, 255, 255, 0.4)';
      card.style.transform = 'scale(1.05)';
      card.style.boxShadow = '0 0 20px rgba(255, 215, 0, 0.2)';
    });
    
    card.addEventListener('mouseleave', () => {
      card.style.background = 'rgba(255, 255, 255, 0.12)';
      card.style.borderColor = 'rgba(255, 255, 255, 0.2)';
      card.style.transform = 'scale(1)';
      card.style.boxShadow = 'none';
    });
    
    return card;
  }

  /**
   * Draw L-shaped connection lines
   */
  drawConnections(allPeople, peopleMap) {
    // Clear existing paths
    Array.from(this.svgContainer.querySelectorAll('path')).forEach(p => p.remove());
    
    const drawnLines = new Set();
    
    for (const person of allPeople) {
      const parentPos = this.positions.get(person.id);
      if (!parentPos) continue;
      
      const children = (person.children || [])
        .map(id => peopleMap.get(id))
        .filter(Boolean);
      
      if (children.length === 0) continue;
      
      for (const child of children) {
        const childPos = this.positions.get(child.id);
        if (!childPos) continue;
        
        const key = `${person.id}__${child.id}`;
        if (drawnLines.has(key)) continue;
        drawnLines.add(key);
        
        // Calculate line path (L-shaped)
        const parentCenterX = parentPos.x + this.nodeWidth / 2;
        const parentBottomY = parentPos.y + this.nodeHeight;
        
        const childCenterX = childPos.x + this.nodeWidth / 2;
        const childTopY = childPos.y;
        
        const midY = parentBottomY + (childTopY - parentBottomY) / 2;
        
        const path = document.createElementNS(this.ns, 'path');
        const d = `
          M ${parentCenterX} ${parentBottomY}
          L ${parentCenterX} ${midY}
          L ${childCenterX} ${midY}
          L ${childCenterX} ${childTopY}
        `;
        
        path.setAttribute('d', d);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'rgba(255, 255, 255, 0.3)');
        path.setAttribute('stroke-width', this.isMobile ? '1' : '1.5');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');
        
        path.style.cursor = 'pointer';
        path.style.transition = 'stroke 200ms ease';
        
        // Hover effect
        path.addEventListener('mouseenter', () => {
          path.setAttribute('stroke', 'rgba(255, 215, 0, 0.6)');
          
          // Highlight nodes
          const pNode = this.chartContainer.querySelector(`[data-person-id="${person.id}"]`);
          const cNode = this.chartContainer.querySelector(`[data-person-id="${child.id}"]`);
          
          if (pNode) pNode.classList.add('org-node-highlight');
          if (cNode) cNode.classList.add('org-node-highlight');
        });
        
        path.addEventListener('mouseleave', () => {
          path.setAttribute('stroke', 'rgba(255, 255, 255, 0.3)');
          
          const pNode = this.chartContainer.querySelector(`[data-person-id="${person.id}"]`);
          const cNode = this.chartContainer.querySelector(`[data-person-id="${child.id}"]`);
          
          if (pNode) pNode.classList.remove('org-node-highlight');
          if (cNode) cNode.classList.remove('org-node-highlight');
        });
        
        this.svgContainer.appendChild(path);
      }
    }
  }

  /**
   * Public API
   */
  updateChart(peopleMap, treeData) {
    this.appState = { peopleMap, treeData };
    this.render(peopleMap, treeData);
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = OrgChartEnhanced;
}