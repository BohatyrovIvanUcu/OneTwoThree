import { useState } from "react"
import { toast } from "sonner"

import { BackToTop } from "@/components/BackToTop"
import { DeleteMeetingDialog } from "@/components/DeleteMeetingDialog"
import { MeetingFormDialog } from "@/components/MeetingFormDialog"
import { MeetingsCalendar } from "@/components/MeetingsCalendar"
import { SiteFooter } from "@/components/SiteFooter"
import { SiteHeader } from "@/components/SiteHeader"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useDeleteMeeting, useMeetings } from "@/hooks/useMeetings"
import type { Meeting } from "@/types"

export function HomePage() {
  const { data: meetings, isPending, isError, error, refetch } = useMeetings()
  const deleteMeeting = useDeleteMeeting()
  const [formOpen, setFormOpen] = useState(false)
  const [formStart, setFormStart] = useState<Date | undefined>()
  const [editing, setEditing] = useState<Meeting | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Meeting | null>(null)

  const openForm = (start?: Date) => {
    setEditing(null)
    setFormStart(start)
    setFormOpen(true)
  }

  const openEdit = (meeting: Meeting) => {
    setEditing(meeting)
    setFormOpen(true)
  }

  const confirmDelete = (meeting: Meeting) => {
    setPendingDelete(null)
    deleteMeeting.mutate(meeting.id, {
      onSuccess: () => toast.success("Meeting deleted"),
      onError: (err) => toast.error(`Could not delete meeting: ${err.message}`),
    })
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-hidden">
      {/* Ambient background glows */}
      <div className="pointer-events-none fixed top-1/4 -left-48 size-[500px] rounded-full bg-indigo-500/20 blur-[130px]" />
      <div className="pointer-events-none fixed top-1/3 -right-48 size-[500px] rounded-full bg-purple-500/18 blur-[130px]" />
      <div className="pointer-events-none fixed bottom-10 left-1/3 size-[400px] rounded-full bg-sky-500/15 blur-[120px]" />

      <SiteHeader onNewMeeting={() => openForm()} />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        <section className="relative rounded-3xl border border-white/15 bg-white/[0.04] p-4 shadow-[0_16px_48px_0_rgba(0,0,0,0.4),inset_0_1px_1px_rgba(255,255,255,0.18)] backdrop-blur-2xl transition-all sm:p-6">
          <h1 className="sr-only">Meetings</h1>

          {isPending ? (
            <div className="space-y-4" aria-label="Loading meetings">
              <Skeleton className="h-12 w-full rounded-2xl bg-white/10" />
              <Skeleton className="h-[520px] w-full rounded-2xl bg-white/5" />
            </div>
          ) : isError ? (
            <div
              role="alert"
              className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-rose-200 backdrop-blur-xl"
            >
              <p className="text-base font-semibold">Could not load meetings</p>
              <p className="mt-1 text-sm text-rose-200/80">{error.message}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4 border-rose-400/40 hover:bg-rose-500/20"
                onClick={() => refetch()}
              >
                Retry
              </Button>
            </div>
          ) : (
            <MeetingsCalendar
              meetings={meetings}
              onEdit={openEdit}
              onDelete={setPendingDelete}
              onCreateAt={openForm}
            />
          )}
        </section>
      </main>

      <SiteFooter />
      <BackToTop />

      <MeetingFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        initialStart={formStart}
        meeting={editing}
      />
      <DeleteMeetingDialog
        meeting={pendingDelete}
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />
    </div>
  )
}
