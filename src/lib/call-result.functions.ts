import { createServerFn } from '@tanstack/react-start'

/** The stored result for a booking page, or null when the address is not one we issued. */
export const getCallResultPage = createServerFn({ method: 'GET' })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    const { loadCallResult } = await import('./call-result.server')
    return (await loadCallResult(id))?.result ?? null
  })
