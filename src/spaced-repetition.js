// spaced-repetition.js — SM-2 algorithm implementation
// Determines when a question should be reviewed next based on user performance

/**
 * SM-2 Algorithm
 *
 * Quality grades:
 *   0 — complete blackout (no idea)
 *   1 — wrong, but recognized correct answer
 *   2 — wrong, but answer felt familiar
 *   3 — correct, but with serious difficulty
 *   4 — correct, with some hesitation
 *   5 — perfect, instant recall
 *
 * After each review:
 *   - If quality < 3: reset repetitions to 0, interval to 1 day
 *   - If quality >= 3: increase interval based on repetition count
 *   - Ease factor adjusts based on performance (minimum 1.3)
 */

/**
 * Calculates the next review schedule after a user answers a question
 *
 * @param {object} current - Current review state
 * @param {number} current.ease_factor - Current ease factor (default 2.5)
 * @param {number} current.interval_d - Current interval in days (default 0)
 * @param {number} current.repetitions - Number of successful repetitions (default 0)
 * @param {number} quality - User's self-assessed quality grade (0-5)
 * @returns {object} Updated review state { ease_factor, interval_d, repetitions, next_review }
 */
export function calculateNextReview(current, quality) {
  let { ease_factor = 2.5, interval_d = 0, repetitions = 0 } = current;

  // Clamp quality to 0-5
  quality = Math.min(5, Math.max(0, quality));

  if (quality < 3) {
    // Failed: reset to beginning
    repetitions = 0;
    interval_d = 1;
  } else {
    // Successful recall
    if (repetitions === 0) {
      interval_d = 1;
    } else if (repetitions === 1) {
      interval_d = 6;
    } else {
      interval_d = Math.round(interval_d * ease_factor);
    }
    repetitions++;
  }

  // Update ease factor using SM-2 formula
  ease_factor =
    ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));

  // Ease factor minimum is 1.3
  if (ease_factor < 1.3) ease_factor = 1.3;

  // Calculate the next review date
  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + interval_d);
  const next_review = nextDate.toISOString().slice(0, 19).replace("T", " ");

  return {
    ease_factor: Math.round(ease_factor * 100) / 100, // Round to 2 decimal places
    interval_d,
    repetitions,
    next_review,
  };
}

/**
 * Maps a simple correct/incorrect answer to a SM-2 quality grade
 *
 * For simplicity in the UI, we convert binary answers to quality grades:
 * - Correct answer → grade 4 (solid recall)
 * - Incorrect answer → grade 1 (recognized answer but got it wrong)
 *
 * @param {boolean} isCorrect - Whether the user answered correctly
 * @param {number} confidenceBonus - Optional: 0 or 1 extra for fast/confident answers
 * @returns {number} Quality grade 0-5
 */
export function answerToQuality(isCorrect, confidenceBonus = 0) {
  if (isCorrect) {
    return Math.min(5, 4 + confidenceBonus); // 4 or 5
  }
  return 1; // Wrong but saw the answer
}
