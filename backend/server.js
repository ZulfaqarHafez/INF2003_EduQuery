const express = require('express');
const pool = require('./pg-connection');   // PostgreSQL
const connectMongo = require('./mongo-connection'); // MongoDB
require('dotenv').config();

const app = express();
const path = require('path');

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

const port = process.env.PORT || 3000;

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

// ========== READ-ONLY QUERY ROUTES ==========

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

// ========== MONGODB ANALYTICS ROUTES ==========

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

// ========== ERROR HANDLING ==========

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ========== START SERVER ==========

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log(`PostgreSQL: Connected via Session Pooler`);
  console.log(`MongoDB: Ready for activity logging`);
  console.log(`\nAvailable endpoints:`);
  console.log(`  GET  /api/schools - List/search schools`);
  console.log(`  POST /api/schools - Create school`);
  console.log(`  PUT  /api/schools/:id - Update school`);
  console.log(`  DEL  /api/schools/:id - Delete school`);
  console.log(`  GET  /api/analytics/schools-by-zone`);
  console.log(`  GET  /api/analytics/schools-subject-count`);
  console.log(`  GET  /api/analytics/above-average-subjects`);
  console.log(`  GET  /api/analytics/cca-participation`);
  console.log(`  GET  /api/analytics/data-completeness`);
  console.log(`  GET  /api/analytics/zone-comparison`);
});