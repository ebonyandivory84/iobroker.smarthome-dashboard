import { useEffect, useMemo, useState } from "react";
import { Image, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { CameraWidgetConfig } from "../../types/dashboard";
import { palette } from "../../utils/theme";

type CameraWidgetProps = {
  config: CameraWidgetConfig;
};

export function CameraWidget({ config }: CameraWidgetProps) {
  const [tick, setTick] = useState(0);
  const textColor = config.appearance?.textColor || palette.text;
  const mutedTextColor = config.appearance?.mutedTextColor || palette.textMuted;

  useEffect(() => {
    const timer = setInterval(() => setTick((current) => current + 1), config.refreshMs || 2000);
    return () => clearInterval(timer);
  }, [config.refreshMs]);

  const snapshotUrl = useMemo(() => {
    if (!config.snapshotUrl) {
      return null;
    }
    const separator = config.snapshotUrl.includes("?") ? "&" : "?";
    return `${config.snapshotUrl}${separator}t=${tick}`;
  }, [config.snapshotUrl, tick]);

  return (
    <View style={styles.container}>
      <View style={styles.preview}>
        {snapshotUrl ? (
          <View style={styles.snapshotWrap}>
            <Image resizeMode="cover" source={{ uri: snapshotUrl }} style={styles.image} />
          </View>
        ) : (
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: mutedTextColor }]}>Kein Snapshot konfiguriert</Text>
          </View>
        )}
      </View>
      {!config.snapshotUrl && !config.rtspUrl ? (
        <Text style={[styles.hint, { color: mutedTextColor }]}>Widget ist noch nicht konfiguriert.</Text>
      ) : null}
      {config.rtspUrl ? (
        <Pressable onPress={() => Linking.openURL(config.rtspUrl!)} style={styles.button}>
          <Text style={[styles.buttonLabel, { color: textColor }]}>RTSP Stream oeffnen</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  preview: {
    flex: 1,
    minHeight: 120,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  snapshotWrap: {
    flex: 1,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    color: palette.textMuted,
  },
  hint: {
    marginTop: 10,
    color: palette.danger,
    fontSize: 12,
  },
  button: {
    marginTop: 12,
    borderRadius: 14,
    alignItems: "center",
    paddingVertical: 10,
    backgroundColor: "rgba(77, 226, 177, 0.16)",
  },
  buttonLabel: {
    color: palette.text,
    fontWeight: "700",
  },
});
