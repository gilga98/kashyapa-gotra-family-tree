// ============================================
// connector.js - SVG Family Tree Connectors
// ============================================
// Renders parent-child and spouse relationships as SVG lines
// Handles responsive sizing and mobile optimization

'use strict';

class TreeConnector {
  constructor(treeContainerSelector) {
    this.container = document.querySelector(treeContainerSelector);
    this.svgElement = null;
    this.ns = 'http://www.w3.org/2000/svg';
    this.isMobile = window.innerWidth < 768;
    
    // Config
    this.lineColor = 'rgba(255, 255, 255, 0.35)';
    this.lineColorHover = 'rgba(255, 255, 255, 0.7)';
    this.lineWidth = this.isMobile ? 1.5 : 2;
    this.lineWidthHover = this.isMobile ? 2 : 2.5;
    this.markerSize = this.isMobile ? 4 : 6;
    
    // Cache
    this.cardPositions = new Map(); // personId -> { element, rect, unitId }
    this.highlightedPaths = new Set();
    
    this.init();
    this.setupResizeHandler();
  }

  init() {
    // Create SVG overlay
    if (this.svgElement) this.svgElement.remove();
    
    this.svgElement = document.createElementNS(this.ns, 'svg');
    this.svgElement.setAttribute('class', 'tree-connectors');
    this.svgElement.setAttribute('aria-label', 'Family tree connections');
    
    // Position absolutely over container
    Object.assign(this.svgElement.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: '1'
    });
    
    // Add marker for arrow heads
    const defs = document.createElementNS(this.ns, 'defs');
    const marker = document.createElementNS(this.ns, 'marker');
    marker.setAttribute('id', 'arrowhead');
    marker.setAttribute('markerWidth', this.markerSize);
    marker.setAttribute('markerHeight', this.markerSize);
    marker.setAttribute('refX', this.markerSize / 2);
    marker.setAttribute('refY', this.markerSize / 2);
    marker.setAttribute('orient', 'auto');
    
    const polygon = document.createElementNS(this.ns, 'polygon');
    polygon.setAttribute('points', `0 0, ${this.markerSize} ${this.markerSize / 2}, 0 ${this.markerSize}`);
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
        
        // Reinit if crossing mobile threshold
        if (wasMobile !== this.isMobile) {
          this.lineWidth = this.isMobile ? 1.5 : 2;
          this.lineWidthHover = this.isMobile ? 2 : 2.5;
          this.markerSize = this.isMobile ? 4 : 6;
          this.init();
        }
        
