/* Placeholder data for the business dashboard demo (`/biz/dashboard`).
   Every hotel, guest, booking and transcript here is fictional. No backend, DB or auth.
   Source: Claude Design "Tokie voice booking agent" › O1 Dashboard (M) / O2 Detail (M). */

export type LangCode = 'ja' | 'zh' | 'th' | 'en'
export type BookingStatus = 'pending' | 'confirmed' | 'handoff'

export const langLabel: Record<LangCode, string> = { ja: '日本語', zh: '中文', th: 'ไทย', en: 'English' }
export const langName: Record<LangCode, string> = { ja: 'Japanese', zh: 'Chinese', th: 'Thai', en: 'English' }
export const statusLabel: Record<BookingStatus, string> = { pending: 'Pending', confirmed: 'Confirmed', handoff: 'Callback needed' }

export type TranscriptLine = { t: string; caller: boolean; en: string; orig: string }

export type Booking = {
  id: string
  name: string
  firstName: string
  lang: LangCode
  /** Requested check-in/out, or null when the guest asked no dates. */
  when: string | null
  /** Room and party size, shown in the list. */
  treatment: string
  /** Room, party size and nights, shown on the detail screen. */
  treatmentLong: string
  channel: string
  status: BookingStatus
  /** When the call came in, as shown in the list. */
  received: string
  isNew?: boolean
  calledAgo: string
  /** Recording length in seconds. */
  duration: number
  /** Returning-guest history, shown as "Guests" on the detail screen. */
  previous: string
  /** Special request, shown as "Special request" on the detail screen. */
  arrival: string
  /** Question the agent could not answer; shown as "Needs a staff reply". */
  staffReply?: { asked: string; agent: string }
  transcript: TranscriptLine[]
}

export const clinic = { name: 'Seoul Breeze Hotel', initial: 'S', today: 'Monday, Nov 9' }

export const summary = {
  today: { calls: 26, reqs: 15, hand: 2, ja: 10, zh: 6, th: 5, en: 5 },
  week: { calls: 132, reqs: 72, hand: 10, ja: 50, zh: 36, th: 28, en: 18 },
}

export const rescheduleSlots = ['Fri, Dec 5 · afternoon', 'Sat, Dec 6 · afternoon', 'Sun, Dec 7 · morning']

