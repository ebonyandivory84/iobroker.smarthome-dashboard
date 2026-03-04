import { MaterialCommunityIcons } from "@expo/vector-icons";
import { createElement, useEffect, useMemo, useRef, useState } from "react";
import { Image, Linking, Modal, PanResponder, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { CameraWidgetConfig } from "../../types/dashboard";
import { playConfiguredUiSound } from "../../utils/uiSounds";
import { palette } from "../../utils/theme";

type CameraWidgetProps = {
  config: CameraWidgetConfig;
  maximizeStateValue?: unknown;
  onAspectRatioDetected?: (ratio: number) => void;
  onFullscreenSwipeClose?: () => void;
  onFullscreenVisibilityChange?: (open: boolean) => void;
};

const MAX_FULLSCREEN_DURATION_MS = 30_000;
const pinnedColor = "#f3c84a";

export function CameraWidget({
  config,
  maximizeStateValue,
  onAspectRatioDetected,
  onFullscreenSwipeClose,
  onFullscreenVisibilityChange,
}: CameraWidgetProps) {
  const [tick, setTick] = useState(0);
  const [layerUrls, setLayerUrls] = useState<[string | null, string | null]>([null, null]);
  const [activeLayer, setActiveLayer] = useState<0 | 1>(0);
  const [loadingLayer, setLoadingLayer] = useState<0 | 1 | null>(null);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const hasReportedAspectRatio = useRef(Boolean(config.snapshotAspectRatio));
  const lastTriggerMatchRef = useRef(false);
  const pendingTargetUrlRef = useRef<string | null>(null);
  const fullscreenVisibilityCallbackRef = useRef(onFullscreenVisibilityChange);
  const textColor = config.appearance?.textColor || palette.text;
  const mutedTextColor = config.appearance?.mutedTextColor || palette.textMuted;
  const displayUrl = layerUrls[activeLayer];
  const activeRefreshMs = fullscreenOpen
    ? Math.max(180, config.fullscreenRefreshMs || config.refreshMs || 2000)
    : Math.max(100, config.refreshMs || 2000);

  const closeFullscreen = () => {
    fullscreenVisibilityCallbackRef.current?.(false);
    setFullscreenOpen(false);
    setPinned(false);
  };

  const openFullscreen = () => {
    fullscreenVisibilityCallbackRef.current?.(true);
    setPinned(false);
    setFullscreenOpen(true);
  };

  const fullscreenPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gestureState) =>
          Math.abs(gestureState.dy) > 12 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
        onPanResponderRelease: (_event, gestureState) => {
          if (gestureState.dy > 80 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx)) {
            playConfiguredUiSound(config.interactionSounds?.scroll, "swipe", `${config.id}:scroll`);
            onFullscreenSwipeClose?.();
            closeFullscreen();
          }
        },
      }),
    [config.id, config.interactionSounds?.scroll, onFullscreenSwipeClose]
  );

  useEffect(() => {
    const timer = setInterval(() => setTick((current) => current + 1), activeRefreshMs);
    return () => clearInterval(timer);
  }, [activeRefreshMs]);

  useEffect(() => {
    fullscreenVisibilityCallbackRef.current = onFullscreenVisibilityChange;
  }, [onFullscreenVisibilityChange]);

  useEffect(() => {
    if (!fullscreenOpen || pinned) {
      return;
    }

    const timer = setTimeout(() => {
      closeFullscreen();
    }, MAX_FULLSCREEN_DURATION_MS);

    return () => clearTimeout(timer);
  }, [fullscreenOpen, pinned]);

  useEffect(() => {
    fullscreenVisibilityCallbackRef.current?.(fullscreenOpen);
  }, [fullscreenOpen]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined" || !fullscreenOpen) {
      return;
    }

    const targets = [document.documentElement, document.body];
    const previous = targets.map((target) => ({
      target,
      overscrollBehaviorY: target.style.overscrollBehaviorY,
      touchAction: target.style.touchAction,
    }));

    targets.forEach((target) => {
      target.style.overscrollBehaviorY = "none";
      target.style.touchAction = "none";
    });

    return () => {
      previous.forEach(({ target, overscrollBehaviorY, touchAction }) => {
        target.style.overscrollBehaviorY = overscrollBehaviorY;
        target.style.touchAction = touchAction;
      });
    };
  }, [fullscreenOpen]);

  useEffect(() => {
    const nextMatch = matchesMaximizeTrigger(config, maximizeStateValue);
    const previousMatch = lastTriggerMatchRef.current;
    lastTriggerMatchRef.current = nextMatch;

    if (nextMatch && !previousMatch && !fullscreenOpen) {
      openFullscreen();
    }
  }, [config, fullscreenOpen, maximizeStateValue]);

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

  const commitLayerLoad = (layer: 0 | 1, loadedUrl: string, width?: number, height?: number) => {
    if (!loadedUrl || pendingTargetUrlRef.current !== loadedUrl) {
      return;
    }

    if (width && height) {
      reportAspectRatio(width, height);
    }

    setActiveLayer(layer);
    setLoadingLayer(null);
    pendingTargetUrlRef.current = null;
  };

  useEffect(() => {
    if (!snapshotUrl) {
      setLayerUrls([null, null]);
      setActiveLayer(0);
      setLoadingLayer(null);
      pendingTargetUrlRef.current = null;
      return;
    }

    const currentActiveUrl = layerUrls[activeLayer];
    if (!currentActiveUrl) {
      setLayerUrls((current) => {
        const next: [string | null, string | null] = [...current] as [string | null, string | null];
        next[activeLayer] = snapshotUrl;
        return next;
      });
      setLoadingLayer(null);
      pendingTargetUrlRef.current = null;
      return;
    }

    if (snapshotUrl === currentActiveUrl || snapshotUrl === pendingTargetUrlRef.current) {
      return;
    }

    const nextLayer: 0 | 1 = activeLayer === 0 ? 1 : 0;
    setLayerUrls((current) => {
      const next: [string | null, string | null] = [...current] as [string | null, string | null];
      next[nextLayer] = snapshotUrl;
      return next;
    });
    setLoadingLayer(nextLayer);
    pendingTargetUrlRef.current = snapshotUrl;
  }, [activeLayer, layerUrls, snapshotUrl]);

  return (
    <>
      <View style={styles.container}>
        <Pressable
          disabled={!displayUrl}
          onPress={() => {
            playConfiguredUiSound(config.interactionSounds?.open, "open", `${config.id}:open`);
            openFullscreen();
          }}
          style={styles.preview}
        >
        {displayUrl ? (
          <View style={styles.snapshotWrap}>
            {!fullscreenOpen
              ? ([0, 1] as const).map((layer) => {
                  const url = layerUrls[layer];
                  if (!url) {
                    return null;
                  }
                  const isVisible = layer === activeLayer;
                  const isLoader = layer === loadingLayer;
                  return Platform.OS === "web"
                    ? createElement("img", {
                        alt: isVisible ? config.title || "Camera snapshot" : "",
                        "aria-hidden": !isVisible,
                        decoding: "async",
                        draggable: false,
                        loading: "eager",
                        onError: () => {
                          if (!isLoader) {
                            return;
                          }
                          if (pendingTargetUrlRef.current === url) {
                            setLoadingLayer(null);
                            pendingTargetUrlRef.current = null;
                          }
                        },
                        onLoad: (event: Event) => {
                          const target = event.currentTarget as HTMLImageElement | null;
                          if (!target) {
                            return;
                          }
                          if (isLoader) {
                            commitLayerLoad(layer, url, target.naturalWidth, target.naturalHeight);
                            return;
                          }
                          if (isVisible) {
                            reportAspectRatio(target.naturalWidth, target.naturalHeight);
                          }
                        },
                        src: url,
                        style: isVisible
                          ? { ...webLayerBaseStyle, ...webLayerVisibleStyle }
                          : { ...webLayerBaseStyle, ...webLayerHiddenStyle },
                      })
                    : (
                        <Image
                          key={`preview-layer-${layer}`}
                          onError={() => {
                            if (!isLoader) {
                              return;
                            }
                            if (pendingTargetUrlRef.current === url) {
                              setLoadingLayer(null);
                              pendingTargetUrlRef.current = null;
                            }
                          }}
                          onLoad={(event) => {
                            const source = event.nativeEvent.source;
                            if (isLoader) {
                              commitLayerLoad(layer, url, source?.width, source?.height);
                              return;
                            }
                            if (source?.width && source?.height && isVisible) {
                              reportAspectRatio(source.width, source.height);
                            }
                          }}
                          resizeMode="contain"
                          source={{ uri: url }}
                          style={[styles.imageLayer, isVisible ? styles.imageVisible : styles.imageHidden]}
                        />
                      );
                })
              : null}
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
            <Text style={[styles.emptyText, { color: mutedTextColor }]}>
              {config.snapshotUrl ? "Snapshot wird geladen..." : "Kein Snapshot konfiguriert"}
            </Text>
          </View>
        )}
        </Pressable>
        {!displayUrl && !config.snapshotUrl && !config.rtspUrl ? (
          <Text style={[styles.hint, { color: mutedTextColor }]}>Widget ist noch nicht konfiguriert.</Text>
        ) : null}
        {config.rtspUrl && !displayUrl ? (
          <Pressable
            onPress={() => {
              playConfiguredUiSound(config.interactionSounds?.press, "tap", `${config.id}:press`);
              Linking.openURL(config.rtspUrl!);
            }}
            style={styles.button}
          >
            <Text style={[styles.buttonLabel, { color: textColor }]}>RTSP Stream oeffnen</Text>
          </Pressable>
        ) : null}
      </View>
      <Modal animationType={Platform.OS === "web" ? "fade" : "none"} transparent visible={fullscreenOpen}>
        <View style={styles.fullscreenBackdrop}>
          <View style={styles.fullscreenActions}>
            <Pressable
              onPress={() => setPinned((current) => !current)}
              style={[styles.fullscreenActionButton, styles.fullscreenActionSpacing, pinned ? styles.fullscreenPinActive : null]}
            >
              <MaterialCommunityIcons
                color={pinned ? pinnedColor : palette.text}
                name={pinned ? "pin" : "pin-outline"}
                size={18}
              />
            </Pressable>
            <Pressable
              onPress={() => {
                playConfiguredUiSound(config.interactionSounds?.close, "close", `${config.id}:close`);
                closeFullscreen();
              }}
              style={styles.fullscreenActionButton}
            >
              <MaterialCommunityIcons color={palette.text} name="close" size={20} />
            </Pressable>
          </View>
          <View {...fullscreenPanResponder.panHandlers} style={styles.fullscreenStage}>
            {([0, 1] as const).map((layer) => {
              const url = layerUrls[layer];
              if (!url) {
                return null;
              }
              const isVisible = layer === activeLayer;
              const isLoader = layer === loadingLayer;
              return Platform.OS === "web"
                ? createElement("img", {
                    alt: isVisible ? config.title || "Camera snapshot fullscreen" : "",
                    "aria-hidden": !isVisible,
                    decoding: "async",
                    draggable: false,
                    loading: "eager",
                    onError: () => {
                      if (!isLoader) {
                        return;
                      }
                      if (pendingTargetUrlRef.current === url) {
                        setLoadingLayer(null);
                        pendingTargetUrlRef.current = null;
                      }
                    },
                    onLoad: () => {
                      if (isLoader) {
                        commitLayerLoad(layer, url);
                      }
                    },
                    src: url,
                    style: isVisible
                      ? { ...fullscreenWebLayerBaseStyle, ...webLayerVisibleStyle }
                      : { ...fullscreenWebLayerBaseStyle, ...webLayerHiddenStyle },
                  })
                : (
                    <Image
                      key={`fullscreen-layer-${layer}`}
                      onError={() => {
                        if (!isLoader) {
                          return;
                        }
                        if (pendingTargetUrlRef.current === url) {
                          setLoadingLayer(null);
                          pendingTargetUrlRef.current = null;
                        }
                      }}
                      onLoad={() => {
                        if (isLoader) {
                          commitLayerLoad(layer, url);
                        }
                      }}
                      resizeMode="contain"
                      source={{ uri: url }}
                      style={[styles.fullscreenImageLayer, isVisible ? styles.imageVisible : styles.imageHidden]}
                    />
                  );
            })}
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

function matchesMaximizeTrigger(config: CameraWidgetConfig, value: unknown) {
  if (!config.maximizeStateId) {
    return false;
  }

  const triggerFormat = config.maximizeTriggerFormat || "boolean";
  const rawExpected = (config.maximizeTriggerValue || "").trim();

  if (triggerFormat === "boolean") {
    const expected = normalizeBoolean(rawExpected || "true");
    const actual = normalizeBoolean(value);
    return expected !== null && actual !== null && expected === actual;
  }

  if (triggerFormat === "number") {
    if (!rawExpected) {
      return false;
    }
    const expected = Number(rawExpected);
    const actual = typeof value === "number" ? value : Number(value);
    return Number.isFinite(expected) && Number.isFinite(actual) && expected === actual;
  }

  if (!rawExpected || value === null || value === undefined) {
    return false;
  }

  return String(value).trim() === rawExpected;
}

function normalizeBoolean(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (value === 1) {
      return true;
    }
    if (value === 0) {
      return false;
    }
    return null;
  }

  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  if (["true", "1", "on", "yes"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "off", "no"].includes(normalized)) {
    return false;
  }

  return null;
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
  imageLayer: {
    position: "absolute",
    left: 0,
    top: 0,
    width: "100%",
    height: "100%",
  },
  imageVisible: {
    opacity: 1,
  },
  imageHidden: {
    opacity: 0,
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
  fullscreenImageLayer: {
    position: "absolute",
    left: 18,
    top: 18,
    right: 18,
    bottom: 18,
    width: undefined,
    height: undefined,
    pointerEvents: "none",
  },
  fullscreenActions: {
    position: "absolute",
    top: 24,
    right: 24,
    zIndex: 20,
    flexDirection: "row",
  },
  fullscreenActionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(4, 8, 14, 0.54)",
  },
  fullscreenActionSpacing: {
    marginRight: 10,
  },
  fullscreenPinActive: {
    backgroundColor: "rgba(243, 200, 74, 0.18)",
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

const webLayerBaseStyle = {
  position: "absolute",
  left: 0,
  top: 0,
  width: "100%",
  height: "100%",
  objectFit: "contain",
  display: "block",
  backgroundColor: "#000000",
  transition: "opacity 150ms linear",
  pointerEvents: "none",
} as const;

const fullscreenWebLayerBaseStyle = {
  position: "absolute",
  left: 0,
  top: 0,
  width: "100%",
  height: "100%",
  objectFit: "contain",
  display: "block",
  backgroundColor: "#000000",
  transition: "opacity 150ms linear",
  pointerEvents: "none",
} as const;

const webLayerVisibleStyle = {
  opacity: 1,
} as const;

const webLayerHiddenStyle = {
  opacity: 0,
} as const;
