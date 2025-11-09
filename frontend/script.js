let pendingDeleteId = null;
let pendingDeleteName = null;

// ========== MAKE FUNCTIONS GLOBAL ==========
// All functions must be in global scope for inline onclick to work

window.switchView = function (viewName) {
  console.log('Switching to view:', viewName);

  const views = document.querySelectorAll('.view');
  const navBtns = document.querySelectorAll('.nav-btn');

  views.forEach(view => view.classList.remove('active'));
  navBtns.forEach(btn => btn.classList.remove('active'));

  const targetView = document.getElementById(`${viewName}View`);
  const targetBtn = document.querySelector(`[data-view="${viewName}"]`);

  if (targetView) {
    targetView.classList.add('active');
    console.log('View activated:', viewName);
  } else {
    console.error('View not found:', `${viewName}View`);
  }

  if (targetBtn) {
    targetBtn.classList.add('active');
  }

  // Load stats when switching to manage view
  if (viewName === 'manage') {
    loadSchoolStats();
  }

  if (viewName === 'map') {
    // Wait for view transition to complete before initializing map
    setTimeout(() => {
      if (!window.mapInitialized) {
        // Check if map container is visible
        const mapView = document.getElementById('mapView');
        if (mapView && mapView.classList.contains('active')) {
          if (typeof initializeMap === 'function') {
            try {
              initializeMap();
              loadSchoolsMap();
              window.mapInitialized = true;
            } catch (error) {
              console.error('Map initialization error:', error);
              window.mapInitialized = false;
            }
          }
        }
      } else {
        // If map already exists, just invalidate size to ensure proper rendering
        if (window.map) {
          try {
            map.invalidateSize();
          } catch (error) {
            console.error('Map resize error:', error);
          }
        }
      }
    }, 300);
  }
};

// Add event listeners to nav buttons
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM Loaded - Attaching event listeners');

  const navBtns = document.querySelectorAll('.nav-btn');
  console.log('Found nav buttons:', navBtns.length);

  navBtns.forEach((btn, index) => {
    console.log(`Nav button ${index}:`, btn.dataset.view);
    btn.addEventListener('click', () => {
      console.log('Button clicked:', btn.dataset.view);
      switchView(btn.dataset.view);
    });
  });

  // Allow Enter key to trigger search
  const searchBox = document.getElementById('searchBox');
  if (searchBox) {
    searchBox.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        runQuery();
      }
    });

    // Live Partial Search Suggestions (Universal)
    let searchTimeout;
    let dropdown = document.getElementById('searchSuggestions');
    if (!dropdown) {
      dropdown = document.createElement('div');
      dropdown.id = 'searchSuggestions';
      dropdown.className = 'search-results';
      searchBox.parentElement.appendChild(dropdown);
    }

    searchBox.addEventListener('input', () => {
      const query = searchBox.value.trim();
      dropdown.innerHTML = '';
      dropdown.style.display = 'none';
      clearTimeout(searchTimeout);

      if (query.length < 2) return;

      searchTimeout = setTimeout(async () => {
        try {
          const res = await fetch(`/api/search/universal?query=${encodeURIComponent(query)}`);
          const data = await res.json();
          if (!data.success || !data.results) return;

          const results = [
            ...data.results.schools,
            ...data.results.subjects,
            ...data.results.ccas,
            ...data.results.programmes,
            ...data.results.distinctives
          ];

          if (results.length === 0) {
            dropdown.innerHTML = `<div class="suggestion-item no-results">No matches found</div>`;
          } else {
            results.slice(0, 10).forEach((item) => {
              const name = item.name || item.school_name || item.subject_desc || 'Unnamed';
              const el = document.createElement('div');
              el.className = 'suggestion-item';
              el.textContent = name;
              el.onclick = () => {
                searchBox.value = name;
                dropdown.style.display = 'none';
                runQuery();
              };
              dropdown.appendChild(el);
            });
          }

          dropdown.style.display = 'block';
        } catch (err) {
          console.error('Live search error:', err);
        }
      }, 250);
    });

    document.addEventListener('click', (e) => {
      if (!dropdown.contains(e.target) && e.target !== searchBox) {
        dropdown.style.display = 'none';
      }
    });
  }

  // Load school statistics on page load
  loadSchoolStats();
});


// ========== Search Functionality ==========
window.runQuery = async function () {
  const school = document.getElementById("searchBox").value.trim();
  const queryType = document.getElementById("queryType").value;

  if (!school) {
    showToast('Please enter a school name', 'error');
    return;
  }

  let url = "";
  if (queryType === "all") url = `/api/schools?name=${encodeURIComponent(school)}`;
  if (queryType === "subjects") url = `/api/schools/subjects?name=${encodeURIComponent(school)}`;
  if (queryType === "ccas") url = `/api/schools/ccas?name=${encodeURIComponent(school)}`;
  if (queryType === "programmes") url = `/api/schools/programmes?name=${encodeURIComponent(school)}`;
  if (queryType === "distinctives") url = `/api/schools/distinctives?name=${encodeURIComponent(school)}`;

  // Show loading spinner
  showLoading(true);

  try {
    const res = await fetch(url);
    const data = await res.json();

    hideLoading();

    if (data.error) {
      showToast(data.error, 'error');
      renderEmpty('Error loading data');
      return;
    }

    renderTable(data, queryType);
    updateResultsMeta(data.length, school);
  } catch (err) {
    hideLoading();
    showToast('Failed to fetch data: ' + err.message, 'error');
    renderEmpty('Connection error');
  }
};

function showLoading(show) {
  const spinner = document.getElementById('loadingSpinner');
  const resultsTable = document.getElementById('resultsTable');

  if (show) {
    spinner.style.display = 'flex';
    resultsTable.innerHTML = '';
  } else {
    spinner.style.display = 'none';
  }
}

function hideLoading() {
  showLoading(false);
}

function updateResultsMeta(count, query) {
  const meta = document.getElementById('resultsMeta');
  const queryType = document.getElementById('queryType').value;

  if (!count || count === 0) {
    meta.textContent = `No results found for "${query}"`;
  } else {
    const typeLabel = {
      'all': 'school(s)',
      'subjects': 'subject result(s)',
      'ccas': 'CCA result(s)',
      'programmes': 'programme result(s)',
      'distinctives': 'distinctive programme result(s)'
    }[queryType] || 'result(s)';

    meta.textContent = `Found ${count} ${typeLabel} matching "${query}"`;
  }
}

