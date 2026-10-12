import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { AiMeetingDialog } from "@/components/AiMeetingDialog"
import { mockFetch, renderWithQuery } from "@/test/utils"

const MOCK_MODELS = [
  {
    id: "us.amazon.nova-micro-v1:0",
    name: "Amazon Nova Micro",
    description: "Fastest model",
    is_default: true,
  },
  {
    id: "meta.llama3-8b-instruct-v1:0",
    name: "Meta Llama 3 8B",
    description: "Open model",
    is_default: false,
  },
]

describe("AiMeetingDialog", () => {
  it("renders models and allows typing a prompt", async () => {
    mockFetch((url) => {
      if (url.includes("/api/ai/models")) return { body: MOCK_MODELS }
      return { body: [] }
    })

    renderWithQuery(<AiMeetingDialog open onOpenChange={() => {}} />)

    expect(await screen.findByText("Schedule with AWS Bedrock AI")).toBeInTheDocument()
    expect(await screen.findByText("Amazon Nova Micro")).toBeInTheDocument()
    expect(screen.getByText("Meta Llama 3 8B")).toBeInTheDocument()

    const textarea = screen.getByPlaceholderText(/Quick sync with Alice/)
    await userEvent.type(textarea, "Sync tomorrow at 3pm")
    expect(textarea).toHaveValue("Sync tomorrow at 3pm")
  })

  it("submits direct schedule request", async () => {
    const onOpenChange = vi.fn()
    const fetchMock = mockFetch((url) => {
      if (url.includes("/api/ai/models")) return { body: MOCK_MODELS }
      if (url.includes("/api/meetings/ai")) {
        return {
          status: 201,
          body: {
            id: "12345678-1234-1234-1234-123456789abc",
            title: "Sprint Planning",
            starts_at: "2026-10-15T15:00:00Z",
            ends_at: "2026-10-15T16:00:00Z",
            call_link: "https://meet.google.com/xyz",
            place: null,
            participants: [],
            owner_id: "user-id",
            created_at: "2026-10-12T10:00:00Z",
          },
        }
      }
      return { body: [] }
    })

    renderWithQuery(<AiMeetingDialog open onOpenChange={onOpenChange} />)

    const textarea = await screen.findByPlaceholderText(/Quick sync with Alice/)
    await userEvent.type(textarea, "Sprint planning tomorrow at 3pm on Google Meet")

    const scheduleBtn = screen.getByRole("button", { name: /Schedule now/i })
    await userEvent.click(scheduleBtn)

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/meetings/ai",
      expect.objectContaining({ method: "POST" }),
    )
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("previews parsed meeting", async () => {
    mockFetch((url) => {
      if (url.includes("/api/ai/models")) return { body: MOCK_MODELS }
      if (url.includes("/api/ai/parse-meeting")) {
        return {
          body: {
            title: "Sprint Planning",
            description: "Discuss tasks",
            starts_at: "2026-10-15T15:00:00Z",
            ends_at: "2026-10-15T16:00:00Z",
            call_link: "https://meet.google.com/xyz",
            place: null,
            participant_ids: [],
            new_participants: [],
            model_used: "us.amazon.nova-micro-v1:0",
          },
        }
      }
      return { body: [] }
    })

    renderWithQuery(<AiMeetingDialog open onOpenChange={() => {}} />)

    const textarea = await screen.findByPlaceholderText(/Quick sync with Alice/)
    await userEvent.type(textarea, "Sprint planning tomorrow at 3pm")

    const previewBtn = screen.getByRole("button", { name: /Preview parse/i })
    await userEvent.click(previewBtn)

    expect(await screen.findByText(/AI Parsed/i)).toBeInTheDocument()
    expect(screen.getByText("Sprint Planning")).toBeInTheDocument()
    expect(screen.getByText("Discuss tasks")).toBeInTheDocument()
  })
})
