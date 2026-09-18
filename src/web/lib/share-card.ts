import { nimToLuna, prizeSharePercent, topPercent, type AttemptResultResponse } from '@/shared';
import { formatDuration } from './format.js';

const WIDTH = 1200;
const HEIGHT = 675;
const PAD = 72;

const COLORS = {
  navy: '#042c60',
  navyDeep: '#021a3d',
  owl: '#58cc02',
  owlSoft: '#d7ffb8',
  bee: '#ffc800',
  white: '#ffffff',
  faded: 'rgba(255, 255, 255, 0.72)',
  hairline: 'rgba(255, 255, 255, 0.14)',
};

const FONT = 'Nunito, system-ui, sans-serif';

export interface ShareCardPlayer {
  displayName: string | null;
  walletAddress: string;
}

export interface ShareCardInput {
  result: AttemptResultResponse;
  player: ShareCardPlayer;
  referralUrl: string;
  handle: string;
}

interface Stat {
  label: string;
  value: string;
}

/** The three small facts under the hero; the hero itself carries NIM and rank. */
export function shareCardStats(result: AttemptResultResponse): Stat[] {
  const correct = { label: 'Correct', value: `${result.correctCount}/${result.questionCount}` };
  const time = { label: 'Time', value: formatDuration(result.totalDurationMs) };
  if (result.mode !== 'ranked') return [correct, time];
  return [
    { label: 'Score', value: result.totalScore.toLocaleString('en-US') },
    correct,
    { label: 'Streak', value: `${result.currentStreak} day${result.currentStreak === 1 ? '' : 's'}` },
  ];
}

export interface ShareCardHero {
  label: string;
  value: string;
  detail: string | null;
}

/**
 * The boast: NIM won when there is a prize, the percentile when merely ranked,
 * the score for practice.
 */
export function shareCardHero(result: AttemptResultResponse): ShareCardHero {
  if (result.mode === 'ranked' && result.rank !== null) {
    if (result.prizeNim) {
      const share = prizeSharePercent(nimToLuna(result.prizeNim), nimToLuna(result.nextChallengePoolNim));
      return {
        label: 'NIM earned today',
        value: `+${result.prizeNim} NIM`,
        detail: share === null ? null : `${share}% of today's prize pool`,
      };
    }
    const percent = topPercent(result.rank, result.playersToday);
    return {
      label: 'Finished in the',
      value: percent === null ? `#${result.rank}` : `Top ${percent}%`,
      detail: `of ${result.playersToday.toLocaleString('en-US')} players today`,
    };
  }
  return {
    label: 'Practice score',
    value: result.totalScore.toLocaleString('en-US'),
    detail: `${result.correctCount}/${result.questionCount} correct in ${formatDuration(result.totalDurationMs)}`,
  };
}

export function shareCardHeadline(result: AttemptResultResponse): string {
  const hero = shareCardHero(result);
  return hero.detail ? `${hero.value} · ${hero.detail}` : hero.value;
}

/** `NQ63 6JD3 … 491H`: enough of the address to recognise, short enough to read. */
export function shortAddress(address: string): string {
  const parts = address.trim().split(/\s+/);
  if (parts.length < 4) return address;
  return `${parts[0]} ${parts[1]} … ${parts[parts.length - 1]}`;
}

export function playerLabel(player: ShareCardPlayer): string {
  return player.displayName?.trim() || shortAddress(player.walletAddress);
}

/** Stable per-wallet hue so a player's avatar looks the same on every card. */
export function avatarHue(address: string): number {
  let hash = 0;
  for (const char of address) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % 360;
}

function avatarInitials(player: ShareCardPlayer): string {
  const name = player.displayName?.trim();
  if (name) {
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() ?? '')
      .join('');
  }
  return player.walletAddress.replace(/\s+/g, '').slice(2, 4);
}

