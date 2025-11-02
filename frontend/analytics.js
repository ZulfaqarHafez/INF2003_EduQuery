// ========== 1. Load Zone Statistics ==========
window.loadZoneStatistics = async function() {
  const container = document.getElementById('zoneStatsContent');
  container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  
  try {
    const res = await fetch('/api/analytics/schools-by-zone');
    const result = await res.json();
    
    if (result.success && result.data.length > 0) {
      let html = '<table class="analytics-table">';
      html += '<thead><tr><th>Zone</th><th>Total Schools</th><th>School Types</th><th>Avg Address Length</th></tr></thead>';
      html += '<tbody>';
      
      result.data.forEach(row => {
        html += `<tr>
          <td><span class="zone-badge zone-${row.zone_code.toLowerCase()}">${row.zone_code}</span></td>
          <td><strong>${row.total_schools}</strong></td>
          <td>${row.school_types}</td>
          <td>${row.avg_address_length} chars</td>
        </tr>`;
      });
      
      html += '</tbody></table>';
      container.innerHTML = html;
    } else {
      container.innerHTML = '<div class="empty-state-small">No data available</div>';
    }
  } catch (err) {
    console.error('Zone statistics error:', err);
    container.innerHTML = '<div class="error-state">Failed to load data</div>';
  }
};

// ========== 2. Load Subject Count ==========
window.loadSubjectCount = async function() {
  const container = document.getElementById('subjectCountContent');
  container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  
  try {
    const res = await fetch('/api/analytics/schools-subject-count');
    const result = await res.json();
    
    if (result.success && result.data.length > 0) {
      let html = `<div class="analytics-summary">
        <div class="summary-item">
          <span class="summary-label">Schools Analyzed:</span>
          <span class="summary-value">${result.summary.total_schools}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">Avg Subjects:</span>
          <span class="summary-value">${result.summary.avg_subjects}</span>
        </div>
      </div>`;
      
      html += '<table class="analytics-table compact">';
      html += '<thead><tr><th>School Name</th><th>Zone</th><th>Subjects</th><th>Diversity</th></tr></thead>';
      html += '<tbody>';
      
      result.data.slice(0, 10).forEach(row => {
        const diversityClass = row.subject_diversity.toLowerCase();
        html += `<tr>
          <td>${row.school_name}</td>
          <td><span class="zone-badge zone-${row.zone_code.toLowerCase()}">${row.zone_code}</span></td>
          <td><strong>${row.subject_count}</strong></td>
          <td><span class="diversity-badge diversity-${diversityClass}">${row.subject_diversity}</span></td>
        </tr>`;
      });
      
      html += '</tbody></table>';
      
      if (result.data.length > 10) {
        html += `<div class="table-footer">Showing top 10 of ${result.data.length} schools</div>`;
      }
      
      container.innerHTML = html;
    } else {
      container.innerHTML = '<div class="empty-state-small">No data available</div>';
    }
  } catch (err) {
    console.error('Subject count error:', err);
    container.innerHTML = '<div class="error-state">Failed to load data</div>';
  }
};

// ========== 3. Load Above Average Schools ==========
window.loadAboveAverage = async function() {
  const container = document.getElementById('aboveAverageContent');
  container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  
  try {
    const res = await fetch('/api/analytics/above-average-subjects');
    const result = await res.json();
    
    if (result.success && result.data.length > 0) {
      const avgCount = result.data[0].system_average;
      
      let html = `<div class="analytics-summary">
        <div class="summary-item">
          <span class="summary-label">System Average:</span>
          <span class="summary-value">${avgCount} subjects</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">Above Average:</span>
          <span class="summary-value">${result.data.length} schools</span>
        </div>
      </div>`;
      
      html += '<table class="analytics-table compact">';
      html += '<thead><tr><th>School Name</th><th>Zone</th><th>Subjects</th><th>+/- Avg</th></tr></thead>';
      html += '<tbody>';
      
      result.data.slice(0, 10).forEach(row => {
        html += `<tr>
          <td>${row.school_name}</td>
          <td><span class="zone-badge zone-${row.zone_code.toLowerCase()}">${row.zone_code}</span></td>
          <td><strong>${row.subject_count}</strong></td>
          <td><span class="positive-diff">+${row.difference}</span></td>
        </tr>`;
      });
      
      html += '</tbody></table>';
      
      if (result.data.length > 10) {
        html += `<div class="table-footer">Showing top 10 of ${result.data.length} schools</div>`;
      }
      
      container.innerHTML = html;
    } else {
      container.innerHTML = '<div class="empty-state-small">No schools above average</div>';
    }
  } catch (err) {
    console.error('Above average error:', err);
    container.innerHTML = '<div class="error-state">Failed to load data</div>';
  }
};

