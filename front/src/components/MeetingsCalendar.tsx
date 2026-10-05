import { useEffect, useLayoutEffect, useRef, useState } from "react"
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  MapPin,
  Pencil,
  Trash2,
  Users,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  type CalendarView,
  type DaySegment,
  formatHour,
  formatLongDay,
  formatPeriod,
  formatTime,
  formatWeekday,
  isSameDay,
  layoutDay,
  minutesSinceMidnight,
  shiftAnchor,
  visibleDays,
} from "@/lib/calendar"
import { cn } from "@/lib/utils"
import type { Meeting } from "@/types"

const HOUR_HEIGHT = 48
const MIN_EVENT_HEIGHT = 22
/** The grid opens scrolled to 07:30; earlier hours stay reachable by scrolling up. */
const FIRST_VISIBLE_HOUR = 7.5
const HOURS = Array.from({ length: 24 }, (_, hour) => hour)
const VIEWS: { value: CalendarView; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "day", label: "Day" },
]

function initialView(): CalendarView {
  // Seven columns do not fit on a phone.
  return window.matchMedia?.("(max-width: 639px)").matches ? "day" : "week"
}

/** Re-renders every minute so the "now" line moves. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])
  return now
}

interface MeetingActions {
  onEdit: (meeting: Meeting) => void
  onDelete: (meeting: Meeting) => void
}

function MeetingDetails({ meeting, onEdit, onDelete }: { meeting: Meeting } & MeetingActions) {
  const start = new Date(meeting.starts_at)
  return (
    <div className="space-y-3.5 text-sm">
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-base leading-snug font-semibold tracking-tight text-white">
          {meeting.title}
        </h4>
        <div className="-mt-1 -mr-2 flex shrink-0 gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Edit ${meeting.title}`}
            onClick={() => onEdit(meeting)}
            className="size-8 rounded-lg hover:bg-white/10"
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Delete ${meeting.title}`}
            onClick={() => onDelete(meeting)}
            className="size-8 rounded-lg hover:bg-rose-500/20"
          >
            <Trash2 className="size-3.5 text-rose-400" />
          </Button>
        </div>
      </div>
      <p className="flex items-center gap-2 text-xs text-indigo-200/90">
        <Clock className="size-3.5 shrink-0 text-indigo-300" />
        {formatLongDay(start)}, {formatTime(meeting.starts_at)} – {formatTime(meeting.ends_at)}
      </p>
      {meeting.description && (
        <p className="text-xs leading-relaxed whitespace-pre-line text-slate-300">
          {meeting.description}
        </p>
      )}
      {meeting.place && (
        <p className="flex items-center gap-2 text-xs text-slate-300">
          <MapPin className="size-3.5 shrink-0 text-slate-400" /> {meeting.place}
        </p>
      )}
      {meeting.call_link && (
        <a
          href={meeting.call_link}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-400/30 bg-indigo-500/20 px-2.5 py-1 text-xs font-medium text-indigo-200 shadow-xs transition-all hover:bg-indigo-500/35 hover:text-white"
        >
          Join call <ExternalLink className="size-3" />
        </a>
      )}
      {meeting.participants.length > 0 && (
        <div className="flex items-start gap-2 border-t border-white/10 pt-1">
          <Users className="mt-0.5 size-3.5 shrink-0 text-slate-400" />
          <div className="flex flex-wrap gap-1.5">
            {meeting.participants.map((p) => (
              <Badge key={p.id} variant="secondary" title={p.email}>
                {p.name}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function MeetingBlock({ segment, onEdit, onDelete }: { segment: DaySegment } & MeetingActions) {
  const [open, setOpen] = useState(false)
  const { meeting, startMin, endMin, column, columns } = segment
  // Close the details before handing over to the edit or delete dialog.
  const closeThen = (action: (meeting: Meeting) => void) => (m: Meeting) => {
    setOpen(false)
    action(m)
  }
  const height = Math.max(((endMin - startMin) / 60) * HOUR_HEIGHT - 2, MIN_EVENT_HEIGHT)
  const compact = height < 40
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="absolute z-10 cursor-pointer overflow-hidden rounded-xl border border-l-4 border-indigo-300/35 border-l-indigo-400 bg-indigo-500/25 px-2 py-1 text-left text-xs text-white shadow-[0_4px_16px_rgba(79,70,229,0.25),inset_0_1px_0_rgba(255,255,255,0.25)] backdrop-blur-md transition-all hover:scale-[1.008] hover:border-indigo-200/50 hover:bg-indigo-500/35 hover:shadow-[0_6px_20px_rgba(79,70,229,0.4)] focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:outline-none data-[state=open]:bg-indigo-500/40"
          style={{
            top: (startMin / 60) * HOUR_HEIGHT + 1,
            height,
            left: `calc(${(column / columns) * 100}% + 2px)`,
            width: `calc(${100 / columns}% - 4px)`,
          }}
        >
          <span
            className={cn(
              "block truncate leading-tight font-semibold text-white",
              compact && "inline",
            )}
          >
            {meeting.title}
          </span>
          <span
            className={cn(
              "block truncate text-[11px] text-indigo-200/90",
              compact && "ml-1 inline",
            )}
          >
            {formatTime(meeting.starts_at)} – {formatTime(meeting.ends_at)}
          </span>
          {height >= 64 && meeting.place && (
            <span className="mt-0.5 block truncate text-[10px] text-slate-300/80">
              {meeting.place}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <MeetingDetails
          meeting={meeting}
          onEdit={closeThen(onEdit)}
          onDelete={closeThen(onDelete)}
        />
      </PopoverContent>
    </Popover>
  )
}

interface MeetingsCalendarProps extends MeetingActions {
  meetings: Meeting[]
  /** Called with the start of the empty hour slot the user clicked. */
  onCreateAt: (start: Date) => void
}

