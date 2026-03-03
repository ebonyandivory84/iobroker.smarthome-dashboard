export type LcarsSoundOption = {
  id: string;
  label: string;
  module: unknown;
};

export const LCARS_SOUND_OPTIONS: LcarsSoundOption[] = [
  { id: "alarm2.wav", label: "alarm2.wav", module: require("../../assets/LCARS Sounds/alarm2.wav") },
  { id: "alarm4.wav", label: "alarm4.wav", module: require("../../assets/LCARS Sounds/alarm4.wav") },
  { id: "alarm6.wav", label: "alarm6.wav", module: require("../../assets/LCARS Sounds/alarm6.wav") },
  { id: "computerbeep_12.mp3", label: "computerbeep_12.mp3", module: require("../../assets/LCARS Sounds/computerbeep_12.mp3") },
  { id: "computerbeep_23.mp3", label: "computerbeep_23.mp3", module: require("../../assets/LCARS Sounds/computerbeep_23.mp3") },
  { id: "computerbeep_30.mp3", label: "computerbeep_30.mp3", module: require("../../assets/LCARS Sounds/computerbeep_30.mp3") },
  { id: "computerbeep_4.mp3", label: "computerbeep_4.mp3", module: require("../../assets/LCARS Sounds/computerbeep_4.mp3") },
  { id: "computerbeep_55.mp3", label: "computerbeep_55.mp3", module: require("../../assets/LCARS Sounds/computerbeep_55.mp3") },
  { id: "computerbeep_59.mp3", label: "computerbeep_59.mp3", module: require("../../assets/LCARS Sounds/computerbeep_59.mp3") },
  { id: "computerbeep_61.mp3", label: "computerbeep_61.mp3", module: require("../../assets/LCARS Sounds/computerbeep_61.mp3") },
  { id: "computerbeep_66.mp3", label: "computerbeep_66.mp3", module: require("../../assets/LCARS Sounds/computerbeep_66.mp3") },
  { id: "computerbeep_68.mp3", label: "computerbeep_68.mp3", module: require("../../assets/LCARS Sounds/computerbeep_68.mp3") },
  { id: "computerbeep_69.mp3", label: "computerbeep_69.mp3", module: require("../../assets/LCARS Sounds/computerbeep_69.mp3") },
  { id: "computerbeep_74.mp3", label: "computerbeep_74.mp3", module: require("../../assets/LCARS Sounds/computerbeep_74.mp3") },
  { id: "denybeep1.mp3", label: "denybeep1.mp3", module: require("../../assets/LCARS Sounds/denybeep1.mp3") },
  { id: "denybeep3.mp3", label: "denybeep3.mp3", module: require("../../assets/LCARS Sounds/denybeep3.mp3") },
  { id: "incoming_hail3.mp3", label: "incoming_hail3.mp3", module: require("../../assets/LCARS Sounds/incoming_hail3.mp3") },
  { id: "input_ok_1_clean.mp3", label: "input_ok_1_clean.mp3", module: require("../../assets/LCARS Sounds/input_ok_1_clean.mp3") },
  { id: "inputok1.wav", label: "inputok1.wav", module: require("../../assets/LCARS Sounds/inputok1.wav") },
  { id: "inputok2.wav", label: "inputok2.wav", module: require("../../assets/LCARS Sounds/inputok2.wav") },
  { id: "keydenied.wav", label: "keydenied.wav", module: require("../../assets/LCARS Sounds/keydenied.wav") },
  { id: "keyok1.mp3", label: "keyok1.mp3", module: require("../../assets/LCARS Sounds/keyok1.mp3") },
  { id: "keyok2.mp3", label: "keyok2.mp3", module: require("../../assets/LCARS Sounds/keyok2.mp3") },
  { id: "keyok3.wav", label: "keyok3.wav", module: require("../../assets/LCARS Sounds/keyok3.wav") },
  { id: "keyok4.wav", label: "keyok4.wav", module: require("../../assets/LCARS Sounds/keyok4.wav") },
  { id: "keyok5.mp3", label: "keyok5.mp3", module: require("../../assets/LCARS Sounds/keyok5.mp3") },
  { id: "keyok5.wav", label: "keyok5.wav", module: require("../../assets/LCARS Sounds/keyok5.wav") },
  { id: "processing1.wav", label: "processing1.wav", module: require("../../assets/LCARS Sounds/processing1.wav") },
  { id: "processing3.mp3", label: "processing3.mp3", module: require("../../assets/LCARS Sounds/processing3.mp3") },
  { id: "processing3.wav", label: "processing3.wav", module: require("../../assets/LCARS Sounds/processing3.wav") },
  { id: "scrclose1.wav", label: "scrclose1.wav", module: require("../../assets/LCARS Sounds/scrclose1.wav") },
  { id: "scrclose2.wav", label: "scrclose2.wav", module: require("../../assets/LCARS Sounds/scrclose2.wav") },
  { id: "scrdisplay1.wav", label: "scrdisplay1.wav", module: require("../../assets/LCARS Sounds/scrdisplay1.wav") },
  { id: "scrdisplay2.wav", label: "scrdisplay2.wav", module: require("../../assets/LCARS Sounds/scrdisplay2.wav") },
  { id: "scrscroll1.mp3", label: "scrscroll1.mp3", module: require("../../assets/LCARS Sounds/scrscroll1.mp3") },
  { id: "scrscroll1.wav", label: "scrscroll1.wav", module: require("../../assets/LCARS Sounds/scrscroll1.wav") },
  { id: "scrscroll2.mp3", label: "scrscroll2.mp3", module: require("../../assets/LCARS Sounds/scrscroll2.mp3") },
  { id: "scrscroll2.wav", label: "scrscroll2.wav", module: require("../../assets/LCARS Sounds/scrscroll2.wav") },
  { id: "scrsearch.mp3", label: "scrsearch.mp3", module: require("../../assets/LCARS Sounds/scrsearch.mp3") },
  { id: "scrsearch.wav", label: "scrsearch.wav", module: require("../../assets/LCARS Sounds/scrsearch.wav") },
  { id: "voiceinput2.wav", label: "voiceinput2.wav", module: require("../../assets/LCARS Sounds/voiceinput2.wav") },
  { id: "voiceinput3.wav", label: "voiceinput3.wav", module: require("../../assets/LCARS Sounds/voiceinput3.wav") },
  { id: "voiceinput4.wav", label: "voiceinput4.wav", module: require("../../assets/LCARS Sounds/voiceinput4.wav") },
  { id: "voy_hail.mp3", label: "voy_hail.mp3", module: require("../../assets/LCARS Sounds/voy_hail.mp3") },
];

