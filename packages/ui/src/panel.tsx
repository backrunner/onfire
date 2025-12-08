import type { PropsWithChildren, ReactNode } from 'react';

export const Panel = ({ title, description, action, children }: PropsWithChildren<{ title: string; description?: string; action?: ReactNode }>) => (
  <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
    <div className="mb-3 flex items-start justify-between gap-3">
      <div>
        <h3 className="text-base font-semibold text-zinc-900">{title}</h3>
        {description && <p className="text-sm text-zinc-500">{description}</p>}
      </div>
      {action}
    </div>
    <div className="flex flex-col gap-3 text-sm text-zinc-800">{children}</div>
  </section>
);