        this.render();
      }, 250);
    });
  }

  /**
   * Index all person cards by their ID
   * Called after DOM rendering
   */
  indexCards(peopleMap) {
    this.cardPositions.clear();
    
    // Find all person cards
    const cards = this.container.querySelectorAll('[data-person-id]');
    
    for (const card of cards) {
      const personId = card.getAttribute('data-person-id');
      if (personId) {
        this.cardPositions.set(personId, {
          element: card,
          rect: null // Will be calculated when rendering
        });
      }
    }
  }

  /**
   * Main render function - draws all connectors
   * Call after indexCards() and when data changes
   */
  render() {
    // Clear existing paths (keep defs)
    const paths = this.svgElement.querySelectorAll('path');
    paths.forEach(p => p.remove());
    
    // Update container size
    const rect = this.container.getBoundingClientRect();
    this.svgElement.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);
    this.svgElement.setAttribute('width', rect.width);
    this.svgElement.setAttribute('height', rect.height);
    
    // Draw all connectors
    this.drawSpouseConnectors();
    this.drawParentChildConnectors();
  }

  /**
   * Draw horizontal lines between spouses
   */
  drawSpouseConnectors() {
    const drawnPairs = new Set();
    
    for (const [personId, cardInfo] of this.cardPositions) {
      const card = cardInfo.element;
      const person = this.getPerson(personId);
      
      if (!person || !person.spouses || person.spouses.length === 0) continue;
      
      for (const spouseId of person.spouses) {
        if (!this.cardPositions.has(spouseId)) continue;
        
        // Create unique pair key
        const key = [personId, spouseId].sort().join('__');
        if (drawnPairs.has(key)) continue;
        drawnPairs.add(key);
        
        const spouseCard = this.cardPositions.get(spouseId).element;
        const pos1 = this.getCardCenterPosition(card);
        const pos2 = this.getCardCenterPosition(spouseCard);
        
        if (pos1 && pos2) {
          const path = this.createPath(pos1, pos2, 'spouse');
          path.setAttribute('data-person-a', personId);
          path.setAttribute('data-person-b', spouseId);
          this.svgElement.appendChild(path);
        }
      }
    }
  }

  /**
   * Draw vertical lines from parents to children
   */
  drawParentChildConnectors() {
    const drawnLines = new Set();
    
    for (const [childId, childCardInfo] of this.cardPositions) {
      const childCard = childCardInfo.element;
      const child = this.getPerson(childId);
      
      if (!child || !child.parents || child.parents.length === 0) continue;
      
      const childPos = this.getCardCenterPosition(childCard);
      if (!childPos) continue;
      
      for (const parentId of child.parents) {
        if (!this.cardPositions.has(parentId)) continue;
        
        const key = `${parentId}__${childId}`;
        if (drawnLines.has(key)) continue;
        drawnLines.add(key);
        
        const parentCard = this.cardPositions.get(parentId).element;
        const parentPos = this.getCardCenterPosition(parentCard);
        
        if (parentPos) {
          const path = this.createPath(parentPos, childPos, 'parent-child');
          path.setAttribute('data-parent', parentId);
          path.setAttribute('data-child', childId);
          this.svgElement.appendChild(path);
        }
      }
    }
  }

  /**
   * Create SVG path element with curves
   * type: 'spouse' | 'parent-child'
   */
  createPath(from, to, type) {
    const path = document.createElementNS(this.ns, 'path');
    
    let d;
    if (type === 'spouse') {
      // Horizontal line with slight curve
      const mid = (from.x + to.x) / 2;
      d = `M ${from.x} ${from.y} Q ${mid} ${from.y - 20} ${to.x} ${to.y}`;
    } else {
      // Vertical line with curve for parent-child
      const mid = (from.y + to.y) / 2;
      d = `M ${from.x} ${from.y} Q ${from.x} ${mid} ${to.x} ${to.y}`;
    }
    
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', this.lineColor);
    path.setAttribute('stroke-width', this.lineWidth);
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    
    if (type === 'parent-child') {
      path.setAttribute('marker-end', 'url(#arrowhead)');
    }
    
    // Add hover effect
    path.style.cursor = 'pointer';
    path.style.transition = `stroke ${300}ms ease, stroke-width ${300}ms ease`;
    
    path.addEventListener('mouseenter', () => this.highlightPath(path, true));
    path.addEventListener('mouseleave', () => this.highlightPath(path, false));
    
    return path;
  }

  /**
   * Highlight path and related cards on hover
   */
  highlightPath(path, isHovering) {
    if (isHovering) {
      path.setAttribute('stroke', this.lineColorHover);
      path.setAttribute('stroke-width', this.lineWidthHover);
      
      // Highlight related person cards
      const personA = path.getAttribute('data-person-a');
      const personB = path.getAttribute('data-person-b');
      const parent = path.getAttribute('data-parent');
      const child = path.getAttribute('data-child');
      
      [personA, personB, parent, child].forEach(id => {
        if (id && this.cardPositions.has(id)) {
          const card = this.cardPositions.get(id).element;
          card.classList.add('connection-highlight');
        }
      });
    } else {
      path.setAttribute('stroke', this.lineColor);
      path.setAttribute('stroke-width', this.lineWidth);
      
      const personA = path.getAttribute('data-person-a');
      const personB = path.getAttribute('data-person-b');
      const parent = path.getAttribute('data-parent');
      const child = path.getAttribute('data-child');
      
      [personA, personB, parent, child].forEach(id => {
        if (id && this.cardPositions.has(id)) {
          const card = this.cardPositions.get(id).element;
          card.classList.remove('connection-highlight');
        }
      });
    }
  }

  /**
   * Get center position of card element in SVG coordinates
   */
  getCardCenterPosition(cardElement) {
    if (!cardElement) return null;
    
    const rect = cardElement.getBoundingClientRect();
    const containerRect = this.container.getBoundingClientRect();
    
    return {
      x: rect.left - containerRect.left + rect.width / 2,
      y: rect.top - containerRect.top + rect.height / 2
    };
  }

  /**
   * Get person object from global peopleMap
   * Assumes app.js exposes peopleMap
   */
  getPerson(personId) {
    // Access from global scope (app.js)
    if (typeof window.peopleMap !== 'undefined') {
      return window.peopleMap.get(personId);
    }
    return null;
  }

  /**
   * Public API: Update connectors when tree is filtered/searched
   */
  updateConnectors(peopleMap) {
    // Store for later access
    window.peopleMap = peopleMap;
    this.indexCards(peopleMap);
    this.render();
  }
}

// Export for use in app.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TreeConnector;
}