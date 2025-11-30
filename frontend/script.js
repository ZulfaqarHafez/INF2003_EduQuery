let pendingDeleteId = null;
let pendingDeleteName = null;

// ========== ADMIN AUTHENTICATION MANAGEMENT ==========

// Function to get token from localStorage (admin only)
function getAuthToken() {
  const tokenFromStorage = localStorage.getItem('authToken');
  if (tokenFromStorage) {
    console.log('🔑 Admin token found in localStorage');
    return tokenFromStorage;
  }

  console.log('ℹ️ No admin token found - public access mode');
  return null;
}

// Function to validate admin token
function validateAuth() {
  const token = getAuthToken();

  if (!token) {
    console.log('No admin token found - public access mode');
    updateUIForUserRole(); // Update UI for public access
    return true; // Allow public access
  }

  // Verify token is valid JWT format and is admin
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const expiry = payload.exp * 1000; // Convert to milliseconds
    const now = Date.now();

    console.log('🔍 Token payload:', payload);
    console.log('⏰ Token expires:', new Date(expiry).toLocaleString());

    if (now > expiry) {
      console.log('Admin token expired, switching to public access');
      localStorage.removeItem('authToken');
      showToast('Admin session expired, continuing in public mode', 'info');
      updateUIForUserRole(); // Update UI for public access
      return true; // Allow public access
    }

    // Check if user is actually admin
    if (!payload.is_admin) {
      console.log('Non-admin token detected, removing and switching to public access');
      localStorage.removeItem('authToken');
      showToast('Admin access required, continuing in public mode', 'info');
      updateUIForUserRole(); // Update UI for public access
      return true; // Allow public access
    }

    console.log('✅ Admin token is valid');
    return true;
  } catch (error) {
    console.log('Invalid token format, switching to public access');
    localStorage.removeItem('authToken');
    showToast('Invalid admin session, continuing in public mode', 'info');
    updateUIForUserRole(); // Update UI for public access
    return true; // Allow public access
  }
}

// Function to get auth headers for API calls (admin only for protected routes)
function getAuthHeaders() {
  const token = getAuthToken();

  if (!token) {
    console.log('No admin token available for API call - using public access');
    return {
      'Content-Type': 'application/json'
    };
  }

  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
}

// Check if current user is admin
function isUserAdmin() {
  const token = getAuthToken();
  if (!token) return false;

  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.is_admin === true;
  } catch (error) {
    return false;
  }
}

// Get current admin username
function getCurrentUsername() {
  const token = getAuthToken();
  if (!token) return null;

  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.username || null;
  } catch (error) {
    return null;
  }
}

// Update UI based on admin role
function updateUIForUserRole() {
  const isAdmin = isUserAdmin();
  const username = getCurrentUsername();

  console.log('Admin role update:', { username: username, isAdmin: isAdmin });

  // Update welcome message
  const welcomeElement = document.getElementById('userWelcome');
  if (welcomeElement) {
    if (isAdmin && username) {
      welcomeElement.textContent = `Welcome, Administrator ${username}!`;
      welcomeElement.className = 'admin-welcome';
    } else {
      welcomeElement.textContent = `Welcome to EduQuery SG!`;
      welcomeElement.className = 'public-welcome';
    }
  }

  // Show/hide admin features
  const adminFeatures = document.querySelectorAll('.admin-only');
  adminFeatures.forEach(feature => {
    if (feature) {
      feature.style.display = isAdmin ? 'block' : 'none';
    }
  });

  // Show/hide Manage and Analytics navigation buttons for admin only
  const manageNav = document.querySelector('[data-view="manage"]');
  // const analyticsNav = document.querySelector('[data-view="analytics"]');

  if (manageNav) {
    manageNav.style.display = isAdmin ? 'flex' : 'none';
  }

  // if (analyticsNav) {
  //   analyticsNav.style.display = isAdmin ? 'flex' : 'none';
  // }

  // Update admin auth link
  updateAdminAuthLink();
}

// Update admin auth link text
function updateAdminAuthLink() {
  const authLink = document.getElementById('adminAuthLink');
  if (!authLink) return;

  if (isUserAdmin()) {
    authLink.textContent = 'Admin Logout';
    authLink.style.fontWeight = '600';
    authLink.style.color = '#EF4444';
  } else {
    authLink.textContent = 'Admin Login';
    authLink.style.fontWeight = 'normal';
    authLink.style.color = '';
  }
}

// ========== Admin Authentication Handler ==========
function handleAdminAuth() {
  if (isUserAdmin()) {
    // User is already admin, show logout confirmation
    const username = getCurrentUsername();
    const confirmed = confirm(
      `Admin Logout\n\n` +
      `Are you sure you want to log out?\n\n` +
      `User: ${username}\n` +
      `Role: Administrator`
    );

    if (confirmed) {
      adminLogout();
    }
  } else {
    showAdminLoginModal();
  }
}

