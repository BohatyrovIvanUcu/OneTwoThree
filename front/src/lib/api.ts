import { getIdToken, signOut } from "@/lib/auth"
import type {
  AiMeetingCreateRequest,
  AiMeetingParseRequest,
  AiMeetingParseResponse,
  AiModel,
  Meeting,
  MeetingCreate,
  ParsedAgenda,
  Participant,
  ParticipantCreate,
  User,
  ValidationIssue,
} from "@/types"

export class ApiError extends Error {
  readonly status: number
  readonly detail: unknown

  constructor(message: string, status: number, detail: unknown) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.detail = detail
  }

  get issues(): ValidationIssue[] {
    return Array.isArray(this.detail) ? (this.detail as ValidationIssue[]) : []
  }
}

function messageFrom(detail: unknown, status: number): string {
  if (typeof detail === "string") return detail
  if (Array.isArray(detail)) return detail.map((issue: ValidationIssue) => issue.msg).join("; ")
  return `Request failed (${status})`
}

// Backend origin, set at build time (the Lambda function URL on AWS). Empty = same origin,
// where nginx (Docker Compose) or the Vite dev server proxies /api to the backend.
const API_URL = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "")
const AI_URL = (import.meta.env.VITE_AI_URL ?? "").replace(/\/+$/, "")

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getIdToken()
  const response = await fetch(`${API_URL}/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  })

  // Session gone or rejected: back to the sign-in page.
  if (response.status === 401) {
    signOut()
    window.location.assign("/")
  }

  if (!response.ok) {
    let detail: unknown = response.statusText
    try {
      detail = (await response.json()).detail
    } catch {
      // Non-JSON error body: keep the status text.
    }
    throw new ApiError(messageFrom(detail, response.status), response.status, detail)
  }

  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export const api = {
  getMe: () => request<User>("/me"),

  listMeetings: () => request<Meeting[]>("/meetings"),
  createMeeting: (data: MeetingCreate) =>
    request<Meeting>("/meetings", { method: "POST", body: JSON.stringify(data) }),
  updateMeeting: ({ id, data }: { id: string; data: MeetingCreate }) =>
    request<Meeting>(`/meetings/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteMeeting: (id: string) => request<void>(`/meetings/${id}`, { method: "DELETE" }),

  listParticipants: (q = "") =>
    request<Participant[]>(`/participants${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  createParticipant: (data: ParticipantCreate) =>
    request<Participant>("/participants", { method: "POST", body: JSON.stringify(data) }),

  getAiModels: () => request<AiModel[]>("/ai/models"),
  parseMeetingWithAi: (data: AiMeetingParseRequest) =>
    request<AiMeetingParseResponse>("/ai/parse-meeting", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  createMeetingWithAi: (data: AiMeetingCreateRequest) =>
    request<Meeting>("/meetings/ai", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  requestWeeklyReport: (week?: string) =>
    request<{ status: string; request_id: string; week: string; message: string }>(
      "/reports/request",
      {
        method: "POST",
        body: JSON.stringify({ week: week ?? null }),
      },
    ),

  parseAgenda: async ({
    text,
    today,
    tz,
    model,
    signal,
  }: {
    text: string
    today: string
    tz: string
    model?: string
    signal?: AbortSignal
  }): Promise<{
    agenda: ParsedAgenda
    model: string
    prompt_version: string
    usage?: { input_tokens: number; output_tokens: number }
    latency_ms?: number
    cost_usd?: number
  }> => {
    const token = await getIdToken()
    const targetUrl = AI_URL ? `${AI_URL}` : `${API_URL}/api/ai/parse-agenda`
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ text, today, tz, model }),
      signal,
    })

    if (!response.ok) {
      let errMsg = `Parser failed (${response.status})`
      try {
        const errJson = await response.json()
        errMsg = errJson.error || errJson.detail || errMsg
      } catch {
        // ignore
      }
      throw new ApiError(errMsg, response.status, null)
    }

    return response.json()
  },

  saveMeetingAgenda: (
    meetingId: string,
    data: { agenda: ParsedAgenda; ai_suggestion?: Record<string, unknown> | null },
  ) =>
    request<{ id: string; agenda: ParsedAgenda; ai_suggestion?: Record<string, unknown> | null }>(
      `/meetings/${meetingId}/agenda`,
      {
        method: "POST",
        body: JSON.stringify(data),
      },
    ),

  getMeetingAgenda: (meetingId: string) =>
    request<{ id: string; agenda: ParsedAgenda | null; ai_suggestion?: Record<string, unknown> | null }>(
      `/meetings/${meetingId}/agenda`,
    ),
}
