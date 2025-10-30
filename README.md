# EduQuery SG - Singapore School Database System

**INF2003 Database Systems Project**

A comprehensive web application for exploring Singapore schools, subjects, CCAs, programmes, and distinctive programmes.

[![Node.js](https://img.shields.io/badge/Node.js-v14+-green.svg)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Supabase-blue.svg)](https://supabase.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-green.svg)](https://www.mongodb.com/)

</div>

---

## Project Overview

EduQuery is a full-stack database management system that demonstrates:
- **Relational Database Design** (PostgreSQL with normalized schema)
- **NoSQL Integration** (MongoDB for activity logging)
- **RESTful API** (Express.js backend)
- **Modern Web UI** (Responsive HTML/CSS/JS frontend)
- **Full CRUD Operations** (Create, Read, Update, Delete)

**Purpose:** Help students, parents, and educators explore Singapore's educational landscape with an intuitive search interface.

---

## Key Features

### Database Operations
- **Create** - Add new schools with validation
- **Read** - Search and query school information
- **Update** - Edit school details
- **Delete** - Remove schools with cascade deletion

### Query Types
- General school information
- Subjects offered
- Co-Curricular Activities (CCAs)
- MOE Programmes
- Distinctive Programmes (ALP/LLP)

### Technical Highlights
- **Hybrid Database Architecture** - PostgreSQL for relational data, MongoDB for analytics
- **Connection Pooling** - Optimized database connections via Supabase Session Pooler
- **Activity Logging** - All user actions tracked in MongoDB
- **Responsive Design** - Mobile-first UI following modern UX best practices
- **Error Handling** - Graceful error messages and validation

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | HTML5, CSS3, Vanilla JavaScript |
| **Backend** | Node.js, Express.js |
| **Relational DB** | PostgreSQL (Supabase) |
| **NoSQL DB** | MongoDB Atlas |
| **API** | RESTful with JSON responses |

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
- school_id (PK), school_name, address, postal_code, zone_code, mainlevel_code, principal_name

**Junction Tables** (Many-to-Many Relationships)
- School_Subjects, School_CCAs, School_Programmes, School_Distinctives

**Reference Tables**
- Subjects, CCAs, Programmes, Distinctive_Programmes

### MongoDB Collections
- **activity_logs** - User action tracking for analytics

---

## Installation & Setup

### Prerequisites
- Node.js v14+
- Supabase account (PostgreSQL)
- MongoDB Atlas account

### Quick Start

```bash
# 1. Clone repository
git clone <repo-url>
cd INF2003_EduQuery

# 2. Install dependencies
cd backend
npm install

# 3. Configure environment variables
# Create .env file in project root with database credentials

# 4. Start server
node backend/server.js

# 5. Access application
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

# Server
PORT=3000
```

---

## API Endpoints

### CRUD Operations - Schools

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/schools?name=<query>` | Search schools |
| POST | `/api/schools` | Create new school |
| PUT | `/api/schools/:id` | Update school |
| DELETE | `/api/schools/:id` | Delete school |

### Query Operations (Read-Only)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/schools/subjects?name=<query>` | Get school subjects |
| GET | `/api/schools/ccas?name=<query>` | Get school CCAs |
| GET | `/api/schools/programmes?name=<query>` | Get school programmes |
| GET | `/api/schools/distinctives?name=<query>` | Get distinctive programmes |

### Analytics (MongoDB)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/analytics/logs` | Get activity logs |
| GET | `/api/analytics/popular` | Get popular searches |

**Example Request:**
```bash
curl "http://localhost:3000/api/schools?name=raffles"
```

**Example Response:**
```json
[
  {
    "school_id": 1,
    "school_name": "Raffles Institution",
    "address": "1 Raffles Institution Lane",
    "postal_code": "575954",
    "zone_code": "NORTH",
    "mainlevel_code": "JUNIOR COLLEGE",
    "principal_name": "Mr. John Tan"
  }
]
```

---

## Usage

### Searching Schools
1. Enter school name in search bar (partial match supported)
2. Select query type from dropdown
3. Click "Search" or press Enter
4. View results in formatted table

### Managing Schools
1. Navigate to "Manage" tab
2. Click "Add New School" button
3. Fill in all required fields
4. Click "Save School"
5. Use Edit/Delete buttons in results table

---

## Project Structure

```
INF2003_EduQuery/
├── backend/
│   ├── server.js              # Express server & API routes
│   ├── pg-connection.js       # PostgreSQL connection pool
│   ├── mongo-connection.js    # MongoDB connection
│   ├── test.js                # Database tests
│   └── package.json           # Dependencies
│
├── frontend/
│   ├── index.html             # Main UI
│   ├── script.js              # Client-side logic
│   └── style.css              # Responsive styling
│
├── .env                       # Environment variables (root level)
├── .gitignore
└── README.md
```

---

## Technical Implementation

### Database Design Decisions

1. **Normalized Schema** - Reduced redundancy using junction tables for many-to-many relationships
2. **Session Pooler** - Used Supabase Session Pooler for IPv4 compatibility instead of direct connection
3. **Cascade Deletion** - Foreign key relationships properly handle deletion of schools and related data
4. **Activity Logging** - MongoDB used for flexible schema and high-write performance

### API Design

- **RESTful Principles** - Standard HTTP methods (GET, POST, PUT, DELETE)
- **JSON Format** - Consistent data exchange format
- **Error Handling** - Appropriate HTTP status codes and error messages
- **Validation** - Server-side validation for all inputs

### Frontend Architecture

- **Vanilla JavaScript** - No framework dependencies
- **Modal-Based CRUD** - Non-disruptive user experience following UX best practices
- **Toast Notifications** - Immediate user feedback for all operations
- **Responsive Design** - Mobile-first approach using CSS Grid and Flexbox

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `ERR_CONNECTION_REFUSED` | Ensure backend server is running (`node server.js`) |
| `ENOTFOUND` database error | Use Session Pooler endpoint, not direct connection |
| `Invalid API key` | Verify complete Supabase anon key in .env |
| Modal doesn't open | Clear browser cache and hard refresh (Ctrl+F5) |

---

## Project Achievements

### Database Requirements
- [x] Relational database design with normalization
- [x] Many-to-many relationships using junction tables
- [x] Complex SQL queries with JOINs
- [x] NoSQL integration for analytics

### Application Requirements
- [x] Full CRUD operations on main entity (Schools)
- [x] RESTful API with proper HTTP methods
- [x] Input validation and error handling
- [x] Modern, responsive user interface
- [x] Activity logging and analytics

### Technical Excellence
- [x] Connection pooling for performance
- [x] Environment-based configuration
- [x] SQL injection prevention (parameterized queries)
- [x] Graceful error handling
- [x] Mobile-responsive design

---

## Team

## Fill in later

**Course:** INF2003 Database Systems  
**Institution:** [Your University]  
**Semester:** [Semester Year]

---

## References

- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [MongoDB Documentation](https://docs.mongodb.com/)
- [Express.js Guide](https://expressjs.com/)
- [MDN Web Docs](https://developer.mozilla.org/)
- MOE Singapore - School data sources

---

## License

This project is for educational purposes as part of INF2003 Database Systems coursework.

---

**Made for INF2003 Database Systems**

</div>
