import { CalendarDays } from "lucide-react"

const COLUMNS = [
  {
    title: "Meetings",
    links: [{ label: "All meetings", href: "/home" }],
  },
]

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-white/15 bg-slate-950/50 text-white backdrop-blur-2xl transition-all">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.5fr_1fr]">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-2xl border border-white/30 bg-gradient-to-br from-indigo-500/80 to-purple-600/80 shadow-[0_4px_16px_rgba(99,102,241,0.4)] backdrop-blur-md">
              <CalendarDays className="size-6 text-white" />
            </span>
            <span className="font-serif text-base leading-tight font-semibold">
              Meetings
              <br />
              <span className="font-sans text-xs font-normal text-indigo-300">Scheduler</span>
            </span>
          </div>
          <p className="max-w-sm text-xs leading-relaxed text-slate-400">
            Fast, modern calendar scheduling with frosted glassmorphic UI aesthetics.
          </p>
        </div>
        {COLUMNS.map((column) => (
          <div key={column.title}>
            <h2 className="mb-3 text-sm font-semibold tracking-wider text-slate-300 uppercase">
              {column.title}
            </h2>
            <ul className="space-y-2 text-sm">
              {column.links.map((link) => (
                <li key={link.label}>
                  <a href={link.href} className="text-slate-400 transition-colors hover:text-white">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10 bg-black/40 backdrop-blur-md">
        <p className="mx-auto max-w-7xl px-4 py-4 text-xs text-slate-400 sm:px-6">
          © {new Date().getFullYear()} Meetings Scheduler. Glassmorphism Design System. All rights
          reserved.
        </p>
      </div>
    </footer>
  )
}
