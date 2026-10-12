export interface Participant {
  id: string
  name: string
  email: string
}

export interface User {
  id: string
  email: string
  name: string | null
}

export interface Meeting {
  id: string
  title: string
  description: string | null
  call_link: string | null
  place: string | null
  starts_at: string
  ends_at: string
  owner_id: string | null
  participants: Participant[]
  created_at: string
}

export interface MeetingCreate {
  title: string
  description: string | null
  call_link: string | null
  place: string | null
  starts_at: string
  ends_at: string
  participant_ids: string[]
}

export interface ParticipantCreate {
  name: string
  email: string
}

/** One entry of FastAPI's 422 `detail` list. */
export interface ValidationIssue {
  loc: (string | number)[]
  msg: string
  type: string
}

export interface AiModel {
  id: string
  name: string
  description?: string | null
  is_default: boolean
}

export interface AiMeetingParseRequest {
  prompt: string
  model_id?: string | null
  current_time?: string | null
}

export interface AiMeetingParseResponse {
  title: string
  description: string | null
  call_link: string | null
  place: string | null
  starts_at: string
  ends_at: string
  participant_ids: string[]
  new_participants: ParticipantCreate[]
  model_used: string
}

export interface AiMeetingCreateRequest {
  prompt: string
  model_id?: string | null
  current_time?: string | null
  auto_create_participants?: boolean
}