// ========== 4. Load CCA Participation ==========
window.loadCCAParticipation = async function() {
  const container = document.getElementById('ccaParticipationContent');
  container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  
  try {
    const res = await fetch('/api/analytics/cca-participation');
    const result = await res.json();
    
    if (result.success && result.data.length > 0) {
      let html = '<table class="analytics-table compact">';
      html += '<thead><tr><th>CCA Name</th><th>Schools</th><th>Offerings</th><th>% Schools</th></tr></thead>';
      html += '<tbody>';
      
      result.data.forEach(row => {
        const percentage = parseFloat(row.percentage_of_schools);
        const barWidth = Math.min(percentage, 100);
        
        html += `<tr>
          <td><strong>${row.cca_generic_name}</strong></td>
          <td>${row.school_count}</td>
          <td>${row.total_offerings}</td>
          <td>
            <div class="percentage-bar-container">
              <div class="percentage-bar" style="width: ${barWidth}%"></div>
              <span class="percentage-text">${percentage}%</span>
            </div>
          </td>
        </tr>`;
      });
      
      html += '</tbody></table>';
      container.innerHTML = html;
    } else {
      container.innerHTML = '<div class="empty-state-small">No data available</div>';
    }
  } catch (err) {
    console.error('CCA participation error:', err);
    container.innerHTML = '<div class="error-state">Failed to load data</div>';
  }
};

// ========== 5. Load Data Completeness ==========
window.loadDataCompleteness = async function() {
  const container = document.getElementById('dataCompletenessContent');
  container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  
  try {
    const res = await fetch('/api/analytics/data-completeness');
    const result = await res.json();
    
    if (result.success && result.data.length > 0) {
      let html = `<div class="analytics-summary">
        <div class="summary-item">
          <span class="summary-label">Complete:</span>
          <span class="summary-value">${result.summary.complete_schools}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">Good:</span>
          <span class="summary-value">${result.summary.good_schools}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">Fair:</span>
          <span class="summary-value">${result.summary.fair_schools}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">Incomplete:</span>
          <span class="summary-value">${result.summary.incomplete_schools}</span>
        </div>
      </div>`;
      
      html += '<table class="analytics-table compact">';
      html += '<thead><tr><th>School Name</th><th>Score</th><th>Status</th><th>S/C/P/D</th></tr></thead>';
      html += '<tbody>';
      
      result.data.slice(0, 15).forEach(row => {
        const statusClass = row.completeness_status.toLowerCase();
        html += `<tr>
          <td>${row.school_name}</td>
          <td>
            <div class="score-bar-container">
              <div class="score-bar score-${statusClass}" style="width: ${row.completeness_score}%"></div>
              <span class="score-text">${row.completeness_score}%</span>
            </div>
          </td>
          <td><span class="status-badge status-${statusClass}">${row.completeness_status}</span></td>
          <td class="data-counts">${row.subject_count}/${row.cca_count}/${row.programme_count}/${row.distinctive_count}</td>
        </tr>`;
      });
      
      html += '</tbody></table>';
      
      if (result.data.length > 15) {
        html += `<div class="table-footer">Showing top 15 of ${result.data.length} schools</div>`;
      }
      
      container.innerHTML = html;
    } else {
      container.innerHTML = '<div class="empty-state-small">No data available</div>';
    }
  } catch (err) {
    console.error('Data completeness error:', err);
    container.innerHTML = '<div class="error-state">Failed to load data</div>';
  }
};

// ========== 6. Load Zone Comparison ==========
window.loadZoneComparison = async function() {
  const container = document.getElementById('zoneComparisonContent');
  container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  
  try {
    const res = await fetch('/api/analytics/zone-comparison');
    const result = await res.json();
    
    if (result.success && result.data.length > 0) {
      let html = '<table class="analytics-table">';
      html += `<thead><tr>
        <th>Zone</th>
        <th>Schools</th>
        <th>Types</th>
        <th>Unique Subjects</th>
        <th>Unique CCAs</th>
        <th>Avg Subjects/School</th>
        <th>Avg CCAs/School</th>
      </tr></thead>`;
      html += '<tbody>';
      
      result.data.forEach(row => {
        html += `<tr>
          <td><span class="zone-badge zone-${row.zone_code.toLowerCase()}">${row.zone_code}</span></td>
          <td><strong>${row.total_schools}</strong></td>
          <td>${row.school_types}</td>
          <td>${row.unique_subjects || 0}</td>
          <td>${row.unique_ccas || 0}</td>
          <td>${row.avg_subjects_per_school || '0.00'}</td>
          <td>${row.avg_ccas_per_school || '0.00'}</td>
        </tr>`;
      });
      
      html += '</tbody></table>';
      container.innerHTML = html;
    } else {
      container.innerHTML = '<div class="empty-state-small">No data available</div>';
    }
  } catch (err) {
    console.error('Zone comparison error:', err);
    container.innerHTML = '<div class="error-state">Failed to load data</div>';
  }
};

// ========== Load All Analytics ==========
window.loadAllAnalytics = function() {
  loadZoneStatistics();
  loadSubjectCount();
  loadAboveAverage();
  loadCCAParticipation();
  loadDataCompleteness();
  loadZoneComparison();
  
  showToast('Loading all analytics...', 'info');
};

// ========== Initialize Analytics When View is Shown ==========
// Add this to your switchView function to auto-load analytics
// if (viewName === 'analytics') {
//   setTimeout(() => loadAllAnalytics(), 100);
// }

console.log('Analytics functions loaded');