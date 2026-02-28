import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Image, Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { CameraWidgetConfig } from "../../types/dashboard";
import { palette } from "../../utils/theme";

type CameraWidgetProps = {
  config: CameraWidgetConfig;
};

export function CameraWidget({ config }: CameraWidgetProps) {
  const [tick, setTick] = useState(0);
  const [displayUrl, setDisplayUrl] = useState<string | null>(null);
  const [overlayUrl, setOverlayUrl] = useState<string | null>(null);
  const overlayOpacity = useRef(new Animated.Value(0)).current;
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

  useEffect(() => {
    if (!snapshotUrl) {
      setDisplayUrl(null);
      setOverlayUrl(null);
      return;
    }

    let active = true;

    if (!displayUrl) {
      setDisplayUrl(snapshotUrl);
      return () => {
        active = false;
      };
    }

    preloadSnapshot(snapshotUrl)
      .then(() => {
        if (active) {
          overlayOpacity.setValue(0);
          setOverlayUrl(snapshotUrl);
          Animated.timing(overlayOpacity, {
            toValue: 1,
            duration: 220,
            useNativeDriver: true,
          }).start(() => {
            setDisplayUrl(snapshotUrl);
            setOverlayUrl(null);
            overlayOpacity.setValue(0);
          });
        }
      })
      .catch(() => {
        if (active) {
          setDisplayUrl(snapshotUrl);
          setOverlayUrl(null);
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
            <Image resizeMode="contain" source={{ uri: displayUrl }} style={styles.image} />
            {overlayUrl ? (
              <Animated.Image
                resizeMode="contain"
                source={{ uri: overlayUrl }}
                style={[styles.image, styles.overlayImage, { opacity: overlayOpacity }]}
              />
            ) : null}
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

async function preloadSnapshot(uri: string) {
  if (Platform.OS === "web" && typeof window !== "undefined" && typeof window.Image === "function") {
    await new Promise<void>((resolve, reject) => {
      const img = new window.Image();
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Snapshot preload failed"));
      img.src = uri;
    });
    return;
  }

  await Image.prefetch(uri);
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
    backgroundColor: "rgba(2,6,12,0.55)",
  },
  snapshotWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
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
