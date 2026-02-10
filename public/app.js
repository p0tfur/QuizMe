// app.js — Vue 3 application (CDN, no build step)
// Manages all views: setup, dashboard, scan, quiz, stats
const { createApp, ref, computed, onMounted } = Vue;

const app = createApp({
  setup() {
    // --- State ---
    const loading = ref(true);
    const view = ref("dashboard");
    const status = ref({});
    const projects = ref([]);
    const errorMsg = ref("");
    const successMsg = ref("");

    // Setup
    const apiKeyInput = ref("");

    // Scan
    const scanPath = ref("");
    const scanning = ref(false);
    const scanResult = ref(null);
    const generating = ref(false);
    const generatedCount = ref(0);

    // Quiz
    const quizLoading = ref(false);
    const quizQuestions = ref([]);
    const quizCurrentIndex = ref(0);
    const quizScore = ref(0);
    const quizSessionId = ref(null);
    const answered = ref(false);
    const selectedAnswer = ref(null);
    const lastCorrect = ref(false);
    const openAnswerText = ref("");

    // Current question computed
    const currentQ = computed(() => {
      return quizQuestions.value[quizCurrentIndex.value] || {};
    });

    // Time of day greeting
    const timeOfDay = computed(() => {
      const h = new Date().getHours();
      if (h < 12) return "morning";
      if (h < 18) return "afternoon";
      return "evening";
    });

    // --- API helpers ---

    /**
     * Generic fetch wrapper with error handling
     * @param {string} url - API endpoint
     * @param {object} options - fetch options
     * @returns {Promise<object>} Parsed JSON response
     */
    async function api(url, options = {}) {
      try {
        const res = await fetch(url, {
          headers: { "Content-Type": "application/json" },
          ...options,
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        return data;
      } catch (err) {
        showError(err.message);
        throw err;
      }
    }

    // Show error toast (auto-dismiss after 5s)
    function showError(msg) {
      errorMsg.value = msg;
      setTimeout(() => (errorMsg.value = ""), 5000);
    }

    // Show success toast (auto-dismiss after 3s)
    function showSuccess(msg) {
      successMsg.value = msg;
      setTimeout(() => (successMsg.value = ""), 3000);
    }

    // --- Init ---

    /**
     * Loads initial data: status + projects
     * Routes to setup if no API key is configured
     */
    async function init() {
      try {
        const s = await api("/api/status");
        status.value = s;

        if (!s.hasApiKey) {
          view.value = "setup";
        } else {
          const p = await api("/api/projects");
          projects.value = p;
          view.value = "dashboard";
        }
      } catch {
        view.value = "setup";
      } finally {
        loading.value = false;
      }
    }

    // --- Navigation ---

    function navigate(v) {
      view.value = v;
      // Refresh data when going to dashboard
      if (v === "dashboard" || v === "stats") {
        refreshStatus();
      }
    }

    async function refreshStatus() {
      try {
        const s = await api("/api/status");
        status.value = s;
        const p = await api("/api/projects");
        projects.value = p;
      } catch {
        // silent fail on refresh
      }
    }

    // --- Setup: Save API Key ---

    async function saveApiKey() {
      if (!apiKeyInput.value.trim()) return;
      try {
        await api("/api/config", {
          method: "POST",
          body: JSON.stringify({ openRouterApiKey: apiKeyInput.value.trim() }),
        });
        showSuccess("API key saved!");
        await init();
      } catch {
        // Error already shown by api()
      }
    }

    // --- Scan: Scan a project folder ---

    async function scanFolder() {
      if (!scanPath.value.trim() || scanning.value) return;
      scanning.value = true;
      scanResult.value = null;
      generatedCount.value = 0;

      try {
        const result = await api("/api/scan", {
          method: "POST",
          body: JSON.stringify({ folderPath: scanPath.value.trim() }),
        });
        scanResult.value = result;
        showSuccess("Project scanned successfully!");
        // Refresh projects list in background
        refreshStatus();
      } catch {
        // Error already shown
      } finally {
        scanning.value = false;
      }
    }

    // --- Generate: Create quiz questions ---

    async function generateForProject(projectId) {
      if (generating.value) return;
      generating.value = projectId;

      try {
        const result = await api("/api/generate", {
          method: "POST",
          body: JSON.stringify({ projectId, count: 10, mode: "mixed" }),
        });
        showSuccess(`Generated ${result.generated} questions!`);
        await refreshStatus();
      } catch {
        // Error already shown
      } finally {
        generating.value = false;
      }
    }

    async function generateFromScan() {
      if (!scanResult.value || generating.value) return;
      const projectId = scanResult.value.project.id;
      generating.value = true;

      try {
        const result = await api("/api/generate", {
          method: "POST",
          body: JSON.stringify({ projectId, count: 10, mode: "mixed" }),
        });
        generatedCount.value = result.generated;
        showSuccess(`Generated ${result.generated} questions!`);
        await refreshStatus();
      } catch {
        // Error already shown
      } finally {
        generating.value = false;
      }
    }

    // --- Quiz: Daily session ---

    async function startDailyQuiz() {
      quizLoading.value = true;
      try {
        const data = await api("/api/quiz/daily");
        if (data.questions.length === 0) {
          showError("No questions due for review. Generate more questions first!");
          return;
        }
        quizQuestions.value = data.questions;
        quizSessionId.value = data.sessionId;
        quizCurrentIndex.value = 0;
        quizScore.value = 0;
        answered.value = false;
        selectedAnswer.value = null;
        openAnswerText.value = "";
        view.value = "quiz";
      } catch {
        // Error already shown
      } finally {
        quizLoading.value = false;
      }
    }

    async function startProjectQuiz(projectId) {
      quizLoading.value = true;
      try {
        const data = await api(`/api/quiz/daily?projectId=${projectId}`);
        if (data.questions.length === 0) {
          showError("No questions due for this project. Generate more first!");
          return;
        }
        quizQuestions.value = data.questions;
        quizSessionId.value = data.sessionId;
        quizCurrentIndex.value = 0;
        quizScore.value = 0;
        answered.value = false;
        selectedAnswer.value = null;
        openAnswerText.value = "";
        view.value = "quiz";
      } catch {
        // Error already shown
      } finally {
        quizLoading.value = false;
      }
    }

    // --- Quiz: Answer handling ---

    /**
     * Handles selecting an answer for single-choice or true/false
     * @param {string} choice - The selected answer
     */
    function selectAnswer(choice) {
      if (answered.value) return;
      selectedAnswer.value = choice;
      answered.value = true;

      // Check correctness: compare first letter for choice-type, or full string
      const q = currentQ.value;
      let isCorrect = false;

      if (q.type === "single-choice") {
        // Compare choice letter (A, B, C, D) with the answer
        const selectedLetter = choice.charAt(0).toUpperCase();
        const correctLetter = q.answer.charAt(0).toUpperCase();
        isCorrect = selectedLetter === correctLetter;
      } else if (q.type === "true-false") {
        isCorrect = choice.toLowerCase() === q.answer.toLowerCase();
      }

      lastCorrect.value = isCorrect;
      if (isCorrect) quizScore.value++;

      // Report answer to backend (async, don't block UI)
      api("/api/quiz/answer", {
        method: "POST",
        body: JSON.stringify({
          questionId: q.id,
          isCorrect,
          sessionId: quizSessionId.value,
        }),
      }).catch(() => {});
    }

    /**
     * Handles submitting an open-ended answer
     * For open/find-the-bug: we show the correct answer and let user self-assess
     */
    function submitOpenAnswer() {
      if (answered.value) return;
      answered.value = true;

      // For open questions, we can't auto-check — show the answer and let user compare
      // Consider it "correct" if answer contains key terms (basic fuzzy match)
      const q = currentQ.value;
      const userAns = openAnswerText.value.toLowerCase().trim();
      const correctAns = q.answer.toLowerCase().trim();

      // Simple fuzzy: check if at least 50% of words in the answer appear in user's response
      const correctWords = correctAns.split(/\s+/).filter((w) => w.length > 3);
      const matchCount = correctWords.filter((w) => userAns.includes(w)).length;
      const isCorrect = correctWords.length > 0 && matchCount / correctWords.length >= 0.5;

      lastCorrect.value = isCorrect;
      if (isCorrect) quizScore.value++;

      api("/api/quiz/answer", {
        method: "POST",
        body: JSON.stringify({
          questionId: q.id,
          isCorrect,
          sessionId: quizSessionId.value,
        }),
      }).catch(() => {});
    }

    /**
     * Returns CSS class for a choice button based on answer state
     * @param {string} choice - The choice text
     * @param {number} idx - Index of the choice
     * @returns {string} CSS class name
     */
    function choiceClass(choice, idx) {
      if (!answered.value) return "";

      const q = currentQ.value;
      let isThisCorrect = false;

      if (q.type === "single-choice") {
        const choiceLetter = choice.charAt(0).toUpperCase();
        const correctLetter = q.answer.charAt(0).toUpperCase();
        isThisCorrect = choiceLetter === correctLetter;
      } else if (q.type === "true-false") {
        isThisCorrect = choice.toLowerCase() === q.answer.toLowerCase();
      }

      if (isThisCorrect) return "correct";
      if (choice === selectedAnswer.value && !isThisCorrect) return "incorrect";
      return "";
    }

    /**
     * Moves to the next question or finishes the quiz
     */
    async function nextQuestion() {
      quizCurrentIndex.value++;
      answered.value = false;
      selectedAnswer.value = null;
      openAnswerText.value = "";

      // If quiz is complete, save session
      if (quizCurrentIndex.value >= quizQuestions.value.length) {
        try {
          await api("/api/quiz/complete", {
            method: "POST",
            body: JSON.stringify({
              sessionId: quizSessionId.value,
              correct: quizScore.value,
              total: quizQuestions.value.length,
            }),
          });
        } catch {
          // Silent fail
        }
      }
    }

    // --- Mount ---
    onMounted(() => init());

    return {
      // State
      loading, view, status, projects,
      errorMsg, successMsg,
      // Setup
      apiKeyInput, saveApiKey,
      // Scan
      scanPath, scanning, scanResult, generating, generatedCount,
      scanFolder, generateFromScan,
      // Dashboard
      timeOfDay, navigate, generateForProject,
      // Quiz
      quizLoading, quizQuestions, quizCurrentIndex, quizScore,
      quizSessionId, answered, selectedAnswer, lastCorrect, openAnswerText,
      currentQ,
      startDailyQuiz, startProjectQuiz,
      selectAnswer, submitOpenAnswer, choiceClass, nextQuestion,
    };
  },
});

app.mount("#app");
