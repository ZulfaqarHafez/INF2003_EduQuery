-- ========================================
-- EDUQUERY SG DATABASE SCHEMA
-- ========================================
-- PostgreSQL Database Schema for Singapore Schools Management System
-- INF2003 Database Systems Project
-- 
-- This schema implements a normalized relational database design
-- for managing Singapore schools data including subjects, CCAs,
-- programmes, and distinctive programmes.
--
-- Database: PostgreSQL (via Supabase)
-- Companion NoSQL: MongoDB Atlas (for activity logging)
-- ========================================

-- ========================================
-- DATABASE SETUP
-- ========================================

-- Drop existing tables (if recreating schema)
-- Uncomment these lines if you need to reset the database
-- DROP TABLE IF EXISTS School_Distinctives CASCADE;
-- DROP TABLE IF EXISTS School_Programmes CASCADE;
-- DROP TABLE IF EXISTS School_CCAs CASCADE;
-- DROP TABLE IF EXISTS School_Subjects CASCADE;
-- DROP TABLE IF EXISTS Distinctive_Programmes CASCADE;
-- DROP TABLE IF EXISTS Programmes CASCADE;
-- DROP TABLE IF EXISTS CCAs CASCADE;
-- DROP TABLE IF EXISTS Subjects CASCADE;
-- DROP TABLE IF EXISTS Schools CASCADE;

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm; -- For pattern matching in LIKE queries

-- ========================================
-- CORE TABLES
-- ========================================

-- ========================================
-- SCHOOLS TABLE (Main Entity)
-- ========================================
CREATE TABLE IF NOT EXISTS Schools (
    school_id SERIAL PRIMARY KEY,
    school_name VARCHAR(200) NOT NULL,
    address VARCHAR(300) NOT NULL,
    postal_code CHAR(6) NOT NULL,
    zone_code VARCHAR(20) NOT NULL,
    mainlevel_code VARCHAR(50) NOT NULL,
    principal_name VARCHAR(150) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT chk_postal_code CHECK (postal_code ~ '^[0-9]{6}$'),
    CONSTRAINT chk_zone_code CHECK (zone_code IN ('NORTH', 'SOUTH', 'EAST', 'WEST', 'CENTRAL')),
    CONSTRAINT chk_mainlevel CHECK (mainlevel_code IN ('PRIMARY', 'SECONDARY', 'JUNIOR COLLEGE', 'CENTRALISED INSTITUTE')),
    CONSTRAINT uq_school_name UNIQUE (school_name)
);

-- Add comments for documentation
COMMENT ON TABLE Schools IS 'Main schools table containing basic school information';
COMMENT ON COLUMN Schools.school_id IS 'Primary key, auto-incrementing unique identifier';
COMMENT ON COLUMN Schools.postal_code IS 'Singapore postal code, must be exactly 6 digits';
COMMENT ON COLUMN Schools.zone_code IS 'Geographic zone: NORTH, SOUTH, EAST, WEST, or CENTRAL';
COMMENT ON COLUMN Schools.mainlevel_code IS 'School level: PRIMARY, SECONDARY, JUNIOR COLLEGE, or CENTRALISED INSTITUTE';

-- ========================================
-- SUBJECTS TABLE
-- ========================================
CREATE TABLE IF NOT EXISTS Subjects (
    subject_id SERIAL PRIMARY KEY,
    subject_desc VARCHAR(200) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT uq_subject_desc UNIQUE (subject_desc)
);

COMMENT ON TABLE Subjects IS 'Master list of all subjects offered across schools';
COMMENT ON COLUMN Subjects.subject_desc IS 'Subject name/description, must be unique';

-- ========================================
-- CCAS TABLE (Co-Curricular Activities)
-- ========================================
CREATE TABLE IF NOT EXISTS CCAs (
    cca_id SERIAL PRIMARY KEY,
    cca_generic_name VARCHAR(200) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT uq_cca_name UNIQUE (cca_generic_name)
);

COMMENT ON TABLE CCAs IS 'Master list of Co-Curricular Activities (CCAs)';
COMMENT ON COLUMN CCAs.cca_generic_name IS 'Generic CCA name, schools may customize this';

-- ========================================
-- PROGRAMMES TABLE
-- ========================================
CREATE TABLE IF NOT EXISTS Programmes (
    programme_id SERIAL PRIMARY KEY,
    moe_programme_desc VARCHAR(300) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT uq_programme_desc UNIQUE (moe_programme_desc)
);

