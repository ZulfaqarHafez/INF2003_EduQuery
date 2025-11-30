# EduQuery SG - Singapore School Database System

**INF2003 Database Systems Project**

A comprehensive web application for exploring Singapore schools, subjects, CCAs, programmes, and distinctive programmes with advanced search capabilities, interactive mapping, analytics dashboards, and secure admin management.

![Node.js](https://img.shields.io/badge/Node.js-v14+-339933?style=flat&logo=node.js&logoColor=white)
![Express.js](https://img.shields.io/badge/Express.js-4.x-000000?style=flat&logo=express&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Supabase-4169E1?style=flat&logo=postgresql&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?style=flat&logo=mongodb&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?style=flat&logo=javascript&logoColor=black)
![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat&logo=css3&logoColor=white)
![Leaflet](https://img.shields.io/badge/Leaflet-199900?style=flat&logo=leaflet&logoColor=white)

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Key Features](#key-features)
3. [Tech Stack](#tech-stack)
4. [Database Schema](#database-schema)
5. [Installation & Setup](#installation--setup)
6. [API Reference](#api-reference)
7. [Project Structure](#project-structure)
8. [Technical Implementation](#technical-implementation)
9. [Troubleshooting](#troubleshooting)
10. [Future Enhancements](#future-enhancements)
11. [References](#references)

---

## Project Overview

EduQuery SG is a full-stack database management system designed to provide comprehensive access to Singapore's educational landscape. The system demonstrates advanced database concepts including relational database design, NoSQL integration, RESTful API architecture, JWT authentication, and complex analytical queries.

**Purpose:** To help students, parents, and educators explore and analyze Singapore's schools through an intuitive search interface with powerful filtering, visualization, and comparison capabilities.

**Target Users:**
- Students exploring school options
- Parents researching schools for their children
- Educators analyzing educational data
- Administrators managing school information

---

## Key Features

### Core Functionality

**CRUD Operations**
- Create new school records with comprehensive validation
- Read and search school information with multiple query types
- Update existing school details with real-time synchronization
- Delete schools with cascade deletion of related data
- Admin-only protection for create/update/delete operations

**Search Capabilities**
- Universal search across all database entities
- Category-specific searches (schools, subjects, CCAs, programmes, distinctives)
- Advanced search with 25+ filterable fields including zone, level, programmes, and transportation
- Live search suggestions with partial matching and debouncing
- Real-time result highlighting

**Interactive School Map**
- Singapore-wide school location visualization using Leaflet.js
- Zone-based filtering (North, South, East, West, Central)
- School search with automatic map positioning and zoom
- Geocoded locations using Singapore OneMap API
- Color-coded markers by geographic zone
- Distance-based search from postal code or current location

**School Comparison**
- Side-by-side comparison of multiple schools
- Compare subjects, CCAs, programmes, and distinctive programmes
- Visual representation of differences and similarities

**Analytics Dashboard**
- Schools distribution by zone with statistical breakdowns
- Subject diversity analysis across institutions
- Above-average performance metrics
- CCA participation rates and trends
- Data completeness scoring
- Zone comparison analysis
- Custom analytical queries with aggregate functions

**Authentication System**
- JWT-based authentication for admin functions
- Password hashing with bcrypt (12 rounds)
- Protected admin endpoints for data modification
- Public read-only access for searching and viewing

### Technical Highlights

- **Hybrid Database Architecture**: PostgreSQL for relational data integrity, MongoDB for flexible activity logging
- **Connection Pooling**: Optimized database connections via Supabase Session Pooler
- **OneMap API Integration**: Geocoding and reverse geocoding for location services
- **Activity Logging**: Comprehensive user action tracking for analytics
- **Responsive Design**: Mobile-first UI following modern UX principles
- **Error Handling**: Graceful degradation with informative error messages
- **Real-time Updates**: Immediate data synchronization across views
- **Input Sanitization**: Protection against SQL injection and XSS attacks

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | HTML5, CSS3, Vanilla JavaScript | User interface and interactions |
| **Mapping** | Leaflet.js | Interactive map visualization |
| **Backend** | Node.js, Express.js | API server and routing |
| **Relational DB** | PostgreSQL (Supabase) | Primary data storage with ACID compliance |
| **NoSQL DB** | MongoDB Atlas | Activity logging and flexible schema data |
| **Authentication** | JWT + bcrypt | Secure admin authentication |
| **Geocoding** | Singapore OneMap API | Location services and distance calculations |
| **Version Control** | Git, GitHub | Source code management |

---

## Database Schema

### Entity-Relationship Model

```
Schools (1) ──< (M) School_Subjects >── (M) Subjects
   │
   ├──< (M) School_CCAs >── (M) CCAs
   │
   ├──< (M) School_Programmes >── (M) Programmes
   │
   └──< (M) School_Distinctives >── (M) Distinctive_Programmes
```

### Core Tables

**Schools** (Main Entity)
- `school_id` (PK): Auto-incrementing unique identifier
- `school_name`: School name (unique constraint)
- `address`: Full street address
- `postal_code`: 6-digit Singapore postal code
- `zone_code`: Geographic zone (NORTH, SOUTH, EAST, WEST, CENTRAL)
- `mainlevel_code`: School level (PRIMARY, SECONDARY, JUNIOR COLLEGE, CENTRALISED INSTITUTE)
- `principal_name`: Current principal's name
- `created_at`, `updated_at`: Timestamps

**Reference Tables**
- `Subjects`: Master list of subjects (subject_id, subject_desc)
- `CCAs`: Co-Curricular Activities (cca_id, cca_generic_name, cca_grouping_desc)
- `Programmes`: MOE programmes (programme_id, moe_programme_desc)
- `Distinctive_Programmes`: ALP/LLP programmes (distinctive_id, alp_domain, alp_title, llp_domain1, llp_title)

**Junction Tables** (Many-to-Many Relationships)
- `School_Subjects`: Links schools to subjects
- `School_CCAs`: Links schools to CCAs (includes cca_customized_name, school_section)
- `School_Programmes`: Links schools to MOE programmes
- `School_Distinctives`: Links schools to distinctive programmes

**Users Table** (Authentication)
- `id` (PK): User identifier
- `username`: Unique username
- `password`: bcrypt hashed password
- `is_admin`: Admin privilege flag

### MongoDB Collections

- **activity_logs**: User action tracking with timestamps, action types, and metadata

---

## Installation & Setup

### Prerequisites

- Node.js v14 or higher
- npm (Node Package Manager)
- Supabase account (PostgreSQL hosting)
- MongoDB Atlas account
- OneMap API account (for location services)

### Quick Start

```bash
# 1. Clone repository
git clone <repo-url>
cd INF2003_EduQuery

# 2. Install backend dependencies
cd backend
npm install

# 3. Configure environment variables
# Create .env file in project root (see Environment Variables section)

# 4. Initialize database schema
# Execute schema.sql in Supabase SQL Editor

# 5. Start server
node server.js

# 6. Access application
# Open browser: http://localhost:3000
```

### Environment Variables (.env)

Create a `.env` file in the **project root directory**:

```env
# PostgreSQL (Supabase Session Pooler)
PG_HOST=aws-1-ap-southeast-1.pooler.supabase.com
PG_PORT=5432
PG_DATABASE=postgres
PG_USER=postgres.<project-ref>
PG_PASSWORD=<your-password>

# MongoDB Atlas
MONGO_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net
MONGO_DB=schooldb

# OneMap API (for geocoding)
ONEMAP_EMAIL=<your-onemap-email>
ONEMAP_PASSWORD=<your-onemap-password>

# JWT Secret (for authentication)
JWT_SECRET=<your-secure-secret-key>

# Server
PORT=3000
```

### OneMap API Registration

1. Visit https://www.onemap.gov.sg/apidocs/register
2. Create an account with your email
3. Add credentials to `.env` file
4. Token is automatically managed by the server

### Database Initialization

1. Open Supabase SQL Editor
2. Copy contents of `schema.sql`
3. Execute the script
4. Verify tables with: `\dt` command

---

## API Reference

### Authentication Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/auth/login` | Admin login | Public |
| POST | `/api/auth/logout` | Admin logout | Required |
| GET | `/api/auth/me` | Get current user info | Required |
| PUT | `/api/auth/password` | Change password | Required |

### Schools CRUD Operations

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/schools?name=<query>` | Search schools by name | Public |
| GET | `/api/schools/:id` | Get school by ID | Public |
| POST | `/api/schools` | Create new school | Admin |
| PUT | `/api/schools/:id` | Update school | Admin |
| DELETE | `/api/schools/:id` | Delete school | Admin |

### Query Operations (Read-Only)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/schools/subjects?name=<query>` | Get subjects by school |
| GET | `/api/schools/ccas?name=<query>` | Get CCAs by school |
| GET | `/api/schools/programmes?name=<query>` | Get MOE programmes by school |
| GET | `/api/schools/distinctives?name=<query>` | Get ALP/LLP programmes |

### Universal & Advanced Search

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/search/universal?query=<term>` | Search across all categories |
| POST | `/api/search/advanced` | Advanced multi-field search |
| GET | `/api/search/details/:type/:id` | Get detailed item information |

### Map Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/schools/map?zone=<zone>` | Get schools with coordinates |
| GET | `/api/schools/map-stats` | Get map statistics by zone |
| GET | `/api/schools/nearby` | Find schools near location |

### Analytics Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/analytics/zone-stats` | Zone distribution statistics |
| GET | `/api/analytics/subject-diversity` | Subject diversity analysis |
| GET | `/api/analytics/above-average` | Above-average schools |
| GET | `/api/analytics/cca-participation` | CCA participation rates |
| GET | `/api/analytics/data-completeness` | Data completeness scores |
| GET | `/api/analytics/zone-comparison` | Zone comparison analysis |

### Dropdown Values (Dynamic)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dropdown/types` | Get school types |
| GET | `/api/dropdown/natures` | Get school natures |
| GET | `/api/dropdown/sessions` | Get session codes |
| GET | `/api/dropdown/dgp-codes` | Get DGP codes |
| GET | `/api/dropdown/mother-tongues` | Get mother tongue options |
| GET | `/api/dropdown/cca-groupings` | Get CCA groupings |
| GET | `/api/dropdown/alp-domains` | Get ALP domains |
| GET | `/api/dropdown/llp-domains` | Get LLP domains |

### Test Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/pg-test` | Test PostgreSQL connection |
| GET | `/mongo-test` | Test MongoDB connection |

---

## Project Structure

```
INF2003_EduQuery/
├── backend/
│   ├── server.js              # Express server & all API routes
│   ├── pg-connection.js       # PostgreSQL connection pool
│   ├── mongo-connection.js    # MongoDB connection with caching
│   ├── schema.sql             # Database schema definition
│   ├── analytics-endpoint.js  # Analytics query examples
│   ├── map-endpoint.js        # Map-specific endpoints
│   ├── test.js                # Database connection tests
│   └── package.json           # Node.js dependencies
│
├── frontend/
│   ├── index.html             # Main application interface
│   ├── script.js              # Core client-side logic & CRUD
│   ├── style.css              # Base styling & components
│   ├── map.js                 # Map functionality & geocoding
│   ├── map_style.css          # Map-specific styles
│   ├── analytics.js           # Analytics dashboard logic
│   ├── analytics.css          # Analytics styling
│   ├── advanced_search.js     # Advanced search functionality
│   └── advanced_search.css    # Advanced search styles
│
├── .env                       # Environment variables (root level)
├── .gitignore                 # Git exclusions
└── README.md                  # Project documentation
```

---

## Technical Implementation

### Database Design Decisions

1. **Normalized Schema**: Third Normal Form (3NF) design reduces data redundancy using junction tables for many-to-many relationships
2. **Session Pooler**: Supabase Session Pooler used for IPv4 compatibility and connection optimization
3. **Cascade Deletion**: Foreign key constraints ensure referential integrity when deleting schools
4. **Indexed Columns**: Strategic indexing on frequently queried columns (school_name, zone_code, postal_code)
5. **Activity Logging**: MongoDB selected for flexible schema and high-write performance requirements
6. **Views**: Pre-defined views (v_school_summary, v_zone_statistics) for optimized queries

### API Design Principles

- **RESTful Architecture**: Standard HTTP methods with semantic endpoint naming
- **JSON Data Exchange**: Consistent content-type and response formatting
- **Error Handling**: Appropriate HTTP status codes (200, 400, 401, 404, 500) with descriptive messages
- **Input Validation**: Server-side validation for all user inputs with constraint checking
- **Query Optimization**: Parameterized queries prevent SQL injection and improve performance
- **Authentication**: JWT tokens with 24-hour expiry for admin sessions

### Frontend Architecture

- **No Framework Dependencies**: Pure JavaScript for lightweight, fast-loading interface
- **Modal-Based CRUD**: Non-disruptive user experience with overlay modals
- **Toast Notifications**: Immediate feedback for all user actions
- **Responsive Grid Layout**: CSS Grid and Flexbox for adaptive design
- **Debounced Search**: Performance optimization for real-time search
- **Dynamic Dropdowns**: Options loaded from database for consistency

### Advanced Query Techniques

- **Aggregate Functions**: COUNT, AVG, MIN, MAX for statistical analysis
- **Common Table Expressions (CTEs)**: Complex queries with readable subquery organization
- **Window Functions**: Advanced analytics with OVER clauses
- **String Aggregation**: STRING_AGG for concatenating related data
- **Conditional Logic**: CASE statements for computed fields and categorization
- **Subqueries**: Nested queries for above-average calculations

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `ERR_CONNECTION_REFUSED` | Verify backend server is running with `node server.js` |
| `ENOTFOUND` database error | Use Supabase Session Pooler endpoint instead of direct connection |
| `Invalid credentials` | Check .env file for correct database credentials |
| `OneMap authentication failed` | Verify ONEMAP_EMAIL and ONEMAP_PASSWORD in .env |
| Modal not opening | Clear browser cache and perform hard refresh (Ctrl+F5) |
| Map not loading | Ensure Leaflet.js CDN is accessible and map view is active |
| Geocoding failures | Check OneMap API availability or use fallback coordinates |
| Admin login fails | Ensure Users table exists and admin account is created |
| `401 Unauthorized` on CRUD | Admin login required for create/update/delete operations |

### Testing Database Connections

```bash
# Test PostgreSQL
curl http://localhost:3000/pg-test

# Test MongoDB
curl http://localhost:3000/mongo-test

# Run comprehensive tests
node backend/test.js
```


## References

- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [MongoDB Documentation](https://docs.mongodb.com/)
- [Express.js Guide](https://expressjs.com/)
- [Leaflet.js Documentation](https://leafletjs.com/)
- [Singapore OneMap API](https://www.onemap.gov.sg/docs/)
- [MDN Web Docs](https://developer.mozilla.org/)
- [JWT.io](https://jwt.io/)
- Ministry of Education Singapore - School data sources

---

## License

This project is developed for educational purposes as part of INF2003 Database Systems coursework.

---

**INF2003 Database Systems Project**  
**Institution:** Singapore Institute of Technology  
**Academic Year:** 2024/2025
