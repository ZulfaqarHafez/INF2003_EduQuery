const express = require('express');
const pool = require('./pg-connection');   // PostgreSQL
const connectMongo = require('./mongo-connection'); // MongoDB
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const path = require('path');

// OneMap API credentials from environment variables
const ONEMAP_EMAIL = process.env.ONEMAP_EMAIL;
const ONEMAP_PASSWORD = process.env.ONEMAP_PASSWORD;

// Token cache
let onemapToken = null;
let onemapTokenExpiry = null;

// Get or refresh OneMap authentication token
async function getOneMapToken() {
  // Return cached token if still valid (with 1 hour buffer)
  if (onemapToken && onemapTokenExpiry && Date.now() < onemapTokenExpiry - 3600000) {
    return onemapToken;
  }
  
  if (!ONEMAP_EMAIL || !ONEMAP_PASSWORD) {
    console.error('❌ OneMap credentials not configured');
    console.error('   Please set ONEMAP_EMAIL and ONEMAP_PASSWORD in your .env file');
    return null;
  }
  
  console.log('🔄 Fetching new OneMap token...');
  console.log('   Email:', ONEMAP_EMAIL.substring(0, 3) + '***');
  
  try {
    const response = await fetch('https://www.onemap.gov.sg/api/auth/post/getToken', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: ONEMAP_EMAIL,
        password: ONEMAP_PASSWORD
      })
    });
    
    // Get response body for debugging
    const responseText = await response.text();
    
    if (!response.ok) {
      console.error('❌ OneMap API Response:');
      console.error('   Status:', response.status, response.statusText);
      console.error('   Body:', responseText);
      throw new Error(`OneMap auth failed: ${response.status}`);
    }
    
    const data = JSON.parse(responseText);
    
    if (!data.access_token) {
      console.error('OneMap auth response:', data);
      throw new Error('No access token in response');
    }
    
    // Store token (expires in 3 days)
    onemapToken = data.access_token;
    onemapTokenExpiry = Date.now() + 259200000;
    
    console.log('✓ OneMap token obtained successfully');
    console.log(`  Expires: ${new Date(onemapTokenExpiry).toLocaleString()}`);
    
    return onemapToken;
    
  } catch (error) {
    console.error('❌ OneMap authentication error:', error.message);
    return null;
  }
}

// Test authentication on startup
(async function testOneMapAuth() {
  console.log('\n🔐 Testing OneMap API authentication...');
  const token = await getOneMapToken();
  if (token) {
    console.log('✓ OneMap API ready for location services\n');
  } else {
    console.error('⚠️  OneMap authentication failed');
    console.error('   "Use My Location" feature will not work');
    console.error('   Register at: https://www.onemap.gov.sg/apidocs/register\n');
  }
})();


// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Serve index.html as default without any redirects
app.use((req, res, next) => {
  if (req.url === '/') {
    return res.sendFile(path.join(__dirname, '../frontend/index.html'));
  }
  next();
});

const port = process.env.PORT || 3000;

// ========== AUTHENTICATION CONFIGURATION ==========

// Password utility functions
const passwordUtils = {
  async hashPassword(password) {
    const saltRounds = 12;
    return await bcrypt.hash(password, saltRounds);
  },

  async verifyPassword(password, hash) {
    return await bcrypt.compare(password, hash);
  }
};

// HELPER FUNCTION: Convert Singapore Postal Code to Coordinates (with auth)
async function getCoordinatesFromPostalCode(postalCode) {
  try {
    // Get authentication token
    const token = await getOneMapToken();
    
    const apiUrl = `https://www.onemap.gov.sg/api/common/elastic/search?searchVal=${postalCode}&returnGeom=Y&getAddrDetails=Y&pageNum=1`;
    
    const headers = {};
    if (token) {
      headers['Authorization'] = token;
    }
    
    const response = await fetch(apiUrl, { headers });
    const data = await response.json();
    
    if (data.found === 0 || !data.results || data.results.length === 0) {
      return null;
    }
    
    const result = data.results[0];
    
    return {
      latitude: parseFloat(result.LATITUDE),
      longitude: parseFloat(result.LONGITUDE),
      address: result.ADDRESS
    };
  } catch (error) {
    console.error('OneMap API error:', error);
    return null;
  }
}

// JWT secret (use environment variable in production)
const JWT_SECRET = process.env.JWT_SECRET || 'eduquery-secret-key';

// Generate JWT token
function generateToken(user) {
  return jwt.sign(
    {
      user_id: user.id,
      username: user.username,
      is_admin: user.is_admin
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

// Verify JWT token
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

// Authentication middleware for ADMIN API routes only
const requireAuth = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '') ||
    req.query.token;

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Authentication token required'
    });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }

  req.user = decoded;
  next();
};
// ========== ROOT & TEST ROUTES ==========

// Root Route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Database Test Routes
app.get('/pg-test', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ status: "Connected to PostgreSQL", time: result.rows[0] });
  } catch (err) {
    res.status(500).json({ status: "PostgreSQL Error", error: err.message });
  }
});

app.get('/mongo-test', async (req, res) => {
  try {
    const db = await connectMongo();
    const collections = await db.listCollections().toArray();
    res.json({ status: "Connected to MongoDB", collections: collections.map(c => c.name) });
  } catch (err) {
    res.status(500).json({ status: "MongoDB Error", error: err.message });
  }
});

// ========== CRUD OPERATIONS FOR SCHOOLS ==========

