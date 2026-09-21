/**
 * Read an NDJSON response one event at a time.
 *
 * The LLM routes stream because they routinely run 30-90s and a silent spinner
 * that long reads as a hang. Three callers now share this loop; it was written
 * once inline in the new-application flow.
 */
export async function readNdjson(res: Response, onEvent: (e: Record<string, unknown>) => void): Promise<void> {
  const reader = res.body?.getReader()
  if (!reader) throw new Error('the response carried no body')

  const decoder = new TextDecoder()
  let buf = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })

    const lines = buf.split('\n')
    // The last piece may be half an event; hold it until the next chunk.
    buf = lines.pop() ?? ''
    for (const line of lines) {
      if (line.trim()) onEvent(JSON.parse(line))
    }
  }

  if (buf.trim()) onEvent(JSON.parse(buf))
}
