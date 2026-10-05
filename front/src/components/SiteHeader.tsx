import { useQueryClient } from "@tanstack/react-query"
import { CalendarDays, LogOut, Plus } from "lucide-react"
import { Link, useNavigate } from "react-router"

import { useMe } from "@/hooks/useMe"
import { authConfig, authEnabled, logoutFromCognito, signOut } from "@/lib/auth"

interface SiteHeaderProps {
  onNewMeeting: () => void
}

export function SiteHeader({ onNewMeeting }: SiteHeaderProps) {
  const { data: me } = useMe()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const handleSignOut = () => {
    signOut()
    queryClient.clear()
    navigate("/", { replace: true })
    if (authEnabled() && authConfig().domain) {
      logoutFromCognito()
    }
  }

  return (
    <header className="sticky top-3 z-40 mx-auto w-[calc(100%-2rem)] max-w-7xl transition-all">
      <div className="flex h-16 items-center justify-between gap-4 rounded-2xl border border-white/20 bg-slate-900/65 px-4 text-white shadow-[0_8px_32px_0_rgba(0,0,0,0.37),inset_0_1px_1px_0_rgba(255,255,255,0.25)] backdrop-blur-2xl sm:px-6">
        <div className="flex items-center gap-8">
          <Link to="/home" className="group flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl border border-white/30 bg-gradient-to-br from-indigo-500/80 to-purple-600/80 shadow-[0_4px_16px_rgba(99,102,241,0.35)] backdrop-blur-md transition-all group-hover:scale-105 group-hover:shadow-[0_6px_20px_rgba(99,102,241,0.5)]">
              <CalendarDays className="size-5 text-white" />
            </span>
            <span className="font-serif text-sm leading-tight font-semibold tracking-tight">
              Meetings
              <br />
              <span className="font-sans text-xs font-normal text-indigo-300">Scheduler</span>
            </span>
          </Link>

          <nav className="hidden h-full items-center gap-2 text-sm sm:flex">
            <Link
              to="/home"
              className="flex items-center rounded-xl border border-white/15 bg-white/10 px-3.5 py-1.5 font-medium text-white shadow-xs backdrop-blur-md"
            >
              Meetings
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onNewMeeting}
            className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-white/25 bg-gradient-to-r from-indigo-500/90 via-indigo-600/90 to-purple-600/90 px-3.5 py-2 text-sm font-medium text-white shadow-[0_4px_16px_rgba(99,102,241,0.35),inset_0_1px_0_rgba(255,255,255,0.3)] backdrop-blur-md transition-all hover:scale-[1.01] hover:from-indigo-500 hover:to-purple-500 hover:shadow-[0_6px_24px_rgba(99,102,241,0.5)] active:scale-[0.98]"
          >
            <Plus className="size-4" /> <span className="hidden sm:inline">New meeting</span>
          </button>

          <span className="h-6 w-px bg-white/15" />

          {me && (
            <div className="flex flex-col items-end rounded-xl border border-white/10 bg-white/[0.06] px-3 py-1 text-xs font-medium text-slate-300 backdrop-blur-sm">
              <span className="font-semibold text-white truncate max-w-[190px]" title={me.email}>
                {me.email}
              </span>
              {me.name && me.name !== me.email && (
                <span className="hidden sm:inline text-[10px] text-slate-400 truncate max-w-[160px]">
                  {me.name}
                </span>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={handleSignOut}
            className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-white/15 bg-white/[0.07] px-3 py-2 text-sm text-slate-300 backdrop-blur-sm transition-all hover:border-rose-400/30 hover:bg-rose-500/20 hover:text-rose-200 active:scale-[0.98]"
            aria-label="Sign out"
          >
            <LogOut className="size-4" />
            <span className="hidden md:inline">Sign out</span>
          </button>
        </div>
      </div>
    </header>
  )
}