// READ - Get all schools or search by name
app.get('/api/schools', async (req, res) => {
  try {
    const { name } = req.query;
    let query, params;

    if (name && name.trim() !== '') {
      // Search by name
      query = `SELECT school_id, school_name, address, postal_code, zone_code, mainlevel_code, principal_name
               FROM Schools
               WHERE LOWER(school_name) LIKE LOWER($1)
               ORDER BY school_name ASC
               LIMIT 50`;
      params = [`%${name}%`];
    } else {
      // Get all schools 
      query = `SELECT school_id, school_name, address, postal_code, zone_code, mainlevel_code, principal_name
               FROM Schools
               ORDER BY school_name ASC`;
      params = [];
    }

    const result = await pool.query(query, params);

    // Log search activity to MongoDB
    if (name) {
      logActivity('search_schools', { query: name, results_count: result.rows.length });
    }

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE - Add new school
app.post('/api/schools', requireAuth, async (req, res) => {
  try {
    const {
      // Basic Information (Required)
      school_name, address, postal_code, zone_code, mainlevel_code, principal_name,
      
      // School Classification
      type_code, nature_code, session_code, dgp_code,
      
      // Contact Information
      email_address, telephone_no, telephone_no_2, fax_no, url_address,
      
      // School Leadership
      first_vp_name, second_vp_name, third_vp_name, fourth_vp_name, fifth_vp_name, sixth_vp_name,
      
      // Special Programmes
      autonomous_ind, gifted_ind, ip_ind, sap_ind,
      
      // Mother Tongue Languages
      mothertongue1_code, mothertongue2_code, mothertongue3_code,
      
      // Transportation
      mrt_desc, bus_desc
    } = req.body;

    // Validate required fields
    if (!school_name || !address || !postal_code || !zone_code || !mainlevel_code || !principal_name) {
      return res.status(400).json({ 
        success: false,
        error: 'Required fields: school_name, address, postal_code, zone_code, mainlevel_code, principal_name' 
      });
    }

    // Start a transaction
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // 1. Insert into Schools table
      const schoolResult = await client.query(
        `INSERT INTO Schools (school_name, address, postal_code, zone_code, mainlevel_code, principal_name)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING school_id, school_name`,
        [school_name, address, postal_code, zone_code, mainlevel_code, principal_name]
      );

      const newSchool = schoolResult.rows[0];
      const schoolId = newSchool.school_id;

      // 2. Insert into raw_general_info table (for additional fields)
      await client.query(
        `INSERT INTO raw_general_info (
          school_name, address, postal_code, zone_code, mainlevel_code, principal_name,
          type_code, nature_code, session_code, dgp_code,
          email_address, telephone_no, telephone_no_2, fax_no, url_address,
          first_vp_name, second_vp_name, third_vp_name, fourth_vp_name, fifth_vp_name, sixth_vp_name,
          autonomous_ind, gifted_ind, ip_ind, sap_ind,
          mothertongue1_code, mothertongue2_code, mothertongue3_code,
          mrt_desc, bus_desc
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30)
        ON CONFLICT (school_name) 
        DO UPDATE SET
          address = EXCLUDED.address,
          postal_code = EXCLUDED.postal_code,
          zone_code = EXCLUDED.zone_code,
          mainlevel_code = EXCLUDED.mainlevel_code,
          principal_name = EXCLUDED.principal_name,
          type_code = EXCLUDED.type_code,
          nature_code = EXCLUDED.nature_code,
          session_code = EXCLUDED.session_code,
          dgp_code = EXCLUDED.dgp_code,
          email_address = EXCLUDED.email_address,
          telephone_no = EXCLUDED.telephone_no,
          telephone_no_2 = EXCLUDED.telephone_no_2,
          fax_no = EXCLUDED.fax_no,
          url_address = EXCLUDED.url_address,
          first_vp_name = EXCLUDED.first_vp_name,
          second_vp_name = EXCLUDED.second_vp_name,
          third_vp_name = EXCLUDED.third_vp_name,
          fourth_vp_name = EXCLUDED.fourth_vp_name,
          fifth_vp_name = EXCLUDED.fifth_vp_name,
          sixth_vp_name = EXCLUDED.sixth_vp_name,
          autonomous_ind = EXCLUDED.autonomous_ind,
          gifted_ind = EXCLUDED.gifted_ind,
          ip_ind = EXCLUDED.ip_ind,
          sap_ind = EXCLUDED.sap_ind,
          mothertongue1_code = EXCLUDED.mothertongue1_code,
          mothertongue2_code = EXCLUDED.mothertongue2_code,
          mothertongue3_code = EXCLUDED.mothertongue3_code,
          mrt_desc = EXCLUDED.mrt_desc,
          bus_desc = EXCLUDED.bus_desc`,
        [
          school_name, address, postal_code, zone_code, mainlevel_code, principal_name,
          type_code, nature_code, session_code, dgp_code,
          email_address, telephone_no, telephone_no_2, fax_no, url_address,
          first_vp_name, second_vp_name, third_vp_name, fourth_vp_name, fifth_vp_name, sixth_vp_name,
          autonomous_ind, gifted_ind, ip_ind, sap_ind,
          mothertongue1_code, mothertongue2_code, mothertongue3_code,
          mrt_desc, bus_desc
        ]
      );

      await client.query('COMMIT');

      // Log activity to MongoDB
      logActivity('create_school', {
        admin_id: req.user.user_id,
        admin_username: req.user.username,
        school_id: schoolId,
        school_name: school_name
      });

      res.json({ 
        success: true, 
        data: newSchool,
        message: 'School created successfully'
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (err) {
    console.error('Create school error:', err);
    res.status(500).json({ 
      success: false,
      error: err.message || 'Failed to create school'
    });
  }
});

// UPDATE - Edit existing school
app.put('/api/schools/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      // Basic Information (Required)
      school_name, address, postal_code, zone_code, mainlevel_code, principal_name,
      
      // School Classification
      type_code, nature_code, session_code, dgp_code,
      
      // Contact Information
      email_address, telephone_no, telephone_no_2, fax_no, url_address,
      
      // School Leadership
      first_vp_name, second_vp_name, third_vp_name, fourth_vp_name, fifth_vp_name, sixth_vp_name,
      
      // Special Programmes
      autonomous_ind, gifted_ind, ip_ind, sap_ind,
      
      // Mother Tongue Languages
      mothertongue1_code, mothertongue2_code, mothertongue3_code,
      
      // Transportation
      mrt_desc, bus_desc
    } = req.body;

    // Validate required fields
    if (!school_name || !address || !postal_code || !zone_code || !mainlevel_code || !principal_name) {
      return res.status(400).json({ 
        success: false,
        error: 'Required fields: school_name, address, postal_code, zone_code, mainlevel_code, principal_name' 
      });
    }

    // Start a transaction
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // 1. Update Schools table
      const schoolResult = await client.query(
        `UPDATE Schools 
         SET school_name = $1, address = $2, postal_code = $3, 
             zone_code = $4, mainlevel_code = $5, principal_name = $6
         WHERE school_id = $7
         RETURNING *`,
        [school_name, address, postal_code, zone_code, mainlevel_code, principal_name, id]
      );

      if (schoolResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ 
          success: false,
          error: 'School not found' 
        });
      }

      // 2. Update raw_general_info table
      // First check if record exists
      const checkResult = await client.query(
        'SELECT school_name FROM raw_general_info WHERE LOWER(school_name) = LOWER($1)',
        [school_name]
      );

      if (checkResult.rows.length > 0) {
        // Update existing record
        await client.query(
          `UPDATE raw_general_info SET
            address = $1, postal_code = $2, zone_code = $3, mainlevel_code = $4, principal_name = $5,
            type_code = $6, nature_code = $7, session_code = $8, dgp_code = $9,
            email_address = $10, telephone_no = $11, telephone_no_2 = $12, fax_no = $13, url_address = $14,
            first_vp_name = $15, second_vp_name = $16, third_vp_name = $17, 
            fourth_vp_name = $18, fifth_vp_name = $19, sixth_vp_name = $20,
            autonomous_ind = $21, gifted_ind = $22, ip_ind = $23, sap_ind = $24,
            mothertongue1_code = $25, mothertongue2_code = $26, mothertongue3_code = $27,
            mrt_desc = $28, bus_desc = $29
          WHERE LOWER(school_name) = LOWER($30)`,
          [
            address, postal_code, zone_code, mainlevel_code, principal_name,
            type_code, nature_code, session_code, dgp_code,
            email_address, telephone_no, telephone_no_2, fax_no, url_address,
            first_vp_name, second_vp_name, third_vp_name, fourth_vp_name, fifth_vp_name, sixth_vp_name,
            autonomous_ind, gifted_ind, ip_ind, sap_ind,
            mothertongue1_code, mothertongue2_code, mothertongue3_code,
            mrt_desc, bus_desc,
            school_name
          ]
        );
      } else {
        // Insert new record
        await client.query(
          `INSERT INTO raw_general_info (
            school_name, address, postal_code, zone_code, mainlevel_code, principal_name,
            type_code, nature_code, session_code, dgp_code,
            email_address, telephone_no, telephone_no_2, fax_no, url_address,
            first_vp_name, second_vp_name, third_vp_name, fourth_vp_name, fifth_vp_name, sixth_vp_name,
            autonomous_ind, gifted_ind, ip_ind, sap_ind,
            mothertongue1_code, mothertongue2_code, mothertongue3_code,
            mrt_desc, bus_desc
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30)`,
          [
            school_name, address, postal_code, zone_code, mainlevel_code, principal_name,
            type_code, nature_code, session_code, dgp_code,
            email_address, telephone_no, telephone_no_2, fax_no, url_address,
            first_vp_name, second_vp_name, third_vp_name, fourth_vp_name, fifth_vp_name, sixth_vp_name,
            autonomous_ind, gifted_ind, ip_ind, sap_ind,
            mothertongue1_code, mothertongue2_code, mothertongue3_code,
            mrt_desc, bus_desc
          ]
        );
      }

      await client.query('COMMIT');

      // Log activity to MongoDB
      logActivity('update_school', {
        admin_id: req.user.user_id,
        admin_username: req.user.username,
        school_id: parseInt(id),
        school_name: school_name
      });

      res.json({ 
        success: true, 
        data: schoolResult.rows[0],
        message: 'School updated successfully'
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (err) {
    console.error('Update school error:', err);
    res.status(500).json({ 
      success: false,
      error: err.message || 'Failed to update school'
    });
  }
});

// DELETE - Remove school and all related data
app.delete('/api/schools/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // First, get school name for logging
    const schoolResult = await pool.query('SELECT school_name FROM Schools WHERE school_id = $1', [id]);
    const schoolName = schoolResult.rows[0]?.school_name || 'Unknown';

    // Delete related records (foreign key constraints)
    await pool.query('DELETE FROM School_Subjects WHERE school_id = $1', [id]);
    await pool.query('DELETE FROM School_CCAs WHERE school_id = $1', [id]);
    await pool.query('DELETE FROM School_Programmes WHERE school_id = $1', [id]);
    await pool.query('DELETE FROM School_Distinctives WHERE school_id = $1', [id]);

    // Delete the school
    const result = await pool.query(
      'DELETE FROM Schools WHERE school_id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'School not found' });
    }

    // Log activity to MongoDB
    logActivity('delete_school', {
      school_id: parseInt(id),
      school_name: schoolName
    });

    res.json({ success: true, message: 'School deleted successfully' });
  } catch (err) {
    console.error('Delete school error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get school subjects by ID
app.get('/api/schools/:id/subjects', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
            SELECT DISTINCT subj.subject_desc
            FROM school_subjects ss
            JOIN subjects subj ON ss.subject_id = subj.subject_id
            WHERE ss.school_id = $1
            AND subj.subject_desc IS NOT NULL
            AND TRIM(subj.subject_desc) != ''
            AND UPPER(subj.subject_desc) NOT IN ('NA', 'N/A', 'NIL', 'NONE', '-')
            ORDER BY subj.subject_desc
        `, [id]);

    res.json(result.rows);
  } catch (err) {
    console.error('Get school subjects error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get school CCAs by ID
app.get('/api/schools/:id/ccas', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
            SELECT 
                c.cca_grouping_desc,
                c.cca_generic_name,
                sc.cca_customized_name,
                sc.school_section
            FROM school_ccas sc
            JOIN ccas c ON sc.cca_id = c.cca_id
            WHERE sc.school_id = $1
            AND c.cca_grouping_desc IS NOT NULL
            AND TRIM(c.cca_grouping_desc) != ''
            ORDER BY c.cca_generic_name, c.cca_grouping_desc
        `, [id]);

    res.json(result.rows);
  } catch (err) {
    console.error('Get school CCAs error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get school programmes by ID
app.get('/api/schools/:id/programmes', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
            SELECT DISTINCT p.moe_programme_desc
            FROM school_programmes sp
            JOIN programmes p ON sp.programme_id = p.programme_id
            WHERE sp.school_id = $1
            AND p.moe_programme_desc IS NOT NULL
            AND TRIM(p.moe_programme_desc) != ''
            ORDER BY p.moe_programme_desc
        `, [id]);

    res.json(result.rows);
  } catch (err) {
    console.error('Get school programmes error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get school distinctive programmes by ID
app.get('/api/schools/:id/distinctives', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
            SELECT DISTINCT
                d.alp_domain,
                d.alp_title,
                d.llp_domain1,
                d.llp_title
            FROM school_distinctives sd
            JOIN distinctive_programmes d ON sd.distinctive_id = d.distinctive_id
            WHERE sd.school_id = $1
            ORDER BY d.alp_title, d.llp_title
        `, [id]);

    res.json(result.rows);
  } catch (err) {
    console.error('Get school distinctives error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ========== GET SCHOOL DETAILS BY ID ==========
app.get('/api/schools/:id/details', async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT 
        s.*,
        r.email_address,
        r.telephone_no,
        r.first_vp_name,
        r.second_vp_name,
        r.type_code,
        r.nature_code,
        r.session_code,
        r.autonomous_ind,
        r.gifted_ind,
        r.ip_ind,
        r.sap_ind,
        r.bus_desc,
        r.mrt_desc,
        COUNT(DISTINCT ss.subject_id) as subject_count,
        COUNT(DISTINCT sc.cca_id) as cca_count,
        COUNT(DISTINCT sp.programme_id) as programme_count,
        COUNT(DISTINCT sd.distinctive_id) as distinctive_count
      FROM Schools s
      LEFT JOIN raw_general_info r ON LOWER(s.school_name) = LOWER(r.school_name)
      LEFT JOIN School_Subjects ss ON s.school_id = ss.school_id
      LEFT JOIN School_CCAs sc ON s.school_id = sc.school_id
      LEFT JOIN School_Programmes sp ON s.school_id = sp.school_id
      LEFT JOIN School_Distinctives sd ON s.school_id = sd.school_id
      WHERE s.school_id = $1
      GROUP BY s.school_id, r.email_address, r.telephone_no, r.first_vp_name, 
               r.second_vp_name, r.type_code, r.nature_code, r.session_code,
               r.autonomous_ind, r.gifted_ind, r.ip_ind, r.sap_ind, 
               r.bus_desc, r.mrt_desc
    `;

    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'School not found'
      });
    }

    res.json({
      success: true,
      school: result.rows[0]
    });

  } catch (err) {
    console.error('School details error:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// REVERSE GEOCODING: Convert coordinates to postal code (with authentication)
async function getPostalCodeFromCoordinates(latitude, longitude) {
  try {
    const token = await getOneMapToken();
    
    if (!token) {
      console.error('Cannot perform reverse geocode: No OneMap token');
      return null;
    }
    
    console.log(`🔍 Reverse geocoding: ${latitude}, ${longitude}`);
    
    // Use OneMap's reverse geocode API (better for coordinates)
    const apiUrl = `https://www.onemap.gov.sg/api/public/revgeocode?location=${latitude},${longitude}&buffer=100&addressType=all`;
    
    const response = await fetch(apiUrl, {
      headers: { 'Authorization': token }
    });
    
    if (!response.ok) {
      console.error(`OneMap API error: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    console.log('   OneMap response:', data);
    
    // Check if we have geocode info
    if (!data.GeocodeInfo || data.GeocodeInfo.length === 0) {
      console.warn('   No geocode info returned');
      return null;
    }
    
    // Get the first result
    const geocode = data.GeocodeInfo[0];
    
    // Validate postal code
    if (!geocode.POSTALCODE || geocode.POSTALCODE.length !== 6) {
      console.warn('   No valid postal code in result');
      return null;
    }
    
    const result = {
      postalCode: geocode.POSTALCODE,
      address: geocode.BUILDING || geocode.ROAD || geocode.BLOCK || 'Singapore',
      buildingName: geocode.BUILDING || null
    };
    
    console.log(`✓ Found: ${result.postalCode} - ${result.address}`);
    
    return result;
    
  } catch (error) {
    console.error('Reverse geocode error:', error);
    return null;
  }
}

// API ENDPOINT: Reverse geocoding (coordinates → postal code)
app.get('/api/reverse-geocode', async (req, res) => {
  try {
    const { lat, lng } = req.query;
    
    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude required'
      });
    }
    
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    
    if (isNaN(latitude) || isNaN(longitude)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid coordinates'
      });
    }
    
    // Validate Singapore bounds
    if (latitude < 1.1 || latitude > 1.5 || longitude < 103.6 || longitude > 104.1) {
      return res.status(400).json({
        success: false,
        message: 'Coordinates outside Singapore'
      });
    }
    
    const result = await getPostalCodeFromCoordinates(latitude, longitude);
    
    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'No postal code found for coordinates'
      });
    }
    
    // Log activity
    if (typeof logActivity === 'function') {
      logActivity('reverse-geocode', { 
        latitude, 
        longitude, 
        postalCode: result.postalCode 
      });
    }
    
    res.json({
      success: true,
      data: result
    });
    
  } catch (error) {
    console.error('Reverse geocode API error:', error);
    res.status(500).json({
      success: false,
      message: 'Geocoding service failed'
    });
  }
});

// ========== SEARCH BY POSTAL CODE DISTANCE (Using OneMap API) ==========
app.post('/api/schools/search-by-postal-code', async (req, res) => {
  try {
    const { postal_code, radius_km } = req.body;

    console.log('Postal code search request:', { postal_code, radius_km });

    if (!postal_code || !radius_km) {
      return res.status(400).json({
        success: false,
        message: 'Postal code and radius are required'
      });
    }

    // Validate postal code format (Singapore postal codes are 6 digits)
    if (!/^\d{6}$/.test(postal_code)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid postal code format. Singapore postal codes must be 6 digits.'
      });
    }

    // Get coordinates for the search postal code using OneMap API
    console.log('Fetching coordinates from OneMap API...');
    const searchLocation = await getCoordinatesFromPostalCode(postal_code);

    if (!searchLocation) {
      return res.status(404).json({
        success: false,
        message: `Postal code ${postal_code} not found. Please verify the postal code is correct.`
      });
    }

    const { latitude: searchLat, longitude: searchLon } = searchLocation;
    console.log('Search center coordinates:', { searchLat, searchLon });

    // Get all schools with their postal codes
    const schoolsQuery = `
      SELECT 
        s.school_id,
        s.school_name,
        s.address,
        s.postal_code,
        s.zone_code,
        s.mainlevel_code,
        s.principal_name,
        r.email_address,
        r.telephone_no,
        r.type_code,
        r.nature_code
      FROM Schools s
      LEFT JOIN raw_general_info r ON LOWER(TRIM(s.school_name)) = LOWER(TRIM(r.school_name))
      WHERE s.postal_code IS NOT NULL 
        AND s.postal_code != ''
        AND s.postal_code ~ '^[0-9]{6}$'
      ORDER BY s.school_name
    `;

    const schoolsResult = await pool.query(schoolsQuery);
    console.log(`Found ${schoolsResult.rows.length} schools with valid postal codes`);

    // Calculate distances for each school
    const schoolsWithDistance = [];
    let coordinateFetchCount = 0;
    const maxConcurrentRequests = 5; // Limit concurrent API calls

    // Process schools in batches to avoid rate limiting
    for (let i = 0; i < schoolsResult.rows.length; i += maxConcurrentRequests) {
      const batch = schoolsResult.rows.slice(i, i + maxConcurrentRequests);

      const batchResults = await Promise.all(
        batch.map(async (school) => {
          try {
            const schoolCoords = await getCoordinatesFromPostalCode(school.postal_code);

            if (!schoolCoords) {
              return null;
            }

            coordinateFetchCount++;

            // Calculate distance using Haversine formula
            const R = 6371; // Earth's radius in km
            const dLat = (schoolCoords.latitude - searchLat) * Math.PI / 180;
            const dLon = (schoolCoords.longitude - searchLon) * Math.PI / 180;

            const a =
              Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(searchLat * Math.PI / 180) * Math.cos(schoolCoords.latitude * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);

            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            const distance = R * c;

            if (distance <= radius_km) {
              return {
                ...school,
                distance_km: Math.round(distance * 100) / 100
              };
            }

            return null;
          } catch (error) {
            console.error(`Error processing school ${school.school_name}:`, error);
            return null;
          }
        })
      );

      // Add non-null results to the array
      schoolsWithDistance.push(...batchResults.filter(r => r !== null));

      // Add a small delay between batches to be nice to the API
      if (i + maxConcurrentRequests < schoolsResult.rows.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Sort by distance
    schoolsWithDistance.sort((a, b) => a.distance_km - b.distance_km);

    console.log(`Found ${schoolsWithDistance.length} schools within ${radius_km}km`);
    console.log(`Fetched coordinates for ${coordinateFetchCount} schools`);

    logActivity('search_by_postal_code', {
      postal_code,
      radius_km,
      results_count: schoolsWithDistance.length,
      schools_processed: schoolsResult.rows.length,
      coordinates_fetched: coordinateFetchCount
    });

    res.json({
      success: true,
      results: schoolsWithDistance,
      search_params: {
        postal_code,
        radius_km,
        center_latitude: searchLat,
        center_longitude: searchLon,
        center_address: searchLocation.address
      },
      metadata: {
        schools_processed: schoolsResult.rows.length,
        coordinates_fetched: coordinateFetchCount,
        note: 'Coordinates fetched from Singapore OneMap API'
      }
    });

  } catch (err) {
    console.error('Postal code distance search error:', err);
    res.status(500).json({
      success: false,
      error: err.message,
      hint: 'Please try again or contact support if the problem persists'
    });
  }
});

// ========== POSTAL CODE LOOKUP ENDPOINT ==========
app.get('/api/postal-code/:postalCode', async (req, res) => {
  try {
    const { postalCode } = req.params;

    console.log('Looking up postal code:', postalCode);

    if (!/^\d{6}$/.test(postalCode)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid postal code format. Singapore postal codes must be 6 digits.'
      });
    }

    const coordinates = await getCoordinatesFromPostalCode(postalCode);

    if (!coordinates) {
      return res.status(404).json({
        success: false,
        message: 'Postal code not found or coordinates not available'
      });
    }

    res.json({
      success: true,
      postal_code: postalCode,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      address: coordinates.address
    });

  } catch (err) {
    console.error('Postal code lookup error:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// ========== READ-ONLY QUERY ROUTES ==========

// School subjects
// ========== FIX SPECIFIC SEARCH ENDPOINTS ==========

// School subjects - SEARCH BY SUBJECT, NOT SCHOOL
app.get('/api/schools/subjects', async (req, res) => {
  try {
    const { name } = req.query;

    if (!name || name.trim() === '') {
      return res.json([]);
    }

    const result = await pool.query(
      `SELECT DISTINCT
        s.school_id,
        s.school_name,
        s.zone_code,
        s.mainlevel_code,
        subj.subject_desc
       FROM Schools s
       JOIN School_Subjects ss ON s.school_id = ss.school_id
       JOIN Subjects subj ON subj.subject_id = ss.subject_id
       WHERE LOWER(subj.subject_desc) LIKE LOWER($1)
         AND subj.subject_desc IS NOT NULL
         AND TRIM(subj.subject_desc) != ''
         AND UPPER(subj.subject_desc) NOT IN ('NA', 'N/A', 'NIL', 'NONE', '-')
       ORDER BY s.school_name, subj.subject_desc
       LIMIT 100`,
      [`%${name}%`]
    );

    logActivity('search_subjects', { query: name, results_count: result.rows.length });

    res.json(result.rows);
  } catch (err) {
    console.error('Subject search error:', err);
    res.status(500).json({ error: err.message });
  }
});

// School CCAs - SEARCH BY CCA, NOT SCHOOL
app.get('/api/schools/ccas', async (req, res) => {
  try {
    const { name } = req.query;

    if (!name || name.trim() === '') {
      return res.json([]);
    }

    const result = await pool.query(
      `SELECT DISTINCT
        s.school_id,
        s.school_name,
        s.zone_code,
        s.mainlevel_code,
        c.cca_grouping_desc as cca_name,
        c.cca_generic_name as cca_category
       FROM Schools s
       JOIN School_CCAs sca ON s.school_id = sca.school_id
       JOIN CCAs c ON c.cca_id = sca.cca_id
       WHERE (
         LOWER(c.cca_grouping_desc) LIKE LOWER($1) OR
         LOWER(c.cca_generic_name) LIKE LOWER($1) OR
         LOWER(sca.cca_customized_name) LIKE LOWER($1)
       )
       AND c.cca_grouping_desc IS NOT NULL
       AND TRIM(c.cca_grouping_desc) != ''
       AND UPPER(c.cca_grouping_desc) NOT IN ('NA', 'N/A', 'NIL', 'NONE', '-')
       ORDER BY s.school_name, c.cca_grouping_desc
       LIMIT 100`,
      [`%${name}%`]
    );

    logActivity('search_ccas', { query: name, results_count: result.rows.length });

    res.json(result.rows);
  } catch (err) {
    console.error('CCA search error:', err);
    res.status(500).json({ error: err.message });
  }
});

// School Programmes - SEARCH BY PROGRAMME, NOT SCHOOL
app.get('/api/schools/programmes', async (req, res) => {
  try {
    const { name } = req.query;

    if (!name || name.trim() === '') {
      return res.json([]);
    }

    const result = await pool.query(
      `SELECT DISTINCT
        s.school_id,
        s.school_name,
        s.zone_code,
        s.mainlevel_code,
        p.moe_programme_desc
       FROM Schools s
       JOIN School_Programmes sp ON s.school_id = sp.school_id
       JOIN Programmes p ON p.programme_id = sp.programme_id
       WHERE LOWER(p.moe_programme_desc) LIKE LOWER($1)
         AND p.moe_programme_desc IS NOT NULL
         AND TRIM(p.moe_programme_desc) != ''
         AND UPPER(p.moe_programme_desc) NOT IN ('NA', 'N/A', 'NIL', 'NONE', '-')
       ORDER BY s.school_name, p.moe_programme_desc
       LIMIT 100`,
      [`%${name}%`]
    );

    logActivity('search_programmes', { query: name, results_count: result.rows.length });

    res.json(result.rows);
  } catch (err) {
    console.error('Programme search error:', err);
    res.status(500).json({ error: err.message });
  }
});

// School Distinctives - SEARCH BY DISTINCTIVE, NOT SCHOOL (FIX THIS!)
app.get('/api/schools/distinctives', async (req, res) => {
  try {
    const { name } = req.query;

    if (!name || name.trim() === '') {
      return res.json([]);
    }

    const result = await pool.query(
      `SELECT DISTINCT
        s.school_id,
        s.school_name,
        s.zone_code,
        s.mainlevel_code,
        COALESCE(d.alp_title, d.llp_title) as distinctive_name,
        d.alp_domain,
        d.llp_domain1
       FROM Schools s
       JOIN School_Distinctives sd ON s.school_id = sd.school_id
       JOIN Distinctive_Programmes d ON d.distinctive_id = sd.distinctive_id
       WHERE (
         LOWER(d.alp_domain) LIKE LOWER($1) OR
         LOWER(d.alp_title) LIKE LOWER($1) OR
         LOWER(d.llp_domain1) LIKE LOWER($1) OR
         LOWER(d.llp_title) LIKE LOWER($1)
       )
       AND (
         (d.alp_domain IS NOT NULL AND TRIM(d.alp_domain) != '' AND UPPER(d.alp_domain) NOT IN ('NA', 'N/A', 'NIL', 'NONE', '-')) OR
         (d.alp_title IS NOT NULL AND TRIM(d.alp_title) != '' AND UPPER(d.alp_title) NOT IN ('NA', 'N/A', 'NIL', 'NONE', '-')) OR
         (d.llp_domain1 IS NOT NULL AND TRIM(d.llp_domain1) != '' AND UPPER(d.llp_domain1) NOT IN ('NA', 'N/A', 'NIL', 'NONE', '-')) OR
         (d.llp_title IS NOT NULL AND TRIM(d.llp_title) != '' AND UPPER(d.llp_title) NOT IN ('NA', 'N/A', 'NIL', 'NONE', '-'))
       )
       ORDER BY s.school_name
       LIMIT 100`,
      [`%${name}%`]
    );

    logActivity('search_distinctives', { query: name, results_count: result.rows.length });

    res.json(result.rows);
  } catch (err) {
    console.error('Distinctive search error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ========== ANALYTICS ENDPOINTS ==========

// 1. Schools by Zone with Statistics
app.get('/api/analytics/schools-by-zone', async (req, res) => {
  try {
    const query = `
      SELECT 
        zone_code,
        COUNT(*) as total_schools,
        COUNT(DISTINCT mainlevel_code) as school_types,
        ROUND(AVG(LENGTH(address))::numeric, 2) as avg_address_length
      FROM Schools
      GROUP BY zone_code
      ORDER BY total_schools DESC
    `;

    const result = await pool.query(query);

    logActivity('view_zone_statistics', {
      zones_analyzed: result.rows.length
    });

    res.json({
      success: true,
      data: result.rows
    });
  } catch (err) {
    console.error('Zone statistics error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 2. Schools with Subject Count
app.get('/api/analytics/schools-subject-count', async (req, res) => {
  try {
    const query = `
      SELECT 
        s.school_id,
        s.school_name,
        s.zone_code,
        s.mainlevel_code,
        COUNT(ss.subject_id) as subject_count,
        CASE 
          WHEN COUNT(ss.subject_id) > 10 THEN 'High'
          WHEN COUNT(ss.subject_id) > 5 THEN 'Medium'
          ELSE 'Low'
        END as subject_diversity
      FROM Schools s
      LEFT JOIN School_Subjects ss ON s.school_id = ss.school_id
      GROUP BY s.school_id, s.school_name, s.zone_code, s.mainlevel_code
      HAVING COUNT(ss.subject_id) > 0
      ORDER BY subject_count DESC
      LIMIT 20
    `;

    const result = await pool.query(query);

    logActivity('view_subject_diversity', {
      schools_analyzed: result.rows.length
    });

    res.json({
      success: true,
      data: result.rows,
      summary: {
        total_schools: result.rows.length,
        avg_subjects: result.rows.length > 0
          ? (result.rows.reduce((sum, row) => sum + parseInt(row.subject_count), 0) / result.rows.length).toFixed(2)
          : 0
      }
    });
  } catch (err) {
    console.error('Subject count error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 3. Schools Offering More Subjects Than Average
app.get('/api/analytics/above-average-subjects', async (req, res) => {
  try {
    const query = `
      WITH subject_counts AS (
        SELECT 
          s.school_id,
          s.school_name,
          s.zone_code,
          COUNT(ss.subject_id) as subject_count
        FROM Schools s
        LEFT JOIN School_Subjects ss ON s.school_id = ss.school_id
        GROUP BY s.school_id, s.school_name, s.zone_code
      ),
      avg_subjects AS (
        SELECT AVG(subject_count) as avg_count
        FROM subject_counts
        WHERE subject_count > 0
      )
      SELECT 
        sc.school_name,
        sc.zone_code,
        sc.subject_count,
        ROUND(a.avg_count::numeric, 2) as system_average,
        ROUND((sc.subject_count - a.avg_count)::numeric, 2) as difference
      FROM subject_counts sc, avg_subjects a
      WHERE sc.subject_count > a.avg_count
      ORDER BY sc.subject_count DESC
    `;

    const result = await pool.query(query);

    logActivity('view_above_average_schools', {
      schools_found: result.rows.length
    });

    res.json({
      success: true,
      data: result.rows,
      message: `Found ${result.rows.length} schools with above-average subject offerings`
    });
  } catch (err) {
    console.error('Above average query error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 4. CCA Participation Analysis
app.get('/api/analytics/cca-participation', async (req, res) => {
  try {
    const query = `
      SELECT 
        c.cca_generic_name,
        COUNT(DISTINCT sc.school_id) as school_count,
        COUNT(sc.cca_id) as total_offerings,
        STRING_AGG(DISTINCT s.zone_code, ', ') as zones_offered,
        ROUND(COUNT(DISTINCT sc.school_id) * 100.0 / 
          (SELECT COUNT(DISTINCT school_id) FROM Schools), 2) as percentage_of_schools
      FROM CCAs c
      JOIN School_CCAs sc ON c.cca_id = sc.cca_id
      JOIN Schools s ON sc.school_id = s.school_id
      GROUP BY c.cca_id, c.cca_generic_name
      HAVING COUNT(DISTINCT sc.school_id) >= 3
      ORDER BY school_count DESC
      LIMIT 15
    `;

    const result = await pool.query(query);

    logActivity('view_cca_participation', {
      ccas_analyzed: result.rows.length
    });

    res.json({
      success: true,
      data: result.rows
    });
  } catch (err) {
    console.error('CCA participation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 5. Data Completeness
app.get('/api/analytics/data-completeness', async (req, res) => {
  try {
    const query = `
      SELECT 
        s.school_id,
        s.school_name,
        s.zone_code,
        s.mainlevel_code,
        COUNT(DISTINCT ss.subject_id) as subject_count,
        COUNT(DISTINCT sc.cca_id) as cca_count,
        COUNT(DISTINCT sp.programme_id) as programme_count,
        COUNT(DISTINCT sd.distinctive_id) as distinctive_count,
        (
          CASE WHEN COUNT(DISTINCT ss.subject_id) > 0 THEN 25 ELSE 0 END +
          CASE WHEN COUNT(DISTINCT sc.cca_id) > 0 THEN 25 ELSE 0 END +
          CASE WHEN COUNT(DISTINCT sp.programme_id) > 0 THEN 25 ELSE 0 END +
          CASE WHEN COUNT(DISTINCT sd.distinctive_id) > 0 THEN 25 ELSE 0 END
        ) as completeness_score,
        CASE 
          WHEN (
            CASE WHEN COUNT(DISTINCT ss.subject_id) > 0 THEN 25 ELSE 0 END +
            CASE WHEN COUNT(DISTINCT sc.cca_id) > 0 THEN 25 ELSE 0 END +
            CASE WHEN COUNT(DISTINCT sp.programme_id) > 0 THEN 25 ELSE 0 END +
            CASE WHEN COUNT(DISTINCT sd.distinctive_id) > 0 THEN 25 ELSE 0 END
          ) = 100 THEN 'Complete'
          WHEN (
            CASE WHEN COUNT(DISTINCT ss.subject_id) > 0 THEN 25 ELSE 0 END +
            CASE WHEN COUNT(DISTINCT sc.cca_id) > 0 THEN 25 ELSE 0 END +
            CASE WHEN COUNT(DISTINCT sp.programme_id) > 0 THEN 25 ELSE 0 END +
            CASE WHEN COUNT(DISTINCT sd.distinctive_id) > 0 THEN 25 ELSE 0 END
          ) >= 75 THEN 'Good'
          WHEN (
            CASE WHEN COUNT(DISTINCT ss.subject_id) > 0 THEN 25 ELSE 0 END +
            CASE WHEN COUNT(DISTINCT sc.cca_id) > 0 THEN 25 ELSE 0 END +
            CASE WHEN COUNT(DISTINCT sp.programme_id) > 0 THEN 25 ELSE 0 END +
            CASE WHEN COUNT(DISTINCT sd.distinctive_id) > 0 THEN 25 ELSE 0 END
          ) >= 50 THEN 'Fair'
          ELSE 'Incomplete'
        END as completeness_status
      FROM Schools s
      LEFT JOIN School_Subjects ss ON s.school_id = ss.school_id
      LEFT JOIN School_CCAs sc ON s.school_id = sc.school_id
      LEFT JOIN School_Programmes sp ON s.school_id = sp.school_id
      LEFT JOIN School_Distinctives sd ON s.school_id = sd.school_id
      GROUP BY s.school_id, s.school_name, s.zone_code, s.mainlevel_code
      ORDER BY completeness_score DESC, subject_count DESC
      LIMIT 50
    `;

    const result = await pool.query(query);

    const summary = {
      total_analyzed: result.rows.length,
      complete_schools: result.rows.filter(r => r.completeness_status === 'Complete').length,
      good_schools: result.rows.filter(r => r.completeness_status === 'Good').length,
      fair_schools: result.rows.filter(r => r.completeness_status === 'Fair').length,
      incomplete_schools: result.rows.filter(r => r.completeness_status === 'Incomplete').length
    };

    logActivity('view_data_completeness', summary);

    res.json({
      success: true,
      data: result.rows,
      summary: summary
    });
  } catch (err) {
    console.error('Data completeness error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 6. Zone Comparison Analysis
app.get('/api/analytics/zone-comparison', async (req, res) => {
  try {
    const query = `
      SELECT 
        s.zone_code,
        COUNT(DISTINCT s.school_id) as total_schools,
        COUNT(DISTINCT s.mainlevel_code) as school_types,
        COUNT(DISTINCT ss.subject_id) as unique_subjects,
        COUNT(DISTINCT sc.cca_id) as unique_ccas,
        COUNT(DISTINCT sp.programme_id) as unique_programmes,
        ROUND(AVG(subj_count.cnt)::numeric, 2) as avg_subjects_per_school,
        ROUND(AVG(cca_count.cnt)::numeric, 2) as avg_ccas_per_school,
        MAX(subj_count.cnt) as max_subjects,
        MIN(CASE WHEN subj_count.cnt > 0 THEN subj_count.cnt END) as min_subjects
      FROM Schools s
      LEFT JOIN School_Subjects ss ON s.school_id = ss.school_id
      LEFT JOIN School_CCAs sc ON s.school_id = sc.school_id
      LEFT JOIN School_Programmes sp ON s.school_id = sp.school_id
      LEFT JOIN (
        SELECT school_id, COUNT(*) as cnt
        FROM School_Subjects
        GROUP BY school_id
      ) subj_count ON s.school_id = subj_count.school_id
      LEFT JOIN (
        SELECT school_id, COUNT(*) as cnt
        FROM School_CCAs
        GROUP BY school_id
      ) cca_count ON s.school_id = cca_count.school_id
      GROUP BY s.zone_code
      ORDER BY total_schools DESC
    `;

    const result = await pool.query(query);

    logActivity('view_zone_comparison', {
      zones: result.rows.length
    });

    res.json({
      success: true,
      data: result.rows
    });
  } catch (err) {
    console.error('Zone comparison error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Universal Search - search across all tables
app.get('/api/search/universal', async (req, res) => {
  try {
    const { query } = req.query;

    if (!query || query.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Search query is required'
      });
    }

    const searchTerm = `%${query.trim()}%`;

    // --- Schools ---
    const schoolsQuery = `
      SELECT 
        'school' AS type,
        s.school_id AS id,
        s.school_name AS name,
        s.address AS description,
        s.zone_code,
        s.mainlevel_code,
        s.principal_name,
        s.school_id
      FROM schools s
      WHERE s.school_name ILIKE $1
         OR s.address ILIKE $1
         OR s.principal_name ILIKE $1
      ORDER BY s.school_name;
    `;

    // --- Subjects ---
    const subjectsQuery = `
      SELECT 
        'subject' AS type,
        s.school_id,
        s.school_name AS name,
        subj.subject_desc AS description,
        s.zone_code,
        s.mainlevel_code
      FROM subjects subj
        JOIN school_subjects ss ON subj.subject_id = ss.subject_id
        JOIN schools s ON ss.school_id = s.school_id
      WHERE subj.subject_desc ILIKE $1
        AND subj.subject_desc IS NOT NULL
        AND TRIM(subj.subject_desc) != ''
        AND UPPER(subj.subject_desc) NOT IN ('NA', 'N/A', 'NIL', 'NONE', '-')
      ORDER BY s.school_name;
    `;

    // --- CCAs ---
    const ccasQuery = `
      SELECT 
        'cca' AS type,
        sch.school_id,
        sch.school_name AS name,
        c.cca_grouping_desc AS description,
        c.cca_generic_name AS cca_category,
        sch.zone_code,
        sch.mainlevel_code
      FROM CCAs c
      JOIN School_CCAs sc ON c.cca_id = sc.cca_id
      JOIN Schools sch ON sc.school_id = sch.school_id
      WHERE 
        c.cca_grouping_desc ILIKE $1
        OR c.cca_generic_name ILIKE $1
        OR sc.cca_customized_name ILIKE $1
      ORDER BY sch.school_name
    `;

    // --- Programmes ---
    const programmesQuery = `
      SELECT 
        'programme' AS type,
        sch.school_id,
        sch.school_name AS name,
        p.moe_programme_desc AS description,
        sch.zone_code,
        sch.mainlevel_code
      FROM programmes p
      JOIN school_programmes sp ON p.programme_id = sp.programme_id
      JOIN schools sch ON sp.school_id = sch.school_id
      WHERE p.moe_programme_desc ILIKE $1
        AND p.moe_programme_desc IS NOT NULL
        AND TRIM(p.moe_programme_desc) != ''
        AND UPPER(p.moe_programme_desc) NOT IN ('NA', 'N/A', 'NIL', 'NONE', '-')
      ORDER BY sch.school_name;
    `;

    // --- Distinctive Programmes (ALP / LLP) ---
    const distinctivesQuery = `
      SELECT 
        'distinctive' AS type,
        sch.school_id,
        sch.school_name AS name,
        COALESCE(d.alp_title, d.llp_title, 'Distinctive Programme') AS description,
        sch.zone_code,
        sch.mainlevel_code
      FROM distinctive_programmes d
      JOIN school_distinctives sd ON d.distinctive_id = sd.distinctive_id
      JOIN schools sch ON sd.school_id = sch.school_id
      WHERE 
        COALESCE(d.alp_title, '') ILIKE $1 OR
        COALESCE(d.llp_title, '') ILIKE $1 OR
        COALESCE(d.alp_domain, '') ILIKE $1 OR
        COALESCE(d.llp_domain1, '') ILIKE $1
      ORDER BY sch.school_name;
    `;

    // --- Execute all in parallel ---
    const [schools, subjects, ccas, programmes, distinctives] = await Promise.all([
      pool.query(schoolsQuery, [searchTerm]),
      pool.query(subjectsQuery, [searchTerm]),
      pool.query(ccasQuery, [searchTerm]),
      pool.query(programmesQuery, [searchTerm]),
      pool.query(distinctivesQuery, [searchTerm])
    ]);

    // --- Combine results ---
    const results = {
      schools: schools.rows,
      subjects: subjects.rows,
      ccas: ccas.rows,
      programmes: programmes.rows,
      distinctives: distinctives.rows,
      total:
        schools.rows.length +
        subjects.rows.length +
        ccas.rows.length +
        programmes.rows.length +
        distinctives.rows.length
    };

    // --- Optional MongoDB logging ---
    if (typeof logActivity === 'function') {
      logActivity('universal_search', {
        query,
        total_results: results.total,
        breakdown: {
          schools: results.schools.length,
          subjects: results.subjects.length,
          ccas: results.ccas.length,
          programmes: results.programmes.length,
          distinctives: results.distinctives.length
        }
      });
    }

    return res.json({
      success: true,
      query,
      results
    });
  } catch (err) {
    console.error('Universal search error:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Middleware to check if user is admin (requires requireAuth first)
const requireAdmin = (req, res, next) => {
  if (!req.user || !req.user.is_admin) {
    return res.status(403).json({
      success: false,
      message: 'Admin privileges required'
    });
  }
  next();
};
// ========== SCHOOL COMPARISON ENDPOINT ==========
// Add this to server.js after the /api/search/details/:type/:id endpoint
app.post('/api/schools/compare', async (req, res) => {
  try {
    const { school1_id, school2_id } = req.body;

    if (!school1_id || !school2_id) {
      return res.status(400).json({
        success: false,
        message: 'Both school IDs are required'
      });
    }

    // Fetch comprehensive data for both schools
    const schoolQuery = `
      SELECT 
        s.*,
        r.email_address,
        r.telephone_no,
        r.first_vp_name,
        r.second_vp_name,
        r.type_code,
        r.nature_code,
        r.session_code,
        r.autonomous_ind,
        r.gifted_ind,
        r.ip_ind,
        r.sap_ind,
        r.bus_desc,
        r.mrt_desc,
        COUNT(DISTINCT ss.subject_id) as subject_count,
        COUNT(DISTINCT sc.cca_id) as cca_count,
        COUNT(DISTINCT sp.programme_id) as programme_count,
        COUNT(DISTINCT sd.distinctive_id) as distinctive_count
      FROM Schools s
      LEFT JOIN raw_general_info r ON LOWER(s.school_name) = LOWER(r.school_name)
      LEFT JOIN School_Subjects ss ON s.school_id = ss.school_id
      LEFT JOIN School_CCAs sc ON s.school_id = sc.school_id
      LEFT JOIN School_Programmes sp ON s.school_id = sp.school_id
      LEFT JOIN School_Distinctives sd ON s.school_id = sd.school_id
      WHERE s.school_id = $1
      GROUP BY s.school_id, r.email_address, r.telephone_no, r.first_vp_name, 
               r.second_vp_name, r.type_code, r.nature_code, r.session_code,
               r.autonomous_ind, r.gifted_ind, r.ip_ind, r.sap_ind, 
               r.bus_desc, r.mrt_desc
    `;

    const subjectsQuery = `
      SELECT DISTINCT subj.subject_desc
      FROM school_subjects ss
      JOIN subjects subj ON ss.subject_id = subj.subject_id
      WHERE ss.school_id = $1
      AND subj.subject_desc IS NOT NULL
      AND TRIM(subj.subject_desc) != ''
      ORDER BY subj.subject_desc
    `;

    const ccasQuery = `
      SELECT 
        c.cca_grouping_desc,
        c.cca_generic_name,
        sc.cca_customized_name
      FROM school_ccas sc
      JOIN ccas c ON sc.cca_id = c.cca_id
      WHERE sc.school_id = $1
      AND c.cca_grouping_desc IS NOT NULL
      ORDER BY c.cca_generic_name, c.cca_grouping_desc
    `;

    const programmesQuery = `
      SELECT DISTINCT p.moe_programme_desc
      FROM school_programmes sp
      JOIN programmes p ON sp.programme_id = p.programme_id
      WHERE sp.school_id = $1
      AND p.moe_programme_desc IS NOT NULL
      ORDER BY p.moe_programme_desc
    `;

    const distinctivesQuery = `
      SELECT DISTINCT
        d.alp_domain,
        d.alp_title,
        d.llp_domain1,
        d.llp_title
      FROM school_distinctives sd
      JOIN distinctive_programmes d ON sd.distinctive_id = d.distinctive_id
      WHERE sd.school_id = $1
    `;

    // Fetch all data in parallel
    const [
      school1Result,
      school2Result,
      subjects1,
      subjects2,
      ccas1,
      ccas2,
      programmes1,
      programmes2,
      distinctives1,
      distinctives2
    ] = await Promise.all([
      pool.query(schoolQuery, [school1_id]),
      pool.query(schoolQuery, [school2_id]),
      pool.query(subjectsQuery, [school1_id]),
      pool.query(subjectsQuery, [school2_id]),
      pool.query(ccasQuery, [school1_id]),
      pool.query(ccasQuery, [school2_id]),
      pool.query(programmesQuery, [school1_id]),
      pool.query(programmesQuery, [school2_id]),
      pool.query(distinctivesQuery, [school1_id]),
      pool.query(distinctivesQuery, [school2_id])
    ]);

    if (school1Result.rows.length === 0 || school2Result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'One or both schools not found'
      });
    }

    // Log activity
    logActivity('school_comparison', {
      school1_id,
      school2_id,
      school1_name: school1Result.rows[0].school_name,
      school2_name: school2Result.rows[0].school_name
    });

    res.json({
      success: true,
      school1: {
        ...school1Result.rows[0],
        subjects: subjects1.rows.map(r => r.subject_desc),
        ccas: ccas1.rows,
        programmes: programmes1.rows.map(r => r.moe_programme_desc),
        distinctives: distinctives1.rows
      },
      school2: {
        ...school2Result.rows[0],
        subjects: subjects2.rows.map(r => r.subject_desc),
        ccas: ccas2.rows,
        programmes: programmes2.rows.map(r => r.moe_programme_desc),
        distinctives: distinctives2.rows
      }
    });

  } catch (err) {
    console.error('School comparison error:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// ========== MONGODB ACTIVITY LOGGER ==========
async function logActivity(action, data) {
  try {
    const db = await connectMongo();
    await db.collection('activity_logs').insertOne({
      timestamp: new Date(),
      action: action,
      data: data
    });
  } catch (err) {
    console.error('Failed to log activity:', err);
    // Don't throw error - logging shouldn't break the main functionality
  }
}

// ========== ROUTES ==========

// Login route (optional for admin access)
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html')); // Changed to index.html
});

// ========== PUBLIC DASHBOARD ROUTES ==========

// Main dashboard route - PUBLICLY ACCESSIBLE (now serves index.html)
app.get('/index.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Dashboard route alias - PUBLICLY ACCESSIBLE (now serves index.html)
app.get('/dashboard.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Keep home.html for backward compatibility but serve index.html
app.get('/home.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ========== LOGIN PAGE ROUTES ==========

// Serve login page
app.get('/login.html', (req, res) => {
  console.log('Serving login page');
  res.sendFile(path.join(__dirname, '../frontend/login.html'));
});

// Serve login page assets (CSS, JS)
app.get('/login.js', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/login.js'));
});

app.get('/style.css', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/style.css'));
});

// Login authentication route
app.post('/login', async (req, res) => {
  try {
    console.log('Login request received:', {
      username: req.body.username,
      timestamp: new Date().toISOString()
    });

    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required'
      });
    }

    console.log('Login attempt for username:', username);

    // Query the database for the user
    const result = await pool.query(
      `SELECT id, username, password, is_admin
             FROM Users 
             WHERE username = $1`,
      [username]
    );

    if (result.rows.length === 0) {
      console.log('User not found:', username);
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password'
      });
    }

    const user = result.rows[0];

    // Verify password using bcrypt
    const isPasswordValid = await passwordUtils.verifyPassword(password, user.password);

    if (!isPasswordValid) {
      console.log('Invalid password for user:', username);
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password'
      });
    }

    // Login successful - generate JWT token
    const userData = {
      user_id: user.id,
      username: user.username,
      is_admin: user.is_admin
    };

    const token = generateToken(userData);

    console.log('✅ Login successful for user:', username, 'Admin:', user.is_admin);

    // Log the login activity
    logActivity('user_login', {
      user_id: user.id,
      username: user.username,
      is_admin: user.is_admin
    });

    // Return success response
    res.json({
      success: true,
      message: 'Login successful',
      user: userData,
      token: token,
      redirectUrl: '/index.html' // Redirect back to main app
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during authentication'
    });
  }
});

// Check authentication status (for client-side verification)
app.get('/api/auth/status', requireAuth, (req, res) => {
  res.json({
    authenticated: true,
    user: {
      id: req.user.id,
      username: req.user.username,
      is_admin: req.user.is_admin
    }
  });
});

// Logout route
app.post('/api/auth/logout', requireAuth, (req, res) => {
  console.log('Logout request for user:', req.user.username);

  // In a stateless JWT system, we can't invalidate the token on server side
  // Client should remove the token from localStorage
  res.json({
    success: true,
    message: 'Logout successful'
  });
});

// ========== ADMIN-ONLY ROUTES (Still protected) ==========

// Get all users (Admin only)
app.get('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, is_admin, created_at FROM Users ORDER BY created_at DESC'
    );

    res.json({
      success: true,
      users: result.rows
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching users'
    });
  }
});

// Create new user (Admin only)
app.post('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { username, password, is_admin = false } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required'
      });
    }

    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT id FROM Users WHERE username = $1',
      [username]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Username already exists'
      });
    }

    // Hash the password
    const hashedPassword = await passwordUtils.hashPassword(password);

    // Insert new user
    const result = await pool.query(
      `INSERT INTO Users (username, password, is_admin) 
       VALUES ($1, $2, $3) 
       RETURNING id, username, is_admin, created_at`,
      [username, hashedPassword, is_admin]
    );

    const newUser = result.rows[0];

    logActivity('admin_create_user', {
      admin_id: req.user.id,
      admin_username: req.user.username,
      new_user_id: newUser.id,
      new_username: newUser.username,
      is_admin: newUser.is_admin
    });

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      user: newUser
    });

  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating user'
    });
  }
});

// Delete user (Admin only)
app.delete('/api/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent admin from deleting themselves
    if (parseInt(id) === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete your own account'
      });
    }

    const result = await pool.query(
      'DELETE FROM Users WHERE id = $1 RETURNING username',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    logActivity('admin_delete_user', {
      admin_id: req.user.id,
      admin_username: req.user.username,
      deleted_user_id: id,
      deleted_username: result.rows[0].username
    });

    res.json({
      success: true,
      message: 'User deleted successfully'
    });

  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting user'
    });
  }
});

// Update user role (Admin only)
app.put('/api/admin/users/:id/role', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { is_admin } = req.body;

    // Prevent admin from changing their own role
    if (parseInt(id) === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'Cannot change your own role'
      });
    }

    const result = await pool.query(
      `UPDATE Users SET is_admin = $1 
       WHERE id = $2 
       RETURNING id, username, is_admin`,
      [is_admin, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const updatedUser = result.rows[0];

    logActivity('admin_update_user_role', {
      admin_id: req.user.id,
      admin_username: req.user.username,
      updated_user_id: updatedUser.id,
      updated_username: updatedUser.username,
      new_role: updatedUser.is_admin ? 'admin' : 'user'
    });

    res.json({
      success: true,
      message: 'User role updated successfully',
      user: updatedUser
    });

  } catch (error) {
    console.error('Update user role error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating user role'
    });
  }
});

// ========== PUBLIC SCHOOL DATA ROUTES ==========

// READ - Get all schools or search by name (PUBLIC)
app.get('/api/schools', async (req, res) => {
  try {
    const { name } = req.query;
    let query, params;

    if (name && name.trim() !== '') {
      // Search by name
      query = `SELECT school_id, school_name, address, postal_code, zone_code, mainlevel_code, principal_name
               FROM Schools
               WHERE LOWER(school_name) LIKE LOWER($1)
               ORDER BY school_name ASC
               LIMIT 50`;
      params = [`%${name}%`];
    } else {
      // Get all schools 
      query = `SELECT school_id, school_name, address, postal_code, zone_code, mainlevel_code, principal_name
               FROM Schools
               ORDER BY school_name ASC`;
      params = [];
    }

    const result = await pool.query(query, params);

    // Log search activity to MongoDB
    if (name) {
      logActivity('search_schools', {
        query: name,
        results_count: result.rows.length
      });
    }

    res.json(result.rows);
  } catch (err) {
    console.error('Schools search error:', err);
    res.status(500).json({ error: 'Failed to fetch schools' });
  }
});

// CREATE - Add new school (Admin only)
app.post('/api/schools', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { school_name, address, postal_code, zone_code, mainlevel_code, principal_name } = req.body;

    // Validate required fields
    if (!school_name || !address || !postal_code || !zone_code || !mainlevel_code || !principal_name) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Insert into PostgreSQL
    const result = await pool.query(
      `INSERT INTO Schools (school_name, address, postal_code, zone_code, mainlevel_code, principal_name)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [school_name, address, postal_code, zone_code, mainlevel_code, principal_name]
    );

    // Log activity to MongoDB
    logActivity('create_school', {
      admin_id: req.user.id,
      admin_username: req.user.username,
      school_id: result.rows[0].school_id,
      school_name: school_name
    });

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Create school error:', err);
    res.status(500).json({ error: err.message });
  }
});

// UPDATE - Edit existing school (Admin only)
app.put('/api/schools/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { school_name, address, postal_code, zone_code, mainlevel_code, principal_name } = req.body;

    // Validate required fields
    if (!school_name || !address || !postal_code || !zone_code || !mainlevel_code || !principal_name) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Update in PostgreSQL
    const result = await pool.query(
      `UPDATE Schools 
       SET school_name = $1, address = $2, postal_code = $3, 
           zone_code = $4, mainlevel_code = $5, principal_name = $6
       WHERE school_id = $7
       RETURNING *`,
      [school_name, address, postal_code, zone_code, mainlevel_code, principal_name, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'School not found' });
    }

    // Log activity to MongoDB
    logActivity('update_school', {
      admin_id: req.user.id,
      admin_username: req.user.username,
      school_id: parseInt(id),
      school_name: school_name
    });

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Update school error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE - Remove school and all related data (Admin only)
app.delete('/api/schools/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // First, get school name for logging
    const schoolResult = await pool.query('SELECT school_name FROM Schools WHERE school_id = $1', [id]);
    const schoolName = schoolResult.rows[0]?.school_name || 'Unknown';

    // Delete related records
    await pool.query('DELETE FROM School_Subjects WHERE school_id = $1', [id]);
    await pool.query('DELETE FROM School_CCAs WHERE school_id = $1', [id]);
    await pool.query('DELETE FROM School_Programmes WHERE school_id = $1', [id]);
    await pool.query('DELETE FROM School_Distinctives WHERE school_id = $1', [id]);

    // Delete the school
    const result = await pool.query(
      'DELETE FROM Schools WHERE school_id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'School not found' });
    }

    // Log activity to MongoDB
    logActivity('delete_school', {
      admin_id: req.user.id,
      admin_username: req.user.username,
      school_id: parseInt(id),
      school_name: schoolName
    });

    res.json({ success: true, message: 'School deleted successfully' });
  } catch (err) {
    console.error('Delete school error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ========== PUBLIC SCHOOL DETAILS ROUTES ==========

// Get school subjects by ID (PUBLIC)
app.get('/api/schools/:id/subjects', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
            SELECT DISTINCT subj.subject_desc
            FROM school_subjects ss
            JOIN subjects subj ON ss.subject_id = subj.subject_id
            WHERE ss.school_id = $1
            AND subj.subject_desc IS NOT NULL
            AND TRIM(subj.subject_desc) != ''
            AND UPPER(subj.subject_desc) NOT IN ('NA', 'N/A', 'NIL', 'NONE', '-')
            ORDER BY subj.subject_desc
        `, [id]);

    res.json(result.rows);
  } catch (err) {
    console.error('Get school subjects error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get school CCAs by ID (PUBLIC)
app.get('/api/schools/:id/ccas', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
            SELECT 
                c.cca_generic_name,
                c.cca_grouping_desc,
                sc.cca_customized_name,
                sc.school_section
            FROM school_ccas sc
            JOIN ccas c ON sc.cca_id = c.cca_id
            WHERE sc.school_id = $1
            AND c.cca_generic_name IS NOT NULL
            AND TRIM(c.cca_generic_name) != ''
            ORDER BY c.cca_grouping_desc, c.cca_generic_name
        `, [id]);

    res.json(result.rows);
  } catch (err) {
    console.error('Get school CCAs error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get school programmes by ID (PUBLIC)
app.get('/api/schools/:id/programmes', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
            SELECT DISTINCT p.moe_programme_desc
            FROM school_programmes sp
            JOIN programmes p ON sp.programme_id = p.programme_id
            WHERE sp.school_id = $1
            AND p.moe_programme_desc IS NOT NULL
            AND TRIM(p.moe_programme_desc) != ''
            ORDER BY p.moe_programme_desc
        `, [id]);

    res.json(result.rows);
  } catch (err) {
    console.error('Get school programmes error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get school distinctive programmes by ID (PUBLIC)
app.get('/api/schools/:id/distinctives', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
            SELECT DISTINCT
                d.alp_domain,
                d.alp_title,
                d.llp_domain1,
                d.llp_title
            FROM school_distinctives sd
            JOIN distinctive_programmes d ON sd.distinctive_id = d.distinctive_id
            WHERE sd.school_id = $1
            ORDER BY d.alp_title, d.llp_title
        `, [id]);

    res.json(result.rows);
  } catch (err) {
    console.error('Get school distinctives error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ========== GET SCHOOL DETAILS BY ID (PUBLIC) ==========
app.get('/api/schools/:id/details', async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT 
        s.*,
        r.email_address,
        r.telephone_no,
        r.first_vp_name,
        r.second_vp_name,
        r.type_code,
        r.nature_code,
        r.session_code,
        r.autonomous_ind,
        r.gifted_ind,
        r.ip_ind,
        r.sap_ind,
        r.bus_desc,
        r.mrt_desc,
        COUNT(DISTINCT ss.subject_id) as subject_count,
        COUNT(DISTINCT sc.cca_id) as cca_count,
        COUNT(DISTINCT sp.programme_id) as programme_count,
        COUNT(DISTINCT sd.distinctive_id) as distinctive_count
      FROM Schools s
      LEFT JOIN raw_general_info r ON LOWER(s.school_name) = LOWER(r.school_name)
      LEFT JOIN School_Subjects ss ON s.school_id = ss.school_id
      LEFT JOIN School_CCAs sc ON s.school_id = sc.school_id
      LEFT JOIN School_Programmes sp ON s.school_id = sp.school_id
      LEFT JOIN School_Distinctives sd ON s.school_id = sd.school_id
      WHERE s.school_id = $1
      GROUP BY s.school_id, r.email_address, r.telephone_no, r.first_vp_name, 
               r.second_vp_name, r.type_code, r.nature_code, r.session_code,
               r.autonomous_ind, r.gifted_ind, r.ip_ind, r.sap_ind, 
               r.bus_desc, r.mrt_desc
    `;

    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'School not found'
      });
    }

    res.json({
      success: true,
      school: result.rows[0]
    });

  } catch (err) {
    console.error('School details error:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// ========== PUBLIC READ-ONLY QUERY ROUTES ==========

// School subjects - SEARCH BY SUBJECT, NOT SCHOOL (PUBLIC)
app.get('/api/schools/subjects', async (req, res) => {
  try {
    const { name } = req.query;

    if (!name || name.trim() === '') {
      return res.json([]);
    }

    const result = await pool.query(
      `SELECT DISTINCT
        s.school_id,
        s.school_name,
        s.zone_code,
        s.mainlevel_code,
        subj.subject_desc
       FROM Schools s
       JOIN School_Subjects ss ON s.school_id = ss.school_id
       JOIN Subjects subj ON subj.subject_id = ss.subject_id
       WHERE LOWER(subj.subject_desc) LIKE LOWER($1)
         AND subj.subject_desc IS NOT NULL
         AND TRIM(subj.subject_desc) != ''
         AND UPPER(subj.subject_desc) NOT IN ('NA', 'N/A', 'NIL', 'NONE', '-')
       ORDER BY s.school_name, subj.subject_desc
       LIMIT 100`,
      [`%${name}%`]
    );

    logActivity('search_subjects', {
      query: name,
      results_count: result.rows.length
    });

    res.json(result.rows);
  } catch (err) {
    console.error('Subject search error:', err);
    res.status(500).json({ error: err.message });
  }
});

// School CCAs - SEARCH BY CCA, NOT SCHOOL (PUBLIC)
app.get('/api/schools/ccas', async (req, res) => {
  try {
    const { name } = req.query;

    if (!name || name.trim() === '') {
      return res.json([]);
    }

    const result = await pool.query(
      `SELECT DISTINCT
        s.school_id,
        s.school_name,
        s.zone_code,
        s.mainlevel_code,
        c.cca_generic_name
       FROM Schools s
       JOIN School_CCAs sca ON s.school_id = sca.school_id
       JOIN CCAs c ON c.cca_id = sca.cca_id
       WHERE (
         LOWER(c.cca_generic_name) LIKE LOWER($1) OR
         LOWER(c.cca_grouping_desc) LIKE LOWER($1) OR
         LOWER(sca.cca_customized_name) LIKE LOWER($1)
       )
       AND c.cca_generic_name IS NOT NULL
       AND TRIM(c.cca_generic_name) != ''
       AND UPPER(c.cca_generic_name) NOT IN ('NA', 'N/A', 'NIL', 'NONE', '-')
       ORDER BY s.school_name, c.cca_generic_name
       LIMIT 100`,
      [`%${name}%`]
    );

    logActivity('search_ccas', {
      query: name,
      results_count: result.rows.length
    });

    res.json(result.rows);
  } catch (err) {
    console.error('CCA search error:', err);
    res.status(500).json({ error: err.message });
  }
});

// School Programmes - SEARCH BY PROGRAMME, NOT SCHOOL (PUBLIC)
app.get('/api/schools/programmes', async (req, res) => {
  try {
    const { name } = req.query;

    if (!name || name.trim() === '') {
      return res.json([]);
    }

    const result = await pool.query(
      `SELECT DISTINCT
        s.school_id,
        s.school_name,
        s.zone_code,
        s.mainlevel_code,
        p.moe_programme_desc
       FROM Schools s
       JOIN School_Programmes sp ON s.school_id = sp.school_id
       JOIN Programmes p ON p.programme_id = sp.programme_id
       WHERE LOWER(p.moe_programme_desc) LIKE LOWER($1)
         AND p.moe_programme_desc IS NOT NULL
         AND TRIM(p.moe_programme_desc) != ''
         AND UPPER(p.moe_programme_desc) NOT IN ('NA', 'N/A', 'NIL', 'NONE', '-')
       ORDER BY s.school_name, p.moe_programme_desc
       LIMIT 100`,
      [`%${name}%`]
    );

    logActivity('search_programmes', {
      query: name,
      results_count: result.rows.length
    });

    res.json(result.rows);
  } catch (err) {
    console.error('Programme search error:', err);
    res.status(500).json({ error: err.message });
  }
});

// School Distinctives - SEARCH BY DISTINCTIVE, NOT SCHOOL (PUBLIC)
app.get('/api/schools/distinctives', async (req, res) => {
  try {
    const { name } = req.query;

    if (!name || name.trim() === '') {
      return res.json([]);
    }

    const result = await pool.query(
      `SELECT DISTINCT
        s.school_id,
        s.school_name,
        s.zone_code,
        s.mainlevel_code,
        COALESCE(d.alp_title, d.llp_title) as distinctive_name,
        d.alp_domain,
        d.llp_domain1
       FROM Schools s
       JOIN School_Distinctives sd ON s.school_id = sd.school_id
       JOIN Distinctive_Programmes d ON d.distinctive_id = sd.distinctive_id
       WHERE (
         LOWER(d.alp_domain) LIKE LOWER($1) OR
         LOWER(d.alp_title) LIKE LOWER($1) OR
         LOWER(d.llp_domain1) LIKE LOWER($1) OR
         LOWER(d.llp_title) LIKE LOWER($1)
       )
       AND (
         (d.alp_domain IS NOT NULL AND TRIM(d.alp_domain) != '' AND UPPER(d.alp_domain) NOT IN ('NA', 'N/A', 'NIL', 'NONE', '-')) OR
         (d.alp_title IS NOT NULL AND TRIM(d.alp_title) != '' AND UPPER(d.alp_title) NOT IN ('NA', 'N/A', 'NIL', 'NONE', '-')) OR
         (d.llp_domain1 IS NOT NULL AND TRIM(d.llp_domain1) != '' AND UPPER(d.llp_domain1) NOT IN ('NA', 'N/A', 'NIL', 'NONE', '-')) OR
         (d.llp_title IS NOT NULL AND TRIM(d.llp_title) != '' AND UPPER(d.llp_title) NOT IN ('NA', 'N/A', 'NIL', 'NONE', '-'))
       )
       ORDER BY s.school_name
       LIMIT 100`,
      [`%${name}%`]
    );

    logActivity('search_distinctives', {
      query: name,
      results_count: result.rows.length
    });

    res.json(result.rows);
  } catch (err) {
    console.error('Distinctive search error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ========== PUBLIC UNIVERSAL SEARCH ==========

// Universal Search - search across all tables (PUBLIC)
app.get('/api/search/universal', async (req, res) => {
  try {
    const { query } = req.query;

    if (!query || query.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Search query is required'
      });
    }

    const searchTerm = `%${query.trim()}%`;

    // --- Schools ---
    const schoolsQuery = `
      SELECT 
        'school' AS type,
        s.school_id AS id,
        s.school_name AS name,
        s.address AS description,
        s.zone_code,
        s.mainlevel_code,
        s.principal_name,
        s.school_id
      FROM schools s
      WHERE s.school_name ILIKE $1
         OR s.address ILIKE $1
         OR s.principal_name ILIKE $1
      ORDER BY s.school_name;
    `;

    // --- Subjects ---
    const subjectsQuery = `
    SELECT 
      'subject' AS type,
      s.school_id,
      s.school_name AS name,
      subj.subject_desc AS description,
      s.zone_code,
      s.mainlevel_code
    FROM subjects subj
      JOIN school_subjects ss ON subj.subject_id = ss.subject_id
      JOIN schools s ON ss.school_id = s.school_id
    WHERE subj.subject_desc ILIKE $1
      AND subj.subject_desc IS NOT NULL
      AND TRIM(subj.subject_desc) != ''
      AND UPPER(subj.subject_desc) NOT IN ('NA', 'N/A', 'NIL', 'NONE', '-')
    ORDER BY s.school_name;
  `;

    // --- CCAs ---
    const ccasQuery = `
      SELECT 
        'cca' AS type,
        sch.school_id,
        sch.school_name AS name,
        c.cca_generic_name AS description,
        sch.zone_code,
        sch.mainlevel_code
      FROM CCAs c
      JOIN School_CCAs sc ON c.cca_id = sc.cca_id
      JOIN Schools sch ON sc.school_id = sch.school_id
      WHERE 
        c.cca_generic_name ILIKE $1
        OR c.cca_grouping_desc ILIKE $1
        OR sc.cca_customized_name ILIKE $1
      ORDER BY sch.school_name
    `;

    // --- Programmes ---
    const programmesQuery = `
      SELECT 
        'programme' AS type,
        sch.school_id,
        sch.school_name AS name,
        p.moe_programme_desc AS description,
        sch.zone_code,
        sch.mainlevel_code
      FROM programmes p
      JOIN school_programmes sp ON p.programme_id = sp.programme_id
      JOIN schools sch ON sp.school_id = sch.school_id
      WHERE p.moe_programme_desc ILIKE $1
        AND p.moe_programme_desc IS NOT NULL
        AND TRIM(p.moe_programme_desc) != ''
        AND UPPER(p.moe_programme_desc) NOT IN ('NA', 'N/A', 'NIL', 'NONE', '-')
      ORDER BY sch.school_name;
    `;

    // --- Distinctive Programmes (ALP / LLP) ---
    const distinctivesQuery = `
      SELECT 
        'distinctive' AS type,
        sch.school_id,
        sch.school_name AS name,
        COALESCE(d.alp_title, d.llp_title, 'Distinctive Programme') AS description,
        sch.zone_code,
        sch.mainlevel_code
      FROM distinctive_programmes d
      JOIN school_distinctives sd ON d.distinctive_id = sd.distinctive_id
      JOIN schools sch ON sd.school_id = sch.school_id
      WHERE 
        COALESCE(d.alp_title, '') ILIKE $1 OR
        COALESCE(d.llp_title, '') ILIKE $1 OR
        COALESCE(d.alp_domain, '') ILIKE $1 OR
        COALESCE(d.llp_domain1, '') ILIKE $1
      ORDER BY sch.school_name;
    `;

    // --- Execute all in parallel ---
    const [schools, subjects, ccas, programmes, distinctives] = await Promise.all([
      pool.query(schoolsQuery, [searchTerm]),
      pool.query(subjectsQuery, [searchTerm]),
      pool.query(ccasQuery, [searchTerm]),
      pool.query(programmesQuery, [searchTerm]),
      pool.query(distinctivesQuery, [searchTerm])
    ]);

    // --- Combine results ---
    const results = {
      schools: schools.rows,
      subjects: subjects.rows,
      ccas: ccas.rows,
      programmes: programmes.rows,
      distinctives: distinctives.rows,
      total:
        schools.rows.length +
        subjects.rows.length +
        ccas.rows.length +
        programmes.rows.length +
        distinctives.rows.length
    };

    // --- Optional MongoDB logging ---
    if (typeof logActivity === 'function') {
      logActivity('universal_search', {
        query,
        total_results: results.total,
        breakdown: {
          schools: results.schools.length,
          subjects: results.subjects.length,
          ccas: results.ccas.length,
          programmes: results.programmes.length,
          distinctives: results.distinctives.length
        }
      });
    }

    return res.json({
      success: true,
      query,
      results
    });
  } catch (err) {
    console.error('Universal search error:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Get details for a specific item found in universal search (PUBLIC)
app.get('/api/search/details/:type/:id', async (req, res) => {
  try {
    const { type, id } = req.params;
    let query, params;

    switch (type) {
      case 'school':
        query = `
          SELECT 
            s.*,
            COUNT(DISTINCT ss.subject_id) as subject_count,
            COUNT(DISTINCT sc.cca_id) as cca_count,
            COUNT(DISTINCT sp.programme_id) as programme_count
          FROM Schools s
          LEFT JOIN School_Subjects ss ON s.school_id = ss.school_id
          LEFT JOIN School_CCAs sc ON s.school_id = sc.school_id
          LEFT JOIN School_Programmes sp ON s.school_id = sp.school_id
          WHERE s.school_id = $1
          GROUP BY s.school_id
        `;
        params = [id];
        break;

      case 'subject':
        query = `
          SELECT 
            s.subject_desc,
            JSON_AGG(
              JSON_BUILD_OBJECT(
                'school_id', sch.school_id,
                'school_name', sch.school_name,
                'zone_code', sch.zone_code
              )
            ) as schools
          FROM Subjects s
          LEFT JOIN School_Subjects ss ON s.subject_id = ss.subject_id
          LEFT JOIN Schools sch ON ss.school_id = sch.school_id
          WHERE s.subject_id = $1
          GROUP BY s.subject_id, s.subject_desc
        `;
        params = [id];
        break;

      case 'cca':
        query = `
          SELECT 
            c.cca_generic_name,
            JSON_AGG(
              JSON_BUILD_Object(
                'school_id', sch.school_id,
                'school_name', sch.school_name,
                'customized_name', sc.cca_customized_name,
                'zone_code', sch.zone_code
              )
            ) as schools
          FROM CCAs c
          LEFT JOIN School_CCAs sc ON c.cca_id = sc.cca_id
          LEFT JOIN Schools sch ON sc.school_id = sch.school_id
          WHERE c.cca_id = $1
          GROUP BY c.cca_id, c.cca_generic_name
        `;
        params = [id];
        break;

      case 'programme':
        query = `
          SELECT 
            p.moe_programme_desc,
            JSON_AGG(
              JSON_BUILD_OBJECT(
                'school_id', sch.school_id,
                'school_name', sch.school_name,
                'zone_code', sch.zone_code
              )
            ) as schools
          FROM Programmes p
          LEFT JOIN School_Programmes sp ON p.programme_id = sp.programme_id
          LEFT JOIN Schools sch ON sp.school_id = sch.school_id
          WHERE p.programme_id = $1
          GROUP BY p.programme_id, p.moe_programme_desc
        `;
        params = [id];
        break;

      case 'distinctive':
        query = `
          SELECT 
            d.*,
            JSON_AGG(
              JSON_BUILD_OBJECT(
                'school_id', sch.school_id,
                'school_name', sch.school_name,
                'zone_code', sch.zone_code
              )
            ) as schools
          FROM Distinctive_Programmes d
          LEFT JOIN School_Distinctives sd ON d.distinctive_id = sd.distinctive_id
          LEFT JOIN Schools sch ON sd.school_id = sch.school_id
          WHERE d.distinctive_id = $1
          GROUP BY d.distinctive_id
        `;
        params = [id];
        break;

      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid type'
        });
    }

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Item not found'
      });
    }

    res.json({
      success: true,
      type: type,
      data: result.rows[0]
    });

  } catch (err) {
    console.error('Details fetch error:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// ========== PUBLIC ADVANCED SEARCH ENDPOINT ==========
app.post('/api/search/advanced', async (req, res) => {
  try {
    const searchParams = req.body;

    if (Object.keys(searchParams).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one search parameter is required'
      });
    }

    let whereClauses = [];
    let queryParams = [];
    let paramCount = 1;

    // Helper function to create sanitized search condition
    const addSanitizedCondition = (column, searchValue, useExactMatch = false) => {
      if (useExactMatch) {
        whereClauses.push(`
          ${column} = $${paramCount} 
          AND ${column} IS NOT NULL 
          AND TRIM(${column}) != '' 
          AND UPPER(${column}) NOT IN ('NA', 'N/A', 'NIL', 'NONE', '-')
        `);
        queryParams.push(searchValue);
      } else {
        whereClauses.push(`
          LOWER(${column}) LIKE LOWER($${paramCount}) 
          AND ${column} IS NOT NULL 
          AND TRIM(${column}) != '' 
          AND UPPER(${column}) NOT IN ('NA', 'N/A', 'NIL', 'NONE', '-')
        `);
        queryParams.push(`%${searchValue}%`);
      }
      paramCount++;
    };

    // Helper for multiple column OR conditions (like VPs or mother tongue)
    const addMultiColumnCondition = (columns, searchValue) => {
      const conditions = columns.map(col => `
        (LOWER(${col}) LIKE LOWER($${paramCount}) 
        AND ${col} IS NOT NULL 
        AND TRIM(${col}) != '' 
        AND UPPER(${col}) NOT IN ('NA', 'N/A', 'NIL', 'NONE', '-'))
      `).join(' OR ');

      whereClauses.push(`(${conditions})`);
      queryParams.push(`%${searchValue}%`);
      paramCount++;
    };

    // ===== SCHOOLS TABLE FIELDS =====
    if (searchParams.school_name) {
      addSanitizedCondition('s.school_name', searchParams.school_name);
    }

    if (searchParams.principal_name) {
      whereClauses.push(`
        (LOWER(COALESCE(s.principal_name, r.principal_name)) LIKE LOWER($${paramCount})
        AND COALESCE(s.principal_name, r.principal_name) IS NOT NULL
        AND TRIM(COALESCE(s.principal_name, r.principal_name)) != ''
        AND UPPER(COALESCE(s.principal_name, r.principal_name)) NOT IN ('NA', 'N/A', 'NIL', 'NONE', '-'))
      `);
      queryParams.push(`%${searchParams.principal_name}%`);
      paramCount++;
    }

    if (searchParams.address) {
      whereClauses.push(`
        (LOWER(COALESCE(s.address, r.address)) LIKE LOWER($${paramCount})
        AND COALESCE(s.address, r.address) IS NOT NULL
        AND TRIM(COALESCE(s.address, r.address)) != ''
        AND UPPER(COALESCE(s.address, r.address)) NOT IN ('NA', 'N/A', 'NIL', 'NONE', '-'))
      `);
      queryParams.push(`%${searchParams.address}%`);
      paramCount++;
    }

    if (searchParams.postal_code) {
      whereClauses.push(`
        COALESCE(s.postal_code, r.postal_code) = $${paramCount}
        AND COALESCE(s.postal_code, r.postal_code) IS NOT NULL
        AND TRIM(COALESCE(s.postal_code, r.postal_code)) != ''
        AND UPPER(COALESCE(s.postal_code, r.postal_code)) NOT IN ('NA', 'N/A', 'NIL', 'NONE', '-')
      `);
      queryParams.push(searchParams.postal_code);
      paramCount++;
    }

    if (searchParams.zone_code) {
      addSanitizedCondition('COALESCE(s.zone_code, r.zone_code)', searchParams.zone_code, true);
    }

    if (searchParams.mainlevel_code) {
      addSanitizedCondition('COALESCE(s.mainlevel_code, r.mainlevel_code)', searchParams.mainlevel_code, true);
    }

    // ===== RAW_GENERAL_INFO FIELDS =====
    if (searchParams.vp_name) {
      addMultiColumnCondition([
        'r.first_vp_name',
        'r.second_vp_name',
        'r.third_vp_name',
        'r.fourth_vp_name',
        'r.fifth_vp_name',
        'r.sixth_vp_name'
      ], searchParams.vp_name);
    }

    if (searchParams.email_address) {
      addSanitizedCondition('r.email_address', searchParams.email_address);
    }

    if (searchParams.type_code) {
      addSanitizedCondition('r.type_code', searchParams.type_code);
    }

    if (searchParams.nature_code) {
      addSanitizedCondition('r.nature_code', searchParams.nature_code);
    }

    if (searchParams.session_code) {
      addSanitizedCondition('r.session_code', searchParams.session_code);
    }

    if (searchParams.dgp_code) {
      addSanitizedCondition('r.dgp_code', searchParams.dgp_code);
    }

    if (searchParams.mothertongue_code) {
      addMultiColumnCondition([
        'r.mothertongue1_code',
        'r.mothertongue2_code',
        'r.mothertongue3_code'
      ], searchParams.mothertongue_code);
    }

    // Indicators - these should be exact matches (Yes/No)
    if (searchParams.autonomous_ind) {
      whereClauses.push(`r.autonomous_ind = $${paramCount}`);
      queryParams.push(searchParams.autonomous_ind);
      paramCount++;
    }

    if (searchParams.gifted_ind) {
      whereClauses.push(`r.gifted_ind = $${paramCount}`);
      queryParams.push(searchParams.gifted_ind);
      paramCount++;
    }

    if (searchParams.ip_ind) {
      whereClauses.push(`r.ip_ind = $${paramCount}`);
      queryParams.push(searchParams.ip_ind);
      paramCount++;
    }

    if (searchParams.sap_ind) {
      whereClauses.push(`r.sap_ind = $${paramCount}`);
      queryParams.push(searchParams.sap_ind);
      paramCount++;
    }

    if (searchParams.bus_desc) {
      addSanitizedCondition('r.bus_desc', searchParams.bus_desc);
    }

    if (searchParams.mrt_desc) {
      addSanitizedCondition('r.mrt_desc', searchParams.mrt_desc);
    }

    // ===== BASE QUERY WITH RAW_GENERAL_INFO JOIN =====
    let query = `
      SELECT DISTINCT
        s.school_id,
        s.school_name,
        s.principal_name,
        s.address,
        s.postal_code,
        s.zone_code,
        s.mainlevel_code,
        NULLIF(NULLIF(TRIM(r.email_address), ''), 'NA') as email_address,
        NULLIF(NULLIF(TRIM(r.telephone_no), ''), 'NA') as telephone_no,
        NULLIF(NULLIF(TRIM(r.first_vp_name), ''), 'NA') as first_vp_name,
        NULLIF(NULLIF(TRIM(r.second_vp_name), ''), 'NA') as second_vp_name,
        NULLIF(NULLIF(TRIM(r.type_code), ''), 'NA') as type_code,
        NULLIF(NULLIF(TRIM(r.nature_code), ''), 'NA') as nature_code,
        NULLIF(NULLIF(TRIM(r.session_code), ''), 'NA') as session_code,
        NULLIF(NULLIF(TRIM(r.dgp_code), ''), 'NA') as dgp_code,
        NULLIF(NULLIF(TRIM(r.mothertongue1_code), ''), 'NA') as mothertongue1_code,
        NULLIF(NULLIF(TRIM(r.mothertongue2_code), ''), 'NA') as mothertongue2_code,
        NULLIF(NULLIF(TRIM(r.mothertongue3_code), ''), 'NA') as mothertongue3_code,
        r.autonomous_ind,
        r.gifted_ind,
        r.ip_ind,
        r.sap_ind,
        NULLIF(NULLIF(TRIM(r.bus_desc), ''), 'NA') as bus_desc,
        NULLIF(NULLIF(TRIM(r.mrt_desc), ''), 'NA') as mrt_desc
      FROM Schools s
      LEFT JOIN raw_general_info r ON LOWER(s.school_name) = LOWER(r.school_name)
    `;

    // ===== RELATED TABLE SEARCHES =====
    let needsSubjectJoin = false;
    let needsCCAJoin = false;
    let needsProgrammeJoin = false;
    let needsDistinctiveJoin = false;

    // SUBJECTS
    if (searchParams.subject_desc) {
      needsSubjectJoin = true;
      whereClauses.push(`
        LOWER(subj.subject_desc) LIKE LOWER($${paramCount})
        AND subj.subject_desc IS NOT NULL
        AND TRIM(subj.subject_desc) != ''
        AND UPPER(subj.subject_desc) NOT IN ('NA', 'N/A', 'NIL', 'NONE', '-')
      `);
      queryParams.push(`%${searchParams.subject_desc}%`);
      paramCount++;
    }

    // CCAs
    if (searchParams.cca_generic_name) {
      needsCCAJoin = true;
      whereClauses.push(`
        LOWER(c.cca_generic_name) LIKE LOWER($${paramCount})
        AND c.cca_generic_name IS NOT NULL
        AND TRIM(c.cca_generic_name) != ''
        AND UPPER(c.cca_generic_name) NOT IN ('NA', 'N/A', 'NIL', 'NONE', '-')
      `);
      queryParams.push(`%${searchParams.cca_generic_name}%`);
      paramCount++;
    }

    if (searchParams.cca_customized_name) {
      needsCCAJoin = true;
      whereClauses.push(`
        LOWER(sc.cca_customized_name) LIKE LOWER($${paramCount})
        AND sc.cca_customized_name IS NOT NULL
        AND TRIM(sc.cca_customized_name) != ''
        AND UPPER(sc.cca_customized_name) NOT IN ('NA', 'N/A', 'NIL', 'NONE', '-')
      `);
      queryParams.push(`%${searchParams.cca_customized_name}%`);
      paramCount++;
    }

    if (searchParams.cca_grouping_desc) {
      needsCCAJoin = true;
      whereClauses.push(`
        LOWER(c.cca_grouping_desc) LIKE LOWER($${paramCount})
        AND c.cca_grouping_desc IS NOT NULL
        AND TRIM(c.cca_grouping_desc) != ''
        AND UPPER(c.cca_grouping_desc) NOT IN ('NA', 'N/A', 'NIL', 'NONE', '-')
      `);
      queryParams.push(`%${searchParams.cca_grouping_desc}%`);
      paramCount++;
    }

    // PROGRAMMES
    if (searchParams.moe_programme_desc) {
      needsProgrammeJoin = true;
      whereClauses.push(`
        LOWER(p.moe_programme_desc) LIKE LOWER($${paramCount})
        AND p.moe_programme_desc IS NOT NULL
        AND TRIM(p.moe_programme_desc) != ''
        AND UPPER(p.moe_programme_desc) NOT IN ('NA', 'N/A', 'NIL', 'NONE', '-')
      `);
      queryParams.push(`%${searchParams.moe_programme_desc}%`);
      paramCount++;
    }

    // DISTINCTIVE PROGRAMMES (ALP/LLP)
    if (searchParams.alp_domain) {
      needsDistinctiveJoin = true;
      whereClauses.push(`
        LOWER(d.alp_domain) LIKE LOWER($${paramCount})
        AND d.alp_domain IS NOT NULL
        AND TRIM(d.alp_domain) != ''
        AND UPPER(d.alp_domain) NOT IN ('NA', 'N/A', 'NIL', 'NONE', '-')
      `);
      queryParams.push(`%${searchParams.alp_domain}%`);
      paramCount++;
    }

    if (searchParams.alp_title) {
      needsDistinctiveJoin = true;
      whereClauses.push(`
        LOWER(d.alp_title) LIKE LOWER($${paramCount})
        AND d.alp_title IS NOT NULL
        AND TRIM(d.alp_title) != ''
        AND UPPER(d.alp_title) NOT IN ('NA', 'N/A', 'NIL', 'NONE', '-')
      `);
      queryParams.push(`%${searchParams.alp_title}%`);
      paramCount++;
    }

    if (searchParams.llp_domain1) {
      needsDistinctiveJoin = true;
      whereClauses.push(`
        LOWER(d.llp_domain1) LIKE LOWER($${paramCount})
        AND d.llp_domain1 IS NOT NULL
        AND TRIM(d.llp_domain1) != ''
        AND UPPER(d.llp_domain1) NOT IN ('NA', 'N/A', 'NIL', 'NONE', '-')
      `);
      queryParams.push(`%${searchParams.llp_domain1}%`);
      paramCount++;
    }

    if (searchParams.llp_title) {
      needsDistinctiveJoin = true;
      whereClauses.push(`
        LOWER(d.llp_title) LIKE LOWER($${paramCount})
        AND d.llp_title IS NOT NULL
        AND TRIM(d.llp_title) != ''
        AND UPPER(d.llp_title) NOT IN ('NA', 'N/A', 'NIL', 'NONE', '-')
      `);
      queryParams.push(`%${searchParams.llp_title}%`);
      paramCount++;
    }

    // ===== ADD JOINS FOR RELATED TABLES =====
    if (needsSubjectJoin) {
      query += `
        LEFT JOIN School_Subjects ss ON s.school_id = ss.school_id
        LEFT JOIN Subjects subj ON ss.subject_id = subj.subject_id
      `;
    }

    if (needsCCAJoin) {
      query += `
        LEFT JOIN School_CCAs sc ON s.school_id = sc.school_id
        LEFT JOIN CCAs c ON sc.cca_id = c.cca_id
      `;
    }

    if (needsProgrammeJoin) {
      query += `
        LEFT JOIN School_Programmes sp ON s.school_id = sp.school_id
        LEFT JOIN Programmes p ON sp.programme_id = p.programme_id
      `;
    }

    if (needsDistinctiveJoin) {
      query += `
        LEFT JOIN School_Distinctives sd ON s.school_id = sd.school_id
        LEFT JOIN Distinctive_Programmes d ON sd.distinctive_id = d.distinctive_id
      `;
    }

    // ===== WHERE CLAUSE =====
    if (whereClauses.length > 0) {
      query += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    // ===== ORDER AND LIMIT =====
    query += `
      ORDER BY s.school_name ASC
      LIMIT 100
    `;

    console.log('Advanced Search Query:', query);
    console.log('Parameters:', queryParams);
    console.log('Criteria count:', Object.keys(searchParams).length);

    const result = await pool.query(query, queryParams);

    // Log to MongoDB
    await logActivity('advanced_search', {
      criteria_count: Object.keys(searchParams).length,
      criteria: searchParams,
      results_count: result.rows.length
    });

    res.json({
      success: true,
      results: result.rows,
      count: result.rows.length,
      criteria: searchParams
    });

  } catch (err) {
    console.error('Advanced search error:', err);
    console.error('Error stack:', err.stack);
    res.status(500).json({
      success: false,
      error: err.message,
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

// ========== PUBLIC ANALYTICS ENDPOINTS ==========

// 1. Schools by Zone with Statistics (PUBLIC)
app.get('/api/analytics/schools-by-zone', async (req, res) => {
  try {
    const query = `
      SELECT 
        zone_code,
        COUNT(*) as total_schools,
        COUNT(DISTINCT mainlevel_code) as school_types,
        ROUND(AVG(LENGTH(address))::numeric, 2) as avg_address_length
      FROM Schools
      GROUP BY zone_code
      ORDER BY total_schools DESC
    `;

    const result = await pool.query(query);

    logActivity('view_zone_statistics', {
      zones_analyzed: result.rows.length
    });

    res.json({
      success: true,
      data: result.rows
    });
  } catch (err) {
    console.error('Zone statistics error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 2. Schools with Subject Count (PUBLIC)
app.get('/api/analytics/schools-subject-count', async (req, res) => {
  try {
    const query = `
      SELECT 
        s.school_id,
        s.school_name,
        s.zone_code,
        s.mainlevel_code,
        COUNT(ss.subject_id) as subject_count,
        CASE 
          WHEN COUNT(ss.subject_id) > 10 THEN 'High'
          WHEN COUNT(ss.subject_id) > 5 THEN 'Medium'
          ELSE 'Low'
        END as subject_diversity
      FROM Schools s
      LEFT JOIN School_Subjects ss ON s.school_id = ss.school_id
      GROUP BY s.school_id, s.school_name, s.zone_code, s.mainlevel_code
      HAVING COUNT(ss.subject_id) > 0
      ORDER BY subject_count DESC
      LIMIT 20
    `;

    const result = await pool.query(query);

    logActivity('view_subject_diversity', {
      schools_analyzed: result.rows.length
    });

    res.json({
      success: true,
      data: result.rows,
      summary: {
        total_schools: result.rows.length,
        avg_subjects: result.rows.length > 0
          ? (result.rows.reduce((sum, row) => sum + parseInt(row.subject_count), 0) / result.rows.length).toFixed(2)
          : 0
      }
    });
  } catch (err) {
    console.error('Subject count error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 3. Schools Offering More Subjects Than Average (PUBLIC)
app.get('/api/analytics/above-average-subjects', async (req, res) => {
  try {
    const query = `
      WITH subject_counts AS (
        SELECT 
          s.school_id,
          s.school_name,
          s.zone_code,
          COUNT(ss.subject_id) as subject_count
        FROM Schools s
        LEFT JOIN School_Subjects ss ON s.school_id = ss.school_id
        GROUP BY s.school_id, s.school_name, s.zone_code
      ),
      avg_subjects AS (
        SELECT AVG(subject_count) as avg_count
        FROM subject_counts
        WHERE subject_count > 0
      )
      SELECT 
        sc.school_name,
        sc.zone_code,
        sc.subject_count,
        ROUND(a.avg_count::numeric, 2) as system_average,
        ROUND((sc.subject_count - a.avg_count)::numeric, 2) as difference
      FROM subject_counts sc, avg_subjects a
      WHERE sc.subject_count > a.avg_count
      ORDER BY sc.subject_count DESC
    `;

    const result = await pool.query(query);

    logActivity('view_above_average_schools', {
      schools_found: result.rows.length
    });

    res.json({
      success: true,
      data: result.rows,
      message: `Found ${result.rows.length} schools with above-average subject offerings`
    });
  } catch (err) {
    console.error('Above average query error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 4. CCA Participation Analysis (PUBLIC)
app.get('/api/analytics/cca-participation', async (req, res) => {
  try {
    const query = `
      SELECT 
        c.cca_generic_name,
        COUNT(DISTINCT sc.school_id) as school_count,
        COUNT(sc.cca_id) as total_offerings,
        STRING_AGG(DISTINCT s.zone_code, ', ') as zones_offered,
        ROUND(COUNT(DISTINCT sc.school_id) * 100.0 / 
          (SELECT COUNT(DISTINCT school_id) FROM Schools), 2) as percentage_of_schools
      FROM CCAs c
      JOIN School_CCAs sc ON c.cca_id = sc.cca_id
      JOIN Schools s ON sc.school_id = s.school_id
      GROUP BY c.cca_id, c.cca_generic_name
      HAVING COUNT(DISTINCT sc.school_id) >= 3
      ORDER BY school_count DESC
      LIMIT 15
    `;

    const result = await pool.query(query);

    logActivity('view_cca_participation', {
      ccas_analyzed: result.rows.length
    });

    res.json({
      success: true,
      data: result.rows
    });
  } catch (err) {
    console.error('CCA participation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 5. Data Completeness (PUBLIC)
app.get('/api/analytics/data-completeness', async (req, res) => {
  try {
    const query = `
      SELECT 
        s.school_id,
        s.school_name,
        s.zone_code,
        s.mainlevel_code,
        COUNT(DISTINCT ss.subject_id) as subject_count,
        COUNT(DISTINCT sc.cca_id) as cca_count,
        COUNT(DISTINCT sp.programme_id) as programme_count,
        COUNT(DISTINCT sd.distinctive_id) as distinctive_count,
        (
          CASE WHEN COUNT(DISTINCT ss.subject_id) > 0 THEN 25 ELSE 0 END +
          CASE WHEN COUNT(DISTINCT sc.cca_id) > 0 THEN 25 ELSE 0 END +
          CASE WHEN COUNT(DISTINCT sp.programme_id) > 0 THEN 25 ELSE 0 END +
          CASE WHEN COUNT(DISTINCT sd.distinctive_id) > 0 THEN 25 ELSE 0 END
        ) as completeness_score,
        CASE 
          WHEN (
            CASE WHEN COUNT(DISTINCT ss.subject_id) > 0 THEN 25 ELSE 0 END +
            CASE WHEN COUNT(DISTINCT sc.cca_id) > 0 THEN 25 ELSE 0 END +
            CASE WHEN COUNT(DISTINCT sp.programme_id) > 0 THEN 25 ELSE 0 END +
            CASE WHEN COUNT(DISTINCT sd.distinctive_id) > 0 THEN 25 ELSE 0 END
          ) = 100 THEN 'Complete'
          WHEN (
            CASE WHEN COUNT(DISTINCT ss.subject_id) > 0 THEN 25 ELSE 0 END +
            CASE WHEN COUNT(DISTINCT sc.cca_id) > 0 THEN 25 ELSE 0 END +
            CASE WHEN COUNT(DISTINCT sp.programme_id) > 0 THEN 25 ELSE 0 END +
            CASE WHEN COUNT(DISTINCT sd.distinctive_id) > 0 THEN 25 ELSE 0 END
          ) >= 75 THEN 'Good'
          WHEN (
            CASE WHEN COUNT(DISTINCT ss.subject_id) > 0 THEN 25 ELSE 0 END +
            CASE WHEN COUNT(DISTINCT sc.cca_id) > 0 THEN 25 ELSE 0 END +
            CASE WHEN COUNT(DISTINCT sp.programme_id) > 0 THEN 25 ELSE 0 END +
            CASE WHEN COUNT(DISTINCT sd.distinctive_id) > 0 THEN 25 ELSE 0 END
          ) >= 50 THEN 'Fair'
          ELSE 'Incomplete'
        END as completeness_status
      FROM Schools s
      LEFT JOIN School_Subjects ss ON s.school_id = ss.school_id
      LEFT JOIN School_CCAs sc ON s.school_id = sc.school_id
      LEFT JOIN School_Programmes sp ON s.school_id = sp.school_id
      LEFT JOIN School_Distinctives sd ON s.school_id = sd.school_id
      GROUP BY s.school_id, s.school_name, s.zone_code, s.mainlevel_code
      ORDER BY completeness_score DESC, subject_count DESC
      LIMIT 50
    `;

    const result = await pool.query(query);

    const summary = {
      total_analyzed: result.rows.length,
      complete_schools: result.rows.filter(r => r.completeness_status === 'Complete').length,
      good_schools: result.rows.filter(r => r.completeness_status === 'Good').length,
      fair_schools: result.rows.filter(r => r.completeness_status === 'Fair').length,
      incomplete_schools: result.rows.filter(r => r.completeness_status === 'Incomplete').length
    };

    logActivity('view_data_completeness', {
      ...summary
    });

    res.json({
      success: true,
      data: result.rows,
      summary: summary
    });
  } catch (err) {
    console.error('Data completeness error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 6. Zone Comparison Analysis (PUBLIC)
app.get('/api/analytics/zone-comparison', async (req, res) => {
  try {
    const query = `
      SELECT 
        s.zone_code,
        COUNT(DISTINCT s.school_id) as total_schools,
        COUNT(DISTINCT s.mainlevel_code) as school_types,
        COUNT(DISTINCT ss.subject_id) as unique_subjects,
        COUNT(DISTINCT sc.cca_id) as unique_ccas,
        COUNT(DISTINCT sp.programme_id) as unique_programmes,
        ROUND(AVG(subj_count.cnt)::numeric, 2) as avg_subjects_per_school,
        ROUND(AVG(cca_count.cnt)::numeric, 2) as avg_ccas_per_school,
        MAX(subj_count.cnt) as max_subjects,
        MIN(CASE WHEN subj_count.cnt > 0 THEN subj_count.cnt END) as min_subjects
      FROM Schools s
      LEFT JOIN School_Subjects ss ON s.school_id = ss.school_id
      LEFT JOIN School_CCAs sc ON s.school_id = sc.school_id
      LEFT JOIN School_Programmes sp ON s.school_id = sp.school_id
      LEFT JOIN (
        SELECT school_id, COUNT(*) as cnt
        FROM School_Subjects
        GROUP BY school_id
      ) subj_count ON s.school_id = subj_count.school_id
      LEFT JOIN (
        SELECT school_id, COUNT(*) as cnt
        FROM School_CCAs
        GROUP BY school_id
      ) cca_count ON s.school_id = cca_count.school_id
      GROUP BY s.zone_code
      ORDER BY total_schools DESC
    `;

    const result = await pool.query(query);

    logActivity('view_zone_comparison', {
      zones: result.rows.length
    });

    res.json({
      success: true,
      data: result.rows
    });
  } catch (err) {
    console.error('Zone comparison error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ========== ADMIN-ONLY MONGODB ANALYTICS ROUTES ==========

// Get activity logs (Admin only)
app.get('/api/analytics/logs', requireAuth, requireAdmin, async (req, res) => {
  try {
    const db = await connectMongo();
    const logs = await db.collection('activity_logs')
      .find({})
      .sort({ timestamp: -1 })
      .limit(50)
      .toArray();

    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get recently added schools (last 10)
app.get('/api/schools/recent', requireAuth, requireAdmin, async (req, res) => {
  try {
    const query = `
      SELECT school_id, school_name, address, postal_code, zone_code, 
             mainlevel_code, principal_name
      FROM Schools
      ORDER BY school_id DESC
      LIMIT 10
    `;
    
    const result = await pool.query(query);
    
    res.json({
      success: true,
      schools: result.rows
    });
  } catch (err) {
    console.error('Recent schools error:', err);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

// Get popular searches (Admin only)
app.get('/api/analytics/popular', requireAuth, requireAdmin, async (req, res) => {
  try {
    const db = await connectMongo();
    const popular = await db.collection('activity_logs')
      .aggregate([
        { $match: { action: 'search_schools' } },
        {
          $group: {
            _id: '$data.query',
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]).toArray();

    res.json(popular);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== USER ROUTES (Optional - for admin users only) ==========

// Get user profile (for authenticated admin users)
app.get('/api/user/profile', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, is_admin, created_at FROM Users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      user: result.rows[0]
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching profile'
    });
  }
});

// Update user password (for authenticated admin users)
app.put('/api/user/password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      });
    }

    // Get current user with password
    const userResult = await pool.query(
      'SELECT password FROM Users WHERE id = $1',
      [req.user.id]
    );

    const user = userResult.rows[0];

    // Verify current password
    const isCurrentPasswordValid = await passwordUtils.verifyPassword(currentPassword, user.password);

    if (!isCurrentPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Hash new password
    const newHashedPassword = await passwordUtils.hashPassword(newPassword);

    // Update password
    await pool.query(
      'UPDATE Users SET password = $1 WHERE id = $2',
      [newHashedPassword, req.user.id]
    );

    logActivity('user_password_change', {
      user_id: req.user.id,
      username: req.user.username
    });

    res.json({
      success: true,
      message: 'Password updated successfully'
    });

  } catch (error) {
    console.error('Update password error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating password'
    });
  }
});

// ========== ROOT & TEST ROUTES ==========

// Root Route - serves index.html directly without any redirects
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Database Test Routes (PUBLIC)
app.get('/pg-test', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ status: "Connected to PostgreSQL", time: result.rows[0] });
  } catch (err) {
    res.status(500).json({ status: "PostgreSQL Error", error: err.message });
  }
});

app.get('/mongo-test', async (req, res) => {
  try {
    const db = await connectMongo();
    const collections = await db.listCollections().toArray();
    res.json({ status: "Connected to MongoDB", collections: collections.map(c => c.name) });
  } catch (err) {
    res.status(500).json({ status: "MongoDB Error", error: err.message });
  }
});

// Temporary test endpoint 
app.get('/api/test/check-columns', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'schools'
      ORDER BY ordinal_position
    `);
    res.json({
      table: 'schools',
      columns: result.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== ERROR HANDLING ==========

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ========== START SERVER ==========

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log(`PostgreSQL: Connected with public access`);
  console.log(`MongoDB: Ready for activity logging`);
  console.log(`Authentication: Admin-only features protected`);
  console.log(`\nAvailable endpoints:`);
  console.log(`  GET  /api/schools - List/search schools (PUBLIC)`);
  console.log(`  POST /api/schools - Create school (Admin only)`);
  console.log(`  PUT  /api/schools/:id - Update school (Admin only)`);
  console.log(`  DEL  /api/schools/:id - Delete school (Admin only)`);
  console.log(`  GET  /api/search/universal - Universal search (PUBLIC)`);
  console.log(`  POST /api/search/advanced - Advanced search (PUBLIC)`);
  console.log(`  GET  /api/analytics/* - Analytics endpoints (PUBLIC)`);
});
