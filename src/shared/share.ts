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

/**
 * Where the player landed among today's finishers, rounded up so the badge is
 * never better than the truth (rank 1 of 40 reads "Top 3%", not "Top 2.5%").
 */
export function topPercent(rank: number, playersToday: number): number | null {
  if (rank < 1 || playersToday < 1 || rank > playersToday) return null;
  return Math.max(1, Math.ceil((rank / playersToday) * 100));
}

/** Share of the day's awarded prize money this player took, in percent. */
export function prizeSharePercent(prizeLuna: bigint, poolLuna: bigint): number | null {
  if (prizeLuna <= 0n || poolLuna <= 0n) return null;
  return Number((prizeLuna * 1000n) / poolLuna) / 10;
}
