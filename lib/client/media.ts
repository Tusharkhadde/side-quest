"use client";

/** Resize a photo on the device before anything else sees it. */
export async function resizeImage(file: Blob, maxSide = 768, quality = 0.82): Promise<{ blob: Blob; base64: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode photo"))), "image/jpeg", quality)
  );
  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  return { blob, base64: dataUrl.slice(dataUrl.indexOf("base64,") + 7) };
}

let currentAudio: HTMLAudioElement | null = null;

export function stopSpeaking() {
  if (typeof window === "undefined") return;
  window.speechSynthesis?.cancel();
  currentAudio?.pause();
  currentAudio = null;
}

function speakDevice(text: string): Promise<void> {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    if (!synth) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.92;
    u.pitch = 1;
    const en = synth.getVoices().find((v) => v.lang.startsWith("en") && v.localService);
    if (en) u.voice = en;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    synth.speak(u);
  });
}

/**
 * Speak one line. ElevenLabs if chosen and configured on the server,
 * otherwise the free on-device Web Speech voice.
 */
export async function speak(text: string, voice: "device" | "elevenlabs"): Promise<void> {
  stopSpeaking();
  if (voice === "elevenlabs") {
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });
      if (res.ok) {
        const url = URL.createObjectURL(await res.blob());
        const audio = new Audio(url);
        currentAudio = audio;
        await new Promise<void>((resolve) => {
          audio.onended = () => resolve();
          audio.onerror = () => resolve();
          audio.play().catch(() => resolve());
        });
        URL.revokeObjectURL(url);
        return;
      }
    } catch {
      // fall through to the device voice
    }
  }
  await speakDevice(text);
}

/** Keep the screen from sleeping (it is black anyway) so speech keeps going. */
export async function requestWakeLock(): Promise<WakeLockSentinel | null> {
  try {
    if ("wakeLock" in navigator) return await navigator.wakeLock.request("screen");
  } catch {
    // not supported or denied: voice still works while the page is open
  }
  return null;
}
