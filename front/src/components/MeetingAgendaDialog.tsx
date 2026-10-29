import { useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { api, ApiError } from "@/lib/api"
import type { ActionItem, AgendaItem, Meeting, ParsedAgenda } from "@/types"

interface MeetingAgendaDialogProps {
  meeting: Meeting | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface EditableAgendaItem extends AgendaItem {
  id: string
  isSuggested?: boolean
}

interface EditableActionItem extends ActionItem {
  id: string
  isSuggested?: boolean
}

function MeetingAgendaDialogContent({
  meeting,
  onClose,
}: {
  meeting: Meeting
  onClose: () => void
}) {
  const queryClient = useQueryClient()

  // Raw pasted text
  const [pastedText, setPastedText] = useState("")
  const [isParsing, setIsParsing] = useState(false)
  const [parseProgressSeconds, setParseProgressSeconds] = useState(0)
  const [parseError, setParseError] = useState<string | null>(null)

  // Current agenda form state
  const [titleOverride, setTitleOverride] = useState(meeting.agenda?.title || "")
  const [titleIsSuggested, setTitleIsSuggested] = useState(false)
  const [language, setLanguage] = useState(meeting.agenda?.language || "uk")
  const [durationMinutes, setDurationMinutes] = useState<number | null>(
    meeting.agenda?.duration_minutes ?? null,
  )
  const [durationIsSuggested, setDurationIsSuggested] = useState(false)

  const [items, setItems] = useState<EditableAgendaItem[]>(() =>
    (meeting.agenda?.items || []).map((it, idx) => ({
      ...it,
      id: `item-${idx}-${Date.now()}`,
      isSuggested: false,
    })),
  )

  const [actionItems, setActionItems] = useState<EditableActionItem[]>(() =>
    (meeting.agenda?.action_items || []).map((act, idx) => ({
      ...act,
      id: `act-${idx}-${Date.now()}`,
      isSuggested: false,
    })),
  )

  // Store original AI suggestion metadata for feedback tracking
  const [aiSuggestion, setAiSuggestion] = useState<Record<string, unknown> | null>(
    meeting.ai_suggestion || null,
  )
  const [isSaving, setIsSaving] = useState(false)

  // AbortController for cancelable requests
  const abortControllerRef = useRef<AbortController | null>(null)

  // Timer for parsing elapsed time
  useEffect(() => {
    if (!isParsing) return

    const timer = setInterval(() => {
      setParseProgressSeconds((prev) => prev + 1)
    }, 1000)

    return () => clearInterval(timer)
  }, [isParsing])

  const handleCancelParse = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setIsParsing(false)
    setParseError("Parsing was canceled by user")
    toast.info("Parsing canceled")
  }

  const handleParse = async () => {
    if (!pastedText.trim()) {
      setParseError("Please paste some text first")
      return
    }

    if (pastedText.length > 10000) {
      setParseError("Text is too long (maximum 10,000 characters)")
      return
    }

    setParseError(null)
    setParseProgressSeconds(0)
    setIsParsing(true)
    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      const today = new Date().toISOString().split("T")[0]
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Kyiv"

      const response = await api.parseAgenda({
        text: pastedText.trim(),
        today,
        tz,
        signal: controller.signal,
      })

      const parsed: ParsedAgenda = response.agenda

      // Pre-fill form with "suggested" badges
      if (parsed.title) {
        setTitleOverride(parsed.title)
        setTitleIsSuggested(true)
      }
      if (parsed.duration_minutes) {
        setDurationMinutes(parsed.duration_minutes)
        setDurationIsSuggested(true)
      }
      if (parsed.language) {
        setLanguage(parsed.language)
      }

      setItems(
        (parsed.items || []).map((it, idx) => ({
          topic: it.topic,
          owner: it.owner || "",
          minutes: it.minutes || null,
          id: `item-${idx}-${Date.now()}`,
          isSuggested: true,
        })),
      )

      setActionItems(
        (parsed.action_items || []).map((act, idx) => ({
          task: act.task,
          owner: act.owner || "",
          due: act.due || "",
          id: `act-${idx}-${Date.now()}`,
          isSuggested: true,
        })),
      )

      // Save suggestion snapshot for feedback tracking
      setAiSuggestion({
        original_suggestion: parsed,
        model: response.model,
        prompt_version: response.prompt_version,
        parsed_at: new Date().toISOString(),
        usage: response.usage,
        latency_ms: response.latency_ms,
        cost_usd: response.cost_usd,
      })

      toast.success(
        `Agenda parsed successfully by ${response.model}! Review and correct before saving.`,
      )
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        return
      }
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to parse agenda"
      setParseError(message)
      toast.error(message)
    } finally {
      setIsParsing(false)
      abortControllerRef.current = null
    }
  }

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      { id: `item-new-${Date.now()}`, topic: "", owner: "", minutes: null, isSuggested: false },
    ])
  }

  const handleRemoveItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id))
  }

  const handleUpdateItem = (
    id: string,
    field: keyof AgendaItem,
    value: string | number | null,
  ) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, [field]: value, isSuggested: false } : it)),
    )
  }

  const handleAddActionItem = () => {
    setActionItems((prev) => [
      ...prev,
      { id: `act-new-${Date.now()}`, task: "", owner: "", due: "", isSuggested: false },
    ])
  }

  const handleRemoveActionItem = (id: string) => {
    setActionItems((prev) => prev.filter((it) => it.id !== id))
  }

  const handleUpdateActionItem = (
    id: string,
    field: keyof ActionItem,
    value: string | null,
  ) => {
    setActionItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, [field]: value, isSuggested: false } : it)),
    )
  }

  const handleSave = async () => {
    // Validate that items have non-empty topics
    const cleanItems: AgendaItem[] = items
      .filter((it) => it.topic.trim().length > 0)
      .map(({ topic, owner, minutes }) => ({
        topic: topic.trim(),
        owner: owner ? owner.trim() : null,
        minutes: minutes ? Number(minutes) : null,
      }))

    const cleanActions: ActionItem[] = actionItems
      .filter((act) => act.task.trim().length > 0)
      .map(({ task, owner, due }) => ({
        task: task.trim(),
        owner: owner ? owner.trim() : null,
        due: due ? due.trim() : null,
      }))

    if (cleanItems.length === 0 && cleanActions.length === 0) {
      toast.error("Please add at least one topic or action item")
      return
    }

    const finalAgenda: ParsedAgenda = {
      title: titleOverride.trim() || meeting.title,
      duration_minutes: durationMinutes,
      items: cleanItems,
      action_items: cleanActions,
      language: language || "uk",
    }

    setIsSaving(true)
    try {
      await api.saveMeetingAgenda(meeting.id, {
        agenda: finalAgenda,
        ai_suggestion: aiSuggestion,
      })
      await queryClient.invalidateQueries({ queryKey: ["meetings"] })
      toast.success("Agenda saved successfully!")
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save agenda")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto border-white/15 bg-slate-900/90 backdrop-blur-2xl text-slate-100">
      <DialogHeader>
        <div className="flex items-center gap-2">
          <Sparkles className="size-5 text-indigo-400" />
          <DialogTitle className="text-xl font-bold">Meeting Agenda</DialogTitle>
        </div>
        <DialogDescription className="text-slate-400">
          For meeting: "{meeting.title}"
        </DialogDescription>
      </DialogHeader>

      {/* Section 1: Paste an agenda */}
      <div className="space-y-3 rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="paste-area" className="text-sm font-semibold text-indigo-200">
            Paste an agenda (email, team chat, notes)
          </Label>
          <span className="text-xs text-slate-400">
            {pastedText.length.toLocaleString()} / 10,000 chars
          </span>
        </div>

        <Textarea
          id="paste-area"
          rows={4}
          disabled={isParsing}
          placeholder="e.g. Пн 10:00, синк по прайсингу, 45 хв. 1) нові тарифи Pro — Олена, 15 хв 2) фідбек від клієнтів — Taras 3) що робимо з річною знижкою..."
          value={pastedText}
          onChange={(e) => setPastedText(e.target.value)}
          className="border-white/10 bg-slate-950/60 font-mono text-sm text-slate-200 placeholder:text-slate-500"
        />

        {parseError && (
          <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-300">
            <AlertCircle className="size-4 shrink-0" />
            <span>{parseError}</span>
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-slate-400">
            Model suggests, you decide. Text runs through Bedrock Claude Haiku.
          </span>
          <div className="flex items-center gap-2">
            {isParsing ? (
              <>
                <div className="flex items-center gap-2 text-xs text-indigo-300">
                  <Loader2 className="size-4 animate-spin" />
                  <span>Parsing ({parseProgressSeconds}s)...</span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCancelParse}
                  className="border-rose-400/30 text-rose-300 hover:bg-rose-500/20"
                >
                  <X className="mr-1 size-3.5" /> Cancel
                </Button>
              </>
            ) : (
              <Button
                type="button"
                size="sm"
                onClick={handleParse}
                className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg hover:from-indigo-600 hover:to-purple-700"
              >
                <Sparkles className="mr-1.5 size-4" /> Parse Agenda
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Section 2: Structured Agenda Form */}
      <div className="space-y-5 pt-2">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="agenda-title" className="text-xs text-slate-300">
                Agenda Topic / Title
              </Label>
              {titleIsSuggested && (
                <Badge
                  variant="outline"
                  className="border-purple-400/40 bg-purple-500/15 text-[10px] text-purple-300"
                >
                  suggested
                </Badge>
              )}
            </div>
            <Input
              id="agenda-title"
              value={titleOverride}
              placeholder={meeting.title || "Meeting title"}
              onChange={(e) => {
                setTitleOverride(e.target.value)
                setTitleIsSuggested(false)
              }}
              className="mt-1 border-white/10 bg-slate-950/40 text-sm"
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="agenda-duration" className="text-xs text-slate-300">
                Estimated Duration (minutes)
              </Label>
              {durationIsSuggested && (
                <Badge
                  variant="outline"
                  className="border-purple-400/40 bg-purple-500/15 text-[10px] text-purple-300"
                >
                  suggested
                </Badge>
              )}
            </div>
            <Input
              id="agenda-duration"
              type="number"
              min={1}
              max={480}
              value={durationMinutes ?? ""}
              placeholder="e.g. 45"
              onChange={(e) => {
                setDurationMinutes(e.target.value ? Number(e.target.value) : null)
                setDurationIsSuggested(false)
              }}
              className="mt-1 border-white/10 bg-slate-950/40 text-sm"
            />
          </div>
        </div>

        {/* Agenda Topics */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold text-slate-200">
              Agenda Topics ({items.length})
            </Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddItem}
              className="border-white/15 text-xs text-slate-300 hover:bg-white/10"
            >
              <Plus className="mr-1 size-3.5" /> Add Topic
            </Button>
          </div>

          {items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-xs text-slate-500">
              No topics yet. Paste text above to extract automatically or click "Add Topic".
            </div>
          ) : (
            <div className="space-y-2.5">
              {items.map((it, idx) => (
                <div
                  key={it.id}
                  className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-3 sm:flex-row sm:items-center"
                >
                  <div className="flex items-center gap-2 sm:w-1/2">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-slate-400">
                      {idx + 1}
                    </span>
                    <Input
                      value={it.topic}
                      placeholder="Discussion topic..."
                      onChange={(e) => handleUpdateItem(it.id, "topic", e.target.value)}
                      className="border-white/10 bg-slate-950/40 text-sm"
                    />
                  </div>

                  <div className="flex items-center gap-2 sm:w-1/2">
                    <Input
                      value={it.owner || ""}
                      placeholder="Owner (name/email)"
                      onChange={(e) => handleUpdateItem(it.id, "owner", e.target.value)}
                      className="border-white/10 bg-slate-950/40 text-sm"
                    />
                    <div className="flex w-24 shrink-0 items-center gap-1">
                      <Input
                        type="number"
                        min={1}
                        max={480}
                        value={it.minutes ?? ""}
                        placeholder="Min"
                        onChange={(e) =>
                          handleUpdateItem(
                            it.id,
                            "minutes",
                            e.target.value ? Number(e.target.value) : null,
                          )
                        }
                        className="border-white/10 bg-slate-950/40 text-center text-sm"
                      />
                    </div>

                    {it.isSuggested && (
                      <Badge
                        variant="outline"
                        className="shrink-0 border-purple-400/40 bg-purple-500/15 text-[10px] text-purple-300"
                      >
                        suggested
                      </Badge>
                    )}

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveItem(it.id)}
                      className="text-slate-400 hover:text-rose-400"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Action Items */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold text-slate-200">
              Action Items ({actionItems.length})
            </Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddActionItem}
              className="border-white/15 text-xs text-slate-300 hover:bg-white/10"
            >
              <Plus className="mr-1 size-3.5" /> Add Action Item
            </Button>
          </div>

          {actionItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 p-4 text-center text-xs text-slate-500">
              No action items. Actions like "Taras to gather competitive matrix by Friday" will appear here.
            </div>
          ) : (
            <div className="space-y-2.5">
              {actionItems.map((act) => (
                <div
                  key={act.id}
                  className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-3 sm:flex-row sm:items-center"
                >
                  <Input
                    value={act.task}
                    placeholder="Task description..."
                    onChange={(e) => handleUpdateActionItem(act.id, "task", e.target.value)}
                    className="border-white/10 bg-slate-950/40 text-sm sm:w-1/2"
                  />

                  <div className="flex items-center gap-2 sm:w-1/2">
                    <Input
                      value={act.owner || ""}
                      placeholder="Assignee"
                      onChange={(e) => handleUpdateActionItem(act.id, "owner", e.target.value)}
                      className="border-white/10 bg-slate-950/40 text-sm"
                    />
                    <Input
                      type="date"
                      value={act.due || ""}
                      onChange={(e) => handleUpdateActionItem(act.id, "due", e.target.value)}
                      className="border-white/10 bg-slate-950/40 text-xs"
                    />

                    {act.isSuggested && (
                      <Badge
                        variant="outline"
                        className="shrink-0 border-purple-400/40 bg-purple-500/15 text-[10px] text-purple-300"
                      >
                        suggested
                      </Badge>
                    )}

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveActionItem(act.id)}
                      className="text-slate-400 hover:text-rose-400"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <DialogFooter className="mt-6 flex flex-row items-center justify-between border-t border-white/10 pt-4">
        <div className="text-xs text-slate-400">
          {aiSuggestion && (
            <span className="flex items-center gap-1 text-emerald-400">
              <CheckCircle2 className="size-3.5" />
              Suggestion metadata captured for quality evaluation
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="border-white/15 text-slate-300 hover:bg-white/10"
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={isSaving || isParsing}
            onClick={handleSave}
            className="bg-emerald-600 text-white hover:bg-emerald-700"
          >
            {isSaving ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
            Save Agenda
          </Button>
        </div>
      </DialogFooter>
    </DialogContent>
  )
}

export function MeetingAgendaDialog({
  meeting,
  open,
  onOpenChange,
}: MeetingAgendaDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && meeting ? (
        <MeetingAgendaDialogContent
          key={meeting.id}
          meeting={meeting}
          onClose={() => onOpenChange(false)}
        />
      ) : null}
    </Dialog>
  )
}
