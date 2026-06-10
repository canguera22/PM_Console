import type { ComponentType, ReactNode } from 'react';

interface PageShellProps {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  action?: ReactNode;
  children: ReactNode;
  maxWidthClass?: string;
}

export function PageShell({
  eyebrow,
  title,
  description,
  icon: Icon,
  action,
  children,
  maxWidthClass = 'max-w-7xl',
}: PageShellProps) {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className={`mx-auto px-4 py-6 sm:px-6 lg:px-8 ${maxWidthClass}`}>
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              {eyebrow ? (
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-blue-700">
                  {eyebrow}
                </p>
              ) : null}
              <div className="flex items-center gap-3">
                {Icon ? (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-700">
                    <Icon className="h-5 w-5" />
                  </span>
                ) : null}
                <h1 className="m-0 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
                  {title}
                </h1>
              </div>
              {description ? (
                <div className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
                  {description}
                </div>
              ) : null}
            </div>
            {action ? <div className="shrink-0">{action}</div> : null}
          </div>
        </div>
      </div>

      <div className={`mx-auto px-4 py-8 sm:px-6 lg:px-8 ${maxWidthClass}`}>
        {children}
      </div>
    </div>
  );
}
