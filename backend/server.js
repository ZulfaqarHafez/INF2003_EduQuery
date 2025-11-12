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

// Get details for a specific item found in universal search
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
              JSON_BUILD_OBJECT(
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

// ========== POSTAL CODE TO COORDINATES LOOKUP ==========
// Add this helper endpoint for postal code conversion
app.get('/api/postal-code/:postalCode', async (req, res) => {
  try {
    const { postalCode } = req.params;
    
    // Query to find coordinates from raw_general_info using postal code
    const query = `
      SELECT DISTINCT
        postal_code,
        latitude::decimal as latitude,
        longitude::decimal as longitude,
        school_name
      FROM raw_general_info
      WHERE postal_code = $1
        AND latitude IS NOT NULL 
        AND longitude IS NOT NULL
        AND latitude != 'NA'
        AND longitude != 'NA'
      LIMIT 1
    `;
    
    const result = await pool.query(query, [postalCode]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Postal code not found or no coordinates available'
      });
    }
    
    res.json({
      success: true,
      postal_code: postalCode,
      latitude: parseFloat(result.rows[0].latitude),
      longitude: parseFloat(result.rows[0].longitude)
    });
    
  } catch (err) {
    console.error('Postal code lookup error:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// ========== SEARCH BY POSTAL CODE DISTANCE (Using OneMap API and Caching) ==========
const coordinateCache = new Map(); // Cache coordinates to avoid repeated API calls

async function getCoordinatesFromPostal(postalCode) {
  // Check cache first
  if (coordinateCache.has(postalCode)) {
    return coordinateCache.get(postalCode);
  }

  try {
    const oneMapUrl = `https://www.onemap.gov.sg/api/common/elastic/search?searchVal=${postalCode}&returnGeom=Y&getAddrDetails=Y`;
    const response = await fetch(oneMapUrl);
    const data = await response.json();

    if (data.results && data.results.length > 0) {
      const coords = {
        latitude: parseFloat(data.results[0].LATITUDE),
        longitude: parseFloat(data.results[0].LONGITUDE)
      };
      coordinateCache.set(postalCode, coords);
      return coords;
    }
    return null;
  } catch (error) {
    console.error(`Error fetching coordinates for ${postalCode}:`, error.message);
    return null;
  }
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

app.post('/api/schools/search-by-postal-code', async (req, res) => {
  try {
    const { postal_code, radius_km } = req.body;

    console.log('Distance search request:', { postal_code, radius_km });

    if (!postal_code || !radius_km) {
      return res.status(400).json({
        success: false,
        message: 'Postal code and radius are required'
      });
    }

    // Get center coordinates
    const centerCoords = await getCoordinatesFromPostal(postal_code);
    
    if (!centerCoords) {
      return res.status(404).json({
        success: false,
        message: 'Postal code not found. Please enter a valid Singapore postal code.'
      });
    }

    console.log('Center coordinates:', centerCoords);

    // Get all schools
    const schoolsQuery = `
      SELECT 
        s.school_id,
        s.school_name,
        s.address,
        s.postal_code,
        s.zone_code,
        s.mainlevel_code,
        s.principal_name
      FROM Schools s
      WHERE s.postal_code IS NOT NULL
        AND TRIM(s.postal_code) != ''
        AND s.postal_code ~ '^[0-9]{6}$'
    `;

    const schoolsResult = await pool.query(schoolsQuery);
    console.log('Total schools to check:', schoolsResult.rows.length);

    // Process schools in batches to avoid overwhelming the API
    const schoolsWithDistance = [];
    const batchSize = 10;
    
    for (let i = 0; i < schoolsResult.rows.length; i += batchSize) {
      const batch = schoolsResult.rows.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (school) => {
        const schoolCoords = await getCoordinatesFromPostal(school.postal_code);
        
        if (schoolCoords) {
          const distance_km = calculateDistance(
            centerCoords.latitude,
            centerCoords.longitude,
            schoolCoords.latitude,
            schoolCoords.longitude
          );
          
          if (distance_km <= radius_km) {
            return {
              ...school,
              distance_km: Math.round(distance_km * 100) / 100
            };
          }
        }
        return null;
      });
      
      const batchResults = await Promise.all(batchPromises);
      schoolsWithDistance.push(...batchResults.filter(s => s !== null));
      
      // Small delay between batches
      if (i + batchSize < schoolsResult.rows.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    // Sort by distance
    schoolsWithDistance.sort((a, b) => a.distance_km - b.distance_km);

    console.log('Schools within radius:', schoolsWithDistance.length);

    logActivity('search_by_postal_code', {
      postal_code,
      radius_km,
      results_count: schoolsWithDistance.length
    });

    res.json({
      success: true,
      results: schoolsWithDistance,
      search_params: {
        postal_code,
        radius_km,
        center_latitude: centerCoords.latitude,
        center_longitude: centerCoords.longitude
      }
    });

  } catch (err) {
    console.error('Postal code distance search error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to search schools by distance',
      message: err.message
    });
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

// ========== ADVANCED SEARCH ENDPOINT ==========
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