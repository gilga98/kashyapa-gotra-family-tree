let chart;

// Load Data
fetch('family-tree.json')
  .then(response => response.json())
  .then(data => {
    const persons = data.persons;
    const marriages = data.marriages || [];
    
    // 1. Build Spouse Map from the verified 'marriages' array
    const spouseMap = {};
    marriages.forEach(m => {
      spouseMap[m.person1Id] = m.person2Id;
      spouseMap[m.person2Id] = m.person1Id;
    });

    // 2. Prepare Nodes for D3
    // We only render nodes for people who are in the lineage (have parents in tree OR are root)
    const nodes = [];
    const lineageIds = new Set();
    
    // Identify lineage members
    Object.values(persons).forEach(p => {
      // If they have parents listed, or if they are the root ancestor (Gen 1)
      if ((p.parents && p.parents.length > 0) || p.generation === 1) {
        lineageIds.add(p.id);
      }
    });
    
    Object.values(persons).forEach(p => {
      // Skip if they are purely a spouse (not in lineage) to avoid duplicate nodes
      if (!lineageIds.has(p.id)) return;
      
      let spouseId = spouseMap[p.id];
      let spouseData = null;
      if (spouseId && persons[spouseId]) {
        spouseData = persons[spouseId];
      }

      nodes.push({
        id: p.id,
        parentId: (p.parents && p.parents.length > 0) ? p.parents[0] : '',
        name: p.name,
        gender: p.gender,
        generation: p.generation,
        spouse: spouseData
      });
    });

    // 3. Render Chart
    chart = new d3.OrgChart()
      .container('#chart-container')
      .data(nodes)
      .nodeHeight(d => 90)
      .nodeWidth(d => d.data.spouse ? 280 : 150)
      .childrenMargin(d => 50)
      .compactMarginBetween(d => 30)
      .compactMarginPair(d => 15)
      // .neightbourMargin(...) <--- REMOVED: This caused your error
      .backgroundColor('#0f172a')
      .nodeContent(function (d) {
        const p = d.data;
        const s = p.spouse;
        
        const pIcon = p.gender === 'M' ? 
          '<i class="fa-solid fa-user m-icon icon"></i>' : 
          '<i class="fa-solid fa-user f-icon icon"></i>';
        
        let html = `
          <div class="node-card" style="width: ${s ? '260px' : '130px'}">
            <div class="couple-row">
              <div class="person-box">
                ${pIcon}
                <div class="name">${p.name}</div>
                <div class="gen">Gen ${p.generation}</div>
              </div>`;
            
        if (s) {
          const sIcon = s.gender === 'M' ? 
            '<i class="fa-solid fa-user m-icon icon"></i>' : 
            '<i class="fa-solid fa-user f-icon icon"></i>';
            
          html += `
              <i class="fa-solid fa-heart heart-icon"></i>
              <div class="person-box">
                ${sIcon}
                <div class="name">${s.name}</div>
                <div class="gen">Spouse</div>
              </div>`;
        }
        
        html += `
            </div>
          </div>`;
          
        return html;
      })
      .render();
      
    // Initial view settings
    chart.expandAll();
    chart.fit();
  })
  .catch(err => console.error("Error loading JSON:", err));

// Toolbar Functions
document.getElementById('searchInput').addEventListener('input', (e) => {
  const val = e.target.value;
  if (!val) {
    chart.clearHighlighting();
    return;
  }
  const data = chart.data();
  const found = data.filter(d => 
    d.name.toLowerCase().includes(val.toLowerCase()) || 
    (d.spouse && d.spouse.name.toLowerCase().includes(val.toLowerCase()))
  );
  
  chart.clearHighlighting();
  found.forEach(f => chart.setHighlighted(f.id).render());
  
  if (found.length === 1) {
    chart.setUpToTheRootHighlighted(found[0].id).render().fit();
  }
});

document.getElementById('expandBtn').addEventListener('click', () => chart.expandAll());
document.getElementById('fitBtn').addEventListener('click', () => chart.fit());
document.getElementById('downloadBtn').addEventListener('click', () => chart.exportImg({full: true}));
