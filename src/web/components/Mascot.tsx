import { Mascot as PageMascot } from 'page-mascot';

export type MascotMood = 'happy' | 'thinking' | 'cheer' | 'sad';

const LABELS: Record<MascotMood, string> = {
  happy: 'Nimoto mascot, ready to play',
  thinking: 'Nimoto mascot, thinking',
  cheer: 'Nimoto mascot, cheering',
  sad: 'Nimoto mascot, disappointed',
};

/**
 * The Nimoto mascot: the "glasses" character from page-mascot. She follows the
 * cursor and reacts when poked; the two sprite sheets live in public/mascots.
 */
export function Mascot({ mood = 'happy', size = 96 }: { mood?: MascotMood; size?: number }) {
  return (
    <PageMascot
      directions="/mascots/glasses-directions.webp"
      reactions="/mascots/glasses-reactions.webp"
      size={size}
      label={LABELS[mood]}
      className={mood === 'cheer' ? 'animate-pop' : undefined}
    />
  );
}
