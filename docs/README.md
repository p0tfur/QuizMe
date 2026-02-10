# QuizMe

**Learn programming from your own code** — daily AI-generated quizzes with spaced repetition.

## What it does

1. **Scans your project folder** — detects technologies, languages, concepts, and extracts key code snippets
2. **Generates quiz questions via AI** — using OpenRouter (free tier), creates project-specific and general knowledge questions
3. **Daily quiz sessions** — 7 questions per session with 4 question types: single-choice, true/false, open, find-the-bug
4. **Spaced repetition (SM-2)** — missed questions come back more frequently until you master them

## Quick Start

```bash
# Install dependencies
npm install

# Run the app (starts server + opens browser)
npm start
```

On first launch, you'll be asked for an **OpenRouter API key**. Get one for free at [openrouter.ai/keys](https://openrouter.ai/keys).

## How to Use

1. **Enter API key** on the setup screen
2. **Scan a project** — enter a folder path and click "Scan"
3. **Generate quiz** — click "Generate Quiz" to create 10 AI-generated questions
4. **Start daily quiz** — answer questions, track your streak

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js (ESM) |
| API Server | Express |
| Database | SQLite (better-sqlite3) |
| LLM | OpenRouter API (auto model selection) |
| Frontend | Vue 3 (CDN, no build step) |
| Algorithm | SM-2 spaced repetition |

## Project Structure

```
QuizMe/
├── bin/quizme.js              # CLI entry — starts server + opens browser
├── src/
│   ├── config.js              # API key + settings (~/.quizme/config.json)
│   ├── database.js            # SQLite schema + CRUD
│   ├── scanner.js             # Folder walker + tech detection
│   ├── quiz-generator.js      # OpenRouter LLM integration
│   ├── spaced-repetition.js   # SM-2 algorithm
│   └── server.js              # Express API
├── public/                    # Static web UI (Vue 3 CDN)
│   ├── index.html
│   ├── style.css
│   └── app.js
└── docs/
    └── README.md              # This file
```

## Data Storage

All data is stored locally in `~/.quizme/`:
- `config.json` — API key and settings
- `quizme.db` — SQLite database (projects, questions, reviews, sessions)

## Detected Technologies

The scanner detects 20+ technologies including:
- **Frontend**: Node.js, Nuxt, Vite, Next.js, Svelte, Angular, Vue CLI, TypeScript, Tailwind CSS
- **Backend**: .NET/C#, .NET/F#, ASP.NET, Python, Django, Flask/FastAPI, Java/Maven, Java/Gradle, Go, Rust
- **Infrastructure**: Docker, Docker Compose, Terraform, GitHub Actions
- **Database**: SQL, Prisma, DB Migrations
