import "server-only";

// Whisper transcription — separate from ANTHROPIC_API_KEY since Claude
// doesn't do audio-to-text; only the Notetaker's audio-upload path needs
// this. Text-paste summarization (the common case) never touches this file.

export function transcriptionConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

// Never throws — resolves {ok, error} like every other outbound call here.
export async function transcribeAudio(fileBuffer: Buffer, filename: string, mimeType: string): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  if (!transcriptionConfigured()) return { ok: false, error: "Transcription is not configured — add OPENAI_API_KEY." };
  try {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(fileBuffer)], { type: mimeType }), filename);
    form.append("model", "whisper-1");

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form,
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `Transcription failed: ${res.status} ${text.slice(0, 300)}` };
    }
    const j = (await res.json()) as { text: string };
    return { ok: true, text: j.text };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
