const express = require('express');
const pool = require('./pg-connection');   // PostgreSQL
const connectMongo = require('./mongo-connection'); // MongoDB
require('dotenv').config();

const app = express();
const path = require('path');



// Middleware
app.use(express.static(path.join(__dirname, '../frontend')));
app.use(express.json());

// Redirect root to login
app.use((req, res, next) => {
  if (req.url === '/') {
    return res.redirect('/login');
  }
  next();
});

const port = process.env.PORT || 3000;

// Login route
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/login.html'));
});

// Login authentication route
app.post('/login', async (req, res) => {
  try {
    console.log('Request body:', req.body); // Debug log
    
    const { username, password } = req.body;

    // Check if body is undefined
    if (!req.body) {
      return res.status(400).json({ 
        success: false, 
        message: 'No data received in request body' 
      });
    }

    // Validate input
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

    // Check if user exists
    if (result.rows.length === 0) {
      console.log('User not found:', username);
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid username or password' 
      });
    }

    const user = result.rows[0];

    // Password comparison (use bcrypt in production)
    if (user.password !== password) {
      console.log('Invalid password for user:', username);
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid username or password' 
      });
    }

    // Login successful
    console.log('Login successful for user:', username);

    // Create user session data (without password)
    const userData = {
      user_id: user.user_id,
      username: user.username,
      is_admin: user.is_admin
    };

    // Log the login activity
    logActivity('user_login', { 
      user_id: user.user_id,
      username: user.username 
    });

    res.json({
      success: true,
      message: 'Login successful',
      user: userData,
      token: 'session-token-placeholder',
      redirectUrl: '/home.html'
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during authentication' 
    });
  }
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

// CRUD Operations for Schools 

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
               ORDER BY school_name ASC
               LIMIT 100`;
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
app.post('/api/schools', async (req, res) => {
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
      school_id: result.rows[0].school_id,
      school_name: school_name 
    });
    
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Create school error:', err);
    res.status(500).json({ error: err.message });
  }
});

// UPDATE - Edit existing school
app.put('/api/schools/:id', async (req, res) => {
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
      school_id: parseInt(id),
      school_name: school_name 
    });
    
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Update school error:', err);
    res.status(500).json({ error: err.message });
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

// Read-Only Query Routes 

// School subjects
app.get('/api/schools/subjects', async (req, res) => {
  try {
    const { name } = req.query;
    const result = await pool.query(
      `SELECT s.school_name, subj.subject_desc
       FROM Schools s
       JOIN School_Subjects ss ON s.school_id = ss.school_id
       JOIN Subjects subj ON subj.subject_id = ss.subject_id
       WHERE LOWER(s.school_name) LIKE LOWER($1)
       ORDER BY s.school_name, subj.subject_desc`,
      [`%${name}%`]
    );
    
    logActivity('search_subjects', { query: name, results_count: result.rows.length });
    
    res.json(result.rows.length ? result.rows : [{ school_name: "No match", subject_desc: "N/A" }]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// School CCAs
app.get('/api/schools/ccas', async (req, res) => {
  try {
    const { name } = req.query;
    const result = await pool.query(
      `SELECT s.school_name, c.cca_generic_name, sca.cca_customized_name, sca.school_section
       FROM Schools s
       JOIN School_CCAs sca ON s.school_id = sca.school_id
       JOIN CCAs c ON c.cca_id = sca.cca_id
       WHERE LOWER(s.school_name) LIKE LOWER($1)
       ORDER BY s.school_name, c.cca_generic_name`,
      [`%${name}%`]
    );
    
    logActivity('search_ccas', { query: name, results_count: result.rows.length });
    
    res.json(result.rows.length ? result.rows : [{ school_name: "No match", cca_generic_name: "N/A" }]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// School Programmes
app.get('/api/schools/programmes', async (req, res) => {
  try {
    const { name } = req.query;
    const result = await pool.query(
      `SELECT s.school_name, p.moe_programme_desc
       FROM Schools s
       JOIN School_Programmes sp ON s.school_id = sp.school_id
       JOIN Programmes p ON p.programme_id = sp.programme_id
       WHERE LOWER(s.school_name) LIKE LOWER($1)
       ORDER BY s.school_name, p.moe_programme_desc`,
      [`%${name}%`]
    );
    
    logActivity('search_programmes', { query: name, results_count: result.rows.length });
    
    res.json(result.rows.length ? result.rows : [{ school_name: "No match", moe_programme_desc: "N/A" }]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// School Distinctives
app.get('/api/schools/distinctives', async (req, res) => {
  try {
    const { name } = req.query;
    const result = await pool.query(
      `SELECT s.school_name, d.alp_domain, d.alp_title, d.llp_domain1, d.llp_title
       FROM Schools s
       JOIN School_Distinctives sd ON s.school_id = sd.school_id
       JOIN Distinctive_Programmes d ON d.distinctive_id = sd.distinctive_id
       WHERE LOWER(s.school_name) LIKE LOWER($1)
       ORDER BY s.school_name`,
      [`%${name}%`]
    );
    
    logActivity('search_distinctives', { query: name, results_count: result.rows.length });
    
    res.json(result.rows.length ? result.rows : [{ school_name: "No match", alp_domain: "N/A" }]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== Analytics Routes (MongoDB) ==========

// Get activity logs
app.get('/api/analytics/logs', async (req, res) => {
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

// Get popular searches
app.get('/api/analytics/popular', async (req, res) => {
  try {
    const db = await connectMongo();
    const popular = await db.collection('activity_logs')
      .aggregate([
        { $match: { action: 'search_schools' } },
        { $group: { 
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

//  MongoDB Activity Logger 
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

//  Error Handling 
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

//  Start Server 
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log(`PostgreSQL: Connected via Session Pooler`);
  console.log(`MongoDB: Ready for activity logging`);
});