COMMENT ON TABLE Programmes IS 'Master list of MOE programmes offered by schools';
COMMENT ON COLUMN Programmes.moe_programme_desc IS 'Ministry of Education programme description';

-- ========================================
-- DISTINCTIVE_PROGRAMMES TABLE (ALP/LLP)
-- ========================================
CREATE TABLE IF NOT EXISTS Distinctive_Programmes (
    distinctive_id SERIAL PRIMARY KEY,
    alp_domain VARCHAR(200),
    alp_title VARCHAR(300),
    llp_domain1 VARCHAR(200),
    llp_title VARCHAR(300),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- At least one programme must be specified
    CONSTRAINT chk_at_least_one_programme 
        CHECK (alp_domain IS NOT NULL OR llp_domain1 IS NOT NULL)
);

COMMENT ON TABLE Distinctive_Programmes IS 'Applied Learning Programme (ALP) and Learning for Life Programme (LLP)';
COMMENT ON COLUMN Distinctive_Programmes.alp_domain IS 'Applied Learning Programme domain';
COMMENT ON COLUMN Distinctive_Programmes.llp_domain1 IS 'Learning for Life Programme domain';

-- ========================================
-- JUNCTION TABLES (Many-to-Many Relationships)
-- ========================================

-- ========================================
-- SCHOOL_SUBJECTS (Schools ↔ Subjects)
-- ========================================
CREATE TABLE IF NOT EXISTS School_Subjects (
    school_id INTEGER NOT NULL,
    subject_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Primary Key (Composite)
    PRIMARY KEY (school_id, subject_id),
    
    -- Foreign Keys
    CONSTRAINT fk_school_subjects_school 
        FOREIGN KEY (school_id) 
        REFERENCES Schools(school_id) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE,
    
    CONSTRAINT fk_school_subjects_subject 
        FOREIGN KEY (subject_id) 
        REFERENCES Subjects(subject_id) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE
);

COMMENT ON TABLE School_Subjects IS 'Junction table linking schools to subjects they offer';
COMMENT ON COLUMN School_Subjects.school_id IS 'References Schools table';
COMMENT ON COLUMN School_Subjects.subject_id IS 'References Subjects table';

-- ========================================
-- SCHOOL_CCAS (Schools ↔ CCAs)
-- ========================================
CREATE TABLE IF NOT EXISTS School_CCAs (
    school_id INTEGER NOT NULL,
    cca_id INTEGER NOT NULL,
    cca_customized_name VARCHAR(200),
    school_section VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Primary Key (Composite)
    PRIMARY KEY (school_id, cca_id),
    
    -- Foreign Keys
    CONSTRAINT fk_school_ccas_school 
        FOREIGN KEY (school_id) 
        REFERENCES Schools(school_id) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE,
    
    CONSTRAINT fk_school_ccas_cca 
        FOREIGN KEY (cca_id) 
        REFERENCES CCAs(cca_id) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE,
    
    -- Constraints
    CONSTRAINT chk_school_section 
        CHECK (school_section IN ('PRIMARY', 'SECONDARY', 'BOTH', NULL))
);

COMMENT ON TABLE School_CCAs IS 'Junction table linking schools to CCAs they offer';
COMMENT ON COLUMN School_CCAs.cca_customized_name IS 'School-specific customization of CCA name';
COMMENT ON COLUMN School_CCAs.school_section IS 'Which section offers this CCA: PRIMARY, SECONDARY, or BOTH';

-- ========================================
-- SCHOOL_PROGRAMMES (Schools ↔ Programmes)
-- ========================================
CREATE TABLE IF NOT EXISTS School_Programmes (
    school_id INTEGER NOT NULL,
    programme_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Primary Key (Composite)
    PRIMARY KEY (school_id, programme_id),
    
    -- Foreign Keys
    CONSTRAINT fk_school_programmes_school 
        FOREIGN KEY (school_id) 
        REFERENCES Schools(school_id) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE,
    
    CONSTRAINT fk_school_programmes_programme 
        FOREIGN KEY (programme_id) 
        REFERENCES Programmes(programme_id) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE
);

COMMENT ON TABLE School_Programmes IS 'Junction table linking schools to programmes they offer';

-- ========================================
-- SCHOOL_DISTINCTIVES (Schools ↔ Distinctive Programmes)
-- ========================================
CREATE TABLE IF NOT EXISTS School_Distinctives (
    school_id INTEGER NOT NULL,
    distinctive_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Primary Key (Composite)
    PRIMARY KEY (school_id, distinctive_id),
    
    -- Foreign Keys
    CONSTRAINT fk_school_distinctives_school 
        FOREIGN KEY (school_id) 
        REFERENCES Schools(school_id) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE,
    
    CONSTRAINT fk_school_distinctives_distinctive 
        FOREIGN KEY (distinctive_id) 
        REFERENCES Distinctive_Programmes(distinctive_id) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE
);

