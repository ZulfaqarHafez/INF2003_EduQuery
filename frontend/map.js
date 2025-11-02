// ========== Map Configuration ==========
let map = null;
let markers = [];
let markerLayer = null;
let schools = [];
let geocodeCache = {};
let currentZoneFilter = 'all';

// Singapore bounds
const SINGAPORE_BOUNDS = {
  north: 1.4784,
  south: 1.1496,
  east: 104.0945,
  west: 103.5947
};

// Singapore center
const SINGAPORE_CENTER = [1.3521, 103.8198];

// Zone colors
const ZONE_COLORS = {
  'NORTH': '#3B82F6',
  'SOUTH': '#10B981',
  'EAST': '#F59E0B',
  'WEST': '#EF4444',
  'CENTRAL': '#8B5CF6'
};

// ========== Initialize Map ==========
function initializeMap() {
  // Create map instance
  map = L.map('map', {
    center: SINGAPORE_CENTER,
    zoom: 11,
    maxBounds: [
      [SINGAPORE_BOUNDS.south - 0.1, SINGAPORE_BOUNDS.west - 0.1],
      [SINGAPORE_BOUNDS.north + 0.1, SINGAPORE_BOUNDS.east + 0.1]
    ],
    minZoom: 10,
    maxZoom: 18
  });

  // Add OpenStreetMap tiles
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
  }).addTo(map);

  // Create marker layer group
  markerLayer = L.layerGroup().addTo(map);

  // Set initial view
  map.setView(SINGAPORE_CENTER, 11);
}

// ========== Load Schools from Database ==========
async function loadSchoolsMap() {
  showMapLoading(true);
  
  try {
    // Fetch all schools from your API
    const response = await fetch('/api/schools?name=');
    if (!response.ok) throw new Error('Failed to fetch schools');
    
    schools = await response.json();
    
    console.log(`Loaded ${schools.length} schools from database`);
    
    // Update statistics
    document.getElementById('totalSchoolsMap').textContent = schools.length;
    
    // Geocode and display schools
    await displaySchools(schools);
    
    showToast(`Loaded ${schools.length} schools`, 'success');
  } catch (error) {
    console.error('Error loading schools:', error);
    showToast('Failed to load schools: ' + error.message, 'error');
  } finally {
    showMapLoading(false);
  }
}

