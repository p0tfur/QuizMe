<p align="center">
  <h1 align="center">⚡ QuizMe</h1>
  <p align="center"><strong>Learn programming from your own code</strong></p>
  <p align="center">Daily AI-generated quizzes with spaced repetition — powered by your actual codebase</p>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#how-it-works">How It Works</a> •
  <a href="#features">Features</a> •
  <a href="#tech-stack">Tech Stack</a> •
  <a href="#contributing">Contributing</a>
</p>

---

## The Problem

You write code every day, but how much of it do you actually *learn* from? Most developers forget 80% of what they code within a week. Tutorials feel disconnected. Generic quizzes don't match your stack.

## The Solution

**QuizMe** scans your project folder, detects your tech stack, and uses AI to generate personalized quiz questions — both from your actual code and about the technologies you use. Spaced repetition ensures you remember what matters.

## Quick Start

```bash
git clone https://github.com/p0tfur/QuizMe.git
cd QuizMe
npm install
npm start
```

The browser opens automatically. On first launch, enter your **OpenRouter API key** (free at [openrouter.ai/keys](https://openrouter.ai/keys)).

> It uses OpenRouter's free endpoint — **zero cost** to use.

## How It Works

1. **📂 Scan** — Point QuizMe at any project folder. It detects technologies, languages, concepts, and extracts key code snippets.

2. **🧠 Generate** — AI creates quiz questions in 4 types:
   - **Single choice** — classic A/B/C/D
   - **True/False** — quick knowledge checks
   - **Open answer** — explain concepts in your own words
   - **Find the bug** — spot issues in code snippets

3. **🎯 Quiz** — Daily 5-minute sessions with ~7 questions. Answer, learn, improve.

4. **🔁 Remember** — SM-2 spaced repetition algorithm schedules reviews. Missed questions come back sooner. Mastered ones appear less often.

## Features

- 🔍 **Smart Project Scanner** — detects 20+ technologies (Node.js, .NET, Python, Go, Rust, Docker, and more)
- 🤖 **AI-Powered Questions** — generates project-specific AND general knowledge questions
- 📊 **Spaced Repetition (SM-2)** — scientifically proven learning algorithm
- 🔥 **Streak Tracking** — build daily learning habits
- 🌙 **Premium Dark UI** — glassmorphism design, smooth animations
- 🔒 **100% Local** — all data stays on your machine, no cloud, no tracking
- ⚡ **Zero Config** — one command to start, no build tools needed
- 🆓 **Free to Use** — uses OpenRouter's free AI models

## Detected Technologies

| Category | Technologies |
|----------|-------------|
| Frontend | Node.js, Nuxt, Vite, Next.js, Svelte, Angular, Vue CLI, TypeScript, Tailwind CSS |
| Backend | .NET/C#, ASP.NET, Python, Django, Flask/FastAPI, Java/Maven, Go, Rust |
| Infra | Docker, Docker Compose, Terraform, GitHub Actions |
| Database | SQL, Prisma, DB Migrations |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js (ESM) |
| API | Express |
| Database | SQLite (better-sqlite3) |
| AI | OpenRouter API (auto model selection) |
| Frontend | Vue 3 (CDN, no build step) |
| Algorithm | SM-2 spaced repetition |

## Project Structure

```
QuizMe/
├── bin/quizme.js              # CLI — starts server + opens browser
├── src/
│   ├── config.js              # Settings (~/.quizme/config.json)
│   ├── database.js            # SQLite schema + CRUD
│   ├── scanner.js             # Project scanner + tech detection
│   ├── quiz-generator.js      # OpenRouter LLM integration
│   ├── spaced-repetition.js   # SM-2 algorithm
│   └── server.js              # Express REST API
├── public/                    # Web UI (Vue 3 CDN, no build)
│   ├── index.html
│   ├── style.css
│   └── app.js
└── docs/
    └── README.md
```

## Data Storage

All data stored locally in `~/.quizme/`:
- `config.json` — API key and preferences
- `quizme.db` — SQLite database (projects, questions, review schedule, session history)

## Contributing

Contributions welcome! Some ideas:

- [ ] More question types (drag & drop, code completion)
- [ ] Import/export question banks
- [ ] Team mode (share quizzes with colleagues)
- [ ] VS Code extension
- [ ] Mobile-friendly PWA
- [ ] Ollama integration for fully offline use

## License

[MIT](LICENSE)

---

<p align="center">
  Built with ❤️ for developers who want to learn from the code they write every day.
</p>
