(function() {
  'use strict';

  const state = {
    sessionId: null,
    sheets: {},
    currentSheet: null,
    charts: [],
    pathNodes: [],
    pathEdges: [],
    ahpCriteria: [],
    ahpAlternatives: [],
    ahpMatrix: [],
    ahpAltMatrices: [],
    currentTheme: 'dark'
  };

  const DOM = {};
  const API = '/api';

  function el(id) { return document.getElementById(id); }

  function init() {
    DOM.dropZone = el('dropZone');
    DOM.fileInput = el('fileInput');
    DOM.fileInfo = el('fileInfo');
    DOM.fileName = el('fileName');
    DOM.removeFile = el('removeFile');
    DOM.sheetTabs = el('sheetTabs');
    DOM.dataPreview = el('dataPreview');
    DOM.rowCount = el('rowCount');
    DOM.methodSelect = el('methodSelect');
    DOM.configFields = el('configFields');
    DOM.runAnalysis = el('runAnalysis');
    DOM.resultsArea = el('resultsArea');
    DOM.resultsContent = el('resultsContent');
    DOM.dashboard = el('dashboard');
    DOM.loadingOverlay = el('loadingOverlay');
    DOM.statusBadge = el('statusBadge');
    DOM.themeToggle = el('themeToggle');
    DOM.exportExcelBtn = el('exportExcelBtn');
    DOM.printReportBtn = el('printReportBtn');
    DOM.uploadSection = el('uploadSection');

    DOM.dropZone.addEventListener('click', () => DOM.fileInput.click());
    DOM.dropZone.addEventListener('dragover', (e) => { e.preventDefault(); DOM.dropZone.classList.add('dragover'); });
    DOM.dropZone.addEventListener('dragleave', () => DOM.dropZone.classList.remove('dragover'));
    DOM.dropZone.addEventListener('drop', (e) => { e.preventDefault(); DOM.dropZone.classList.remove('dragover'); if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]); });
    DOM.fileInput.addEventListener('change', () => { if (DOM.fileInput.files.length) handleFile(DOM.fileInput.files[0]); });
    DOM.removeFile.addEventListener('click', resetUpload);
    DOM.methodSelect.addEventListener('change', renderConfigFields);
    DOM.runAnalysis.addEventListener('click', runAnalysis);
    DOM.exportExcelBtn.addEventListener('click', exportExcel);
    DOM.printReportBtn.addEventListener('click', printReport);
    DOM.themeToggle.addEventListener('click', toggleTheme);

    renderConfigFields();
  }

  function setStatus(text, isError) {
    DOM.statusBadge.textContent = text;
    DOM.statusBadge.style.background = isError ? 'rgba(239,68,68,0.2)' : 'var(--accent-glow)';
    DOM.statusBadge.style.color = isError ? 'var(--danger)' : 'var(--accent-light)';
    DOM.statusBadge.style.borderColor = isError ? 'rgba(239,68,68,0.3)' : 'rgba(99,102,241,0.3)';
  }

  function showLoading() { DOM.loadingOverlay.style.display = 'flex'; }
  function hideLoading() { DOM.loadingOverlay.style.display = 'none'; }

  async function handleFile(file) {
    const valid = ['.xlsx', '.xls'];
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!valid.includes(ext)) { setStatus('Unsupported file type', true); return; }
    DOM.fileName.textContent = file.name;
    DOM.fileInfo.style.display = 'block';
    setStatus('Uploading...');
    showLoading();
    try {
      const formData = new FormData();
      formData.append('file', file);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const res = await fetch(API + '/upload', { method: 'POST', body: formData, signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) {
        const errText = await res.text().catch(() => 'Unknown error');
        setStatus('Upload failed: ' + errText.substring(0, 80), true);
        hideLoading();
        return;
      }
      const data = await res.json();
      if (data.error) { setStatus(data.error, true); hideLoading(); return; }
      state.sessionId = data.session_id;
      state.sheets = data.sheets;
      setStatus('File loaded');
      hideLoading();
      showDashboard(Object.keys(state.sheets)[0]);
    } catch (err) {
      if (err.name === 'AbortError') {
        setStatus('Upload timed out (30s). File may be too large.', true);
      } else {
        setStatus('Upload failed: ' + (err.message || err), true);
      }
      hideLoading();
    }
  }

  function resetUpload() {
    state.sessionId = null;
    state.sheets = {};
    state.currentSheet = null;
    DOM.fileInfo.style.display = 'none';
    DOM.fileInput.value = '';
    DOM.dashboard.style.display = 'none';
    DOM.uploadSection.style.display = 'block';
    setStatus('Ready');
  }

  function showDashboard(firstSheet) {
    DOM.uploadSection.style.display = 'none';
    DOM.dashboard.style.display = 'flex';
    loadSheet(firstSheet);
  }

  function loadSheet(sheetName) {
    state.currentSheet = sheetName;
    const sheet = state.sheets[sheetName];
    if (!sheet) return;
    renderSheetTabs();
    renderDataTable(sheet);
    renderConfigFields();
  }

  function renderSheetTabs() {
    DOM.sheetTabs.innerHTML = '';
    Object.keys(state.sheets).forEach(name => {
      const tab = document.createElement('span');
      tab.className = 'sheet-tab' + (name === state.currentSheet ? ' active' : '');
      tab.textContent = name;
      tab.addEventListener('click', () => loadSheet(name));
      DOM.sheetTabs.appendChild(tab);
    });
  }

  function renderDataTable(sheet) {
    const thead = DOM.dataPreview.querySelector('thead');
    const tbody = DOM.dataPreview.querySelector('tbody');
    thead.innerHTML = '';
    tbody.innerHTML = '';
    if (!sheet.columns || !sheet.rows) return;
    const tr = document.createElement('tr');
    sheet.columns.forEach(col => {
      const th = document.createElement('th');
      th.textContent = col;
      tr.appendChild(th);
    });
    thead.appendChild(tr);
    const maxRows = Math.min(sheet.rows.length, 50);
    for (let i = 0; i < maxRows; i++) {
      const row = document.createElement('tr');
      sheet.columns.forEach(col => {
        const td = document.createElement('td');
        let val = sheet.rows[i][col];
        if (val === null || val === undefined) val = '';
        if (typeof val === 'number') val = val.toFixed(4);
        td.textContent = val;
        row.appendChild(td);
      });
      tbody.appendChild(row);
    }
    DOM.rowCount.textContent = `Showing ${maxRows} of ${sheet.n_rows} rows, ${sheet.n_cols} columns`;
  }

  function renderConfigFields() {
    const method = DOM.methodSelect.value;
    const sheet = state.sheets[state.currentSheet];
    if (!sheet) { DOM.configFields.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">Upload a file to configure analysis.</p>'; return; }

    let html = '';
    switch (method) {
      case 'descriptive':
        html = `
          <div class="form-group">
            <label>Variable to analyze</label>
            <select id="dv" class="form-select">
              <option value="">Select...</option>
              ${sheet.numeric_columns.map(c => `<option value="${c}">${c}</option>`).join('')}
            </select>
          </div>`;
        break;
      case 'anova':
        html = `
          <div class="form-group">
            <label>Dependent Variable (numeric)</label>
            <select id="dv" class="form-select">
              <option value="">Select...</option>
              ${sheet.numeric_columns.map(c => `<option value="${c}">${c}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Factor / Grouping Variable (categorical)</label>
            <select id="between" class="form-select">
              <option value="">Select...</option>
              ${sheet.categorical_columns.map(c => `<option value="${c}">${c}</option>`).join('')}
            </select>
          </div>`;
        break;
      case 'anova_twoway':
        html = `
          <div class="form-group">
            <label>Dependent Variable (numeric)</label>
            <select id="dv" class="form-select">
              <option value="">Select...</option>
              ${sheet.numeric_columns.map(c => `<option value="${c}">${c}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Factor A</label>
            <select id="factor_a" class="form-select">
              <option value="">Select...</option>
              ${[...sheet.categorical_columns, ...sheet.numeric_columns].map(c => `<option value="${c}">${c}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Factor B</label>
            <select id="factor_b" class="form-select">
              <option value="">Select...</option>
              ${[...sheet.categorical_columns, ...sheet.numeric_columns].map(c => `<option value="${c}">${c}</option>`).join('')}
            </select>
          </div>`;
        break;
      case 'regression':
        html = `
          <div class="form-group">
            <label>Dependent Variable</label>
            <select id="dv" class="form-select">
              <option value="">Select...</option>
              ${sheet.numeric_columns.map(c => `<option value="${c}">${c}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Independent Variables</label>
            <div class="checkbox-group">
              ${sheet.numeric_columns.map(c => `
                <label class="checkbox-label">
                  <input type="checkbox" class="iv-check" value="${c}">
                  <span>${c}</span>
                </label>
              `).join('')}
            </div>
          </div>`;
        break;
      case 'pca':
        html = `
          <div class="form-group">
            <label>Variables for PCA (select 2+)</label>
            <div class="checkbox-group">
              ${sheet.numeric_columns.map(c => `
                <label class="checkbox-label">
                  <input type="checkbox" class="pca-check" value="${c}">
                  <span>${c}</span>
                </label>
              `).join('')}
            </div>
          </div>`;
        break;
      case 'sem':
        html = `
          <div class="form-group">
            <p style="font-size:0.8rem;color:var(--text-muted);margin-bottom:8px;">
              Build paths by adding variables and connecting them with arrows.
            </p>
            <div class="form-group">
              <label>Available Variables</label>
              <select id="semVarSelect" class="form-select">
                <option value="">Select variable...</option>
                ${[...sheet.numeric_columns, ...sheet.categorical_columns].map(c => `<option value="${c}">${c}</option>`).join('')}
              </select>
            </div>
            <div style="display:flex;gap:6px;margin-bottom:8px;">
              <button id="addSemNode" class="btn btn-secondary" style="font-size:0.75rem;padding:6px 12px;">Add Variable</button>
              <button id="clearSem" class="btn btn-danger" style="font-size:0.75rem;padding:6px 12px;">Clear</button>
            </div>
            <div id="pathBuilder" class="path-canvas-wrapper">
              <div id="pathBuilderContent" style="padding:12px;min-height:250px;">
                <p style="color:var(--text-muted);font-size:0.85rem;text-align:center;padding-top:100px;">
                  Add variables to build your path model
                </p>
              </div>
            </div>
            <div id="semPathList" style="margin-top:8px;"></div>`;
        break;
      case 'ahp':
        html = `
          <div class="form-group">
            <label>Number of Criteria</label>
            <input type="number" id="ahpNumCriteria" class="form-input" min="2" max="10" value="3">
          </div>
          <div class="form-group">
            <label>Number of Alternatives</label>
            <input type="number" id="ahpNumAlts" class="form-input" min="2" max="10" value="3">
          </div>
          <button id="ahpSetupBtn" class="btn btn-secondary" style="font-size:0.8rem;">Setup AHP</button>
          <div id="ahpContent" style="margin-top:12px;"></div>`;
        break;
    }
    DOM.configFields.innerHTML = html;

    if (method === 'sem') {
      document.getElementById('addSemNode')?.addEventListener('click', addSemNode);
      document.getElementById('clearSem')?.addEventListener('click', clearSem);
    }
    if (method === 'ahp') {
      document.getElementById('ahpSetupBtn')?.addEventListener('click', setupAHP);
    }
  }

  /* SEM Path Builder */
  function addSemNode() {
    const sel = document.getElementById('semVarSelect');
    const varName = sel?.value;
    if (!varName) return;
    if (state.pathNodes.includes(varName)) { setStatus('Variable already added', true); return; }
    state.pathNodes.push(varName);
    renderPathBuilder();
    sel.value = '';
  }

  function clearSem() {
    state.pathNodes = [];
    state.pathEdges = [];
    renderPathBuilder();
  }

  function renderPathBuilder() {
    const container = document.getElementById('pathBuilderContent');
    const list = document.getElementById('semPathList');
    if (!container) return;
    if (state.pathNodes.length === 0) {
      container.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;text-align:center;padding-top:100px;">Add variables to build your path model</p>';
      if (list) list.innerHTML = '';
      return;
    }
    let html = '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;">';
    state.pathNodes.forEach((node, i) => {
      html += `<span style="background:var(--accent-glow);border:1px solid rgba(99,102,241,0.3);padding:6px 14px;border-radius:6px;font-size:0.8rem;cursor:grab;" data-node="${node}">
        ${node} <button class="btn-icon" style="width:18px;height:18px;font-size:0.7rem;margin-left:4px;" onclick="removeSemNode(${i})">&times;</button>
      </span>`;
    });
    html += '</div>';
    html += '<div style="margin-top:8px;"><p style="font-size:0.75rem;color:var(--text-muted);margin-bottom:4px;">Define paths (from → to):</p></div>';
    container.innerHTML = html;

    // Path edges
    let edgesHtml = '';
    state.pathEdges.forEach((edge, i) => {
      edgesHtml += `<div style="display:flex;gap:6px;align-items:center;margin-bottom:4px;font-size:0.8rem;">
        <span style="color:var(--accent-light);font-weight:500;">${edge.from}</span>
        <span style="color:var(--text-muted);">→</span>
        <span style="color:var(--accent-light);font-weight:500;">${edge.to}</span>
        <button class="btn-icon" style="width:20px;height:20px;font-size:0.6rem;" onclick="removeSemEdge(${i})">&times;</button>
      </div>`;
    });
    // Add new path form
    edgesHtml += `
      <div style="display:flex;gap:6px;align-items:center;margin-top:8px;flex-wrap:wrap;">
        <span style="font-size:0.75rem;color:var(--text-muted);">New path:</span>
        <select id="semFrom" class="form-select" style="width:auto;padding:4px 8px;font-size:0.75rem;">
          <option value="">From...</option>
          ${state.pathNodes.map(n => `<option value="${n}">${n}</option>`).join('')}
        </select>
        <span style="color:var(--text-muted);font-size:0.8rem;">→</span>
        <select id="semTo" class="form-select" style="width:auto;padding:4px 8px;font-size:0.75rem;">
          <option value="">To...</option>
          ${state.pathNodes.map(n => `<option value="${n}">${n}</option>`).join('')}
        </select>
        <button id="addSemPath" class="btn btn-secondary" style="font-size:0.7rem;padding:4px 10px;">Add</button>
      </div>`;
    if (list) list.innerHTML = edgesHtml;

    document.getElementById('addSemPath')?.addEventListener('click', () => {
      const from = document.getElementById('semFrom')?.value;
      const to = document.getElementById('semTo')?.value;
      if (!from || !to) { setStatus('Select both from and to variables', true); return; }
      if (from === to) { setStatus('Cannot have self-loop', true); return; }
      state.pathEdges.push({ from, to });
      renderPathBuilder();
    });
  }

  window.removeSemNode = function(i) {
    const node = state.pathNodes[i];
    state.pathNodes.splice(i, 1);
    state.pathEdges = state.pathEdges.filter(e => e.from !== node && e.to !== node);
    renderPathBuilder();
  };
  window.removeSemEdge = function(i) {
    state.pathEdges.splice(i, 1);
    renderPathBuilder();
  };

  /* AHP Setup */
  function setupAHP() {
    const nCrit = parseInt(document.getElementById('ahpNumCriteria')?.value || '3');
    const nAlt = parseInt(document.getElementById('ahpNumAlts')?.value || '3');
    if (nCrit < 2 || nAlt < 2) { setStatus('Need at least 2 criteria and 2 alternatives', true); return; }

    let html = '<div class="form-group"><label>Criteria Names</label><div style="display:flex;gap:4px;flex-wrap:wrap;">';
    for (let i = 0; i < nCrit; i++) {
      html += `<input type="text" class="form-input ahp-crit-name" style="width:120px;padding:6px 8px;font-size:0.8rem;" value="Criterion ${i+1}" data-idx="${i}">`;
    }
    html += '</div></div>';
    html += '<div class="form-group"><label>Alternative Names</label><div style="display:flex;gap:4px;flex-wrap:wrap;">';
    for (let i = 0; i < nAlt; i++) {
      html += `<input type="text" class="form-input ahp-alt-name" style="width:120px;padding:6px 8px;font-size:0.8rem;" value="Alternative ${i+1}" data-idx="${i}">`;
    }
    html += '</div></div>';
    // Criteria matrix
    html += '<div class="form-group"><label>Criteria Comparison Matrix (row vs column)</label>';
    html += '<p style="font-size:0.7rem;color:var(--text-muted);margin-bottom:4px;">1 = equal, 3 = moderate, 5 = strong, 7 = very strong, 9 = extreme importance</p>';
    html += '<div style="overflow-x:auto;"><table class="ahp-matrix" id="ahpCritMatrix">';
    html += '<tr><th></th>';
    for (let i = 0; i < nCrit; i++) {
      html += `<th>C${i+1}</th>`;
    }
    html += '</tr>';
    for (let i = 0; i < nCrit; i++) {
      html += `<tr><th>C${i+1}</th>`;
      for (let j = 0; j < nCrit; j++) {
        if (i === j) {
          html += `<td><input type="number" class="ahp-crit-val" data-i="${i}" data-j="${j}" value="1" readonly style="background:var(--bg-secondary);"></td>`;
        } else if (j > i) {
          html += `<td><input type="number" class="ahp-crit-val" data-i="${i}" data-j="${j}" value="1" min="1" max="9" step="1"></td>`;
        } else {
          html += `<td><input type="number" class="ahp-crit-val" data-i="${i}" data-j="${j}" value="1" readonly style="background:var(--bg-secondary);"></td>`;
        }
      }
      html += '</tr>';
    }
    html += '</table></div></div>';
    // Alternative matrices per criterion
    html += '<div id="ahpAltMatrices">';
    for (let c = 0; c < nCrit; c++) {
      html += `<div class="form-group"><label>Alternatives comparison for Criterion ${c+1}</label>`;
      html += '<div style="overflow-x:auto;"><table class="ahp-matrix">';
      html += '<tr><th></th>';
      for (let i = 0; i < nAlt; i++) html += `<th>A${i+1}</th>`;
      html += '</tr>';
      for (let i = 0; i < nAlt; i++) {
        html += `<tr><th>A${i+1}</th>`;
        for (let j = 0; j < nAlt; j++) {
          if (i === j) {
            html += `<td><input type="number" class="ahp-alt-val" data-c="${c}" data-i="${i}" data-j="${j}" value="1" readonly style="background:var(--bg-secondary);"></td>`;
          } else if (j > i) {
            html += `<td><input type="number" class="ahp-alt-val" data-c="${c}" data-i="${i}" data-j="${j}" value="1" min="1" max="9" step="1"></td>`;
          } else {
            html += `<td><input type="number" class="ahp-alt-val" data-c="${c}" data-i="${i}" data-j="${j}" value="1" readonly style="background:var(--bg-secondary);"></td>`;
          }
        }
        html += '</tr>';
      }
      html += '</table></div></div>';
    }
    html += '</div>';
    document.getElementById('ahpContent').innerHTML = html;

    // Sync reciprocal values
    document.querySelectorAll('.ahp-crit-val').forEach(inp => {
      inp.addEventListener('input', syncAHP);
    });
    document.querySelectorAll('.ahp-alt-val').forEach(inp => {
      inp.addEventListener('input', syncAHP);
    });
  }

  function syncAHP() {
    // Sync criteria matrix reciprocals
    document.querySelectorAll('.ahp-crit-val').forEach(inp => {
      const i = parseInt(inp.dataset.i);
      const j = parseInt(inp.dataset.j);
      if (j > i) {
        const recip = document.querySelector(`.ahp-crit-val[data-i="${j}"][data-j="${i}"]`);
        if (recip) {
          const val = parseFloat(inp.value) || 1;
          recip.value = (1 / val).toFixed(4);
        }
      }
    });
    // Sync alternative matrices reciprocals
    document.querySelectorAll('.ahp-alt-val').forEach(inp => {
      const i = parseInt(inp.dataset.i);
      const j = parseInt(inp.dataset.j);
      if (j > i) {
        const c = inp.dataset.c;
        const recip = document.querySelector(`.ahp-alt-val[data-c="${c}"][data-i="${j}"][data-j="${i}"]`);
        if (recip) {
          const val = parseFloat(inp.value) || 1;
          recip.value = (1 / val).toFixed(4);
        }
      }
    });
  }

  /* Run Analysis */
  async function runAnalysis() {
    const method = DOM.methodSelect.value;
    const sheet = state.currentSheet;
    if (!state.sessionId || !sheet) { setStatus('Please upload a file first', true); return; }

    showLoading();
    setStatus('Computing...');

    const formData = new FormData();
    formData.append('session_id', state.sessionId);
    formData.append('sheet', sheet);
    formData.append('method', method);

    try {
      switch (method) {
        case 'descriptive': {
          const dv = document.getElementById('dv')?.value;
          if (!dv) { setStatus('Select a variable', true); hideLoading(); return; }
          formData.append('dv', dv);
          break;
        }
        case 'anova': {
          const dv = document.getElementById('dv')?.value;
          const between = document.getElementById('between')?.value;
          if (!dv || !between) { setStatus('Select DV and factor', true); hideLoading(); return; }
          formData.append('dv', dv);
          formData.append('between', between);
          break;
        }
        case 'anova_twoway': {
          const dv = document.getElementById('dv')?.value;
          const fa = document.getElementById('factor_a')?.value;
          const fb = document.getElementById('factor_b')?.value;
          if (!dv || !fa) { setStatus('Select DV and Factor A', true); hideLoading(); return; }
          formData.append('dv', dv);
          formData.append('factor_a', fa);
          formData.append('factor_b', fb || '');
          break;
        }
        case 'regression': {
          const dv = document.getElementById('dv')?.value;
          const checks = document.querySelectorAll('.iv-check:checked');
          if (!dv || !checks.length) { setStatus('Select DV and at least one IV', true); hideLoading(); return; }
          formData.append('dv', dv);
          formData.append('ivs', Array.from(checks).map(c => c.value).join(','));
          break;
        }
        case 'pca': {
          const checks = document.querySelectorAll('.pca-check:checked');
          if (checks.length < 2) { setStatus('Select at least 2 variables', true); hideLoading(); return; }
          formData.append('variables', Array.from(checks).map(c => c.value).join(','));
          break;
        }
        case 'sem': {
          if (!state.pathEdges.length) { setStatus('Define at least one path', true); hideLoading(); return; }
          formData.append('sem_paths', JSON.stringify(state.pathEdges));
          break;
        }
        case 'ahp': {
          const critNames = Array.from(document.querySelectorAll('.ahp-crit-name')).map(inp => inp.value.trim());
          const altNames = Array.from(document.querySelectorAll('.ahp-alt-name')).map(inp => inp.value.trim());
          const nCrit = critNames.length;
          const nAlt = altNames.length;
          // Build criteria matrix
          const critMatrix = [];
          for (let i = 0; i < nCrit; i++) {
            const row = [];
            for (let j = 0; j < nCrit; j++) {
              const inp = document.querySelector(`.ahp-crit-val[data-i="${i}"][data-j="${j}"]`);
              row.push(parseFloat(inp?.value || '1'));
            }
            critMatrix.push(row);
          }
          // Build alternative matrices
          const altMatrices = [];
          for (let c = 0; c < nCrit; c++) {
            const mat = [];
            for (let i = 0; i < nAlt; i++) {
              const row = [];
              for (let j = 0; j < nAlt; j++) {
                const inp = document.querySelector(`.ahp-alt-val[data-c="${c}"][data-i="${i}"][data-j="${j}"]`);
                row.push(parseFloat(inp?.value || '1'));
              }
              mat.push(row);
            }
            altMatrices.push(mat);
          }
          const ahpData = { criteria: critNames, alternatives: altNames, criteria_matrix: critMatrix, alt_matrices: altMatrices };
          formData.append('ahp_data', JSON.stringify(ahpData));
          break;
        }
      }

      const res = await fetch(API + '/analyze', { method: 'POST', body: formData });
      const data = await res.json();
      hideLoading();

      if (data.error) {
        setStatus(data.error, true);
        DOM.resultsArea.style.display = 'none';
        return;
      }

      setStatus('Results ready');
      renderResults(method, data);
    } catch (err) {
      hideLoading();
      setStatus('Analysis failed', true);
    }
  }

  /* Render Results */
  function renderResults(method, data) {
    DOM.resultsArea.style.display = 'block';
    const result = data.result || {};
    const interpretation = data.interpretation || '';
    let html = '';

    // Interpretation card
    if (interpretation) {
      html += `<div class="interpretation-card result-card">
        <h4>Interpretation</h4>
        <p style="font-size:0.9rem;">${interpretation}</p>
      </div>`;
    }

    switch (method) {
      case 'descriptive':
        html += renderDescriptive(result);
        break;
      case 'anova':
      case 'anova_twoway':
        html += renderANOVA(result);
        break;
      case 'regression':
        html += renderRegression(result);
        break;
      case 'pca':
        html += renderPCA(result);
        break;
      case 'sem':
        html += renderSEM(result);
        break;
      case 'ahp':
        html += renderAHP(result);
        break;
    }

    DOM.resultsContent.innerHTML = html;

    // Render charts after DOM is updated
    setTimeout(() => {
      destroyCharts();
      switch (method) {
        case 'descriptive':
          renderDescriptiveCharts(result);
          break;
        case 'anova':
        case 'anova_twoway':
          renderANOVAChart(result);
          break;
        case 'regression':
          renderRegressionChart(result);
          break;
        case 'pca':
          renderPCAChart(result);
          break;
        case 'ahp':
          renderAHPChart(result);
          break;
      }
    }, 100);
  }

  function renderDescriptive(r) {
    if (r.error) return `<div class="result-card"><p style="color:var(--danger)">${r.error}</p></div>`;
    let html = `<div class="result-card">
      <h4>Descriptive Statistics: ${r.variable}</h4>
      <div class="stat-grid">
        <div class="stat-item"><div class="label">N</div><div class="value">${r.n}</div></div>
        <div class="stat-item"><div class="label">Mean</div><div class="value">${r.mean}</div></div>
        <div class="stat-item"><div class="label">Median</div><div class="value">${r.median}</div></div>
        <div class="stat-item"><div class="label">Std Dev</div><div class="value">${r.std_dev}</div></div>
        <div class="stat-item"><div class="label">Variance</div><div class="value">${r.variance}</div></div>
        <div class="stat-item"><div class="label">Std Error</div><div class="value">${r.std_error}</div></div>
        <div class="stat-item"><div class="label">Skewness</div><div class="value">${r.skewness}</div></div>
        <div class="stat-item"><div class="label">Kurtosis</div><div class="value">${r.kurtosis}</div></div>
        <div class="stat-item"><div class="label">Min</div><div class="value">${r.min}</div></div>
        <div class="stat-item"><div class="label">Max</div><div class="value">${r.max}</div></div>
        <div class="stat-item"><div class="label">Q1</div><div class="value">${r.q1}</div></div>
        <div class="stat-item"><div class="label">Q3</div><div class="value">${r.q3}</div></div>
        <div class="stat-item"><div class="label">IQR</div><div class="value">${r.iqr}</div></div>
        <div class="stat-item"><div class="label">Range</div><div class="value">${r.range}</div></div>
        <div class="stat-item"><div class="label">CV%</div><div class="value">${r.cv_percent}</div></div>
        <div class="stat-item"><div class="label">Outliers</div><div class="value">${r.outlier_count}</div></div>
      </div>
      <div class="chart-container"><canvas id="chart-descriptive"></canvas></div>
    </div>`;
    return html;
  }

  function renderANOVA(r) {
    if (r.error) return `<div class="result-card"><p style="color:var(--danger)">${r.error}</p></div>`;
    const factorLabel = r.factor || (r.factor_a ? r.factor_a + (r.factor_b ? ' x ' + r.factor_b : '') : '');
    let html = `<div class="result-card">
      <h4>${r.method}</h4>
      <p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:8px;">DV: ${r.dv} | Factor: ${factorLabel}</p>`;
    const tbl = r.anova_table || {};
    html += '<table class="data-table"><tr><th>Source</th><th>SS</th><th>df</th><th>MS</th><th>F</th><th>p</th></tr>';
    for (let i = 0; i < (tbl.source || []).length; i++) {
      html += `<tr><td>${tbl.source[i]}</td><td>${tbl.ss[i]}</td><td>${tbl.df[i]}</td><td>${tbl.ms[i]}</td><td>${tbl.f[i]}</td><td>${typeof tbl.p_value[i] === 'number' ? tbl.p_value[i].toFixed(6) : tbl.p_value[i]}</td></tr>`;
    }
    html += '</table>';
    if (r.effect_size) {
      html += `<div style="margin-top:8px;font-size:0.85rem;color:var(--text-secondary);">
        η² = ${r.effect_size.eta_squared}, ω² = ${r.effect_size.omega_squared}
      </div>`;
    }
    if (r.r_squared !== undefined && r.r_squared !== null) {
      html += `<div style="margin-top:4px;font-size:0.85rem;color:var(--text-secondary);">R² = ${r.r_squared}</div>`;
    }
    if (r.group_stats && r.group_stats.length) {
      html += '<h5 style="margin-top:12px;font-size:0.85rem;color:var(--text-secondary);">Group Statistics</h5>';
      html += '<table class="data-table"><tr><th>Group</th><th>N</th><th>Mean</th><th>Std</th><th>SE</th></tr>';
      r.group_stats.forEach(g => {
        html += `<tr><td>${g.group}</td><td>${g.n}</td><td>${g.mean}</td><td>${g.std}</td><td>${g.se || '-'}</td></tr>`;
      });
      html += '</table>';
    }
    if (r.tukey_hsd && r.tukey_hsd.length) {
      html += '<h5 style="margin-top:12px;font-size:0.85rem;color:var(--text-secondary);">Tukey HSD Post-hoc</h5>';
      html += '<table class="data-table"><tr><th>Group 1</th><th>Group 2</th><th>Mean Diff</th><th>p-value</th><th>Significant</th></tr>';
      r.tukey_hsd.forEach(t => {
        html += `<tr><td>${t.group1}</td><td>${t.group2}</td><td>${t.meandiff}</td><td>${t.pvalue}</td><td>${t.reject ? 'Yes' : 'No'}</td></tr>`;
      });
      html += '</table>';
    }
    html += '<div class="chart-container"><canvas id="chart-anova"></canvas></div>';
    html += '</div>';
    return html;
  }

  function renderRegression(r) {
    if (r.error) return `<div class="result-card"><p style="color:var(--danger)">${r.error}</p></div>`;
    let html = `<div class="result-card">
      <h4>Multiple Linear Regression</h4>
      <div class="stat-grid">
        <div class="stat-item"><div class="label">R²</div><div class="value">${r.r_squared}</div></div>
        <div class="stat-item"><div class="label">Adj R²</div><div class="value">${r.adj_r_squared}</div></div>
        <div class="stat-item"><div class="label">F</div><div class="value">${r.f_statistic}</div></div>
        <div class="stat-item"><div class="label">p(F)</div><div class="value">${typeof r.f_p_value === 'number' ? r.f_p_value.toFixed(6) : r.f_p_value}</div></div>
        <div class="stat-item"><div class="label">RMSE</div><div class="value">${r.rmse}</div></div>
        <div class="stat-item"><div class="label">N</div><div class="value">${r.n_obs}</div></div>
        <div class="stat-item"><div class="label">AIC</div><div class="value">${r.aic}</div></div>
        <div class="stat-item"><div class="label">BIC</div><div class="value">${r.bic}</div></div>
      </div>
      <h5 style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:6px;">Coefficients</h5>
      <table class="data-table"><tr><th>Variable</th><th>Coef</th><th>SE</th><th>t</th><th>p</th><th>CI 95%</th></tr>`;
    r.coefficients.forEach(c => {
      const sig = c.p_value < 0.05 ? '✓' : '';
      html += `<tr><td>${c.variable} ${sig}</td><td>${c.coefficient}</td><td>${c.std_error}</td><td>${c.t_value}</td><td>${c.p_value.toFixed(6)}</td><td>[${c.ci_lower}, ${c.ci_upper}]</td></tr>`;
    });
    html += '</table>';
    html += '<div class="chart-container"><canvas id="chart-regression"></canvas></div>';
    html += '</div>';
    return html;
  }

  function renderPCA(r) {
    if (r.error) return `<div class="result-card"><p style="color:var(--danger)">${r.error}</p></div>`;
    let html = `<div class="result-card">
      <h4>Principal Component Analysis</h4>
      <div class="stat-grid">
        <div class="stat-item"><div class="label">Components</div><div class="value">${r.n_components}</div></div>
        <div class="stat-item"><div class="label">Observations</div><div class="value">${r.n_obs}</div></div>
        <div class="stat-item"><div class="label">PC1 Var</div><div class="value">${(r.proportion_variance[0] * 100).toFixed(1)}%</div></div>
        <div class="stat-item"><div class="label">PC2 Var</div><div class="value">${(r.proportion_variance[1] * 100).toFixed(1)}%</div></div>
      </div>
      <h5 style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:6px;">Eigenvalues & Variance</h5>
      <table class="data-table"><tr><th>Component</th><th>Eigenvalue</th><th>% Variance</th><th>Cumulative %</th></tr>`;
    for (let i = 0; i < r.n_components; i++) {
      html += `<tr><td>${r.component_labels[i]}</td><td>${r.eigenvalues[i]}</td><td>${(r.proportion_variance[i] * 100).toFixed(2)}</td><td>${(r.cumulative_variance[i] * 100).toFixed(2)}</td></tr>`;
    }
    html += '</table>';
    html += '<h5 style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:6px;margin-top:8px;">Factor Loadings</h5>';
    html += '<table class="data-table"><tr><th>Variable</th>';
    r.component_labels.forEach(l => { html += `<th>${l}</th>`; });
    html += '</tr>';
    r.factor_loadings.forEach(l => {
      html += '<tr><td>' + l.variable + '</td>';
      r.component_labels.forEach(c => { html += `<td>${l[c]}</td>`; });
      html += '</tr>';
    });
    html += '</table>';
    html += '<div class="chart-container"><canvas id="chart-pca"></canvas></div>';
    html += '</div>';
    return html;
  }

  function renderSEM(r) {
    if (r.error) return `<div class="result-card"><p style="color:var(--danger)">${r.error}</p></div>`;
    let html = `<div class="result-card"><h4>Path Analysis (SEM)</h4>`;
    const fi = r.fit_indices || {};
    html += `<div class="stat-grid">
      <div class="stat-item"><div class="label">χ²</div><div class="value">${fi.chi_square}</div></div>
      <div class="stat-item"><div class="label">df</div><div class="value">${fi.df}</div></div>
      <div class="stat-item"><div class="label">p</div><div class="value">${fi.p_value}</div></div>
      <div class="stat-item"><div class="label">CFI</div><div class="value">${fi.cfi}</div></div>
      <div class="stat-item"><div class="label">RMSEA</div><div class="value">${fi.rmsea}</div></div>
    </div>`;
    (r.equations || []).forEach(eq => {
      html += `<h5 style="font-size:0.85rem;color:var(--accent-light);margin:8px 0 4px;">${eq.dependent} (R² = ${eq.r_squared})</h5>`;
      html += '<table class="data-table"><tr><th>From</th><th>β</th><th>SE</th><th>t</th><th>p</th></tr>';
      eq.paths.forEach(p => {
        if (p.from === 'const') return;
        const sig = p.p_value < 0.05 ? '✓' : '';
        html += `<tr><td>${p.from} ${sig}</td><td>${p.coefficient}</td><td>${p.std_error}</td><td>${p.t_value}</td><td>${p.p_value.toFixed(6)}</td></tr>`;
      });
      html += '</table>';
    });
    // Build flowchart-style path diagram
    const nodes = new Set();
    (r.paths_specified || []).forEach(p => { nodes.add(p.from); nodes.add(p.to); });
    const nodeList = Array.from(nodes);
    const nodeColors = ['#6366f1','#22c55e','#eab308','#ef4444','#ec4899','#14b8a6','#f97316','#a855f7'];
    const colorMap = {};
    nodeList.forEach((n, i) => { colorMap[n] = nodeColors[i % nodeColors.length]; });
    // Detect layers using topological sort
    const inDeg = {}; const adj = {};
    nodeList.forEach(n => { inDeg[n] = 0; adj[n] = []; });
    (r.paths_specified || []).forEach(p => {
      if (nodeList.includes(p.from) && nodeList.includes(p.to)) {
        adj[p.from].push(p.to);
        inDeg[p.to] = (inDeg[p.to] || 0) + 1;
      }
    });
    let layers = [];
    let queue = nodeList.filter(n => inDeg[n] === 0);
    let visited = new Set(queue);
    while (queue.length > 0) {
      let layer = [];
      let next = [];
      queue.forEach(n => {
        layer.push(n);
        (adj[n] || []).forEach(m => {
          inDeg[m]--;
          if (inDeg[m] <= 0 && !visited.has(m)) { visited.add(m); next.push(m); }
        });
      });
      layers.push(layer);
      queue = next;
    }
    const layerGap = 180;
    const nodeH = 52;
    const vGap = 70;
    html += `<div style="margin-top:12px;"><h5 style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:6px;">Path Diagram (Flowchart)</h5>
      <div class="path-canvas-wrapper" style="min-height:${Math.max(200, layers.length * (nodeH + vGap) + 40)}px;overflow-x:auto;">
        <div style="position:relative;min-width:${layers.length * layerGap + 60}px;height:${Math.max(200, layers.length * (nodeH + vGap) + 40)}px;padding:20px;">`;
    // Position nodes
    const positions = {};
    const layerPositions = {};
    layers.forEach((layer, li) => {
      const x = li * layerGap + 30;
      const totalH = layer.length * (nodeH + vGap);
      layer.forEach((n, ni) => {
        const y = (totalH / 2) * -1 + ni * (nodeH + vGap);
        layerPositions[n] = { x, y: y + 30 };
      });
    });
    // Center layers vertically
    layers.forEach((layer, li) => {
      const vals = layer.map(n => (layerPositions[n] || {}).y).filter(v => v !== undefined);
      if (!vals.length) return;
      const minY = Math.min(...vals);
      const maxY = Math.max(...vals);
      const centerY = (minY + maxY) / 2;
      layer.forEach(n => {
        if (layerPositions[n]) layerPositions[n].y = layerPositions[n].y - centerY + 60;
      });
    });
    // Draw SVG arrows first
    const svgW = layers.length * layerGap + 60;
    const svgH = Math.max(200, layers.length * (nodeH + vGap) + 40);
    let svgArrows = `<svg style="position:absolute;top:0;left:0;width:${svgW}px;height:${svgH}px;pointer-events:none;overflow:visible;">
      <defs><marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#6366f1"/></marker></defs>`;
    (r.paths_specified || []).forEach(p => {
      const from = layerPositions[p.from];
      const to = layerPositions[p.to];
      if (!from || !to) return;
      // find path coefficient
      let coef = '?';
      (r.equations || []).forEach(eq => {
        if (eq.dependent === p.to) {
          const path = eq.paths.find(pp => pp.from === p.from);
          if (path) coef = path.coefficient.toFixed(3);
        }
      });
      const x1 = from.x + 70; const y1 = from.y;
      const x2 = to.x; const y2 = to.y;
      const cx = (x1 + x2) / 2; const cy = (y1 + y2) / 2 - 16;
      svgArrows += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#6366f1" stroke-width="2" marker-end="url(#arrowhead)" stroke-dasharray=""/>`;
      svgArrows += `<text x="${cx}" y="${cy}" fill="#818cf8" font-size="11" font-weight="500" text-anchor="middle">β=${coef}</text>`;
    });
    svgArrows += `</svg>`;
    html += svgArrows;
    // Draw node boxes
    Object.entries(layerPositions).forEach(([n, pos]) => {
      if (!pos) return;
      const color = colorMap[n];
      html += `<div style="position:absolute;left:${pos.x}px;top:${pos.y}px;background:${color}22;border:2px solid ${color};border-radius:10px;padding:8px 16px;font-size:0.8rem;font-weight:600;white-space:nowrap;z-index:2;box-shadow:0 2px 12px ${color}44;text-align:center;">${n}</div>`;
    });
    html += `</div></div></div></div>`;
    return html;
  }

  function renderAHP(r) {
    if (r.error) return `<div class="result-card"><p style="color:var(--danger)">${r.error}</p></div>`;
    const cons = r.criteria_consistency || {};
    let html = `<div class="result-card"><h4>Analytic Hierarchy Process</h4>
      <div class="stat-grid">
        <div class="stat-item"><div class="label">Best</div><div class="value" style="color:var(--success)">${r.best_alternative}</div></div>
        <div class="stat-item"><div class="label">Score</div><div class="value">${r.best_score}</div></div>
        <div class="stat-item"><div class="label">CI</div><div class="value">${cons.ci}</div></div>
        <div class="stat-item"><div class="label">CR</div><div class="value" style="color:${cons.consistent ? 'var(--success)' : 'var(--danger)'}">${cons.cr} ${cons.consistent ? '✓' : '✗'}</div></div>
      </div>
      <h5 style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:6px;">Criteria Weights</h5>
      <table class="data-table"><tr><th>Criteria</th><th>Weight</th></tr>`;
    r.criteria.forEach((c, i) => {
      html += `<tr><td>${c}</td><td>${r.criteria_weights[i]}</td></tr>`;
    });
    html += '</table>';
    html += '<h5 style="font-size:0.85rem;color:var(--text-secondary);margin:8px 0 6px;">Alternative Scores</h5>';
    html += '<table class="data-table"><tr><th>Alternative</th><th>Final Score</th>';
    r.criteria.forEach(c => { html += `<th>${c}</th>`; });
    html += '</tr>';
    r.alternative_scores.forEach(a => {
      html += `<tr><td>${a.alternative}</td><td style="font-weight:600;">${a.final_score}</td>`;
      r.criteria.forEach(c => { html += `<td>${a.details[c]}</td>`; });
      html += '</tr>';
    });
    html += '</table>';
    html += '<div class="chart-container"><canvas id="chart-ahp"></canvas></div>';
    html += '</div>';
    return html;
  }

  /* Charts */
  let chartInstances = {};
  function destroyCharts() {
    if (typeof Chart === 'undefined') { chartInstances = {}; return; }
    Object.values(chartInstances).forEach(c => { try { c.destroy(); } catch(e) {} });
    chartInstances = {};
  }

  function withChart(id, fn) {
    if (typeof Chart === 'undefined') return;
    const ctx = document.getElementById(id)?.getContext('2d');
    if (!ctx) return;
    try { fn(ctx); } catch(e) { console.warn('Chart error:', e); }
  }

  function renderDescriptiveCharts(r) {
    destroyCharts();
    if (!r.kde || !r.kde.x || !r.kde.y) return;
    withChart('chart-descriptive', (ctx) => {
      chartInstances.descriptive = new Chart(ctx, {
        type: 'line',
        data: {
          labels: r.kde.x.map(v => v.toFixed(2)),
          datasets: [{
            label: 'Density',
            data: r.kde.y,
            borderColor: '#6366f1',
            backgroundColor: 'rgba(99,102,241,0.15)',
            fill: true,
            tension: 0.4,
            pointRadius: 0
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { labels: { color: '#8b95b0' } } },
          scales: {
            x: { title: { display: true, text: r.variable, color: '#8b95b0' }, ticks: { color: '#5a6480' }, grid: { color: 'rgba(42,47,66,0.5)' } },
            y: { title: { display: true, text: 'Density', color: '#8b95b0' }, ticks: { color: '#5a6480' }, grid: { color: 'rgba(42,47,66,0.5)' } }
          }
        }
      });
    });
  }

  function renderRegressionChart(r) {
    if (!r.fitted_values || !r.residuals) return;
    withChart('chart-regression', (ctx) => {
      const data = r.fitted_values.map((f, i) => ({ x: f, y: r.residuals[i] }));
      chartInstances.regression = new Chart(ctx, {
        type: 'scatter',
        data: {
          datasets: [{
            label: 'Residuals vs Fitted',
            data: data,
            backgroundColor: 'rgba(99,102,241,0.6)',
            pointRadius: 4
          }, {
            label: 'Zero line',
            data: [{ x: Math.min(...r.fitted_values), y: 0 }, { x: Math.max(...r.fitted_values), y: 0 }],
            type: 'line',
            borderColor: 'rgba(239,68,68,0.5)',
            borderDash: [5, 5],
            pointRadius: 0,
            fill: false
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { labels: { color: '#8b95b0' } } },
          scales: {
            x: { title: { display: true, text: 'Fitted Values', color: '#8b95b0' }, ticks: { color: '#5a6480' }, grid: { color: 'rgba(42,47,66,0.5)' } },
            y: { title: { display: true, text: 'Residuals', color: '#8b95b0' }, ticks: { color: '#5a6480' }, grid: { color: 'rgba(42,47,66,0.5)' } }
          }
        }
      });
    });
  }

  function renderPCAChart(r) {
    if (!r.score_coordinates || r.score_coordinates.length < 2) return;
    withChart('chart-pca', (ctx) => {
      const data = r.score_coordinates[0].map((x, i) => ({ x, y: r.score_coordinates[1][i] }));
      chartInstances.pca = new Chart(ctx, {
        type: 'scatter',
        data: {
          datasets: [{
            label: 'Scores',
            data: data,
            backgroundColor: 'rgba(99,102,241,0.6)',
            pointRadius: 4
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { labels: { color: '#8b95b0' } } },
          scales: {
            x: { title: { display: true, text: 'PC1', color: '#8b95b0' }, ticks: { color: '#5a6480' }, grid: { color: 'rgba(42,47,66,0.5)' } },
            y: { title: { display: true, text: 'PC2', color: '#8b95b0' }, ticks: { color: '#5a6480' }, grid: { color: 'rgba(42,47,66,0.5)' } }
          }
        }
      });
    });
  }

  function renderANOVAChart(r) {
    if (!r.group_stats || !r.group_stats.length) return;
    withChart('chart-anova', (ctx) => {
      chartInstances.anova = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: r.group_stats.map(g => g.group),
          datasets: [{
            label: 'Mean',
            data: r.group_stats.map(g => g.mean),
            backgroundColor: 'rgba(99,102,241,0.7)',
            borderColor: '#6366f1',
            borderWidth: 1,
            borderRadius: 4
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: '#8b95b0' } },
            tooltip: {
              callbacks: {
                afterLabel: function(context) {
                  const g = r.group_stats[context.dataIndex];
                  return `N=${g.n}\nSD=${g.std}\nSE=${g.se || '-'}`;
                }
              }
            }
          },
          scales: {
            x: { title: { display: true, text: 'Group', color: '#8b95b0' }, ticks: { color: '#5a6480' }, grid: { color: 'rgba(42,47,66,0.5)' } },
            y: { title: { display: true, text: 'Mean', color: '#8b95b0' }, ticks: { color: '#5a6480' }, grid: { color: 'rgba(42,47,66,0.5)' } }
          }
        }
      });
    });
  }

  function renderAHPChart(r) {
    withChart('chart-ahp', (ctx) => {
      chartInstances.ahp = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: r.criteria,
          datasets: [
            {
              label: 'Criteria Weight',
              data: r.criteria_weights,
              backgroundColor: 'rgba(99,102,241,0.7)',
              borderColor: '#6366f1',
              borderWidth: 1,
              borderRadius: 4
            }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          indexAxis: 'y',
          plugins: { legend: { labels: { color: '#8b95b0' } } },
          scales: {
            x: { title: { display: true, text: 'Weight', color: '#8b95b0' }, ticks: { color: '#5a6480' }, grid: { color: 'rgba(42,47,66,0.5)' } },
            y: { title: { display: true, text: 'Criteria', color: '#8b95b0' }, ticks: { color: '#5a6480' }, grid: { color: 'rgba(42,47,66,0.5)' } }
          }
        }
      });
    });
  }

  /* Export */
  async function exportExcel() {
    if (!state.sessionId || !state.currentSheet) { setStatus('No data to export', true); return; }
    try {
      const formData = new FormData();
      formData.append('session_id', state.sessionId);
      formData.append('sheet', state.currentSheet);
      const res = await fetch(API + '/export-excel', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${state.currentSheet}_export.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus('Exported successfully');
    } catch (err) {
      setStatus('Export failed', true);
    }
  }

  /* Print Report */
  function printReport() {
    const method = DOM.methodSelect.value;
    const methodNames = {
      descriptive: 'Descriptive Statistics',
      anova: 'One-way ANOVA',
      anova_twoway: 'Two-way ANOVA',
      regression: 'Multiple Linear Regression',
      pca: 'Principal Component Analysis (PCA)',
      sem: 'Path Analysis (SEM)',
      ahp: 'Analytic Hierarchy Process (AHP)'
    };

    // Get chart images
    const chartIds = ['chart-descriptive', 'chart-anova', 'chart-regression', 'chart-pca', 'chart-ahp'];
    const chartImages = {};
    chartIds.forEach(id => {
      const canvas = document.getElementById(id);
      if (canvas) chartImages[id] = canvas.toDataURL('image/png');
    });

    // Get current file info
    const fileName = DOM.fileName.textContent || 'Unknown';
    const sheetName = state.currentSheet || '';
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

    // Build configuration info
    let configInfo = '';
    const dv = document.getElementById('dv')?.value;
    if (dv) configInfo += `<p><strong>Dependent Variable:</strong> ${dv}</p>`;
    const between = document.getElementById('between')?.value;
    if (between) configInfo += `<p><strong>Factor:</strong> ${between}</p>`;
    const fa = document.getElementById('factor_a')?.value;
    const fb = document.getElementById('factor_b')?.value;
    if (fa) configInfo += `<p><strong>Factor A:</strong> ${fa}</p>`;
    if (fb) configInfo += `<p><strong>Factor B:</strong> ${fb}</p>`;
    const ivs = document.querySelectorAll('.iv-check:checked');
    if (ivs.length) configInfo += `<p><strong>Independent Variables:</strong> ${Array.from(ivs).map(c => c.value).join(', ')}</p>`;
    const pcaVars = document.querySelectorAll('.pca-check:checked');
    if (pcaVars.length) configInfo += `<p><strong>PCA Variables:</strong> ${Array.from(pcaVars).map(c => c.value).join(', ')}</p>`;

    // Build SEM path info
    let semInfo = '';
    if (method === 'sem' && state.pathEdges.length) {
      semInfo = '<h3>Specified Paths</h3><ul>';
      state.pathEdges.forEach(e => { semInfo += `<li>${e.from} → ${e.to}</li>`; });
      semInfo += '</ul>';
    }

    // Build AHP info
    let ahpInfo = '';
    if (method === 'ahp') {
      const critNames = Array.from(document.querySelectorAll('.ahp-crit-name')).map(inp => inp.value.trim());
      const altNames = Array.from(document.querySelectorAll('.ahp-alt-name')).map(inp => inp.value.trim());
      ahpInfo = `<h3>Decision Framework</h3>
        <p><strong>Criteria:</strong> ${critNames.join(', ')}</p>
        <p><strong>Alternatives:</strong> ${altNames.join(', ')}</p>`;
    }

    // Get results HTML
    const resultsEl = document.getElementById('resultsContent');
    const resultsHTML = resultsEl ? resultsEl.innerHTML : '';

    // Build full report HTML
    const reportHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Scientific Data Analysis Report</title>
  <style>
    @page { margin: 20mm 15mm; }
    * { margin:0; padding:0; box-sizing:border-box; }
    body {
      font-family: 'Times New Roman', 'Georgia', serif;
      color: #1a1a1a; background: #fff; line-height: 1.7;
      padding: 20px 30px;
    }
    .report-title {
      text-align: center; font-size: 22px; font-weight: 700;
      color: #1a1a2e; margin-bottom: 4px; padding-bottom: 8px;
      border-bottom: 3px double #6366f1;
    }
    .report-subtitle {
      text-align: center; font-size: 13px; color: #666;
      margin-bottom: 24px;
    }
    .meta-table { width:100%; border-collapse:collapse; margin-bottom:20px; font-size:13px; }
    .meta-table td { padding:4px 12px; border:1px solid #ddd; }
    .meta-table td:first-child { font-weight:600; background:#f5f5f9; width:160px; }
    h2 { font-size:17px; color:#6366f1; margin:20px 0 10px; padding-bottom:4px; border-bottom:1px solid #ddd; }
    h3 { font-size:14px; color:#333; margin:14px 0 8px; }
    .method-section { margin-bottom:24px; }
    .config-block { background:#f8f9fc; border-left:4px solid #6366f1; padding:12px 16px; margin:10px 0; font-size:13px; }
    .results-block { margin:12px 0; }
    .chart-img { max-width:100%; height:auto; display:block; margin:16px auto; border:1px solid #eee; }
    table { width:100%; border-collapse:collapse; margin:10px 0; font-size:12px; }
    th { background:#f0f1f5; color:#333; padding:6px 10px; text-align:left; border:1px solid #ddd; font-weight:600; }
    td { padding:5px 10px; border:1px solid #ddd; }
    tr:nth-child(even) td { background:#fafbfd; }
    .stat-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(130px,1fr)); gap:6px; margin:10px 0; }
    .stat-item { background:#f5f5f9; padding:8px; text-align:center; border:1px solid #ddd; border-radius:4px; }
    .stat-item .label { font-size:10px; color:#888; text-transform:uppercase; letter-spacing:0.5px; }
    .stat-item .value { font-size:14px; font-weight:600; color:#1a1a2e; margin-top:2px; }
    .interpretation-block { background:#f0f4ff; border-left:4px solid #6366f1; padding:14px 18px; margin:14px 0; font-size:13px; line-height:1.8; }
    .footer { text-align:center; font-size:11px; color:#aaa; margin-top:30px; padding-top:10px; border-top:1px solid #eee; }
    ul { margin:6px 0 6px 20px; font-size:13px; }
    li { margin-bottom:3px; }
    .chart-container { display:none !important; }
    .result-card .chart-container { display:none !important; }
    .page-break { page-break-after:always; }
  </style>
</head>
<body>
  <div class="report-title">Scientific Data Analysis Report</div>
  <div class="report-subtitle">Comprehensive Statistical Report for Decision Making</div>

  <table class="meta-table">
    <tr><td>Report Generated</td><td>${dateStr}</td></tr>
    <tr><td>Data File</td><td>${fileName}</td></tr>
    <tr><td>Sheet</td><td>${sheetName}</td></tr>
    <tr><td>Analysis Method</td><td>${methodNames[method] || method}</td></tr>
  </table>

  <div class="method-section">
    <h2>1. Analysis Configuration</h2>
    <div class="config-block">
      <p><strong>Method:</strong> ${methodNames[method] || method}</p>
      ${configInfo}
      ${semInfo}
      ${ahpInfo}
    </div>
  </div>

  <div class="method-section">
    <h2>2. Results</h2>
    <div class="results-block">
      ${resultsHTML.replace(/<canvas[^>]*><\/canvas>/g, '')}
    </div>
  </div>

  ${chartImages['chart-descriptive'] ? `<div class="page-break"></div><h2>3. Charts</h2><h3>Distribution (Density Plot)</h3><img class="chart-img" src="${chartImages['chart-descriptive']}" alt="Descriptive Chart">` : ''}
  ${chartImages['chart-anova'] ? `<h3>ANOVA Group Means</h3><img class="chart-img" src="${chartImages['chart-anova']}" alt="ANOVA Chart">` : ''}
  ${chartImages['chart-regression'] ? `<h3>Residuals vs Fitted</h3><img class="chart-img" src="${chartImages['chart-regression']}" alt="Regression Chart">` : ''}
  ${chartImages['chart-pca'] ? `<h3>PCA Score Plot</h3><img class="chart-img" src="${chartImages['chart-pca']}" alt="PCA Chart">` : ''}
  ${chartImages['chart-ahp'] ? `<h3>AHP Criteria Weights</h3><img class="chart-img" src="${chartImages['chart-ahp']}" alt="AHP Chart">` : ''}

  ${!Object.values(chartImages).some(Boolean) ? '' : ''}

  <div class="footer">
    <p>Generated by Scientific Data Analyzer &mdash; ${dateStr}</p>
  </div>

  <script>
    window.onload = function() { window.print(); };
  <\/script>
</body>
</html>`;

    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) {
      setStatus('Please allow pop-ups for PDF report', true);
      return;
    }
    printWindow.document.write(reportHTML);
    printWindow.document.close();
    setStatus('Report generated');
  }

  function toggleTheme() {
    const root = document.documentElement;
    if (state.currentTheme === 'dark') {
      root.style.setProperty('--bg-primary', '#f8f9fc');
      root.style.setProperty('--bg-secondary', '#f0f1f5');
      root.style.setProperty('--bg-card', '#ffffff');
      root.style.setProperty('--bg-card-hover', '#f8f9fc');
      root.style.setProperty('--bg-input', '#f0f1f5');
      root.style.setProperty('--text-primary', '#1a1d27');
      root.style.setProperty('--text-secondary', '#5a6480');
      root.style.setProperty('--text-muted', '#8b95b0');
      root.style.setProperty('--border', '#d1d5db');
      root.style.setProperty('--shadow', '0 4px 24px rgba(0,0,0,0.08)');
      state.currentTheme = 'light';
    } else {
      root.style.setProperty('--bg-primary', '#0f1117');
      root.style.setProperty('--bg-secondary', '#1a1d27');
      root.style.setProperty('--bg-card', '#1e2230');
      root.style.setProperty('--bg-card-hover', '#252a3a');
      root.style.setProperty('--bg-input', '#151820');
      root.style.setProperty('--text-primary', '#e8ecf4');
      root.style.setProperty('--text-secondary', '#8b95b0');
      root.style.setProperty('--text-muted', '#5a6480');
      root.style.setProperty('--border', '#2a2f42');
      root.style.setProperty('--shadow', '0 4px 24px rgba(0,0,0,0.3)');
      state.currentTheme = 'dark';
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
