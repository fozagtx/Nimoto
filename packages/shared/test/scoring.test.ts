import { describe, expect, it } from 'vitest';
import { MAX_POSSIBLE_SCORE, SCORING, scoreAnswer, summarizeAttempt } from '../src/scoring.js';

describe('scoreAnswer', () => {
  it('awards nothing for wrong answers regardless of speed', () => {
    expect(scoreAnswer(false, 0).points).toBe(0);
    expect(scoreAnswer(false, 20_000).points).toBe(0);
  });

  it('awards the full bonus for an instant correct answer', () => {
    const score = scoreAnswer(true, 0);
    expect(score.basePoints).toBe(SCORING.BASE_POINTS);
    expect(score.timeBonus).toBe(SCORING.MAX_TIME_BONUS);
    expect(score.points).toBe(1500);
  });

  it('decays the bonus linearly and floors it at zero', () => {
    expect(scoreAnswer(true, 7_500).timeBonus).toBe(250);
    expect(scoreAnswer(true, 15_000).timeBonus).toBe(0);
    expect(scoreAnswer(true, 60_000).points).toBe(SCORING.BASE_POINTS);
  });

  it('is monotonic in elapsed time', () => {
    let previous = Number.POSITIVE_INFINITY;
    for (let ms = 0; ms <= 16_000; ms += 250) {
      const points = scoreAnswer(true, ms).points;
      expect(points).toBeLessThanOrEqual(previous);
      previous = points;
    }
  });

  it('clamps negative elapsed values', () => {
    expect(scoreAnswer(true, -100).elapsedMs).toBe(0);
  });
});

describe('summarizeAttempt', () => {
  it('sums score, correct count and duration', () => {
    const answers = [
      scoreAnswer(true, 1_000),
      scoreAnswer(false, 2_000),
      scoreAnswer(true, 3_000),
      scoreAnswer(true, 15_000),
      scoreAnswer(false, 500),
    ];
    const totals = summarizeAttempt(answers);
    expect(totals.correctCount).toBe(3);
    expect(totals.totalDurationMs).toBe(21_500);
    expect(totals.totalScore).toBe(
      answers.reduce((sum, answer) => sum + answer.points, 0),
    );
  });

  it('caps at the documented maximum', () => {
    const perfect = Array.from({ length: SCORING.QUESTIONS_PER_RUN }, () => scoreAnswer(true, 0));
    expect(summarizeAttempt(perfect).totalScore).toBe(MAX_POSSIBLE_SCORE);
  });
});