async function sendLoginRequest(username, password) {
  try {
    const response = await fetch('/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: username,
        password: password
      }),
    });

    if (!response.ok) {
      let errorMsg = `Server responded with status: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMsg = errorData.message || errorMsg;
      } catch (e) {
        errorMsg = response.statusText || errorMsg;
      }
      throw new Error(errorMsg);
    }

    const data = await response.json();
    return data;

  } catch (error) {
    throw error;
  }
}

async function handleAdminLogin(event) {
  event.preventDefault();

  const username = document.getElementById('adminUsername').value;
  const password = document.getElementById('adminPassword').value;

  // Validate
  if (!username.trim()) {
    showToast('Username is required', 'error');
    return;
  }

  if (!password.trim()) {
    showToast('Password is required', 'error');
    return;
  }

  setLoginLoadingState(true);

  try {
    const responseData = await sendLoginRequest(username, password);

    // Handle success
    showToast('Login successful!', 'success');

    // Store the token and user data
    if (responseData.token) {
      localStorage.setItem('authToken', responseData.token);
      localStorage.setItem('username', username);
    }
    if (responseData.user) {
      localStorage.setItem('userData', JSON.stringify(responseData.user));
    }

    // Update UI
    updateUIForUserRole();

    // Close modal
    hideAdminLoginModal();

  } catch (error) {
    // Handle failure
    let errorMsg = 'Login failed. Please try again.';

    if (error.message.includes('401') || error.message.toLowerCase().includes('invalid')) {
      errorMsg = 'Invalid username or password';
    } else if (error.message.includes('404')) {
      errorMsg = 'Login service unavailable';
    } else if (error.message.includes('500')) {
      errorMsg = 'Server error. Please try again later.';
    } else if (error.message.includes('Network') || error.message.includes('Failed to fetch')) {
      errorMsg = 'Network error. Please check your connection.';
    } else {
      errorMsg = error.message;
    }

    showToast(errorMsg, 'error');
  } finally {
    setLoginLoadingState(false);
  }
}


// ========== Admin Logout Function ==========
function adminLogout() {
  const username = getCurrentUsername();

  console.log('Admin logout initiated:', {
    timestamp: new Date().toISOString(),
    username: username
  });

  // Clear all stored authentication data
  localStorage.removeItem('authToken');

  showToast(`Goodbye, ${username}! You have been logged out successfully.`, 'info');

  console.log('Admin logged out successfully:', {
    timestamp: new Date().toISOString(),
    username: username
  });

  // Reload the page to update UI for public access
  setTimeout(() => {
    window.location.reload();
  }, 1000);
}

// ========== Update Admin Auth Link Text ==========
function updateAdminAuthLink() {
  const authLink = document.getElementById('adminAuthLink');
  if (!authLink) return;

  if (isUserAdmin()) {
    authLink.textContent = 'Admin Logout';
    authLink.style.fontWeight = '600';
    authLink.style.color = '#EF4444'; // Red color for logout
  } else {
    authLink.textContent = 'Admin Login';
    authLink.style.fontWeight = 'normal';
    authLink.style.color = ''; // Reset to default color
  }
}

// ========== Check for Admin Token in URL ==========
function checkForAdminToken() {
  const urlParams = new URLSearchParams(window.location.search);
  const tokenFromUrl = urlParams.get('token');

  if (tokenFromUrl) {
    console.log('🔑 Admin token found in URL');

    // Verify it's an admin token before storing
    try {
      const payload = JSON.parse(atob(tokenFromUrl.split('.')[1]));
      if (payload.is_admin) {
        // Store token from URL in localStorage
        localStorage.setItem('authToken', tokenFromUrl);

        // Clean URL by removing token parameter
        const newUrl = window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);

        // Show success message and reload to update UI
        showToast('Admin login successful!', 'success');
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } else {
        console.log('Non-admin token in URL, ignoring');
        showToast('Admin access required', 'error');
      }
    } catch (error) {
      console.log('Invalid token in URL, ignoring');
      showToast('Invalid admin token', 'error');
    }
  }
}
function showAdminLoginModal() {
  const modal = document.getElementById('adminLoginModal');
  if (modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

function hideAdminLoginModal() {
  const modal = document.getElementById('adminLoginModal');
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = 'auto';
    // Reset form
    document.getElementById('adminLoginForm').reset();
  }
}
// ========== ADMIN LOGIN MODAL FUNCTIONS ==========

// Show admin login modal
window.showAdminLoginModal = function () {
  console.log('Opening admin login modal');

  // Check if user is already admin
  if (isUserAdmin()) {
    const username = getCurrentUsername();
    const confirmed = confirm(
      `Admin Logout\n\n` +
      `Are you sure you want to log out?\n\n` +
      `User: ${username}\n` +
      `Role: Administrator`
    );

    if (confirmed) {
      adminLogout();
    }
    return;
  }

  const modal = document.getElementById('adminLoginModal');
  if (modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';

    // Focus on username field
    setTimeout(() => {
      const usernameInput = document.getElementById('adminUsername');
      if (usernameInput) {
        usernameInput.focus();
      }
    }, 300);
  } else {
    console.error('Admin login modal not found');
  }
};

// Hide admin login modal
window.hideAdminLoginModal = function () {
  console.log('Closing admin login modal');
  const modal = document.getElementById('adminLoginModal');
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = 'auto';

    // Reset form
    const form = document.getElementById('adminLoginForm');
    if (form) {
      form.reset();
    }

    // Clear error message
    const errorElement = document.getElementById('adminLoginError');
    if (errorElement) {
      errorElement.style.display = 'none';
      errorElement.textContent = '';
    }

    // Reset button state
    resetLoginButton();
  }
};

// Set loading state for login button
function setLoginLoadingState(isLoading) {
  const loginBtn = document.getElementById('adminLoginBtn');
  const btnText = loginBtn.querySelector('.btn-text');
  const btnLoading = loginBtn.querySelector('.btn-loading');

  if (isLoading) {
    loginBtn.disabled = true;
    btnText.classList.add('hide');
    btnLoading.style.display = 'inline';
  } else {
    loginBtn.disabled = false;
    btnText.classList.remove('hide');
    btnLoading.style.display = 'none';
  }
}

// Reset login button to default state
function resetLoginButton() {
  setLoginLoadingState(false);
}

// Validate login form
function validateLoginForm(username, password) {
  if (!username.trim()) {
    showLoginError('Username is required');
    document.getElementById('adminUsername').focus();
    return false;
  }

  if (!password.trim()) {
    showLoginError('Password is required');
    document.getElementById('adminPassword').focus();
    return false;
  }

  return true;
}

// Show login error message
function showLoginError(message) {
  const errorElement = document.getElementById('adminLoginError');
  if (errorElement) {
    errorElement.textContent = message;
    errorElement.style.display = 'block';
  }
}

// Hide login error message
function hideLoginError() {
  const errorElement = document.getElementById('adminLoginError');
  if (errorElement) {
    errorElement.style.display = 'none';
    errorElement.textContent = '';
  }
}

// Send login request (preserving security features from login.js)
async function sendAdminLoginRequest(username, password) {
  try {
    const response = await fetch('/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: username,
        password: password
      }),
    });

    // Log the request details for debugging
    console.log('Admin login request sent:', {
      timestamp: new Date().toISOString(),
      username: username,
      endpoint: '/login',
      method: 'POST'
    });

    if (!response.ok) {
      let errorMsg = `Server responded with status: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMsg = errorData.message || errorMsg;
      } catch (e) {
        errorMsg = response.statusText || errorMsg;
      }
      throw new Error(errorMsg);
    }

    const data = await response.json();

    console.log('Admin login response received:', {
      timestamp: new Date().toISOString(),
      username: username,
      status: response.status
    });

    return data;

  } catch (error) {
    console.error('Admin login request failed:', {
      timestamp: new Date().toISOString(),
      username: username,
      error: error.message
    });
    throw error;
  }
}

// Handle successful admin login
function handleAdminLoginSuccess(responseData) {
  showToast('Admin login successful!', 'success');

  // Log successful authentication
  console.log('Admin authentication successful:', {
    timestamp: new Date().toISOString(),
    username: document.getElementById('adminUsername').value
  });

  // Store authentication token if provided
  if (responseData.token) {
    localStorage.setItem('authToken', responseData.token);
    localStorage.setItem('username', document.getElementById('adminUsername').value);
  }

  // Store user data if provided
  if (responseData.user) {
    localStorage.setItem('userData', JSON.stringify(responseData.user));
  }

  // Close modal and update UI
  hideAdminLoginModal();
  updateUIForUserRole();

  // Show success message
  setTimeout(() => {
    showToast(`Welcome, Administrator ${document.getElementById('adminUsername').value}!`, 'success');
  }, 500);
}

// Handle failed admin login
function handleAdminLoginFailure(error) {
  let errorMsg = 'Login failed. Please try again.';

  if (error.message.includes('401') || error.message.toLowerCase().includes('invalid')) {
    errorMsg = 'Invalid username or password';
  } else if (error.message.includes('404')) {
    errorMsg = 'Login service unavailable';
  } else if (error.message.includes('500')) {
    errorMsg = 'Server error. Please try again later.';
  } else if (error.message.includes('Network') || error.message.includes('Failed to fetch')) {
    errorMsg = 'Network error. Please check your connection.';
  } else if (error.message.includes('timeout')) {
    errorMsg = 'Request timeout. Please try again.';
  } else {
    errorMsg = error.message;
  }

  showLoginError(errorMsg);

  // Log the failed login attempt
  console.warn('Admin login attempt failed:', {
    timestamp: new Date().toISOString(),
    username: document.getElementById('adminUsername').value,
    error: error.message,
    userMessage: errorMsg
  });
}

// Main admin login form handler
window.handleAdminLogin = async function (event) {
  event.preventDefault();

  const username = document.getElementById('adminUsername').value;
  const password = document.getElementById('adminPassword').value;

  // Hide any existing error message
  hideLoginError();

  // Validate form inputs
  if (!validateLoginForm(username, password)) {
    return;
  }

  // Set loading state
  setLoginLoadingState(true);

  try {
    // Send login request to server
    const responseData = await sendAdminLoginRequest(username, password);

    // Handle successful login
    handleAdminLoginSuccess(responseData);

  } catch (error) {
    // Handle login failure
    handleAdminLoginFailure(error);
  } finally {
    // Reset loading state
    setLoginLoadingState(false);
  }
};

// Add event listener for the admin login form
document.addEventListener('DOMContentLoaded', function () {
  const adminLoginForm = document.getElementById('adminLoginForm');
  if (adminLoginForm) {
    adminLoginForm.addEventListener('submit', handleAdminLogin);

    // Add Enter key support for password field
    const passwordInput = document.getElementById('adminPassword');
    if (passwordInput) {
      passwordInput.addEventListener('keypress', function (event) {
        if (event.key === 'Enter') {
          adminLoginForm.dispatchEvent(new Event('submit'));
        }
      });
    }
  }
});

// Enhanced admin logout function
window.adminLogout = function () {
  const username = getCurrentUsername();

  console.log('Admin logout initiated:', {
    timestamp: new Date().toISOString(),
    username: username
  });

  // Clear all stored authentication data
  localStorage.removeItem('authToken');
  localStorage.removeItem('username');
  localStorage.removeItem('userData');

  showToast(`Goodbye, ${username}! You have been logged out successfully.`, 'info');

  console.log('Admin logged out successfully:', {
    timestamp: new Date().toISOString(),
    username: username
  });

  // Update UI to reflect public access
  updateUIForUserRole();
};

// ========== MAKE FUNCTIONS GLOBAL ==========
// All functions must be in global scope for inline onclick to work

