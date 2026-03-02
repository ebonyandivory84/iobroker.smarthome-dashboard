import { createElement, useEffect, useMemo, useRef, useState } from "react";
import { Image, Linking, Modal, PanResponder, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { CameraWidgetConfig } from "../../types/dashboard";
import { palette } from "../../utils/theme";

type CameraWidgetProps = {
  config: CameraWidgetConfig;
  onAspectRatioDetected?: (ratio: number) => void;
};

export function CameraWidget({ config, onAspectRatioDetected }: CameraWidgetProps) {
  const [tick, setTick] = useState(0);
  const [displayUrl, setDisplayUrl] = useState<string | null>(null);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const hasReportedAspectRatio = useRef(Boolean(config.snapshotAspectRatio));
  const textColor = config.appearance?.textColor || palette.text;
  const mutedTextColor = config.appearance?.mutedTextColor || palette.textMuted;
  const fullscreenPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gestureState) =>
          Math.abs(gestureState.dy) > 12 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
        onPanResponderRelease: (_event, gestureState) => {
          if (gestureState.dy > 80 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx)) {
            setFullscreenOpen(false);
          }
        },
      }),
    []
  );

  useEffect(() => {
    const timer = setInterval(() => setTick((current) => current + 1), config.refreshMs || 2000);
    return () => clearInterval(timer);
  }, [config.refreshMs]);

  const reportAspectRatio = (width: number, height: number) => {
    if (!onAspectRatioDetected || hasReportedAspectRatio.current || !width || !height) {
      return;
    }

    const ratio = width / height;
    if (!Number.isFinite(ratio) || ratio <= 0) {
      return;
    }

    hasReportedAspectRatio.current = true;
    onAspectRatioDetected(ratio);
  };

  const snapshotUrl = useMemo(() => {
    if (!config.snapshotUrl) {
      return null;
    }
    if (Platform.OS === "web" && typeof window !== "undefined" && window.location.pathname.includes("/smarthome-dashboard")) {
      const proxyBase = `${window.location.origin}/smarthome-dashboard/api/camera-snapshot`;
      return `${proxyBase}?url=${encodeURIComponent(config.snapshotUrl)}&t=${tick}`;
    }
    const separator = config.snapshotUrl.includes("?") ? "&" : "?";
    return `${config.snapshotUrl}${separator}t=${tick}`;
  }, [config.snapshotUrl, tick]);

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
    <>
      <View style={styles.container}>
        <Pressable
          disabled={!displayUrl}
          onPress={() => setFullscreenOpen(true)}
          style={styles.preview}
        >
        {displayUrl ? (
          <View style={styles.snapshotWrap}>
            {Platform.OS === "web"
              ? createElement("img", {
                  alt: config.title || "Camera snapshot",
                  draggable: false,
                  onLoad: (event: Event) => {
                    const target = event.currentTarget as HTMLImageElement | null;
                    if (!target) {
                      return;
                    }
                    reportAspectRatio(target.naturalWidth, target.naturalHeight);
                  },
                  src: displayUrl,
                  style: webImageStyle,
                })
              : (
                  <Image
                    onLoad={(event) => {
                      const source = event.nativeEvent.source;
                      if (!source) {
                        return;
                      }
                      reportAspectRatio(source.width, source.height);
                    }}
                    resizeMode="contain"
                    source={{ uri: displayUrl }}
                    style={styles.image}
                  />
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
        </Pressable>
        {!displayUrl && !config.snapshotUrl && !config.rtspUrl ? (
          <Text style={[styles.hint, { color: mutedTextColor }]}>Widget ist noch nicht konfiguriert.</Text>
        ) : null}
        {config.rtspUrl && !displayUrl ? (
          <Pressable onPress={() => Linking.openURL(config.rtspUrl!)} style={styles.button}>
            <Text style={[styles.buttonLabel, { color: textColor }]}>RTSP Stream oeffnen</Text>
          </Pressable>
        ) : null}
      </View>
      <Modal animationType={Platform.OS === "web" ? "fade" : "none"} transparent visible={fullscreenOpen}>
        <View style={styles.fullscreenBackdrop}>
          <Pressable onPress={() => setFullscreenOpen(false)} style={styles.fullscreenClose}>
            <Text style={styles.fullscreenCloseLabel}>X</Text>
          </Pressable>
          <View {...fullscreenPanResponder.panHandlers} style={styles.fullscreenStage}>
            {displayUrl
              ? Platform.OS === "web"
                ? createElement("img", {
                    alt: config.title || "Camera snapshot fullscreen",
                    draggable: false,
                    src: displayUrl,
                    style: fullscreenWebImageStyle,
                  })
                : (
                    <Image resizeMode="contain" source={{ uri: displayUrl }} style={styles.fullscreenImage} />
                  )
              : null}
          </View>
          {config.showTitle !== false && config.title ? (
            <View style={styles.fullscreenTitle}>
              <Text style={[styles.titleBadgeLabel, { color: textColor }]}>{config.title}</Text>
            </View>
          ) : null}
        </View>
      </Modal>
    </>
  );
}

async function preloadSnapshot(uri: string) {
  if (Platform.OS === "web" && typeof window !== "undefined") {
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
    ...(Platform.OS === "web"
      ? {
          isolation: "isolate" as const,
        }
      : null),
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
  fullscreenBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.96)",
    justifyContent: "center",
    alignItems: "center",
  },
  fullscreenStage: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  fullscreenImage: {
    width: "100%",
    height: "100%",
  },
  fullscreenClose: {
    position: "absolute",
    top: 24,
    right: 24,
    zIndex: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(4, 8, 14, 0.54)",
  },
  fullscreenCloseLabel: {
    color: palette.text,
    fontSize: 18,
    fontWeight: "800",
  },
  fullscreenTitle: {
    position: "absolute",
    top: 24,
    left: 24,
    maxWidth: "72%",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: "rgba(4, 8, 14, 0.44)",
  },
});

const webImageStyle = {
  width: "100%",
  height: "100%",
  objectFit: "contain",
  display: "block",
  backgroundColor: "#000000",
} as const;

const fullscreenWebImageStyle = {
  width: "100%",
  height: "100%",
  objectFit: "contain",
  display: "block",
  backgroundColor: "#000000",
} as const;
