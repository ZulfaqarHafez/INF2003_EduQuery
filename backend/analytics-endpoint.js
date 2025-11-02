// ========== 1. Schools by Zone with Statistics ==========
// Demonstrates: GROUP BY, COUNT, aggregate functions
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
    
    // Log to MongoDB
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

// ========== 2. Schools with Subject Count (Nested Query with GROUP BY) ==========
// Demonstrates: Subquery, LEFT JOIN, GROUP BY, aggregate functions
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

// ========== 3. Schools Offering More Subjects Than Average (Nested Query) ==========
// Demonstrates: Subquery in WHERE, aggregate comparison
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

// ========== 4. CCA Participation Analysis ==========
// Demonstrates: Multiple JOINs, GROUP BY, HAVING, aggregate functions
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

// ========== 5. Programme Distribution by Level and Zone ==========
// Demonstrates: Multiple GROUP BY columns, GROUPING SETS concept
app.get('/api/analytics/programme-distribution', async (req, res) => {
  try {
    const query = `
      SELECT 
        s.mainlevel_code,
        s.zone_code,
        COUNT(DISTINCT s.school_id) as school_count,
        COUNT(DISTINCT sp.programme_id) as unique_programmes,
        COUNT(sp.programme_id) as total_programme_offerings
      FROM Schools s
      LEFT JOIN School_Programmes sp ON s.school_id = sp.school_id
      GROUP BY s.mainlevel_code, s.zone_code
      ORDER BY s.mainlevel_code, school_count DESC
    `;
    
    const result = await pool.query(query);
    
    logActivity('view_programme_distribution', { 
      combinations: result.rows.length 
    });
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (err) {
    console.error('Programme distribution error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ========== 6. Top Schools by Data Completeness ==========
// Demonstrates: CASE, multiple JOINs, calculated fields, ordering
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
    
    // Calculate summary statistics
    const summary = {
      total_analyzed: result.rows.length,
      complete_schools: result.rows.filter(r => r.completeness_status === 'Complete').length,
      good_schools: result.rows.filter(r => r.completeness_status === 'Good').length,
      fair_schools: result.rows.filter(r => r.completeness_status === 'Fair').length,
      incomplete_schools: result.rows.filter(r => r.completeness_status === 'Incomplete').length,
      avg_completeness: result.rows.length > 0
        ? (result.rows.reduce((sum, row) => sum + parseInt(row.completeness_score), 0) / result.rows.length).toFixed(2)
        : 0
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

// ========== 7. Zone Comparison Analysis ==========
// Demonstrates: Multiple aggregates, complex grouping
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

// ========== 8. Schools with Rare Subjects/CCAs (Nested Query) ==========
// Demonstrates: Nested subquery, IN clause, complex filtering
app.get('/api/analytics/rare-offerings', async (req, res) => {
  try {
    const { type = 'subjects' } = req.query; // 'subjects' or 'ccas'
    
    let query;
    if (type === 'subjects') {
      query = `
        WITH rare_subjects AS (
          SELECT subject_id
          FROM School_Subjects
          GROUP BY subject_id
          HAVING COUNT(DISTINCT school_id) <= 3
        )
        SELECT 
          s.school_name,
          s.zone_code,
          subj.subject_desc,
          (
            SELECT COUNT(DISTINCT school_id)
            FROM School_Subjects
            WHERE subject_id = ss.subject_id
          ) as schools_offering
        FROM Schools s
        JOIN School_Subjects ss ON s.school_id = ss.school_id
        JOIN Subjects subj ON ss.subject_id = subj.subject_id
        WHERE ss.subject_id IN (SELECT subject_id FROM rare_subjects)
        ORDER BY schools_offering ASC, s.school_name
      `;
    } else {
      query = `
        WITH rare_ccas AS (
          SELECT cca_id
          FROM School_CCAs
          GROUP BY cca_id
          HAVING COUNT(DISTINCT school_id) <= 3
        )
        SELECT 
          s.school_name,
          s.zone_code,
          c.cca_generic_name,
          (
            SELECT COUNT(DISTINCT school_id)
            FROM School_CCAs
            WHERE cca_id = sc.cca_id
          ) as schools_offering
        FROM Schools s
        JOIN School_CCAs sc ON s.school_id = sc.school_id
        JOIN CCAs c ON sc.cca_id = c.cca_id
        WHERE sc.cca_id IN (SELECT cca_id FROM rare_ccas)
        ORDER BY schools_offering ASC, s.school_name
      `;
    }
    
    const result = await pool.query(query);
    
    logActivity('view_rare_offerings', { 
      type: type,
      count: result.rows.length 
    });
    
    res.json({
      success: true,
      data: result.rows,
      type: type
    });
  } catch (err) {
    console.error('Rare offerings error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ========== 9. Monthly Activity Trends (MongoDB Aggregation) ==========
// Demonstrates: MongoDB aggregation pipeline, date grouping
app.get('/api/analytics/activity-trends', async (req, res) => {
  try {
    const db = await connectMongo();
    
    const trends = await db.collection('activity_logs').aggregate([
      {
        $group: {
          _id: {
            year: { $year: '$timestamp' },
            month: { $month: '$timestamp' },
            action: '$action'
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': -1, '_id.month': -1, count: -1 }
      },
      {
        $limit: 50
      }
    ]).toArray();
    
    res.json({
      success: true,
      data: trends
    });
  } catch (err) {
    console.error('Activity trends error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ========== 10. Search Pattern Analysis (MongoDB Aggregation) ==========
// Demonstrates: MongoDB text analysis, grouping, sorting
app.get('/api/analytics/search-patterns', async (req, res) => {
  try {
    const db = await connectMongo();
    
    const patterns = await db.collection('activity_logs').aggregate([
      {
        $match: { 
          action: { $in: ['search_schools', 'search_subjects', 'search_ccas', 'search_programmes'] }
        }
      },
      {
        $group: {
          _id: {
            action: '$action',
            query: '$data.query'
          },
          search_count: { $sum: 1 },
          avg_results: { $avg: '$data.results_count' },
          last_searched: { $max: '$timestamp' }
        }
      },
      {
        $sort: { search_count: -1 }
      },
      {
        $limit: 20
      }
    ]).toArray();
    
    res.json({
      success: true,
      data: patterns
    });
  } catch (err) {
    console.error('Search patterns error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ========== EXPORT NOTE ==========
// Don't forget to add these to your server.js:
// 1. Copy all these endpoints into your server.js
// 2. Make sure pool and connectMongo are available
// 3. Make sure logActivity function is defined