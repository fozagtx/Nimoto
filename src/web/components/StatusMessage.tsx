import type { ReactNode } from 'react';
import { Mascot } from './Mascot.js';

export function StatusMessage({
  tone = 'neutral',
  title,
  description,
  action,
}: {
  tone?: 'neutral' | 'error' | 'success';
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  const border =
    tone === 'error' ? 'border-cardinal bg-cardinal-soft' : tone === 'success' ? 'border-owl bg-owl-soft' : 'border-hairline bg-white';

  return (
    <section role={tone === 'error' ? 'alert' : 'status'} className={`surface ${border} p-6 text-center`}>
      <div className="flex justify-center">
        <Mascot mood={tone === 'error' ? 'sad' : tone === 'success' ? 'cheer' : 'thinking'} size={72} />
      </div>
      <h2 className="mt-3 font-display text-lg font-extrabold text-navy">{title}</h2>
      {description ? <p className="mt-2 text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </section>
  );
}
