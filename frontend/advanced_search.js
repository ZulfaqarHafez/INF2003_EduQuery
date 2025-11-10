// ========== Advanced Search Functions ==========

function showAdvancedSearch() {
  document.getElementById('advancedSearchModal').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function hideAdvancedSearch() {
  document.getElementById('advancedSearchModal').classList.remove('active');
  document.body.style.overflow = '';
}

function clearAdvancedSearch() {
  document.getElementById('advancedSearchForm').reset();
}

// Input sanitisation 
function sanitizeInput(value) {
  if (!value) return '';
  
  // Trim whitespace
  value = value.trim();
  
  // Reject if it's just "NA" or similar
  if (/^(na|n\/a|nil|none|-)$/i.test(value)) {
    return '';
  }
  
  // Limit length to prevent abuse
  if (value.length > 100) {
    value = value.substring(0, 100);
  }
  
  return value;
}

// Use in runAdvancedQuery
Object.keys(formData).forEach(key => {
  const sanitized = sanitizeInput(formData[key]);
  if (sanitized) {
    searchParams[key] = sanitized;
  }
});

function runAdvancedQuery(event) {
  event.preventDefault();
  
  // Collect all form values
  const formData = {
    school_name: document.getElementById('adv_school_name').value.trim(),
    principal_name: document.getElementById('adv_principal_name').value.trim(),
    vp_name: document.getElementById('adv_vp_name').value.trim(),
    email_address: document.getElementById('adv_email').value.trim(),
    address: document.getElementById('adv_address').value.trim(),
    postal_code: document.getElementById('adv_postal_code').value.trim(),
    zone_code: document.getElementById('adv_zone_code').value,
    mainlevel_code: document.getElementById('adv_mainlevel_code').value,
    type_code: document.getElementById('adv_type_code').value.trim(),
    nature_code: document.getElementById('adv_nature_code').value.trim(),
    school_section: document.getElementById('adv_school_section').value.trim(),
    session_code: document.getElementById('adv_session_code').value.trim(),
    dgp_code: document.getElementById('adv_dgp_code').value.trim(),
    mothertongue_code: document.getElementById('adv_mothertongue_code').value.trim(),
    autonomous_ind: document.getElementById('adv_autonomous_ind').value,
    gifted_ind: document.getElementById('adv_gifted_ind').value,
    ip_ind: document.getElementById('adv_ip_ind').value,
    sap_ind: document.getElementById('adv_sap_ind').value,
    moe_programme_desc: document.getElementById('adv_moe_programme_desc').value.trim(),
    alp_domain: document.getElementById('adv_alp_domain').value.trim(),
    alp_title: document.getElementById('adv_alp_title').value.trim(),
    llp_domain1: document.getElementById('adv_llp_domain1').value.trim(),
    llp_title: document.getElementById('adv_llp_title').value.trim(),
    subject_desc: document.getElementById('adv_subject_desc').value.trim(),
    cca_generic_name: document.getElementById('adv_cca_generic_name').value.trim(),
    cca_customized_name: document.getElementById('adv_cca_customized_name').value.trim(),
    cca_grouping_desc: document.getElementById('adv_cca_grouping_desc').value.trim(),
    bus_desc: document.getElementById('adv_bus_desc').value.trim(),
    mrt_desc: document.getElementById('adv_mrt_desc').value.trim()
  };
  
  // Filter out empty values
  const searchParams = {};
  Object.keys(formData).forEach(key => {
    if (formData[key]) {
      searchParams[key] = formData[key];
    }
  });
  
  // Check if at least one field is filled
  if (Object.keys(searchParams).length === 0) {
    showToast('Please fill in at least one search field', 'error');
    return;
  }
  
  console.log('Advanced Search Parameters:', searchParams);
  
  // Hide modal
  hideAdvancedSearch();
  
  // Show loading state
  document.getElementById('loadingSpinner').style.display = 'flex';
  document.getElementById('resultsTable').innerHTML = '';
  
  // Make API call to backend
  fetch('/api/search/advanced', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(searchParams)
  })
  .then(response => {
    console.log('Response status:', response.status);
    return response.json();
  })
  .then(data => {
    console.log('Response data:', data);
    document.getElementById('loadingSpinner').style.display = 'none';
    
    if (data.success && data.results && data.results.length > 0) {
      displayAdvancedSearchResults(data.results, data.criteria);
      document.getElementById('resultsMeta').textContent = 
        `Found ${data.count} school(s) matching ${Object.keys(data.criteria).length} criteria`;
      showToast(`Found ${data.count} matching school(s)`, 'success');
    } else {
      document.getElementById('resultsTable').innerHTML = `
        <div class="empty-state">
          <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
            <circle cx="32" cy="32" r="30" stroke="#E5E7EB" stroke-width="4"/>
            <path d="M32 20v24M20 32h24" stroke="#E5E7EB" stroke-width="4" stroke-linecap="round"/>
          </svg>
          <h3>No results found</h3>
          <p>Try adjusting your search criteria</p>
        </div>
      `;
      document.getElementById('resultsMeta').textContent = 
        `No results found with ${Object.keys(searchParams).length} criteria`;
      showToast('No schools found matching your criteria', 'error');
    }
  })
  .catch(error => {
    console.error('Fetch Error:', error);
    document.getElementById('loadingSpinner').style.display = 'none';
    document.getElementById('resultsTable').innerHTML = `
      <div class="empty-state">
        <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
          <circle cx="32" cy="32" r="30" stroke="#DC2626" stroke-width="4"/>
          <path d="M32 20v24M20 32h24" stroke="#DC2626" stroke-width="4" stroke-linecap="round"/>
        </svg>
        <h3>Search Error</h3>
        <p>${error.message || 'Failed to perform search. Please try again.'}</p>
      </div>
    `;
    showToast('Search failed. Please try again.', 'error');
  });
}