function renderEmpty(message) {
  document.getElementById("resultsTable").innerHTML = `
    <div class="empty-state">
      <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
        <circle cx="32" cy="32" r="30" stroke="#E5E7EB" stroke-width="4"/>
        <path d="M32 20v24M20 32h24" stroke="#E5E7EB" stroke-width="4" stroke-linecap="round"/>
      </svg>
      <h3>${message}</h3>
      <p>Try adjusting your search query</p>
    </div>
  `;
}

// ========== Table Rendering ==========
function renderTable(data, queryType) {
  const container = document.getElementById("resultsTable");
  
  // Handle empty or invalid data
  if (!data || !Array.isArray(data) || data.length === 0) {
    renderEmpty('No results found');
    return;
  }

  let html = '<div style="overflow-x: auto;"><table class="data-table"><thead><tr>';
  
  // Define columns based on query type
  if (queryType === 'all') {
    // School search - show all school fields + actions
    const keys = Object.keys(data[0]);
    keys.forEach(k => {
      const formattedKey = k.split('_').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1)
      ).join(' ');
      html += `<th>${formattedKey}</th>`;
    });
    html += '<th>Actions</th>';
  } else if (queryType === 'subjects') {
    html += '<th>School Name</th>';
    html += '<th>Zone Code</th>';
    html += '<th>Level</th>';
    html += '<th>Subject</th>';
  } else if (queryType === 'ccas') {
    html += '<th>School Name</th>';
    html += '<th>Zone Code</th>';
    html += '<th>Level</th>';
    html += '<th>CCA</th>';
  } else if (queryType === 'programmes') {
    html += '<th>School Name</th>';
    html += '<th>Zone Code</th>';
    html += '<th>Level</th>';
    html += '<th>Programme</th>';
  } else if (queryType === 'distinctives') {
    html += '<th>School Name</th>';
    html += '<th>Zone Code</th>';
    html += '<th>Level</th>';
    html += '<th>Distinctive Programme</th>';
  }
  
  html += '</tr></thead><tbody>';

  data.forEach(row => {
    if (queryType === 'all') {
      // Show all fields for school search
      html += '<tr>';
      const keys = Object.keys(data[0]);
      keys.forEach(k => {
        let value = row[k];
        if (value === null || value === undefined || value === '' || 
            String(value).toUpperCase() === 'NA' || 
            String(value).toUpperCase() === 'N/A') {
          value = '-';
        }
        html += `<td>${value}</td>`;
      });
      
      // Add action buttons for schools
      if (row.school_id) {
        html += `
          <td>
            <div class="action-buttons">
              <button class="btn-edit" onclick='editSchool(${JSON.stringify(row).replace(/'/g, "&apos;")})'>
                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/>
                </svg>
                Edit
              </button>
              <button class="btn-danger" onclick='deleteSchool(${row.school_id}, "${row.school_name.replace(/'/g, "&apos;")}")'>
                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>
                </svg>
                Delete
              </button>
            </div>
          </td>
        `;
      }
      html += '</tr>';
    } else {
      // Make the row clickable for non-"all" searches
      html += `<tr data-clickable="true" onclick='viewItemDetails("schools", "${row.school_id}")' style="cursor: pointer;">`;
      
      if (queryType === 'subjects') {
        html += `<td><strong>${row.school_name || '-'}</strong></td>`;
        html += `<td><span class="badge">${row.zone_code || '-'}</span></td>`;
        html += `<td>${row.mainlevel_code || '-'}</td>`;
        html += `<td>${row.subject_desc || '-'}</td>`;
      } else if (queryType === 'ccas') {
        html += `<td><strong>${row.school_name || '-'}</strong></td>`;
        html += `<td><span class="badge">${row.zone_code || '-'}</span></td>`;
        html += `<td>${row.mainlevel_code || '-'}</td>`;
        html += `<td>${row.cca_generic_name || '-'}</td>`;
      } else if (queryType === 'programmes') {
        html += `<td><strong>${row.school_name || '-'}</strong></td>`;
        html += `<td><span class="badge">${row.zone_code || '-'}</span></td>`;
        html += `<td>${row.mainlevel_code || '-'}</td>`;
        html += `<td>${row.moe_programme_desc || '-'}</td>`;
      } else if (queryType === 'distinctives') {
        html += `<td><strong>${row.school_name || '-'}</strong></td>`;
        html += `<td><span class="badge">${row.zone_code || '-'}</span></td>`;
        html += `<td>${row.mainlevel_code || '-'}</td>`;
        html += `<td>${row.distinctive_name || row.alp_title || row.llp_title || '-'}</td>`;
      }
      
      html += '</tr>';
    }
  });

  html += '</tbody></table></div>';
  container.innerHTML = html;
}

// ========== runQuery with Universal Search Support ==========
window.runQuery = async function () {
  const school = document.getElementById("searchBox").value.trim();
  const queryType = document.getElementById("queryType").value;
  const summary = document.getElementById('universalSearchSummary');

  // Hide summary for non-universal searches
  if (summary) {
    summary.style.display = 'none';
  }

  if (!school) {
    showToast('Please enter a search term', 'error');
    return;
  }

  // Show clear button
  const clearBtn = document.getElementById('clearSearchBtn');
  if (clearBtn) clearBtn.style.display = 'flex';

  // If universal search is selected, use different endpoint
  if (queryType === 'universal') {
    performUniversalSearch(school);
    return;
  }

  // Original search logic for specific queries
  let url = "";
  if (queryType === "all") url = `/api/schools?name=${encodeURIComponent(school)}`;
  if (queryType === "subjects") url = `/api/schools/subjects?name=${encodeURIComponent(school)}`;
  if (queryType === "ccas") url = `/api/schools/ccas?name=${encodeURIComponent(school)}`;
  if (queryType === "programmes") url = `/api/schools/programmes?name=${encodeURIComponent(school)}`;
  if (queryType === "distinctives") url = `/api/schools/distinctives?name=${encodeURIComponent(school)}`;

  // Show loading spinner
  showLoading(true);

  try {
    const res = await fetch(url);
    const data = await res.json();

    hideLoading();

    if (data.error) {
      showToast(data.error, 'error');
      renderEmpty('Error loading data');
      updateResultsMeta(0, school);
      return;
    }

    // Render results
    renderTable(data, queryType);
    updateResultsMeta(data.length, school);

    // Show appropriate toast
    if (data.length === 0) {
      showToast('No results found', 'info');
    } else {
      showToast(`Found ${data.length} result(s)`, 'success');
    }
  } catch (err) {
    hideLoading();
    showToast('Failed to fetch data: ' + err.message, 'error');
    renderEmpty('Connection error');
    updateResultsMeta(0, school);
  }
};