export function MeetingsCalendar({
  meetings,
  onEdit,
  onDelete,
  onCreateAt,
}: MeetingsCalendarProps) {
  const [view, setView] = useState<CalendarView>(initialView)
  const [anchor, setAnchor] = useState(() => new Date())
  const now = useNow()
  const scrollRef = useRef<HTMLDivElement>(null)
  const days = visibleDays(view, anchor)
  const gridColumns = { gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(0, 1fr))` }

  // Before paint, so the grid never flashes at 00:00.
  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = FIRST_VISIBLE_HOUR * HOUR_HEIGHT
  }, [view])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAnchor(new Date())}
            className="rounded-xl"
          >
            Today
          </Button>
          <div className="flex items-center rounded-xl border border-white/15 bg-white/[0.06] p-0.5 backdrop-blur-md">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Previous ${view}`}
              onClick={() => setAnchor(shiftAnchor(view, anchor, -1))}
              className="rounded-lg hover:bg-white/15"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Next ${view}`}
              onClick={() => setAnchor(shiftAnchor(view, anchor, 1))}
              className="rounded-lg hover:bg-white/15"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <h3
            className="ml-1 text-base font-semibold tracking-tight text-white sm:text-lg"
            aria-live="polite"
          >
            {formatPeriod(view, anchor)}
          </h3>
        </div>

        <div
          role="group"
          aria-label="Calendar view"
          className="inline-flex rounded-xl border border-white/15 bg-white/[0.06] p-1 shadow-inner backdrop-blur-md"
        >
          {VIEWS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={view === value}
              onClick={() => setView(value)}
              className={cn(
                "cursor-pointer rounded-lg px-3.5 py-1.5 text-xs font-medium transition-all sm:text-sm",
                view === value
                  ? "border border-white/20 bg-gradient-to-r from-indigo-500/80 to-purple-600/80 text-white shadow-[0_2px_12px_rgba(99,102,241,0.4)]"
                  : "text-slate-400 hover:bg-white/5 hover:text-white",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Fills the window below the header and toolbar, so the page itself barely scrolls. */}
      <div
        ref={scrollRef}
        className="h-[calc(100dvh-12rem)] min-h-[460px] overflow-auto rounded-2xl border border-white/15 bg-black/25 shadow-[inset_0_2px_8px_rgba(0,0,0,0.4)] backdrop-blur-xl"
      >
        <div className={cn(view === "week" && "min-w-[720px]")}>
          <div
            className="sticky top-0 z-20 grid border-b border-white/15 bg-slate-900/85 shadow-xs backdrop-blur-2xl"
            style={gridColumns}
          >
            <div />
            {days.map((day) => {
              const today = isSameDay(day, now)
              return (
                <div
                  key={day.toISOString()}
                  className="flex items-center justify-center gap-2 border-l border-white/10 py-2.5"
                  aria-current={today ? "date" : undefined}
                >
                  <span
                    className={cn(
                      "text-xs font-medium tracking-wider uppercase",
                      today ? "font-semibold text-indigo-300" : "text-slate-400",
                    )}
                  >
                    {formatWeekday(day)}
                  </span>
                  <span
                    className={cn(
                      "flex size-7 items-center justify-center rounded-full text-xs font-medium transition-all",
                      today
                        ? "bg-gradient-to-r from-indigo-500 to-purple-500 font-semibold text-white shadow-[0_0_14px_rgba(99,102,241,0.6)]"
                        : "text-slate-300",
                    )}
                  >
                    {day.getDate()}
                  </span>
                </div>
              )
            })}
          </div>

          <div className="grid" style={gridColumns}>
            <div>
              {HOURS.map((hour) => (
                <div key={hour} className="relative" style={{ height: HOUR_HEIGHT }}>
                  {hour > 0 && (
                    <span className="absolute -top-2.5 right-2 font-mono text-[11px] text-slate-400/80">
                      {formatHour(hour)}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {days.map((day) => {
              const today = isSameDay(day, now)
              return (
                <div
                  key={day.toISOString()}
                  role="region"
                  aria-label={formatLongDay(day)}
                  className={cn(
                    "relative border-l border-white/[0.08]",
                    today && "bg-indigo-500/[0.04]",
                  )}
                >
                  {HOURS.map((hour) => {
                    const slot = new Date(day)
                    slot.setHours(hour)
                    return (
                      <button
                        key={hour}
                        type="button"
                        tabIndex={-1}
                        aria-label={`New meeting on ${formatLongDay(day)} at ${formatHour(hour)}`}
                        onClick={() => onCreateAt(slot)}
                        className="block w-full cursor-pointer border-b border-white/[0.07] transition-colors hover:bg-white/[0.05]"
                        style={{ height: HOUR_HEIGHT }}
                      />
                    )
                  })}

                  {layoutDay(meetings, day).map((segment) => (
                    <MeetingBlock
                      key={segment.meeting.id}
                      segment={segment}
                      onEdit={onEdit}
                      onDelete={onDelete}
                    />
                  ))}

                  {today && (
                    <div
                      aria-hidden
                      className="pointer-events-none absolute right-0 left-0 z-10 border-t-2 border-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.8)]"
                      style={{ top: (minutesSinceMidnight(now) / 60) * HOUR_HEIGHT }}
                    >
                      <span className="absolute -top-[5px] -left-[5px] size-2.5 animate-pulse rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,1)]" />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