// ========== Display Schools on Map ==========
async function displaySchools(schoolsToDisplay) {
  // Clear existing markers
  clearMarkers();
  
  let mappedCount = 0;
  let failedCount = 0;
  
  // Process schools in batches to avoid overwhelming the geocoding service
  const batchSize = 10;
  const batches = [];
  
  for (let i = 0; i < schoolsToDisplay.length; i += batchSize) {
    batches.push(schoolsToDisplay.slice(i, i + batchSize));
  }
  
  for (const batch of batches) {
    const promises = batch.map(async (school) => {
      try {
        // Filter by zone if needed
        if (currentZoneFilter !== 'all' && school.zone_code !== currentZoneFilter) {
          return null;
        }
        
        // Get coordinates from postal code
        const coords = await geocodePostalCode(school.postal_code);
        
        if (coords) {
          addSchoolMarker(school, coords);
          mappedCount++;
          return coords;
        } else {
          console.warn(`Failed to geocode school: ${school.school_name} (${school.postal_code})`);
          failedCount++;
          return null;
        }
      } catch (error) {
        console.error(`Error processing school ${school.school_name}:`, error);
        failedCount++;
        return null;
      }
    });
    
    // Wait for batch to complete
    await Promise.all(promises);
    
    // Update progress
    document.getElementById('mappedSchools').textContent = mappedCount;
    
    // Small delay between batches to avoid rate limiting
    if (batches.indexOf(batch) < batches.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  // Fit map to show all markers if we have any
  if (mappedCount > 0) {
    fitMapToMarkers();
  }
  
  // Show summary
  if (failedCount > 0) {
    showToast(`Mapped ${mappedCount} schools, ${failedCount} failed`, 'warning');
  } else {
    showToast(`Successfully mapped ${mappedCount} schools`, 'success');
  }
}

// ========== Geocode Postal Code using OneMap API ==========
async function geocodePostalCode(postalCode) {
  // Check cache first
  if (geocodeCache[postalCode]) {
    return geocodeCache[postalCode];
  }
  
  try {
    // Singapore's OneMap API for geocoding
    const response = await fetch(`https://www.onemap.gov.sg/api/common/elastic/search?searchVal=${postalCode}&returnGeom=Y&getAddrDetails=Y`);
    
    if (!response.ok) {
      throw new Error('OneMap API request failed');
    }
    
    const data = await response.json();
    
    if (data.found > 0 && data.results && data.results.length > 0) {
      const result = data.results[0];
      const coords = {
        lat: parseFloat(result.LATITUDE),
        lng: parseFloat(result.LONGITUDE)
      };
      
      // Cache the result
      geocodeCache[postalCode] = coords;
      return coords;
    }
    
    // Fallback: Try to estimate based on postal code district
    const districtCoords = getDistrictCoordinates(postalCode);
    if (districtCoords) {
      geocodeCache[postalCode] = districtCoords;
      return districtCoords;
    }
    
    return null;
  } catch (error) {
    console.error(`Geocoding error for ${postalCode}:`, error);
    
    // Use fallback coordinates based on postal district
    const fallbackCoords = getDistrictCoordinates(postalCode);
    if (fallbackCoords) {
      geocodeCache[postalCode] = fallbackCoords;
      return fallbackCoords;
    }
    
    return null;
  }
}

// ========== Fallback: Get approximate coordinates by postal district ==========
function getDistrictCoordinates(postalCode) {
  // Singapore postal code districts (first 2 digits)
  const district = postalCode.substring(0, 2);
  
  // Approximate coordinates for each district
  const districtCoords = {
    // District 01-06: Raffles Place, Cecil, Marina, People's Park
    '01': { lat: 1.2789, lng: 103.8536 },
    '02': { lat: 1.2789, lng: 103.8536 },
    '03': { lat: 1.2789, lng: 103.8536 },
    '04': { lat: 1.2742, lng: 103.8416 },
    '05': { lat: 1.2742, lng: 103.8416 },
    '06': { lat: 1.2742, lng: 103.8416 },
    // District 07-08: Anson, Tanjong Pagar
    '07': { lat: 1.2741, lng: 103.8454 },
    '08': { lat: 1.2741, lng: 103.8454 },
    // District 09-10: Orchard, Cairnhill, River Valley
    '09': { lat: 1.3048, lng: 103.8318 },
    '10': { lat: 1.3048, lng: 103.8318 },
    // District 11: Newton, Cairnhill
    '11': { lat: 1.3143, lng: 103.8422 },
    // District 12-13: Balestier, Toa Payoh, Serangoon
    '12': { lat: 1.3265, lng: 103.8506 },
    '13': { lat: 1.3294, lng: 103.8563 },
    // District 14-16: Geylang, Eunos, Paya Lebar
    '14': { lat: 1.3162, lng: 103.8821 },
    '15': { lat: 1.3149, lng: 103.9120 },
    '16': { lat: 1.3349, lng: 103.9093 },
    // District 17-18: Loyang, Changi
    '17': { lat: 1.3143, lng: 103.9448 },
    '18': { lat: 1.3404, lng: 103.9915 },
    // District 19-20: Serangoon, Hougang, Sengkang
    '19': { lat: 1.3554, lng: 103.8679 },
    '20': { lat: 1.3521, lng: 103.8843 },
    // District 21: Upper Bukit Timah, Clementi Park
    '21': { lat: 1.3329, lng: 103.7835 },
    // District 22-23: Jurong, Tuas
    '22': { lat: 1.3410, lng: 103.7090 },
    '23': { lat: 1.3321, lng: 103.7475 },
    // District 24-27: Tengah, Jurong East/West
    '24': { lat: 1.3465, lng: 103.7249 },
    '25': { lat: 1.3404, lng: 103.6970 },
    '26': { lat: 1.3465, lng: 103.6970 },
    '27': { lat: 1.3857, lng: 103.7449 },
    // District 28-30: Sembawang, Yishun
    '28': { lat: 1.3868, lng: 103.8351 },
    '29': { lat: 1.4257, lng: 103.8351 },
    '30': { lat: 1.4257, lng: 103.8351 },
    // District 31-33: Upper Thomson, Springleaf
    '31': { lat: 1.3831, lng: 103.8188 },
    '32': { lat: 1.3831, lng: 103.8188 },
    '33': { lat: 1.3831, lng: 103.8188 },
    // District 34-37: Punggol
    '34': { lat: 1.4053, lng: 103.9020 },
    '35': { lat: 1.4053, lng: 103.9020 },
    '36': { lat: 1.4053, lng: 103.9020 },
    '37': { lat: 1.4053, lng: 103.9020 },
    // District 38-41: Pasir Ris
    '38': { lat: 1.3721, lng: 103.9474 },
    '39': { lat: 1.3721, lng: 103.9474 },
    '40': { lat: 1.3721, lng: 103.9474 },
    '41': { lat: 1.3721, lng: 103.9474 },
    // District 42-45: Tampines
    '42': { lat: 1.3541, lng: 103.9434 },
    '43': { lat: 1.3541, lng: 103.9434 },
    '44': { lat: 1.3541, lng: 103.9434 },
    '45': { lat: 1.3541, lng: 103.9434 },
    // District 46-48: Bedok
    '46': { lat: 1.3236, lng: 103.9273 },
    '47': { lat: 1.3236, lng: 103.9273 },
    '48': { lat: 1.3236, lng: 103.9273 },
    // District 49-50: Sim Lim, Bendemeer
    '49': { lat: 1.3158, lng: 103.8631 },
    '50': { lat: 1.3158, lng: 103.8631 },
    // District 51-52: Hougang, Sengkang
    '51': { lat: 1.3710, lng: 103.8926 },
    '52': { lat: 1.3710, lng: 103.8926 },
    // District 53-55: Ang Mo Kio, Bishan
    '53': { lat: 1.3691, lng: 103.8454 },
    '54': { lat: 1.3691, lng: 103.8454 },
    '55': { lat: 1.3691, lng: 103.8454 },
    // District 56-57: Bishan, Ang Mo Kio
    '56': { lat: 1.3526, lng: 103.8352 },
    '57': { lat: 1.3526, lng: 103.8352 },
    // District 58-59: Upper Bukit Timah
    '58': { lat: 1.3394, lng: 103.7808 },
    '59': { lat: 1.3394, lng: 103.7808 },
    // District 60-64: Jurong
    '60': { lat: 1.3329, lng: 103.7436 },
    '61': { lat: 1.3329, lng: 103.7436 },
    '62': { lat: 1.3329, lng: 103.7436 },
    '63': { lat: 1.3329, lng: 103.7436 },
    '64': { lat: 1.3329, lng: 103.7436 },
    // District 65-68: Hillview, Bukit Panjang, Choa Chu Kang
    '65': { lat: 1.3621, lng: 103.7630 },
    '66': { lat: 1.3621, lng: 103.7630 },
    '67': { lat: 1.3807, lng: 103.7470 },
    '68': { lat: 1.3945, lng: 103.7449 },
    // District 69-71: Lim Chu Kang, Tengah
    '69': { lat: 1.4271, lng: 103.7170 },
    '70': { lat: 1.4271, lng: 103.7170 },
    '71': { lat: 1.4271, lng: 103.7170 },
    // District 72-73: Kranji, Woodlands
    '72': { lat: 1.4382, lng: 103.7470 },
    '73': { lat: 1.4355, lng: 103.7859 },
    // District 75-76: Yishun
    '75': { lat: 1.4304, lng: 103.8354 },
    '76': { lat: 1.4143, lng: 103.8329 },
    // District 77-78: Sembawang, Seletar
    '77': { lat: 1.4491, lng: 103.8185 },
    '78': { lat: 1.4491, lng: 103.8185 },
    // District 79-80: Seletar
    '79': { lat: 1.3875, lng: 103.8709 },
    '80': { lat: 1.3875, lng: 103.8709 },
    // District 81: Loyang, Changi
    '81': { lat: 1.3644, lng: 103.9915 },
    // District 82: Punggol, Sengkang
    '82': { lat: 1.3840, lng: 103.9065 }
  };
  
  return districtCoords[district] || null;
}

// ========== Add School Marker to Map ==========
function addSchoolMarker(school, coords) {
  const color = ZONE_COLORS[school.zone_code] || '#6B7280';
  
  // Create custom icon
  const icon = L.divIcon({
    className: 'custom-marker',
    html: `<div style="
      background-color: ${color};
      width: 30px;
      height: 30px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 3px solid white;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    ">
      <svg width="16" height="16" viewBox="0 0 20 20" fill="white">
        <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"/>
      </svg>
    </div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -15]
  });
  
  // Create marker
  const marker = L.marker([coords.lat, coords.lng], { icon: icon });
  
  // Create popup content
  const popupContent = `
    <div class="popup-content">
      <div class="popup-title">${school.school_name}</div>
      <div class="popup-info">
        <strong>Address:</strong> ${school.address}<br>
        <strong>Postal Code:</strong> ${school.postal_code}<br>
        <strong>Zone:</strong> ${school.zone_code}<br>
        <strong>Level:</strong> ${school.mainlevel_code}<br>
        <strong>Principal:</strong> ${school.principal_name}
      </div>
    </div>
  `;
  
  marker.bindPopup(popupContent);
  
  // Add to layer group
  markerLayer.addLayer(marker);
  markers.push(marker);
  
  return marker;
}

// ========== Clear All Markers ==========
function clearMarkers() {
  if (markerLayer) {
    markerLayer.clearLayers();
  }
  markers = [];
}

// ========== Fit Map to Show All Markers ==========
function fitMapToMarkers() {
  if (markers.length === 0) return;
  
  const group = L.featureGroup(markers);
  map.fitBounds(group.getBounds().pad(0.1));
}

// ========== Reset Map View ==========
function resetMapView() {
  map.setView(SINGAPORE_CENTER, 11);
  currentZoneFilter = 'all';
  
  // Reset filter chips
  document.querySelectorAll('.chip').forEach(chip => {
    chip.classList.remove('active');
    if (chip.dataset.zone === 'all') {
      chip.classList.add('active');
    }
  });
  
  // Update zone display
  document.getElementById('selectedZone').textContent = 'All';
  
  // Reload schools
  if (schools.length > 0) {
    displaySchools(schools);
  }
}

// ========== Zone Filter ==========
function filterByZone(zone) {
  currentZoneFilter = zone;
  
  // Update zone display
  document.getElementById('selectedZone').textContent = zone === 'all' ? 'All' : zone;
  
  // Filter and redisplay
  const filteredSchools = zone === 'all' 
    ? schools 
    : schools.filter(s => s.zone_code === zone);
  
  displaySchools(filteredSchools);
}

// ========== Loading Indicator ==========
function showMapLoading(show) {
  const loadingDiv = document.getElementById('mapLoading');
  if (loadingDiv) {
    loadingDiv.style.display = show ? 'flex' : 'none';
  }
}

// ========== Toast Notification ==========
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  const toastMessage = document.getElementById('toastMessage');
  
  if (!toast || !toastMessage) return;
  
  toastMessage.textContent = message;
  toast.className = 'toast show ' + type;
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// ========== Help Function ==========
function showMapHelp() {
  alert(
    'School Map Help\n\n' +
    '• Click on any marker to see school details\n' +
    '• Use zone filters to show specific zones\n' +
    '• Markers are color-coded by zone\n' +
    '• Click "Reset View" to center map on Singapore\n' +
    '• Click "Refresh Map" to reload school data\n\n' +
    'Note: School locations are based on postal codes\n' +
    'Some locations may be approximate.'
  );
}

// ========== Initialize on Page Load ==========
document.addEventListener('DOMContentLoaded', function() {
  console.log('Initializing school map...');
  
  // Initialize map
  initializeMap();
  
  // Load schools automatically
  loadSchoolsMap();
  
  // Setup zone filter chips
  document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', function() {
      // Update active state
      document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      this.classList.add('active');
      
      // Apply filter
      filterByZone(this.dataset.zone);
    });
  });
  
  console.log('Map initialization complete');
});