window.switchView = function (viewName) {
  console.log('Switching to view:', viewName);

  // // Check if trying to access analytics without admin rights
  // if (viewName === 'analytics' && !isUserAdmin()) {
  //   showToast('Analytics features are available to administrators only', 'error');
  //   return;
  // }

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

  // Load analytics data if admin
  if (viewName === 'analytics' && isUserAdmin()) {
    loadAnalyticsData();
  }
};

// ========== Analytics Functions (Admin Only) ==========
function loadAnalyticsData() {
  // if (!isUserAdmin()) {
  //   showToast('Analytics features are available to administrators only', 'error');
  //   return;
  // }

  console.log('Loading analytics data...');

  // Load various analytics data
  loadZoneStatistics();
  loadSubjectDiversity();
  loadCCAParticipation();
  loadDataCompleteness();
}

function loadZoneStatistics() {
  fetch('/api/analytics/schools-by-zone', {
    headers: getAuthHeaders()
  })
    .then(res => res.json())
    .then(data => {
      console.log('Zone statistics:', data);
      // Update zone statistics chart/table
    })
    .catch(err => {
      console.error('Failed to load zone statistics:', err);
    });
}

function loadSubjectDiversity() {
  fetch('/api/analytics/schools-subject-count', {
    headers: getAuthHeaders()
  })
    .then(res => res.json())
    .then(data => {
      console.log('Subject diversity:', data);
      // Update subject diversity chart/table
    })
    .catch(err => {
      console.error('Failed to load subject diversity:', err);
    });
}

function loadCCAParticipation() {
  fetch('/api/analytics/cca-participation', {
    headers: getAuthHeaders()
  })
    .then(res => res.json())
    .then(data => {
      console.log('CCA participation:', data);
      // Update CCA participation chart/table
    })
    .catch(err => {
      console.error('Failed to load CCA participation:', err);
    });
}

function loadDataCompleteness() {
  fetch('/api/analytics/data-completeness', {
    headers: getAuthHeaders()
  })
    .then(res => res.json())
    .then(data => {
      console.log('Data completeness:', data);
      // Update data completeness chart/table
    })
    .catch(err => {
      console.error('Failed to load data completeness:', err);
    });
}

// Add event listeners to nav buttons
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM Loaded - Attaching event listeners');

  // Check for admin token in URL first
  checkForAdminToken();

  // Check authentication (optional for public access)
  validateAuth();

  const navBtns = document.querySelectorAll('.nav-btn');
  console.log('Found nav buttons:', navBtns.length);

  navBtns.forEach((btn, index) => {
    console.log(`Nav button ${index}:`, btn.dataset.view);
    btn.addEventListener('click', () => {
      console.log('Button clicked:', btn.dataset.view);
      switchView(btn.dataset.view);
    });
  });

  // For the admin login
  const adminLoginForm = document.getElementById('adminLoginForm');
  if (adminLoginForm) {
    adminLoginForm.addEventListener('submit', handleAdminLogin);
  }

  // Add click event listener to admin auth link
  const adminAuthLink = document.getElementById('adminAuthLink');
  if (adminAuthLink) {
    adminAuthLink.addEventListener('click', function (e) {
      e.preventDefault();
      handleAdminAuth();
    });
    console.log('Admin auth link event listener attached');
  }

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

