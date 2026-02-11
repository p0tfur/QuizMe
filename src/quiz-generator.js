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
      model: "openrouter/free",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 4000,
      // Request JSON output format — models that support it will comply,
      // others will silently ignore this parameter
      response_format: { type: "json_object" },
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
  return `You are a programming quiz generator. Create educational quiz questions as a JSON array.

RULES:
- Each question must be self-contained and clearly worded
- For single-choice: provide exactly 4 choices labeled A, B, C, D
- For true-false: answer must be exactly "true" or "false"
- For open: provide a concise expected answer
- For find-the-bug: MUST include a "code_snippet" field with the buggy code. The "question" describes what to look for, "code_snippet" holds the actual code.
- Always include explanation
- Difficulty ranges from 1 (beginner) to 5 (advanced)

Respond ONLY with a valid JSON array:
[
  {"type":"single-choice","difficulty":3,"source":"project","question":"...","choices":["A) ...","B) ...","C) ...","D) ..."],"answer":"B","explanation":"...","file_path":"src/file.js"},
  {"type":"find-the-bug","difficulty":4,"source":"project","question":"Find the bug.","code_snippet":"function x() {\\n  // buggy code\\n}","answer":"The bug is...","explanation":"...","file_path":"src/file.js"},
  {"type":"true-false","difficulty":2,"source":"general","question":"...","answer":"true","explanation":"..."},
  {"type":"open","difficulty":3,"source":"general","question":"...","answer":"...","explanation":"..."}
]

Types: "single-choice", "true-false", "open", "find-the-bug"`;
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
 * Sanitizes raw JSON string from LLM to handle common issues:
 * - Strips control characters (keeps \n, \r, \t)
 * - Removes trailing commas before ] and }
 * - Attempts to repair truncated JSON arrays
 * @param {string} str - Raw JSON string
 * @returns {string} Sanitized JSON string
 */
function sanitizeJsonString(str) {
  // Strip control characters except \n \r \t
  // eslint-disable-next-line no-control-regex
  let cleaned = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");

  // Strip prefixes like "js", "json", "javascript" if they appear at start (without backticks)
  // e.g. "js\n[...]" -> "[...]"
  cleaned = cleaned.replace(/^(js|json|javascript)(\s+)/i, "");

  // Remove trailing commas before } or ] (common LLM mistake)
  cleaned = cleaned.replace(/,\s*([\]}])/g, "$1");

  // Handle truncated JSON — if array was cut off mid-object, try to close it
  const openBrackets = (cleaned.match(/\[/g) || []).length;
  const closeBrackets = (cleaned.match(/\]/g) || []).length;
  if (openBrackets > closeBrackets) {
    // Try to find last complete object and close the array there
    const lastCompleteObj = cleaned.lastIndexOf("}");
    if (lastCompleteObj !== -1) {
      // Check if there's incomplete content after the last }
      const afterLast = cleaned.slice(lastCompleteObj + 1).trim();
      if (afterLast && !afterLast.startsWith("]")) {
        // Truncate at last complete object and close
        cleaned = cleaned.slice(0, lastCompleteObj + 1);
        // Remove any trailing comma
        cleaned = cleaned.replace(/,\s*$/, "");
        // Close unclosed brackets
        for (let i = 0; i < openBrackets - closeBrackets; i++) {
          cleaned += "]";
        }
      }
    }
  }

  return cleaned;
}

/**
 * Parses LLM response into validated question objects
 * Handles various malformed JSON outputs from different models
 * @param {string} raw - Raw LLM text response
 * @returns {Array} Parsed and validated questions
 */
function parseQuestions(raw) {
  if (!raw || !raw.trim()) {
    console.error("Empty LLM response received");
    return [];
  }

  // Try to extract JSON from the response (handle markdown code blocks)
  let jsonStr = raw.trim();

  // Strip markdown code fences if present (greedy match for multiple blocks)
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  // Detect if response starts with { (single object or concatenated objects)
  // Must check BEFORE looking for [ to avoid matching [ inside choices/arrays
  const firstChar = jsonStr.trimStart().charAt(0);
  if (firstChar === "{") {
    // Could be one object or multiple objects concatenated: {...}{...}
    // Wrap in array brackets
    const objStart = jsonStr.indexOf("{");
    const objEnd = jsonStr.lastIndexOf("}");
    if (objStart !== -1 && objEnd !== -1) {
      let inner = jsonStr.slice(objStart, objEnd + 1);
      // Split concatenated objects: }{ or }, { → },{
      inner = inner.replace(/\}\s*,?\s*\{/g, "},{");
      jsonStr = "[" + inner + "]";
    }
  } else {
    // Find the JSON array in the response
    const arrayStart = jsonStr.indexOf("[");
    const arrayEnd = jsonStr.lastIndexOf("]");
    if (arrayStart !== -1 && arrayEnd !== -1) {
      jsonStr = jsonStr.slice(arrayStart, arrayEnd + 1);
    }
  }

  // Apply JSON sanitization to fix common LLM issues
  jsonStr = sanitizeJsonString(jsonStr);

  let questions;
  try {
    questions = JSON.parse(jsonStr);
  } catch (e) {
    console.error("Failed to parse LLM response as JSON:", e.message);
    console.error("Sanitized JSON (first 500 chars):", jsonStr.slice(0, 500));
    console.error("Raw response (first 500 chars):", raw.slice(0, 500));

    // Last resort: try to extract individual JSON objects with regex
    try {
      const objectMatches = raw.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g);
      if (objectMatches && objectMatches.length > 0) {
        questions = objectMatches
          .map((m) => {
            try {
              return JSON.parse(sanitizeJsonString(m));
            } catch {
              return null;
            }
          })
          .filter(Boolean);
        console.log(`  Recovered ${questions.length} questions via regex extraction.`);
      } else {
        return [];
      }
    } catch {
      return [];
    }
  }

  if (!Array.isArray(questions)) {
    // Wrap single object in array
    if (questions && typeof questions === "object") {
      questions = [questions];
    } else {
      return [];
    }
  }

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
      code_snippet: q.code_snippet || null,
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
  // Debug: log raw LLM response to help diagnose parsing failures
  console.log(`  [DEBUG] Raw LLM response (first 500 chars): ${raw.slice(0, 500)}`);
  const questions = parseQuestions(raw);

  console.log(`  Parsed ${questions.length} valid questions from LLM response.`);

  return questions;
}
