import { Platform } from "react-native";
import { UiSoundSettings, UiSoundSet } from "../types/dashboard";
import { normalizeSoundSelection, resolveLcarsSoundUri } from "./lcarsSounds";

export type UiSound = "tap" | "toggle" | "panel" | "page" | "open" | "close" | "swipe";

type SoundLayer = {
  frequency: number;
  duration: number;
  delay?: number;
  gain?: number;
  glideTo?: number;
  type?: OscillatorType;
};

const DEFAULT_UI_SOUND_SETTINGS: UiSoundSettings = {
  enabled: true,
  volume: 55,
  soundSet: "voyager",
  widgetTypeDefaults: {},
  pageSounds: {
    tabPress: [],
    swipe: [],
    contentScroll: [],
    pullToRefresh: [],
    layoutToggle: [],
    addWidget: [],
    openSettings: [],
  },
};

const SOUND_LIBRARY_BY_SET: Record<UiSoundSet, Record<UiSound, SoundLayer[]>> = {
  voyager: {
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
  },
  ops: {
    tap: [
      { frequency: 1140, duration: 0.03, gain: 0.1, type: "square", glideTo: 960 },
      { frequency: 1710, duration: 0.025, delay: 0.008, gain: 0.035, type: "square" },
    ],
    toggle: [
      { frequency: 660, duration: 0.05, gain: 0.115, type: "square", glideTo: 1040 },
      { frequency: 1320, duration: 0.03, delay: 0.012, gain: 0.04, type: "sine" },
    ],
    panel: [
      { frequency: 930, duration: 0.04, gain: 0.08, type: "square", glideTo: 1180 },
      { frequency: 1520, duration: 0.025, delay: 0.01, gain: 0.03, type: "triangle" },
    ],
    page: [
      { frequency: 700, duration: 0.035, gain: 0.08, type: "square", glideTo: 920 },
      { frequency: 1040, duration: 0.035, delay: 0.015, gain: 0.05, type: "square", glideTo: 1360 },
    ],
    open: [
      { frequency: 640, duration: 0.05, gain: 0.075, type: "square", glideTo: 1140 },
      { frequency: 1520, duration: 0.035, delay: 0.018, gain: 0.035, type: "sine" },
    ],
    close: [
      { frequency: 1160, duration: 0.04, gain: 0.07, type: "square", glideTo: 760 },
      { frequency: 760, duration: 0.03, delay: 0.015, gain: 0.04, type: "triangle", glideTo: 520 },
    ],
    swipe: [
      { frequency: 600, duration: 0.03, gain: 0.06, type: "square", glideTo: 840 },
      { frequency: 840, duration: 0.03, delay: 0.012, gain: 0.045, type: "square", glideTo: 1080 },
    ],
  },
  soft: {
    tap: [
      { frequency: 820, duration: 0.05, gain: 0.08, type: "sine", glideTo: 760 },
      { frequency: 1240, duration: 0.03, delay: 0.012, gain: 0.03, type: "triangle" },
    ],
    toggle: [
      { frequency: 520, duration: 0.065, gain: 0.09, type: "triangle", glideTo: 760 },
      { frequency: 980, duration: 0.04, delay: 0.02, gain: 0.03, type: "sine" },
    ],
    panel: [
      { frequency: 760, duration: 0.045, gain: 0.07, type: "sine", glideTo: 900 },
      { frequency: 1140, duration: 0.03, delay: 0.014, gain: 0.025, type: "triangle" },
    ],
    page: [
      { frequency: 460, duration: 0.055, gain: 0.07, type: "triangle", glideTo: 620 },
      { frequency: 760, duration: 0.05, delay: 0.018, gain: 0.04, type: "sine", glideTo: 920 },
    ],
    open: [
      { frequency: 480, duration: 0.07, gain: 0.065, type: "triangle", glideTo: 820 },
      { frequency: 980, duration: 0.05, delay: 0.026, gain: 0.03, type: "sine" },
    ],
    close: [
      { frequency: 860, duration: 0.05, gain: 0.06, type: "triangle", glideTo: 560 },
      { frequency: 620, duration: 0.045, delay: 0.022, gain: 0.03, type: "sine", glideTo: 420 },
    ],
    swipe: [
      { frequency: 420, duration: 0.045, gain: 0.05, type: "triangle", glideTo: 620 },
      { frequency: 620, duration: 0.045, delay: 0.016, gain: 0.035, type: "triangle", glideTo: 820 },
    ],
  },
};

let audioContext: AudioContext | null = null;
let masterGainNode: GainNode | null = null;
let uiSoundSettings: UiSoundSettings = DEFAULT_UI_SOUND_SETTINGS;
const soundCursor = new Map<string, number>();
const decodedAudioCache = new Map<string, Promise<AudioBuffer | null>>();

export function configureUiSounds(settings?: UiSoundSettings) {
  uiSoundSettings = normalizeUiSoundSettings(settings);

  if (masterGainNode) {
    masterGainNode.gain.value = toMasterGain(uiSoundSettings.volume);
  }
}

export function playUiSound(sound: UiSound = "tap") {
  if (!uiSoundSettings.enabled) {
    return;
  }

  playSynthSound(sound);
}