// ========== Universal Search Function ==========
async function performUniversalSearch(query) {
  const loading = document.getElementById('loadingSpinner');
  const results = document.getElementById('resultsTable');
  const summary = document.getElementById('universalSearchSummary');
  const meta = document.getElementById('resultsMeta');

  // Hide summary initially
  if (summary) summary.style.display = 'none';

  // Show loading
  loading.style.display = 'flex';
  results.innerHTML = '';

  try {
    const response = await fetch(`/api/search/universal?query=${encodeURIComponent(query)}`);
    const data = await response.json();

    loading.style.display = 'none';

    if (!data.success) {
      showToast(data.message || 'Search failed', 'error');
      renderEmpty('No results found');
      meta.textContent = `No results found for "${query}"`;
      return;
    }

    // Update summary
    updateUniversalSearchSummary(data.results);

    // Render results
    renderUniversalSearchResults(data.results, query);

    // Update meta
    if (data.results.total === 0) {
      meta.textContent = `No results found for "${query}"`;
      showToast('No results found', 'info');
    } else {
      meta.textContent = `Found ${data.results.total} results across all categories for "${query}"`;
      showToast(`Found ${data.results.total} results`, 'success');
    }

  } catch (error) {
    loading.style.display = 'none';
    console.error('Universal search error:', error);
    showToast('Search failed: ' + error.message, 'error');
    renderEmpty('Connection error');
    meta.textContent = 'Search failed';
  }
}

// ========== Update Universal Search Summary ==========
function updateUniversalSearchSummary(results) {
  const summary = document.getElementById('universalSearchSummary');

  if (!summary) return;

  document.getElementById('totalResults').textContent = results.total;
  document.getElementById('schoolResults').textContent = results.schools.length;
  document.getElementById('subjectResults').textContent = results.subjects.length;
  document.getElementById('ccaResults').textContent = results.ccas.length;
  document.getElementById('programmeResults').textContent = results.programmes.length;
  document.getElementById('distinctiveResults').textContent = results.distinctives.length;

  summary.style.display = 'block';
}

// ========== Render Universal Search Results ==========
function renderUniversalSearchResults(results, query) {
  const container = document.getElementById('resultsTable');

  if (results.total === 0) {
    renderEmpty('No results found');
    return;
  }

  let html = '<div class="universal-results">';

  // Schools
  if (results.schools.length > 0) {
    html += renderCategory('schools', 'Schools', results.schools, query);
  }

  // Subjects
  if (results.subjects.length > 0) {
    html += renderCategory('subjects', 'Subjects', results.subjects, query);
  }

  // CCAs
  if (results.ccas.length > 0) {
    html += renderCategory('ccas', 'CCAs', results.ccas, query);
  }

  // Programmes
  if (results.programmes.length > 0) {
    html += renderCategory('programmes', 'Programmes', results.programmes, query);
  }

  // Distinctives
  if (results.distinctives.length > 0) {
    html += renderCategory('distinctives', 'Distinctive Programmes', results.distinctives, query);
  }

  html += '</div>';
  container.innerHTML = html;
}

// ========== Render Category ==========
function renderCategory(type, title, items, query) {
  const icons = {
    schools: '<path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"/>',
    subjects: '<path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z"/>',
    ccas: '<path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z"/>',
    programmes: '<path fill-rule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z"/>',
    distinctives: '<path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>'
  };
  
  let html = `
    <div class="results-category">
      <div class="category-header">
        <div class="category-title">
          <div class="category-icon ${type}">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              ${icons[type]}
            </svg>
          </div>
          <h3>${title}</h3>
        </div>
        <span class="category-count">${items.length} result${items.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="results-list">
  `;
  
  items.forEach(item => {
    const itemHtml = renderResultItem(type, item, query);
    if (itemHtml) { // Only add if valid HTML returned
      html += itemHtml;
    }
  });
  
  html += '</div></div>';
  return html;
}

/// ========== Render Result Item (FIXED) ==========
function renderResultItem(type, item, query) {
  console.log('Rendering item:', type, item); // Debug log
  
  // Get the correct ID based on type
  let itemId;
  if (type === 'schools') {
    itemId = item.school_id || item.id;
  } else {
    // For all non-school types, use school_id since they're linked to schools
    itemId = item.school_id;
  }
  
  console.log('Item ID:', itemId); // Debug log
  
  // Don't render if no valid ID
  if (!itemId) {
    console.warn('No valid ID for item:', item);
    return '';
  }
  
  let html = `<div class="result-item" onclick='viewItemDetails("schools", ${itemId})'>`;
  html += '<div class="result-item-header">';
  
  // Title with highlighted search term
  const name = item.name || item.school_name || item.subject_desc || item.cca_generic_name || item.moe_programme_desc || 'Unnamed';
  const highlightedName = highlightSearchTerm(name, query);
  html += `<div class="result-item-title">${highlightedName}</div>`;
  
  html += '</div>';
  
  // Description
  if (item.description) {
    const truncatedDesc = item.description.length > 150 
      ? item.description.substring(0, 150) + '...'
      : item.description;
    html += `<div class="result-item-description">${truncatedDesc}</div>`;
  }
  
  // Meta tags
  html += '<div class="result-item-meta">';
  
  if (type === 'schools') {
    if (item.zone_code) {
      html += `<span class="meta-tag zone-${item.zone_code.toLowerCase()}">${item.zone_code}</span>`;
    }
    if (item.mainlevel_code) {
      html += `<span class="meta-tag">${item.mainlevel_code}</span>`;
    }
    if (item.principal_name) {
      html += `<span class="meta-tag">
        <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"/>
        </svg>
        ${item.principal_name}
      </span>`;
    }
  } else {
    // For non-school items, show the zone and level
    if (item.zone_code) {
      html += `<span class="meta-tag zone-${item.zone_code.toLowerCase()}">${item.zone_code}</span>`;
    }
    if (item.mainlevel_code) {
      html += `<span class="meta-tag">${item.mainlevel_code}</span>`;
    }
  }
  
  html += '</div>';
  html += '</div>';
  
  return html;
}

