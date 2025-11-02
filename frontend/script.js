let pendingDeleteId = null;
let pendingDeleteName = null;

// ========== MAKE FUNCTIONS GLOBAL ==========
// All functions must be in global scope for inline onclick to work

window.switchView = function(viewName) {
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
  
  if (viewName === 'manage') {
    loadSchoolStats();
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
  }
});

// ========== Search Functionality ==========
window.runQuery = async function() {
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
  if (count === 0) {
    meta.textContent = `No results found for "${query}"`;
  } else {
    meta.textContent = `Found ${count} result${count !== 1 ? 's' : ''} for "${query}"`;
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
  
  if (!data || data.length === 0) {
    renderEmpty('No results found');
    return;
  }

  if (!Array.isArray(data)) {
    data = [data];
  }

  const keys = Object.keys(data[0]);
  let html = '<table class="data-table"><thead><tr>';
  
  keys.forEach(k => {
    const formattedKey = k.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
    html += `<th>${formattedKey}</th>`;
  });
  
  // Add actions column only for "all" query type
  if (queryType === 'all') {
    html += '<th>Actions</th>';
  }
  
  html += '</tr></thead><tbody>';

  data.forEach(row => {
    html += '<tr>';
    keys.forEach(k => {
      const value = row[k] !== null && row[k] !== undefined ? row[k] : '-';
      html += `<td>${value}</td>`;
    });
    
    // Add action buttons only for "all" query type
    if (queryType === 'all' && row.school_id) {
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
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}

// ========== CRUD Operations (GLOBAL) ==========

// Add Modal Management
window.showAddModal = function() {
  console.log('Opening add modal');
  const modal = document.getElementById('addModal');
  if (modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  } else {
    console.error('Modal not found');
  }
};

window.hideAddModal = function() {
  console.log('Closing add modal');
  const modal = document.getElementById('addModal');
  if (modal) {
    modal.classList.remove('active');
    document.getElementById('addSchoolForm').reset();
    document.body.style.overflow = 'auto';
  }
};

// Edit Modal Management
window.showEditModal = function(school) {
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

window.hideEditModal = function() {
  console.log('Closing edit modal');
  const modal = document.getElementById('editModal');
  if (modal) {
    modal.classList.remove('active');
    document.getElementById('editSchoolForm').reset();
    document.body.style.overflow = 'auto';
  }
};

// Delete Modal Management
window.showDeleteModal = function(schoolId, schoolName) {
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

window.hideDeleteModal = function() {
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
window.addSchool = async function(event) {
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
window.editSchool = function(school) {
  console.log('Edit school clicked:', school);
  showEditModal(school);
};

// Update Operation (form submission)
window.updateSchool = async function(event) {
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
window.deleteSchool = function(schoolId, schoolName) {
  console.log('Delete school clicked:', schoolId, schoolName);
  showDeleteModal(schoolId, schoolName);
};

// Confirm Delete Operation
window.confirmDelete = async function() {
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
window.showAbout = function() {
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

window.showHelp = function() {
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