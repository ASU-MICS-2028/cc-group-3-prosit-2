/** Voice notes: recorded on the phone, saved with the record, transcribed later when there is a signal.
 *  Needs a secure (https) page and the person's permission for the microphone. */
export const MAX_SECONDS = 120;

export type RecorderErrorCode = "unsupported" | "insecure" | "denied" | "no-microphone" | "failed";
export class RecorderError extends Error {
  constructor(public code: RecorderErrorCode, message: string) { super(message); this.name = "RecorderError"; }
}

export type Recording = {
  /** Stops and returns the audio. Rejects if nothing was recorded. */
  stop(): Promise<{ bytes: Uint8Array; contentType: string }>;
  /** Stops and throws everything away. */
  cancel(): void;
};

const pickType = () => ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((t) => MediaRecorder.isTypeSupported?.(t));

export async function startRecording(): Promise<Recording> {
  if (!window.isSecureContext) throw new RecorderError("insecure", "Recording needs a secure page (https). Use the secure address.");
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new RecorderError("unsupported", "This phone's browser can't record voice notes.");
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    const name = (e as DOMException).name;
    if (name === "NotAllowedError" || name === "SecurityError") throw new RecorderError("denied", "The microphone is blocked. Allow it in the browser's settings, then try again.");
    if (name === "NotFoundError") throw new RecorderError("no-microphone", "No microphone was found.");
    throw new RecorderError("failed", "We couldn't start recording. Please try again.");
  }
  const type = pickType();
  const recorder = new MediaRecorder(stream, { ...(type && { mimeType: type }), audioBitsPerSecond: 16_000 });   // small files for weak networks
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const release = () => stream.getTracks().forEach((t) => t.stop());
  const finished = new Promise<void>((res) => { recorder.onstop = () => res(); });
  recorder.start();

  return {
    async stop() {
      if (recorder.state !== "inactive") recorder.stop();
      await finished; release();
      const blob = new Blob(chunks, { type: recorder.mimeType || type || "audio/webm" });
      if (blob.size === 0) throw new RecorderError("failed", "Nothing was recorded.");
      return { bytes: new Uint8Array(await blob.arrayBuffer()), contentType: blob.type.split(";")[0] };
    },
    cancel() { if (recorder.state !== "inactive") recorder.stop(); release(); },
  };
}
