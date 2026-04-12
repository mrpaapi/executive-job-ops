import clsx from 'clsx'

/**
 * PageHeader — consistent vibrant heading for every top-level page.
 *
 * Props:
 *   icon: ReactNode (optional) — lucide icon element
 *   eyebrow: string (optional)  — small caps label above the title
 *   title: string               — gradient title text
 *   subtitle: string (optional) — quiet helper line below
 *   accent: string (optional)   — extra accent class
 *   right: ReactNode (optional) — slot for buttons aligned right
 *   compact: bool (optional)    — half-height variant for dense pages
 */
export default function PageHeader({ icon, eyebrow, title, subtitle, right, accent, compact }) {
  return (
    <div className={clsx('page-header animate-bounce-in', compact && 'page-header--compact', accent)}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className={clsx('flex min-w-0', compact ? 'items-center gap-3' : 'items-start gap-4')}>
          {icon && (
            <div className={clsx('page-header-icon', compact && 'page-header-icon--compact')}>
              {icon}
            </div>
          )}
          <div className="min-w-0">
            {eyebrow && !compact && (
              <p className="text-[11px] uppercase tracking-[0.18em] font-bold text-indigo-500 mb-1">
                {eyebrow}
              </p>
            )}
            <h1 className={clsx('page-title-fancy', compact && 'page-title-fancy--compact')}>{title}</h1>
            {subtitle && !compact && (
              <p className="mt-2 text-sm text-slate-500 max-w-xl">{subtitle}</p>
            )}
            {compact && eyebrow && (
              <p className="text-[11px] text-slate-400 font-medium mt-0.5 truncate">{eyebrow}</p>
            )}
          </div>
        </div>
        {right && <div className="flex items-center gap-2 flex-shrink-0">{right}</div>}
      </div>
    </div>
  )
}
