import { MaterialCommunityIcons } from "@expo/vector-icons";
import { createElement, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from "react-native";
import { ImagePickerModal } from "./ImagePickerModal";
import { ObjectPickerModal } from "./ObjectPickerModal";
import { SoundPickerField } from "./SoundPickerField";
import { IoBrokerClient } from "../services/iobroker";
import { WidgetAppearance, WidgetConfig, WidgetInteractionSounds } from "../types/dashboard";
import { useDashboardConfig } from "../context/DashboardConfigContext";
import { normalizeSoundSelection } from "../utils/lcarsSounds";
import { playConfiguredUiSound } from "../utils/uiSounds";
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
  const { config, patchConfig, dashboardPages, copyWidgetToPage } = useDashboardConfig();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [soundDraft, setSoundDraft] = useState<Record<string, string[]>>({});
  const [weatherSuggestions, setWeatherSuggestions] = useState<Array<{
    label: string;
    latitude: number;
    longitude: number;
    query: string;
  }>>([]);
  const [weatherSearchBusy, setWeatherSearchBusy] = useState(false);
  const [pickerField, setPickerField] = useState<string | null>(null);
  const [imagePickerField, setImagePickerField] = useState<"backgroundImage" | "iconImage" | null>(null);
  const theme = resolveThemeSettings(config.theme);
  const iconPreview = useMemo(() => {
    const active = (draft.iconActive || widget?.iconPair?.active || "toggle-switch-outline") as keyof typeof MaterialCommunityIcons.glyphMap;
    const inactive = (draft.iconInactive || widget?.iconPair?.inactive || "toggle-switch-off-outline") as keyof typeof MaterialCommunityIcons.glyphMap;
    return { active, inactive };
  }, [draft.iconActive, draft.iconInactive, widget?.iconPair?.active, widget?.iconPair?.inactive]);
  const editorTargetKey = visible && widget ? `${widget.type}:${widget.id}` : null;
  const sourcePageId = useMemo(() => {
    if (!widget) {
      return null;
    }
    const sourcePage = dashboardPages.find((page) => page.widgets.some((entry) => entry.id === widget.id));
    return sourcePage?.id || null;
  }, [dashboardPages, widget]);
  const copyTargetPages = useMemo(
    () => (widget ? dashboardPages.filter((page) => page.id !== sourcePageId) : []),
    [dashboardPages, sourcePageId, widget]
  );

  useEffect(() => {
    if (!widget || !editorTargetKey) {
      return;
    }

    const appearanceDraft = buildAppearanceDraft(widget, theme);

    if (widget.type === "state") {
      setSoundDraft({
        press: resolveDraftSoundValue(
          widget.interactionSounds?.press,
          config.uiSounds?.widgetTypeDefaults?.state?.press
        ),
        confirm: resolveDraftSoundValue(
          widget.interactionSounds?.confirm,
          config.uiSounds?.widgetTypeDefaults?.state?.confirm
        ),
      });
      setDraft({
        title: widget.title,
        showTitle: widget.showTitle === false ? "false" : "true",
        stateId: widget.stateId,
        iconImage: widget.iconImage || "",
        iconImageCrop: widget.iconImageCrop || "none",
        iconImageSizeMode: widget.iconImageSizeMode || "standard",
        iconImageBorderless: widget.iconImageBorderless ? "true" : "false",
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
        addonMode: widget.addonMode || "none",
        addonValue: widget.addonValue || "",
        addonStateId: widget.addonStateId || "",
        addonColor: widget.addonColor || "",
        addonIcon: widget.addonIcon || "",
        addonUseStateValue: widget.addonUseStateValue ? "true" : "false",
        ...appearanceDraft,
      });
      return;
    }

    if (widget.type === "camera") {
      setSoundDraft({
        press: resolveDraftSoundValue(
          widget.interactionSounds?.press,
          config.uiSounds?.widgetTypeDefaults?.camera?.press
        ),
        open: resolveDraftSoundValue(
          widget.interactionSounds?.open,
          config.uiSounds?.widgetTypeDefaults?.camera?.open
        ),
        close: resolveDraftSoundValue(
          widget.interactionSounds?.close,
          config.uiSounds?.widgetTypeDefaults?.camera?.close
        ),
        scroll: resolveDraftSoundValue(
          widget.interactionSounds?.scroll,
          config.uiSounds?.widgetTypeDefaults?.camera?.scroll
        ),
      });
      setDraft({
        title: widget.title,
        showTitle: widget.showTitle === false ? "false" : "true",
        titleFontSize: String(widget.titleFontSize || 14),
        previewSourceMode: widget.previewSourceMode || widget.fullscreenSourceMode || "snapshot",
        snapshotUrl: widget.snapshotUrl || widget.fullscreenSnapshotUrl || "",
        mjpegUrl: widget.mjpegUrl || widget.fullscreenMjpegUrl || "",
        flvUrl: widget.flvUrl || widget.fullscreenFlvUrl || "",
        fmp4Url: widget.fmp4Url || widget.fullscreenFmp4Url || "",
        refreshMs: String(widget.refreshMs || widget.fullscreenRefreshMs || 2000),
        audioEnabled: widget.audioEnabled === true ? "true" : "false",
        maximizeStateId: widget.maximizeStateId || "",
        maximizeTriggerFormat: widget.maximizeTriggerFormat || "boolean",
        maximizeTriggerValue: widget.maximizeTriggerValue || "",
        ...appearanceDraft,
      });
      return;
    }

    if (widget.type === "energy") {
      setSoundDraft({});
      setWeatherSuggestions([]);
      setWeatherSearchBusy(false);
      setDraft({
        title: widget.title,
        showTitle: widget.showTitle === false ? "false" : "true",
        pvStateId: widget.pvStateId,
        houseStateId: widget.houseStateId,
        batteryStateId: widget.batteryStateId || "",
        gridStateId: widget.gridStateId || "",
        ...appearanceDraft,
      });
      return;
    }

    if (widget.type === "grafana") {
      setSoundDraft({
        press: resolveDraftSoundValue(
          widget.interactionSounds?.press,
          config.uiSounds?.widgetTypeDefaults?.grafana?.press
        ),
      });
      setDraft({
        title: widget.title,
        showTitle: widget.showTitle === false ? "false" : "true",
        url: widget.url || "",
        refreshMs: String(widget.refreshMs || 10000),
        allowInteractions: widget.allowInteractions === false ? "false" : "true",
        ...appearanceDraft,
      });
      return;
    }

    if (widget.type === "numpad") {
      setSoundDraft({
        press: resolveDraftSoundValue(
          widget.interactionSounds?.press,
          config.uiSounds?.widgetTypeDefaults?.numpad?.press
        ),
      });
      setDraft({
        title: widget.title,
        showTitle: widget.showTitle === false ? "false" : "true",
        ...appearanceDraft,
      });
      return;
    }

    if (widget.type === "link") {
      setSoundDraft({
        press: resolveDraftSoundValue(
          widget.interactionSounds?.press,
          config.uiSounds?.widgetTypeDefaults?.link?.press
        ),
        open: resolveDraftSoundValue(
          widget.interactionSounds?.open,
          config.uiSounds?.widgetTypeDefaults?.link?.open
        ),
        close: resolveDraftSoundValue(
          widget.interactionSounds?.close,
          config.uiSounds?.widgetTypeDefaults?.link?.close
        ),
      });
      setDraft({
        title: widget.title,
        showTitle: widget.showTitle === false ? "false" : "true",
        url: widget.url || "",
        iconImage: widget.iconImage || "",
        iconImageCrop: widget.iconImageCrop || "none",
        iconImageSizeMode: widget.iconImageSizeMode || "standard",
        iconImageBorderless: widget.iconImageBorderless ? "true" : "false",
        ...appearanceDraft,
      });
      return;
    }

    if (widget.type === "log") {
      setSoundDraft({
        press: resolveDraftSoundValue(
          widget.interactionSounds?.press,
          config.uiSounds?.widgetTypeDefaults?.log?.press
        ),
        scroll: resolveDraftSoundValue(
          widget.interactionSounds?.scroll,
          config.uiSounds?.widgetTypeDefaults?.log?.scroll
        ),
        notify: resolveDraftSoundValue(
          widget.interactionSounds?.notify,
          config.uiSounds?.widgetTypeDefaults?.log?.notify
        ),
        notifyWarn: resolveDraftSoundValue(
          widget.interactionSounds?.notifyWarn,
          config.uiSounds?.widgetTypeDefaults?.log?.notifyWarn
        ),
        notifyError: resolveDraftSoundValue(
          widget.interactionSounds?.notifyError,
          config.uiSounds?.widgetTypeDefaults?.log?.notifyError
        ),
      });
      setWeatherSuggestions([]);
      setWeatherSearchBusy(false);
      setDraft({
        title: widget.title,
        showTitle: widget.showTitle === false ? "false" : "true",
        refreshMs: String(widget.refreshMs || 2000),
        maxEntries: String(widget.maxEntries || 80),
        minSeverity: widget.minSeverity || "info",
        sourceFilter: widget.sourceFilter || "",
        textFilter: widget.textFilter || "",
        ...appearanceDraft,
      });
      return;
    }

    if (widget.type === "script") {
      setSoundDraft({
        press: resolveDraftSoundValue(
          widget.interactionSounds?.press,
          config.uiSounds?.widgetTypeDefaults?.script?.press
        ),
        scroll: resolveDraftSoundValue(
          widget.interactionSounds?.scroll,
          config.uiSounds?.widgetTypeDefaults?.script?.scroll
        ),
      });
      setWeatherSuggestions([]);
      setWeatherSearchBusy(false);
      setDraft({
        title: widget.title,
        showTitle: widget.showTitle === false ? "false" : "true",
        refreshMs: String(widget.refreshMs || 3000),
        maxEntries: String(widget.maxEntries || 120),
        instanceFilter: widget.instanceFilter || "",
        textFilter: widget.textFilter || "",
        ...appearanceDraft,
      });
      return;
    }

    if (widget.type === "host") {
      setSoundDraft({});
      setWeatherSuggestions([]);
      setWeatherSearchBusy(false);
      setDraft({
        title: widget.title,
        showTitle: widget.showTitle === false ? "false" : "true",
        refreshMs: String(widget.refreshMs || 5000),
        hostLabel: widget.hostLabel || "",
        ...appearanceDraft,
      });
      return;
    }

    if (widget.type === "wallbox") {
      setSoundDraft({
        press: resolveDraftSoundValue(
          widget.interactionSounds?.press,
          config.uiSounds?.widgetTypeDefaults?.wallbox?.press
        ),
        confirm: resolveDraftSoundValue(
          widget.interactionSounds?.confirm,
          config.uiSounds?.widgetTypeDefaults?.wallbox?.confirm
        ),
        slider: resolveDraftSoundValue(
          widget.interactionSounds?.slider,
          config.uiSounds?.widgetTypeDefaults?.wallbox?.slider
        ),
      });
      setWeatherSuggestions([]);
      setWeatherSearchBusy(false);
      setDraft({
        title: widget.title,
        showTitle: widget.showTitle === false ? "false" : "true",
        showStatusSubtitle: widget.showStatusSubtitle === true ? "true" : "false",
        showGridAmpereControl: widget.showGridAmpereControl === false ? "false" : "true",
        refreshMs: String(widget.refreshMs || 2000),
        backgroundImage: widget.backgroundImage || "",
        backgroundImageBlur: String(widget.backgroundImageBlur ?? 8),
        modeStateId: widget.modeStateId || "0_userdata.0.goe.mode",
        gridAmpereStateId: widget.gridAmpereStateId || "0_userdata.0.goe.gridAmpere",
        limit80StateId: widget.limit80StateId || "0_userdata.0.goe.limit80",
        allowChargingStateId: widget.allowChargingStateId || "go-e.0.allow_charging",
        solarLoadOnlyStateId: widget.solarLoadOnlyStateId || "go-e.0.solarLoadOnly",
        phaseSwitchModeStateId: widget.phaseSwitchModeStateId || "go-e.0.phaseSwitchMode",
        ampereStateId: widget.ampereStateId || "go-e.0.ampere",
        carStateId: widget.carStateId || "go-e.0.car",
        batterySocStateId: widget.batterySocStateId || "go-e.0.carBatterySoc",
        chargePowerStateId: widget.chargePowerStateId || "go-e.0.nrg.11",
        chargedEnergyStateId: widget.chargedEnergyStateId || "go-e.0.eto",
        stopChargeingAtCarSoc80StateId: widget.stopChargeingAtCarSoc80StateId || "go-e.0.stopChargeingAtCarSoc80",
        ...appearanceDraft,
      });
      return;
    }

    if (widget.type === "heating") {
      setSoundDraft({
        press: resolveDraftSoundValue(
          widget.interactionSounds?.press,
          config.uiSounds?.widgetTypeDefaults?.heating?.press
        ),
        confirm: resolveDraftSoundValue(
          widget.interactionSounds?.confirm,
          config.uiSounds?.widgetTypeDefaults?.heating?.confirm
        ),
        slider: resolveDraftSoundValue(
          widget.interactionSounds?.slider,
          config.uiSounds?.widgetTypeDefaults?.heating?.slider
        ),
      });
      setWeatherSuggestions([]);
      setWeatherSearchBusy(false);
      setDraft({
        title: widget.title,
        showTitle: widget.showTitle === false ? "false" : "true",
        showStatusSubtitle: widget.showStatusSubtitle === false ? "false" : "true",
        refreshMs: String(widget.refreshMs || 3000),
        backgroundImage: widget.backgroundImage || "",
        backgroundImageBlur: String(widget.backgroundImageBlur ?? 8),
        modeSetStateId: widget.modeSetStateId,
        modeValueStateId: widget.modeValueStateId || "",
        activeProgramStateId: widget.activeProgramStateId || "",
        normalSetTempStateId: widget.normalSetTempStateId,
        reducedSetTempStateId: widget.reducedSetTempStateId || "",
        comfortSetTempStateId: widget.comfortSetTempStateId || "",
        dhwSetTempStateId: widget.dhwSetTempStateId,
        comfortActivateStateId: widget.comfortActivateStateId || "",
        comfortDeactivateStateId: widget.comfortDeactivateStateId || "",
        ecoSetActiveStateId: widget.ecoSetActiveStateId || "",
        oneTimeChargeSetActiveStateId: widget.oneTimeChargeSetActiveStateId || "",
        oneTimeChargeActiveStateId: widget.oneTimeChargeActiveStateId || "",
        roomTempStateId: widget.roomTempStateId || "",
        heatingTempStateId: widget.heatingTempStateId || "",
        supplyTempStateId: widget.supplyTempStateId || "",
        outsideTempStateId: widget.outsideTempStateId || "",
        returnTempStateId: widget.returnTempStateId || "",
        dhwTempStateId: widget.dhwTempStateId || "",
        compressorPowerStateId: widget.compressorPowerStateId || "",
        compressorSensorPowerStateId: widget.compressorSensorPowerStateId || "",
        showInfoProgram: widget.showInfoProgram === false ? "false" : "true",
        showInfoTargets: widget.showInfoTargets === false ? "false" : "true",
        showInfoOutsideTemp: widget.showInfoOutsideTemp === false ? "false" : "true",
        showInfoSupplyTemp: widget.showInfoSupplyTemp === false ? "false" : "true",
        showInfoReturnTemp: widget.showInfoReturnTemp === false ? "false" : "true",
        showInfoHeatingTemp: widget.showInfoHeatingTemp === false ? "false" : "true",
        showInfoCompressorPower: widget.showInfoCompressorPower === false ? "false" : "true",
        standbyIcon: widget.standbyIcon || "power-standby",
        dhwIcon: widget.dhwIcon || "water",
        heatingIcon: widget.heatingIcon || "radiator",
        comfortIcon: widget.comfortIcon || "white-balance-sunny",
        ecoIcon: widget.ecoIcon || "leaf",
        oneTimeChargeIcon: normalizeHeatingOneTimeIcon(widget.oneTimeChargeIcon),
        ...appearanceDraft,
      });
      return;
    }

    if (widget.type === "weather") {
      setSoundDraft({});
      setDraft({
        title: widget.title,
        showTitle: widget.showTitle === false ? "false" : "true",
        locationName: widget.locationName || "",
        locationQuery: widget.locationQuery || "",
        latitude: String(widget.latitude),
        longitude: String(widget.longitude),
        timezone: widget.timezone || "auto",
        refreshMs: String(widget.refreshMs || 300000),
        ...appearanceDraft,
      });
      return;
    }

    const solarStatDraft = buildSolarStatEditorDraft(widget.stats);
    setSoundDraft({});
    setWeatherSuggestions([]);
    setWeatherSearchBusy(false);
    setDraft({
      title: widget.title,
      showTitle: widget.showTitle === false ? "false" : "true",
      backgroundMode: widget.backgroundMode || "color",
      backgroundImage: widget.backgroundImage || "",
      backgroundImageBlur: String(widget.backgroundImageBlur ?? 8),
      wallboxCarStateId: widget.wallboxCarStateId || "go-e.0.car",
      wallboxChargePowerStateId: widget.wallboxChargePowerStateId || "go-e.0.nrg.11",
      wallboxAmpereStateId: widget.wallboxAmpereStateId || "go-e.0.ampere",
      wallboxPhaseModeStateId: widget.wallboxPhaseModeStateId || "go-e.0.phaseSwitchMode",
      wallboxCarSocStateId: widget.wallboxCarSocStateId || "go-e.0.carBatterySoc",
      wallboxCarRangeStateId: widget.wallboxCarRangeStateId || "",
      statePrefix: widget.statePrefix,
      dailyEnergyUnit: widget.dailyEnergyUnit || "auto",
      statValueUnit: widget.statValueUnit || "none",
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
      statTextScalePct: String(Math.round((widget.statTextScale ?? 1) * 100)),
      statCount: String(solarStatDraft.count),
      stat1Label: solarStatDraft.cards[0].label,
      stat1StateId: solarStatDraft.cards[0].stateId,
      stat2Label: solarStatDraft.cards[1].label,
      stat2StateId: solarStatDraft.cards[1].stateId,
      stat3Label: solarStatDraft.cards[2].label,
      stat3StateId: solarStatDraft.cards[2].stateId,
      stat4Label: solarStatDraft.cards[3].label,
      stat4StateId: solarStatDraft.cards[3].stateId,
      stat5Label: solarStatDraft.cards[4].label,
      stat5StateId: solarStatDraft.cards[4].stateId,
      stat6Label: solarStatDraft.cards[5].label,
      stat6StateId: solarStatDraft.cards[5].stateId,
      solarTapType: widget.tapAction?.type || "none",
      solarTapDashboardId: widget.tapAction?.type === "dashboard" ? widget.tapAction.dashboardId : "",
      solarTapUrl: widget.tapAction?.type === "url" ? widget.tapAction.url : "",
      ...appearanceDraft,
    });
  }, [editorTargetKey]);

  useEffect(() => {
    if (!visible || widget?.type !== "weather") {
      return;
    }

    const query = (draft.locationQuery || "").trim();
    if (query.length < 2) {
      setWeatherSuggestions([]);
      setWeatherSearchBusy(false);
      return;
    }

    let active = true;
    setWeatherSearchBusy(true);

    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          name: query,
          count: "5",
          language: "de",
          format: "json",
        });
        const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params.toString()}`);
        if (!response.ok) {
          throw new Error(`Geocoding failed (${response.status})`);
        }

        const payload = (await response.json()) as {
          results?: Array<{
            name: string;
            latitude: number;
            longitude: number;
            country?: string;
            admin1?: string;
          }>;
        };

        if (!active) {
          return;
        }

        setWeatherSuggestions(
          (payload.results || []).map((entry) => ({
            label: [entry.name, entry.admin1, entry.country].filter(Boolean).join(", "),
            latitude: entry.latitude,
            longitude: entry.longitude,
            query: entry.name,
          }))
        );
      } catch {
        if (active) {
          setWeatherSuggestions([]);
        }
      } finally {
        if (active) {
          setWeatherSearchBusy(false);
        }
      }
    }, 260);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [draft.locationQuery, visible, widget?.type]);

  if (!widget) {
    return null;
  }

  const cameraMode = normalizeCameraSourceMode(draft.previewSourceMode || draft.fullscreenSourceMode);
  const cameraUrl = getCameraUrlByMode(draft, cameraMode);
  const solarStatCount = clampSolarStatCount(draft.statCount);

  const save = () => {
    const appearance = buildAppearance(draft);

    if (widget.type === "state") {
      onSave(widget.id, {
        title: draft.title,
        showTitle: draft.showTitle !== "false",
        stateId: draft.stateId || widget.stateId,
        iconImage: draft.iconImage || undefined,
        iconImageCrop: normalizeIconImageCrop(draft.iconImageCrop),
        iconImageSizeMode: normalizeIconImageSizeMode(draft.iconImageSizeMode),
        iconImageBorderless: draft.iconImageBorderless === "true",
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
        addonMode: normalizeAddonMode(draft.addonMode),
        addonValue: draft.addonValue || undefined,
        addonStateId: draft.addonStateId || undefined,
        addonColor: draft.addonColor || undefined,
        addonIcon: draft.addonIcon || undefined,
        addonUseStateValue: draft.addonUseStateValue === "true",
        interactionSounds: buildStoredInteractionSounds(
          widget.type,
          soundDraft,
          config.uiSounds?.widgetTypeDefaults?.[widget.type]
        ),
        appearance,
      });
    } else if (widget.type === "camera") {
      const previewSourceMode = cameraMode;
      const snapshotUrl = normalizeOptionalInput(draft.snapshotUrl);
      const mjpegUrl = normalizeOptionalInput(draft.mjpegUrl);
      const flvUrl = normalizeOptionalInput(draft.flvUrl);
      const fmp4Url = normalizeOptionalInput(draft.fmp4Url);
      const cameraSourceChanged =
        normalizeCameraSourceMode(widget.previewSourceMode) !== previewSourceMode ||
        normalizeOptionalInput(widget.snapshotUrl) !== snapshotUrl ||
        normalizeOptionalInput(widget.mjpegUrl) !== mjpegUrl ||
        normalizeOptionalInput(widget.flvUrl) !== flvUrl ||
        normalizeOptionalInput(widget.fmp4Url) !== fmp4Url;
      onSave(widget.id, {
        title: draft.title,
        showTitle: draft.showTitle !== "false",
        titleFontSize: clampInt(draft.titleFontSize, widget.titleFontSize || 14, 11),
        previewSourceMode,
        fullscreenSourceMode: undefined,
        snapshotUrl,
        fullscreenSnapshotUrl: undefined,
        mjpegUrl,
        fullscreenMjpegUrl: undefined,
        flvUrl,
        fullscreenFlvUrl: undefined,
        fmp4Url,
        fullscreenFmp4Url: undefined,
        refreshMs: clampInt(draft.refreshMs, widget.refreshMs || 2000, 250),
        fullscreenRefreshMs: undefined,
        audioEnabled: draft.audioEnabled === "true",
        manualHeightOverride: cameraSourceChanged ? false : widget.manualHeightOverride,
        snapshotAspectRatio: cameraSourceChanged ? undefined : widget.snapshotAspectRatio,
        maximizeStateId: draft.maximizeStateId || undefined,
        maximizeTriggerFormat: normalizeStateFormat(draft.maximizeTriggerFormat),
        maximizeTriggerValue: draft.maximizeTriggerValue || undefined,
        interactionSounds: buildStoredInteractionSounds(
          widget.type,
          soundDraft,
          config.uiSounds?.widgetTypeDefaults?.[widget.type]
        ),
        appearance,
      });
    } else if (widget.type === "energy") {
      onSave(widget.id, {
        title: draft.title,
        showTitle: draft.showTitle !== "false",
        pvStateId: draft.pvStateId || widget.pvStateId,
        houseStateId: draft.houseStateId || widget.houseStateId,
        batteryStateId: draft.batteryStateId || undefined,
        gridStateId: draft.gridStateId || undefined,
        appearance,
      });
    } else if (widget.type === "grafana") {
      onSave(widget.id, {
        title: draft.title,
        showTitle: draft.showTitle !== "false",
        url: draft.url || widget.url,
        refreshMs: clampInt(draft.refreshMs, widget.refreshMs || 10000, 1000),
        allowInteractions: draft.allowInteractions !== "false",
        interactionSounds: buildStoredInteractionSounds(
          widget.type,
          soundDraft,
          config.uiSounds?.widgetTypeDefaults?.[widget.type]
        ),
        appearance,
      });
    } else if (widget.type === "numpad") {
      onSave(widget.id, {
        title: draft.title,
        showTitle: draft.showTitle !== "false",
        interactionSounds: buildStoredInteractionSounds(
          widget.type,
          soundDraft,
          config.uiSounds?.widgetTypeDefaults?.[widget.type]
        ),
        appearance,
      });
    } else if (widget.type === "link") {
      onSave(widget.id, {
        title: draft.title,
        showTitle: draft.showTitle !== "false",
        url: draft.url || undefined,
        iconImage: draft.iconImage || undefined,
        iconImageCrop: normalizeIconImageCrop(draft.iconImageCrop),
        iconImageSizeMode: normalizeIconImageSizeMode(draft.iconImageSizeMode),
        iconImageBorderless: draft.iconImageBorderless === "true",
        interactionSounds: buildStoredInteractionSounds(
          widget.type,
          soundDraft,
          config.uiSounds?.widgetTypeDefaults?.[widget.type]
        ),
        appearance,
      });
    } else if (widget.type === "log") {
      onSave(widget.id, {
        title: draft.title,
        showTitle: draft.showTitle !== "false",
        refreshMs: clampInt(draft.refreshMs, widget.refreshMs || 2000, 500),
        maxEntries: clampIntMax(draft.maxEntries, widget.maxEntries || 80, 5, 200),
        minSeverity: normalizeLogSeverity(draft.minSeverity),
        sourceFilter: draft.sourceFilter?.trim() || undefined,
        textFilter: draft.textFilter?.trim() || undefined,
        interactionSounds: buildStoredInteractionSounds(
          widget.type,
          soundDraft,
          config.uiSounds?.widgetTypeDefaults?.[widget.type]
        ),
        appearance,
      });
    } else if (widget.type === "script") {
      onSave(widget.id, {
        title: draft.title,
        showTitle: draft.showTitle !== "false",
        refreshMs: clampInt(draft.refreshMs, widget.refreshMs || 3000, 500),
        maxEntries: clampInt(draft.maxEntries, widget.maxEntries || 120, 1),
        instanceFilter: draft.instanceFilter?.trim() || undefined,
        textFilter: draft.textFilter?.trim() || undefined,
        interactionSounds: buildStoredInteractionSounds(
          widget.type,
          soundDraft,
          config.uiSounds?.widgetTypeDefaults?.[widget.type]
        ),
        appearance,
      });
    } else if (widget.type === "host") {
      onSave(widget.id, {
        title: draft.title,
        showTitle: draft.showTitle !== "false",
        refreshMs: clampInt(draft.refreshMs, widget.refreshMs || 5000, 1500),
        hostLabel: draft.hostLabel?.trim() || undefined,
        appearance,
      });
    } else if (widget.type === "wallbox") {
      onSave(widget.id, {
        title: draft.title,
        showTitle: draft.showTitle !== "false",
        showStatusSubtitle: draft.showStatusSubtitle === "true",
        showGridAmpereControl: draft.showGridAmpereControl !== "false",
        refreshMs: clampInt(draft.refreshMs, widget.refreshMs || 2000, 500),
        backgroundImage: draft.backgroundImage?.trim() || undefined,
        backgroundImageBlur: clampInt(draft.backgroundImageBlur, widget.backgroundImageBlur ?? 8, 0),
        modeStateId: draft.modeStateId?.trim() || widget.modeStateId,
        gridAmpereStateId: draft.gridAmpereStateId?.trim() || widget.gridAmpereStateId,
        limit80StateId: draft.limit80StateId?.trim() || widget.limit80StateId,
        allowChargingStateId: draft.allowChargingStateId?.trim() || undefined,
        solarLoadOnlyStateId: draft.solarLoadOnlyStateId?.trim() || undefined,
        phaseSwitchModeStateId: draft.phaseSwitchModeStateId?.trim() || undefined,
        ampereStateId: draft.ampereStateId?.trim() || undefined,
        carStateId: draft.carStateId?.trim() || undefined,
        batterySocStateId: draft.batterySocStateId?.trim() || undefined,
        chargePowerStateId: draft.chargePowerStateId?.trim() || undefined,
        chargedEnergyStateId: draft.chargedEnergyStateId?.trim() || undefined,
        stopChargeingAtCarSoc80StateId: draft.stopChargeingAtCarSoc80StateId?.trim() || undefined,
        interactionSounds: buildStoredInteractionSounds(
          widget.type,
          soundDraft,
          config.uiSounds?.widgetTypeDefaults?.[widget.type]
        ),
        appearance,
      });
    } else if (widget.type === "heating") {
      onSave(widget.id, {
        title: draft.title,
        showTitle: draft.showTitle !== "false",
        showStatusSubtitle: draft.showStatusSubtitle !== "false",
        refreshMs: clampInt(draft.refreshMs, widget.refreshMs || 3000, 500),
        backgroundImage: draft.backgroundImage?.trim() || undefined,
        backgroundImageBlur: clampInt(draft.backgroundImageBlur, widget.backgroundImageBlur ?? 8, 0),
        modeSetStateId: draft.modeSetStateId?.trim() || widget.modeSetStateId,
        modeValueStateId: draft.modeValueStateId?.trim() || undefined,
        activeProgramStateId: draft.activeProgramStateId?.trim() || undefined,
        normalSetTempStateId: draft.normalSetTempStateId?.trim() || widget.normalSetTempStateId,
        reducedSetTempStateId: draft.reducedSetTempStateId?.trim() || undefined,
        comfortSetTempStateId: draft.comfortSetTempStateId?.trim() || undefined,
        dhwSetTempStateId: draft.dhwSetTempStateId?.trim() || widget.dhwSetTempStateId,
        comfortActivateStateId: draft.comfortActivateStateId?.trim() || undefined,
        comfortDeactivateStateId: draft.comfortDeactivateStateId?.trim() || undefined,
        ecoSetActiveStateId: draft.ecoSetActiveStateId?.trim() || undefined,
        oneTimeChargeSetActiveStateId: draft.oneTimeChargeSetActiveStateId?.trim() || undefined,
        oneTimeChargeActiveStateId: draft.oneTimeChargeActiveStateId?.trim() || undefined,
        roomTempStateId: draft.roomTempStateId?.trim() || undefined,
        heatingTempStateId: draft.heatingTempStateId?.trim() || undefined,
        supplyTempStateId: draft.supplyTempStateId?.trim() || undefined,
        outsideTempStateId: draft.outsideTempStateId?.trim() || undefined,
        returnTempStateId: draft.returnTempStateId?.trim() || undefined,
        dhwTempStateId: draft.dhwTempStateId?.trim() || undefined,
        compressorPowerStateId: draft.compressorPowerStateId?.trim() || undefined,
        compressorSensorPowerStateId: draft.compressorSensorPowerStateId?.trim() || undefined,
        showInfoProgram: draft.showInfoProgram !== "false",
        showInfoTargets: draft.showInfoTargets !== "false",
        showInfoOutsideTemp: draft.showInfoOutsideTemp !== "false",
        showInfoSupplyTemp: draft.showInfoSupplyTemp !== "false",
        showInfoReturnTemp: draft.showInfoReturnTemp !== "false",
        showInfoHeatingTemp: draft.showInfoHeatingTemp !== "false",
        showInfoCompressorPower: draft.showInfoCompressorPower !== "false",
        standbyIcon: draft.standbyIcon?.trim() || undefined,
        dhwIcon: draft.dhwIcon?.trim() || undefined,
        heatingIcon: draft.heatingIcon?.trim() || undefined,
        comfortIcon: draft.comfortIcon?.trim() || undefined,
        ecoIcon: draft.ecoIcon?.trim() || undefined,
        oneTimeChargeIcon: draft.oneTimeChargeIcon?.trim() || undefined,
        interactionSounds: buildStoredInteractionSounds(
          widget.type,
          soundDraft,
          config.uiSounds?.widgetTypeDefaults?.[widget.type]
        ),
        appearance,
      });
    } else if (widget.type === "weather") {
      onSave(widget.id, {
        title: draft.title,
        showTitle: draft.showTitle !== "false",
        locationName: draft.locationName || undefined,
        locationQuery: draft.locationQuery || undefined,
        latitude: clampFloat(draft.latitude, widget.latitude),
        longitude: clampFloat(draft.longitude, widget.longitude),
        timezone: draft.timezone || "auto",
        refreshMs: clampInt(draft.refreshMs, widget.refreshMs || 300000, 60000),
        appearance,
      });
    } else {
      onSave(widget.id, {
        title: draft.title,
        showTitle: draft.showTitle !== "false",
        backgroundMode: draft.backgroundMode === "image" ? "image" : "color",
        backgroundImage: draft.backgroundImage || undefined,
        backgroundImageBlur: clampInt(draft.backgroundImageBlur, widget.backgroundImageBlur ?? 8, 0),
        wallboxCarStateId: draft.wallboxCarStateId?.trim() || undefined,
        wallboxChargePowerStateId: draft.wallboxChargePowerStateId?.trim() || undefined,
        wallboxAmpereStateId: draft.wallboxAmpereStateId?.trim() || undefined,
        wallboxPhaseModeStateId: draft.wallboxPhaseModeStateId?.trim() || undefined,
        wallboxCarSocStateId: draft.wallboxCarSocStateId?.trim() || undefined,
        wallboxCarRangeStateId: draft.wallboxCarRangeStateId?.trim() || undefined,
        statePrefix: draft.statePrefix || widget.statePrefix,
        dailyEnergyUnit:
          draft.dailyEnergyUnit === "Wh" || draft.dailyEnergyUnit === "kWh" ? draft.dailyEnergyUnit : "auto",
        statValueUnit:
          draft.statValueUnit === "W" ||
          draft.statValueUnit === "kW" ||
          draft.statValueUnit === "Wh" ||
          draft.statValueUnit === "kWh"
            ? draft.statValueUnit
            : "none",
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
        statTextScale: clampFloatRange(
          draft.statTextScalePct,
          (widget.statTextScale ?? 1) * 100,
          60,
          200
        ) / 100,
        stats: buildSolarStats(draft),
        tapAction: buildSolarTapAction(draft),
        appearance,
      });
    }

    onClose();
  };

  const saveSoundsAsTypeDefault = () => {
    if (
      widget.type !== "state" &&
      widget.type !== "camera" &&
      widget.type !== "grafana" &&
      widget.type !== "numpad" &&
      widget.type !== "link" &&
      widget.type !== "log" &&
      widget.type !== "script" &&
      widget.type !== "wallbox" &&
      widget.type !== "heating"
    ) {
      return;
    }

    const nextDefault: WidgetInteractionSounds = {
      press: normalizeSoundSelection(soundDraft.press),
      confirm: normalizeSoundSelection(soundDraft.confirm),
      slider: normalizeSoundSelection(soundDraft.slider),
      open: normalizeSoundSelection(soundDraft.open),
      close: normalizeSoundSelection(soundDraft.close),
      scroll: normalizeSoundSelection(soundDraft.scroll),
      notify: normalizeSoundSelection(soundDraft.notify),
      notifyWarn: normalizeSoundSelection(soundDraft.notifyWarn),
      notifyError: normalizeSoundSelection(soundDraft.notifyError),
    };

    patchConfig({
      uiSounds: {
        enabled: config.uiSounds?.enabled !== false,
        volume: config.uiSounds?.volume ?? 55,
        soundSet: config.uiSounds?.soundSet || "voyager",
        widgetTypeDefaults: {
          ...(config.uiSounds?.widgetTypeDefaults || {}),
          [widget.type]: nextDefault,
        },
        pageSounds: config.uiSounds?.pageSounds,
      },
    });
  };

  return (
    <Modal animationType="fade" transparent visible={visible}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Widget bearbeiten</Text>
            <EditorButtonPressable onPress={onClose}>
              <Text style={styles.close}>Schliessen</Text>
            </EditorButtonPressable>
          </View>
          <ScrollView>
            <Field label="Titel">
              <TextInput
                onChangeText={(value) => setDraft((current) => ({ ...current, title: value }))}
                style={styles.input}
                value={draft.title || ""}
              />
            </Field>
            <Field label="Titel anzeigen">
              <ChoiceRow
                options={["true", "false"]}
                value={draft.showTitle || "true"}
                onSelect={(value) => setDraft((current) => ({ ...current, showTitle: value }))}
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
              {widget.type === "state" ? (
                <>
                  <ColorInputRow
                    firstKey="activeWidgetColor"
                    firstLabel="Widget aktiv"
                    secondKey="inactiveWidgetColor"
                    secondLabel="Widget inaktiv"
                    values={draft}
                    onChange={setDraft}
                  />
                  <ColorInputRow
                    firstKey="iconColor"
                    firstLabel="Icon aktiv"
                    secondKey="iconColor2"
                    secondLabel="Icon inaktiv"
                    values={draft}
                    onChange={setDraft}
                  />
                </>
              ) : null}
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
                          <EditorButtonPressable
                            onPress={() => setImagePickerField("backgroundImage")}
                            style={styles.stateBrowseButton}
                          >
                            <Text style={styles.stateBrowseLabel}>Bild waehlen</Text>
                          </EditorButtonPressable>
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
              {widget.type === "host" ? (
                <>
                  <ColorInputRow
                    firstKey="cardColor"
                    firstLabel="Pie Disk genutzt"
                    secondKey="cardColor2"
                    secondLabel="Pie Disk frei"
                    values={draft}
                    onChange={setDraft}
                  />
                  <ColorInputRow
                    firstKey="pvCardColor"
                    firstLabel="Pie RAM genutzt"
                    secondKey="homeCardColor"
                    secondLabel="Pie RAM frei"
                    values={draft}
                    onChange={setDraft}
                  />
                  <ColorInputRow
                    firstKey="activeWidgetColor"
                    firstLabel="CPU Balken Start"
                    secondKey="activeWidgetColor2"
                    secondLabel="CPU Balken Ende"
                    values={draft}
                    onChange={setDraft}
                  />
                  <ColorInputRow
                    firstKey="inactiveWidgetColor"
                    firstLabel="Temp Balken Start"
                    secondKey="inactiveWidgetColor2"
                    secondLabel="Temp Balken Ende"
                    values={draft}
                    onChange={setDraft}
                  />
                  <ColorInputRow
                    firstKey="statColor"
                    firstLabel="Prozess Badge Start"
                    secondKey="statColor2"
                    secondLabel="Prozess Badge Ende"
                    values={draft}
                    onChange={setDraft}
                  />
                </>
              ) : null}
              {widget.type === "wallbox" ? (
                <>
                  <ColorInputRow
                    firstKey="cardColor"
                    firstLabel="Modus Aus Start"
                    secondKey="cardColor2"
                    secondLabel="Modus Aus Ende"
                    values={draft}
                    onChange={setDraft}
                  />
                  <ColorInputRow
                    firstKey="activeWidgetColor"
                    firstLabel="Modus PV Start"
                    secondKey="activeWidgetColor2"
                    secondLabel="Modus PV Ende"
                    values={draft}
                    onChange={setDraft}
                  />
                  <ColorInputRow
                    firstKey="statColor"
                    firstLabel="Modus Netz Start"
                    secondKey="statColor2"
                    secondLabel="Modus Netz Ende"
                    values={draft}
                    onChange={setDraft}
                  />
                  <ColorInputRow
                    firstKey="iconColor"
                    firstLabel="Slider Start"
                    secondKey="iconColor2"
                    secondLabel="Slider Ende"
                    values={draft}
                    onChange={setDraft}
                  />
                  <ColorInputRow
                    firstKey="inactiveWidgetColor"
                    firstLabel="Toggle 80% Start"
                    secondKey="inactiveWidgetColor2"
                    secondLabel="Toggle 80% Ende"
                    values={draft}
                    onChange={setDraft}
                  />
                </>
              ) : null}
              {widget.type === "heating" ? (
                <>
                  <ColorInputRow
                    firstKey="cardColor"
                    firstLabel="Panel Hintergrund"
                    secondKey="iconColor"
                    secondLabel="Slider Start"
                    values={draft}
                    onChange={setDraft}
                  />
                  <ColorInputRow
                    firstKey="iconColor2"
                    firstLabel="Slider Ende"
                    secondKey="activeWidgetColor"
                    secondLabel="Komfort Akzent"
                    values={draft}
                    onChange={setDraft}
                  />
                  <ColorInputRow
                    firstKey="activeWidgetColor2"
                    firstLabel="Eco Akzent"
                    secondKey="statColor"
                    secondLabel="Einmalladung Akzent"
                    values={draft}
                    onChange={setDraft}
                  />
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
                <Field label="Bild (optional)">
                  <View style={styles.stateFieldRow}>
                    <TextInput
                      editable={false}
                      style={[styles.input, styles.stateFieldInput]}
                      value={draft.iconImage || ""}
                    />
                    <EditorButtonPressable onPress={() => setImagePickerField("iconImage")} style={styles.stateBrowseButton}>
                      <Text style={styles.stateBrowseLabel}>Bild waehlen</Text>
                    </EditorButtonPressable>
                  </View>
                  <Field label="Bildform">
                    <ChoiceRow
                      options={["none", "rounded", "circle"]}
                      value={draft.iconImageCrop || "none"}
                      onSelect={(value) => setDraft((current) => ({ ...current, iconImageCrop: value }))}
                    />
                  </Field>
                  <Field label="Bildgroesse">
                    <ChoiceRow
                      options={["standard", "maximized"]}
                      value={draft.iconImageSizeMode || "standard"}
                      onSelect={(value) => setDraft((current) => ({ ...current, iconImageSizeMode: value }))}
                    />
                  </Field>
                  <Field label="Borderless">
                    <ChoiceRow
                      options={["false", "true"]}
                      value={draft.iconImageBorderless || "false"}
                      onSelect={(value) => setDraft((current) => ({ ...current, iconImageBorderless: value }))}
                    />
                  </Field>
                </Field>
                <Field label="Addon">
                  <ChoiceRow
                    options={["none", "circle", "text", "icon", "bars"]}
                    value={draft.addonMode || "none"}
                    onSelect={(value) => setDraft((current) => ({ ...current, addonMode: value }))}
                  />
                  {(draft.addonMode || "none") !== "none" ? (
                    <>
                      <Field label="Addon nutzt State-Wert">
                        <ChoiceRow
                          options={["false", "true"]}
                          value={draft.addonUseStateValue || "false"}
                          onSelect={(value) => setDraft((current) => ({ ...current, addonUseStateValue: value }))}
                        />
                      </Field>
                      {draft.addonUseStateValue === "true" ? (
                        <Field label="Addon State ID">
                          <StateFieldInput
                            onBrowse={() => setPickerField("addonStateId")}
                            onChangeText={(value) => setDraft((current) => ({ ...current, addonStateId: value }))}
                            value={draft.addonStateId || ""}
                          />
                        </Field>
                      ) : null}
                      <Field label="Addon Text / Wert">
                        <TextInput
                          onChangeText={(value) => setDraft((current) => ({ ...current, addonValue: value }))}
                          placeholder="z. B. 21 / 420 W / Schloss"
                          placeholderTextColor={palette.textMuted}
                          style={styles.input}
                          value={draft.addonValue || ""}
                        />
                      </Field>
                      <ColorField
                        label="Addon Farbe"
                        value={draft.addonColor || ""}
                        onChange={(value) => setDraft((current) => ({ ...current, addonColor: value }))}
                      />
                      {draft.addonMode === "icon" ? (
                        <Field label="Addon Icon">
                          <IconPickerRow
                            label="Addon"
                            selected={draft.addonIcon || "lock"}
                            onSelect={(value) => setDraft((current) => ({ ...current, addonIcon: value }))}
                          />
                        </Field>
                      ) : null}
                    </>
                  ) : null}
                </Field>
                <Field label="Sounds bei Interaktion">
                  <Field label="Beim Druecken">
                    <SoundPickerField
                      onChange={(value) => setSoundDraft((current) => ({ ...current, press: value }))}
                      value={soundDraft.press}
                    />
                  </Field>
                  <Field label="Bei Bestaetigung">
                    <SoundPickerField
                      onChange={(value) => setSoundDraft((current) => ({ ...current, confirm: value }))}
                      value={soundDraft.confirm}
                    />
                  </Field>
                  <EditorButtonPressable onPress={saveSoundsAsTypeDefault} style={styles.inlineActionButton}>
                    <Text style={styles.inlineActionLabel}>Als Default fuer alle State-Widgets verwenden</Text>
                  </EditorButtonPressable>
                </Field>
              </>
            ) : null}
            {widget.type === "camera" ? (
              <>
                <Field label="Titelgroesse (px)">
                  <TextInput
                    keyboardType="numeric"
                    onChangeText={(value) => setDraft((current) => ({ ...current, titleFontSize: value }))}
                    style={styles.input}
                    value={draft.titleFontSize || "14"}
                  />
                </Field>
                <ColorField
                  label="Titelfarbe Overlay"
                  value={draft.textColor || ""}
                  onChange={(value) => setDraft((current) => ({ ...current, textColor: value }))}
                />
                <Field label="Quelle">
                  <ChoiceRow
                    options={["snapshot", "mjpeg", "flv", "fmp4"]}
                    value={cameraMode}
                    onSelect={(value) => setDraft((current) => ({ ...current, previewSourceMode: value }))}
                  />
                </Field>
                <Field label="URL">
                  <TextInput
                    autoCapitalize="none"
                    onChangeText={(value) => setDraft((current) => setCameraUrlByMode(current, cameraMode, value))}
                    style={styles.input}
                    value={cameraUrl}
                  />
                </Field>
                <Text style={styles.mappingHint}>
                  Die URL gilt fuer das oben gewaehlte Format (Snapshot, MJPEG, FLV oder fMP4).
                </Text>
                <Text style={styles.mappingHint}>
                  FLV-Hinweis: Bei `CodecUnsupported` liefert der Stream meist kein browser-kompatibles H.264. Falls
                  vorhanden, statt `main` den `ext`/Substream verwenden (z. B. `channel0_ext.bcs`).
                </Text>
                <Field label="Refresh (ms)">
                  <TextInput
                    editable={cameraMode === "snapshot"}
                    keyboardType="numeric"
                    onChangeText={(value) => setDraft((current) => ({ ...current, refreshMs: value }))}
                    style={[
                      styles.input,
                      cameraMode !== "snapshot" ? styles.disabledInput : null,
                    ]}
                    value={draft.refreshMs || ""}
                  />
                  {cameraMode !== "snapshot" ? (
                    <Text style={styles.mappingHint}>Refresh gilt nur fuer Snapshot.</Text>
                  ) : null}
                </Field>
                <Field label="Ton standardmaessig aktiv">
                  <ChoiceRow
                    options={["true", "false"]}
                    value={draft.audioEnabled || "false"}
                    onSelect={(value) => setDraft((current) => ({ ...current, audioEnabled: value }))}
                  />
                  <Text style={styles.mappingHint}>
                    Hinweis: Browser erlauben Autoplay mit Ton oft erst nach einer Nutzerinteraktion.
                  </Text>
                </Field>
                <Field label="Maximieren per Datenpunkt">
                  <StateFieldInput
                    onBrowse={() => setPickerField("maximizeStateId")}
                    onChangeText={(value) => setDraft((current) => ({ ...current, maximizeStateId: value }))}
                    value={draft.maximizeStateId || ""}
                  />
                </Field>
                <Field label="Trigger Format">
                  <ChoiceRow
                    options={["boolean", "number", "text"]}
                    value={draft.maximizeTriggerFormat || "boolean"}
                    onSelect={(value) => setDraft((current) => ({ ...current, maximizeTriggerFormat: value }))}
                  />
                </Field>
                <Field label="Trigger Wert">
                  <TextInput
                    autoCapitalize="none"
                    onChangeText={(value) => setDraft((current) => ({ ...current, maximizeTriggerValue: value }))}
                    placeholder={
                      (draft.maximizeTriggerFormat || "boolean") === "boolean"
                        ? "true oder false"
                        : (draft.maximizeTriggerFormat || "boolean") === "number"
                          ? "z. B. 1"
                          : "z. B. Klingel"
                    }
                    placeholderTextColor={palette.textMuted}
                    style={styles.input}
                    value={draft.maximizeTriggerValue || ""}
                  />
                </Field>
                <Field label="Sounds bei Interaktion">
                  <Field label="Beim Tippen">
                    <SoundPickerField
                      onChange={(value) => setSoundDraft((current) => ({ ...current, press: value }))}
                      value={soundDraft.press}
                    />
                  </Field>
                  <Field label="Maximieren">
                    <SoundPickerField
                      onChange={(value) => setSoundDraft((current) => ({ ...current, open: value }))}
                      value={soundDraft.open}
                    />
                  </Field>
                  <Field label="Schliessen">
                    <SoundPickerField
                      onChange={(value) => setSoundDraft((current) => ({ ...current, close: value }))}
                      value={soundDraft.close}
                    />
                  </Field>
                  <Field label="Wischen">
                    <SoundPickerField
                      onChange={(value) => setSoundDraft((current) => ({ ...current, scroll: value }))}
                      value={soundDraft.scroll}
                    />
                  </Field>
                  <EditorButtonPressable onPress={saveSoundsAsTypeDefault} style={styles.inlineActionButton}>
                    <Text style={styles.inlineActionLabel}>Als Default fuer alle Camera-Widgets verwenden</Text>
                  </EditorButtonPressable>
                </Field>
              </>
            ) : null}
            {widget.type === "numpad" ? (
              <Field label="Sounds bei Interaktion">
                <Field label="Beim Druecken">
                  <SoundPickerField
                    onChange={(value) => setSoundDraft((current) => ({ ...current, press: value }))}
                    value={soundDraft.press}
                  />
                </Field>
                <EditorButtonPressable onPress={saveSoundsAsTypeDefault} style={styles.inlineActionButton}>
                  <Text style={styles.inlineActionLabel}>Als Default fuer alle Numpad-Widgets verwenden</Text>
                </EditorButtonPressable>
              </Field>
            ) : null}
            {widget.type === "link" ? (
              <>
                <Field label="URL">
                  <TextInput
                    autoCapitalize="none"
                    onChangeText={(value) => setDraft((current) => ({ ...current, url: value }))}
                    placeholder="https://example.com"
                    placeholderTextColor={palette.textMuted}
                    style={styles.input}
                    value={draft.url || ""}
                  />
                </Field>
                <Field label="Icon (PNG)">
                  <View style={styles.stateFieldRow}>
                    <TextInput
                      editable={false}
                      style={[styles.input, styles.stateFieldInput]}
                      value={draft.iconImage || ""}
                    />
                    <EditorButtonPressable onPress={() => setImagePickerField("iconImage")} style={styles.stateBrowseButton}>
                      <Text style={styles.stateBrowseLabel}>Bild waehlen</Text>
                    </EditorButtonPressable>
                  </View>
                </Field>
                <Field label="Bildform">
                  <ChoiceRow
                    options={["none", "rounded", "circle"]}
                    value={draft.iconImageCrop || "none"}
                    onSelect={(value) => setDraft((current) => ({ ...current, iconImageCrop: value }))}
                  />
                </Field>
                <Field label="Bildgroesse">
                  <ChoiceRow
                    options={["standard", "maximized"]}
                    value={draft.iconImageSizeMode || "standard"}
                    onSelect={(value) => setDraft((current) => ({ ...current, iconImageSizeMode: value }))}
                  />
                </Field>
                <Field label="Borderless">
                  <ChoiceRow
                    options={["false", "true"]}
                    value={draft.iconImageBorderless || "false"}
                    onSelect={(value) => setDraft((current) => ({ ...current, iconImageBorderless: value }))}
                  />
                </Field>
                <Field label="Sounds bei Interaktion">
                  <Field label="Beim Druecken">
                    <SoundPickerField
                      onChange={(value) => setSoundDraft((current) => ({ ...current, press: value }))}
                      value={soundDraft.press}
                    />
                  </Field>
                  <Field label="Beim Oeffnen">
                    <SoundPickerField
                      onChange={(value) => setSoundDraft((current) => ({ ...current, open: value }))}
                      value={soundDraft.open}
                    />
                  </Field>
                  <Field label="Beim Schliessen">
                    <SoundPickerField
                      onChange={(value) => setSoundDraft((current) => ({ ...current, close: value }))}
                      value={soundDraft.close}
                    />
                  </Field>
                  <EditorButtonPressable onPress={saveSoundsAsTypeDefault} style={styles.inlineActionButton}>
                    <Text style={styles.inlineActionLabel}>Als Default fuer alle Link-Widgets verwenden</Text>
                  </EditorButtonPressable>
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
                <Field label="Sounds bei Interaktion">
                  <SoundPickerField
                    onChange={(value) => setSoundDraft((current) => ({ ...current, press: value }))}
                    value={soundDraft.press}
                  />
                  <EditorButtonPressable onPress={saveSoundsAsTypeDefault} style={styles.inlineActionButton}>
                    <Text style={styles.inlineActionLabel}>Als Default fuer alle Grafana-Widgets verwenden</Text>
                  </EditorButtonPressable>
                </Field>
              </>
            ) : null}
            {widget.type === "weather" ? (
              <>
                <Field label="Friendly Name">
                  <TextInput
                    onChangeText={(value) => setDraft((current) => ({ ...current, locationName: value }))}
                    placeholder="z. B. Zuhause, Buero, Ferienhaus"
                    placeholderTextColor={palette.textMuted}
                    style={styles.input}
                    value={draft.locationName || ""}
                  />
                </Field>
                <Field label="Ort suchen (statt Koordinaten)">
                  <TextInput
                    onChangeText={(value) => setDraft((current) => ({ ...current, locationQuery: value }))}
                    placeholder="z. B. Berlin, Hamburg, Muenchen"
                    placeholderTextColor={palette.textMuted}
                    style={styles.input}
                    value={draft.locationQuery || ""}
                  />
                  {weatherSearchBusy ? <Text style={styles.mappingHint}>Suche Orte...</Text> : null}
                  {weatherSuggestions.length ? (
                    <View style={styles.weatherSuggestionList}>
                      {weatherSuggestions.map((entry) => (
                        <EditorButtonPressable
                          key={`${entry.label}-${entry.latitude}-${entry.longitude}`}
                          onPress={() => {
                            setDraft((current) => ({
                              ...current,
                              locationQuery: entry.query,
                              latitude: String(entry.latitude),
                              longitude: String(entry.longitude),
                            }));
                            setWeatherSuggestions([]);
                          }}
                          style={styles.weatherSuggestionItem}
                        >
                          <Text style={styles.weatherSuggestionLabel}>{entry.label}</Text>
                          <Text style={styles.weatherSuggestionMeta}>
                            {entry.latitude.toFixed(2)}, {entry.longitude.toFixed(2)}
                          </Text>
                        </EditorButtonPressable>
                      ))}
                    </View>
                  ) : null}
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
                <Text style={styles.mappingHint}>
                  Wenn `Ort suchen` gesetzt ist, werden die Koordinaten automatisch ueber Open-Meteo ermittelt.
                  Latitude/Longitude bleiben dann nur als Fallback erhalten.
                </Text>
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
            {widget.type === "log" ? (
              <>
                <View style={styles.splitRow}>
                  <Field label="Refresh (ms)">
                    <TextInput
                      keyboardType="numeric"
                      onChangeText={(value) => setDraft((current) => ({ ...current, refreshMs: value }))}
                      style={styles.input}
                      value={draft.refreshMs || "2000"}
                    />
                  </Field>
                  <Field label="Zeilen">
                    <TextInput
                      keyboardType="numeric"
                      onChangeText={(value) => setDraft((current) => ({ ...current, maxEntries: value }))}
                      style={styles.input}
                      value={draft.maxEntries || "80"}
                    />
                    <Text style={styles.mappingHint}>Maximal 200 Eintraege.</Text>
                  </Field>
                </View>
                <Field label="Mindest-Level">
                  <ChoiceRow
                    options={["silly", "debug", "info", "warn", "error"]}
                    value={draft.minSeverity || "info"}
                    onSelect={(value) => setDraft((current) => ({ ...current, minSeverity: value }))}
                  />
                </Field>
                <Field label="Quell-Filter (optional)">
                  <TextInput
                    autoCapitalize="none"
                    onChangeText={(value) => setDraft((current) => ({ ...current, sourceFilter: value }))}
                    placeholder="z. B. system.adapter.javascript.0"
                    placeholderTextColor={palette.textMuted}
                    style={styles.input}
                    value={draft.sourceFilter || ""}
                  />
                </Field>
                <Field label="Text-Filter (optional)">
                  <TextInput
                    autoCapitalize="none"
                    onChangeText={(value) => setDraft((current) => ({ ...current, textFilter: value }))}
                    placeholder="z. B. timeout, error, reconnect"
                    placeholderTextColor={palette.textMuted}
                    style={styles.input}
                    value={draft.textFilter || ""}
                  />
                </Field>
                <Field label="Sounds bei Interaktion">
                  <Field label="Warn/Error Button">
                    <SoundPickerField
                      onChange={(value) => setSoundDraft((current) => ({ ...current, press: value }))}
                      value={soundDraft.press}
                    />
                  </Field>
                  <Field label="Scrollen im Widget">
                    <SoundPickerField
                      onChange={(value) => setSoundDraft((current) => ({ ...current, scroll: value }))}
                      value={soundDraft.scroll}
                    />
                  </Field>
                  <Field label="Neue Log-Meldung">
                    <SoundPickerField
                      onChange={(value) => setSoundDraft((current) => ({ ...current, notify: value }))}
                      value={soundDraft.notify}
                    />
                  </Field>
                  <Field label="Neue WARN-Meldung">
                    <SoundPickerField
                      onChange={(value) => setSoundDraft((current) => ({ ...current, notifyWarn: value }))}
                      value={soundDraft.notifyWarn}
                    />
                  </Field>
                  <Field label="Neue ERROR-Meldung">
                    <SoundPickerField
                      onChange={(value) => setSoundDraft((current) => ({ ...current, notifyError: value }))}
                      value={soundDraft.notifyError}
                    />
                  </Field>
                  <EditorButtonPressable onPress={saveSoundsAsTypeDefault} style={styles.inlineActionButton}>
                    <Text style={styles.inlineActionLabel}>Als Default fuer alle Log-Widgets verwenden</Text>
                  </EditorButtonPressable>
                </Field>
              </>
            ) : null}
            {widget.type === "script" ? (
              <>
                <View style={styles.splitRow}>
                  <Field label="Refresh (ms)">
                    <TextInput
                      keyboardType="numeric"
                      onChangeText={(value) => setDraft((current) => ({ ...current, refreshMs: value }))}
                      style={styles.input}
                      value={draft.refreshMs || "3000"}
                    />
                  </Field>
                  <Field label="Anzahl">
                    <TextInput
                      keyboardType="numeric"
                      onChangeText={(value) => setDraft((current) => ({ ...current, maxEntries: value }))}
                      style={styles.input}
                      value={draft.maxEntries || "120"}
                    />
                  </Field>
                </View>
                <Field label="Instanz-Filter (optional)">
                  <TextInput
                    autoCapitalize="none"
                    onChangeText={(value) => setDraft((current) => ({ ...current, instanceFilter: value }))}
                    placeholder="z. B. javascript.0"
                    placeholderTextColor={palette.textMuted}
                    style={styles.input}
                    value={draft.instanceFilter || ""}
                  />
                </Field>
                <Field label="Text-Filter (optional)">
                  <TextInput
                    autoCapitalize="none"
                    onChangeText={(value) => setDraft((current) => ({ ...current, textFilter: value }))}
                    placeholder="z. B. licht, alarm, heizung"
                    placeholderTextColor={palette.textMuted}
                    style={styles.input}
                    value={draft.textFilter || ""}
                  />
                </Field>
                <Field label="Sounds bei Interaktion">
                  <Field label="Play/Pause und Explorer">
                    <SoundPickerField
                      onChange={(value) => setSoundDraft((current) => ({ ...current, press: value }))}
                      value={soundDraft.press}
                    />
                  </Field>
                  <Field label="Scrollen im Widget">
                    <SoundPickerField
                      onChange={(value) => setSoundDraft((current) => ({ ...current, scroll: value }))}
                      value={soundDraft.scroll}
                    />
                  </Field>
                  <EditorButtonPressable onPress={saveSoundsAsTypeDefault} style={styles.inlineActionButton}>
                    <Text style={styles.inlineActionLabel}>Als Default fuer alle Script-Widgets verwenden</Text>
                  </EditorButtonPressable>
                </Field>
              </>
            ) : null}
            {widget.type === "host" ? (
              <>
                <Field label="Refresh (ms)">
                  <TextInput
                    keyboardType="numeric"
                    onChangeText={(value) => setDraft((current) => ({ ...current, refreshMs: value }))}
                    style={styles.input}
                    value={draft.refreshMs || "5000"}
                  />
                </Field>
                <Field label="Host Label (optional)">
                  <TextInput
                    onChangeText={(value) => setDraft((current) => ({ ...current, hostLabel: value }))}
                    placeholder="z. B. Proxmox-Host, Raspberry Pi"
                    placeholderTextColor={palette.textMuted}
                    style={styles.input}
                    value={draft.hostLabel || ""}
                  />
                </Field>
                <Text style={styles.mappingHint}>
                  Zeigt Festplatte, RAM, CPU-Auslastung, Prozessanzahl und CPU-Temperatur des ioBroker-Hosts.
                </Text>
              </>
            ) : null}
            {widget.type === "wallbox" ? (
              <>
                <View style={styles.splitRow}>
                  <Field label="Refresh (ms)">
                    <TextInput
                      keyboardType="numeric"
                      onChangeText={(value) => setDraft((current) => ({ ...current, refreshMs: value }))}
                      style={styles.input}
                      value={draft.refreshMs || "2000"}
                    />
                  </Field>
                  <Field label="Status-Untertitel anzeigen">
                    <ChoiceRow
                      options={["true", "false"]}
                      value={draft.showStatusSubtitle || "false"}
                      onSelect={(value) => setDraft((current) => ({ ...current, showStatusSubtitle: value }))}
                    />
                  </Field>
                </View>
                <Field label="Netzladen-Strom anzeigen">
                  <ChoiceRow
                    options={["true", "false"]}
                    value={draft.showGridAmpereControl || "true"}
                    onSelect={(value) => setDraft((current) => ({ ...current, showGridAmpereControl: value }))}
                  />
                </Field>

                <Field label="Widget-Hintergrundbild (optional)">
                  <View style={styles.stateFieldRow}>
                    <TextInput
                      editable={false}
                      style={[styles.input, styles.stateFieldInput]}
                      value={draft.backgroundImage || ""}
                    />
                    <EditorButtonPressable
                      onPress={() => setImagePickerField("backgroundImage")}
                      style={styles.stateBrowseButton}
                    >
                      <Text style={styles.stateBrowseLabel}>Bild waehlen</Text>
                    </EditorButtonPressable>
                  </View>
                  <Field label="Bild-Unschaerfe">
                    <BlurControl
                      value={draft.backgroundImageBlur || "8"}
                      onChange={(value) => setDraft((current) => ({ ...current, backgroundImageBlur: value }))}
                    />
                  </Field>
                </Field>

                <Text style={styles.sectionTitle}>Steuerbare Datenpunkte</Text>
                <Field label="Mode State ID">
                  <StateFieldInput
                    onBrowse={() => setPickerField("modeStateId")}
                    onChangeText={(value) => setDraft((current) => ({ ...current, modeStateId: value }))}
                    value={draft.modeStateId || ""}
                  />
                </Field>
                <Field label="Grid Ampere State ID">
                  <StateFieldInput
                    onBrowse={() => setPickerField("gridAmpereStateId")}
                    onChangeText={(value) => setDraft((current) => ({ ...current, gridAmpereStateId: value }))}
                    value={draft.gridAmpereStateId || ""}
                  />
                </Field>
                <Field label="Limit 80 State ID">
                  <StateFieldInput
                    onBrowse={() => setPickerField("limit80StateId")}
                    onChangeText={(value) => setDraft((current) => ({ ...current, limit80StateId: value }))}
                    value={draft.limit80StateId || ""}
                  />
                </Field>

                <Text style={styles.sectionTitle}>Optionale Live-Infos</Text>
                <View style={styles.splitRow}>
                  <Field label="allow_charging">
                    <StateFieldInput
                      onBrowse={() => setPickerField("allowChargingStateId")}
                      onChangeText={(value) => setDraft((current) => ({ ...current, allowChargingStateId: value }))}
                      value={draft.allowChargingStateId || ""}
                    />
                  </Field>
                  <Field label="solarLoadOnly">
                    <StateFieldInput
                      onBrowse={() => setPickerField("solarLoadOnlyStateId")}
                      onChangeText={(value) => setDraft((current) => ({ ...current, solarLoadOnlyStateId: value }))}
                      value={draft.solarLoadOnlyStateId || ""}
                    />
                  </Field>
                </View>
                <View style={styles.splitRow}>
                  <Field label="phaseSwitchMode">
                    <StateFieldInput
                      onBrowse={() => setPickerField("phaseSwitchModeStateId")}
                      onChangeText={(value) => setDraft((current) => ({ ...current, phaseSwitchModeStateId: value }))}
                      value={draft.phaseSwitchModeStateId || ""}
                    />
                  </Field>
                  <Field label="ampere">
                    <StateFieldInput
                      onBrowse={() => setPickerField("ampereStateId")}
                      onChangeText={(value) => setDraft((current) => ({ ...current, ampereStateId: value }))}
                      value={draft.ampereStateId || ""}
                    />
                  </Field>
                </View>
                <View style={styles.splitRow}>
                  <Field label="car">
                    <StateFieldInput
                      onBrowse={() => setPickerField("carStateId")}
                      onChangeText={(value) => setDraft((current) => ({ ...current, carStateId: value }))}
                      value={draft.carStateId || ""}
                    />
                  </Field>
                  <Field label="carBatterySoc">
                    <StateFieldInput
                      onBrowse={() => setPickerField("batterySocStateId")}
                      onChangeText={(value) => setDraft((current) => ({ ...current, batterySocStateId: value }))}
                      value={draft.batterySocStateId || ""}
                    />
                  </Field>
                </View>
                <View style={styles.splitRow}>
                  <Field label="chargePower (kW/W)">
                    <StateFieldInput
                      onBrowse={() => setPickerField("chargePowerStateId")}
                      onChangeText={(value) => setDraft((current) => ({ ...current, chargePowerStateId: value }))}
                      value={draft.chargePowerStateId || ""}
                    />
                  </Field>
                  <Field label="chargedEnergy (kWh/Wh)">
                    <StateFieldInput
                      onBrowse={() => setPickerField("chargedEnergyStateId")}
                      onChangeText={(value) => setDraft((current) => ({ ...current, chargedEnergyStateId: value }))}
                      value={draft.chargedEnergyStateId || ""}
                    />
                  </Field>
                </View>
                <Field label="stopChargeingAtCarSoc80">
                  <StateFieldInput
                    onBrowse={() => setPickerField("stopChargeingAtCarSoc80StateId")}
                    onChangeText={(value) =>
                      setDraft((current) => ({ ...current, stopChargeingAtCarSoc80StateId: value }))
                    }
                    value={draft.stopChargeingAtCarSoc80StateId || ""}
                  />
                </Field>
                <Text style={styles.mappingHint}>
                  `carBatterySoc` sollte den aktuellen Fahrzeug-SoC in Prozent liefern.
                </Text>

                <Field label="Sounds bei Interaktion">
                  <Field label="Button Press">
                    <SoundPickerField
                      onChange={(value) => setSoundDraft((current) => ({ ...current, press: value }))}
                      value={soundDraft.press}
                    />
                  </Field>
                  <Field label="Slider Bewegung">
                    <SoundPickerField
                      onChange={(value) => setSoundDraft((current) => ({ ...current, slider: value }))}
                      value={soundDraft.slider}
                    />
                  </Field>
                  <Field label="Bestaetigt / geschrieben">
                    <SoundPickerField
                      onChange={(value) => setSoundDraft((current) => ({ ...current, confirm: value }))}
                      value={soundDraft.confirm}
                    />
                  </Field>
                  <EditorButtonPressable onPress={saveSoundsAsTypeDefault} style={styles.inlineActionButton}>
                    <Text style={styles.inlineActionLabel}>Als Default fuer alle Wallbox-Widgets verwenden</Text>
                  </EditorButtonPressable>
                </Field>
              </>
            ) : null}
            {widget.type === "heating" ? (
              <>
                <View style={styles.splitRow}>
                  <Field label="Refresh (ms)">
                    <TextInput
                      keyboardType="numeric"
                      onChangeText={(value) => setDraft((current) => ({ ...current, refreshMs: value }))}
                      style={styles.input}
                      value={draft.refreshMs || "3000"}
                    />
                  </Field>
                  <Field label="Status-Untertitel anzeigen">
                    <ChoiceRow
                      options={["true", "false"]}
                      value={draft.showStatusSubtitle || "true"}
                      onSelect={(value) => setDraft((current) => ({ ...current, showStatusSubtitle: value }))}
                    />
                  </Field>
                </View>

                <Field label="Widget-Hintergrundbild (optional)">
                  <View style={styles.stateFieldRow}>
                    <TextInput
                      editable={false}
                      style={[styles.input, styles.stateFieldInput]}
                      value={draft.backgroundImage || ""}
                    />
                    <EditorButtonPressable
                      onPress={() => setImagePickerField("backgroundImage")}
                      style={styles.stateBrowseButton}
                    >
                      <Text style={styles.stateBrowseLabel}>Bild waehlen</Text>
                    </EditorButtonPressable>
                  </View>
                  <Field label="Bild-Unschaerfe">
                    <BlurControl
                      value={draft.backgroundImageBlur || "8"}
                      onChange={(value) => setDraft((current) => ({ ...current, backgroundImageBlur: value }))}
                    />
                  </Field>
                </Field>

                <Text style={styles.sectionTitle}>Steuerung</Text>
                <Field label="Mode setzen (setMode.setValue)">
                  <StateFieldInput
                    onBrowse={() => setPickerField("modeSetStateId")}
                    onChangeText={(value) => setDraft((current) => ({ ...current, modeSetStateId: value }))}
                    value={draft.modeSetStateId || ""}
                  />
                </Field>
                <Field label="Innentemperatur Soll setzen">
                  <StateFieldInput
                    onBrowse={() => setPickerField("normalSetTempStateId")}
                    onChangeText={(value) => setDraft((current) => ({ ...current, normalSetTempStateId: value }))}
                    value={draft.normalSetTempStateId || ""}
                  />
                </Field>
                <View style={styles.splitRow}>
                  <Field label="Reduziert Solltemperatur">
                    <StateFieldInput
                      onBrowse={() => setPickerField("reducedSetTempStateId")}
                      onChangeText={(value) => setDraft((current) => ({ ...current, reducedSetTempStateId: value }))}
                      value={draft.reducedSetTempStateId || ""}
                    />
                  </Field>
                  <Field label="Komfort Solltemperatur">
                    <StateFieldInput
                      onBrowse={() => setPickerField("comfortSetTempStateId")}
                      onChangeText={(value) => setDraft((current) => ({ ...current, comfortSetTempStateId: value }))}
                      value={draft.comfortSetTempStateId || ""}
                    />
                  </Field>
                </View>
                <Field label="Warmwasser Solltemperatur setzen">
                  <StateFieldInput
                    onBrowse={() => setPickerField("dhwSetTempStateId")}
                    onChangeText={(value) => setDraft((current) => ({ ...current, dhwSetTempStateId: value }))}
                    value={draft.dhwSetTempStateId || ""}
                  />
                </Field>
                <View style={styles.splitRow}>
                  <Field label="WW Einmalladung setActive">
                    <StateFieldInput
                      onBrowse={() => setPickerField("oneTimeChargeSetActiveStateId")}
                      onChangeText={(value) => setDraft((current) => ({ ...current, oneTimeChargeSetActiveStateId: value }))}
                      value={draft.oneTimeChargeSetActiveStateId || ""}
                    />
                  </Field>
                </View>

                <Text style={styles.sectionTitle}>Live-States (optional)</Text>
                <View style={styles.splitRow}>
                  <Field label="Aktueller Modus">
                    <StateFieldInput
                      onBrowse={() => setPickerField("modeValueStateId")}
                      onChangeText={(value) => setDraft((current) => ({ ...current, modeValueStateId: value }))}
                      value={draft.modeValueStateId || ""}
                    />
                  </Field>
                  <Field label="Aktives Programm">
                    <StateFieldInput
                      onBrowse={() => setPickerField("activeProgramStateId")}
                      onChangeText={(value) => setDraft((current) => ({ ...current, activeProgramStateId: value }))}
                      value={draft.activeProgramStateId || ""}
                    />
                  </Field>
                </View>
                <View style={styles.splitRow}>
                  <Field label="Innentemperatur Ist">
                    <StateFieldInput
                      onBrowse={() => setPickerField("roomTempStateId")}
                      onChangeText={(value) => setDraft((current) => ({ ...current, roomTempStateId: value }))}
                      value={draft.roomTempStateId || ""}
                    />
                  </Field>
                  <Field label="Heizkreis Temp">
                    <StateFieldInput
                      onBrowse={() => setPickerField("heatingTempStateId")}
                      onChangeText={(value) => setDraft((current) => ({ ...current, heatingTempStateId: value }))}
                      value={draft.heatingTempStateId || ""}
                    />
                  </Field>
                  <Field label="Vorlauf Temp">
                    <StateFieldInput
                      onBrowse={() => setPickerField("supplyTempStateId")}
                      onChangeText={(value) => setDraft((current) => ({ ...current, supplyTempStateId: value }))}
                      value={draft.supplyTempStateId || ""}
                    />
                  </Field>
                </View>
                <View style={styles.splitRow}>
                  <Field label="Aussentemperatur">
                    <StateFieldInput
                      onBrowse={() => setPickerField("outsideTempStateId")}
                      onChangeText={(value) => setDraft((current) => ({ ...current, outsideTempStateId: value }))}
                      value={draft.outsideTempStateId || ""}
                    />
                  </Field>
                  <Field label="Ruecklauf Temp">
                    <StateFieldInput
                      onBrowse={() => setPickerField("returnTempStateId")}
                      onChangeText={(value) => setDraft((current) => ({ ...current, returnTempStateId: value }))}
                      value={draft.returnTempStateId || ""}
                    />
                  </Field>
                </View>
                <View style={styles.splitRow}>
                  <Field label="Warmwasser Ist">
                    <StateFieldInput
                      onBrowse={() => setPickerField("dhwTempStateId")}
                      onChangeText={(value) => setDraft((current) => ({ ...current, dhwTempStateId: value }))}
                      value={draft.dhwTempStateId || ""}
                    />
                  </Field>
                  <Field label="Einmalladung Aktiv">
                    <StateFieldInput
                      onBrowse={() => setPickerField("oneTimeChargeActiveStateId")}
                      onChangeText={(value) => setDraft((current) => ({ ...current, oneTimeChargeActiveStateId: value }))}
                      value={draft.oneTimeChargeActiveStateId || ""}
                    />
                  </Field>
                </View>
                <View style={styles.splitRow}>
                  <Field label="Verdichter Leistung">
                    <StateFieldInput
                      onBrowse={() => setPickerField("compressorPowerStateId")}
                      onChangeText={(value) => setDraft((current) => ({ ...current, compressorPowerStateId: value }))}
                      value={draft.compressorPowerStateId || ""}
                    />
                  </Field>
                  <Field label="Verdichter Sensor Leistung">
                    <StateFieldInput
                      onBrowse={() => setPickerField("compressorSensorPowerStateId")}
                      onChangeText={(value) => setDraft((current) => ({ ...current, compressorSensorPowerStateId: value }))}
                      value={draft.compressorSensorPowerStateId || ""}
                    />
                  </Field>
                </View>

                <Text style={styles.sectionTitle}>Button-Icons (MaterialCommunityIcons)</Text>
                <View style={styles.splitRow}>
                  <Field label="Standby Icon">
                    <TextInput
                      autoCapitalize="none"
                      onChangeText={(value) => setDraft((current) => ({ ...current, standbyIcon: value }))}
                      style={styles.input}
                      value={draft.standbyIcon || ""}
                    />
                  </Field>
                  <Field label="Nur WW Icon">
                    <TextInput
                      autoCapitalize="none"
                      onChangeText={(value) => setDraft((current) => ({ ...current, dhwIcon: value }))}
                      style={styles.input}
                      value={draft.dhwIcon || ""}
                    />
                  </Field>
                </View>
                <View style={styles.splitRow}>
                  <Field label="Heizen+WW Icon">
                    <TextInput
                      autoCapitalize="none"
                      onChangeText={(value) => setDraft((current) => ({ ...current, heatingIcon: value }))}
                      style={styles.input}
                      value={draft.heatingIcon || ""}
                    />
                  </Field>
                  <Field label="Einmalladung Icon">
                    <TextInput
                      autoCapitalize="none"
                      onChangeText={(value) => setDraft((current) => ({ ...current, oneTimeChargeIcon: value }))}
                      style={styles.input}
                      value={draft.oneTimeChargeIcon || ""}
                    />
                  </Field>
                </View>

                <Text style={styles.sectionTitle}>Infobox-Textzeilen</Text>
                <View style={styles.splitRow}>
                  <CheckboxChoice
                    label="Programm"
                    value={draft.showInfoProgram || "true"}
                    onChange={(value) => setDraft((current) => ({ ...current, showInfoProgram: value }))}
                  />
                  <CheckboxChoice
                    label="Zielwerte"
                    value={draft.showInfoTargets || "true"}
                    onChange={(value) => setDraft((current) => ({ ...current, showInfoTargets: value }))}
                  />
                </View>
                <View style={styles.splitRow}>
                  <CheckboxChoice
                    label="Aussen"
                    value={draft.showInfoOutsideTemp || "true"}
                    onChange={(value) => setDraft((current) => ({ ...current, showInfoOutsideTemp: value }))}
                  />
                  <CheckboxChoice
                    label="Vorlauf"
                    value={draft.showInfoSupplyTemp || "true"}
                    onChange={(value) => setDraft((current) => ({ ...current, showInfoSupplyTemp: value }))}
                  />
                </View>
                <View style={styles.splitRow}>
                  <CheckboxChoice
                    label="Ruecklauf"
                    value={draft.showInfoReturnTemp || "true"}
                    onChange={(value) => setDraft((current) => ({ ...current, showInfoReturnTemp: value }))}
                  />
                  <CheckboxChoice
                    label="Heizkreis"
                    value={draft.showInfoHeatingTemp || "true"}
                    onChange={(value) => setDraft((current) => ({ ...current, showInfoHeatingTemp: value }))}
                  />
                </View>
                <View style={styles.splitRow}>
                  <CheckboxChoice
                    label="Verdichter"
                    value={draft.showInfoCompressorPower || "true"}
                    onChange={(value) => setDraft((current) => ({ ...current, showInfoCompressorPower: value }))}
                  />
                </View>

                <Field label="Sounds bei Interaktion">
                  <Field label="Button Press">
                    <SoundPickerField
                      onChange={(value) => setSoundDraft((current) => ({ ...current, press: value }))}
                      value={soundDraft.press}
                    />
                  </Field>
                  <Field label="Slider Bewegung">
                    <SoundPickerField
                      onChange={(value) => setSoundDraft((current) => ({ ...current, slider: value }))}
                      value={soundDraft.slider}
                    />
                  </Field>
                  <Field label="Bestaetigt / geschrieben">
                    <SoundPickerField
                      onChange={(value) => setSoundDraft((current) => ({ ...current, confirm: value }))}
                      value={soundDraft.confirm}
                    />
                  </Field>
                  <EditorButtonPressable onPress={saveSoundsAsTypeDefault} style={styles.inlineActionButton}>
                    <Text style={styles.inlineActionLabel}>Als Default fuer alle Heating-Widgets verwenden</Text>
                  </EditorButtonPressable>
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
                      <EditorButtonPressable
                        key={unit}
                        onPress={() => setDraft((current) => ({ ...current, dailyEnergyUnit: unit }))}
                        style={[
                          styles.modeButton,
                          draft.dailyEnergyUnit === unit ? styles.modeButtonActive : null,
                        ]}
                      >
                        <Text style={styles.modeLabel}>{unit}</Text>
                      </EditorButtonPressable>
                    ))}
                  </View>
                </Field>
                <Field label="Stat-Cards Einheit">
                  <View style={styles.modeRow}>
                    {["none", "W", "kW", "Wh", "kWh"].map((unit) => (
                      <EditorButtonPressable
                        key={`stat-unit-${unit}`}
                        onPress={() => setDraft((current) => ({ ...current, statValueUnit: unit }))}
                        style={[
                          styles.modeButton,
                          (draft.statValueUnit || "none") === unit ? styles.modeButtonActive : null,
                        ]}
                      >
                        <Text style={styles.modeLabel}>{unit}</Text>
                      </EditorButtonPressable>
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
                <Text style={styles.sectionTitle}>Auto / Wallbox (optional)</Text>
                <View style={styles.splitRow}>
                  <Field label="Wallbox Car State ID">
                    <StateFieldInput
                      browseLabel="Objekt"
                      onBrowse={() => setPickerField("wallboxCarStateId")}
                      onChangeText={(value) => setDraft((current) => ({ ...current, wallboxCarStateId: value }))}
                      value={draft.wallboxCarStateId || ""}
                    />
                  </Field>
                  <Field label="Auto Akku SoC State ID">
                    <StateFieldInput
                      browseLabel="Objekt"
                      onBrowse={() => setPickerField("wallboxCarSocStateId")}
                      onChangeText={(value) => setDraft((current) => ({ ...current, wallboxCarSocStateId: value }))}
                      value={draft.wallboxCarSocStateId || ""}
                    />
                  </Field>
                </View>
                <Field label="Auto Reichweite State ID (km)">
                  <StateFieldInput
                    browseLabel="Objekt"
                    onBrowse={() => setPickerField("wallboxCarRangeStateId")}
                    onChangeText={(value) => setDraft((current) => ({ ...current, wallboxCarRangeStateId: value }))}
                    value={draft.wallboxCarRangeStateId || ""}
                  />
                </Field>
                <View style={styles.splitRow}>
                  <Field label="Wallbox Ladeleistung State ID">
                    <StateFieldInput
                      browseLabel="Objekt"
                      onBrowse={() => setPickerField("wallboxChargePowerStateId")}
                      onChangeText={(value) =>
                        setDraft((current) => ({ ...current, wallboxChargePowerStateId: value }))
                      }
                      value={draft.wallboxChargePowerStateId || ""}
                    />
                  </Field>
                  <Field label="Wallbox Strom State ID">
                    <StateFieldInput
                      browseLabel="Objekt"
                      onBrowse={() => setPickerField("wallboxAmpereStateId")}
                      onChangeText={(value) => setDraft((current) => ({ ...current, wallboxAmpereStateId: value }))}
                      value={draft.wallboxAmpereStateId || ""}
                    />
                  </Field>
                </View>
                <Field label="Wallbox Phasenmodus State ID">
                  <StateFieldInput
                    browseLabel="Objekt"
                    onBrowse={() => setPickerField("wallboxPhaseModeStateId")}
                    onChangeText={(value) => setDraft((current) => ({ ...current, wallboxPhaseModeStateId: value }))}
                    value={draft.wallboxPhaseModeStateId || ""}
                  />
                </Field>
                <Text style={styles.mappingHint}>
                  Wird fuer Auto-Flow-Animation, Ladeleistung, SoC und Reichweite im Auto-Node genutzt.
                </Text>
                <Field label="Stat Textgroesse (%)">
                  <TextInput
                    keyboardType="numeric"
                    onChangeText={(value) => setDraft((current) => ({ ...current, statTextScalePct: value }))}
                    style={styles.input}
                    value={draft.statTextScalePct || "100"}
                  />
                </Field>
                <Text style={styles.sectionTitle}>Klick-Aktion</Text>
                <Field label="Aktion">
                  <ChoiceRow
                    options={["none", "dashboard", "url"]}
                    value={draft.solarTapType || "none"}
                    onSelect={(value) => setDraft((current) => ({ ...current, solarTapType: value }))}
                  />
                </Field>
                {draft.solarTapType === "dashboard" ? (
                  <Field label="Ziel-Dashboard">
                    <View style={styles.modeRow}>
                      {dashboardPages.map((page) => (
                        <EditorButtonPressable
                          key={`solar-target-${page.id}`}
                          onPress={() => setDraft((current) => ({ ...current, solarTapDashboardId: page.id }))}
                          style={[
                            styles.modeButton,
                            (draft.solarTapDashboardId || "") === page.id ? styles.modeButtonActive : null,
                          ]}
                        >
                          <Text style={styles.modeLabel}>{page.title}</Text>
                        </EditorButtonPressable>
                      ))}
                    </View>
                    <TextInput
                      autoCapitalize="none"
                      onChangeText={(value) => setDraft((current) => ({ ...current, solarTapDashboardId: value }))}
                      placeholder="Dashboard ID"
                      placeholderTextColor={palette.textMuted}
                      style={styles.input}
                      value={draft.solarTapDashboardId || ""}
                    />
                  </Field>
                ) : null}
                {draft.solarTapType === "url" ? (
                  <Field label="Ziel-URL">
                    <TextInput
                      autoCapitalize="none"
                      onChangeText={(value) => setDraft((current) => ({ ...current, solarTapUrl: value }))}
                      placeholder="https://example.com"
                      placeholderTextColor={palette.textMuted}
                      style={styles.input}
                      value={draft.solarTapUrl || ""}
                    />
                  </Field>
                ) : null}
                <Text style={styles.sectionTitle}>Stats</Text>
                <Field label="Anzahl Stat-Cards">
                  <ChoiceRow
                    options={["1", "2", "3", "4", "5", "6"]}
                    value={String(solarStatCount)}
                    onSelect={(value) => setDraft((current) => ({ ...current, statCount: value }))}
                  />
                </Field>
                {Array.from({ length: solarStatCount }, (_, index) => {
                  const item = index + 1;
                  const labelKey = `stat${item}Label`;
                  const stateKey = `stat${item}StateId`;
                  return (
                    <View key={`solar-stat-editor-${item}`} style={styles.splitRow}>
                      <Field label={`Stat ${item} Label`}>
                        <TextInput
                          onChangeText={(value) => setDraft((current) => ({ ...current, [labelKey]: value }))}
                          style={styles.input}
                          value={draft[labelKey] || ""}
                        />
                      </Field>
                      <Field label={`Stat ${item} Datenpunkt`}>
                        <StateFieldInput
                          browseLabel="Objekt"
                          onBrowse={() => setPickerField(stateKey)}
                          onChangeText={(value) => setDraft((current) => ({ ...current, [stateKey]: value }))}
                          value={draft[stateKey] || ""}
                        />
                      </Field>
                    </View>
                  );
                })}
                <Text style={styles.mappingHint}>
                  Leer lassen, um den bisherigen Standardwert des Solar-Widgets zu nutzen. Wenn ein Datenpunkt gesetzt ist,
                  wird dessen aktueller Wert direkt angezeigt.
                </Text>
              </>
            ) : null}
            {widget ? (
              <>
                <Text style={styles.sectionTitle}>Widget kopieren</Text>
                <Field label="Auf Side-Page kopieren">
                  {copyTargetPages.length ? (
                    <View style={styles.modeRow}>
                      {copyTargetPages.map((page) => (
                        <EditorButtonPressable
                          key={`copy-target-${widget.id}-${page.id}`}
                          onPress={() => copyWidgetToPage(widget.id, page.id)}
                          style={styles.modeButton}
                        >
                          <Text style={styles.modeLabel}>{page.title}</Text>
                        </EditorButtonPressable>
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.mappingHint}>Keine weitere Side-Page vorhanden.</Text>
                  )}
                  <Text style={styles.mappingHint}>
                    Erstellt eine Kopie mit allen Widget-Einstellungen auf der gewaehlten Seite.
                  </Text>
                </Field>
              </>
            ) : null}
          </ScrollView>
          <View style={styles.footer}>
            <EditorButtonPressable onPress={save} style={styles.saveButton}>
              <Text style={styles.saveLabel}>Speichern</Text>
            </EditorButtonPressable>
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
        title={
          imagePickerField === "iconImage"
            ? widget?.type === "state"
              ? "State-Bild waehlen"
              : "Link-Icon waehlen"
            : widget?.type === "wallbox"
              ? "Wallbox-Hintergrund waehlen"
              : widget?.type === "heating"
                ? "Heizung-Hintergrund waehlen"
              : "Solar-Hintergrund waehlen"
        }
        helperText={
          imagePickerField === "iconImage"
            ? "Waehle eine Bilddatei aus dem Ordner `assets/`."
            : widget?.type === "wallbox"
              ? "Waehle ein Hintergrundbild. Drag&Drop, Datei-Upload und Browser-Auswahl sind verfuegbar."
              : widget?.type === "heating"
                ? "Waehle ein Hintergrundbild fuer das Heizungs-Widget. Drag&Drop und Datei-Upload sind verfuegbar."
              : "Verwendet den festen Ordner `assets/` im Adapter-Paket."
        }
        onClose={() => setImagePickerField(null)}
        onSelect={(entry) => {
          setDraft((current) => {
            if (imagePickerField === "iconImage") {
              return {
                ...current,
                iconImage: entry.name,
              };
            }
            if (widget?.type === "wallbox") {
              return {
                ...current,
                backgroundImage: entry.name,
              };
            }
            if (widget?.type === "heating") {
              return {
                ...current,
                backgroundImage: entry.name,
              };
            }
            return {
              ...current,
              backgroundMode: "image",
              backgroundImage: entry.name,
            };
          });
          setImagePickerField(null);
        }}
        selectedName={imagePickerField === "iconImage" ? draft.iconImage : draft.backgroundImage}
        visible={Boolean(imagePickerField)}
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

function EditorButtonPressable({
  children,
  onPress,
  style,
}: {
  children: React.ReactNode;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { config } = useDashboardConfig();

  return (
    <Pressable
      onPress={() => {
        playConfiguredUiSound(config.uiSounds?.pageSounds?.editorButton, "panel", "global:widgetEditorButtons");
        onPress();
      }}
      style={style}
    >
      {children}
    </Pressable>
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
        <EditorButtonPressable
          key={option}
          onPress={() => onSelect(option)}
          style={[styles.modeButton, value === option ? styles.modeButtonActive : null]}
        >
          <Text style={styles.modeLabel}>{option}</Text>
        </EditorButtonPressable>
      ))}
    </View>
  );
}

function CheckboxChoice({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const active = value !== "false";

  return (
    <EditorButtonPressable
      onPress={() => onChange(active ? "false" : "true")}
      style={[styles.checkboxChoice, active ? styles.checkboxChoiceActive : null]}
    >
      <MaterialCommunityIcons
        color={active ? palette.accent : palette.textMuted}
        name={active ? "checkbox-marked-outline" : "checkbox-blank-outline"}
        size={18}
      />
      <Text style={styles.checkboxChoiceLabel}>{label}</Text>
    </EditorButtonPressable>
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
      <EditorButtonPressable onPress={onBrowse} style={styles.stateBrowseButton}>
        <Text style={styles.stateBrowseLabel}>{browseLabel}</Text>
      </EditorButtonPressable>
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
              <EditorButtonPressable
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
              </EditorButtonPressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

function MiniNumberField({
  label,
  fieldKey,
  draft,
  setDraft,
}: {
  label: string;
  fieldKey: string;
  draft: Record<string, string>;
  setDraft: Dispatch<SetStateAction<Record<string, string>>>;
}) {
  return (
    <View style={styles.quadField}>
      <Text style={styles.quadLabel}>{label}</Text>
      <TextInput
        autoCapitalize="none"
        keyboardType="decimal-pad"
        onChangeText={(value) => setDraft((current) => ({ ...current, [fieldKey]: value }))}
        style={[styles.input, styles.quadInput]}
        value={draft[fieldKey] || ""}
      />
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

function clampIntMax(raw: string | undefined, fallback: number, min: number, max: number) {
  return Math.min(max, clampInt(raw, fallback, min));
}

function clampFloat(raw: string | undefined, fallback: number) {
  const parsed = Number.parseFloat(raw || "");
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return parsed;
}

function clampFloatRange(raw: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number.parseFloat(raw || "");
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

const SOLAR_STAT_LIMIT = 6;
const SOLAR_DEFAULT_STAT_LABELS = [
  "Eigenverbrauch",
  "Verbraucht",
  "Stat 3",
  "Stat 4",
  "Stat 5",
  "Stat 6",
];

function clampSolarStatCount(raw: string | number | undefined, fallback = 2) {
  const parsed = typeof raw === "number" ? raw : Number.parseInt(raw || "", 10);
  if (!Number.isFinite(parsed)) {
    return Math.max(1, Math.min(SOLAR_STAT_LIMIT, fallback));
  }
  return Math.max(1, Math.min(SOLAR_STAT_LIMIT, Math.round(parsed)));
}

function getSolarDefaultStatLabel(index: number) {
  return SOLAR_DEFAULT_STAT_LABELS[index] || `Stat ${index + 1}`;
}

function buildSolarStatEditorDraft(stats: Extract<WidgetConfig, { type: "solar" }>["stats"] | undefined) {
  const legacyCards = [stats?.first, stats?.second, stats?.third].filter(Boolean) as Array<{
    label: string;
    stateId?: string;
  }>;
  const sourceCards = Array.isArray(stats?.cards) && stats.cards.length ? stats.cards : legacyCards;
  const count = clampSolarStatCount(stats?.count, sourceCards.length || 2);
  const cards = Array.from({ length: SOLAR_STAT_LIMIT }, (_, index) => {
    const source = sourceCards[index];
    return {
      label: (source?.label || getSolarDefaultStatLabel(index)).trim() || getSolarDefaultStatLabel(index),
      stateId: (source?.stateId || "").trim(),
    };
  });

  return { count, cards };
}

function buildSolarStats(draft: Record<string, string>) {
  const count = clampSolarStatCount(draft.statCount);
  const cards = Array.from({ length: count }, (_, index) => {
    const item = index + 1;
    const label = (draft[`stat${item}Label`] || getSolarDefaultStatLabel(index)).trim() || getSolarDefaultStatLabel(index);
    const stateId = (draft[`stat${item}StateId`] || "").trim() || undefined;
    return { label, stateId };
  });

  return {
    count,
    cards,
    first: cards[0],
    second: cards[1],
    third: cards[2],
  };
}

function buildSolarTapAction(draft: Record<string, string>) {
  const tapType = draft.solarTapType;
  if (tapType === "dashboard") {
    const dashboardId = (draft.solarTapDashboardId || "").trim();
    if (!dashboardId) {
      return undefined;
    }
    return { type: "dashboard", dashboardId } as const;
  }
  if (tapType === "url") {
    const url = normalizeOptionalInput(draft.solarTapUrl);
    if (!url) {
      return undefined;
    }
    return { type: "url", url } as const;
  }
  return undefined;
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
    activeWidgetColor: appearance?.activeWidgetColor || "",
    activeWidgetColor2: appearance?.activeWidgetColor2 || "",
    inactiveWidgetColor: appearance?.inactiveWidgetColor || "",
    inactiveWidgetColor2: appearance?.inactiveWidgetColor2 || "",
    textColor: appearance?.textColor || widgetDefaults.textColor || "",
    mutedTextColor: appearance?.mutedTextColor || widgetDefaults.mutedTextColor || "",
    iconColor: appearance?.iconColor || widgetDefaults.iconColor || "",
    iconColor2: appearance?.iconColor2 || widgetDefaults.iconColor2 || "",
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
    activeWidgetColor: normalizeColor(draft.activeWidgetColor),
    activeWidgetColor2: normalizeColor(draft.activeWidgetColor2),
    inactiveWidgetColor: normalizeColor(draft.inactiveWidgetColor),
    inactiveWidgetColor2: normalizeColor(draft.inactiveWidgetColor2),
    textColor: normalizeColor(draft.textColor),
    mutedTextColor: normalizeColor(draft.mutedTextColor),
    iconColor: normalizeColor(draft.iconColor),
    iconColor2: normalizeColor(draft.iconColor2),
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
      iconColor: palette.accent,
      iconColor2: palette.textMuted,
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

  if (widget.type === "numpad") {
    return {
      widgetColor: "#d8bea7",
      widgetColor2: "#ad7a52",
      textColor: "#1f1207",
      mutedTextColor: "#5b3d27",
      cardColor: "#040404",
      cardColor2: "#c79e7a",
    };
  }

  if (widget.type === "link") {
    return {
      widgetColor: "rgba(18, 42, 78, 0.95)",
      widgetColor2: "rgba(10, 24, 46, 0.98)",
      textColor: palette.text,
      mutedTextColor: palette.textMuted,
      cardColor: "rgba(8, 18, 36, 0.72)",
      cardColor2: "rgba(24, 48, 86, 0.8)",
    };
  }

  if (widget.type === "log") {
    return {
      widgetColor: "rgba(11, 22, 44, 0.95)",
      widgetColor2: "rgba(6, 12, 25, 0.97)",
      textColor: palette.text,
      mutedTextColor: palette.textMuted,
      cardColor: "rgba(5, 9, 17, 0.7)",
      cardColor2: "rgba(16, 30, 56, 0.8)",
    };
  }

  if (widget.type === "script") {
    return {
      widgetColor: "rgba(20, 40, 76, 0.95)",
      widgetColor2: "rgba(8, 18, 38, 0.98)",
      textColor: palette.text,
      mutedTextColor: palette.textMuted,
      cardColor: "rgba(7, 14, 29, 0.72)",
      cardColor2: "rgba(20, 42, 82, 0.82)",
    };
  }

  if (widget.type === "host") {
    return {
      widgetColor: "rgba(15, 34, 66, 0.95)",
      widgetColor2: "rgba(8, 18, 36, 0.98)",
      textColor: palette.text,
      mutedTextColor: palette.textMuted,
      cardColor: "#6ce8b4",
      cardColor2: "rgba(255,255,255,0.12)",
      pvCardColor: "#73b9ff",
      homeCardColor: "rgba(255,255,255,0.12)",
      activeWidgetColor: "#65d6ff",
      activeWidgetColor2: "#4d86ff",
      inactiveWidgetColor: "#ffcb67",
      inactiveWidgetColor2: "#ff7f66",
      statColor: "rgba(130, 182, 255, 0.24)",
      statColor2: "rgba(89, 132, 238, 0.18)",
    };
  }

  if (widget.type === "wallbox") {
    return {
      widgetColor: "rgba(20, 30, 44, 0.96)",
      widgetColor2: "rgba(12, 18, 30, 0.98)",
      textColor: "#f5f8ff",
      mutedTextColor: "rgba(214, 224, 244, 0.75)",
      cardColor: "rgba(166, 176, 194, 0.2)",
      cardColor2: "rgba(123, 135, 158, 0.2)",
      activeWidgetColor: "#3bbd83",
      activeWidgetColor2: "#2f976c",
      statColor: "#5f9eff",
      statColor2: "#4578e6",
      iconColor: "#7eb9ff",
      iconColor2: "#5f8cf0",
      inactiveWidgetColor: "#f5bd6c",
      inactiveWidgetColor2: "#e69b56",
    };
  }

  if (widget.type === "heating") {
    return {
      widgetColor: "rgba(18, 28, 42, 0.96)",
      widgetColor2: "rgba(10, 16, 27, 0.98)",
      textColor: "#f5f8ff",
      mutedTextColor: "rgba(214, 224, 244, 0.78)",
      cardColor: "rgba(255,255,255,0.035)",
      iconColor: "#79b5ff",
      iconColor2: "#5a85ef",
      activeWidgetColor: "#f6c869",
      activeWidgetColor2: "#4ed09a",
      statColor: "#7fb9ff",
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
        <EditorButtonPressable onPress={() => onChange("transparent")} style={styles.colorActionButton}>
          <Text style={styles.colorActionLabel}>Transparent</Text>
        </EditorButtonPressable>
        <EditorButtonPressable onPress={() => onChange("")} style={styles.colorActionButton}>
          <Text style={styles.colorActionLabel}>Reset</Text>
        </EditorButtonPressable>
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

function normalizeLogSeverity(raw: string | undefined) {
  if (raw === "silly" || raw === "debug" || raw === "warn" || raw === "error") {
    return raw;
  }
  return "info";
}

function normalizeCameraSourceMode(raw: string | undefined) {
  if (raw === "mjpeg" || raw === "flv" || raw === "fmp4") {
    return raw;
  }
  return "snapshot";
}

function getCameraUrlByMode(
  draft: Record<string, string>,
  mode: "snapshot" | "mjpeg" | "flv" | "fmp4"
) {
  if (mode === "snapshot") {
    return draft.snapshotUrl || "";
  }
  if (mode === "mjpeg") {
    return draft.mjpegUrl || "";
  }
  if (mode === "flv") {
    return draft.flvUrl || "";
  }
  return draft.fmp4Url || "";
}

function setCameraUrlByMode(
  draft: Record<string, string>,
  mode: "snapshot" | "mjpeg" | "flv" | "fmp4",
  value: string
) {
  if (mode === "snapshot") {
    return { ...draft, snapshotUrl: value };
  }
  if (mode === "mjpeg") {
    return { ...draft, mjpegUrl: value };
  }
  if (mode === "flv") {
    return { ...draft, flvUrl: value };
  }
  return { ...draft, fmp4Url: value };
}

function normalizeOptionalInput(value: string | undefined) {
  const normalized = (value || "").trim();
  return normalized || undefined;
}

function normalizeHeatingOneTimeIcon(value: string | undefined) {
  const normalized = (value || "").trim();
  if (!normalized) {
    return "shower-head";
  }
  if (normalized === "flash" || normalized === "flash-outline") {
    return "shower-head";
  }
  return normalized;
}

function normalizeAddonMode(raw: string | undefined) {
  if (raw === "circle" || raw === "text" || raw === "icon" || raw === "bars") {
    return raw;
  }
  return "none";
}

function normalizeIconImageCrop(raw: string | undefined) {
  if (raw === "rounded" || raw === "circle") {
    return raw;
  }
  return "none";
}

function normalizeIconImageSizeMode(raw: string | undefined) {
  if (raw === "maximized") {
    return raw;
  }
  return "standard";
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

function buildStoredInteractionSounds(
  widgetType: WidgetConfig["type"],
  draft: Record<string, string[]>,
  defaults?: WidgetInteractionSounds
) {
  if (
    widgetType !== "state" &&
    widgetType !== "camera" &&
    widgetType !== "grafana" &&
    widgetType !== "numpad" &&
    widgetType !== "link" &&
    widgetType !== "log" &&
    widgetType !== "script" &&
    widgetType !== "wallbox" &&
    widgetType !== "heating"
  ) {
    return undefined;
  }

  const next: WidgetInteractionSounds = {};
  const press = normalizeSoundSelection(draft.press);
  const confirm = normalizeSoundSelection(draft.confirm);
  const slider = normalizeSoundSelection(draft.slider);
  const open = normalizeSoundSelection(draft.open);
  const close = normalizeSoundSelection(draft.close);
  const scroll = normalizeSoundSelection(draft.scroll);
  const notify = normalizeSoundSelection(draft.notify);
  const notifyWarn = normalizeSoundSelection(draft.notifyWarn);
  const notifyError = normalizeSoundSelection(draft.notifyError);

  if (!areSoundSelectionsEqual(press, defaults?.press)) {
    next.press = press;
  }
  if (!areSoundSelectionsEqual(confirm, defaults?.confirm)) {
    next.confirm = confirm;
  }
  if (!areSoundSelectionsEqual(slider, defaults?.slider)) {
    next.slider = slider;
  }
  if (!areSoundSelectionsEqual(open, defaults?.open)) {
    next.open = open;
  }
  if (!areSoundSelectionsEqual(close, defaults?.close)) {
    next.close = close;
  }
  if (!areSoundSelectionsEqual(scroll, defaults?.scroll)) {
    next.scroll = scroll;
  }
  if (!areSoundSelectionsEqual(notify, defaults?.notify)) {
    next.notify = notify;
  }
  if (!areSoundSelectionsEqual(notifyWarn, defaults?.notifyWarn)) {
    next.notifyWarn = notifyWarn;
  }
  if (!areSoundSelectionsEqual(notifyError, defaults?.notifyError)) {
    next.notifyError = notifyError;
  }

  return Object.keys(next).length ? next : undefined;
}

function areSoundSelectionsEqual(left?: string[], right?: string[]) {
  const normalizedLeft = normalizeSoundSelection(left);
  const normalizedRight = normalizeSoundSelection(right);

  if (normalizedLeft.length !== normalizedRight.length) {
    return false;
  }

  return normalizedLeft.every((value, index) => value === normalizedRight[index]);
}

function resolveDraftSoundValue(primary?: string[], fallback?: string[]) {
  const normalizedPrimary = normalizeSoundSelection(primary);
  if (normalizedPrimary.length) {
    return normalizedPrimary;
  }

  return normalizeSoundSelection(fallback);
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
  weatherSuggestionList: {
    marginTop: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: "rgba(255,255,255,0.03)",
    overflow: "hidden",
  },
  weatherSuggestionItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
    gap: 2,
  },
  weatherSuggestionLabel: {
    color: palette.text,
    fontWeight: "700",
  },
  weatherSuggestionMeta: {
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
  inlineActionButton: {
    marginTop: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(92, 124, 255, 0.24)",
    backgroundColor: "rgba(92, 124, 255, 0.12)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: "center",
  },
  inlineActionLabel: {
    color: palette.text,
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
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
  quadRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  quadField: {
    flex: 1,
  },
  quadLabel: {
    color: palette.textMuted,
    fontSize: 12,
    marginBottom: 6,
  },
  quadInput: {
    minWidth: 0,
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
  disabledInput: {
    opacity: 0.55,
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
  checkboxChoice: {
    flex: 1,
    minHeight: 40,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 9,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: palette.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  checkboxChoiceActive: {
    borderColor: "rgba(92,124,255,0.38)",
    backgroundColor: "rgba(92,124,255,0.12)",
  },
  checkboxChoiceLabel: {
    color: palette.text,
    fontWeight: "700",
    fontSize: 12,
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