export const bookings: Booking[] = [
  {
    id: 'TK-2611-0420',
    name: 'Allen',
    firstName: 'Allen',
    lang: 'en',
    when: 'Fri, Dec 5 – Sun, Dec 7, 2026',
    treatment: 'Twin room · 2 adults',
    treatmentLong: 'Twin room · 2 adults · 2 nights (Dec 5–7, 2026)',
    channel: 'Phone',
    status: 'pending',
    received: 'Just now',
    isNew: true,
    calledAgo: 'Called 6 min ago',
    duration: 161,
    previous: '2 adults',
    arrival: 'None',
    staffReply: { asked: 'Can you confirm the total for 2 nights before I book?', agent: 'The agent is checking the total with the front desk and will follow up.' },
    transcript: [
      { t: '0:00', caller: false, en: 'Hi, this is Seoul Breeze Hotel. How can I help?', orig: 'Hi, this is Seoul Breeze Hotel. How can I help?' },
      { t: '0:05', caller: true, en: "Hi, I'm Allen. Could you check if you have a twin room for two adults, December 5 to 7?", orig: "Hi, I'm Allen. Could you check if you have a twin room for two adults, December 5 to 7?" },
      { t: '0:30', caller: false, en: 'Let me check with the front desk... Yes, a twin room is available for those dates. Nothing is booked yet — would you like me to check the total price first?', orig: 'Let me check with the front desk... Yes, a twin room is available for those dates. Nothing is booked yet — would you like me to check the total price first?' },
      { t: '1:02', caller: true, en: 'Yes, please check the total first.', orig: 'Yes, please check the total first.' },
      { t: '1:08', caller: false, en: "Sure, I'll confirm the total with the front desk and follow up shortly.", orig: "Sure, I'll confirm the total with the front desk and follow up shortly." },
    ],
  },
  {
    id: 'TK-2611-0417',
    name: 'Lin Wang',
    firstName: 'Lin',
    lang: 'zh',
    when: 'Sat, Dec 13 – Mon, Dec 15, 2026',
    treatment: 'Double room · 2 adults',
    treatmentLong: 'Double room · 2 adults · 2 nights (Dec 13–15, 2026)',
    channel: 'WeChat',
    status: 'pending',
    received: '10:42 AM',
    calledAgo: 'Called today, 10:42 AM',
    duration: 134,
    previous: 'None',
    arrival: 'Airport pickup at 2 PM',
    transcript: [
      { t: '0:00', caller: false, en: 'Hi, this is Seoul Breeze Hotel. How can I help?', orig: '您好，这里是Seoul Breeze酒店。请问有什么可以帮您？' },
      { t: '0:05', caller: true, en: "I'd like a double room for two adults, December 13 to 15.", orig: '我想订一间双人房，12月13日到15日，两位成人。' },
      { t: '0:13', caller: false, en: 'A double room is available for those dates. Shall I hold it?', orig: '那几天有双人房空房，需要我帮您保留吗？' },
      { t: '0:19', caller: true, en: 'Yes, please. Message me on WeChat.', orig: '好的，麻烦了。请用微信联系我。' },
    ],
  },
  {
    id: 'TK-2611-0412',
    name: 'Nattaya K.',
    firstName: 'Nattaya',
    lang: 'th',
    when: 'Thu, Dec 12 – Sun, Dec 15, 2026',
    treatment: 'Family room · 2 adults, 2 children',
    treatmentLong: 'Family room · 2 adults, 2 children · 3 nights (Dec 12–15, 2026)',
    channel: 'WhatsApp',
    status: 'pending',
    received: '9:15 AM',
    calledAgo: 'Called today, 9:15 AM',
    duration: 118,
    previous: 'Stayed with us, Jul 2025',
    arrival: 'Late check-in, after 10 PM',
    transcript: [
      { t: '0:00', caller: false, en: 'Hi, this is Seoul Breeze Hotel. How can I help?', orig: 'สวัสดีค่ะ โรงแรม Seoul Breeze ยินดีให้บริการค่ะ' },
      { t: '0:06', caller: true, en: "I'd like a family room for two adults and two children, December 12 to 15.", orig: 'อยากจองห้องแฟมิลี่ ผู้ใหญ่ 2 เด็ก 2 วันที่ 12 ถึง 15 ธันวาคมค่ะ' },
      { t: '0:14', caller: false, en: 'A family room is open for those dates. Shall I hold it?', orig: 'ช่วงนั้นห้องแฟมิลี่ว่างค่ะ จองไว้ให้เลยไหมคะ' },
      { t: '0:20', caller: true, en: 'Yes, please. We may arrive late, after 10 PM.', orig: 'ได้ค่ะ เราอาจจะถึงดึกหน่อย หลังสี่ทุ่มค่ะ' },
    ],
  },
  {
    id: 'TK-2611-0398',
    name: 'Mio Tanaka',
    firstName: 'Mio',
    lang: 'ja',
    when: 'Tue, Dec 9 – Thu, Dec 11, 2026',
    treatment: 'Twin room · 2 adults',
    treatmentLong: 'Twin room · 2 adults · 2 nights (Dec 9–11, 2026)',
    channel: 'Email',
    status: 'confirmed',
    received: 'Yesterday',
    calledAgo: 'Called yesterday, 3:20 PM',
    duration: 142,
    previous: 'None',
    arrival: 'None',
    transcript: [
      { t: '0:00', caller: false, en: 'Hi, this is Seoul Breeze Hotel. How can I help?', orig: 'こんにちは、Seoul Breeze ホテルです。ご用件をどうぞ。' },
      { t: '0:07', caller: true, en: "I'd like a twin room for two adults, December 9 to 11.", orig: '12月9日から11日まで、大人2名でツインルームをお願いしたいです。' },
      { t: '0:15', caller: false, en: 'A twin room is open for those dates. Shall I book it?', orig: 'その日程でツインルームの空きがございます。ご予約しますか？' },
      { t: '0:22', caller: true, en: 'Yes, please. Email is best for me.', orig: 'はい、お願いします。連絡はメールがいいです。' },
    ],
  },
  {
    id: 'TK-2611-0391',
    name: 'Yu Chen',
    firstName: 'Yu',
    lang: 'zh',
    when: null,
    treatment: 'Late checkout question',
    treatmentLong: 'Late checkout question',
    channel: 'WeChat',
    status: 'handoff',
    received: 'Yesterday',
    calledAgo: 'Called yesterday, 11:05 AM',
    duration: 96,
    previous: 'Stayed with us, Mar 2026',
    arrival: 'Currently checked in',
    staffReply: { asked: 'Can I get a late checkout until 3 PM tomorrow, and is there a fee?', agent: 'The agent said a staff member would confirm and call back.' },
    transcript: [
      { t: '0:00', caller: false, en: 'Hi, this is Seoul Breeze Hotel. How can I help?', orig: '您好，这里是Seoul Breeze酒店。请问有什么可以帮您？' },
      { t: '0:05', caller: true, en: 'Can I get a late checkout until 3 PM tomorrow, and is there a fee?', orig: '我明天可以延迟到下午3点退房吗？需要收费吗？' },
      { t: '0:14', caller: false, en: "I can't confirm room availability for that, but I'll have a staff member call you back today.", orig: '这个我无法确认房间情况，今天会请工作人员给您回电。' },
    ],
  },
]

export function findBooking(id: string) {
  return bookings.find((b) => b.id === id)
}

/** "2:41" from 161 seconds. */
export function formatDuration(sec: number) {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
}
