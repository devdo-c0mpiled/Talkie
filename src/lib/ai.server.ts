import '@tanstack/react-start/server-only'

import { env } from 'cloudflare:workers'
import { createCloudflareText } from '@tanstack/ai-cloudflare'
import type { CloudflareBindingConfig } from '@tanstack/ai-cloudflare'
import { createElevenLabsSpeech, createElevenLabsTranscription } from '@tanstack/ai-elevenlabs'
import { createGeminiChat } from '@tanstack/ai-gemini'
import { createOpenaiChat } from '@tanstack/ai-openai'

function requiredSecret(value: string | undefined, name: string) {
  if (!value?.trim()) throw new Error(`${name} must be configured`)
  return value
}

export function getOpenAiChat(model: Parameters<typeof createOpenaiChat>[0] = 'gpt-4o-mini') {
  return createOpenaiChat(model, requiredSecret(env.OPENAI_API_KEY, 'OPENAI_API_KEY'))
}

export function getGeminiChat(model: Parameters<typeof createGeminiChat>[0] = 'gemini-3.8-flash') {
  return createGeminiChat(model, requiredSecret(env.GEMINI_API_KEY, 'GEMINI_API_KEY'))
}

export function getElevenLabsSpeech(model: Parameters<typeof createElevenLabsSpeech>[0] = 'eleven_multilingual_v2') {
  return createElevenLabsSpeech(model, requiredSecret(env.ELEVENLABS_API_KEY, 'ELEVENLABS_API_KEY'))
}

export function getElevenLabsTranscription(model: Parameters<typeof createElevenLabsTranscription>[0] = 'scribe_v2') {
  return createElevenLabsTranscription(model, requiredSecret(env.ELEVENLABS_API_KEY, 'ELEVENLABS_API_KEY'))
}

export function getWorkersAiChat(
  model: Parameters<typeof createCloudflareText>[0] = '@cf/google/gemma-4-26b-a4b-it',
) {
  if (!env.AI) throw new Error('AI binding must be configured')
  // The adapter imports Workers types as a module while Wrangler exposes global
  // types; their DOM Event types differ even when both use the same version.
  const binding = env.AI as unknown as CloudflareBindingConfig['binding']
  return createCloudflareText(model, { binding })
}
