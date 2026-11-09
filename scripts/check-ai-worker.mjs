import assert from 'node:assert/strict'
import { chat, generateSpeech, generateTranscription } from '@tanstack/ai'
import { getOpenAiChat, getGeminiChat, getElevenLabsSpeech, getElevenLabsTranscription, getWorkersAiChat } from '../src/lib/ai.server.ts'

export default {
  async fetch() {
    const env = globalThis.__talkieTestEnv
    const cases = [
      ['OPENAI_API_KEY', getOpenAiChat],
      ['GEMINI_API_KEY', getGeminiChat],
      ['ELEVENLABS_API_KEY', getElevenLabsSpeech],
      ['ELEVENLABS_API_KEY', getElevenLabsTranscription],
      ['AI', getWorkersAiChat],
    ]
    for (const [key, factory] of cases) {
      assert.throws(factory, new RegExp(key), `${key} must be required`)
      if (key !== 'AI') {
        env[key] = '  '
        assert.throws(factory, new RegExp(key), `${key} must reject blank values`)
        delete env[key]
      }
    }

    const requests = []
    globalThis.fetch = async (input, init) => {
      const request = new Request(input, init)
      requests.push(request)
      const url = new URL(request.url)
      if (url.hostname === 'api.openai.com') return new Response('event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"ok","item_id":"synthetic","output_index":0,"content_index":0}\n\nevent: response.completed\ndata: {"type":"response.completed","response":{"id":"resp_synthetic","status":"completed","output":[]}}\n\ndata: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } })
      if (url.hostname === 'generativelanguage.googleapis.com') return new Response('data: {"candidates":[{"content":{"parts":[{"text":"ok"}],"role":"model"},"finishReason":"STOP"}]}\n\n', { headers: { 'content-type': 'text/event-stream' } })
      if (url.hostname === 'api.elevenlabs.io' && url.pathname.includes('text-to-speech')) return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'audio/mpeg' } })
      if (url.hostname === 'api.elevenlabs.io' && url.pathname.includes('speech-to-text')) return Response.json({ text: 'ok', language_code: 'en', language_probability: 1, words: [] })
      throw new Error(`Unexpected outbound request: ${url.hostname}`)
    }
    env.OPENAI_API_KEY = 'synthetic-openai-key'
    env.GEMINI_API_KEY = 'synthetic-gemini-key'
    env.ELEVENLABS_API_KEY = 'synthetic-elevenlabs-key'

    for (const adapter of [getOpenAiChat(), getGeminiChat()]) {
      const chunks = []
      for await (const chunk of chat({ adapter, messages: [{ role: 'user', content: 'hello' }], threadId: 'synthetic' })) chunks.push(chunk)
      assert.ok(chunks.some((chunk) => chunk.type === 'TEXT_MESSAGE_CONTENT' && chunk.delta === 'ok'), `${adapter.name} must produce streamed text`)
    }
    const speech = await generateSpeech({ adapter: getElevenLabsSpeech(), text: 'hello', voice: 'synthetic-voice', threadId: 'synthetic' })
    const transcription = await generateTranscription({ adapter: getElevenLabsTranscription(), audio: new Blob(['audio'], { type: 'audio/wav' }), threadId: 'synthetic' })
    assert.equal(speech.audio, 'AQID')
    assert.equal(transcription.text, 'ok')
    assert.equal(requests.length, 4)
    assert.equal(requests[0].headers.get('authorization'), 'Bearer synthetic-openai-key')
    assert.equal(requests[1].headers.get('x-goog-api-key'), 'synthetic-gemini-key')
    assert.equal(requests[2].headers.get('xi-api-key'), 'synthetic-elevenlabs-key')
    assert.equal(requests[3].headers.get('xi-api-key'), 'synthetic-elevenlabs-key')

    let call
    env.AI = { async run(model, input, options) {
      call = { model, input, options }
      return new Response('data: {"id":"synthetic","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"ok"},"finish_reason":null}]}\n\ndata: {"id":"synthetic","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } })
    } }
    const chunks = []
    for await (const chunk of chat({ adapter: getWorkersAiChat(), messages: [{ role: 'user', content: 'hello' }], threadId: 'synthetic' })) chunks.push(chunk)
    assert.equal(call.model, '@cf/google/gemma-4-26b-a4b-it')
    assert.equal(call.input.messages[0].content, 'hello')
    assert.equal(call.options.returnRawResponse, true)
    assert.ok(chunks.some((chunk) => chunk.type === 'TEXT_MESSAGE_CONTENT' && chunk.delta === 'ok'), 'streamed content must reach TanStack AI')
    assert.equal(requests.length, 4, 'Workers AI must use the binding instead of HTTP')
    return new Response('AI adapter checks passed')
  },
}
