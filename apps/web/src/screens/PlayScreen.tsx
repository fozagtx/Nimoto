import { useCallback, useEffect, useRef, useState } from 'react';
import type { AnswerResponse, AttemptResultResponse, QuestionView } from '@nimoto/shared';
import { api, ApiRequestError } from '../lib/api.js';
import { Button } from '../components/Button.js';
import { StatusMessage } from '../components/StatusMessage.js';
import { ResultsPanel } from './ResultsPanel.js';
import type { Route } from '../routes.js';

type Feedback = Pick<AnswerResponse, 'isCorrect' | 'correctOption' | 'pointsEarned' | 'explanation'>;

const OPTION_LABELS = ['A', 'B', 'C', 'D'];

export function PlayScreen({
  mode,
  navigate,
}: {
  mode: 'ranked' | 'practice';
  navigate: (route: Route) => void;
}) {
  const [question, setQuestion] = useState<QuestionView | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [questionCount, setQuestionCount] = useState(5);
  const [selected, setSelected] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [result, setResult] = useState<AttemptResultResponse | null>(null);
  const [error, setError] = useState<{ message: string; fatal: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const started = useRef(false);
  // The next question is held back until the player dismisses the feedback card.
  const stagedNext = useRef<QuestionView | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void api.track(mode === 'ranked' ? 'ranked_attempt_started' : 'app_opened', { mode });
    api
      .startAttempt(mode)
      .then((state) => {
        setAttemptId(state.attemptId);
        setQuestion(state.currentQuestion);
        setAnsweredCount(state.answeredCount);
        setQuestionCount(state.questionCount);
        setResult(state.result);
      })
      .catch((caught: unknown) => {
        setError({
          message: caught instanceof ApiRequestError ? caught.message : 'Could not start the run.',
          fatal: true,
        });
      });
  }, [mode]);

  const submit = useCallback(
    async (option: string) => {
      if (!attemptId || !question || busy || feedback) return;
      setBusy(true);
      setSelected(option);
      try {
        const response = await api.answer(attemptId, question.questionId, option);
        setFeedback({
          isCorrect: response.isCorrect,
          correctOption: response.correctOption,
          pointsEarned: response.pointsEarned,
          explanation: response.explanation,
        });
        setAnsweredCount((count) => count + 1);
        if (response.result) {
          setResult(response.result);
          void api.track('ranked_attempt_completed', { mode, score: response.result.totalScore });
        }
        stagedNext.current = response.nextQuestion;
      } catch (caught) {
        const apiError = caught instanceof ApiRequestError ? caught : null;
        setSelected(null);
        setError({
          message: apiError?.message ?? 'That answer did not go through.',
          fatal: apiError ? ['attempt_expired', 'attempt_completed', 'attempt_not_yours'].includes(apiError.code) : false,
        });
      } finally {
        setBusy(false);
      }
    },
    [attemptId, busy, feedback, mode, question],
  );

  const advance = useCallback(() => {
    setFeedback(null);
    setSelected(null);
    setQuestion(stagedNext.current);
    stagedNext.current = null;
  }, []);

  if (error?.fatal) {
    return (
      <StatusMessage
        tone="error"
        title="This run cannot continue"
        description={error.message}
        action={<Button onClick={() => navigate({ name: 'home' })}>Back home</Button>}
      />
    );
  }

  if (result && !feedback) {
    return <ResultsPanel result={result} navigate={navigate} />;
  }

  if (!question) {
    return <StatusMessage title="Dealing your questions…" />;
  }

  const progress = Math.min(questionCount, feedback ? answeredCount : answeredCount + 1);

  return (
    <div className="space-y-4">
      <header className="space-y-2">
        <div className="flex items-center justify-between text-sm font-bold text-muted">
          <span>
            Question {progress} of {questionCount}
          </span>
          <span className="rounded-lg bg-[#f2f2f2] px-2 py-1 text-xs uppercase tracking-cta">
            {mode === 'ranked' ? 'Ranked' : 'Practice'}
          </span>
        </div>
        <div
          className="h-3 w-full overflow-hidden rounded-full bg-hairline"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={questionCount}
          aria-valuenow={progress}
          aria-label="Run progress"
        >
          <div
            className="h-full rounded-full bg-owl transition-all duration-300"
            style={{ width: `${(progress / questionCount) * 100}%` }}
          />
        </div>
      </header>

      <section className="surface p-5">
        <p className="text-[11px] font-bold uppercase tracking-cta text-muted">{question.category}</p>
        <h1 className="mt-1 font-display text-xl font-extrabold leading-snug text-navy">{question.prompt}</h1>
      </section>

      {error && !error.fatal ? (
        <p role="alert" className="rounded-xl border-2 border-cardinal bg-cardinal-soft px-3 py-2 text-sm font-bold text-navy">
          {error.message}
        </p>
      ) : null}

      <ul className="space-y-3">
        {question.options.map((option, index) => {
          const isSelected = selected === option.key;
          const isCorrectAnswer = feedback?.correctOption === option.key;
          const state = !feedback
            ? isSelected
              ? 'border-macaw bg-macaw-soft'
              : 'border-hairline bg-white'
            : isCorrectAnswer
              ? 'border-owl bg-owl-soft'
              : isSelected
                ? 'border-cardinal bg-cardinal-soft'
                : 'border-hairline bg-white opacity-70';

          return (
            <li key={option.key}>
              <button
                type="button"
                onClick={() => void submit(option.key)}
                disabled={busy || feedback !== null}
                aria-pressed={isSelected}
                className={`flex min-h-[56px] w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left font-bold text-navy shadow-card transition-transform duration-100 active:translate-y-[2px] disabled:cursor-default ${state}`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 border-current text-xs font-black">
                  {OPTION_LABELS[index]}
                </span>
                <span className="flex-1">{option.text}</span>
                {feedback && isCorrectAnswer ? <span aria-hidden>✓</span> : null}
                {feedback && isSelected && !isCorrectAnswer ? <span aria-hidden>✕</span> : null}
              </button>
            </li>
          );
        })}
      </ul>

      {feedback ? (
        <section
          role="status"
          className={`surface p-4 ${feedback.isCorrect ? 'border-owl bg-owl-soft' : 'border-cardinal bg-cardinal-soft'}`}
        >
          <p className="font-display text-base font-extrabold text-navy">
            {feedback.isCorrect ? `Correct — +${feedback.pointsEarned} points` : 'Not quite — 0 points'}
          </p>
          {feedback.explanation ? <p className="mt-1 text-sm text-ink">{feedback.explanation}</p> : null}
          <Button full className="mt-4" onClick={advance}>
            {stagedNext.current ? 'Next question' : 'See results'}
          </Button>
        </section>
      ) : null}
    </div>
  );
}
