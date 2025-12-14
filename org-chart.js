// ============================================
// org-chart.js - Hierarchical Family Tree Layout
// ============================================
// Renders family tree as proper organizational chart
// with hierarchical positioning and connection lines

'use strict';

class OrgChartLayout {
  constructor(treeContainerSelector) {
    this.container = document.querySelector(treeContainerSelector);
    this.svgElement = null;
    this.ns = 'http://www.w3.org/2000/svg';
    this.isMobile = window.innerWidth < 768;
    
    // Chart dimensions and spacing
    this.nodeWidth = this.isMobile ? 160 : 220;
    this.nodeHeight = 120;
    this.verticalGap = this.isMobile ? 80 : 120;
    this.horizontalGap = this.isMobile ? 40 : 60;
    
    // Configuration
    this.lineColor = 'rgba(255, 255, 255, 0.35)';
    this.lineColorHover = 'rgba(255, 255, 255, 0.7)';
    this.lineWidth = this.isMobile ? 1.5 : 2;
    
    // Cache
    this.positions = new Map(); // personId -> {x, y, width, height}
    this.rootNodes = [];
    
    this.init();
    this.setupResizeHandler();
  }

  init() {
    if (this.svgElement) this.svgElement.remove();
    
    this.svgElement = document.createElementNS(this.ns, 'svg');
    this.svgElement.setAttribute('class', 'org-chart-svg');
    this.svgElement.setAttribute('aria-label', 'Organizational family tree chart');
    
    // Full viewport SVG
    Object.assign(this.svgElement.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: '0'
    });
    
    // Add defs for markers
    const defs = document.createElementNS(this.ns, 'defs');
    
    const marker = document.createElementNS(this.ns, 'marker');
    marker.setAttribute('id', 'arrowhead-org');
    marker.setAttribute('markerWidth', '10');
    marker.setAttribute('markerHeight', '10');
    marker.setAttribute('refX', '5');
    marker.setAttribute('refY', '5');
    marker.setAttribute('orient', 'auto');
    
    const polygon = document.createElementNS(this.ns, 'polygon');
    polygon.setAttribute('points', '0 0, 10 5, 0 10');
    polygon.setAttribute('fill', this.lineColor);
    
    marker.appendChild(polygon);
    defs.appendChild(marker);
    this.svgElement.appendChild(defs);
    