export function drawShareCard(
  canvas: HTMLCanvasElement,
  { result, player, referralUrl, handle }: ShareCardInput,
): void {
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable');

  const backdrop = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  backdrop.addColorStop(0, COLORS.navy);
  backdrop.addColorStop(1, COLORS.navyDeep);
  ctx.fillStyle = backdrop;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Soft glow behind the hero so the number reads as the light source.
  const glow = ctx.createRadialGradient(PAD + 120, 330, 20, PAD + 120, 330, 520);
  glow.addColorStop(0, 'rgba(88, 204, 2, 0.28)');
  glow.addColorStop(1, 'rgba(88, 204, 2, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.textBaseline = 'top';

  // Header: who played.
  const avatarR = 40;
  const avatarX = PAD + avatarR;
  const avatarY = PAD + avatarR;
  ctx.fillStyle = `hsl(${avatarHue(player.walletAddress)} 70% 55%)`;
  ctx.beginPath();
  ctx.arc(avatarX, avatarY, avatarR, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLORS.white;
  ctx.font = `900 30px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(avatarInitials(player), avatarX, avatarY + 2);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  const nameX = PAD + avatarR * 2 + 24;
  ctx.fillStyle = COLORS.white;
  ctx.font = `900 34px ${FONT}`;
  ctx.fillText(fitText(ctx, playerLabel(player), 560), nameX, PAD + 4);
  ctx.fillStyle = COLORS.faded;
  ctx.font = `700 22px ${FONT}`;
  ctx.fillText(
    player.displayName ? shortAddress(player.walletAddress) : 'Nimiq wallet',
    nameX,
    PAD + 48,
  );

  // Brand, top right.
  ctx.textAlign = 'right';
  ctx.fillStyle = COLORS.owl;
  ctx.font = `900 34px ${FONT}`;
  ctx.fillText('NIMOTO', WIDTH - PAD, PAD + 2);
  ctx.fillStyle = COLORS.faded;
  ctx.font = `800 20px ${FONT}`;
  ctx.fillText(
    result.mode === 'ranked' ? 'DAILY RANKED RUN' : 'PRACTICE RUN',
    WIDTH - PAD,
    PAD + 46,
  );
  ctx.textAlign = 'left';

  // Hero: the one number worth posting.
  const hero = shareCardHero(result);
  ctx.fillStyle = COLORS.faded;
  ctx.font = `800 26px ${FONT}`;
  ctx.fillText(hero.label.toUpperCase(), PAD, 226);
  ctx.fillStyle = result.prizeNim ? COLORS.owl : COLORS.bee;
  ctx.font = `900 136px ${FONT}`;
  ctx.fillText(fitText(ctx, hero.value, 720), PAD, 256);
  if (hero.detail) {
    ctx.fillStyle = COLORS.white;
    ctx.font = `800 32px ${FONT}`;
    ctx.fillText(hero.detail, PAD, 412);
  }

  // Rank badge, right of the hero.
  if (result.mode === 'ranked' && result.rank !== null) {
    const badgeW = 280;
    const badgeX = WIDTH - PAD - badgeW;
    const badgeY = 236;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    roundedRect(ctx, badgeX, badgeY, badgeW, 200, 28);
    ctx.fill();
    ctx.strokeStyle = COLORS.hairline;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.faded;
    ctx.font = `800 22px ${FONT}`;
    ctx.fillText('RANK', badgeX + badgeW / 2, badgeY + 26);
    ctx.fillStyle = COLORS.white;
    const rankSize = result.rank < 10 ? 96 : result.rank < 100 ? 84 : 64;
    ctx.font = `900 ${rankSize}px ${FONT}`;
    ctx.fillText(`#${result.rank}`, badgeX + badgeW / 2, badgeY + 56 + (96 - rankSize) / 2);
    ctx.fillStyle = COLORS.faded;
    ctx.font = `700 22px ${FONT}`;
    ctx.fillText(`of ${result.playersToday.toLocaleString('en-US')}`, badgeX + badgeW / 2, badgeY + 160);
    ctx.textAlign = 'left';
  }

  // Stats strip.
  const stats = shareCardStats(result);
  const gap = 20;
  const pillW = (WIDTH - PAD * 2 - gap * (stats.length - 1)) / stats.length;
  stats.forEach((stat, index) => {
    const x = PAD + index * (pillW + gap);
    const y = 476;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    roundedRect(ctx, x, y, pillW, 92, 20);
    ctx.fill();
    ctx.fillStyle = COLORS.faded;
    ctx.font = `800 20px ${FONT}`;
    ctx.fillText(stat.label.toUpperCase(), x + 24, y + 18);
    ctx.fillStyle = COLORS.white;
    ctx.font = `900 38px ${FONT}`;
    ctx.fillText(stat.value, x + 24, y + 42);
  });

  // Footer.
  ctx.fillStyle = COLORS.hairline;
  ctx.fillRect(PAD, HEIGHT - 84, WIDTH - PAD * 2, 2);
  ctx.fillStyle = COLORS.faded;
  ctx.font = `800 22px ${FONT}`;
  ctx.fillText(`Play today's run → ${referralUrl}`, PAD, HEIGHT - 60);
  ctx.textAlign = 'right';
  ctx.fillStyle = COLORS.owlSoft;
  ctx.fillText(handle, WIDTH - PAD, HEIGHT - 60);
  ctx.textAlign = 'left';
}

/** Trims with an ellipsis so long names never spill past their column. */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let trimmed = text;
  while (trimmed.length > 1 && ctx.measureText(`${trimmed}…`).width > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  return `${trimmed}…`;
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
  const hero = shareCardHero(result);
  const boast =
    result.prizeNim && result.rank !== null
      ? `I just earned ${result.prizeNim} NIM finishing #${result.rank} on Nimoto`
      : `${hero.value} — ${result.totalScore.toLocaleString('en-US')} points on Nimoto`;
  return `${boast} ⚡ Can you beat me?`;
}
