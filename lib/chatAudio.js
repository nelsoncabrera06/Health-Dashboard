// Captura y codificación de notas de voz estilo Telegram para el Asistente AI.
// Límite duro de 30 segundos para evitar sobrecargar el backend y Gemini.

export const MAX_AUDIO_SECONDS = 30;

export function isAudioRecordingSupported() {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof window !== "undefined" &&
    typeof window.MediaRecorder !== "undefined"
  );
}

export function formatAudioTime(totalSec) {
  const s = Math.max(0, Math.floor(totalSec));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function getSupportedAudioMimeType() {
  if (typeof window === "undefined" || typeof window.MediaRecorder === "undefined") {
    return "";
  }
  const types = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
    "audio/wav",
  ];
  for (const t of types) {
    if (window.MediaRecorder.isTypeSupported?.(t)) {
      return t;
    }
  }
  return "";
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("No se pudo leer el archivo de audio."));
    reader.readAsDataURL(blob);
  });
}

export class VoiceRecorder {
  constructor() {
    this.stream = null;
    this.mediaRecorder = null;
    this.chunks = [];
    this.timer = null;
    this.seconds = 0;
    this.onTick = null;
    this.onAutoStop = null;
    this.isRecording = false;
  }

  async start({ onTick, onAutoStop } = {}) {
    if (!isAudioRecordingSupported()) {
      throw new Error("Tu navegador no soporta grabación de audio.");
    }

    this.chunks = [];
    this.seconds = 0;
    this.onTick = onTick;
    this.onAutoStop = onAutoStop;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (err) {
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        throw new Error("Permiso de micrófono denegado.");
      }
      throw new Error("No se pudo acceder al micrófono.");
    }

    const mimeType = getSupportedAudioMimeType();
    const options = mimeType ? { mimeType } : undefined;

    try {
      this.mediaRecorder = new MediaRecorder(this.stream, options);
    } catch {
      this.mediaRecorder = new MediaRecorder(this.stream);
    }

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        this.chunks.push(e.data);
      }
    };

    this.mediaRecorder.start(250); // Emitir chunks cada 250ms
    this.isRecording = true;

    // Cronómetro de segundo a segundo
    this.timer = setInterval(() => {
      this.seconds += 1;
      this.onTick?.(this.seconds);

      if (this.seconds >= MAX_AUDIO_SECONDS) {
        clearInterval(this.timer);
        this.timer = null;
        this.onAutoStop?.();
      }
    }, 1000);
  }

  stop() {
    return new Promise((resolve) => {
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }

      if (!this.mediaRecorder || this.mediaRecorder.state === "inactive") {
        this._cleanupStream();
        this.isRecording = false;
        resolve(null);
        return;
      }

      const duration = this.seconds;
      const actualMime = this.mediaRecorder.mimeType || "audio/webm";

      this.mediaRecorder.onstop = async () => {
        this._cleanupStream();
        this.isRecording = false;
        const blob = new Blob(this.chunks, { type: actualMime });
        try {
          const dataUrl = await blobToDataUrl(blob);
          resolve({ blob, dataUrl, duration, mimeType: actualMime });
        } catch {
          resolve(null);
        }
      };

      this.mediaRecorder.stop();
    });
  }

  cancel() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.onstop = null;
      this.mediaRecorder.stop();
    }
    this._cleanupStream();
    this.chunks = [];
    this.isRecording = false;
  }

  _cleanupStream() {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
  }
}
