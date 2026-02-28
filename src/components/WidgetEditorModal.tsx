import { createElement, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { WidgetAppearance, WidgetConfig } from "../types/dashboard";
import { palette } from "../utils/theme";

type WidgetEditorModalProps = {
  widget: WidgetConfig | null;
  visible: boolean;
  onClose: () => void;
  onSave: (widgetId: string, partial: Partial<WidgetConfig>) => void;
};

export function WidgetEditorModal({ widget, visible, onClose, onSave }: WidgetEditorModalProps) {
  const [draft, setDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!widget || !visible) {
      return;
    }

    const appearanceDraft = buildAppearanceDraft(widget.appearance);

    if (widget.type === "state") {
      setDraft({
        title: widget.title,
        stateId: widget.stateId,
        x: String(widget.position.x),
        y: String(widget.position.y),
        w: String(widget.position.w),
        h: String(widget.position.h),
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
        x: String(widget.position.x),
        y: String(widget.position.y),
        w: String(widget.position.w),
        h: String(widget.position.h),
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
        x: String(widget.position.x),
        y: String(widget.position.y),
        w: String(widget.position.w),
        h: String(widget.position.h),
        ...appearanceDraft,
      });
      return;
    }

    setDraft({
      title: widget.title,
      statePrefix: widget.statePrefix,
      dailyEnergyUnit: widget.dailyEnergyUnit || "auto",
      x: String(widget.position.x),
      y: String(widget.position.y),
      w: String(widget.position.w),
      h: String(widget.position.h),
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
    const position = {
      x: clampInt(draft.x, widget.position.x, 0),
      y: clampInt(draft.y, widget.position.y, 0),
      w: clampInt(draft.w, widget.position.w, 1),
      h: clampInt(draft.h, widget.position.h, 1),
    };

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
        position,
      });
    } else if (widget.type === "camera") {
      onSave(widget.id, {
        title: draft.title || widget.title,
        snapshotUrl: draft.snapshotUrl || undefined,
        rtspUrl: draft.rtspUrl || undefined,
        refreshMs: clampInt(draft.refreshMs, widget.refreshMs || 2000, 250),
        appearance,
        position,
      });
    } else if (widget.type === "energy") {
      onSave(widget.id, {
        title: draft.title || widget.title,
        pvStateId: draft.pvStateId || widget.pvStateId,
        houseStateId: draft.houseStateId || widget.houseStateId,
        batteryStateId: draft.batteryStateId || undefined,
        gridStateId: draft.gridStateId || undefined,
        appearance,
        position,
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
        position,
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
            <Field label="Layout">
              <View style={styles.layoutRow}>
                <MiniInput
                  label="X"
                  onChangeText={(value) => setDraft((current) => ({ ...current, x: value }))}
                  value={draft.x || ""}
                />
                <MiniInput
                  label="Y"
                  onChangeText={(value) => setDraft((current) => ({ ...current, y: value }))}
                  value={draft.y || ""}
                />
                <MiniInput
                  label="Breite"
                  onChangeText={(value) => setDraft((current) => ({ ...current, w: value }))}
                  value={draft.w || ""}
                />
                <MiniInput
                  label="Hoehe"
                  onChangeText={(value) => setDraft((current) => ({ ...current, h: value }))}
                  value={draft.h || ""}
                />
              </View>
              <View style={styles.layoutStepperGrid}>
                <LayoutStepper
                  label="X"
                  value={draft.x || "0"}
                  min={0}
                  onChange={(value) => setDraft((current) => ({ ...current, x: value }))}
                />
                <LayoutStepper
                  label="Y"
                  value={draft.y || "0"}
                  min={0}
                  onChange={(value) => setDraft((current) => ({ ...current, y: value }))}
                />
                <LayoutStepper
                  label="W"
                  value={draft.w || "1"}
                  min={1}
                  onChange={(value) => setDraft((current) => ({ ...current, w: value }))}
                />
                <LayoutStepper
                  label="H"
                  value={draft.h || "1"}
                  min={1}
                  onChange={(value) => setDraft((current) => ({ ...current, h: value }))}
                />
              </View>
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
                <ColorInputRow
                  firstKey="statColor"
                  firstLabel="Stats"
                  secondKey="statColor2"
                  secondLabel="Verlauf 2"
                  values={draft}
                  onChange={setDraft}
                />
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

function MiniInput({
  label,
  value,
  onChangeText,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
}) {
  return (
    <View style={styles.miniWrap}>
      <Text style={styles.miniLabel}>{label}</Text>
      <TextInput
        keyboardType="numeric"
        onChangeText={onChangeText}
        style={styles.miniInput}
        value={value}
      />
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

function LayoutStepper({
  label,
  value,
  min,
  onChange,
}: {
  label: string;
  value: string;
  min: number;
  onChange: (value: string) => void;
}) {
  const numeric = Number.parseInt(value || "", 10);
  const safe = Number.isNaN(numeric) ? min : numeric;

  return (
    <View style={styles.stepperCard}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={styles.stepperRow}>
        <Pressable onPress={() => onChange(String(Math.max(min, safe - 1)))} style={styles.stepperButton}>
          <Text style={styles.stepperButtonText}>-</Text>
        </Pressable>
        <View style={styles.stepperValueWrap}>
          <Text style={styles.stepperValue}>{safe}</Text>
        </View>
        <Pressable onPress={() => onChange(String(safe + 1))} style={styles.stepperButton}>
          <Text style={styles.stepperButtonText}>+</Text>
        </Pressable>
      </View>
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

function buildAppearanceDraft(appearance?: WidgetAppearance) {
  return {
    widgetColor: appearance?.widgetColor || "",
    widgetColor2: appearance?.widgetColor2 || "",
    cardColor: appearance?.cardColor || "",
    cardColor2: appearance?.cardColor2 || "",
    statColor: appearance?.statColor || "",
    statColor2: appearance?.statColor2 || "",
  };
}

function buildAppearance(draft: Record<string, string>): WidgetAppearance | undefined {
  const appearance: WidgetAppearance = {
    widgetColor: normalizeColor(draft.widgetColor),
    widgetColor2: normalizeColor(draft.widgetColor2),
    cardColor: normalizeColor(draft.cardColor),
    cardColor2: normalizeColor(draft.cardColor2),
    statColor: normalizeColor(draft.statColor),
    statColor2: normalizeColor(draft.statColor2),
  };

  return Object.values(appearance).some(Boolean) ? appearance : undefined;
}

function normalizeColor(value: string | undefined) {
  const trimmed = (value || "").trim();
  return trimmed || undefined;
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
  const safeValue = isHexColor(value) ? value : "#8892a6";

  return (
    <Field label={label}>
      <View style={styles.colorFieldWrap}>
        {Platform.OS === "web"
          ? createElement("input", {
              type: "color",
              value: safeValue,
              onChange: (event: { target: { value: string } }) => onChange(event.target.value),
              style: webColorInputStyle,
            })
          : null}
        <TextInput
          autoCapitalize="none"
          onChangeText={onChange}
          placeholder="#4ade80"
          placeholderTextColor={palette.textMuted}
          style={[styles.input, styles.colorTextInput]}
          value={value}
        />
      </View>
    </Field>
  );
}

function isHexColor(value: string) {
  return /^#([0-9a-fA-F]{6})$/.test(value);
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
  colorTextInput: {
    flex: 1,
  },
  miniWrap: {
    width: 72,
    gap: 4,
  },
  miniLabel: {
    color: palette.textMuted,
    fontSize: 11,
    fontWeight: "700",
  },
  miniInput: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    color: palette.text,
    backgroundColor: "rgba(6, 12, 20, 0.9)",
    borderWidth: 1,
    borderColor: palette.border,
  },
  stepperCard: {
    width: 92,
    gap: 6,
  },
  stepperLabel: {
    color: palette.textMuted,
    fontSize: 11,
    fontWeight: "700",
  },
  stepperRow: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
  },
  stepperButton: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: palette.border,
  },
  stepperButtonText: {
    color: palette.text,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 18,
  },
  stepperValueWrap: {
    minWidth: 26,
    alignItems: "center",
  },
  stepperValue: {
    color: palette.text,
    fontSize: 13,
    fontWeight: "800",
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
