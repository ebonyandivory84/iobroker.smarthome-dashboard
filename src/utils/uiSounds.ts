import { Platform } from "react-native";

export type UiSound = "tap" | "toggle" | "panel" | "page" | "open" | "close" | "swipe";

type SoundLayer = {
  frequency: number;
  duration: number;
  delay?: number;
  gain?: number;
  glideTo?: number;
  type?: OscillatorType;
};

const SOUND_LIBRARY: Record<UiSound, SoundLayer[]> = {
  tap: [
    { frequency: 990, duration: 0.04, gain: 0.11, type: "triangle", glideTo: 860 },
    { frequency: 1480, duration: 0.03, delay: 0.012, gain: 0.05, type: "sine" },
  ],
  toggle: [
    { frequency: 720, duration: 0.06, gain: 0.12, type: "square", glideTo: 920 },
    { frequency: 1180, duration: 0.04, delay: 0.018, gain: 0.05, type: "triangle" },
  ],
  panel: [
    { frequency: 840, duration: 0.045, gain: 0.09, type: "triangle", glideTo: 1020 },
    { frequency: 1240, duration: 0.035, delay: 0.014, gain: 0.045, type: "sine" },
  ],
  page: [
    { frequency: 610, duration: 0.05, gain: 0.09, type: "square", glideTo: 760 },
    { frequency: 910, duration: 0.05, delay: 0.02, gain: 0.07, type: "triangle", glideTo: 1120 },
  ],
  open: [
    { frequency: 560, duration: 0.06, gain: 0.09, type: "triangle", glideTo: 980 },
    { frequency: 1240, duration: 0.05, delay: 0.026, gain: 0.055, type: "sine" },
  ],
  close: [
    { frequency: 980, duration: 0.05, gain: 0.08, type: "triangle", glideTo: 620 },
    { frequency: 620, duration: 0.04, delay: 0.02, gain: 0.05, type: "square", glideTo: 420 },
  ],
  swipe: [
    { frequency: 520, duration: 0.04, gain: 0.07, type: "triangle", glideTo: 760 },
    { frequency: 760, duration: 0.04, delay: 0.016, gain: 0.06, type: "triangle", glideTo: 980 },
  ],
};

let audioContext: AudioContext | null = null;
let masterGainNode: GainNode | null = null;

export function playUiSound(sound: UiSound = "tap") {
  const context = getAudioContext();
  const masterGain = masterGainNode;
  if (!context || !masterGain) {
    return;
  }

  try {
    if (context.state === "suspended") {
      void context.resume();
    }

    const now = context.currentTime + 0.002;
    const layers = SOUND_LIBRARY[sound] || SOUND_LIBRARY.tap;

    layers.forEach((layer) => {
      const oscillator = context.createOscillator();
      const gainNode = context.createGain();
      const startTime = now + (layer.delay || 0);
      const duration = Math.max(0.01, layer.duration);
      const peakGain = layer.gain || 0.08;
      const endTime = startTime + duration;

      oscillator.type = layer.type || "triangle";
      oscillator.frequency.setValueAtTime(layer.frequency, startTime);
      if (layer.glideTo) {
        oscillator.frequency.linearRampToValueAtTime(layer.glideTo, endTime);
      }

      gainNode.gain.setValueAtTime(0.0001, startTime);
      gainNode.gain.linearRampToValueAtTime(peakGain, startTime + Math.min(0.012, duration * 0.45));
      gainNode.gain.exponentialRampToValueAtTime(0.0001, endTime);

      oscillator.connect(gainNode);
      gainNode.connect(masterGain);

      oscillator.start(startTime);
      oscillator.stop(endTime + 0.01);
    });
  } catch {
    // Ignore audio failures; the UI must remain responsive even when audio is blocked.
  }
}

function getAudioContext() {
  if (Platform.OS !== "web" || typeof window === "undefined") {
    return null;
  }

  const AudioContextCtor =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioContextCtor) {
    return null;
  }

  if (!audioContext) {
    audioContext = new AudioContextCtor();
    masterGainNode = audioContext.createGain();
    masterGainNode.gain.value = 0.18;
    masterGainNode.connect(audioContext.destination);
  }

  return audioContext;
}
