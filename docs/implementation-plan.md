QuizMe MVP — Implementation Plan
Build a CLI tool that scans code projects, generates programming quizzes via LLM, and serves a local web UI for daily quiz sessions with spaced repetition.

Proposed Changes
Project Structure
QuizMe/
├── package.json
├── bin/
│   └── quizme.js              # CLI entry — starts server + opens browser
├── src/
│   ├── config.js              # API key + settings (~/.quizme/config.json)
│   ├── database.js            # SQLite schema + CRUD
│   ├── scanner.js             # Folder walker + tech detection
│   ├── quiz-generator.js      # OpenRouter LLM integration
│   ├── spaced-repetition.js   # SM-2 algorithm
│   └── server.js              # Express API
├── public/                    # Static web UI (Vue 3 CDN, no build step)
│   ├── index.html
│   ├── style.css
│   └── app.js
└── docs/
    └── README.md
Foundation
[NEW] 
package.json
"type": "module" (ESM throughout)
Dependencies: express, better-sqlite3, open (to launch browser), chalk (CLI output)
"bin": { "quizme": "./bin/quizme.js" } for global CLI install
[NEW] 
config.js
Stores config in ~/.quizme/config.json (cross-platform via os.homedir())
Manages: openRouterApiKey, scannedProjects[]
First-run detection: if no API key → web UI shows onboarding
Project Scanner
[NEW] 
scanner.js
Folder walker: recursive scan with ignore set (node_modules, .git, bin, obj, dist, etc.)
Tech detection: heuristics based on file names/extensions:
package.json → Node.js; nuxt.config.* → Nuxt; vite.config.* → Vite
*.csproj → .NET; Program.cs → ASP.NET
Dockerfile → Docker; docker-compose.yml → Docker Compose
*.py + requirements.txt → Python; pom.xml → Java/Maven
Language stats: top extensions by file count
Concept extraction: scans for patterns like async/await, DI, HTTP API, etc.
Key file extraction: reads first ~100 lines of important files (e.g. Program.cs, package.json, main entry points) for LLM context
Database
[NEW] 
database.js
SQLite via better-sqlite3, stored at ~/.quizme/quizme.db
Tables:
projects — id, path, name, profile_json, scanned_at
questions — id, project_id, type, difficulty, source, question, choices_json, answer, explanation, file_path
reviews — id, question_id, ease_factor, interval, repetitions, next_review, last_reviewed
sessions — id, started_at, completed_at, score, total
LLM Integration
[NEW] 
quiz-generator.js
Uses OpenRouter API (https://openrouter.ai/api/v1/chat/completions)
Model: openrouter/auto (free tier — OpenRouter picks an appropriate model)
Generates two types of questions:
Project-based: sends code snippets from scanned files + asks about them
General knowledge: based on detected technologies
Question types: single-choice, true-false, open, find-the-bug
Structured JSON output with validation
Rate limiting: respects OpenRouter free tier limits
Spaced Repetition
[NEW] 
spaced-repetition.js
Implements SM-2 algorithm:
Quality grades 0–5 (0 = complete fail, 5 = perfect)
Adjusts ease factor (min 1.3) and interval
Failed questions (grade < 3): reset interval to 1 day
getNextQuestions(count): picks questions due for review + new ones
recordAnswer(questionId, grade): updates review schedule
Express API
[NEW] 
server.js
Serves public/ as static files
Endpoints:
GET /api/status — config status (has API key? has projects?)
POST /api/config — save API key
POST /api/scan — scan a folder, save profile
GET /api/projects — list scanned projects
POST /api/generate — generate quiz questions for a project
GET /api/quiz/daily — get today's quiz (7 questions)
POST /api/quiz/answer — submit answer, update spaced repetition
GET /api/stats — stats (streak, accuracy, progress)
Web UI (No Build Step)
[NEW] 
index.html
Single-page app using Vue 3 via CDN (no build tools needed)
Views managed by simple client-side router (hash-based)
Dark theme, premium design, glassmorphism accents
[NEW] 
style.css
Dark mode design system with CSS custom properties
Card-based layouts, smooth transitions, responsive
Quiz-specific styles: progress bar, answer feedback, timers
[NEW] 
app.js
Views:
Setup — API key input (first run only)
Dashboard — scanned projects list, daily quiz button, stats overview
Scan — folder path input, scan results preview, generate quiz button
Quiz — question display, answer selection, progress bar, score
Results — session summary, accuracy, next review dates
All API calls via fetch()
CLI Entry Point
[NEW] 
quizme.js
Starts Express server on random available port
Auto-opens browser to http://localhost:<port>
Clean shutdown on Ctrl+C
Console output with chalk: port info, project name, ASCII art banner
Documentation
[NEW] 
README.md
What QuizMe does, how to install, how to use
Configuration (API key setup)
Available commands
Verification Plan
Automated (CLI)
Run the app: node bin/quizme.js — verify server starts + browser opens
Scanner test: point at a known project folder, verify JSON profile has correct tech detection
DB test: verify tables are created, CRUD works
Manual (Browser UI)
Open app → should see Setup screen asking for OpenRouter API key
Enter API key → should transition to Dashboard
Enter a project folder path → click Scan → should show detected technologies + file stats
Click Generate Quiz → should call OpenRouter and create questions
Click Start Daily Quiz → answer 7 questions → see Results with score
Run again next day → verify spaced repetition brings back missed questions