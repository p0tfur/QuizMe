// scanner.js — Scans a project folder and builds a technology profile
// Detects languages, frameworks, concepts, and extracts key file snippets for LLM context
import fs from "fs";
import path from "path";

// Directories to always skip during scanning
const IGNORE_DIRS = new Set([
  ".git", "node_modules", "dist", "build", ".nuxt", ".output",
  "bin", "obj", ".idea", ".vscode", ".vs", ".DS_Store",
  "__pycache__", ".next", "coverage", ".cache", ".parcel-cache",
  "vendor", "packages", ".svn", "bower_components", "jspm_packages",
  ".terraform", ".serverless",
]);

// File extensions to skip (binary / non-code)
const IGNORE_EXTS = new Set([
  ".exe", ".dll", ".so", ".dylib", ".o", ".a",
  ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".svg", ".webp",
  ".mp3", ".mp4", ".avi", ".mov", ".wav",
  ".zip", ".tar", ".gz", ".rar", ".7z",
  ".woff", ".woff2", ".ttf", ".eot",
  ".pdf", ".doc", ".docx", ".xls", ".xlsx",
  ".lock", ".map",
]);

/**
 * Checks if a path segment should be ignored
 * @param {string} name - Directory or file name
 * @returns {boolean}
 */
function shouldIgnore(name) {
  return IGNORE_DIRS.has(name) || name.startsWith(".");
}

/**
 * Recursively walks a directory, collecting all code files
 * @param {string} rootDir - Absolute path to project root
 * @returns {Array<{full: string, rel: string}>} List of file paths
 */
function walkDir(rootDir) {
  const files = [];
  const stack = [rootDir];

  while (stack.length) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue; // Permission denied or broken symlink
    }

    for (const entry of entries) {
      if (shouldIgnore(entry.name)) continue;

      const full = path.join(current, entry.name);
      const rel = path.relative(rootDir, full);

      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (!IGNORE_EXTS.has(ext)) {
          files.push({ full, rel, ext });
        }
      }
    }
  }
  return files;
}

/**
 * Detects technologies based on file patterns and config files
 * @param {string} rootDir - Project root
 * @param {Array} files - Scanned file list
 * @returns {Array<string>} Detected technology names
 */
function detectTech(rootDir, files) {
  const has = (p) => fs.existsSync(path.join(rootDir, p));
  const hasFile = (pattern) => files.some((f) => f.rel.match(pattern));
  const tech = [];

  // --- JavaScript / TypeScript ecosystem ---
  if (has("package.json")) tech.push("Node.js");
  if (hasFile(/^nuxt\.config\./)) tech.push("Nuxt");
  if (hasFile(/^vite\.config\./)) tech.push("Vite");
  if (hasFile(/^next\.config\./)) tech.push("Next.js");
  if (hasFile(/^svelte\.config\./)) tech.push("Svelte");
  if (hasFile(/^angular\.json$/)) tech.push("Angular");
  if (hasFile(/^vue\.config\./)) tech.push("Vue CLI");
  if (hasFile(/^tsconfig\.json$/)) tech.push("TypeScript");
  if (hasFile(/^tailwind\.config\./)) tech.push("Tailwind CSS");

  // --- .NET ---
  if (hasFile(/\.csproj$/)) tech.push(".NET / C#");
  if (hasFile(/\.fsproj$/)) tech.push(".NET / F#");
  if (has("Program.cs")) tech.push("ASP.NET");

  // --- Python ---
  if (has("requirements.txt") || has("Pipfile") || has("pyproject.toml")) tech.push("Python");
  if (hasFile(/^manage\.py$/)) tech.push("Django");
  if (hasFile(/^app\.py$/) || hasFile(/^wsgi\.py$/)) tech.push("Flask/FastAPI");

  // --- Java / JVM ---
  if (has("pom.xml")) tech.push("Java / Maven");
  if (has("build.gradle") || has("build.gradle.kts")) tech.push("Java / Gradle");

  // --- Go / Rust ---
  if (has("go.mod")) tech.push("Go");
  if (has("Cargo.toml")) tech.push("Rust");

  // --- Infrastructure ---
  if (has("Dockerfile")) tech.push("Docker");
  if (has("docker-compose.yml") || has("compose.yml")) tech.push("Docker Compose");
  if (hasFile(/\.tf$/)) tech.push("Terraform");
  if (has(".github/workflows")) tech.push("GitHub Actions");

  // --- Database ---
  if (hasFile(/\.sql$/)) tech.push("SQL");
  if (has("prisma/schema.prisma")) tech.push("Prisma");
  if (hasFile(/\.migration\./)) tech.push("DB Migrations");

  // --- Documentation ---
  if (has("README.md")) tech.push("README");
  if (hasFile(/^docs[\\/]/)) tech.push("Docs folder");

  return [...new Set(tech)];
}

/**
 * Counts files by extension and returns top N
 * @param {Array} files
 * @param {number} topN
 * @returns {Array<{ext: string, count: number}>}
 */