// ========== Highlight Search Term ==========
function highlightSearchTerm(text, searchTerm) {
  if (!text || !searchTerm) return text;

  const regex = new RegExp(`(${searchTerm})`, 'gi');
  return text.replace(regex, '<mark>$1</mark>');
}

// ========== View Item Details ==========
window.viewItemDetails = async function(type, id) {
    console.log('Viewing details for:', type, id);
    
    if (!id) {
        showToast('Invalid item ID', 'error');
        return;
    }
    
    showToast('Loading details...', 'info');
    
    try {
        if (type === 'schools') {
            // Load comprehensive school data
            const fullData = await loadFullSchoolDetails(id);
            if (fullData) {
                displayEnhancedSchoolModal(fullData);
            }
        } else {
            // Original logic for non-school items
            let response = await fetch(`/api/search/details/${type}/${id}`);
            const data = await response.json();
            
            if (!data.success) {
                showToast(data.error || 'Failed to load details', 'error');
                return;
            }
            
            displayItemDetailsModal(type, data.data);
        }
    } catch (error) {
        console.error('Error loading details:', error);
        showToast(`Failed to load details: ${error.message}`, 'error');
    }
}

// ========== Display Item Details Modal ==========
function displayItemDetailsModal(type, data) {
  let html = '<div class="modal active" id="detailsModal">';
  html += '<div class="modal-overlay" onclick="closeDetailsModal()"></div>';
  html += '<div class="modal-content">';
  html += '<div class="modal-header">';
  html += `<h3>${getTypeTitle(type)} Details</h3>`;
  html += '<button class="modal-close" onclick="closeDetailsModal()">×</button>';
  html += '</div>';
  html += '<div class="detail-modal-content">';
  
  // Always render as school details since we're fetching school by ID
  html += renderSchoolDetails(data);
  
  html += '</div>';
  html += '</div>';
  html += '</div>';
  
  document.body.insertAdjacentHTML('beforeend', html);
  document.body.style.overflow = 'hidden';
}

// ========== Close Details Modal ==========
window.closeDetailsModal = function () {
  const modal = document.getElementById('detailsModal');
  if (modal) {
    modal.remove();
    document.body.style.overflow = 'auto';
  }
};

// ========== Render School Details ==========
function renderSchoolDetails(school) {
  if (!school) {
    return '<div class="detail-header"><p>No data available</p></div>';
  }
  
  let html = `
    <div class="detail-header">
      <h4 class="detail-title">${school.school_name || 'Unknown School'}</h4>
      <div class="detail-grid">
  `;
  
  // Basic Info
  if (school.address) {
    html += `<div class="detail-row"><strong>Address:</strong> <span>${school.address}</span></div>`;
  }
  if (school.postal_code) {
    html += `<div class="detail-row"><strong>Postal Code:</strong> <span>${school.postal_code}</span></div>`;
  }
  if (school.zone_code) {
    html += `<div class="detail-row"><strong>Zone:</strong> <span class="meta-tag zone-${school.zone_code.toLowerCase()}">${school.zone_code}</span></div>`;
  }
  if (school.mainlevel_code) {
    html += `<div class="detail-row"><strong>Level:</strong> <span>${school.mainlevel_code}</span></div>`;
  }
  
  // Personnel
  if (school.principal_name) {
    html += `<div class="detail-row"><strong>Principal:</strong> <span>${school.principal_name}</span></div>`;
  }
  if (school.first_vp_name) {
    html += `<div class="detail-row"><strong>Vice Principal:</strong> <span>${school.first_vp_name}</span></div>`;
  }
  
  // Contact Info
  if (school.email_address) {
    html += `<div class="detail-row"><strong>Email:</strong> <span>${school.email_address}</span></div>`;
  }
  if (school.telephone_no) {
    html += `<div class="detail-row"><strong>Phone:</strong> <span>${school.telephone_no}</span></div>`;
  }
  
  // School Type
  if (school.type_code) {
    html += `<div class="detail-row"><strong>Type:</strong> <span>${school.type_code}</span></div>`;
  }
  if (school.nature_code) {
    html += `<div class="detail-row"><strong>Nature:</strong> <span>${school.nature_code}</span></div>`;
  }
  
  // Indicators
  const indicators = [];
  if (school.autonomous_ind === 'Yes') indicators.push('Autonomous');
  if (school.gifted_ind === 'Yes') indicators.push('Gifted');
  if (school.ip_ind === 'Yes') indicators.push('IP');
  if (school.sap_ind === 'Yes') indicators.push('SAP');
  
  if (indicators.length > 0) {
    html += `<div class="detail-row"><strong>Programmes:</strong> <span>${indicators.join(', ')}</span></div>`;
  }
  
  // Transport
  if (school.mrt_desc) {
    html += `<div class="detail-row"><strong>MRT:</strong> <span>${school.mrt_desc}</span></div>`;
  }
  if (school.bus_desc) {
    const busDesc = school.bus_desc.length > 100 
      ? school.bus_desc.substring(0, 100) + '...' 
      : school.bus_desc;
    html += `<div class="detail-row"><strong>Bus Services:</strong> <span>${busDesc}</span></div>`;
  }
  
  html += `</div></div>`;
  
  // Statistics
  html += `
    <div class="detail-stats">
      <div class="detail-stat-item">
        <div class="detail-stat-label">Subjects</div>
        <div class="detail-stat-value">${school.subject_count || 0}</div>
      </div>
      <div class="detail-stat-item">
        <div class="detail-stat-label">CCAs</div>
        <div class="detail-stat-value">${school.cca_count || 0}</div>
      </div>
      <div class="detail-stat-item">
        <div class="detail-stat-label">Programmes</div>
        <div class="detail-stat-value">${school.programme_count || 0}</div>
      </div>
      <div class="detail-stat-item">
        <div class="detail-stat-label">Distinctives</div>
        <div class="detail-stat-value">${school.distinctive_count || 0}</div>
      </div>
    </div>
  `;
  
  return html;
}

// ========== Render Generic Details ==========
function renderGenericDetails(type, data) {
  let html = '<div class="detail-header">';

  const mainField = getMainField(type, data);
  html += `<h4 class="detail-title">${mainField}</h4>`;
  html += '</div>';

  if (data.schools && Array.isArray(data.schools)) {
    html += `<div class="school-list">`;
    html += `<h5>Schools offering this (${data.schools.length})</h5>`;
    html += '<div class="school-list-items">';

    data.schools.forEach(school => {
      html += `<div class="school-list-item">`;
      html += `<span>${school.school_name}</span>`;
      html += `<span class="zone-badge zone-${school.zone_code.toLowerCase()}">${school.zone_code}</span>`;
      html += '</div>';
    });

    html += '</div>';
    html += '</div>';
  }

  return html;
}

