// Add this endpoint to your server.js file

// ========== Map Endpoint - Get all schools with coordinates ==========
app.get('/api/schools/map', async (req, res) => {
  try {
    const { zone } = req.query;
    let query, params;
    
    if (zone && zone !== 'all') {
      query = `SELECT school_id, school_name, address, postal_code, zone_code, mainlevel_code, principal_name
               FROM Schools
               WHERE zone_code = $1
               ORDER BY school_name ASC`;
      params = [zone.toUpperCase()];
    } else {
      query = `SELECT school_id, school_name, address, postal_code, zone_code, mainlevel_code, principal_name
               FROM Schools
               ORDER BY school_name ASC`;
      params = [];
    }
    
    const result = await pool.query(query, params);
    
    // Log activity to MongoDB
    logActivity('view_map', { 
      zone: zone || 'all', 
      schools_count: result.rows.length 
    });
    
    res.json({
      success: true,
      count: result.rows.length,
      schools: result.rows
    });
  } catch (err) {
    console.error('Map data error:', err);
    res.status(500).json({ 
      success: false,
      error: err.message 
    });
  }
});

// ========== Map Statistics Endpoint ==========
app.get('/api/schools/map-stats', async (req, res) => {
  try {
    // Get counts by zone
    const zoneQuery = `
      SELECT zone_code, COUNT(*) as count
      FROM Schools
      GROUP BY zone_code
      ORDER BY zone_code
    `;
    
    const zoneResult = await pool.query(zoneQuery);
    
    // Get counts by level
    const levelQuery = `
      SELECT mainlevel_code, COUNT(*) as count
      FROM Schools
      GROUP BY mainlevel_code
      ORDER BY mainlevel_code
    `;
    
    const levelResult = await pool.query(levelQuery);
    
    // Get total count
    const totalQuery = `SELECT COUNT(*) as total FROM Schools`;
    const totalResult = await pool.query(totalQuery);
    
    res.json({
      success: true,
      total: parseInt(totalResult.rows[0].total),
      byZone: zoneResult.rows,
      byLevel: levelResult.rows
    });
  } catch (err) {
    console.error('Map statistics error:', err);
    res.status(500).json({ 
      success: false,
      error: err.message 
    });
  }
});