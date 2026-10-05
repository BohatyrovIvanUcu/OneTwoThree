import type { ReactNode } from "react"
import { CalendarDays, CalendarRange, Link2, Users } from "lucide-react"

const HIGHLIGHTS = [
  { icon: CalendarRange, text: "Week and day calendar of every meeting" },
  { icon: Users, text: "Participants on each meeting" },
  { icon: Link2, text: "Call link or place, one click away" },
]

/** Two-column glassmorphism frame for the sign-in and sign-up pages. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative grid min-h-screen items-center gap-6 overflow-hidden p-2 sm:p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:p-6">
      {/* Decorative ambient backdrop lights */}
      <div className="pointer-events-none fixed top-10 left-10 size-[500px] rounded-full bg-indigo-600/20 blur-[140px]" />
      <div className="pointer-events-none fixed right-10 bottom-10 size-[500px] rounded-full bg-purple-600/20 blur-[140px]" />
      <div className="pointer-events-none fixed top-1/2 left-1/2 size-[450px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-500/15 blur-[130px]" />

      <aside className="relative hidden h-full min-h-[620px] overflow-hidden rounded-3xl border border-white/20 bg-white/[0.05] p-10 text-white shadow-[0_20px_50px_0_rgba(0,0,0,0.4),inset_0_1px_1px_0_rgba(255,255,255,0.25)] backdrop-blur-2xl lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -top-24 -left-24 size-80 rounded-full bg-indigo-500/25 blur-3xl" />
        <div className="pointer-events-none absolute -right-24 -bottom-24 size-80 rounded-full bg-purple-500/20 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-2xl border border-white/30 bg-gradient-to-br from-indigo-500/80 to-purple-600/80 shadow-[0_4px_16px_rgba(99,102,241,0.4)] backdrop-blur-md">
            <CalendarDays className="size-6 text-white" />
          </span>
          <span className="font-serif text-[15px] leading-tight font-semibold">
            Meetings
            <br />
            <span className="font-sans text-xs font-normal text-indigo-300">Scheduler</span>
          </span>
        </div>

        <div className="relative my-auto max-w-md py-10">
          <p className="font-serif text-3xl leading-snug font-semibold tracking-tight text-white">
            Plan meetings, invite people and know where to be.
          </p>
          <ul className="mt-8 space-y-3.5">
            {HIGHLIGHTS.map(({ icon: Icon, text }) => (
              <li
                key={text}
                className="flex items-center gap-3.5 rounded-2xl border border-white/15 bg-white/[0.06] p-3.5 shadow-xs backdrop-blur-md transition-all hover:border-white/25 hover:bg-white/[0.1]"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-indigo-400/30 bg-indigo-500/25 text-indigo-300">
                  <Icon className="size-4" />
                </span>
                <span className="text-sm font-medium text-slate-200">{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-slate-400">
          © {new Date().getFullYear()} Meetings Scheduler. Glassmorphism Edition.
        </p>
      </aside>

      <main className="relative flex flex-col items-center justify-center px-4 py-8 sm:px-6">
        <div className="mb-6 flex items-center gap-3 text-white lg:hidden">
          <span className="flex size-10 items-center justify-center rounded-xl border border-white/30 bg-gradient-to-br from-indigo-500 to-purple-600 shadow-md">
            <CalendarDays className="size-5 text-white" />
          </span>
          <span className="font-serif text-sm leading-tight font-semibold">
            Meetings
            <br />
            <span className="font-sans text-xs font-normal text-indigo-300">Scheduler</span>
          </span>
        </div>
        <div className="w-full max-w-md rounded-3xl border border-white/20 bg-slate-900/70 p-6 shadow-[0_24px_64px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.25)] backdrop-blur-2xl sm:p-9">
          {children}
        </div>
      </main>
    </div>
  )
}
