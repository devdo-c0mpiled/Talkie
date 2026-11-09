// The record behind a booking page (/b/<id>): what a call Tokie placed ended in, and what was said on it.
// Shared by the server, which builds and stores it, and the page, which shows it.

export type CallResultStatus = 'confirmed' | 'pending' | 'declined' | 'none'

export type CallResultLine = {
  id: string
  role: 'agent' | 'business'
  /** As spoken, in Korean. */
  text: string
  /** In the traveler's language; empty when that language is Korean. */
  translation: string
  /** Seconds into the call (and its recording) when the line began, if known. */
  at: number | null
}

export type CallResult = {
  /** Public id, also the last part of the page's address. Anyone who has it can open the page. */
  id: string
  business: string
  phoneNumber: string
  /** BCP 47 tag of the traveler's language, which every text field below is written in. */
  language: string
  callEndedAt: string
  status: CallResultStatus
  /** One sentence saying what happened on the call. */
  headline: string
  /** Fields the call did not settle are empty. */
  when: string
  /** Start of the booking in Korea time, as YYYY-MM-DDTHH:mm, when a date and time were agreed. */
  startsAt: string
  what: string
  who: string
  addressKo: string
  bring: string[]
  answers: { question: string; answer: string; line: string }[]
  /** Ids of the lines where each detail was settled, for the "from your call" links. */
  sources: { when: string; what: string; who: string }
  lines: CallResultLine[]
  hasRecording: boolean
}

/** What the chat needs to show the link to the page. */
export type CallResultLink = Pick<CallResult, 'id' | 'status' | 'business' | 'headline' | 'when'>

/** Seconds as m:ss. */
export function formatClock(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}
