export interface ShareTextInput {
  totalScore: number;
  correctCount: number;
  questionCount: number;
  rank: number | null;
  playersToday: number;
  referralUrl: string;
}

/**
 * Share copy only ever contains facts the server computed for this attempt —
 * never unanswered questions, never invented player counts.
 */
export function buildShareText(input: ShareTextInput): string {
  const lines = [`I scored ${input.totalScore.toLocaleString('en-US')} on today's Nimoto ⚡`];
  if (input.rank !== null) {
    lines.push(`Rank #${input.rank} / ${input.playersToday}`);
  } else {
    lines.push(`${input.correctCount} / ${input.questionCount} correct in practice mode`);
  }
  lines.push('Can you beat me?', input.referralUrl);
  return lines.join('\n');
}
