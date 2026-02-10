#!/usr/bin/env node
// quizme.js — CLI entry point
// Starts the Express server and opens the browser automatically

import { createApp } from "../src/server.js";
import chalk from "chalk";
import open from "open";
import { createServer } from "http";

const BANNER = `
  ╔═══════════════════════════════════════╗
  ║   ${chalk.bold.cyan("QuizMe")} ${chalk.dim("v0.1.0")}                       ║
  ║   ${chalk.dim("Learn from your own code")}             ║
  ╚═══════════════════════════════════════╝
`;

async function main() {
  console.log(BANNER);

  const app = createApp();
  const server = createServer(app);

  // Listen on port 0 = OS picks a random available port
  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const port = server.address().port;
  const url = `http://localhost:${port}`;

  console.log(chalk.green("  ✓ Server running at ") + chalk.bold.underline(url));
  console.log(chalk.dim("  Press Ctrl+C to stop\n"));

  // Open browser automatically
  try {
    await open(url);
    console.log(chalk.dim("  → Browser opened"));
  } catch {
    console.log(chalk.yellow("  ⚠ Could not open browser. Visit: ") + url);
  }

  // Graceful shutdown
  const shutdown = () => {
    console.log(chalk.dim("\n  Shutting down..."));
    server.close(() => process.exit(0));
    // Force exit after 3 seconds
    setTimeout(() => process.exit(1), 3000);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(chalk.red("  ✗ Fatal error:"), err.message);
  process.exit(1);
});