// ========== Search Functionality ==========
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
    const res = await fetch(url, {
      headers: getAuthHeaders()
    });

    console.log('🔍 API Response status:', res.status); // FIXED: Changed response to res

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

    // **RE-ATTACH COMPARISON LISTENERS IF COMPARISON MODE IS ACTIVE**
    if (comparisonMode.active) {
      addComparisonClickListeners();
    }

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
    // School search - show all school fields + actions (admin only)
    const keys = Object.keys(data[0]);
    keys.forEach(k => {
      const formattedKey = k.split('_').map(word =>
        word.charAt(0).toUpperCase() + word.slice(1)
      ).join(' ');
      html += `<th>${formattedKey}</th>`;
    });

    // Add actions column only if user is admin
    if (isUserAdmin()) {
      // html += '<th>Actions</th>';
    }
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
      const escapedSchoolName = (row.school_name || 'Unknown School').replace(/'/g, "\\'");
      html += `<tr data-clickable="true" 
              data-school-id="${row.school_id}" 
              onclick="if (typeof comparisonMode !== 'undefined' && comparisonMode.active) { 
                         handleComparisonClick(${row.school_id}, '${escapedSchoolName}'); 
                       } else { 
                         viewItemDetails('schools', ${row.school_id}); 
                       }" 
              style="cursor: pointer">`;
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

      // // Add action buttons for schools (admin only)
      // if (row.school_id && isUserAdmin()) {
      //   const safeSchoolJson = JSON.stringify(row).replace(/"/g, '&quot;');
      //   const safeSchoolName = String(row.school_name || '').replace(/'/g, "\\'");

      //   html += `
      //     <td>
      //       <div class="action-buttons">
      //         <button class="btn-edit"
      //                 onclick="event.stopPropagation(); editSchool(${safeSchoolJson})">
      //           <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
      //             <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/>
      //           </svg>
      //           Edit
      //         </button>
      //         <button class="btn-danger"
      //                 onclick="event.stopPropagation(); deleteSchool(${row.school_id}, '${safeSchoolName}')">
      //           <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
      //             <path fill-rule="evenodd"
      //                   d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
      //                   clip-rule="evenodd"/>
      //           </svg>
      //           Delete
      //         </button>
      //       </div>
      //     </td>
      //   `;
      // } 
      // else if (row.school_id) {
      //   // For non-admin users, add empty actions cell to maintain table structure
      //   html += '<td></td>';
      // }
      html += '</tr>';
    } else {
      // Make the row clickable for non-"all" searches
      html += `<tr data-clickable="true" data-school-id="${row.school_id}" onclick="viewItemDetails('schools', ${row.school_id})" style="cursor: pointer">`;

      if (queryType === 'subjects') {
        html += `<td><strong>${row.school_name || '-'}</strong></td>`;
        html += `<td><span class="badge">${row.zone_code || '-'}</span></td>`;
        html += `<td>${row.mainlevel_code || '-'}</td>`;
        html += `<td>${row.subject_desc || '-'}</td>`;
      } else if (queryType === 'ccas') {
        html += `<td><strong>${row.school_name || '-'}</strong></td>`;
        html += `<td><span class="badge">${row.zone_code || '-'}</span></td>`;
        html += `<td>${row.mainlevel_code || '-'}</td>`;
        html += `<td>
          <strong>${row.cca_category || '-'}</strong>
          ${row.cca_name ? `<span style="color: var(--gray-500); font-size: 13px; margin-left: 8px;">(${row.cca_name})</span>` : ''}
        </td>`;
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

  // **RE-ATTACH COMPARISON LISTENERS IF COMPARISON MODE IS ACTIVE**
  if (comparisonMode.active) {
    addComparisonClickListeners();
  }
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

// ========== Render Result Item (FIXED) ==========
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

  let html = `<div class="result-item" data-school-id="${itemId}" onclick='viewItemDetails("schools", ${itemId})'>`;
  html += '<div class="result-item-header">';

  // Title with highlighted search term
  const name = item.name || item.school_name || item.subject_desc || item.cca_generic_name || item.moe_programme_desc || 'Unnamed';

  // Also update the description for CCAs in universal search
  if (item.description && type === 'ccas') {
    // For CCAs, show the actual CCA name, not the grouping
    const ccaName = item.cca_generic_name || item.description;
    const highlightedName = highlightSearchTerm(ccaName, query);
    html += `<div class="result-item-title">${highlightedName}</div>`;
  } else {
    const highlightedName = highlightSearchTerm(name, query);
    html += `<div class="result-item-title">${highlightedName}</div>`;
  }

  const highlightedName = highlightSearchTerm(name, query);
  html += `<div class="result-item-title">${highlightedName}</div>`;

  html += '</div>';

  // Description
  if (item.description) {
    let descText = item.description;

    // For CCAs, show both category and name
    if (type === 'ccas' && item.cca_category) {
      descText = `${item.cca_category} - ${item.description}`;
    }

    const truncatedDesc = descText.length > 150
      ? descText.substring(0, 150) + '...'
      : descText;
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
window.viewItemDetails = async function (type, id) {
  console.log('Viewing details for:', type, id);

  if (!id) {
    showToast('Invalid item ID', 'error');
    return;
  }

  // **CHECK FOR COMPARISON MODE FIRST**
  if (comparisonMode.active && type === 'schools') {
    // Try to get school name from multiple possible locations
    let schoolName = 'Unknown School';

    // Try 1: Find by data-school-id attribute
    let element = document.querySelector(`[data-school-id="${id}"]`);

    if (element) {
      // Universal search result item
      const titleElement = element.querySelector('.result-item-title');
      if (titleElement) {
        schoolName = titleElement.textContent.trim();
      }
      // Table row
      else {
        const strongElement = element.querySelector('td strong');
        if (strongElement) {
          schoolName = strongElement.textContent.trim();
        } else {
          const firstCell = element.querySelector('td:first-child');
          if (firstCell) {
            schoolName = firstCell.textContent.trim();
          }
        }
      }
    }

    console.log('Extracted school name:', schoolName, 'for ID:', id);

    const handled = window.handleComparisonClick(id, schoolName);
    if (handled) return; // Stop here if comparison mode handled it
  }

  // Normal detail view behavior
  showToast('Loading details...', 'info');

  try {
    if (type === 'schools') {
      const fullData = await loadFullSchoolDetails(id);
      if (fullData) {
        displayEnhancedSchoolModal(fullData);
      }
    } else {
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

// ========== CRUD Operations (GLOBAL) ==========

// Add Modal Management
window.showAddModal = function () {
  // Check if user is admin before showing modal
  if (!isUserAdmin()) {
    showToast('Admin privileges required to add schools', 'error');
    return;
  }

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
  if (!isUserAdmin()) {
    showToast('Admin privileges required to edit schools', 'error');
    return;
  }

  const modal = document.getElementById('editModal');
  if (!modal) {
    console.error('Edit modal not found');
    return;
  }

  // Basic info
  document.getElementById('editSchoolId').value = school.school_id || '';
  document.getElementById('editSchoolName').value = school.school_name || '';
  document.getElementById('editPrincipalName').value = school.principal_name || '';
  document.getElementById('editAddress').value = school.address || '';
  document.getElementById('editPostalCode').value = school.postal_code || '';
  document.getElementById('editZoneCode').value = school.zone_code || '';
  document.getElementById('editMainlevelCode').value = school.mainlevel_code || '';

  // Additional info
  document.getElementById('editEmailAddress').value = school.email_address || '';
  document.getElementById('editTelephoneNo').value = school.telephone_no || '';
  document.getElementById('editTypeCode').value = school.type_code || '';
  document.getElementById('editNatureCode').value = school.nature_code || '';
  document.getElementById('editSessionCode').value = school.session_code || '';
  document.getElementById('editMrtDesc').value = school.mrt_desc || '';
  document.getElementById('editBusDesc').value = school.bus_desc || '';

  // Show modal – **only via class**, no inline display
  modal.style.display = '';           // clear any previous inline styles
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
};

window.hideEditModal = function () {
  console.log('Closing edit modal');
  const modal = document.getElementById('editModal');
  if (modal) {
    modal.classList.remove('active');
    modal.style.display = 'none';   // ⛔ this line breaks the next open
    document.body.style.overflow = 'auto';
  }
};

// Delete Modal Management
window.showDeleteModal = function (schoolId, schoolName) {
  // Check if user is admin
  if (!isUserAdmin()) {
    showToast('Admin privileges required to delete schools', 'error');
    return;
  }

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

// Close Delete Modal
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

// Create Operation (form submission)
window.addSchool = async function (event) {
  event.preventDefault();

  if (!isUserAdmin()) {
    showToast('Admin privileges required to add schools', 'error');
    return;
  }
  // Collect all form data
  const schoolData = {
    // Basic Information (Required)
    school_name: document.getElementById('schoolName').value.trim(),
    address: document.getElementById('address').value.trim(),
    postal_code: document.getElementById('postalCode').value.trim(),
    zone_code: document.getElementById('zoneCode').value,
    mainlevel_code: document.getElementById('mainlevelCode').value,
    principal_name: document.getElementById('principalName').value.trim(),

    // School Classification
    type_code: document.getElementById('typeCode').value || null,
    nature_code: document.getElementById('natureCode').value || null,
    session_code: document.getElementById('sessionCode').value || null,
    dgp_code: document.getElementById('dgpCode').value.trim() || null,

    // Contact Information
    email_address: document.getElementById('emailAddress').value.trim() || null,
    telephone_no: document.getElementById('telephoneNo').value.trim() || null,
    telephone_no_2: document.getElementById('telephoneNo2').value.trim() || null,
    fax_no: document.getElementById('faxNo').value.trim() || null,
    url_address: document.getElementById('urlAddress').value.trim() || null,

    // School Leadership
    first_vp_name: document.getElementById('firstVpName').value.trim() || null,
    second_vp_name: document.getElementById('secondVpName').value.trim() || null,
    third_vp_name: document.getElementById('thirdVpName').value.trim() || null,
    fourth_vp_name: document.getElementById('fourthVpName').value.trim() || null,
    fifth_vp_name: document.getElementById('fifthVpName').value.trim() || null,
    sixth_vp_name: document.getElementById('sixthVpName').value.trim() || null,

    // Special Programmes
    autonomous_ind: document.getElementById('autonomousInd').value || null,
    gifted_ind: document.getElementById('giftedInd').value || null,
    ip_ind: document.getElementById('ipInd').value || null,
    sap_ind: document.getElementById('sapInd').value || null,

    // Mother Tongue Languages
    mothertongue1_code: document.getElementById('mothertongue1Code').value || null,
    mothertongue2_code: document.getElementById('mothertongue2Code').value || null,
    mothertongue3_code: document.getElementById('mothertongue3Code').value || null,

    // Transportation
    mrt_desc: document.getElementById('mrtDesc').value.trim() || null,
    bus_desc: document.getElementById('busDesc').value.trim() || null
  };

  console.log('School data:', schoolData);

  try {
    const res = await fetch('/api/schools', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(schoolData)
    });

    if (res.status === 401 || res.status === 403) {
      showToast('Admin privileges required to add schools', 'error');
      return;
    }

    const result = await res.json();
    console.log('Server response:', result);

    if (result.success || res.ok) {
      showToast('✓ School added successfully!', 'success');
      hideAddModal();
      loadSchoolStats();

      // Refresh search results if there's an active search
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

window.toggleAdditionalInfo = function () {
  const section = document.getElementById('additionalInfoSection');
  const icon = document.getElementById('additionalInfoIcon');

  if (section.style.display === 'none') {
    section.style.display = 'block';
    icon.style.transform = 'rotate(180deg)';
  } else {
    section.style.display = 'none';
    icon.style.transform = 'rotate(0deg)';
  }
};

// Edit/Update Operation - Now uses modal
window.editSchool = function (school) {
  // Check if user is admin
  if (!isUserAdmin()) {
    showToast('Admin privileges required to edit schools', 'error');
    return;
  }

  console.log('Edit school clicked:', school);
  showEditModal(school);
};

// Update Operation (form submission)
window.updateSchool = async function (event) {
  event.preventDefault();

  // Check if user is admin
  if (!isUserAdmin()) {
    showToast('Admin privileges required to edit schools', 'error');
    return;
  }

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
      headers: getAuthHeaders(),
      body: JSON.stringify(updatedData)
    });

    if (res.status === 401 || res.status === 403) {
      showToast('Admin privileges required to edit schools', 'error');
      return;
    }

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
  // Check if user is admin
  if (!isUserAdmin()) {
    showToast('Admin privileges required to delete schools', 'error');
    return;
  }

  console.log('Delete school clicked:', schoolId, schoolName);
  showDeleteModal(schoolId, schoolName);
};

// Confirm Delete Operation
window.confirmDelete = async function () {
  // Check if user is admin
  if (!isUserAdmin()) {
    showToast('Admin privileges required to delete schools', 'error');
    return;
  }

  console.log('Confirming delete for:', pendingDeleteId, pendingDeleteName);

  if (!pendingDeleteId) return;

  try {
    const res = await fetch(`/api/schools/${pendingDeleteId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    if (res.status === 401 || res.status === 403) {
      showToast('Admin privileges required to delete schools', 'error');
      return;
    }

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

  fetch('/api/schools?name=', {
    headers: getAuthHeaders()
  })
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
/**
 * Display enhanced school modal with comprehensive information
 */
function displayEnhancedSchoolModal(data) {
  const { school, subjects, ccas, programmes, distinctives } = data;

  // Remove any existing details modal first
  const existing = document.getElementById('detailsModal');
  if (existing) existing.remove();

  const isAdmin = typeof isUserAdmin === 'function' && isUserAdmin();

  let html = `
    <div class="modal active" id="detailsModal">
      <div class="modal-overlay" onclick="closeDetailsModal()"></div>
      <div class="modal-content" style="max-width: 1000px; max-height: 90vh; overflow-y: auto;">
        <div class="modal-header" style="align-items: center; gap: 0.75rem;">
          <h3 style="flex: 1;">${school.school_name || 'School Details'}</h3>

          ${isAdmin ? `
          <div style="display: flex; gap: 0.5rem; margin-right: 0.5rem;">
            <button 
              type="button" 
              class="btn-primary" 
              style="display:flex; align-items:center; gap:0.35rem; padding:0.4rem 0.75rem; font-size:0.85rem;"
              data-action="edit-school"
            >
              ✏️ Edit
            </button>
            <button 
              type="button" 
              class="btn-danger" 
              style="display:flex; align-items:center; gap:0.35rem; padding:0.4rem 0.75rem; font-size:0.85rem;"
              data-action="delete-school"
            >
              🗑 Delete
            </button>
          </div>
          ` : ''}

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

  // Wire up Edit/Delete buttons (admin only)
  if (isAdmin) {
    const modal = document.getElementById('detailsModal');
    if (modal) {
      const editBtn = modal.querySelector('[data-action="edit-school"]');
      const deleteBtn = modal.querySelector('[data-action="delete-school"]');

      if (editBtn) {
        editBtn.addEventListener('click', () => {
          // Close view card, then open edit modal
          closeDetailsModal();
          // Uses existing editSchool -> showEditModal flow
          if (typeof editSchool === 'function') {
            editSchool(school);
          }
        });
      }

      if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
          // Optionally close details modal first
          closeDetailsModal();
          if (typeof deleteSchool === 'function') {
            deleteSchool(school.school_id, school.school_name || 'this school');
          }
        });
      }
    }
  }
}


// ========== SCHOOL COMPARISON FUNCTIONS ==========
// Comparison state
let comparisonMode = {
  active: false,
  school1: null,
  school2: null
};

window.startComparisonMode = function () {
  comparisonMode.active = true;
  comparisonMode.school1 = null;
  comparisonMode.school2 = null;

  showComparisonNotification();
  addComparisonClickListeners();
  showToast('Click on two schools to compare', 'info');
};

function showComparisonNotification() {
  // Remove existing notification if any
  const existing = document.getElementById('comparisonNotification');
  if (existing) existing.remove();

  const html = `
    <div id="comparisonNotification" class="comparison-notification">
      <div class="comparison-notification-content">
        <div class="comparison-notification-header">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"/>
            <path fill-rule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5z"/>
          </svg>
          <span>Comparison Mode Active</span>
        </div>
        <div class="comparison-notification-body">
          <div class="comparison-school-slot" id="comparisonSlot1">
            <div class="slot-number">1</div>
            <div class="slot-text">Select first school</div>
          </div>
          <div class="comparison-school-slot" id="comparisonSlot2">
            <div class="slot-number">2</div>
            <div class="slot-text">Select second school</div>
          </div>
        </div>
        <button class="btn-danger" onclick="cancelComparison()">
          Exit Comparison Mode
        </button>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', html);
}

function addComparisonClickListeners() {
  // Add to all existing school rows
  document.querySelectorAll('.data-table tbody tr').forEach(row => {
    const schoolId = extractSchoolIdFromRow(row);
    if (schoolId) {
      row.style.cursor = 'pointer';
      row.classList.add('comparison-selectable');
      row.onclick = (e) => {
        // Don't trigger if clicking action buttons
        if (e.target.closest('button')) return;
        selectSchoolForComparison(row, schoolId);
      };
    }
  });
  // Add to clickable result items
  document.querySelectorAll('.result-item').forEach(item => {
    const schoolId = item.getAttribute('onclick')?.match(/viewItemDetails\("schools", (\d+)\)/)?.[1];
    if (schoolId) {
      item.classList.add('comparison-selectable');
      const originalOnclick = item.onclick;
      item.onclick = (e) => {
        if (comparisonMode.active) {
          e.stopPropagation();
          selectSchoolForComparison(item, schoolId);
        } else if (originalOnclick) {
          originalOnclick.call(item, e);
        }
      };
    }
  });
}

function extractSchoolIdFromRow(row) {
  // Try to find school_id from the first cell (school_id column)
  const firstCell = row.cells[0];
  if (firstCell && !isNaN(firstCell.textContent.trim())) {
    return firstCell.textContent.trim();
  }

  // Try from edit button
  const editBtn = row.querySelector('.btn-edit');
  if (editBtn) {
    const onclickAttr = editBtn.getAttribute('onclick');
    const match = onclickAttr?.match(/school_id['":]?\s*[:=]?\s*(\d+)/);
    if (match) return match[1];

    // Try to extract from JSON in onclick
    const jsonMatch = onclickAttr?.match(/\{[^}]+school_id['":]?\s*:\s*(\d+)/);
    if (jsonMatch) return jsonMatch[1];
  }

  // Try from delete button
  const deleteBtn = row.querySelector('.btn-danger');
  if (deleteBtn) {
    const onclickAttr = deleteBtn.getAttribute('onclick');
    const match = onclickAttr?.match(/deleteSchool\((\d+)/);
    if (match) return match[1];
  }

  return null;
}

function selectSchoolForComparison(element, schoolId) {
  if (!comparisonMode.active) return;

  // If this school is already selected, deselect it
  if (comparisonMode.school1?.id === schoolId) {
    comparisonMode.school1 = null;
    updateComparisonSlot(1, null);
    element.classList.remove('comparison-selected-1');
    return;
  }
  if (comparisonMode.school2?.id === schoolId) {
    comparisonMode.school2 = null;
    updateComparisonSlot(2, null);
    element.classList.remove('comparison-selected-2');
    return;
  }

  const schoolName = extractSchoolName(element);

  // Add to first empty slot
  if (!comparisonMode.school1) {
    comparisonMode.school1 = { id: schoolId, name: schoolName, element };
    updateComparisonSlot(1, schoolName);
    element.classList.add('comparison-selected-1');
    showToast(`School 1 selected: ${schoolName}`, 'success');
  } else if (!comparisonMode.school2) {
    comparisonMode.school2 = { id: schoolId, name: schoolName, element };
    updateComparisonSlot(2, schoolName);
    element.classList.add('comparison-selected-2');
    showToast(`School 2 selected: ${schoolName}`, 'success');

    // Both schools selected, execute comparison
    setTimeout(() => executeComparison(), 500);
  }
}

function extractSchoolName(element) {
  // Try different methods to extract school name based on element type

  // Method 1: For table rows - look for school_name in the cells
  if (element.tagName === 'TR') {
    // Try to find the cell with school name (usually second cell after school_id)
    const cells = element.querySelectorAll('td');
    if (cells.length > 1) {
      // Second cell typically contains school name
      const schoolNameCell = cells[1];
      if (schoolNameCell) {
        return schoolNameCell.textContent.trim();
      }
    }
  }

  // Method 2: Look for strong tag (used in many result displays)
  const strong = element.querySelector('strong');
  if (strong) return strong.textContent.trim();

  // Method 3: Look for result-item-title class (universal search)
  const titleDiv = element.querySelector('.result-item-title');
  if (titleDiv) return titleDiv.textContent.trim();

  // Method 4: First cell of table row
  const firstCell = element.querySelector('td:first-child');
  if (firstCell) return firstCell.textContent.trim();

  // Fallback: return 'Unknown School'
  return 'Unknown School';
}

function updateComparisonSlot(slotNumber, schoolName) {
  const slot = document.getElementById(`comparisonSlot${slotNumber}`);
  if (!slot) return;

  const slotText = slot.querySelector('.slot-text');
  if (schoolName) {
    slot.classList.add('filled');
    slotText.textContent = schoolName;
  } else {
    slot.classList.remove('filled');
    slotText.textContent = 'Click a school';
  }
}

window.handleComparisonClick = function (schoolId, schoolName) {
  if (!comparisonMode.active) return false;

  console.log('Comparison click:', schoolId, schoolName);

  // If this school is already selected, deselect it
  if (comparisonMode.school1?.id === String(schoolId)) {
    comparisonMode.school1 = null;
    updateComparisonSlot(1, null);
    return true;
  }
  if (comparisonMode.school2?.id === String(schoolId)) {
    comparisonMode.school2 = null;
    updateComparisonSlot(2, null);
    return true;
  }

  // Add to first empty slot
  if (!comparisonMode.school1) {
    comparisonMode.school1 = { id: String(schoolId), name: schoolName };
    updateComparisonSlot(1, schoolName);
    showToast(`School 1: ${schoolName}`, 'success');
    return true;
  } else if (!comparisonMode.school2) {
    comparisonMode.school2 = { id: String(schoolId), name: schoolName };
    updateComparisonSlot(2, schoolName);
    showToast(`School 2: ${schoolName}`, 'success');

    // Both schools selected, execute comparison
    setTimeout(() => executeComparison(), 500);
    return true;
  }

  return true;
};

window.cancelComparison = function () {
  comparisonMode.active = false;

  // Remove notification
  const notification = document.getElementById('comparisonNotification');
  if (notification) notification.remove();

  comparisonMode.school1 = null;
  comparisonMode.school2 = null;

  showToast('Comparison cancelled', 'info');
};

async function executeComparison() {
  if (!comparisonMode.school1 || !comparisonMode.school2) {
    showToast('Please select two schools', 'error');
    return;
  }

  console.log('Executing comparison:', comparisonMode.school1, comparisonMode.school2);
  showToast('Loading comparison...', 'info');

  try {
    const response = await fetch('/api/schools/compare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        school1_id: comparisonMode.school1.id,
        school2_id: comparisonMode.school2.id
      })
    });

    if (!response.ok) {
      throw new Error(`Server responded with status ${response.status}`);
    }

    const data = await response.json();
    console.log('Comparison data received:', data);

    if (!data.success) {
      showToast(data.message || 'Comparison failed', 'error');
      return;
    }

    displaySideBySideComparison(data.school1, data.school2);
    showToast('Comparison loaded successfully', 'success');

    // Don't cancel comparison mode - let user compare more schools
    // Clear selections for next comparison
    comparisonMode.school1 = null;
    comparisonMode.school2 = null;
    updateComparisonSlot(1, null);
    updateComparisonSlot(2, null);

  } catch (error) {
    console.error('Comparison error:', error);
    showToast('Failed to compare schools: ' + error.message, 'error');

    // Check if it's a network error
    if (error.message.includes('Failed to fetch') || error.message.includes('ERR_CONNECTION_REFUSED')) {
      showToast('Server connection failed. Please check if the server is running.', 'error');
    }
  }
}

function displaySideBySideComparison(school1, school2) {
  const html = `
    <div class="modal active" id="comparisonModal">
      <div class="modal-overlay" onclick="closeComparisonModal()"></div>
      <div class="comparison-container">
        ${renderSchoolComparisonPanel(school1, school2, 1)}
        ${renderSchoolComparisonPanel(school2, school1, 2)}
      </div>
      <button class="comparison-close-btn" onclick="closeComparisonModal()">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
        </svg>
      </button>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', html);
  document.body.style.overflow = 'hidden';
}

function renderSchoolComparisonPanel(school, otherSchool, panelNum) {
  // Find unique items
  const uniqueSubjects = school.subjects.filter(s => !otherSchool.subjects.includes(s));
  const uniqueCCAs = school.ccas.filter(c => !otherSchool.ccas.some(oc => oc.cca_grouping_desc === c.cca_grouping_desc));
  const uniqueProgs = school.programmes.filter(p => !otherSchool.programmes.includes(p));

  return `
    <div class="comparison-panel panel-${panelNum}">
      <div class="comparison-panel-header">
        <h3>${school.school_name}</h3>
        <span class="badge zone-${school.zone_code?.toLowerCase()}">${school.zone_code}</span>
      </div>
      
      <div class="comparison-panel-content">
        ${renderBasicInfoSection(school)}
        ${renderContactSection(school)}
        ${renderSpecialProgrammesSection(school)}
        ${renderSubjectsSection(school.subjects, uniqueSubjects)}
        ${renderCCAsSection(school.ccas, uniqueCCAs)}
        ${renderProgrammesSection(school.programmes, uniqueProgs)}
        ${renderDistinctivesSection(school.distinctives)}
        ${renderTransportSection(school)}
      </div>
    </div>
  `;
}

function renderBasicInfoSection(s) {
  return `
    <div class="info-section">
      <h4>Basic Information</h4>
      <div class="info-grid">
        ${s.mainlevel_code ? `<div class="info-item"><label>Level:</label><span>${s.mainlevel_code}</span></div>` : ''}
        ${s.address ? `<div class="info-item"><label>Address:</label><span>${s.address}</span></div>` : ''}
        ${s.postal_code ? `<div class="info-item"><label>Postal:</label><span>${s.postal_code}</span></div>` : ''}
        ${s.principal_name ? `<div class="info-item"><label>Principal:</label><span>${s.principal_name}</span></div>` : ''}
        ${s.type_code ? `<div class="info-item"><label>Type:</label><span>${s.type_code}</span></div>` : ''}
        ${s.nature_code ? `<div class="info-item"><label>Nature:</label><span>${s.nature_code}</span></div>` : ''}
      </div>
    </div>
  `;
}

function renderContactSection(s) {
  if (!s.email_address && !s.telephone_no) return '';
  return `
    <div class="info-section">
      <h4>Contact</h4>
      <div class="info-grid">
        ${s.email_address ? `<div class="info-item"><label>Email:</label><span>${s.email_address}</span></div>` : ''}
        ${s.telephone_no ? `<div class="info-item"><label>Phone:</label><span>${s.telephone_no}</span></div>` : ''}
      </div>
    </div>
  `;
}

function renderSpecialProgrammesSection(s) {
  const programmes = [];
  if (s.autonomous_ind === 'Yes') programmes.push('Autonomous');
  if (s.gifted_ind === 'Yes') programmes.push('Gifted');
  if (s.ip_ind === 'Yes') programmes.push('IP');
  if (s.sap_ind === 'Yes') programmes.push('SAP');

  if (programmes.length === 0) return '';

  return `
    <div class="info-section">
      <h4>Special Programmes</h4>
      <div class="badge-list">
        ${programmes.map(p => `<span class="badge">${p}</span>`).join('')}
      </div>
    </div>
  `;
}

function renderSubjectsSection(subjects, uniqueSubjects) {
  if (!subjects || subjects.length === 0) return '';

  return `
    <div class="info-section">
      <h4>Subjects (${subjects.length})</h4>
      <div class="badge-list">
        ${subjects.map(s => {
    const isUnique = uniqueSubjects.includes(s);
    return `<span class="badge ${isUnique ? 'badge-unique' : ''}">${s}</span>`;
  }).join('')}
      </div>
    </div>
  `;
}

function renderCCAsSection(ccas, uniqueCCAs) {
  if (!ccas || ccas.length === 0) return '';

  return `
    <div class="info-section">
      <h4>CCAs (${ccas.length})</h4>
      <div class="badge-list">
        ${ccas.map(c => {
    const isUnique = uniqueCCAs.some(uc => uc.cca_grouping_desc === c.cca_grouping_desc);
    return `<span class="badge ${isUnique ? 'badge-unique' : ''}">${c.cca_grouping_desc}</span>`;
  }).join('')}
      </div>
    </div>
  `;
}

function renderProgrammesSection(programmes, uniqueProgs) {
  if (!programmes || programmes.length === 0) return '';

  return `
    <div class="info-section">
      <h4>MOE Programmes (${programmes.length})</h4>
      <div class="badge-list">
        ${programmes.map(p => {
    const isUnique = uniqueProgs.includes(p);
    return `<span class="badge ${isUnique ? 'badge-unique' : ''}">${p}</span>`;
  }).join('')}
      </div>
    </div>
  `;
}

function renderDistinctivesSection(distinctives) {
  if (!distinctives || distinctives.length === 0) return '';

  return `
    <div class="info-section">
      <h4>Distinctive Programmes</h4>
      ${distinctives.map(d => `
        <div class="distinctive-item">
          ${d.alp_title ? `<div><strong>ALP:</strong> ${d.alp_title}</div>` : ''}
          ${d.llp_title ? `<div><strong>LLP:</strong> ${d.llp_title}</div>` : ''}
        </div>
      `).join('')}
    </div>
  `;
}

function renderTransportSection(s) {
  if (!s.mrt_desc && !s.bus_desc) return '';

  return `
    <div class="info-section">
      <h4>Transportation</h4>
      <div class="info-grid">
        ${s.mrt_desc ? `<div class="info-item"><label>MRT:</label><span>${s.mrt_desc}</span></div>` : ''}
        ${s.bus_desc ? `<div class="info-item"><label>Bus:</label><span>${s.bus_desc}</span></div>` : ''}
      </div>
    </div>
  `;
}

window.closeComparisonModal = function () {
  const modal = document.getElementById('comparisonModal');
  if (modal) {
    modal.remove();
    document.body.style.overflow = 'auto';
  }
};

// ========== CORRECTED DISTANCE SEARCH BY POSTAL CODE ==========
window.showDistanceSearch = function () {
  console.log('Opening distance search modal');

  // Find the modal element in the DOM
  const modal = document.getElementById('distanceSearchModal');

  // Check if modal exists
  if (!modal) {
    console.error('Distance search modal not found in DOM');
    showToast('Error: Modal not found', 'error');
    return;
  }

  // Show the modal
  modal.style.display = 'block';
  modal.classList.add('active');

  // Prevent background scrolling
  document.body.style.overflow = 'hidden';

  // Focus on the postal code input field after a short delay
  setTimeout(() => {
    const postalInput = document.getElementById('distPostalCode');
    if (postalInput) {
      postalInput.focus();
    }
  }, 300);
};

// ========== USE CURRENT LOCATION ==========
// Use My Location - Get postal code from browser location
window.useCurrentLocation = function () {
  console.log('Getting current location...');

  const btn = document.getElementById('useLocationBtn');
  const btnText = document.getElementById('locationBtnText') || btn;
  const postalInput = document.getElementById('distPostalCode');

  if (!postalInput) {
    console.error('Postal code input not found');
    showToast('Error: Form elements not found', 'error');
    return;
  }

  // Check if geolocation is supported
  if (!navigator.geolocation) {
    showToast('Geolocation is not supported by your browser', 'error');
    return;
  }

  // Set loading state
  btn.disabled = true;
  btnText.textContent = 'Getting location...';

  // Request location from browser - THIS WILL PROMPT USER
  navigator.geolocation.getCurrentPosition(
    // ========== SUCCESS CALLBACK ==========
    async function (position) {
      const latitude = position.coords.latitude;
      const longitude = position.coords.longitude;

      console.log('Location detected:', { latitude, longitude });

      // Update button text
      btnText.textContent = 'Finding postal code...';

      try {
        // Call our backend API for reverse geocoding
        const response = await fetch(`/api/reverse-geocode?lat=${latitude}&lng=${longitude}`);

        const result = await response.json();

        console.log('Reverse geocode result:', result);

        if (!result.success) {
          throw new Error(result.message || 'Failed to get postal code');
        }

        // Fill the postal code input field
        postalInput.value = result.data.postalCode;

        // Show success message
        const address = result.data.buildingName || result.data.address || 'Location';
        showToast(`Location found: ${address} (${result.data.postalCode})`, 'success');
        console.log('Postal code set:', result.data.postalCode);

      } catch (error) {
        console.error('Geocoding error:', error);
        showToast(`Failed to get postal code: ${error.message}`, 'error');
        postalInput.focus();
      } finally {
        // Reset button state
        btn.disabled = false;
        btnText.textContent = 'Use My Location';
      }
    },

    // ========== ERROR CALLBACK ==========
    function (error) {
      console.error('Geolocation error:', error);

      let errorMessage = '';

      switch (error.code) {
        case error.PERMISSION_DENIED:
          errorMessage = 'Location access denied. Please enable location permissions in your browser settings.';
          break;
        case error.POSITION_UNAVAILABLE:
          errorMessage = 'Location information unavailable. Please try again or enter postal code manually.';
          break;
        case error.TIMEOUT:
          errorMessage = 'Location request timed out. Please try again.';
          break;
        default:
          errorMessage = 'Unable to get your location. Please enter postal code manually.';
      }

      showToast(errorMessage, 'error');

      // Reset button state
      btn.disabled = false;
      btnText.textContent = 'Use My Location';

      // Focus on input for manual entry
      postalInput.focus();
    },

    // ========== GEOLOCATION OPTIONS ==========
    {
      enableHighAccuracy: true,  // Request high accuracy GPS
      timeout: 10000,            // 10 second timeout
      maximumAge: 0              // Don't use cached position
    }
  );
};

// ========== FIXED EXECUTE DISTANCE SEARCH ==========
window.executeDistanceSearch = async function () {
  console.log('Executing distance search...');

  // Get references to form input fields
  const postalInput = document.getElementById('distPostalCode');
  const radiusInput = document.getElementById('distRadius');

  // Validate that form fields exist
  if (!postalInput || !radiusInput) {
    console.error('Form fields not found:', {
      postalInput: !!postalInput,
      radiusInput: !!radiusInput
    });
    showToast('Error: Form fields not found', 'error');
    return;
  }

  // Get values from inputs
  const postal_code = postalInput.value.trim();
  const radius_km = parseFloat(radiusInput.value);

  console.log('Search parameters:', { postal_code, radius_km });

  // ===== VALIDATE POSTAL CODE =====
  // Must be exactly 6 digits
  if (!postal_code || postal_code.length !== 6 || !/^\d{6}$/.test(postal_code)) {
    showToast('Please enter a valid 6-digit postal code', 'error');
    postalInput.focus(); // Focus on the input so user can fix it
    return;
  }

  // ===== VALIDATE RADIUS =====
  // Must be between 0.5 and 20 km
  if (!radius_km || radius_km < 0.5 || radius_km > 20) {
    showToast('Please enter a valid radius between 0.5 and 20 km', 'error');
    radiusInput.focus();
    return;
  }

  // Close the modal
  closeDistanceSearch();

  // Show loading message
  showToast('Searching nearby schools...', 'info');

  // Switch to search view to show results
  switchView('search');

  try {
    console.log('Sending request to server...');

    // ===== SEND POST REQUEST TO SERVER =====
    const response = await fetch('/api/schools/search-by-postal-code', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        postal_code,   // The 6-digit postal code
        radius_km      // The search radius in kilometers
      })
    });

    console.log('Server response status:', response.status);

    // Check if response is successful
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Server error response:', errorText);
      throw new Error(`Server error: ${response.status} - ${errorText}`);
    }

    // Parse JSON response
    const data = await response.json();
    console.log('Distance search results:', data);

    // Check if search was successful
    if (!data.success) {
      showToast(data.message || 'Search failed', 'error');
      displayEmptyDistanceResults(postal_code, radius_km);
      return;
    }

    // ===== DISPLAY RESULTS =====
    displayDistanceResults(data.results, data.search_params);

    // Show appropriate success message
    if (data.results.length === 0) {
      showToast('No schools found within the specified radius', 'info');
    } else {
      showToast(`Found ${data.results.length} school(s) within ${radius_km}km`, 'success');
    }

  } catch (error) {
    // Handle any errors that occurred during the search
    console.error('Distance search error:', error);
    showToast('Failed to search schools: ' + error.message, 'error');
    displayEmptyDistanceResults(postal_code, radius_km);
  }
};

function displayDistanceResults(results, params) {
  // Get references to result containers
  const resultsTable = document.getElementById('resultsTable');
  const resultsMeta = document.getElementById('resultsMeta');
  const summary = document.getElementById('universalSearchSummary');

  // Validate containers exist
  if (!resultsTable || !resultsMeta) {
    console.error('Results containers not found');
    return;
  }

  // Hide universal search summary (it's for other search types)
  if (summary) {
    summary.style.display = 'none';
  }

  // ===== UPDATE METADATA =====
  // Show search parameters and result count
  resultsMeta.textContent = `Found ${results.length} school(s) within ${params.radius_km}km of postal code ${params.postal_code}`;

  // ===== HANDLE EMPTY RESULTS =====
  if (results.length === 0) {
    resultsTable.innerHTML = `
      <div class="empty-state">
        <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
          <circle cx="32" cy="32" r="30" stroke="#E5E7EB" stroke-width="4"/>
          <path d="M32 20v24M20 32h24" stroke="#E5E7EB" stroke-width="4" stroke-linecap="round"/>
        </svg>
        <h3>No schools found</h3>
        <p>Try increasing the search radius or checking the postal code</p>
      </div>
    `;
    return;
  }

  // ===== BUILD RESULTS TABLE =====
  let html = '<div style="overflow-x: auto;"><table class="data-table"><thead><tr>';

  // Table headers
  html += '<th>Distance</th>';
  html += '<th>School Name</th>';
  html += '<th>Zone</th>';
  html += '<th>Level</th>';
  html += '<th>Address</th>';
  html += '<th>Postal Code</th>';
  html += '</tr></thead><tbody>';

  // ===== TABLE ROWS =====
  // Loop through each school result
  results.forEach(school => {
    // Make row clickable to view school details
    html += `<tr 
      data-clickable="true" 
      data-school-id="${school.school_id}" 
      onclick='viewItemDetails("schools", ${school.school_id})' 
      style="cursor: pointer;"
    >`;

    // Distance column (highlighted with badge)
    html += `<td>
      <span class="badge" style="background: #DBEAFE; color: #1E40AF; font-weight: 700; font-size: 14px;">
        ${school.distance_km} km
      </span>
    </td>`;

    // School name (bold)
    html += `<td><strong>${school.school_name}</strong></td>`;

    // Zone badge (colored by zone)
    html += `<td>
      <span class="badge zone-${(school.zone_code || '').toLowerCase()}">
        ${school.zone_code || '-'}
      </span>
    </td>`;

    // Level
    html += `<td>${school.mainlevel_code || '-'}</td>`;

    // Address
    html += `<td>${school.address || '-'}</td>`;

    // Postal code
    html += `<td>${school.postal_code || '-'}</td>`;

    html += `</tr>`;
  });

  // Close table tags
  html += '</tbody></table></div>';

  // Insert the HTML into the results container
  resultsTable.innerHTML = html;

  console.log(`Displayed ${results.length} schools in results table`);
}

function displayEmptyDistanceResults(postal_code, radius_km) {
  // Get references to result containers
  const resultsTable = document.getElementById('resultsTable');
  const resultsMeta = document.getElementById('resultsMeta');

  // ===== UPDATE METADATA =====
  if (resultsMeta) {
    resultsMeta.textContent = `No schools found within ${radius_km}km of postal code ${postal_code}`;
  }

  // ===== DISPLAY EMPTY STATE MESSAGE =====
  if (resultsTable) {
    resultsTable.innerHTML = `
      <div class="empty-state">
        <!-- Empty state icon (circle with plus sign) -->
        <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
          <circle cx="32" cy="32" r="30" stroke="#E5E7EB" stroke-width="4"/>
          <path d="M32 20v24M20 32h24" stroke="#E5E7EB" stroke-width="4" stroke-linecap="round"/>
        </svg>
        
        <!-- Main message -->
        <h3>No schools found</h3>
        
        <!-- Helpful suggestion -->
        <p>Try increasing the search radius or verifying the postal code</p>
      </div>
    `;
  }

  console.log(`Empty state displayed for postal code ${postal_code}, radius ${radius_km}km`);
}

// ========== CLOSE DISTANCE SEARCH ==========
window.closeDistanceSearch = function () {
  console.log('Closing distance search modal');

  // Find the modal element
  const modal = document.getElementById('distanceSearchModal');

  if (modal) {
    // Hide the modal
    modal.style.display = 'none';
    modal.classList.remove('active');

    // Restore background scrolling
    document.body.style.overflow = 'auto';

    // Reset the form to clear all inputs
    const form = document.getElementById('distanceSearchForm');
    if (form) {
      form.reset();
    }
  }
};

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

  // Group CCAs by cca_generic_name (the category)
  const groupedCCAs = {};
  ccas.forEach(cca => {
    const group = cca.cca_generic_name || 'Other';
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
                            <strong style="color: #065F46; font-size: 0.9rem;">${cca.cca_grouping_desc}</strong>
                            ${cca.cca_customized_name && cca.cca_customized_name !== cca.cca_grouping_desc ?
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

window.showRecentSchools = async function () {
  if (!isUserAdmin()) {
    showToast('Admin access required', 'error');
    return;
  }

  showToast('Loading recent schools...', 'info');

  try {
    const response = await fetch('/api/schools/recent', {
      headers: getAuthHeaders()
    });

    const data = await response.json();

    if (!data.success || !data.schools || data.schools.length === 0) {
      showToast('No recent schools found', 'info');
      return;
    }

    displayRecentSchoolsModal(data.schools);

  } catch (error) {
    console.error('Failed to load recent schools:', error);
    showToast('Failed to load recent schools', 'error');
  }
};

function displayRecentSchoolsModal(schools) {
  let html = `
    <div class="modal active" id="recentSchoolsModal">
      <div class="modal-overlay" onclick="closeRecentSchoolsModal()"></div>
      <div class="modal-content" style="max-width: 800px;">
        <div class="modal-header">
          <h3>Recent Additions (Last ${schools.length})</h3>
          <button class="modal-close" onclick="closeRecentSchoolsModal()">×</button>
        </div>
        <div class="modal-body" style="padding: 1.5rem; max-height: 60vh; overflow-y: auto;">
          <div style="display: flex; flex-direction: column; gap: 1rem;">
  `;

  schools.forEach(school => {
    html += `
      <div class="recent-school-item" 
           onclick="viewItemDetails('schools', ${school.school_id}); closeRecentSchoolsModal();"
           style="padding: 1rem; border: 1px solid #E5E7EB; border-radius: 0.5rem; cursor: pointer; transition: all 0.2s;">
        <div style="display: flex; justify-content: space-between; align-items: start;">
          <div>
            <h4 style="margin: 0 0 0.5rem 0; color: #1F2937;">${school.school_name}</h4>
            <p style="margin: 0; color: #6B7280; font-size: 0.875rem;">${school.address}</p>
            <div style="margin-top: 0.5rem; display: flex; gap: 0.5rem;">
              <span class="badge zone-${school.zone_code?.toLowerCase()}">${school.zone_code}</span>
              <span class="badge">${school.mainlevel_code}</span>
            </div>
          </div>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" style="color: #9CA3AF;">
            <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"/>
          </svg>
        </div>
      </div>
    `;
  });

  html += `
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', html);
  document.body.style.overflow = 'hidden';

  // Add hover effect
  document.querySelectorAll('.recent-school-item').forEach(item => {
    item.addEventListener('mouseenter', function () {
      this.style.backgroundColor = '#F9FAFB';
      this.style.borderColor = '#3B82F6';
    });
    item.addEventListener('mouseleave', function () {
      this.style.backgroundColor = '';
      this.style.borderColor = '#E5E7EB';
    });
  });
}

window.closeRecentSchoolsModal = function () {
  const modal = document.getElementById('recentSchoolsModal');
  if (modal) {
    modal.remove();
    document.body.style.overflow = 'auto';
  }
};

// ========== Utility Functions (GLOBAL) ==========
window.showAbout = function () {
  alert(
    'EduQuery SG\n\n' +
    'A comprehensive database management system for Singapore schools.\n\n' +
    'Features:\n' +
    '• Search schools by name\n' +
    '• View subjects, CCAs, programmes & distinctives\n' +
    '• Add, edit, and delete school records (Admin only)\n' +
    '• Analytics dashboard (Admin only)\n' +
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
    'MANAGE (Admin only):\n' +
    '1. Click "Add New School" button\n' +
    '2. Fill in all required fields\n' +
    '3. Click Save to add to database\n\n' +
    'EDIT/DELETE (Admin only):\n' +
    '1. Search for schools (General Info)\n' +
    '2. Use Edit or Delete buttons in the results table\n' +
    '3. Fill the form or confirm deletion in the modal\n\n' +
    'ANALYTICS (Admin only):\n' +
    '1. Access analytics dashboard for insights\n' +
    '2. View school statistics and data completeness\n\n' +
    'Need more help? Contact your database administrator.'
  );
};

// Make admin auth function globally available
window.handleAdminAuth = handleAdminAuth;

console.log('✓ All functions loaded and registered globally');
