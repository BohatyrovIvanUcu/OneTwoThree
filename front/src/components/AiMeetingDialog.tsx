import { useState } from "react"
import { Calendar, Check, Clock, Cpu, Loader2, MapPin, Sparkles, Users, Video } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { useAiModels, useCreateMeetingAi, useParseMeetingAi } from "@/hooks/useAi"
import { useParticipants } from "@/hooks/useParticipants"
import { toDateInput, toTimeInput } from "@/lib/calendar"
import type { AiMeetingParseResponse, Meeting, Participant } from "@/types"

interface AiMeetingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpenWithParsedValues?: (parsed: {
    title: string
    description: string
    call_link: string
    place: string
    date: string
    start_time: string
    end_time: string
    participants: Participant[]
  }) => void
}

const EXAMPLE_PROMPTS = [
  "Sync tomorrow at 3pm on Google Meet with Alice to review Q3 results",
  "Design review this Friday at 11:00 in Room 204",
  "Weekly 1:1 on Monday at 10am on Zoom",
]

export function AiMeetingDialog({
  open,
  onOpenChange,
  onOpenWithParsedValues,
}: AiMeetingDialogProps) {
  const { data: models = [], isLoading: modelsLoading } = useAiModels()
  const { data: allParticipants = [] } = useParticipants()
  const parseAi = useParseMeetingAi()
  const createAi = useCreateMeetingAi()

  const [prompt, setPrompt] = useState("")
  const [selectedModel, setSelectedModel] = useState<string>("")
  const [preview, setPreview] = useState<AiMeetingParseResponse | null>(null)

  const activeModel =
    selectedModel || (models.find((m) => m.is_default) ?? models[0])?.id || ""

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      setPrompt("")
      setPreview(null)
    }
    onOpenChange(nextOpen)
  }

  const isWorking = parseAi.isPending || createAi.isPending

  const handleParse = async () => {
    if (!prompt.trim()) {
      toast.error("Please enter a prompt first")
      return
    }

    try {
      const result = await parseAi.mutateAsync({
        prompt: prompt.trim(),
        model_id: activeModel || undefined,
        current_time: new Date().toISOString(),
      })
      setPreview(result)
      toast.success("Meeting parsed by AWS Bedrock")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to parse meeting with AI")
    }
  }

  const handleDirectCreate = async () => {
    if (!prompt.trim()) {
      toast.error("Please enter a prompt first")
      return
    }

    try {
      const created: Meeting = await createAi.mutateAsync({
        prompt: prompt.trim(),
        model_id: activeModel || undefined,
        current_time: new Date().toISOString(),
        auto_create_participants: true,
      })
      toast.success(`Meeting "${created.title}" scheduled!`)
      handleClose(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create meeting with AI")
    }
  }

  const handleConfirmPreview = async () => {
    if (!preview) return
    // Use the prompt to create with auto creation of participants
    await handleDirectCreate()
  }

  const handleEditInForm = () => {
    if (!preview || !onOpenWithParsedValues) return

    const start = new Date(preview.starts_at)
    const end = new Date(preview.ends_at)

    // Map participant IDs to participant objects
    const resolvedParticipants: Participant[] = []
    const pMap = new Map(allParticipants.map((p) => [p.id, p]))

    for (const id of preview.participant_ids) {
      const found = pMap.get(id)
      if (found) resolvedParticipants.push(found)
    }

    onOpenWithParsedValues({
      title: preview.title,
      description: preview.description ?? "",
      call_link: preview.call_link ?? "",
      place: preview.place ?? "",
      date: toDateInput(start),
      start_time: toTimeInput(start),
      end_time: toTimeInput(end),
      participants: resolvedParticipants,
    })

    handleClose(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto border-white/20 bg-slate-900/90 text-white backdrop-blur-2xl shadow-[0_16px_48px_0_rgba(0,0,0,0.5)]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-xl border border-indigo-400/40 bg-gradient-to-br from-indigo-500/30 to-purple-500/30 text-indigo-300">
              <Sparkles className="size-5" />
            </span>
            <div>
              <DialogTitle className="text-xl font-semibold tracking-tight text-white">
                Schedule with AWS Bedrock AI
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400">
                Type what you need in plain words, and Amazon Bedrock foundation models will extract
                the details.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Model selection */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-300">
              <Cpu className="size-3.5 text-indigo-400" />
              <span>Foundation Model</span>
            </label>
            {modelsLoading ? (
              <div className="h-9 w-full animate-pulse rounded-xl bg-white/10" />
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {models.map((m) => {
                  const isSelected = activeModel === m.id
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setSelectedModel(m.id)}
                      className={`flex flex-col items-start p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                        isSelected
                          ? "border-indigo-400/80 bg-indigo-500/20 shadow-[0_0_12px_rgba(99,102,241,0.25)]"
                          : "border-white/10 bg-white/[0.04] hover:border-white/25 hover:bg-white/[0.08]"
                      }`}
                    >
                      <div className="flex w-full items-center justify-between">
                        <span className="text-xs font-semibold text-white">{m.name}</span>
                        {m.is_default && (
                          <span className="rounded-md bg-indigo-500/30 px-1.5 py-0.5 text-[9px] font-medium text-indigo-200">
                            Default
                          </span>
                        )}
                      </div>
                      <span className="mt-0.5 line-clamp-1 text-[11px] text-slate-400">
                        {m.description ?? m.id}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Prompt textarea */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300">Natural Language Prompt</label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g., Quick sync with Alice tomorrow at 3pm on Google Meet to review Q3 results"
              rows={3}
              className="resize-none border-white/20 bg-black/25 text-white placeholder:text-slate-500 focus-visible:ring-indigo-500 rounded-xl"
            />
          </div>

          {/* Quick example chips */}
          <div className="space-y-1">
            <span className="text-[11px] font-medium text-slate-400">Quick suggestions:</span>
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLE_PROMPTS.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => setPrompt(example)}
                  className="rounded-lg border border-white/10 bg-white/[0.05] px-2 py-1 text-[11px] text-slate-300 transition-colors hover:border-indigo-400/40 hover:bg-indigo-500/15 cursor-pointer"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>

          {/* Parsed Preview Card */}
          {preview && (
            <div className="rounded-2xl border border-indigo-400/30 bg-gradient-to-br from-indigo-950/40 to-slate-900/60 p-4 space-y-3 shadow-inner">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <div className="flex items-center gap-2">
                  <Check className="size-4 text-emerald-400" />
                  <span className="text-xs font-semibold text-emerald-300">
                    AI Parsed ({preview.model_used.split("/").pop()})
                  </span>
                </div>
                {onOpenWithParsedValues && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleEditInForm}
                    className="h-6 text-xs text-indigo-300 hover:text-white hover:bg-indigo-500/20"
                  >
                    Edit in form →
                  </Button>
                )}
              </div>

              <div className="space-y-2 text-xs">
                <div>
                  <span className="text-slate-400">Title:</span>{" "}
                  <span className="font-semibold text-white">{preview.title}</span>
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-300">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="size-3.5 text-indigo-400" />
                    <span>{new Date(preview.starts_at).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="size-3.5 text-indigo-400" />
                    <span>
                      {new Date(preview.starts_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      -{" "}
                      {new Date(preview.ends_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>

                {(preview.place || preview.call_link) && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-300">
                    {preview.place && (
                      <div className="flex items-center gap-1.5">
                        <MapPin className="size-3.5 text-indigo-400" />
                        <span>{preview.place}</span>
                      </div>
                    )}
                    {preview.call_link && (
                      <div className="flex items-center gap-1.5">
                        <Video className="size-3.5 text-indigo-400" />
                        <a
                          href={preview.call_link}
                          target="_blank"
                          rel="noreferrer"
                          className="truncate max-w-[200px] text-indigo-300 underline hover:text-indigo-200"
                        >
                          {preview.call_link}
                        </a>
                      </div>
                    )}
                  </div>
                )}

                {preview.description && (
                  <div className="text-slate-300 text-[11px] bg-black/20 p-2 rounded-lg border border-white/5">
                    {preview.description}
                  </div>
                )}

                {(preview.participant_ids.length > 0 || preview.new_participants.length > 0) && (
                  <div className="flex items-start gap-1.5 text-slate-300">
                    <Users className="size-3.5 text-indigo-400 mt-0.5" />
                    <div className="flex flex-wrap gap-1">
                      {preview.participant_ids.map((id) => {
                        const p = allParticipants.find((x) => x.id === id)
                        return (
                          <span
                            key={id}
                            className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] text-white"
                          >
                            {p ? p.name : id.slice(0, 8)}
                          </span>
                        )
                      })}
                      {preview.new_participants.map((np) => (
                        <span
                          key={np.email}
                          className="rounded-md bg-indigo-500/30 border border-indigo-400/40 px-1.5 py-0.5 text-[10px] text-indigo-200"
                        >
                          + {np.name} ({np.email})
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between pt-2 border-t border-white/10">
          <Button
            type="button"
            variant="ghost"
            onClick={() => handleClose(false)}
            className="text-slate-400 hover:text-white"
            disabled={isWorking}
          >
            Cancel
          </Button>

          <div className="flex items-center gap-2">
            {!preview ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleParse}
                  disabled={isWorking || !prompt.trim()}
                  className="border-white/20 bg-white/5 hover:bg-white/10 text-white cursor-pointer"
                >
                  {parseAi.isPending ? (
                    <>
                      <Loader2 className="mr-1.5 size-4 animate-spin" />
                      Parsing...
                    </>
                  ) : (
                    "Preview parse"
                  )}
                </Button>
                <Button
                  type="button"
                  onClick={handleDirectCreate}
                  disabled={isWorking || !prompt.trim()}
                  className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white shadow-md cursor-pointer"
                >
                  {createAi.isPending ? (
                    <>
                      <Loader2 className="mr-1.5 size-4 animate-spin" />
                      Scheduling...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-1.5 size-4" />
                      Schedule now
                    </>
                  )}
                </Button>
              </>
            ) : (
              <Button
                type="button"
                onClick={handleConfirmPreview}
                disabled={isWorking}
                className="bg-gradient-to-r from-emerald-500 to-indigo-600 hover:from-emerald-600 hover:to-indigo-700 text-white shadow-md cursor-pointer"
              >
                {createAi.isPending ? (
                  <>
                    <Loader2 className="mr-1.5 size-4 animate-spin" />
                    Scheduling...
                  </>
                ) : (
                  <>
                    <Check className="mr-1.5 size-4" />
                    Confirm & Schedule
                  </>
                )}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
