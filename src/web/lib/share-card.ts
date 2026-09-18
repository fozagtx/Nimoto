import { nimToLuna, prizeSharePercent, topPercent, type AttemptResultResponse } from '@/shared';

const WIDTH = 1200;
const HEIGHT = 675;

const COLORS = {
  navy: '#042c60',
  owl: '#58cc02',
  owlSoft: '#d7ffb8',
  bee: '#ffc800',
  white: '#ffffff',
  faded: 'rgba(255, 255, 255, 0.72)',
};

export interface ShareCardInput {
  result: AttemptResultResponse;
  referralUrl: string;
  handle: string;
}

interface Stat {
  label: string;
  value: string;
}

export function shareCardStats(result: AttemptResultResponse): Stat[] {
  const stats: Stat[] = [
    { label: 'Correct', value: `${result.correctCount}/${result.questionCount}` },
    { label: 'Streak', value: `${result.currentStreak} day${result.currentStreak === 1 ? '' : 's'}` },
  ];
  if (result.rank !== null) {
    stats.unshift({ label: 'Rank', value: `#${result.rank} of ${result.playersToday}` });
  }
  if (result.prizeNim) {
    const share = prizeSharePercent(nimToLuna(result.prizeNim), nimToLuna(result.nextChallengePoolNim));
    stats.push({
      label: 'NIM won',
      value: share === null ? `${result.prizeNim} NIM` : `${result.prizeNim} NIM · ${share}% of pool`,
    });
  }
  return stats;
}

/** The single boast at the top of the card: percentile if ranked, score otherwise. */
export function shareCardHeadline(result: AttemptResultResponse): string {
  const percent = result.rank === null ? null : topPercent(result.rank, result.playersToday);
  if (percent !== null) return `Top ${percent}% today`;
  return `${result.correctCount}/${result.questionCount} correct`;
}

export function drawShareCard(canvas: HTMLCanvasElement, { result, referralUrl, handle }: ShareCardInput): void {
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable');

  const backdrop = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  backdrop.addColorStop(0, COLORS.navy);
  backdrop.addColorStop(1, '#0a4a8f');
  ctx.fillStyle = backdrop;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Brand slab down the left edge, mirroring the app's flat "lip" surfaces.
  ctx.fillStyle = COLORS.owl;
  ctx.fillRect(0, 0, 24, HEIGHT);

  ctx.textBaseline = 'top';
  ctx.fillStyle = COLORS.owlSoft;
  ctx.font = '800 34px Nunito, system-ui, sans-serif';
  ctx.fillText('NIMOTO ⚡ DAILY BRAIN SPRINT', 80, 64);

  ctx.fillStyle = COLORS.white;
  ctx.font = '900 132px Nunito, system-ui, sans-serif';
  ctx.fillText(result.totalScore.toLocaleString('en-US'), 80, 128);

  ctx.fillStyle = COLORS.bee;
  ctx.font = '900 56px Nunito, system-ui, sans-serif';
  ctx.fillText(shareCardHeadline(result), 80, 288);

  const stats = shareCardStats(result);
  stats.forEach((stat, index) => {
    const x = 80 + (index % 2) * 540;
    const y = 388 + Math.floor(index / 2) * 116;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.10)';
    roundedRect(ctx, x, y, 500, 96, 20);
    ctx.fill();
    ctx.fillStyle = COLORS.faded;
    ctx.font = '800 22px Nunito, system-ui, sans-serif';
    ctx.fillText(stat.label.toUpperCase(), x + 28, y + 18);
    ctx.fillStyle = COLORS.white;
    ctx.font = '900 40px Nunito, system-ui, sans-serif';
    ctx.fillText(stat.value, x + 28, y + 44);
  });

  ctx.fillStyle = COLORS.faded;
  ctx.font = '800 26px Nunito, system-ui, sans-serif';
  ctx.fillText(`${referralUrl}   ${handle}`, 80, HEIGHT - 72);
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

export async function renderShareCard(input: ShareCardInput): Promise<Blob> {
  const canvas = document.createElement('canvas');
  drawShareCard(canvas, input);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Could not encode the share image');
  return blob;
}

export type ShareCardOutcome = 'shared' | 'downloaded' | 'failed';

/**
 * Native share sheet when the platform can attach files (Nimiq Pay, mobile
 * browsers), otherwise the PNG is downloaded so it can be attached by hand.
 */
export async function shareCardImage(blob: Blob, text: string, url: string): Promise<ShareCardOutcome> {
  const file = new File([blob], 'nimoto-score.png', { type: 'image/png' });
  const nav = window.navigator as Navigator & {
    share?: (data: ShareData) => Promise<void>;
    canShare?: (data: ShareData) => boolean;
  };
  if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], text, url });
      return 'shared';
    } catch {
      // Dismissed share sheet falls through to the download path.
    }
  }
  try {
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = 'nimoto-score.png';
    link.click();
    URL.revokeObjectURL(objectUrl);
    return 'downloaded';
  } catch {
    return 'failed';
  }
}

export function tweetIntentUrl(text: string, url: string, handle: string): string {
  const params = new URLSearchParams({ text: `${text} ${handle}`, url });
  return `https://twitter.com/intent/tweet?${params.toString()}`;
}

/** Caption reused by the share sheet and the X intent; the card carries the numbers. */
export function shareCardCaption(result: AttemptResultResponse): string {
  return `${shareCardHeadline(result)} — ${result.totalScore.toLocaleString('en-US')} points on Nimoto ⚡ Can you beat me?`;
}
