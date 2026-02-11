// server.js — Express API server for QuizMe
// Serves the static web UI and provides REST endpoints for all operations
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { loadConfig, saveConfig, hasApiKey } from "./config.js";
import { scanProject } from "./scanner.js";
import {
  upsertProject, getProjects, getProjectById, deleteProject,
  insertQuestions, getDueQuestions, getQuestionsByProject,
  updateReview, createSession, completeSession, getStats,
} from "./database.js";
import { generateQuestions } from "./quiz-generator.js";
import { calculateNextReview, answerToQuality } from "./spaced-repetition.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Creates and configures the Express app
 * @returns {express.Application}
 */
export function createApp() {
  const app = express();

  // Middleware
  app.use(express.json());
  app.use(express.static(path.join(__dirname, "..", "public")));

  // --- Status & Config ---

  // GET /api/status — check if app is configured and has data
  app.get("/api/status", (_req, res) => {
    const config = loadConfig();
    const stats = getStats();
    res.json({
      hasApiKey: hasApiKey(),
      projectCount: getProjects().length,
      ...stats,
    });
  });

  // POST /api/config — save configuration (API key etc.)
  app.post("/api/config", (req, res) => {
    const { openRouterApiKey } = req.body;
    if (!openRouterApiKey || !openRouterApiKey.trim()) {
      return res.status(400).json({ error: "API key is required" });
    }
    const config = saveConfig({ openRouterApiKey: openRouterApiKey.trim() });
    res.json({ success: true, hasApiKey: true });
  });

  // --- Projects ---

  // GET /api/projects — list all scanned projects
  app.get("/api/projects", (_req, res) => {
    const projects = getProjects().map((p) => ({
      ...p,
      profile: JSON.parse(p.profile),
    }));
    res.json(projects);
  });

  // DELETE /api/projects/:id — delete a project
  app.delete("/api/projects/:id", (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid project ID" });
    }
    const success = deleteProject(id);
    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: "Project not found" });
    }
  });

  // POST /api/scan — scan a project folder
  app.post("/api/scan", (req, res) => {
    const { folderPath } = req.body;
    if (!folderPath || !folderPath.trim()) {
      return res.status(400).json({ error: "Folder path is required" });
    }

    try {
      const profile = scanProject(folderPath.trim());
      const project = upsertProject(
        profile.projectPath,
        profile.projectName,
        profile
      );
      res.json({
        success: true,
        project: { ...project, profile },
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // --- Quiz Generation ---

  // POST /api/generate — generate quiz questions for a project
  app.post("/api/generate", async (req, res) => {
    const { projectId, count = 10, mode = "mixed" } = req.body;

    if (!projectId) {
      return res.status(400).json({ error: "projectId is required" });
    }
    if (!hasApiKey()) {
      return res.status(400).json({ error: "API key not configured" });
    }

    const project = getProjectById(projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    try {
      const profile = JSON.parse(project.profile);
      const questions = await generateQuestions(profile, count, mode);

      if (questions.length === 0) {
        return res.status(500).json({ error: "No valid questions generated. Try again." });
      }

      const inserted = insertQuestions(projectId, questions);
      res.json({ success: true, generated: inserted, questions });
    } catch (err) {
      console.error("Quiz generation error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // --- Quiz Session ---

  // GET /api/quiz/daily — get today's quiz questions
  app.get("/api/quiz/daily", (req, res) => {
    const config = loadConfig();
    const count = config.dailyQuestionCount || 7;
    const projectId = req.query.projectId ? parseInt(req.query.projectId) : null;

    const questions = getDueQuestions(count, projectId);

    // Parse choices JSON for each question
    const parsed = questions.map((q) => ({
      ...q,
      choices: q.choices ? JSON.parse(q.choices) : null,
    }));

    // Create a session if we have questions
    let sessionId = null;
    if (parsed.length > 0) {
      sessionId = createSession(projectId);
    }

    res.json({ sessionId, questions: parsed, total: parsed.length });
  });

  // POST /api/quiz/answer — submit an answer and update spaced repetition
  app.post("/api/quiz/answer", (req, res) => {
    const { questionId, isCorrect, sessionId } = req.body;

    if (questionId === undefined || isCorrect === undefined) {
      return res
        .status(400)
        .json({ error: "questionId and isCorrect are required" });
    }

    // Get current review state
    const question = getDueQuestions(1000).find((q) => q.id === questionId);
    if (!question) {
      // Question might not be "due" but was served in a session — get it directly
      const allQs = getDueQuestions(10000);
      // Fallback: just use defaults
    }

    const currentReview = {
      ease_factor: question?.ease_factor || 2.5,
      interval_d: question?.interval_d || 0,
      repetitions: question?.repetitions || 0,
    };

    const quality = answerToQuality(isCorrect);
    const newReview = calculateNextReview(currentReview, quality);
    updateReview(questionId, newReview);

    res.json({
      success: true,
      nextReview: newReview.next_review,
      intervalDays: newReview.interval_d,
    });
  });

  // POST /api/quiz/complete — complete a quiz session
  app.post("/api/quiz/complete", (req, res) => {
    const { sessionId, correct, total } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: "sessionId is required" });
    }
    completeSession(sessionId, correct || 0, total || 0);
    const stats = getStats();
    res.json({ success: true, stats });
  });

  // --- Stats ---

  // GET /api/stats — dashboard statistics
  app.get("/api/stats", (_req, res) => {
    res.json(getStats());
  });

  // Fallback: serve index.html for SPA routing
  app.get("*", (_req, res) => {
    res.sendFile(path.join(__dirname, "..", "public", "index.html"));
  });

  return app;
}
