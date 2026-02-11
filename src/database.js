// database.js — SQLite database layer using better-sqlite3
// Stores projects, questions, review schedules, and session history
import Database from "better-sqlite3";
import path from "path";
import { getConfigDir } from "./config.js";

const DB_PATH = path.join(getConfigDir(), "quizme.db");

let _db = null;

/**
 * Returns the singleton database connection, creating tables if needed
 * @returns {Database} better-sqlite3 instance
 */
export function getDb() {
  if (_db) return _db;

  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL"); // Better concurrent read performance
  _db.pragma("foreign_keys = ON");

  // Create tables if they don't exist
  _db.exec(SCHEMA);

  return _db;
}

// --- Schema definition ---
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS projects (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    path        TEXT UNIQUE NOT NULL,
    name        TEXT NOT NULL,
    profile     TEXT NOT NULL,           -- JSON: tech, languages, stats
    scanned_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS questions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    type        TEXT NOT NULL,            -- single-choice, true-false, open, find-the-bug
    difficulty  INTEGER NOT NULL DEFAULT 3,
    source      TEXT NOT NULL DEFAULT 'general',  -- project | general
    question    TEXT NOT NULL,
    choices     TEXT,                     -- JSON array (null for open questions)
    answer      TEXT NOT NULL,
    explanation TEXT,
    file_path   TEXT,                     -- optional: source file reference
    code_snippet TEXT,                    -- optional: code block for find-the-bug questions
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    question_id  INTEGER UNIQUE NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    ease_factor  REAL NOT NULL DEFAULT 2.5,
    interval_d   INTEGER NOT NULL DEFAULT 0,   -- interval in days
    repetitions  INTEGER NOT NULL DEFAULT 0,
    next_review  TEXT NOT NULL DEFAULT (datetime('now')),
    last_review  TEXT
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id   INTEGER REFERENCES projects(id) ON DELETE SET NULL,
    started_at   TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT,
    correct      INTEGER NOT NULL DEFAULT 0,
    total        INTEGER NOT NULL DEFAULT 0
  );
`;

// =====================
// Projects CRUD
// =====================

/**
 * Upserts a project profile (insert or update on conflict)
 * @param {string} projectPath - Absolute path to the project
 * @param {string} name - Project display name
 * @param {object} profile - Scanned profile data
 * @returns {object} The project row
 */
export function upsertProject(projectPath, name, profile) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO projects (path, name, profile, scanned_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(path) DO UPDATE SET
      name = excluded.name,
      profile = excluded.profile,
      scanned_at = excluded.scanned_at
  `);
  stmt.run(projectPath, name, JSON.stringify(profile));
  return db.prepare("SELECT * FROM projects WHERE path = ?").get(projectPath);
}

/**
 * Returns all scanned projects
 * @returns {Array} List of project rows
 */
export function getProjects() {
  return getDb().prepare("SELECT * FROM projects ORDER BY scanned_at DESC").all();
}

/**
 * Returns a single project by id
 * @param {number} id
 * @returns {object|undefined}
 */
export function getProjectById(id) {
  return getDb().prepare("SELECT * FROM projects WHERE id = ?").get(id);
}

/**
 * Deletes a project by id
 * @param {number} id
 * @returns {boolean} True if deleted
 */
export function deleteProject(id) {
  const result = getDb().prepare("DELETE FROM projects WHERE id = ?").run(id);
  return result.changes > 0;
}

// =====================
// Questions CRUD
// =====================

/**
 * Inserts a batch of questions for a project
 * @param {number} projectId
 * @param {Array} questions - Array of question objects
 * @returns {number} Number of questions inserted
 */
