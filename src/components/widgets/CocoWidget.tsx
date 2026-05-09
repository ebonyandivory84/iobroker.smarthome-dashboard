import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import { Image, Modal, Pressable, StyleSheet, Text, View, type DimensionValue } from "react-native";
import { IoBrokerClient } from "../../services/iobroker";
import { CocoWidgetConfig, StateSnapshot } from "../../types/dashboard";
import { palette } from "../../utils/theme";
import { playConfiguredUiSound } from "../../utils/uiSounds";

type CocoWidgetProps = {
  client: IoBrokerClient;
  config: CocoWidgetConfig;
  states: StateSnapshot;
};

type LockOption = {
  key: "unlocked" | "inOnly" | "outOnly" | "locked";
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  value: string;
};

export function CocoWidget({ client, config, states }: CocoWidgetProps) {
  const [now, setNow] = useState(Date.now());
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const [pendingLock, setPendingLock] = useState<string | null>(null);
  const catName = config.catName?.trim() || config.title || "Coco";
  const textColor = config.appearance?.textColor || "#f5f8ff";
  const mutedTextColor = config.appearance?.mutedTextColor || "rgba(214, 224, 244, 0.76)";
  const cardColor = config.appearance?.cardColor || "rgba(255,255,255,0.05)";
  const accent = config.appearance?.activeWidgetColor || "#58d68d";
  const warn = config.appearance?.inactiveWidgetColor || "#f2bd66";
  const inside = parseBooleanState(states[config.insideStateId]);
  const lastTime = parseDate(states[config.lastTimeStateId]);
  const battery = config.flapBatteryStateId ? parseNumber(states[config.flapBatteryStateId]) : null;
  const flapOnline = config.flapOnlineStateId ? parseBooleanState(states[config.flapOnlineStateId]) : null;
  const hubOnline = config.hubOnlineStateId ? parseBooleanState(states[config.hubOnlineStateId]) : null;
  const adapterConnected = config.adapterConnectedStateId ? parseBooleanState(states[config.adapterConnectedStateId]) : null;
  const allDevicesOnline = config.allDevicesOnlineStateId ? parseBooleanState(states[config.allDevicesOnlineStateId]) : null;
  const offlineDevices = config.offlineDevicesStateId ? stringifyState(states[config.offlineDevicesStateId]) : "";
  const timesOutside = config.timesOutsideStateId ? parseNumber(states[config.timesOutsideStateId]) : null;
  const timeSpentOutside = config.timeSpentOutsideStateId ? parseNumber(states[config.timeSpentOutsideStateId]) : null;
  const lockModeValue = config.lockModeStateId ? states[config.lockModeStateId] : undefined;
  const lockOptions = useMemo(() => buildLockOptions(config), [config]);
  const snapshotUrl = (config.snapshotUrl || "").trim();
  const snapshotUri = snapshotUrl ? appendCacheBuster(snapshotUrl, now) : "";
  const locationLabel = inside === null ? "Unbekannt" : inside ? "Drinnen" : "Draußen";
  const locationIcon = inside === false ? "weather-night" : "home-heart";
  const statusSince = lastTime ? formatDuration((now - lastTime.getTime()) / 1000) : "keine Zeit";
  const onlineOk = [flapOnline, hubOnline, adapterConnected, allDevicesOnline].every((value) => value !== false);
  const activeLockKey = resolveActiveLockKey(lockOptions, lockModeValue);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), Math.max(1000, config.refreshMs || 30000));
    return () => clearInterval(timer);
  }, [config.refreshMs]);

  useEffect(() => {
    if (!pendingLock) {
      return;
    }
    if (activeLockKey === pendingLock) {
      playConfiguredUiSound(config.interactionSounds?.confirm, "toggle", `${config.id}:lock-confirm:${pendingLock}`);
      setPendingLock(null);
    }
  }, [activeLockKey, config.id, config.interactionSounds?.confirm, pendingLock]);

  const writeLockMode = async (option: LockOption) => {
    const writeStateId = (config.lockWriteStateId || config.lockModeStateId || "").trim();
    if (!writeStateId) {
      return;
    }

    playConfiguredUiSound(config.interactionSounds?.press, "tap", `${config.id}:lock:${option.key}`);
    setPendingLock(option.key);
    await client.writeState(writeStateId, parseLockValue(config, option.value));
    if (!config.lockModeStateId) {
      playConfiguredUiSound(config.interactionSounds?.confirm, "toggle", `${config.id}:lock-confirm:${option.key}`);
      setPendingLock(null);
    }
  };

  const openSnapshot = () => {
    if (!snapshotUri) {
      return;
    }
    playConfiguredUiSound(config.interactionSounds?.open || config.interactionSounds?.press, "tap", `${config.id}:snapshot-open`);
    setFullscreenOpen(true);
  };

  const closeSnapshot = () => {
    playConfiguredUiSound(config.interactionSounds?.close, "close", `${config.id}:snapshot-close`);
    setFullscreenOpen(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.locationBlock}>
          <View style={[styles.locationIcon, { backgroundColor: inside === false ? warn : accent }]}>
            <MaterialCommunityIcons color="#07111e" name={locationIcon} size={24} />
          </View>
          <View style={styles.headerText}>
            <Text numberOfLines={1} style={[styles.name, { color: textColor }]}>{catName}</Text>
            <Text numberOfLines={1} style={[styles.location, { color: mutedTextColor }]}>
              {locationLabel} seit {statusSince}
            </Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <BatteryPill value={battery} />
          <StatusPill online={onlineOk} />
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.overviewRow}>
          <View style={styles.metricCards}>
            <MetricCard
              backgroundColor={cardColor}
              color={textColor}
              icon="paw"
              label="Heute raus"
              muted={mutedTextColor}
              value={timesOutside === null ? "-" : `${Math.round(timesOutside)}x`}
            />
            <MetricCard
              backgroundColor={cardColor}
              color={textColor}
              icon="timer-outline"
              label="Draußen gesamt"
              muted={mutedTextColor}
              value={timeSpentOutside === null ? "-" : formatDuration(timeSpentOutside)}
            />
          </View>

          <Pressable onPress={openSnapshot} style={[styles.snapshot, { backgroundColor: cardColor }]}>
            {snapshotUri ? (
              <Image resizeMode="cover" source={{ uri: snapshotUri }} style={styles.snapshotImage} />
            ) : (
              <View style={styles.snapshotPlaceholder}>
                <MaterialCommunityIcons color={mutedTextColor} name="camera-off-outline" size={24} />
              </View>
            )}
            <View style={styles.snapshotBadge}>
              <MaterialCommunityIcons color={textColor} name="arrow-expand-all" size={14} />
            </View>
          </Pressable>
        </View>

        <View style={styles.lockRow}>
          {lockOptions.map((option) => {
            const active = activeLockKey === option.key;
            const pending = pendingLock === option.key;
            return (
              <Pressable
                key={option.key}
                onPress={() => void writeLockMode(option)}
                style={[
                  styles.lockButton,
                  { backgroundColor: active ? accent : "rgba(255,255,255,0.045)" },
                  pending ? styles.lockButtonPending : null,
                ]}
              >
                <MaterialCommunityIcons color={active ? "#07111e" : textColor} name={option.icon} size={18} />
                <Text numberOfLines={1} style={[styles.lockLabel, { color: active ? "#07111e" : textColor }]}>
                  {pending ? "..." : option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {!onlineOk ? (
        <Text numberOfLines={1} style={[styles.warning, { color: warn }]}>
          Offline: {offlineDevices || "SureFlap Status pruefen"}
        </Text>
      ) : null}

      <Modal animationType="fade" transparent visible={fullscreenOpen}>
        <View style={styles.fullscreenBackdrop}>
          <Pressable onPress={closeSnapshot} style={styles.fullscreenClose}>
            <MaterialCommunityIcons color="#fff" name="close" size={28} />
          </Pressable>
          {snapshotUri ? <Image resizeMode="contain" source={{ uri: snapshotUri }} style={styles.fullscreenImage} /> : null}
        </View>
      </Modal>
    </View>
  );
}

function MetricCard({
  backgroundColor,
  color,
  icon,
  label,
  muted,
  value,
}: {
  backgroundColor: string;
  color: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  muted: string;
  value: string;
}) {
  return (
    <View style={[styles.metricCard, { backgroundColor }]}>
      <View style={styles.metricHeader}>
        <MaterialCommunityIcons color={muted} name={icon} size={15} />
        <Text numberOfLines={1} style={[styles.metricLabel, { color: muted }]}>{label}</Text>
      </View>
      <Text numberOfLines={1} style={[styles.metricValue, { color }]}>{value}</Text>
    </View>
  );
}

function BatteryPill({ value }: { value: number | null }) {
  const level = value === null ? null : Math.max(0, Math.min(100, Math.round(value)));
  const color = resolveBatteryColor(level);
  const fillWidth = `${level ?? 0}%` as DimensionValue;

  return (
    <View style={[styles.batteryPill, { backgroundColor: withAlpha(color, 0.16) }]}>
      <View style={[styles.batteryIcon, { borderColor: color }]}>
        <View style={[styles.batteryFill, { backgroundColor: color, width: fillWidth }]} />
      </View>
      <View style={[styles.batteryTip, { backgroundColor: color }]} />
      <Text style={[styles.batteryText, { color }]}>{level === null ? "-" : `${level}%`}</Text>
    </View>
  );
}

function StatusPill({ online }: { online: boolean }) {
  return (
    <View style={[styles.statusPill, { backgroundColor: online ? "rgba(88,214,141,0.16)" : "rgba(255,107,122,0.16)" }]}>
      <View style={[styles.statusDot, { backgroundColor: online ? palette.success : palette.danger }]} />
      <Text style={[styles.statusText, { color: online ? palette.success : palette.danger }]}>{online ? "Online" : "Warnung"}</Text>
    </View>
  );
}

function buildLockOptions(config: CocoWidgetConfig): LockOption[] {
  return [
    { key: "unlocked", label: "Offen", icon: "lock-open-variant-outline", value: config.lockUnlockedValue || "0" },
    { key: "inOnly", label: "Rein", icon: "login-variant", value: config.lockInOnlyValue || "1" },
    { key: "outOnly", label: "Raus", icon: "logout-variant", value: config.lockOutOnlyValue || "2" },
    { key: "locked", label: "Zu", icon: "lock-outline", value: config.lockLockedValue || "3" },
  ];
}

function resolveActiveLockKey(options: LockOption[], value: unknown) {
  const normalized = normalizeComparable(value);
  return options.find((option) => normalizeComparable(option.value) === normalized)?.key || null;
}

function parseLockValue(config: CocoWidgetConfig, value: string) {
  if ((config.lockValueType || "number") === "string") {
    return value;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
}

function parseBooleanState(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "boolean") {
    return value;
  }
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "on", "online"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no", "off", "offline"].includes(normalized)) {
    return false;
  }
  return Boolean(value);
}

function parseNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDate(value: unknown) {
  if (!value) {
    return null;
  }
  const date = new Date(value as string | number | Date);
  return Number.isNaN(date.getTime()) ? null : date;
}

function stringifyState(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}

function normalizeComparable(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function appendCacheBuster(url: string, now: number) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}_=${Math.floor(now / 1000)}`;
}

function formatDuration(secondsRaw: number) {
  const totalMinutes = Math.max(0, Math.round(Number(secondsRaw || 0) / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) {
    return `${minutes} Min.`;
  }
  if (minutes <= 0) {
    return `${hours} Std.`;
  }
  return `${hours} Std. ${minutes} Min.`;
}

function resolveBatteryColor(level: number | null) {
  if (level === null) {
    return "rgba(214, 224, 244, 0.76)";
  }
  if (level >= 55) {
    return "#58d68d";
  }
  if (level >= 35) {
    return "#f3d46b";
  }
  if (level >= 20) {
    return "#f59e42";
  }
  return palette.danger;
}

function withAlpha(color: string, alpha: number) {
  if (!color.startsWith("#") || color.length !== 7) {
    return color;
  }
  const r = Number.parseInt(color.slice(1, 3), 16);
  const g = Number.parseInt(color.slice(3, 5), 16);
  const b = Number.parseInt(color.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    gap: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  locationBlock: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  locationIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  name: {
    fontSize: 20,
    fontWeight: "900",
  },
  location: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: "700",
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "900",
  },
  batteryPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  batteryIcon: {
    width: 23,
    height: 12,
    borderRadius: 3,
    borderWidth: 2,
    overflow: "hidden",
    padding: 1,
  },
  batteryFill: {
    height: "100%",
    borderRadius: 1,
  },
  batteryTip: {
    width: 3,
    height: 7,
    borderRadius: 2,
    marginLeft: -3,
  },
  batteryText: {
    fontSize: 11,
    fontWeight: "900",
  },
  body: {
    flexGrow: 1,
    minHeight: 0,
    gap: 12,
  },
  overviewRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 12,
  },
  metricCards: {
    flex: 1,
    minWidth: 0,
    gap: 10,
  },
  metricCard: {
    flex: 1,
    minHeight: 72,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  metricHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  metricValue: {
    marginTop: 8,
    fontSize: 20,
    fontWeight: "900",
  },
  lockRow: {
    flexDirection: "row",
    gap: 8,
  },
  lockButton: {
    flex: 1,
    minWidth: 0,
    minHeight: 50,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  lockButtonPending: {
    opacity: 0.72,
  },
  lockLabel: {
    fontSize: 11,
    fontWeight: "900",
  },
  snapshot: {
    flex: 1.35,
    minWidth: 210,
    aspectRatio: 16 / 9,
    borderRadius: 8,
    overflow: "hidden",
  },
  snapshotImage: {
    width: "100%",
    height: "100%",
  },
  snapshotPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  snapshotBadge: {
    position: "absolute",
    right: 7,
    bottom: 7,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.52)",
  },
  warning: {
    fontSize: 11,
    fontWeight: "800",
  },
  fullscreenBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.94)",
    alignItems: "center",
    justifyContent: "center",
  },
  fullscreenClose: {
    position: "absolute",
    top: 22,
    right: 22,
    zIndex: 2,
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  fullscreenImage: {
    width: "100%",
    height: "100%",
  },
});
