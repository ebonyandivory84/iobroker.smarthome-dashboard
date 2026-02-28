import { createElement, useEffect, useMemo, useState } from "react";
import { Image, Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { CameraWidgetConfig } from "../../types/dashboard";
import { palette } from "../../utils/theme";

type CameraWidgetProps = {
  config: CameraWidgetConfig;
};

export function CameraWidget({ config }: CameraWidgetProps) {
  const [tick, setTick] = useState(0);
  const [displayUrl, setDisplayUrl] = useState<string | null>(null);
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
    return `${config.snapshotUrl}${separator}t=${tick}&widget=${encodeURIComponent(config.id)}`;
  }, [config.id, config.snapshotUrl, tick]);

  useEffect(() => {
    if (!snapshotUrl) {
      setDisplayUrl(null);
      return;
    }

    let active = true;

    if (!displayUrl) {
      setDisplayUrl(snapshotUrl);
      return () => {
        active = false;
      };
    }

    if (Platform.OS === "web") {
      setDisplayUrl(snapshotUrl);
      return () => {
        active = false;
      };
    }

    preloadSnapshot(snapshotUrl)
      .then(() => {
        if (active) {
          setDisplayUrl(snapshotUrl);
        }
      })
      .catch(() => {
        if (active) {
          setDisplayUrl(snapshotUrl);
        }
      });

    return () => {
      active = false;
    };
  }, [displayUrl, snapshotUrl]);

  return (
    <View style={styles.container}>
      <View style={styles.preview}>
        {displayUrl ? (
          <View style={styles.snapshotWrap}>
            {Platform.OS === "web"
              ? createElement("img", {
                  alt: config.title || "Camera snapshot",
                  draggable: false,
                  src: displayUrl,
                  style: webImageStyle,
                })
              : (
                  <Image resizeMode="contain" source={{ uri: displayUrl }} style={styles.image} />
                )}
            {config.showTitle !== false && config.title ? (
              <View style={styles.titleBadge}>
                <Text numberOfLines={1} style={[styles.titleBadgeLabel, { color: textColor }]}>
                  {config.title}
                </Text>
              </View>
            ) : null}
          </View>
        ) : (
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: mutedTextColor }]}>Kein Snapshot konfiguriert</Text>
          </View>
        )}
      </View>
      {!displayUrl && !config.snapshotUrl && !config.rtspUrl ? (
        <Text style={[styles.hint, { color: mutedTextColor }]}>Widget ist noch nicht konfiguriert.</Text>
      ) : null}
      {config.rtspUrl && !displayUrl ? (
        <Pressable onPress={() => Linking.openURL(config.rtspUrl!)} style={styles.button}>
          <Text style={[styles.buttonLabel, { color: textColor }]}>RTSP Stream oeffnen</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

async function preloadSnapshot(uri: string) {
  await Image.prefetch(uri);
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: "hidden",
  },
  preview: {
    flex: 1,
    minHeight: 120,
    borderRadius: 0,
    overflow: "hidden",
    backgroundColor: "#000000",
  },
  snapshotWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  titleBadge: {
    position: "absolute",
    left: 14,
    top: 14,
    maxWidth: "72%",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: "rgba(4, 8, 14, 0.44)",
  },
  titleBadgeLabel: {
    color: palette.text,
    fontSize: 14,
    fontWeight: "700",
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

const webImageStyle = {
  width: "100%",
  height: "100%",
  objectFit: "contain",
  display: "block",
  backgroundColor: "#000000",
} as const;