export function insertQuestions(projectId, questions) {
  const db = getDb();
  const insertQ = db.prepare(`
    INSERT INTO questions (project_id, type, difficulty, source, question, choices, answer, explanation, file_path, code_snippet)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertR = db.prepare(`
    INSERT INTO reviews (question_id) VALUES (?)
  `);

  const transaction = db.transaction((qs) => {
    let count = 0;
    for (const q of qs) {
      const result = insertQ.run(
        projectId,
        q.type || "single-choice",
        q.difficulty || 3,
        q.source || "general",
        q.question,
        q.choices ? JSON.stringify(q.choices) : null,
        q.answer,
        q.explanation || null,
        q.file_path || null,
        q.code_snippet || null
      );
      // Create a review entry for spaced repetition tracking
      insertR.run(result.lastInsertRowid);
      count++;
    }
    return count;
  });

  return transaction(questions);
}

/**
 * Returns all questions for a project
 * @param {number} projectId
 * @returns {Array}
 */
export function getQuestionsByProject(projectId) {
  return getDb()
    .prepare("SELECT * FROM questions WHERE project_id = ? ORDER BY created_at DESC")
    .all(projectId);
}

/**
 * Returns questions due for review (next_review <= now), limited by count
 * @param {number} count - Max questions to return
 * @param {number|null} projectId - Optional: filter by project
 * @returns {Array} Questions with review data joined
 */
export function getDueQuestions(count = 7, projectId = null) {
  const db = getDb();
  let sql = `
    SELECT q.*, r.ease_factor, r.interval_d, r.repetitions, r.next_review, r.last_review
    FROM questions q
    JOIN reviews r ON r.question_id = q.id
    WHERE r.next_review <= datetime('now')
  `;
  const params = [];
  if (projectId) {
    sql += " AND q.project_id = ?";
    params.push(projectId);
  }
  sql += " ORDER BY r.next_review ASC LIMIT ?";
  params.push(count);

  return db.prepare(sql).all(...params);
}

// =====================
// Reviews (Spaced Repetition)
// =====================

/**
 * Updates the review record for a question after answering
 * @param {number} questionId
 * @param {object} reviewData - { ease_factor, interval_d, repetitions, next_review }
 */
export function updateReview(questionId, reviewData) {
  getDb()
    .prepare(`
      UPDATE reviews SET
        ease_factor = ?,
        interval_d = ?,
        repetitions = ?,
        next_review = ?,
        last_review = datetime('now')
      WHERE question_id = ?
    `)
    .run(
      reviewData.ease_factor,
      reviewData.interval_d,
      reviewData.repetitions,
      reviewData.next_review,
      questionId
    );
}

// =====================
// Sessions
// =====================

/**
 * Creates a new quiz session
 * @param {number|null} projectId
 * @returns {number} Session id
 */
export function createSession(projectId = null) {
  const result = getDb()
    .prepare("INSERT INTO sessions (project_id) VALUES (?)")
    .run(projectId);
  return result.lastInsertRowid;
}

/**
 * Completes a session with final score
 * @param {number} sessionId
 * @param {number} correct
 * @param {number} total
 */
export function completeSession(sessionId, correct, total) {
  getDb()
    .prepare(
      "UPDATE sessions SET completed_at = datetime('now'), correct = ?, total = ? WHERE id = ?"
    )
    .run(correct, total, sessionId);
}

/**
 * Returns aggregated stats for the dashboard
 * @returns {object} { totalSessions, totalQuestions, avgAccuracy, streak, todayCompleted }
 */
export function getStats() {
  const db = getDb();

  const totals = db
    .prepare(
      "SELECT COUNT(*) as totalSessions, COALESCE(SUM(correct),0) as totalCorrect, COALESCE(SUM(total),0) as totalQuestions FROM sessions WHERE completed_at IS NOT NULL"
    )
    .get();

  // Calculate streak: consecutive days with at least one completed session
  const days = db
    .prepare(
      "SELECT DISTINCT date(completed_at) as day FROM sessions WHERE completed_at IS NOT NULL ORDER BY day DESC"
    )
    .all();

  let streak = 0;
  const today = new Date().toISOString().slice(0, 10);
  for (let i = 0; i < days.length; i++) {
    const expected = new Date();
    expected.setDate(expected.getDate() - i);
    const expectedStr = expected.toISOString().slice(0, 10);
    if (days[i].day === expectedStr) {
      streak++;
    } else {
      break;
    }
  }

  // Check if user already completed a quiz today
  const todayCompleted = db
    .prepare(
      "SELECT COUNT(*) as count FROM sessions WHERE completed_at IS NOT NULL AND date(completed_at) = date('now')"
    )
    .get().count;

  const questionBank = db
    .prepare("SELECT COUNT(*) as count FROM questions")
    .get().count;

  return {
    totalSessions: totals.totalSessions,
    totalCorrect: totals.totalCorrect,
    totalQuestions: totals.totalQuestions,
    avgAccuracy:
      totals.totalQuestions > 0
        ? Math.round((totals.totalCorrect / totals.totalQuestions) * 100)
        : 0,
    streak,
    todayCompleted,
    questionBank,
  };
}
