const express = require('express');
const { Pool } = require('pg');
const multer = require('multer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Database ──────────────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS submissions (
      id            SERIAL PRIMARY KEY,
      ref_number    VARCHAR(20) UNIQUE,
      full_name     VARCHAR(255),
      date_of_birth VARCHAR(20),
      nationality   VARCHAR(100),
      passport_number VARCHAR(50),
      marital_status  VARCHAR(20),
      dependents    VARCHAR(10),
      address       TEXT,
      country       VARCHAR(100),
      phone         VARCHAR(30),
      email         VARCHAR(255),
      bp_rating     VARCHAR(30),
      rating_reason TEXT,
      girls_talked_to VARCHAR(20),
      cortisol_reason TEXT,
      age_score     INTEGER DEFAULT 0,
      foid_score    INTEGER DEFAULT 0,
      lang_score    INTEGER DEFAULT 0,
      job_score     INTEGER DEFAULT 0,
      total_score   INTEGER DEFAULT 0,
      verdict       TEXT,
      photo_data    TEXT,
      created_at    TIMESTAMP DEFAULT NOW()
    )
  `);
  console.log('Database ready.');
}

// ── Middleware ────────────────────────────────────────────────────────────────
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB
  fileFilter: (_, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Routes ────────────────────────────────────────────────────────────────────

// Submit application
app.post('/api/submit', upload.single('photo'), async (req, res) => {
  try {
    const {
      ref_number, full_name, date_of_birth, nationality, passport_number,
      marital_status, dependents, address, country, phone, email,
      bp_rating, rating_reason, girls_talked_to, cortisol_reason,
      age_score, foid_score, lang_score, job_score, total_score, verdict,
    } = req.body;

    let photoData = null;
    if (req.file) {
      const b64 = req.file.buffer.toString('base64');
      photoData = `data:${req.file.mimetype};base64,${b64}`;
    }

    await pool.query(`
      INSERT INTO submissions (
        ref_number, full_name, date_of_birth, nationality, passport_number,
        marital_status, dependents, address, country, phone, email,
        bp_rating, rating_reason, girls_talked_to, cortisol_reason,
        age_score, foid_score, lang_score, job_score, total_score, verdict, photo_data
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
      ON CONFLICT (ref_number) DO UPDATE SET
        full_name=EXCLUDED.full_name, date_of_birth=EXCLUDED.date_of_birth,
        nationality=EXCLUDED.nationality, passport_number=EXCLUDED.passport_number,
        marital_status=EXCLUDED.marital_status, dependents=EXCLUDED.dependents,
        address=EXCLUDED.address, country=EXCLUDED.country, phone=EXCLUDED.phone,
        email=EXCLUDED.email, bp_rating=EXCLUDED.bp_rating,
        rating_reason=EXCLUDED.rating_reason, girls_talked_to=EXCLUDED.girls_talked_to,
        cortisol_reason=EXCLUDED.cortisol_reason, age_score=EXCLUDED.age_score,
        foid_score=EXCLUDED.foid_score, lang_score=EXCLUDED.lang_score,
        job_score=EXCLUDED.job_score, total_score=EXCLUDED.total_score,
        verdict=EXCLUDED.verdict, photo_data=EXCLUDED.photo_data
    `, [
      ref_number, full_name, date_of_birth, nationality, passport_number,
      marital_status, dependents, address, country, phone, email,
      bp_rating, rating_reason, girls_talked_to, cortisol_reason,
      parseInt(age_score) || 0, parseInt(foid_score) || 0,
      parseInt(lang_score) || 0, parseInt(job_score) || 0,
      parseInt(total_score) || 0, verdict, photoData,
    ]);

    res.json({ success: true });
  } catch (err) {
    console.error('Submit error:', err);
    res.status(500).json({ error: 'Submission failed. Please try again.' });
  }
});

// Leaderboard
app.get('/api/results', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, ref_number, full_name, nationality, bp_rating,
             total_score, verdict, photo_data, created_at
      FROM submissions
      ORDER BY total_score DESC, created_at ASC
      LIMIT 200
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Results error:', err);
    res.status(500).json({ error: 'Could not fetch results.' });
  }
});

// Stats endpoint
app.get('/api/stats', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) AS total,
        ROUND(AVG(total_score), 1) AS avg_score,
        MAX(total_score) AS top_score,
        COUNT(CASE WHEN total_score >= 61 THEN 1 END) AS fast_tracked
      FROM submissions
    `);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch stats.' });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
initDB()
  .then(() => {
    app.listen(PORT, () => console.log(`Chudhalla MHA portal running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('DB init failed:', err);
    process.exit(1);
  });