COMMENT ON TABLE School_Distinctives IS 'Junction table linking schools to distinctive programmes (ALP/LLP)';

-- ========================================
-- TRIGGERS FOR AUTOMATIC TIMESTAMP UPDATES
-- ========================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for Schools table
CREATE TRIGGER update_schools_updated_at
BEFORE UPDATE ON Schools
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

COMMENT ON FUNCTION update_updated_at_column() IS 'Automatically updates the updated_at timestamp on row modification';

-- ========================================
-- VIEWS FOR COMMON QUERIES
-- ========================================

-- View: Complete school information with counts
CREATE OR REPLACE VIEW v_school_summary AS
SELECT 
    s.school_id,
    s.school_name,
    s.address,
    s.postal_code,
    s.zone_code,
    s.mainlevel_code,
    s.principal_name,
    COUNT(DISTINCT ss.subject_id) as subject_count,
    COUNT(DISTINCT sc.cca_id) as cca_count,
    COUNT(DISTINCT sp.programme_id) as programme_count,
    COUNT(DISTINCT sd.distinctive_id) as distinctive_count,
    s.created_at,
    s.updated_at
FROM Schools s
LEFT JOIN School_Subjects ss ON s.school_id = ss.school_id
LEFT JOIN School_CCAs sc ON s.school_id = sc.school_id
LEFT JOIN School_Programmes sp ON s.school_id = sp.school_id
LEFT JOIN School_Distinctives sd ON s.school_id = sd.school_id
GROUP BY s.school_id, s.school_name, s.address, s.postal_code, 
         s.zone_code, s.mainlevel_code, s.principal_name, 
         s.created_at, s.updated_at;

COMMENT ON VIEW v_school_summary IS 'Complete school information with counts of subjects, CCAs, programmes, and distinctives';

-- View: Zone statistics
CREATE OR REPLACE VIEW v_zone_statistics AS
SELECT 
    zone_code,
    COUNT(*) as total_schools,
    COUNT(DISTINCT mainlevel_code) as school_types,
    COUNT(CASE WHEN mainlevel_code = 'PRIMARY' THEN 1 END) as primary_schools,
    COUNT(CASE WHEN mainlevel_code = 'SECONDARY' THEN 1 END) as secondary_schools,
    COUNT(CASE WHEN mainlevel_code = 'JUNIOR COLLEGE' THEN 1 END) as junior_colleges,
    COUNT(CASE WHEN mainlevel_code = 'CENTRALISED INSTITUTE' THEN 1 END) as centralised_institutes
FROM Schools
GROUP BY zone_code
ORDER BY total_schools DESC;

COMMENT ON VIEW v_zone_statistics IS 'Aggregated statistics for each geographic zone';

-- ========================================
-- SAMPLE DATA (Optional - for testing)
-- ========================================

-- Insert sample schools
INSERT INTO Schools (school_name, address, postal_code, zone_code, mainlevel_code, principal_name)
VALUES 
    ('Sample Primary School', '123 Main Street', '123456', 'CENTRAL', 'PRIMARY', 'Mrs. Lee Mei Ling'),
    ('Example Secondary School', '456 Oak Avenue', '234567', 'NORTH', 'SECONDARY', 'Mr. Tan Wei Ming'),
    ('Test Junior College', '789 Pine Road', '345678', 'EAST', 'JUNIOR COLLEGE', 'Dr. Siti Nurhaliza')
ON CONFLICT (school_name) DO NOTHING;

-- Insert sample subjects
INSERT INTO Subjects (subject_desc)
VALUES 
    ('Mathematics'),
    ('English Language'),
    ('Science'),
    ('Chinese Language'),
    ('Malay Language'),
    ('Tamil Language')
ON CONFLICT (subject_desc) DO NOTHING;

-- Insert sample CCAs
INSERT INTO CCAs (cca_generic_name)
VALUES 
    ('Basketball'),
    ('Football'),
    ('Choir'),
    ('Drama Club'),
    ('Robotics Club')
ON CONFLICT (cca_generic_name) DO NOTHING;

-- Insert sample programmes
INSERT INTO Programmes (moe_programme_desc)
VALUES 
    ('Learning for Life Programme'),
    ('Applied Learning Programme'),
    ('Special Assistance Plan')
