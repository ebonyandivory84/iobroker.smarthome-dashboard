import { createElement, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { WidgetAppearance, WidgetConfig } from "../types/dashboard";
import { useDashboardConfig } from "../context/DashboardConfigContext";
import { resolveThemeSettings } from "../utils/themeConfig";
import { palette } from "../utils/theme";

type WidgetEditorModalProps = {
  widget: WidgetConfig | null;
  visible: boolean;
  onClose: () => void;
  onSave: (widgetId: string, partial: Partial<WidgetConfig>) => void;
};

export function WidgetEditorModal({ widget, visible, onClose, onSave }: WidgetEditorModalProps) {
  const { config } = useDashboardConfig();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const theme = resolveThemeSettings(config.theme);

  useEffect(() => {
    if (!widget || !visible) {
      return;
    }

    const appearanceDraft = buildAppearanceDraft(widget, theme);

    if (widget.type === "state") {
      setDraft({
        title: widget.title,
        stateId: widget.stateId,
        onLabel: widget.onLabel || "",
        offLabel: widget.offLabel || "",
        writeable: widget.writeable ? "true" : "false",
        format: widget.format || "boolean",
        ...appearanceDraft,
      });
      return;
    }

    if (widget.type === "camera") {
      setDraft({
        title: widget.title,
        snapshotUrl: widget.snapshotUrl || "",
        rtspUrl: widget.rtspUrl || "",
        refreshMs: String(widget.refreshMs || 2000),
        ...appearanceDraft,
      });
      return;
    }

    if (widget.type === "energy") {
      setDraft({
        title: widget.title,
        pvStateId: widget.pvStateId,
        houseStateId: widget.houseStateId,
        batteryStateId: widget.batteryStateId || "",
        gridStateId: widget.gridStateId || "",
        ...appearanceDraft,
      });
      return;
    }

    setDraft({
      title: widget.title,
      statePrefix: widget.statePrefix,
      dailyEnergyUnit: widget.dailyEnergyUnit || "auto",
      keyPvNow: widget.keys.pvNow,
      keyHomeNow: widget.keys.homeNow,
      keyGridIn: widget.keys.gridIn,
      keyGridOut: widget.keys.gridOut,
      keySoc: widget.keys.soc || "",
      keyBattIn: widget.keys.battIn || "",
      keyBattOut: widget.keys.battOut || "",
      keyDayConsumed: widget.keys.dayConsumed,
      keyDaySelf: widget.keys.daySelf,
      keyPvTotal: widget.keys.pvTotal || "",
      keyBattTemp: widget.keys.battTemp || "",
      ...appearanceDraft,
    });
  }, [visible, widget]);

  if (!widget) {
    return null;
  }

  const save = () => {
    const appearance = buildAppearance(draft);

    if (widget.type === "state") {
      onSave(widget.id, {
        title: draft.title || widget.title,
        stateId: draft.stateId || widget.stateId,
        onLabel: draft.onLabel || undefined,
        offLabel: draft.offLabel || undefined,
        writeable: draft.writeable !== "false",
        format: normalizeStateFormat(draft.format),
        appearance,
      });
    } else if (widget.type === "camera") {
      onSave(widget.id, {
        title: draft.title || widget.title,
        snapshotUrl: draft.snapshotUrl || undefined,
        rtspUrl: draft.rtspUrl || undefined,
        refreshMs: clampInt(draft.refreshMs, widget.refreshMs || 2000, 250),
        appearance,
      });
    } else if (widget.type === "energy") {
      onSave(widget.id, {
        title: draft.title || widget.title,
        pvStateId: draft.pvStateId || widget.pvStateId,
        houseStateId: draft.houseStateId || widget.houseStateId,
        batteryStateId: draft.batteryStateId || undefined,
        gridStateId: draft.gridStateId || undefined,
        appearance,
      });
    } else {
      onSave(widget.id, {
        title: draft.title || widget.title,
        statePrefix: draft.statePrefix || widget.statePrefix,
        dailyEnergyUnit:
          draft.dailyEnergyUnit === "Wh" || draft.dailyEnergyUnit === "kWh" ? draft.dailyEnergyUnit : "auto",
        keys: {
          pvNow: draft.keyPvNow || widget.keys.pvNow,
          homeNow: draft.keyHomeNow || widget.keys.homeNow,
          gridIn: draft.keyGridIn || widget.keys.gridIn,
          gridOut: draft.keyGridOut || widget.keys.gridOut,
          soc: draft.keySoc || undefined,
          battIn: draft.keyBattIn || undefined,
          battOut: draft.keyBattOut || undefined,
          dayConsumed: draft.keyDayConsumed || widget.keys.dayConsumed,
          daySelf: draft.keyDaySelf || widget.keys.daySelf,
          pvTotal: draft.keyPvTotal || undefined,
          battTemp: draft.keyBattTemp || undefined,
        },
        appearance,
      });
    }

    onClose();
  };

  return (
    <Modal animationType="fade" transparent visible={visible}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Widget bearbeiten</Text>
            <Pressable onPress={onClose}>
              <Text style={styles.close}>Schliessen</Text>
            </Pressable>
          </View>
          <ScrollView>
            <Field label="Titel">
              <TextInput
                onChangeText={(value) => setDraft((current) => ({ ...current, title: value }))}
                style={styles.input}
                value={draft.title || ""}
              />
            </Field>
            <Field label="Darstellung">
              <ColorInputRow
                firstKey="widgetColor"
                firstLabel="Widget"
                secondKey="widgetColor2"
                secondLabel="Verlauf 2"
                values={draft}
                onChange={setDraft}
              />
              <ColorInputRow
                firstKey="textColor"
                firstLabel="Text"
                secondKey="mutedTextColor"
                secondLabel="Sekundaer"
                values={draft}
                onChange={setDraft}
              />
              {widget.type === "energy" || widget.type === "solar" ? (
                <ColorInputRow
                  firstKey="cardColor"
                  firstLabel="Cards"
                  secondKey="cardColor2"
                  secondLabel="Verlauf 2"
                  values={draft}
                  onChange={setDraft}
                />
              ) : null}
              {widget.type === "solar" ? (
                <>
                  <ColorInputRow
                    firstKey="statColor"
                    firstLabel="Stats"
                    secondKey="statColor2"
                    secondLabel="Verlauf 2"
                    values={draft}
                    onChange={setDraft}
                  />
                  <ColorInputRow
                    firstKey="pvCardColor"
                    firstLabel="PV"
                    secondKey="homeCardColor"
                    secondLabel="Haus"
                    values={draft}
                    onChange={setDraft}
                  />
                  <ColorInputRow
                    firstKey="batteryCardColor"
                    firstLabel="Akku"
                    secondKey="gridCardColor"
                    secondLabel="Netz"
                    values={draft}
                    onChange={setDraft}
                  />
                  <ColorInputRow
                    firstKey="carCardColor"
                    firstLabel="Auto"
                    secondKey="cardColor"
                    secondLabel="Alle Cards"
                    values={draft}
                    onChange={setDraft}
                  />
                </>
              ) : null}
            </Field>
            {widget.type === "state" ? (
              <>
                <Field label="State ID">
                  <TextInput
                    autoCapitalize="none"
                    onChangeText={(value) => setDraft((current) => ({ ...current, stateId: value }))}
                    style={styles.input}
                    value={draft.stateId || ""}
                  />
                </Field>
                <View style={styles.splitRow}>
                  <Field label="Label aktiv">
                    <TextInput
                      onChangeText={(value) => setDraft((current) => ({ ...current, onLabel: value }))}
                      style={styles.input}
                      value={draft.onLabel || ""}
                    />
                  </Field>
                  <Field label="Label inaktiv">
                    <TextInput
                      onChangeText={(value) => setDraft((current) => ({ ...current, offLabel: value }))}
                      style={styles.input}
                      value={draft.offLabel || ""}
                    />
                  </Field>
                </View>
                <Field label="Schreibzugriff">
                  <ChoiceRow
                    options={["true", "false"]}
                    value={draft.writeable || "true"}
                    onSelect={(value) => setDraft((current) => ({ ...current, writeable: value }))}
                  />
                </Field>
                <Field label="Format">
                  <ChoiceRow
                    options={["boolean", "number", "text"]}
                    value={draft.format || "boolean"}
                    onSelect={(value) => setDraft((current) => ({ ...current, format: value }))}
                  />
                </Field>
              </>
            ) : null}
            {widget.type === "camera" ? (
              <>
                <Field label="Snapshot URL">
                  <TextInput
                    autoCapitalize="none"
                    onChangeText={(value) => setDraft((current) => ({ ...current, snapshotUrl: value }))}
                    style={styles.input}
                    value={draft.snapshotUrl || ""}
                  />
                </Field>
                <Field label="RTSP URL">
                  <TextInput
                    autoCapitalize="none"
                    onChangeText={(value) => setDraft((current) => ({ ...current, rtspUrl: value }))}
                    style={styles.input}
                    value={draft.rtspUrl || ""}
                  />
                </Field>
                <Field label="Refresh (ms)">
                  <TextInput
                    keyboardType="numeric"
                    onChangeText={(value) => setDraft((current) => ({ ...current, refreshMs: value }))}
                    style={styles.input}
                    value={draft.refreshMs || ""}
                  />
                </Field>
              </>
            ) : null}
            {widget.type === "energy" ? (
              <>
                <Field label="PV State ID">
                  <TextInput
                    autoCapitalize="none"
                    onChangeText={(value) => setDraft((current) => ({ ...current, pvStateId: value }))}
                    style={styles.input}
                    value={draft.pvStateId || ""}
                  />
                </Field>
                <Field label="Haus State ID">
                  <TextInput
                    autoCapitalize="none"
                    onChangeText={(value) => setDraft((current) => ({ ...current, houseStateId: value }))}
                    style={styles.input}
                    value={draft.houseStateId || ""}
                  />
                </Field>
                <Field label="Akku State ID">
                  <TextInput
                    autoCapitalize="none"
                    onChangeText={(value) => setDraft((current) => ({ ...current, batteryStateId: value }))}
                    style={styles.input}
                    value={draft.batteryStateId || ""}
                  />
                </Field>
                <Field label="Netz State ID">
                  <TextInput
                    autoCapitalize="none"
                    onChangeText={(value) => setDraft((current) => ({ ...current, gridStateId: value }))}
                    style={styles.input}
                    value={draft.gridStateId || ""}
                  />
                </Field>
              </>
            ) : null}
            {widget.type === "solar" ? (
              <>
                <Field label="State Prefix">
                  <TextInput
                    autoCapitalize="none"
                    onChangeText={(value) => setDraft((current) => ({ ...current, statePrefix: value }))}
                    style={styles.input}
                    value={draft.statePrefix || ""}
                  />
                </Field>
                <Field label="Tageswerte Einheit">
                  <View style={styles.modeRow}>
                    {["auto", "Wh", "kWh"].map((unit) => (
                      <Pressable
                        key={unit}
                        onPress={() => setDraft((current) => ({ ...current, dailyEnergyUnit: unit }))}
                        style={[
                          styles.modeButton,
                          draft.dailyEnergyUnit === unit ? styles.modeButtonActive : null,
                        ]}
                      >
                        <Text style={styles.modeLabel}>{unit}</Text>
                      </Pressable>
                    ))}
                  </View>
                </Field>
                <Text style={styles.sectionTitle}>Key-Mapping</Text>
                <View style={styles.splitRow}>
                  <Field label="PV aktuell">
                    <TextInput
                      autoCapitalize="none"
                      onChangeText={(value) => setDraft((current) => ({ ...current, keyPvNow: value }))}
                      style={styles.input}
                      value={draft.keyPvNow || ""}
                    />
                  </Field>
                  <Field label="Haus aktuell">
                    <TextInput
                      autoCapitalize="none"
                      onChangeText={(value) => setDraft((current) => ({ ...current, keyHomeNow: value }))}
                      style={styles.input}
                      value={draft.keyHomeNow || ""}
                    />
                  </Field>
                </View>
                <View style={styles.splitRow}>
                  <Field label="Netzbezug">
                    <TextInput
                      autoCapitalize="none"
                      onChangeText={(value) => setDraft((current) => ({ ...current, keyGridIn: value }))}
                      style={styles.input}
                      value={draft.keyGridIn || ""}
                    />
                  </Field>
                  <Field label="Einspeisung">
                    <TextInput
                      autoCapitalize="none"
                      onChangeText={(value) => setDraft((current) => ({ ...current, keyGridOut: value }))}
                      style={styles.input}
                      value={draft.keyGridOut || ""}
                    />
                  </Field>
                </View>
                <View style={styles.splitRow}>
                  <Field label="Akku SOC">
                    <TextInput
                      autoCapitalize="none"
                      onChangeText={(value) => setDraft((current) => ({ ...current, keySoc: value }))}
                      style={styles.input}
                      value={draft.keySoc || ""}
                    />
                  </Field>
                  <Field label="Akku Temp">
                    <TextInput
                      autoCapitalize="none"
                      onChangeText={(value) => setDraft((current) => ({ ...current, keyBattTemp: value }))}
                      style={styles.input}
                      value={draft.keyBattTemp || ""}
                    />
                  </Field>
                </View>
                <View style={styles.splitRow}>
                  <Field label="Akku laden">
                    <TextInput
                      autoCapitalize="none"
                      onChangeText={(value) => setDraft((current) => ({ ...current, keyBattIn: value }))}
                      style={styles.input}
                      value={draft.keyBattIn || ""}
                    />
                  </Field>
                  <Field label="Akku entladen">
                    <TextInput
                      autoCapitalize="none"
                      onChangeText={(value) => setDraft((current) => ({ ...current, keyBattOut: value }))}
                      style={styles.input}
                      value={draft.keyBattOut || ""}
                    />
                  </Field>
                </View>
                <View style={styles.splitRow}>
                  <Field label="Tag Verbrauch">
                    <TextInput
                      autoCapitalize="none"
                      onChangeText={(value) => setDraft((current) => ({ ...current, keyDayConsumed: value }))}
                      style={styles.input}
                      value={draft.keyDayConsumed || ""}
                    />
                  </Field>
                  <Field label="Tag Eigen">
                    <TextInput
                      autoCapitalize="none"
                      onChangeText={(value) => setDraft((current) => ({ ...current, keyDaySelf: value }))}
                      style={styles.input}
                      value={draft.keyDaySelf || ""}
                    />
                  </Field>
                </View>
                <Field label="PV Gesamt">
                  <TextInput
                    autoCapitalize="none"
                    onChangeText={(value) => setDraft((current) => ({ ...current, keyPvTotal: value }))}
                    style={styles.input}
                    value={draft.keyPvTotal || ""}
                  />
                </Field>
              </>
            ) : null}
          </ScrollView>
          <View style={styles.footer}>
            <Pressable onPress={save} style={styles.saveButton}>
              <Text style={styles.saveLabel}>Speichern</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function ChoiceRow({
  options,
  value,
  onSelect,
}: {
  options: string[];
  value: string;
  onSelect: (value: string) => void;
}) {
  return (
    <View style={styles.modeRow}>
      {options.map((option) => (
        <Pressable
          key={option}
          onPress={() => onSelect(option)}
          style={[styles.modeButton, value === option ? styles.modeButtonActive : null]}
        >
          <Text style={styles.modeLabel}>{option}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function clampInt(raw: string | undefined, fallback: number, min: number) {
  const parsed = Number.parseInt(raw || "", 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return Math.max(min, parsed);
}

function buildAppearanceDraft(
  widget: WidgetConfig,
  theme: ReturnType<typeof resolveThemeSettings>
) {
  const appearance = widget.appearance;
  const widgetDefaults = getWidgetAppearanceDefaults(widget, theme);

  return {
    widgetColor: appearance?.widgetColor || widgetDefaults.widgetColor || "",
    widgetColor2: appearance?.widgetColor2 || widgetDefaults.widgetColor2 || "",
    textColor: appearance?.textColor || "",
    mutedTextColor: appearance?.mutedTextColor || "",
    cardColor: appearance?.cardColor || widgetDefaults.cardColor || "",
    cardColor2: appearance?.cardColor2 || widgetDefaults.cardColor2 || "",
    statColor: appearance?.statColor || widgetDefaults.statColor || "",
    statColor2: appearance?.statColor2 || widgetDefaults.statColor2 || "",
    pvCardColor: appearance?.pvCardColor || "",
    homeCardColor: appearance?.homeCardColor || "",
    batteryCardColor: appearance?.batteryCardColor || "",
    gridCardColor: appearance?.gridCardColor || "",
    carCardColor: appearance?.carCardColor || "",
  };
}

function buildAppearance(draft: Record<string, string>): WidgetAppearance | undefined {
  const appearance: WidgetAppearance = {
    widgetColor: normalizeColor(draft.widgetColor),
    widgetColor2: normalizeColor(draft.widgetColor2),
    textColor: normalizeColor(draft.textColor),
    mutedTextColor: normalizeColor(draft.mutedTextColor),
    cardColor: normalizeColor(draft.cardColor),
    cardColor2: normalizeColor(draft.cardColor2),
    statColor: normalizeColor(draft.statColor),
    statColor2: normalizeColor(draft.statColor2),
    pvCardColor: normalizeColor(draft.pvCardColor),
    homeCardColor: normalizeColor(draft.homeCardColor),
    batteryCardColor: normalizeColor(draft.batteryCardColor),
    gridCardColor: normalizeColor(draft.gridCardColor),
    carCardColor: normalizeColor(draft.carCardColor),
  };

  return Object.values(appearance).some(Boolean) ? appearance : undefined;
}

function normalizeColor(value: string | undefined) {
  const trimmed = (value || "").trim();
  return trimmed || undefined;
}

function getWidgetAppearanceDefaults(
  widget: WidgetConfig,
  theme: ReturnType<typeof resolveThemeSettings>
): WidgetAppearance {
  if (widget.type === "state") {
    return {
      widgetColor: theme.widgetTones.stateStart,
      widgetColor2: theme.widgetTones.stateEnd,
    };
  }

  if (widget.type === "camera") {
    return {
      widgetColor: theme.widgetTones.cameraStart,
      widgetColor2: theme.widgetTones.cameraEnd,
    };
  }

  if (widget.type === "energy") {
    return {
      widgetColor: theme.widgetTones.energyStart,
      widgetColor2: theme.widgetTones.energyEnd,
      cardColor: "rgba(255,255,255,0.03)",
    };
  }

  return {
    widgetColor: theme.widgetTones.solarStart,
    widgetColor2: theme.widgetTones.solarEnd,
    cardColor: theme.solar.nodeCardBackground,
    statColor: theme.solar.statCardBackground,
  };
}

function ColorInputRow({
  firstKey,
  firstLabel,
  secondKey,
  secondLabel,
  values,
  onChange,
}: {
  firstKey: string;
  firstLabel: string;
  secondKey: string;
  secondLabel: string;
  values: Record<string, string>;
  onChange: Dispatch<SetStateAction<Record<string, string>>>;
}) {
  return (
    <View style={styles.splitRow}>
      <ColorField
        label={firstLabel}
        value={values[firstKey] || ""}
        onChange={(value) => onChange((current) => ({ ...current, [firstKey]: value }))}
      />
      <ColorField
        label={secondLabel}
        value={values[secondKey] || ""}
        onChange={(value) => onChange((current) => ({ ...current, [secondKey]: value }))}
      />
    </View>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const previewColor = toColorPreview(value) || "#8892a6";

  return (
    <Field label={label}>
      <View style={styles.colorFieldWrap}>
        {Platform.OS === "web"
          ? createElement("input", {
              type: "color",
              value: previewColor,
              onChange: (event: { target: { value: string } }) => onChange(event.target.value),
              style: webColorInputStyle,
            })
          : null}
        <View style={[styles.colorSwatch, { backgroundColor: value || previewColor }]} />
        <TextInput
          autoCapitalize="none"
          onChangeText={onChange}
          placeholder="#4ade80"
          placeholderTextColor={palette.textMuted}
          style={[styles.input, styles.colorTextInput]}
          value={value}
        />
        <Pressable onPress={() => onChange("transparent")} style={styles.colorActionButton}>
          <Text style={styles.colorActionLabel}>Transparent</Text>
        </Pressable>
        <Pressable onPress={() => onChange("")} style={styles.colorActionButton}>
          <Text style={styles.colorActionLabel}>Reset</Text>
        </Pressable>
      </View>
    </Field>
  );
}

function isHexColor(value: string) {
  return /^#([0-9a-fA-F]{6})$/.test(value);
}

function toColorPreview(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (isHexColor(trimmed)) {
    return trimmed;
  }

  const rgbMatch = trimmed.match(
    /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(\d*\.?\d+))?\s*\)$/i
  );
  if (!rgbMatch) {
    return null;
  }

  const r = clampChannel(Number(rgbMatch[1]));
  const g = clampChannel(Number(rgbMatch[2]));
  const b = clampChannel(Number(rgbMatch[3]));

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function clampChannel(value: number) {
  return Math.max(0, Math.min(255, Number.isFinite(value) ? value : 0));
}

function toHex(value: number) {
  return value.toString(16).padStart(2, "0");
}

function normalizeStateFormat(raw: string | undefined) {
  if (raw === "number" || raw === "text") {
    return raw;
  }
  return "boolean";
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    padding: 22,
  },
  card: {
    maxHeight: "85%",
    borderRadius: 22,
    padding: 18,
    backgroundColor: palette.panelStrong,
    borderWidth: 1,
    borderColor: palette.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  title: {
    color: palette.text,
    fontSize: 22,
    fontWeight: "800",
  },
  close: {
    color: palette.textMuted,
    fontWeight: "600",
  },
  field: {
    gap: 6,
    marginBottom: 12,
  },
  sectionTitle: {
    marginTop: 4,
    marginBottom: 8,
    color: palette.text,
    fontSize: 14,
    fontWeight: "800",
  },
  splitRow: {
    flexDirection: "row",
    gap: 10,
  },
  layoutRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  layoutStepperGrid: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
    marginTop: 8,
  },
  fieldLabel: {
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  input: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: palette.text,
    backgroundColor: "rgba(6, 12, 20, 0.9)",
    borderWidth: 1,
    borderColor: palette.border,
  },
  colorFieldWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  colorSwatch: {
    width: 18,
    height: 18,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  colorTextInput: {
    flex: 1,
  },
  colorActionButton: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: palette.border,
  },
  colorActionLabel: {
    color: palette.text,
    fontSize: 12,
    fontWeight: "700",
  },
  modeRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  modeButton: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: palette.border,
  },
  modeButtonActive: {
    backgroundColor: "rgba(77, 226, 177, 0.12)",
    borderColor: "rgba(77, 226, 177, 0.3)",
  },
  modeLabel: {
    color: palette.text,
    fontWeight: "700",
  },
  footer: {
    marginTop: 8,
    alignItems: "flex-end",
  },
  saveButton: {
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: palette.accent,
  },
  saveLabel: {
    color: "#041019",
    fontWeight: "800",
  },
});

const webColorInputStyle = {
  width: 42,
  height: 42,
  padding: 0,
  border: "none",
  borderRadius: 10,
  background: "transparent",
  cursor: "pointer",
};