// ========== Helper Functions ==========
function getTypeTitle(type) {
  const titles = {
    school: 'School',
    subject: 'Subject',
    cca: 'CCA',
    programme: 'Programme',
    distinctive: 'Distinctive Programme'
  };
  return titles[type] || type;
}

function getMainField(type, data) {
  if (type === 'subject') return data.subject_desc;
  if (type === 'cca') return data.cca_generic_name;
  if (type === 'programme') return data.moe_programme_desc;
  if (type === 'distinctive') return data.alp_title || data.llp_title || 'Distinctive Programme';
  return 'Details';
}

// ========== Clear Search ==========
window.clearSearch = function () {
  const searchBox = document.getElementById('searchBox');
  const clearBtn = document.getElementById('clearSearchBtn');
  const summary = document.getElementById('universalSearchSummary');
  const results = document.getElementById('resultsTable');
  const meta = document.getElementById('resultsMeta');

  searchBox.value = '';
  if (clearBtn) clearBtn.style.display = 'none';
  if (summary) summary.style.display = 'none';
  if (meta) meta.textContent = '';

  results.innerHTML = `
    <div class="empty-state">
      <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
        <circle cx="32" cy="32" r="30" stroke="#E5E7EB" stroke-width="4"/>
        <path d="M32 20v24M20 32h24" stroke="#E5E7EB" stroke-width="4" stroke-linecap="round"/>
      </svg>
      <h3>No search performed yet</h3>
      <p>Try searching for a school name, subject, CCA, or programme</p>
    </div>
  `;

  searchBox.focus();
};

// Update the existing DOMContentLoaded to handle clear button visibility
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM Loaded - Attaching event listeners');

  const navBtns = document.querySelectorAll('.nav-btn');
  console.log('Found nav buttons:', navBtns.length);

  navBtns.forEach((btn, index) => {
    console.log(`Nav button ${index}:`, btn.dataset.view);
    btn.addEventListener('click', () => {
      console.log('Button clicked:', btn.dataset.view);
      switchView(btn.dataset.view);
    });
  });

  // Allow Enter key to trigger search
  const searchBox = document.getElementById('searchBox');
  if (searchBox) {
    searchBox.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        runQuery();
      }
    });

    // Show/hide clear button as user types
    searchBox.addEventListener('input', (e) => {
      const clearBtn = document.getElementById('clearSearchBtn');
      if (clearBtn) {
        clearBtn.style.display = e.target.value.trim() ? 'flex' : 'none';
      }
    });
  }

  // Load school statistics on page load
  loadSchoolStats();
});

console.log('Universal search functions integrated');
// ========== CRUD Operations (GLOBAL) ==========

// Add Modal Management
window.showAddModal = function () {
  console.log('Opening add modal');
  const modal = document.getElementById('addModal');
  if (modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  } else {
    console.error('Modal not found');
  }
};

window.hideAddModal = function () {
  console.log('Closing add modal');
  const modal = document.getElementById('addModal');
  if (modal) {
    modal.classList.remove('active');
    document.getElementById('addSchoolForm').reset();
    document.body.style.overflow = 'auto';
  }
};

// Edit Modal Management
window.showEditModal = function (school) {
  console.log('Opening edit modal for school:', school);
  const modal = document.getElementById('editModal');
  if (modal) {
    // Populate the form with school data
    document.getElementById('editSchoolId').value = school.school_id;
    document.getElementById('editSchoolName').value = school.school_name;
    document.getElementById('editAddress').value = school.address;
    document.getElementById('editPostalCode').value = school.postal_code;
    document.getElementById('editZoneCode').value = school.zone_code;
    document.getElementById('editMainlevelCode').value = school.mainlevel_code;
    document.getElementById('editPrincipalName').value = school.principal_name;

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  } else {
    console.error('Edit modal not found');
  }
};

window.hideEditModal = function () {
  console.log('Closing edit modal');
  const modal = document.getElementById('editModal');
  if (modal) {
    modal.classList.remove('active');
    document.getElementById('editSchoolForm').reset();
    document.body.style.overflow = 'auto';
  }
};

// Delete Modal Management
window.showDeleteModal = function (schoolId, schoolName) {
  console.log('Opening delete modal for:', schoolName);
  const modal = document.getElementById('deleteModal');
  if (modal) {
    pendingDeleteId = schoolId;
    pendingDeleteName = schoolName;

    document.getElementById('deleteSchoolName').textContent = schoolName;
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
};

window.hideDeleteModal = function () {
  console.log('Closing delete modal');
  const modal = document.getElementById('deleteModal');
  if (modal) {
    modal.classList.remove('active');
    pendingDeleteId = null;
    pendingDeleteName = null;
    document.body.style.overflow = 'auto';
  }
};

// Create Operation
window.addSchool = async function (event) {
  event.preventDefault();
  console.log('Adding school...');

  const schoolData = {
    school_name: document.getElementById('schoolName').value,
    address: document.getElementById('address').value,
    postal_code: document.getElementById('postalCode').value,
    zone_code: document.getElementById('zoneCode').value,
    mainlevel_code: document.getElementById('mainlevelCode').value,
    principal_name: document.getElementById('principalName').value
  };

  console.log('School data:', schoolData);

  try {
    const res = await fetch('/api/schools', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(schoolData)
    });

    const result = await res.json();
    console.log('Server response:', result);

    if (result.success || res.ok) {
      showToast('✓ School added successfully!', 'success');
      hideAddModal();
      loadSchoolStats();

      // If user is on search view with results, refresh
      const searchBox = document.getElementById('searchBox');
      if (searchBox.value.trim()) {
        setTimeout(() => runQuery(), 500);
      }
    } else {
      showToast('Error: ' + (result.error || 'Failed to add school'), 'error');
    }
  } catch (err) {
    console.error('Add school error:', err);
    showToast('Error: ' + err.message, 'error');
  }
};

// Edit/Update Operation - Now uses modal
window.editSchool = function (school) {
  console.log('Edit school clicked:', school);
  showEditModal(school);
};

