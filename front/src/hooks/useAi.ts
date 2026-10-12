import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "@/lib/api"
import { meetingsKey } from "@/hooks/useMeetings"

export const aiModelsKey = ["ai", "models"] as const

export function useAiModels() {
  return useQuery({
    queryKey: aiModelsKey,
    queryFn: api.getAiModels,
    staleTime: 1000 * 60 * 30,
  })
}

export function useParseMeetingAi() {
  return useMutation({
    mutationFn: api.parseMeetingWithAi,
  })
}

export function useCreateMeetingAi() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: api.createMeetingWithAi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: meetingsKey })
      queryClient.invalidateQueries({ queryKey: ["participants"] })
    },
  })
}