export function playConfiguredUiSound(soundIds: string[] | undefined, fallback: UiSound, cycleKey: string) {
  if (!uiSoundSettings.enabled) {
    return;
  }

  const normalizedSelection = normalizeSoundSelection(soundIds);
  if (!normalizedSelection.length) {
    playSynthSound(fallback);
    return;
  }

  if (Platform.OS !== "web" || typeof window === "undefined") {
    playSynthSound(fallback);
    return;
  }

  const cursorKey = `${cycleKey}::${normalizedSelection.join("|")}`;
  const startIndex = soundCursor.get(cursorKey) || 0;
  void playNextConfiguredSound(normalizedSelection, startIndex, fallback, cursorKey);
}

export function playSoundPreview(soundId: string) {
  if (!uiSoundSettings.enabled) {
    return;
  }

  playDecodedAudio(soundId, "tap");
}

export function primeConfiguredSounds(soundIds: string[]) {
  if (Platform.OS !== "web" || typeof window === "undefined") {
    return;
  }

  normalizeSoundSelection(soundIds, Number.MAX_SAFE_INTEGER).forEach((soundId) => {
    void loadDecodedAudio(soundId);
  });
}

function playSynthSound(sound: UiSound) {
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
    const activeLibrary = SOUND_LIBRARY_BY_SET[uiSoundSettings.soundSet] || SOUND_LIBRARY_BY_SET.voyager;
    const layers = activeLibrary[sound] || activeLibrary.tap;

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

function playDecodedAudio(soundId: string, fallback: UiSound) {
  void playSingleDecodedAudio(soundId, fallback);
}

function loadDecodedAudio(soundId: string) {
  const cached = decodedAudioCache.get(soundId);
  if (cached) {
    return cached;
  }

  const context = getAudioContext();
  const uri = resolveLcarsSoundUri(soundId);

  if (!context || !uri || typeof fetch !== "function") {
    return Promise.resolve(null);
  }

  const loader = fetch(uri)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Audio fetch failed (${response.status})`);
      }
      return response.arrayBuffer();
    })
    .then((buffer) => context.decodeAudioData(buffer.slice(0)))
    .catch(() => null);

  decodedAudioCache.set(soundId, loader);
  return loader;
}

async function playNextConfiguredSound(
  selection: string[],
  startIndex: number,
  fallback: UiSound,
  cursorKey: string
) {
  for (let offset = 0; offset < selection.length; offset += 1) {
    const index = (startIndex + offset) % selection.length;
    const didPlay = await playSingleDecodedAudio(selection[index], undefined);
    if (didPlay) {
      soundCursor.set(cursorKey, (index + 1) % selection.length);
      return;
    }
  }

  soundCursor.set(cursorKey, 0);
  playSynthSound(fallback);
}

async function playSingleDecodedAudio(soundId: string, fallback?: UiSound) {
  const context = getAudioContext();
  const masterGain = masterGainNode;

  if (!context || !masterGain) {
    if (fallback) {
      playSynthSound(fallback);
    }
    return false;
  }

  if (context.state === "suspended") {
    void context.resume();
  }

  try {
    const buffer = await loadDecodedAudio(soundId);
    if (!buffer) {
      if (fallback) {
        playSynthSound(fallback);
      }
      return false;
    }

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(masterGain);
    source.start();
    return true;
  } catch {
    if (fallback) {
      playSynthSound(fallback);
    }
    return false;
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
    masterGainNode.gain.value = toMasterGain(uiSoundSettings.volume);
    masterGainNode.connect(audioContext.destination);
  }

  return audioContext;
}

function normalizeUiSoundSettings(settings?: UiSoundSettings): UiSoundSettings {
  const soundSet = settings?.soundSet;
  const normalizedSoundSet: UiSoundSet =
    soundSet === "ops" || soundSet === "soft" || soundSet === "voyager"
      ? soundSet
      : DEFAULT_UI_SOUND_SETTINGS.soundSet;
  const volumeValue =
    typeof settings?.volume === "number" && Number.isFinite(settings.volume)
      ? Math.round(settings.volume)
      : DEFAULT_UI_SOUND_SETTINGS.volume;

  return {
    enabled: settings?.enabled !== false,
    volume: Math.max(0, Math.min(100, volumeValue)),
    soundSet: normalizedSoundSet,
    widgetTypeDefaults: settings?.widgetTypeDefaults || {},
    pageSounds: {
      tabPress: normalizeSoundSelection(settings?.pageSounds?.tabPress),
      swipe: normalizeSoundSelection(settings?.pageSounds?.swipe),
      contentScroll: normalizeSoundSelection(settings?.pageSounds?.contentScroll),
      pullToRefresh: normalizeSoundSelection(settings?.pageSounds?.pullToRefresh),
      layoutToggle: normalizeSoundSelection(settings?.pageSounds?.layoutToggle),
      addWidget: normalizeSoundSelection(settings?.pageSounds?.addWidget),
      openSettings: normalizeSoundSelection(settings?.pageSounds?.openSettings),
    },
  };
}

function toMasterGain(volume: number) {
  const normalizedVolume = Math.max(0, Math.min(100, volume));
  return (normalizedVolume / 100) * 0.32;
}
