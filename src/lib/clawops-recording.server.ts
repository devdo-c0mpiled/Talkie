/** Fetch one recording without forwarding provider credentials to a redirect target. */
export async function fetchClawopsRecording(accountId: string, apiKey: string, callId: string, fetcher: typeof fetch = fetch): Promise<Response> {
  const response = await fetcher(`https://api.claw-ops.com/v1/accounts/${encodeURIComponent(accountId)}/recordings/${encodeURIComponent(callId)}`, {
    redirect: 'manual', headers: { authorization: `Bearer ${apiKey}` },
  })
  if (response.status !== 302) return response
  const location = response.headers.get('location')
  if (!location) throw new Error('Recording redirect unavailable')
  const authority = /^https:\/\/([^/?#]+)/i.exec(location)?.[1].toLowerCase()
  let url: URL
  try { url = new URL(location) } catch { throw new Error('Invalid recording redirect') }
  if (authority !== 'storage.googleapis.com' || url.protocol !== 'https:' || url.hostname !== 'storage.googleapis.com' || url.port || url.username || url.password || url.hash ||
      !(url.searchParams.get('X-Goog-Signature') || url.searchParams.get('Signature'))) throw new Error('Invalid recording redirect')
  return fetcher(url.toString(), { redirect: 'manual' })
}