// Update Operation (form submission)
window.updateSchool = async function (event) {
  event.preventDefault();
  console.log('Updating school...');

  const schoolId = document.getElementById('editSchoolId').value;
  const updatedData = {
    school_name: document.getElementById('editSchoolName').value,
    address: document.getElementById('editAddress').value,
    postal_code: document.getElementById('editPostalCode').value,
    zone_code: document.getElementById('editZoneCode').value,
    mainlevel_code: document.getElementById('editMainlevelCode').value,
    principal_name: document.getElementById('editPrincipalName').value
  };

  console.log('Updated data:', updatedData);

  try {
    const res = await fetch(`/api/schools/${schoolId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedData)
    });

    const result = await res.json();

    if (result.success || res.ok) {
      showToast('✓ School updated successfully!', 'success');
      hideEditModal();
      runQuery(); // Refresh results
    } else {
      showToast('Error: ' + (result.error || 'Failed to update school'), 'error');
    }
  } catch (err) {
    console.error('Update school error:', err);
    showToast('Error: ' + err.message, 'error');
  }
};

// Delete Operation - Now uses modal
window.deleteSchool = function (schoolId, schoolName) {
  console.log('Delete school clicked:', schoolId, schoolName);
  showDeleteModal(schoolId, schoolName);
};

// Confirm Delete Operation
window.confirmDelete = async function () {
  console.log('Confirming delete for:', pendingDeleteId, pendingDeleteName);

  if (!pendingDeleteId) return;

  try {
    const res = await fetch(`/api/schools/${pendingDeleteId}`, {
      method: 'DELETE'
    });

    const result = await res.json();

    if (result.success || res.ok) {
      showToast('✓ School deleted successfully!', 'success');
      hideDeleteModal();
      runQuery(); // Refresh results
      loadSchoolStats();
    } else {
      showToast('Error: ' + (result.error || 'Failed to delete school'), 'error');
    }
  } catch (err) {
    console.error('Delete school error:', err);
    showToast('Error: ' + err.message, 'error');
  }
};

// ========== Statistics ==========
function loadSchoolStats() {
  console.log('Loading school stats...');

  fetch('/api/schools?name=')
    .then(res => res.json())
    .then(data => {
      const totalSchools = document.getElementById('totalSchools');
      if (totalSchools) {
        totalSchools.textContent = data.length || '0';
      }
      console.log('Total schools:', data.length);
    })
    .catch(err => {
      console.error('Failed to load stats:', err);
      const totalSchools = document.getElementById('totalSchools');
      if (totalSchools) {
        totalSchools.textContent = '-';
      }
    });
}

/**
 * Load all school-related data from multiple endpoints
 */
async function loadFullSchoolDetails(schoolId) {
    try {
        const [schoolResponse, subjectsResponse, ccasResponse, programmesResponse, distinctivesResponse] = await Promise.all([
            fetch(`/api/schools/${schoolId}/details`),
            fetch(`/api/schools/${schoolId}/subjects`),
            fetch(`/api/schools/${schoolId}/ccas`),
            fetch(`/api/schools/${schoolId}/programmes`),
            fetch(`/api/schools/${schoolId}/distinctives`)
        ]);
        
        if (!schoolResponse.ok) {
            throw new Error('Failed to load school details');
        }
        
        const school = await schoolResponse.json();
        const subjects = subjectsResponse.ok ? await subjectsResponse.json() : [];
        const ccas = ccasResponse.ok ? await ccasResponse.json() : [];
        const programmes = programmesResponse.ok ? await programmesResponse.json() : [];
        const distinctives = distinctivesResponse.ok ? await distinctivesResponse.json() : [];
        
        return {
            school: school.school || school,
            subjects: subjects || [],
            ccas: ccas || [],
            programmes: programmes || [],
            distinctives: distinctives || []
        };
    } catch (error) {
        console.error('Error loading full school details:', error);
        showToast('Failed to load complete school details', 'error');
        return null;
    }
}

/**
 * Display enhanced school modal with comprehensive information
 */
function displayEnhancedSchoolModal(data) {
    const { school, subjects, ccas, programmes, distinctives } = data;
    
    let html = `
        <div class="modal active" id="detailsModal">
            <div class="modal-overlay" onclick="closeDetailsModal()"></div>
            <div class="modal-content" style="max-width: 1000px; max-height: 90vh; overflow-y: auto;">
                <div class="modal-header">
                    <h3>${school.school_name || 'School Details'}</h3>
                    <button class="modal-close" onclick="closeDetailsModal()">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                        </svg>
                    </button>
                </div>
                
                <div class="detail-modal-content" style="padding: 1.5rem;">
                    ${renderBasicInfo(school)}
                    ${renderContactInfo(school)}
                    ${renderPersonnel(school)}
                    ${renderSpecialProgrammes(school)}
                    ${renderMotherTongue(school)}
                    ${renderTransport(school)}
                    ${renderSubjectsList(subjects)}
                    ${renderCCAsList(ccas)}
                    ${renderProgrammesList(programmes)}
                    ${renderDistinctivesList(distinctives)}
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', html);
    document.body.style.overflow = 'hidden';
}

/**
 * Render basic information section
 */
function renderBasicInfo(school) {
    return `
        <div class="info-section">
            <h4 style="margin-bottom: 1rem; color: #1F2937; border-bottom: 2px solid #3B82F6; padding-bottom: 0.5rem;">
                Basic Information
            </h4>
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem;">
                ${school.school_name ? `<div><strong>School Name:</strong> <span>${school.school_name}</span></div>` : ''}
                ${school.zone_code ? `<div><strong>Zone:</strong> <span class="badge">${school.zone_code}</span></div>` : ''}
                ${school.mainlevel_code ? `<div><strong>Level:</strong> <span>${school.mainlevel_code}</span></div>` : ''}
                ${school.type_code ? `<div><strong>Type:</strong> <span>${school.type_code}</span></div>` : ''}
                ${school.nature_code ? `<div><strong>Nature:</strong> <span>${school.nature_code}</span></div>` : ''}
                ${school.session_code ? `<div><strong>Session:</strong> <span>${school.session_code}</span></div>` : ''}
                ${school.dgp_code ? `<div><strong>DGP Code:</strong> <span>${school.dgp_code}</span></div>` : ''}
                ${school.address ? `<div style="grid-column: 1 / -1;"><strong>Address:</strong> <span>${school.address}</span></div>` : ''}
                ${school.postal_code ? `<div><strong>Postal Code:</strong> <span>${school.postal_code}</span></div>` : ''}
            </div>
        </div>
    `;
}

/**
 * Render contact information section
 */
function renderContactInfo(school) {
    if (!school.email_address && !school.telephone_no && !school.telephone_no_2 && !school.fax_no && !school.url_address) {
        return '';
    }
    
    return `
        <div class="info-section" style="margin-top: 1.5rem;">
            <h4 style="margin-bottom: 1rem; color: #1F2937; border-bottom: 2px solid #F59E0B; padding-bottom: 0.5rem;">
                Contact Information
            </h4>
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem;">
                ${school.email_address ? `<div><strong>Email:</strong> <a href="mailto:${school.email_address}" style="color: #3B82F6;">${school.email_address}</a></div>` : ''}
                ${school.telephone_no ? `<div><strong>Phone:</strong> <span>${school.telephone_no}</span></div>` : ''}
                ${school.telephone_no_2 ? `<div><strong>Phone 2:</strong> <span>${school.telephone_no_2}</span></div>` : ''}
                ${school.fax_no ? `<div><strong>Fax:</strong> <span>${school.fax_no}</span></div>` : ''}
                ${school.url_address ? `<div style="grid-column: 1 / -1;"><strong>Website:</strong> <a href="${school.url_address}" target="_blank" style="color: #3B82F6;">${school.url_address}</a></div>` : ''}
            </div>
        </div>
    `;
}

/**
 * Render personnel section
 */
function renderPersonnel(school) {
    const hasPersonnel = school.principal_name || school.first_vp_name || school.second_vp_name || 
                         school.third_vp_name || school.fourth_vp_name || school.fifth_vp_name;
    
    if (!hasPersonnel) return '';
    
    return `
        <div class="info-section" style="margin-top: 1.5rem;">
            <h4 style="margin-bottom: 1rem; color: #1F2937; border-bottom: 2px solid #10B981; padding-bottom: 0.5rem;">
                School Leadership
            </h4>
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem;">
                ${school.principal_name ? `<div><strong>Principal:</strong> <span>${school.principal_name}</span></div>` : ''}
                ${school.first_vp_name ? `<div><strong>Vice Principal 1:</strong> <span>${school.first_vp_name}</span></div>` : ''}
                ${school.second_vp_name ? `<div><strong>Vice Principal 2:</strong> <span>${school.second_vp_name}</span></div>` : ''}
                ${school.third_vp_name ? `<div><strong>Vice Principal 3:</strong> <span>${school.third_vp_name}</span></div>` : ''}
                ${school.fourth_vp_name ? `<div><strong>Vice Principal 4:</strong> <span>${school.fourth_vp_name}</span></div>` : ''}
                ${school.fifth_vp_name ? `<div><strong>Vice Principal 5:</strong> <span>${school.fifth_vp_name}</span></div>` : ''}
            </div>
        </div>
    `;
}

/**
 * Render special programmes section
 */
function renderSpecialProgrammes(school) {
    const indicators = [];
    if (school.autonomous_ind === 'Yes') indicators.push('Autonomous');
    if (school.gifted_ind === 'Yes') indicators.push('Gifted');
    if (school.ip_ind === 'Yes') indicators.push('IP');
    if (school.sap_ind === 'Yes') indicators.push('SAP');
    
    if (indicators.length === 0) return '';
    
    return `
        <div class="info-section" style="margin-top: 1.5rem;">
            <h4 style="margin-bottom: 1rem; color: #1F2937; border-bottom: 2px solid #8B5CF6; padding-bottom: 0.5rem;">
                Special Programmes
            </h4>
            <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                ${indicators.map(ind => `<span class="badge" style="background: #8B5CF6; color: white; padding: 0.375rem 0.75rem;">${ind}</span>`).join('')}
            </div>
        </div>
    `;
}

/**
 * Render mother tongue languages section
 */
function renderMotherTongue(school) {
    const languages = [];
    if (school.mothertongue1_code && school.mothertongue1_code !== 'NA') languages.push(school.mothertongue1_code);
    if (school.mothertongue2_code && school.mothertongue2_code !== 'NA') languages.push(school.mothertongue2_code);
    if (school.mothertongue3_code && school.mothertongue3_code !== 'NA') languages.push(school.mothertongue3_code);
    
    if (languages.length === 0) return '';
    
    return `
        <div class="info-section" style="margin-top: 1.5rem;">
            <h4 style="margin-bottom: 1rem; color: #1F2937; border-bottom: 2px solid #EC4899; padding-bottom: 0.5rem;">
                Mother Tongue Languages Offered
            </h4>
            <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                ${languages.map(lang => `<span class="badge" style="background: #FCE7F3; color: #9F1239; padding: 0.375rem 0.75rem;">${lang}</span>`).join('')}
            </div>
        </div>
    `;
}

/**
 * Render transportation section
 */
function renderTransport(school) {
    if (!school.mrt_desc && !school.bus_desc) return '';
    
    return `
        <div class="info-section" style="margin-top: 1.5rem;">
            <h4 style="margin-bottom: 1rem; color: #1F2937; border-bottom: 2px solid #EF4444; padding-bottom: 0.5rem;">
                Transportation
            </h4>
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem;">
                ${school.mrt_desc ? `<div><strong>MRT:</strong> <span>${school.mrt_desc}</span></div>` : ''}
                ${school.bus_desc ? `<div><strong>Bus Services:</strong> <span>${school.bus_desc}</span></div>` : ''}
            </div>
        </div>
    `;
}

/**
 * Render subjects list
 */
function renderSubjectsList(subjects) {
    if (!subjects || subjects.length === 0) return '';
    
    return `
        <div class="info-section" style="margin-top: 1.5rem;">
            <h4 style="margin-bottom: 1rem; color: #1F2937; border-bottom: 2px solid #3B82F6; padding-bottom: 0.5rem;">
                Subjects Offered (${subjects.length})
            </h4>
            <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
                ${subjects.map(s => `<span class="badge" style="background: #EFF6FF; color: #1E40AF; padding: 0.375rem 0.75rem;">${s.subject_desc}</span>`).join('')}
            </div>
        </div>
    `;
}

/**
 * Render CCAs grouped by type (e.g., Visual Arts, Sports & Games)
 */
function renderCCAsList(ccas) {
    if (!ccas || ccas.length === 0) return '';
    
    // Group CCAs by cca_grouping_desc
    const groupedCCAs = {};
    ccas.forEach(cca => {
        const group = cca.cca_grouping_desc || 'Other';
        if (!groupedCCAs[group]) groupedCCAs[group] = [];
        groupedCCAs[group].push(cca);
    });
    
    let ccaHTML = '';
    Object.keys(groupedCCAs).sort().forEach(group => {
        ccaHTML += `
            <div style="margin-bottom: 1.5rem;">
                <h5 style="color: #059669; margin-bottom: 0.75rem; font-size: 1rem; font-weight: 600;">
                    ${group} (${groupedCCAs[group].length})
                </h5>
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 0.75rem;">
                    ${groupedCCAs[group].map(cca => `
                        <div style="padding: 0.875rem; background: #F0FDF4; border-left: 3px solid #10B981; border-radius: 0.375rem;">
                            <strong style="color: #065F46; font-size: 0.9rem;">${cca.cca_generic_name}</strong>
                            ${cca.cca_customized_name && cca.cca_customized_name !== cca.cca_generic_name ? 
                                `<div style="color: #6B7280; font-size: 0.8rem; margin-top: 0.25rem;">${cca.cca_customized_name}</div>` : ''}
                            ${cca.school_section ? 
                                `<span class="badge" style="font-size: 0.7rem; margin-top: 0.5rem; background: #D1FAE5; color: #065F46; padding: 0.125rem 0.5rem;">${cca.school_section}</span>` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    });
    
    return `
        <div class="info-section" style="margin-top: 1.5rem;">
            <h4 style="margin-bottom: 1rem; color: #1F2937; border-bottom: 2px solid #10B981; padding-bottom: 0.5rem;">
                Co-Curricular Activities (${ccas.length})
            </h4>
            ${ccaHTML}
        </div>
    `;
}

/**
 * Render MOE programmes list
 */
function renderProgrammesList(programmes) {
    if (!programmes || programmes.length === 0) return '';
    
    return `
        <div class="info-section" style="margin-top: 1.5rem;">
            <h4 style="margin-bottom: 1rem; color: #1F2937; border-bottom: 2px solid #F59E0B; padding-bottom: 0.5rem;">
                MOE Programmes (${programmes.length})
            </h4>
            <ul style="list-style: none; padding: 0; margin: 0;">
                ${programmes.map(p => `
                    <li style="padding: 0.875rem; background: #FFFBEB; margin-bottom: 0.5rem; border-radius: 0.375rem; border-left: 3px solid #F59E0B;">
                        <span style="color: #92400E;">• ${p.moe_programme_desc}</span>
                    </li>
                `).join('')}
            </ul>
        </div>
    `;
}

/**
 * Render distinctive programmes (ALP and LLP with domains and titles)
 */
function renderDistinctivesList(distinctives) {
    if (!distinctives || distinctives.length === 0) return '';
    
    return `
        <div class="info-section" style="margin-top: 1.5rem;">
            <h4 style="margin-bottom: 1rem; color: #1F2937; border-bottom: 2px solid #8B5CF6; padding-bottom: 0.5rem;">
                Distinctive Programmes (${distinctives.length})
            </h4>
            ${distinctives.map(d => `
                <div style="margin-bottom: 1.25rem; padding: 1.25rem; background: #F5F3FF; border-left: 4px solid #8B5CF6; border-radius: 0.5rem;">
                    ${d.alp_title ? `
                        <div style="margin-bottom: ${d.llp_title ? '1rem' : '0'};">
                            <div style="margin-bottom: 0.5rem;">
                                <span style="background: #8B5CF6; color: white; padding: 0.25rem 0.625rem; border-radius: 0.25rem; font-size: 0.75rem; font-weight: 600; margin-right: 0.5rem;">ALP</span>
                                <strong style="color: #6B21A8; font-size: 1rem;">${d.alp_title}</strong>
                            </div>
                            ${d.alp_domain ? `<div style="color: #6B7280; font-size: 0.875rem; margin-left: 3.5rem;"><em>Domain: ${d.alp_domain}</em></div>` : ''}
                        </div>
                    ` : ''}
                    ${d.llp_title ? `
                        <div>
                            <div style="margin-bottom: 0.5rem;">
                                <span style="background: #8B5CF6; color: white; padding: 0.25rem 0.625rem; border-radius: 0.25rem; font-size: 0.75rem; font-weight: 600; margin-right: 0.5rem;">LLP</span>
                                <strong style="color: #6B21A8; font-size: 1rem;">${d.llp_title}</strong>
                            </div>
                            ${d.llp_domain1 ? `<div style="color: #6B7280; font-size: 0.875rem; margin-left: 3.5rem;"><em>Domain: ${d.llp_domain1}</em></div>` : ''}
                        </div>
                    ` : ''}
                </div>
            `).join('')}
        </div>
    `;
}

// ========== Toast Notifications ==========
function showToast(message, type = 'info') {
  console.log('Toast:', type, message);
  const toast = document.getElementById('toast');
  const toastMessage = document.getElementById('toastMessage');

  if (!toast || !toastMessage) {
    console.error('Toast elements not found');
    return;
  }

  toastMessage.textContent = message;
  toast.className = 'toast show ' + type;

  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// ========== Utility Functions (GLOBAL) ==========
window.showAbout = function () {
  alert(
    'EduQuery SG\n\n' +
    'A comprehensive database management system for Singapore schools.\n\n' +
    'Features:\n' +
    '• Search schools by name\n' +
    '• View subjects, CCAs, programmes & distinctives\n' +
    '• Add, edit, and delete school records\n' +
    '• Real-time data synchronization\n\n' +
    'Built with PostgreSQL (Supabase) + MongoDB Atlas\n' +
    'INF2003 Database Systems Project'
  );
};

window.showHelp = function () {
  alert(
    'How to Use EduQuery\n\n' +
    'SEARCH:\n' +
    '1. Enter a school name (partial match works)\n' +
    '2. Select what you want to view\n' +
    '3. Click Search or press Enter\n\n' +
    'MANAGE:\n' +
    '1. Click "Add New School" button\n' +
    '2. Fill in all required fields\n' +
    '3. Click Save to add to database\n\n' +
    'EDIT/DELETE:\n' +
    '1. Search for schools (General Info)\n' +
    '2. Use Edit or Delete buttons in the results table\n' +
    '3. Fill the form or confirm deletion in the modal\n\n' +
    'Need more help? Contact your database administrator.'
  );
};

console.log('All functions loaded and registered globally');