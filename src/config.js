// config.js — Manages persistent config stored in ~/.quizme/config.json
import fs from "fs";
import path from "path";
import os from "os";

const CONFIG_DIR = path.join(os.homedir(), ".quizme");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

// Default configuration values
const DEFAULTS = {
  openRouterApiKey: "",
  dailyQuestionCount: 7,
  port: 0, // 0 = random available port
};

/**
 * Ensures the ~/.quizme directory exists
 */
function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

/**
 * Loads config from disk, merging with defaults
 * @returns {object} Full config object
 */
export function loadConfig() {
  ensureConfigDir();
  if (!fs.existsSync(CONFIG_FILE)) {
    return { ...DEFAULTS };
  }
  try {
    const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
    const saved = JSON.parse(raw);
    return { ...DEFAULTS, ...saved };
  } catch {
    // Corrupted config? Reset to defaults
    return { ...DEFAULTS };
  }
}

/**
 * Saves config to disk (merges with existing)
 * @param {object} updates - Key/value pairs to update
 * @returns {object} Updated full config
 */
export function saveConfig(updates) {
  ensureConfigDir();
  const current = loadConfig();
  const merged = { ...current, ...updates };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2), "utf-8");
  return merged;
}

/**
 * Checks whether the OpenRouter API key is configured
 * @returns {boolean}
 */
export function hasApiKey() {
  const cfg = loadConfig();
  return !!(cfg.openRouterApiKey && cfg.openRouterApiKey.trim().length > 0);
}

/**
 * Returns the path to the config directory (~/.quizme)
 * @returns {string}
 */
export function getConfigDir() {
  ensureConfigDir();
  return CONFIG_DIR;
}
