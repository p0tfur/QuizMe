// quiz-generator.js — Generates quiz questions via OpenRouter LLM API
// Supports project-based and general knowledge questions
import { loadConfig } from "./config.js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Calls OpenRouter API with a prompt
 * @param {string} systemPrompt - System message
 * @param {string} userPrompt - User message
 * @returns {string} LLM response text
 */
async function callLLM(systemPrompt, userPrompt) {
  const config = loadConfig();
  if (!config.openRouterApiKey) {
    throw new Error("OpenRouter API key not configured. Set it in the app settings.");
  }

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.openRouterApiKey}`,
      "HTTP-Referer": "http://localhost",
      "X-Title": "QuizMe",
    },
    body: JSON.stringify({
      model: "openrouter/auto",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 4000,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenRouter API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

/**
 * Builds the system prompt for quiz generation
 * @returns {string}
 */
function getSystemPrompt() {
  return `You are a programming quiz generator. Your job is to create educational quiz questions that help developers learn and reinforce programming concepts.

RULES:
- Generate questions in the language matching the project's primary language (if code is in Polish context, questions can be in Polish or English — prefer English for technical accuracy)
- Each question must be self-contained and clearly worded
- For single-choice questions, provide exactly 4 choices labeled A, B, C, D
- For true-false questions, the answer must be exactly "true" or "false"
- For open questions, provide a concise expected answer
- For find-the-bug questions, include a code snippet with a subtle but real bug
- Always include a brief explanation of the correct answer
- Questions should range from beginner (difficulty 1) to advanced (difficulty 5)

OUTPUT FORMAT — respond ONLY with a valid JSON array, no markdown, no extra text:
[
  {
    "type": "single-choice",
    "difficulty": 3,
    "source": "project",
    "question": "What does this function do?",
    "choices": ["A) Option 1", "B) Option 2", "C) Option 3", "D) Option 4"],
    "answer": "B",
    "explanation": "Because...",
    "file_path": "src/utils.js"
  }
]

Question types to use: "single-choice", "true-false", "open", "find-the-bug"`;
}

/**
 * Builds the user prompt with project context
 * @param {object} profile - Project profile from scanner
 * @param {number} count - Number of questions to generate
 * @param {string} mode - "mixed" | "project" | "general"
 * @returns {string}
 */
function buildUserPrompt(profile, count, mode = "mixed") {
  let prompt = `Generate ${count} programming quiz questions.\n\n`;

  prompt += `PROJECT CONTEXT:\n`;
  prompt += `- Name: ${profile.projectName}\n`;
  prompt += `- Technologies: ${profile.tech.join(", ")}\n`;
  prompt += `- Detected concepts: ${profile.concepts.join(", ")}\n`;
  prompt += `- Top file types: ${profile.topExtensions.map((e) => `${e.ext} (${e.count})`).join(", ")}\n`;
  prompt += `- Total files: ${profile.fileCount}\n\n`;

  // Include key file contents for project-based questions
  if (profile.keyFiles && profile.keyFiles.length > 0 && mode !== "general") {
    prompt += `KEY SOURCE FILES:\n`;
    for (const kf of profile.keyFiles) {
      prompt += `\n--- ${kf.path} ---\n${kf.content}\n`;
    }
    prompt += `\n`;
  }

  // Specify the mix of question types
  if (mode === "mixed") {
    prompt += `REQUIREMENTS:\n`;
    prompt += `- About half should be PROJECT-BASED (referencing the actual code above, set source="project")\n`;
    prompt += `- About half should be GENERAL KNOWLEDGE about the detected technologies (set source="general")\n`;
    prompt += `- Mix question types: mostly single-choice, some true-false, 1-2 find-the-bug, 1 open\n`;
    prompt += `- Vary difficulty from 1 to 5\n`;
  } else if (mode === "project") {
    prompt += `REQUIREMENTS:\n`;
    prompt += `- ALL questions must reference the actual project code above (source="project")\n`;
    prompt += `- Ask about what functions do, potential bugs, improvements, edge cases\n`;
  } else {
    prompt += `REQUIREMENTS:\n`;
    prompt += `- ALL questions should be general knowledge about: ${profile.tech.join(", ")} (source="general")\n`;
    prompt += `- Cover best practices, common pitfalls, language features, framework specifics\n`;
  }

  return prompt;
}

/**
 * Parses LLM response into validated question objects
 * @param {string} raw - Raw LLM text response
 * @returns {Array} Parsed and validated questions
 */
function parseQuestions(raw) {
  // Try to extract JSON from the response (handle markdown code blocks)
  let jsonStr = raw.trim();

  // Strip markdown code fences if present
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  // Find the JSON array in the response
  const arrayStart = jsonStr.indexOf("[");
  const arrayEnd = jsonStr.lastIndexOf("]");
  if (arrayStart !== -1 && arrayEnd !== -1) {
    jsonStr = jsonStr.slice(arrayStart, arrayEnd + 1);
  }

  let questions;
  try {
    questions = JSON.parse(jsonStr);
  } catch (e) {
    console.error("Failed to parse LLM response as JSON:", e.message);
    console.error("Raw response:", raw.slice(0, 500));
    return [];
  }

  if (!Array.isArray(questions)) return [];

  // Validate and clean each question
  const validTypes = new Set(["single-choice", "true-false", "open", "find-the-bug"]);

  return questions
    .filter((q) => {
      // Must have required fields
      if (!q.question || !q.answer) return false;
      if (!validTypes.has(q.type)) q.type = "single-choice";
      return true;
    })
    .map((q) => ({
      type: q.type,
      difficulty: Math.min(5, Math.max(1, parseInt(q.difficulty) || 3)),
      source: q.source === "project" ? "project" : "general",
      question: q.question,
      choices: Array.isArray(q.choices) ? q.choices : null,
      answer: String(q.answer),
      explanation: q.explanation || "",
      file_path: q.file_path || null,
    }));
}

/**
 * Main entry: generates quiz questions for a project
 * @param {object} profile - Project profile from scanner
 * @param {number} count - Number of questions to generate (default 10)
 * @param {string} mode - "mixed" | "project" | "general"
 * @returns {Promise<Array>} Generated quiz questions
 */
export async function generateQuestions(profile, count = 10, mode = "mixed") {
  const systemPrompt = getSystemPrompt();
  const userPrompt = buildUserPrompt(profile, count, mode);

  console.log(`  Generating ${count} questions via OpenRouter (mode: ${mode})...`);

  const raw = await callLLM(systemPrompt, userPrompt);
  const questions = parseQuestions(raw);

  console.log(`  Parsed ${questions.length} valid questions from LLM response.`);

  return questions;
}
