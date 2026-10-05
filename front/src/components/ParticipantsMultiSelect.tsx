import { useState } from "react"
import { Check, ChevronsUpDown, UserPlus, X } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useCreateParticipant, useParticipants } from "@/hooks/useParticipants"
import { parseNewParticipant } from "@/lib/participants"
import { cn } from "@/lib/utils"
import type { Participant } from "@/types"

interface ParticipantsMultiSelectProps {
  value: Participant[]
  onChange: (value: Participant[]) => void
  id?: string
}

export function ParticipantsMultiSelect({ value, onChange, id }: ParticipantsMultiSelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const newParticipant = parseNewParticipant(search)
  const { data: participants = [], isLoading } = useParticipants(newParticipant?.email ?? search)
  const createParticipant = useCreateParticipant()

  const selectedIds = new Set(value.map((p) => p.id))
  const canAdd =
    newParticipant !== null && !participants.some((p) => p.email === newParticipant.email)

  const toggle = (participant: Participant) => {
    onChange(
      selectedIds.has(participant.id)
        ? value.filter((p) => p.id !== participant.id)
        : [...value, participant],
    )
  }

  const addParticipant = async () => {
    if (!newParticipant) return
    try {
      const created = await createParticipant.mutateAsync(newParticipant)
      onChange([...value, created])
      setSearch("")
      toast.success(`Added ${created.name}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add participant")
    }
  }

  return (
    <div className="space-y-2.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="h-10 w-full cursor-pointer justify-between rounded-xl border border-white/15 bg-white/[0.06] px-3.5 font-normal text-slate-200 shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)] backdrop-blur-md hover:bg-white/[0.1]"
          >
            <span className={cn(value.length === 0 && "text-slate-400/80")}>
              {value.length === 0 ? "Select participants…" : `${value.length} selected`}
            </span>
            <ChevronsUpDown className="size-4 text-slate-400 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-(--radix-popover-trigger-width) rounded-2xl border border-white/20 bg-slate-900/90 p-0 shadow-2xl backdrop-blur-2xl"
          align="start"
        >
          <Command shouldFilter={false} className="bg-transparent text-white">
            <CommandInput
              placeholder="Search, or type name + email to add"
              value={search}
              onValueChange={setSearch}
              className="text-white placeholder:text-slate-400"
            />
            <CommandList className="text-white">
              {!isLoading && !canAdd && (
                <CommandEmpty className="py-6 text-sm text-slate-400">
                  No participants found.
                </CommandEmpty>
              )}
              {participants.length > 0 && (
                <CommandGroup>
                  {participants.map((participant) => (
                    <CommandItem
                      key={participant.id}
                      value={participant.id}
                      onSelect={() => toggle(participant)}
                      className="cursor-pointer rounded-xl text-white data-[selected=true]:bg-white/10"
                    >
                      <Check
                        className={cn(
                          "size-4 text-indigo-400",
                          selectedIds.has(participant.id) ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <span className="font-medium text-white">{participant.name}</span>
                      <span className="ml-auto font-mono text-xs text-slate-400">
                        {participant.email}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {canAdd && newParticipant && (
                <CommandGroup heading="New participant" className="text-slate-400">
                  <CommandItem
                    value="__add__"
                    onSelect={addParticipant}
                    disabled={createParticipant.isPending}
                    className="cursor-pointer rounded-xl font-medium text-indigo-300 data-[selected=true]:bg-indigo-500/20"
                  >
                    <UserPlus className="size-4 text-indigo-400" />
                    Add participant “{newParticipant.name}” ({newParticipant.email})
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {value.map((participant) => (
            <Badge
              key={participant.id}
              variant="secondary"
              className="gap-1.5 rounded-xl border-white/20 bg-white/[0.09] py-1 pr-1.5 text-white shadow-xs backdrop-blur-md"
            >
              <span>{participant.name}</span>
              <button
                type="button"
                onClick={() => toggle(participant)}
                className="cursor-pointer rounded-lg p-0.5 text-slate-400 transition-all hover:bg-white/20 hover:text-white"
                aria-label={`Remove ${participant.name}`}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}