ON CONFLICT (moe_programme_desc) DO NOTHING;

-- ========================================
-- DATABASE STATISTICS
-- ========================================

-- Query to check table row counts
-- SELECT 
--     schemaname,
--     tablename,
--     pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
--     (SELECT COUNT(*) FROM Schools) as schools_count,
--     (SELECT COUNT(*) FROM Subjects) as subjects_count,
--     (SELECT COUNT(*) FROM CCAs) as ccas_count,
--     (SELECT COUNT(*) FROM Programmes) as programmes_count
-- FROM pg_tables
-- WHERE schemaname = 'public'
-- LIMIT 1;

-- ========================================
-- ER DIAGRAM REPRESENTATION (Text Format)
-- ========================================

/*
ENTITY-RELATIONSHIP DIAGRAM:

┌─────────────────┐
│    Schools      │ 1
│─────────────────│
│ PK school_id    │───┐
│    school_name  │   │
│    address      │   │ N
│    postal_code  │   │ ┌──────────────────┐
│    zone_code    │   ├─│ School_Subjects  │
│    mainlevel    │   │ │──────────────────│
│    principal    │   │ │ PK,FK school_id  │
└─────────────────┘   │ │ PK,FK subject_id │
         │            │ └──────────────────┘
         │            │          │
         │ N          │          │ N
         │            │          │
         │            │ ┌─────────────────┐
         │            │ │    Subjects     │ 1
         │            │ │─────────────────│
         │            │ │ PK subject_id   │
         │            │ │    subject_desc │
         │            │ └─────────────────┘
         │            │
         │            │
         │            │ ┌──────────────────┐
         │            ├─│   School_CCAs    │
         │            │ │──────────────────│
         │            │ │ PK,FK school_id  │
         │            │ │ PK,FK cca_id     │
         │            │ │  cca_custom_name │
         │            │ │  school_section  │
         │            │ └──────────────────┘
         │            │          │
         │            │          │ N
         │            │          │
         │            │ ┌─────────────────┐
         │            │ │      CCAs       │ 1
         │            │ │─────────────────│
         │            │ │ PK cca_id       │
         │            │ │  cca_generic_nm │
         │            │ └─────────────────┘
         │            │
         │            │
         │            │ ┌──────────────────────┐
         │            ├─│ School_Programmes    │
         │            │ │──────────────────────│
         │            │ │ PK,FK school_id      │
         │            │ │ PK,FK programme_id   │
         │            │ └──────────────────────┘
         │            │          │
         │            │          │ N
         │            │          │
         │            │ ┌──────────────────────┐
         │            │ │    Programmes        │ 1
         │            │ │──────────────────────│
         │            │ │ PK programme_id      │
         │            │ │  moe_programme_desc  │
         │            │ └──────────────────────┘
         │            │
         │            │
         │            │ ┌──────────────────────────┐
         │            └─│  School_Distinctives     │
         │              │──────────────────────────│
         │              │ PK,FK school_id          │
         │              │ PK,FK distinctive_id     │
         │              └──────────────────────────┘
         │                       │
         │                       │ N
         │                       │
         │              ┌──────────────────────────┐
         └──────────────│ Distinctive_Programmes   │ 1
                        │──────────────────────────│
                        │ PK distinctive_id        │
                        │    alp_domain            │
                        │    alp_title             │
                        │    llp_domain1           │
                        │    llp_title             │
                        └──────────────────────────┘

RELATIONSHIPS:
- Schools 1:N School_Subjects N:1 Subjects
- Schools 1:N School_CCAs N:1 CCAs
- Schools 1:N School_Programmes N:1 Programmes
- Schools 1:N School_Distinctives N:1 Distinctive_Programmes

All relationships implement CASCADE on DELETE and UPDATE
*/

-- ========================================
-- EXECUTION NOTES
-- ========================================

/*
TO CREATE THIS SCHEMA:

1. In Supabase SQL Editor:
   - Copy and paste this entire file
   - Execute it

2. Via psql command line:
   psql -h your-host -U your-user -d your-database -f schema.sql

3. Verify creation:
   \dt  -- List all tables
   \dv  -- List all views
   \d Schools  -- Describe Schools table

4. Check constraints:
   SELECT 
     tc.table_name, 
     tc.constraint_name, 
     tc.constraint_type 
   FROM information_schema.table_constraints tc
   WHERE tc.table_schema = 'public'
   ORDER BY tc.table_name, tc.constraint_type;
*/

-- ========================================
-- END OF SCHEMA
-- ========================================