function displayAdvancedSearchResults(results, criteria) {
  const criteriaList = Object.entries(criteria)
    .map(([key, value]) => `<strong>${key.replace(/_/g, ' ')}</strong>: ${value}`)
    .join(' • ');
  
  let html = `
    <div style="margin-bottom: 1em; padding: 0.75em; background: #EFF6FF; border-left: 0.25em solid #3B82F6; border-radius: 0.25em;">
      <div style="font-size: 0.875em; color: #1E40AF;">
        <strong>Search Criteria (${Object.keys(criteria).length}):</strong>
      </div>
      <div style="margin-top: 0.5em; font-size: 0.875em; color: #374151;">
        ${criteriaList}
      </div>
    </div>
    <div style="overflow-x: auto;">
      <table class="data-table">
        <thead>
          <tr>
            <th>School Name</th>
            <th>Principal</th>
            <th>VP(s)</th>
            <th>Email</th>
            <th>Zone</th>
            <th>Level</th>
            <th>Type</th>
            <th>Indicators</th>
            <th>Transport</th>
          </tr>
        </thead>
        <tbody>
  `;
  
  results.forEach(school => {
    // Collect VPs
    const vps = [];
    if (school.first_vp_name) vps.push(school.first_vp_name);
    if (school.second_vp_name) vps.push(school.second_vp_name);
    const vpDisplay = vps.length > 0 ? vps.join(', ') : 'N/A';
    
    // Collect indicators
    const indicators = [];
    if (school.autonomous_ind === 'Yes') indicators.push('🏫 Auto');
    if (school.gifted_ind === 'Yes') indicators.push('🎯 Gifted');
    if (school.ip_ind === 'Yes') indicators.push('📚 IP');
    if (school.sap_ind === 'Yes') indicators.push('🇨🇳 SAP');
    
    // Collect transport
    const transport = [];
    if (school.mrt_desc) transport.push(`🚇 ${school.mrt_desc}`);
    if (school.bus_desc) transport.push(`🚌 ${school.bus_desc.substring(0, 20)}...`);
    const transportDisplay = transport.length > 0 ? transport.join('<br>') : '-';
    
    html += `
      <tr>
        <td><strong>${school.school_name}</strong></td>
        <td>${school.principal_name || 'N/A'}</td>
        <td style="font-size: 0.75em;">${vpDisplay}</td>
        <td style="font-size: 0.75em;">${school.email_address || 'N/A'}</td>
        <td><span class="badge">${school.zone_code || 'N/A'}</span></td>
        <td>${school.mainlevel_code || 'N/A'}</td>
        <td>${school.type_code || 'N/A'}</td>
        <td style="font-size: 0.75em;">${indicators.length > 0 ? indicators.join(' ') : '-'}</td>
        <td style="font-size: 0.75em;">${transportDisplay}</td>
      </tr>
    `;
  });
  
  html += `
        </tbody>
      </table>
    </div>
  `;
  
  document.getElementById('resultsTable').innerHTML = html;
}

// Helper function to show toast notifications
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  const toastMessage = document.getElementById('toastMessage');

  toastMessage.textContent = message;
  toast.className = 'toast show ' + type;

  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}
