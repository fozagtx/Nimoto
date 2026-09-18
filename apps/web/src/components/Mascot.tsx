export type MascotMood = 'happy' | 'thinking' | 'cheer' | 'sad';

/**
 * Nim, the original Nimoto mascot: a rounded lightning sprite. Drawn inline so
 * there is no external art dependency and no third-party character likeness.
 */
export function Mascot({ mood = 'happy', size = 96 }: { mood?: MascotMood; size?: number }) {
  const eyeY = mood === 'sad' ? 40 : 38;
  const mouth =
    mood === 'sad'
      ? 'M40 58 q10 -8 20 0'
      : mood === 'thinking'
        ? 'M42 56 h16'
        : 'M38 54 q12 12 24 0';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={`Nim the mascot looking ${mood}`}
      className={mood === 'cheer' ? 'animate-pop' : 'animate-float'}
    >
      <circle cx="50" cy="50" r="46" fill="#d7ffb8" />
      <path d="M54 12 L30 54 h16 l-6 34 L72 44 H54 l8 -32 Z" fill="#ffc800" stroke="#ff9600" strokeWidth="3" strokeLinejoin="round" />
      <circle cx="41" cy={eyeY} r="4" fill="#042c60" />
      <circle cx="61" cy={eyeY} r="4" fill="#042c60" />
      <path d={mouth} stroke="#042c60" strokeWidth="3.5" strokeLinecap="round" fill="none" />
      {mood === 'cheer' ? (
        <>
          <circle cx="16" cy="26" r="4" fill="#ce82ff" />
          <circle cx="86" cy="32" r="3" fill="#1cb0f6" />
          <circle cx="80" cy="76" r="4" fill="#58cc02" />
        </>
      ) : null}
    </svg>
  );
}