function summarizeLanguages(files, topN = 15) {
  const counts = new Map();
  for (const f of files) {
    const ext = f.ext || "(no ext)";
    counts.set(ext, (counts.get(ext) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([ext, count]) => ({ ext, count }));
}

/**
 * Detects programming concepts used in the project by scanning file contents
 * @param {Array} files - Scanned file list
 * @param {number} maxFiles - Max files to sample
 * @returns {Array<string>} Detected concepts
 */
function detectConcepts(files, maxFiles = 50) {
  const concepts = new Set();
  const codeFiles = files
    .filter((f) => [".js", ".ts", ".cs", ".py", ".vue", ".jsx", ".tsx"].includes(f.ext))
    .slice(0, maxFiles);

  for (const f of codeFiles) {
    try {
      const content = fs.readFileSync(f.full, "utf-8").slice(0, 5000); // Read first 5KB only

      // JavaScript/TypeScript patterns
      if (/async\s+\w|await\s+/.test(content)) concepts.add("async/await");
      if (/import\s+.*from|require\(/.test(content)) concepts.add("Module System");
      if (/fetch\(|axios|HttpClient/.test(content)) concepts.add("HTTP Requests");
      if (/useState|useEffect|useRef|ref\(|reactive\(|computed\(/.test(content)) concepts.add("Reactive State");
      if (/class\s+\w+\s*(extends|implements)/.test(content)) concepts.add("OOP / Inheritance");
      if (/\.map\(|\.filter\(|\.reduce\(/.test(content)) concepts.add("Functional Programming");
      if (/try\s*\{|catch\s*\(|\.catch\(/.test(content)) concepts.add("Error Handling");
      if (/Promise\.|\.then\(/.test(content)) concepts.add("Promises");
      if (/interface\s+\w|type\s+\w+\s*=/.test(content)) concepts.add("Type System");

      // .NET / C# patterns
      if (/\[Inject\]|\[Service\]|AddScoped|AddTransient|AddSingleton/.test(content)) concepts.add("Dependency Injection");
      if (/\[HttpGet\]|\[HttpPost\]|\[ApiController\]|MapGet|MapPost/.test(content)) concepts.add("REST API");
      if (/DbContext|DbSet|Entity/.test(content)) concepts.add("Entity Framework / ORM");
      if (/\[Authorize\]|JWT|Bearer/.test(content)) concepts.add("Authentication");

      // Testing patterns
      if (/describe\(|it\(|test\(|\[Fact\]|\[Theory\]|def test_/.test(content)) concepts.add("Unit Testing");

      // Vue / React patterns
      if (/defineComponent|<script setup|<template>/.test(content)) concepts.add("Component Architecture");
      if (/v-model|v-if|v-for|:class|@click/.test(content)) concepts.add("Template Directives");
      if (/Pinia|Vuex|createStore|useStore/.test(content)) concepts.add("State Management");

    } catch {
      // Skip unreadable files
    }
  }
  return [...concepts];
}

/**
 * Reads key files for LLM context (first ~100 lines of important files)
 * @param {string} rootDir
 * @param {Array} files
 * @returns {Array<{path: string, content: string}>}
 */
function extractKeyFiles(rootDir, files) {
  // Priority files to read for context
  const priorityNames = [
    "package.json", "Program.cs", "Startup.cs",
    "nuxt.config.ts", "nuxt.config.js", "vite.config.ts", "vite.config.js",
    "app.vue", "App.vue", "App.tsx", "App.jsx",
    "main.ts", "main.js", "index.ts", "index.js",
    "requirements.txt", "pyproject.toml",
  ];

  const keyFiles = [];

  // First: grab priority files from root
  for (const name of priorityNames) {
    const match = files.find(
      (f) => f.rel === name || f.rel.endsWith(path.sep + name)
    );
    if (match) {
      try {
        const content = fs.readFileSync(match.full, "utf-8");
        const lines = content.split("\n").slice(0, 100).join("\n");
        keyFiles.push({ path: match.rel, content: lines });
      } catch {
        // skip
      }
    }
    if (keyFiles.length >= 5) break; // Cap at 5 key files
  }

  // Then: grab 2-3 "interesting" code files by size (logic files, not configs)
  const codeExts = [".js", ".ts", ".cs", ".py", ".vue", ".jsx", ".tsx"];
  const logicFiles = files
    .filter((f) => codeExts.includes(f.ext) && !priorityNames.includes(path.basename(f.rel)))
    .sort((a, b) => {
      // Prefer files with "service", "controller", "utils", "api" in the name
      const scoreFile = (ff) => {
        const lower = ff.rel.toLowerCase();
        let s = 0;
        if (/service|controller|handler|api|utils|helper|model/.test(lower)) s += 10;
        if (/index|main|app/.test(lower)) s += 5;
        return s;
      };
      return scoreFile(b) - scoreFile(a);
    })
    .slice(0, 3);

  for (const f of logicFiles) {
    if (keyFiles.length >= 8) break;
    try {
      const content = fs.readFileSync(f.full, "utf-8");
      const lines = content.split("\n").slice(0, 80).join("\n");
      keyFiles.push({ path: f.rel, content: lines });
    } catch {
      // skip
    }
  }

  return keyFiles;
}

/**
 * Main entry: scans a project folder and returns a full profile
 * @param {string} projectPath - Path to the project folder
 * @returns {object} Project profile with tech, languages, concepts, key files
 */
export function scanProject(projectPath) {
  const abs = path.resolve(projectPath);
  if (!fs.existsSync(abs)) {
    throw new Error("Folder does not exist: " + abs);
  }

  const files = walkDir(abs);
  const tech = detectTech(abs, files);
  const languages = summarizeLanguages(files);
  const concepts = detectConcepts(files);
  const keyFiles = extractKeyFiles(abs, files);
  const projectName = path.basename(abs);

  return {
    projectPath: abs,
    projectName,
    fileCount: files.length,
    tech,
    topExtensions: languages,
    concepts,
    keyFiles,
    scannedAt: new Date().toISOString(),
  };
}