    this.container.style.position = 'relative';
    this.container.appendChild(this.svgElement);
  }

  setupResizeHandler() {
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        const wasMobile = this.isMobile;
        this.isMobile = window.innerWidth < 768;
        
        if (wasMobile !== this.isMobile) {
          this.nodeWidth = this.isMobile ? 160 : 220;
          this.verticalGap = this.isMobile ? 80 : 120;
          this.horizontalGap = this.isMobile ? 40 : 60;
          this.init();
        }
        
        this.render();
      }, 250);
    });
  }

  /**
   * Main render function
   * Expects DOM to already have cards with data-person-id
   */
  render(peopleMap, treeData) {
    if (!treeData || !treeData.people || treeData.people.length === 0) return;
    
    // Clear existing paths
    const paths = this.svgElement.querySelectorAll('path');
    paths.forEach(p => p.remove());
    
    // Find root nodes (generation 1)
    const roots = treeData.people.filter(p => (p.generation || 1) === 1);
    
    // Calculate positions for all nodes
    this.positions.clear();
    this.calculatePositions(roots, treeData.people, peopleMap);
    
    // Update SVG dimensions
    const maxY = Math.max(...Array.from(this.positions.values()).map(p => p.y + this.nodeHeight));
    const maxX = Math.max(...Array.from(this.positions.values()).map(p => p.x + this.nodeWidth));
    
    const padding = 40;
    const totalWidth = maxX + padding * 2;
    const totalHeight = maxY + padding * 2;
    
    const rect = this.container.getBoundingClientRect();
    this.svgElement.setAttribute('viewBox', `0 0 ${totalWidth} ${totalHeight}`);
    this.svgElement.setAttribute('width', rect.width);
    this.svgElement.setAttribute('height', totalHeight);
    
    // Reposition cards based on calculated positions
    this.repositionCards(peopleMap);
    
    // Draw connection lines
    this.drawConnections(treeData.people, peopleMap);
  }

  /**
   * Calculate hierarchical positions using tree layout algorithm
   */
  calculatePositions(roots, allPeople, peopleMap, x = 0, y = 0, parentX = null) {
    if (!roots || roots.length === 0) return;
    
    let currentX = x;
    
    for (const person of roots) {
      // Get children
      const childIds = person.children || [];
      const children = childIds
        .map(id => peopleMap.get(id))
        .filter(child => child && !this.positions.has(child.id));
      
      // Position current node
      const nodeX = currentX;
      const nodeY = y;
      
      this.positions.set(person.id, {
        x: nodeX,
        y: nodeY,
        width: this.nodeWidth,
        height: this.nodeHeight,
        person: person
      });
      
      // Move to next sibling position
      currentX += this.nodeWidth + this.horizontalGap;
      
      // Recursively position children
      if (children.length > 0) {
        const childStartX = nodeX - ((children.length - 1) * (this.nodeWidth + this.horizontalGap)) / 2;
        this.calculatePositions(children, allPeople, peopleMap, childStartX, nodeY + this.nodeHeight + this.verticalGap);
      }
    }
  }

  /**
   * Reposition DOM cards to match calculated positions
   */
  repositionCards(peopleMap) {
    const cards = this.container.querySelectorAll('[data-person-id]');
    
    for (const card of cards) {
      const personId = card.getAttribute('data-person-id');
      const pos = this.positions.get(personId);
      
      if (pos) {
        Object.assign(card.style, {
          position: 'absolute',
          left: pos.x + 'px',
          top: pos.y + 'px',
          zIndex: '10'
        });
        
        // Store position for connector drawing
        card.dataset.x = pos.x + pos.width / 2;
        card.dataset.y = pos.y + pos.height / 2;
      }
    }
  }

  /**
   * Draw connection lines between parent and child nodes
   */
  drawConnections(allPeople, peopleMap) {
    const drawnLines = new Set();
    
    for (const person of allPeople) {
      const parentPos = this.positions.get(person.id);
      if (!parentPos) continue;
      
      const children = (person.children || [])
        .map(id => peopleMap.get(id))
        .filter(Boolean);
      
      if (children.length === 0) continue;
      
      // Draw connection from parent down
      const parentCenterX = parentPos.x + this.nodeWidth / 2;
      const parentBottomY = parentPos.y + this.nodeHeight;
      
      for (const child of children) {
        const childPos = this.positions.get(child.id);
        if (!childPos) continue;
        
        const key = `${person.id}__${child.id}`;
        if (drawnLines.has(key)) continue;
        drawnLines.add(key);
        
        const childCenterX = childPos.x + this.nodeWidth / 2;
        const childTopY = childPos.y;
        
        // Draw vertical line down, then horizontal, then vertical up
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
        path.setAttribute('stroke', this.lineColor);
        path.setAttribute('stroke-width', this.lineWidth);
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');
        
        path.style.cursor = 'pointer';
        path.style.transition = `stroke ${300}ms ease`;
        
        // Hover effect
        path.addEventListener('mouseenter', () => {
          path.setAttribute('stroke', this.lineColorHover);
          path.setAttribute('stroke-width', this.lineWidth + 0.5);
          
          // Highlight related cards
          const pCard = this.container.querySelector(`[data-person-id="${person.id}"]`);
          const cCard = this.container.querySelector(`[data-person-id="${child.id}"]`);
          
          if (pCard) pCard.classList.add('org-highlight');
          if (cCard) cCard.classList.add('org-highlight');
        });
        
        path.addEventListener('mouseleave', () => {
          path.setAttribute('stroke', this.lineColor);
          path.setAttribute('stroke-width', this.lineWidth);
          
          const pCard = this.container.querySelector(`[data-person-id="${person.id}"]`);
          const cCard = this.container.querySelector(`[data-person-id="${child.id}"]`);
          
          if (pCard) pCard.classList.remove('org-highlight');
          if (cCard) cCard.classList.remove('org-highlight');
        });
        
        this.svgElement.appendChild(path);
      }
    }
  }

  /**
   * Public API: Update chart layout
   */
  updateChart(peopleMap, treeData) {
    if (typeof window.peopleMap !== 'undefined') {
      window.peopleMap = peopleMap;
    }
    this.render(peopleMap, treeData);
  }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = OrgChartLayout;
}