const SOUND_OPTION_MAP = new Map(LCARS_SOUND_OPTIONS.map((option) => [option.id, option]));

export function normalizeSoundSelection(value: string[] | undefined | null, max = 5) {
  if (!Array.isArray(value)) {
    return [];
  }

  const unique: string[] = [];

  value.forEach((entry) => {
    const normalized = typeof entry === "string" ? entry.trim() : "";
    if (!normalized || unique.includes(normalized) || !SOUND_OPTION_MAP.has(normalized)) {
      return;
    }
    if (unique.length < max) {
      unique.push(normalized);
    }
  });

  return unique;
}

export function resolveLcarsSoundLabel(id: string) {
  return SOUND_OPTION_MAP.get(id)?.label || id;
}

export function resolveLcarsSoundUri(id: string) {
  const option = SOUND_OPTION_MAP.get(id);
  if (!option) {
    return null;
  }

  const source = option.module;

  if (typeof source === "string") {
    return source;
  }

  if (source && typeof source === "object") {
    const uri = "uri" in source && typeof source.uri === "string" ? source.uri : null;
    if (uri) {
      return uri;
    }

    const defaultUri =
      "default" in source &&
      source.default &&
      typeof source.default === "object" &&
      "uri" in source.default &&
      typeof source.default.uri === "string"
        ? source.default.uri
        : null;

    if (defaultUri) {
      return defaultUri;
    }
  }

  return null;
}
