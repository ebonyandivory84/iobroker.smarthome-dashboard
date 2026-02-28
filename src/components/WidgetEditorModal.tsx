import { MaterialCommunityIcons } from "@expo/vector-icons";
import { createElement, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ImagePickerModal } from "./ImagePickerModal";
import { ObjectPickerModal } from "./ObjectPickerModal";
import { IoBrokerClient } from "../services/iobroker";
import { WidgetAppearance, WidgetConfig } from "../types/dashboard";
import { useDashboardConfig } from "../context/DashboardConfigContext";
import { resolveThemeSettings } from "../utils/themeConfig";
import { stateIconOptions } from "../utils/stateIcons";
import { palette } from "../utils/theme";

type WidgetEditorModalProps = {
  client: IoBrokerClient;
  widget: WidgetConfig | null;
  visible: boolean;
  onClose: () => void;
  onSave: (widgetId: string, partial: Partial<WidgetConfig>) => void;
};

export function WidgetEditorModal({ client, widget, visible, onClose, onSave }: WidgetEditorModalProps) {
  const { config } = useDashboardConfig();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [pickerField, setPickerField] = useState<string | null>(null);
  const [imagePickerOpen, setImagePickerOpen] = useState(false);
  const theme = resolveThemeSettings(config.theme);
  const iconPreview = useMemo(() => {
    const active = (draft.iconActive || widget?.iconPair?.active || "toggle-switch-outline") as keyof typeof MaterialCommunityIcons.glyphMap;
    const inactive = (draft.iconInactive || widget?.iconPair?.inactive || "toggle-switch-off-outline") as keyof typeof MaterialCommunityIcons.glyphMap;
    return { active, inactive };
  }, [draft.iconActive, draft.iconInactive, widget?.iconPair?.active, widget?.iconPair?.inactive]);

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
        activeValue: widget.activeValue || "",
        inactiveValue: widget.inactiveValue || "",
        valueLabelsJson:
          widget.valueLabels && Object.keys(widget.valueLabels).length
            ? JSON.stringify(widget.valueLabels, null, 2)
            : "",
        writeable: widget.writeable ? "true" : "false",
        format: widget.format || "boolean",
        iconActive: widget.iconPair?.active || "toggle-switch",
        iconInactive: widget.iconPair?.inactive || "toggle-switch-off-outline",
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

    if (widget.type === "grafana") {
      setDraft({
        title: widget.title,
        url: widget.url || "",
        refreshMs: String(widget.refreshMs || 10000),
        allowInteractions: widget.allowInteractions === false ? "false" : "true",
        ...appearanceDraft,
      });
      return;
    }

    if (widget.type === "weather") {
      setDraft({
        title: widget.title,
        locationName: widget.locationName || "",
        latitude: String(widget.latitude),
        longitude: String(widget.longitude),
        timezone: widget.timezone || "auto",
        refreshMs: String(widget.refreshMs || 300000),
        ...appearanceDraft,
      });
      return;
    }

    setDraft({
      title: widget.title,
      backgroundMode: widget.backgroundMode || "color",
      backgroundImage: widget.backgroundImage || "",
      backgroundImageBlur: String(widget.backgroundImageBlur ?? 8),
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
        activeValue: draft.activeValue || undefined,
        inactiveValue: draft.inactiveValue || undefined,
        valueLabels: parseValueLabels(draft.valueLabelsJson),
        writeable: draft.writeable !== "false",
        format: normalizeStateFormat(draft.format),
        iconPair: {
          active: (draft.iconActive || widget.iconPair?.active || "toggle-switch") as never,
          inactive: (draft.iconInactive || widget.iconPair?.inactive || "toggle-switch-off-outline") as never,
        },
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
    } else if (widget.type === "grafana") {
      onSave(widget.id, {
        title: draft.title || widget.title,
        url: draft.url || widget.url,
        refreshMs: clampInt(draft.refreshMs, widget.refreshMs || 10000, 1000),
        allowInteractions: draft.allowInteractions !== "false",
        appearance,
      });
    } else if (widget.type === "weather") {
      onSave(widget.id, {
        title: draft.title || widget.title,
        locationName: draft.locationName || undefined,
        latitude: clampFloat(draft.latitude, widget.latitude),
        longitude: clampFloat(draft.longitude, widget.longitude),
        timezone: draft.timezone || "auto",
        refreshMs: clampInt(draft.refreshMs, widget.refreshMs || 300000, 60000),
        appearance,
      });
    } else {
      onSave(widget.id, {
        title: draft.title || widget.title,
        backgroundMode: draft.backgroundMode === "image" ? "image" : "color",
        backgroundImage: draft.backgroundImage || undefined,
        backgroundImageBlur: clampInt(draft.backgroundImageBlur, widget.backgroundImageBlur ?? 8, 0),
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
                  <Field label="Solar Hintergrund">
                    <ChoiceRow
                      options={["color", "image"]}
                      value={draft.backgroundMode || "color"}
                      onSelect={(value) => setDraft((current) => ({ ...current, backgroundMode: value }))}
                    />
                    {draft.backgroundMode === "image" ? (
                      <>
                        <View style={styles.stateFieldRow}>
                          <TextInput
                            editable={false}
                            style={[styles.input, styles.stateFieldInput]}
                            value={draft.backgroundImage || ""}
                          />
                          <Pressable onPress={() => setImagePickerOpen(true)} style={styles.stateBrowseButton}>
                            <Text style={styles.stateBrowseLabel}>Bild waehlen</Text>
                          </Pressable>
                        </View>
                        <Field label="Bild Unschärfe">
                          <BlurControl
                            value={draft.backgroundImageBlur || "8"}
                            onChange={(value) => setDraft((current) => ({ ...current, backgroundImageBlur: value }))}
                          />
                        </Field>
                      </>
                    ) : null}
                  </Field>
                </>
              ) : null}
            </Field>
            {widget.type === "state" ? (
              <>
                <Field label="State ID">
                  <StateFieldInput
                    onBrowse={() => setPickerField("stateId")}
                    onChangeText={(value) => setDraft((current) => ({ ...current, stateId: value }))}
                    value={draft.stateId || ""}
                  />
                </Field>
                <View style={styles.splitRow}>
                  <Field label="Anzeigetext aktiv">
                    <TextInput
                      onChangeText={(value) => setDraft((current) => ({ ...current, onLabel: value }))}
                      style={styles.input}
                      value={draft.onLabel || ""}
                    />
                  </Field>
                  <Field label="Anzeigetext inaktiv">
                    <TextInput
                      onChangeText={(value) => setDraft((current) => ({ ...current, offLabel: value }))}
                      style={styles.input}
                      value={draft.offLabel || ""}
                    />
                  </Field>
                </View>
                <View style={styles.splitRow}>
                  <Field label="Rohwert aktiv">
                    <TextInput
                      autoCapitalize="none"
                      onChangeText={(value) => setDraft((current) => ({ ...current, activeValue: value }))}
                      placeholder="z. B. open / 1 / true"
                      placeholderTextColor={palette.textMuted}
                      style={styles.input}
                      value={draft.activeValue || ""}
                    />
                  </Field>
                  <Field label="Rohwert inaktiv">
                    <TextInput
                      autoCapitalize="none"
                      onChangeText={(value) => setDraft((current) => ({ ...current, inactiveValue: value }))}
                      placeholder="z. B. closed / 0 / false"
                      placeholderTextColor={palette.textMuted}
                      style={styles.input}
                      value={draft.inactiveValue || ""}
                    />
                  </Field>
                </View>
                <Text style={styles.mappingHint}>
                  Beispiel Reedkontakt: `Rohwert aktiv = open`, `Anzeigetext aktiv = Offen`, `Rohwert inaktiv = closed`,
                  `Anzeigetext inaktiv = Geschlossen`.
                </Text>
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
                <Field label="Wert-Labels (JSON)">
                  <TextInput
                    autoCapitalize="none"
                    autoCorrect={false}
                    multiline
                    onChangeText={(value) => setDraft((current) => ({ ...current, valueLabelsJson: value }))}
                    placeholder={
                      draft.format === "number"
                        ? '{\n  "0": "Zu",\n  "1": "Offen"\n}'
                        : '{\n  "open": "Offen",\n  "closed": "Geschlossen"\n}'
                    }
                    placeholderTextColor={palette.textMuted}
                    style={[styles.input, styles.mappingEditor]}
                    textAlignVertical="top"
                    value={draft.valueLabelsJson || ""}
                  />
                  <Text style={styles.mappingHint}>
                    Optional. Hier kannst du Rohwerte wie `open`, `closed`, `0` oder `1` auf lesbare Labels abbilden.
                    Besonders sinnvoll bei `text` und `number`.
                  </Text>
                </Field>
                <Field label="Symbole">
                  <View style={styles.iconPreviewRow}>
                    <View style={styles.iconPreviewCard}>
                      <MaterialCommunityIcons color={palette.accent} name={iconPreview.active} size={22} />
                      <Text style={styles.iconPreviewLabel}>Aktiv</Text>
                    </View>
                    <View style={styles.iconPreviewCard}>
                      <MaterialCommunityIcons color={palette.textMuted} name={iconPreview.inactive} size={22} />
                      <Text style={styles.iconPreviewLabel}>Inaktiv</Text>
                    </View>
                  </View>
                  <IconPickerRow
                    label="Aktiv"
                    selected={draft.iconActive || "toggle-switch"}
                    onSelect={(value) => setDraft((current) => ({ ...current, iconActive: value }))}
                  />
                  <IconPickerRow
                    label="Inaktiv"
                    selected={draft.iconInactive || "toggle-switch-off-outline"}
                    onSelect={(value) => setDraft((current) => ({ ...current, iconInactive: value }))}
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
                  <StateFieldInput
                    onBrowse={() => setPickerField("pvStateId")}
                    onChangeText={(value) => setDraft((current) => ({ ...current, pvStateId: value }))}
                    value={draft.pvStateId || ""}
                  />
                </Field>
                <Field label="Haus State ID">
                  <StateFieldInput
                    onBrowse={() => setPickerField("houseStateId")}
                    onChangeText={(value) => setDraft((current) => ({ ...current, houseStateId: value }))}
                    value={draft.houseStateId || ""}
                  />
                </Field>
                <Field label="Akku State ID">
                  <StateFieldInput
                    onBrowse={() => setPickerField("batteryStateId")}
                    onChangeText={(value) => setDraft((current) => ({ ...current, batteryStateId: value }))}
                    value={draft.batteryStateId || ""}
                  />
                </Field>
                <Field label="Netz State ID">
                  <StateFieldInput
                    onBrowse={() => setPickerField("gridStateId")}
                    onChangeText={(value) => setDraft((current) => ({ ...current, gridStateId: value }))}
                    value={draft.gridStateId || ""}
                  />
                </Field>
              </>
            ) : null}
            {widget.type === "grafana" ? (
              <>
                <Field label="Grafana URL">
                  <TextInput
                    autoCapitalize="none"
                    onChangeText={(value) => setDraft((current) => ({ ...current, url: value }))}
                    style={styles.input}
                    value={draft.url || ""}
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
                <Field label="Interaktionen">
                  <ChoiceRow
                    options={["true", "false"]}
                    value={draft.allowInteractions || "true"}
                    onSelect={(value) => setDraft((current) => ({ ...current, allowInteractions: value }))}
                  />
                </Field>
              </>
            ) : null}
            {widget.type === "weather" ? (
              <>
                <Field label="Ort">
                  <TextInput
                    onChangeText={(value) => setDraft((current) => ({ ...current, locationName: value }))}
                    style={styles.input}
                    value={draft.locationName || ""}
                  />
                </Field>
                <View style={styles.splitRow}>
                  <Field label="Latitude">
                    <TextInput
                      autoCapitalize="none"
                      keyboardType="numeric"
                      onChangeText={(value) => setDraft((current) => ({ ...current, latitude: value }))}
                      style={styles.input}
                      value={draft.latitude || ""}
                    />
                  </Field>
                  <Field label="Longitude">
                    <TextInput
                      autoCapitalize="none"
                      keyboardType="numeric"
                      onChangeText={(value) => setDraft((current) => ({ ...current, longitude: value }))}
                      style={styles.input}
                      value={draft.longitude || ""}
                    />
                  </Field>
                </View>
                <Field label="Timezone">
                  <TextInput
                    autoCapitalize="none"
                    onChangeText={(value) => setDraft((current) => ({ ...current, timezone: value }))}
                    style={styles.input}
                    value={draft.timezone || "auto"}
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
            {widget.type === "solar" ? (
              <>
                <Field label="State Prefix">
                  <StateFieldInput
                    browseLabel="Prefix"
                    onBrowse={() => setPickerField("statePrefix")}
                    onChangeText={(value) => setDraft((current) => ({ ...current, statePrefix: value }))}
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
                    <StateFieldInput
                      browseLabel="Objekt"
                      onBrowse={() => setPickerField("keyPvNow")}
                      onChangeText={(value) => setDraft((current) => ({ ...current, keyPvNow: value }))}
                      value={draft.keyPvNow || ""}
                    />
                  </Field>
                  <Field label="Haus aktuell">
                    <StateFieldInput
                      browseLabel="Objekt"
                      onBrowse={() => setPickerField("keyHomeNow")}
                      onChangeText={(value) => setDraft((current) => ({ ...current, keyHomeNow: value }))}
                      value={draft.keyHomeNow || ""}
                    />
                  </Field>
                </View>
                <View style={styles.splitRow}>
                  <Field label="Netzbezug">
                    <StateFieldInput
                      browseLabel="Objekt"
                      onBrowse={() => setPickerField("keyGridIn")}
                      onChangeText={(value) => setDraft((current) => ({ ...current, keyGridIn: value }))}
                      value={draft.keyGridIn || ""}
                    />
                  </Field>
                  <Field label="Einspeisung">
                    <StateFieldInput
                      browseLabel="Objekt"
                      onBrowse={() => setPickerField("keyGridOut")}
                      onChangeText={(value) => setDraft((current) => ({ ...current, keyGridOut: value }))}
                      value={draft.keyGridOut || ""}
                    />
                  </Field>
                </View>
                <View style={styles.splitRow}>
                  <Field label="Akku SOC">
                    <StateFieldInput
                      browseLabel="Objekt"
                      onBrowse={() => setPickerField("keySoc")}
                      onChangeText={(value) => setDraft((current) => ({ ...current, keySoc: value }))}
                      value={draft.keySoc || ""}
                    />
                  </Field>
                  <Field label="Akku Temp">
                    <StateFieldInput
                      browseLabel="Objekt"
                      onBrowse={() => setPickerField("keyBattTemp")}
                      onChangeText={(value) => setDraft((current) => ({ ...current, keyBattTemp: value }))}
                      value={draft.keyBattTemp || ""}
                    />
                  </Field>
                </View>
                <View style={styles.splitRow}>
                  <Field label="Akku laden">
                    <StateFieldInput
                      browseLabel="Objekt"
                      onBrowse={() => setPickerField("keyBattIn")}
                      onChangeText={(value) => setDraft((current) => ({ ...current, keyBattIn: value }))}
                      value={draft.keyBattIn || ""}
                    />
                  </Field>
                  <Field label="Akku entladen">
                    <StateFieldInput
                      browseLabel="Objekt"
                      onBrowse={() => setPickerField("keyBattOut")}
                      onChangeText={(value) => setDraft((current) => ({ ...current, keyBattOut: value }))}
                      value={draft.keyBattOut || ""}
                    />
                  </Field>
                </View>
                <View style={styles.splitRow}>
                  <Field label="Tag Verbrauch">
                    <StateFieldInput
                      browseLabel="Objekt"
                      onBrowse={() => setPickerField("keyDayConsumed")}
                      onChangeText={(value) => setDraft((current) => ({ ...current, keyDayConsumed: value }))}
                      value={draft.keyDayConsumed || ""}
                    />
                  </Field>
                  <Field label="Tag Eigen">
                    <StateFieldInput
                      browseLabel="Objekt"
                      onBrowse={() => setPickerField("keyDaySelf")}
                      onChangeText={(value) => setDraft((current) => ({ ...current, keyDaySelf: value }))}
                      value={draft.keyDaySelf || ""}
                    />
                  </Field>
                </View>
                <Field label="PV Gesamt">
                  <StateFieldInput
                    browseLabel="Objekt"
                    onBrowse={() => setPickerField("keyPvTotal")}
                    onChangeText={(value) => setDraft((current) => ({ ...current, keyPvTotal: value }))}
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
      <ObjectPickerModal
        client={client}
        onClose={() => setPickerField(null)}
        onSelect={(entry) => {
          applyObjectSelection(pickerField, entry.id, draft, setDraft);
          setPickerField(null);
        }}
        title="ioBroker Objektbaum"
        visible={Boolean(pickerField)}
      />
      <ImagePickerModal
        client={client}
        onClose={() => setImagePickerOpen(false)}
        onSelect={(entry) => {
          setDraft((current) => ({
            ...current,
            backgroundMode: "image",
            backgroundImage: entry.name,
          }));
          setImagePickerOpen(false);
        }}
        selectedName={draft.backgroundImage}
        visible={imagePickerOpen}
      />
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

function StateFieldInput({
  value,
  onChangeText,
  onBrowse,
  browseLabel = "Objekt waehlen",
}: {
  value: string;
  onChangeText: (value: string) => void;
  onBrowse: () => void;
  browseLabel?: string;
}) {
  return (
    <View style={styles.stateFieldRow}>
      <TextInput autoCapitalize="none" onChangeText={onChangeText} style={[styles.input, styles.stateFieldInput]} value={value} />
      <Pressable onPress={onBrowse} style={styles.stateBrowseButton}>
        <Text style={styles.stateBrowseLabel}>{browseLabel}</Text>
      </Pressable>
    </View>
  );
}

function IconPickerRow({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <View style={styles.iconPickerBlock}>
      <Text style={styles.iconPickerLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.iconPickerRow}>
          {stateIconOptions.map((option) => {
            const value = label === "Aktiv" ? option.active : option.inactive;
            const active = selected === value;

            return (
              <Pressable
                key={`${label}-${option.label}`}
                onPress={() => onSelect(value)}
                style={[styles.iconChip, active ? styles.iconChipActive : null]}
              >
                <MaterialCommunityIcons
                  color={active ? "#08111f" : palette.text}
                  name={value}
                  size={18}
                />
                <Text style={[styles.iconChipLabel, active ? styles.iconChipLabelActive : null]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

function BlurControl({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.blurControlRow}>
      {Platform.OS === "web"
        ? createElement("input", {
            type: "range",
            min: 0,
            max: 24,
            step: 1,
            value,
            onChange: (event: { target: { value: string } }) => onChange(event.target.value),
            style: webRangeInputStyle,
          })
        : null}
      <TextInput
        keyboardType="numeric"
        onChangeText={onChange}
        style={[styles.input, styles.blurInput]}
        value={value}
      />
      <Text style={styles.blurSuffix}>px</Text>
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

function clampFloat(raw: string | undefined, fallback: number) {
  const parsed = Number.parseFloat(raw || "");
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return parsed;
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
    textColor: appearance?.textColor || widgetDefaults.textColor || "",
    mutedTextColor: appearance?.mutedTextColor || widgetDefaults.mutedTextColor || "",
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
      textColor: palette.text,
      mutedTextColor: palette.textMuted,
    };
  }

  if (widget.type === "camera") {
    return {
      widgetColor: theme.widgetTones.cameraStart,
      widgetColor2: theme.widgetTones.cameraEnd,
      textColor: palette.text,
      mutedTextColor: palette.textMuted,
    };
  }

  if (widget.type === "energy") {
    return {
      widgetColor: theme.widgetTones.energyStart,
      widgetColor2: theme.widgetTones.energyEnd,
      textColor: palette.text,
      mutedTextColor: palette.textMuted,
      cardColor: "rgba(255,255,255,0.03)",
    };
  }

  if (widget.type === "grafana") {
    return {
      widgetColor: "rgba(13, 19, 35, 0.96)",
      widgetColor2: "rgba(15, 24, 46, 0.94)",
      textColor: palette.text,
      mutedTextColor: palette.textMuted,
    };
  }

  if (widget.type === "weather") {
    return {
      widgetColor: "#2a86db",
      widgetColor2: "#1d4ea9",
      textColor: palette.text,
      mutedTextColor: "rgba(230, 243, 255, 0.82)",
    };
  }

  return {
    widgetColor: theme.widgetTones.solarStart,
    widgetColor2: theme.widgetTones.solarEnd,
    textColor: palette.text,
    mutedTextColor: palette.textMuted,
    cardColor: theme.solar.nodeCardBackground,
    statColor: theme.solar.statCardBackground,
  };
}

function applyObjectSelection(
  fieldKey: string | null,
  objectId: string,
  draft: Record<string, string>,
  onChange: Dispatch<SetStateAction<Record<string, string>>>
) {
  if (!fieldKey) {
    return;
  }

  if (fieldKey === "statePrefix") {
    const segments = objectId.split(".");
    const prefix = segments.slice(0, -1).join(".");
    onChange((current) => ({ ...current, statePrefix: prefix || objectId }));
    return;
  }

  if (fieldKey.startsWith("key")) {
    const prefix = (draft.statePrefix || "").trim();
    const nextValue = prefix && objectId.startsWith(`${prefix}.`) ? objectId.slice(prefix.length + 1) : objectId.split(".").pop() || objectId;
    onChange((current) => ({ ...current, [fieldKey]: nextValue }));
    return;
  }

  onChange((current) => ({ ...current, [fieldKey]: objectId }));
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

function parseValueLabels(raw: string | undefined) {
  const trimmed = (raw || "").trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const pairs = Object.entries(parsed).filter(
      ([key, value]) => typeof key === "string" && typeof value === "string"
    );

    if (!pairs.length) {
      return undefined;
    }

    const result: Record<string, string> = {};
    pairs.forEach(([key, value]) => {
      result[key] = value as string;
    });

    return result;
  } catch {
    return undefined;
  }
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
  stateFieldRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  stateFieldInput: {
    flex: 1,
  },
  stateBrowseButton: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(92, 124, 255, 0.22)",
    backgroundColor: "rgba(92, 124, 255, 0.12)",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  stateBrowseLabel: {
    color: palette.text,
    fontSize: 12,
    fontWeight: "700",
  },
  iconPreviewRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 10,
  },
  iconPreviewCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: "rgba(255,255,255,0.03)",
    padding: 10,
    alignItems: "center",
    gap: 6,
  },
  iconPreviewLabel: {
    color: palette.textMuted,
    fontSize: 11,
    fontWeight: "700",
  },
  iconPickerBlock: {
    gap: 6,
    marginBottom: 10,
  },
  iconPickerLabel: {
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },
  iconPickerRow: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 2,
  },
  iconChip: {
    minWidth: 88,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: "center",
    gap: 6,
  },
  iconChipActive: {
    backgroundColor: palette.accent,
    borderColor: "rgba(92,124,255,0.4)",
  },
  iconChipLabel: {
    color: palette.text,
    fontSize: 11,
    fontWeight: "700",
  },
  iconChipLabelActive: {
    color: "#08111f",
  },
  mappingHint: {
    marginTop: -2,
    marginBottom: 10,
    color: palette.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  mappingEditor: {
    minHeight: 110,
  },
  blurControlRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  blurInput: {
    width: 74,
  },
  blurSuffix: {
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: "700",
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

const webRangeInputStyle = {
  flex: 1,
  accentColor: palette.accent,
  cursor: "pointer",
};
