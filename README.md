# INF2003_EduQuery

A school database system for exploring subjects, CCAs, MOE programmes, and distinctive programmes across Singapore schools.  
Built using **PostgreSQL (Supabase)**, **MongoDB Atlas**, **Express.js backend**, and **vanilla HTML/CSS/JS frontend**.

---

## Features
- Entity-Relationship Database with 5 main tables and junctions (many-to-many relationships).
- Complex SQL queries for subjects, CCAs, programmes, distinctives.
- API backend (Express.js) connecting frontend to Supabase (Postgres) and MongoDB (NoSQL).
- Simple but clean web UI for searching schools and viewing results.
- Multi-user concurrent access via backend API.


---

## Tech Stack
- **Database (Relational)**: PostgreSQL via Supabase
- **Database (NoSQL)**: MongoDB Atlas
- **Backend**: Node.js + Express
- **Frontend**: HTML, CSS, JavaScript
- **Deployment**: Localhost (can extend to Railway, Render, etc.)

---

## Setup Instructions

### 1. Clone Repo
```bash
git clone <repo-url>
cd EduQuery
```
### 2. Install Backend Dependencies
```bash
cd backend
npm install express pg mongoose dotenv
```
### 3. Environment Variables
Create .env inside backend/:
#### Supabase Postgres
POSTGRES_URI=postgresql://username:password@host:5432/dbname

#### MongoDB Atlas
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net
MONGO_DB=schooldb

### 4. Run Server
```bash
node backend/server.js
```
#### Server runs at: http://localhost:3000
---

# Usage
### Frontend (UI)
Open in your browser after running the server:



Open your app in a browser:

http://localhost:3000/index.html


- Type a **school name** (e.g., `unity`)  
- Choose a **query type** from the dropdown:
  - General Info  
  - Subjects  
  - CCAs  
  - Programmes  
  - Distinctives  
- Results will appear in a table.

---

### 🔹 API Endpoints

#### Schools (Main Entity)

| Action      | Method | Path               | Query / Body |
|-------------|--------|--------------------|--------------|
| Read        | GET    | `/api/schools`     | `?name=<partial school name>` |
| Create      | POST   | `/api/schools`     | JSON body (see example) |
| Update      | PUT    | `/api/schools/:id` | JSON body (fields to change) |
| Delete      | DELETE | `/api/schools/:id` | — |

**Read Example**
```http
GET /api/schools?name=unity
```
**Response** 


[
  {
    "school_id": 123,
    "school_name": "Unity Secondary School",
    "address": "30 Choa Chu Kang St 62",
    "postal_code": "689869",
    "zone_code": "West",
    "mainlevel_code": "Secondary",
    "principal_name": "John Tan"
  }
]


## ✅ Project Progress & To-Do

### Database
- [x] Tables created (Schools, Subjects, CCAs, Programmes, Distinctives, junctions)  
- [x] Data loaded from staging → normalized tables  
- [x] Relationships defined with foreign keys + unique constraints  

---

### Backend API (CRUD Coverage)

#### Schools
- [x] `GET /api/schools?name=...` → search schools  
- [ ] `POST /api/schools` → add new school  
- [ ] `PUT /api/schools/:id` → update school details  
- [ ] `DELETE /api/schools/:id` → remove a school  

#### Subjects
- [x] `GET /api/schools/subjects?name=...` → list subjects of a school  
- [ ] `POST /api/subjects` → add new subject to global subject list  
- [ ] `POST /api/schools/:id/subjects` → link subject to school  
- [ ] `DELETE /api/schools/:id/subjects/:subjectId` → unlink subject  

#### CCAs
- [x] `GET /api/schools/ccas?name=...` → list CCAs of a school  
- [ ] `POST /api/ccas` → add new CCA to global CCA list  
- [ ] `POST /api/schools/:id/ccas` → link CCA to school  
- [ ] `DELETE /api/schools/:id/ccas/:ccaId` → unlink CCA  

#### Programmes
- [x] `GET /api/schools/programmes?name=...` → list programmes of a school  
- [ ] `POST /api/programmes` → add new programme  
- [ ] `POST /api/schools/:id/programmes` → link programme to school  
- [ ] `DELETE /api/schools/:id/programmes/:programmeId` → unlink programme  

#### Distinctives
- [x] `GET /api/schools/distinctives?name=...` → list distinctives of a school  
- [ ] `POST /api/distinctives` → add new distinctive  
- [ ] `POST /api/schools/:id/distinctives` → link distinctive to school  
- [ ] `DELETE /api/schools/:id/distinctives/:distinctiveId` → unlink distinctive  

---

### Frontend UI Checklist

#### General
- [x] Search bar to look up schools  
- [x] Dropdown to pick query type (Info, Subjects, CCAs, Programmes, Distinctives)  
- [x] Table rendering results  
- [ ] Error handling (e.g., show “No results found”)  
- [ ] Success messages (e.g., “School added successfully”)  

#### Schools
- [ ] Form to **add a school** (POST)  
- [ ] Button to **edit school details** (PUT)  
- [ ] Button to **delete school** (DELETE)  

#### Subjects
- [x] View subjects for a school (GET)  
- [ ] Dropdown + button to **assign subject** to school (POST)  
- [ ] Delete icon to **remove subject** from school (DELETE)  

#### CCAs
- [x] View CCAs for a school (GET)  
- [ ] Dropdown + button to **assign CCA** to school (POST)  
- [ ] Delete icon to **remove CCA** from school (DELETE)  

#### Programmes
- [x] View programmes for a school (GET)  
- [ ] Dropdown + button to **assign programme** to school (POST)  
- [ ] Delete icon to **remove programme** from school (DELETE)  

#### Distinctives
- [x] View distinctives for a school (GET)  
- [ ] Dropdown + button to **assign distinctive** to school (POST)  
- [ ] Delete icon to **remove distinctive** (DELETE)  
