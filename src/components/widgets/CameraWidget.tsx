import { MaterialCommunityIcons } from "@expo/vector-icons";
import { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, Modal, PanResponder, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { CameraWidgetConfig } from "../../types/dashboard";
import { playConfiguredUiSound } from "../../utils/uiSounds";
import { palette } from "../../utils/theme";

declare global {
  interface Window {
    flvjs?: any;
  }
}

type CameraWidgetProps = {
  config: CameraWidgetConfig;
  maximizeStateValue?: unknown;
  onAspectRatioDetected?: (ratio: number) => void;
  onFullscreenSwipeClose?: () => void;
  onFullscreenVisibilityChange?: (open: boolean) => void;
};

const MAX_FULLSCREEN_DURATION_MS = 30_000;
const LAYER_FADE_MS = 0;
const pinnedColor = "#f3c84a";
const FLV_SCRIPT_SRC = "https://cdn.jsdelivr.net/npm/flv.js@1.6.2/dist/flv.min.js";
let flvLoaderPromise: Promise<boolean> | null = null;

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
  const [previewStreamDebug, setPreviewStreamDebug] = useState<string | null>(null);
  const [previewMjpegSourceIndex, setPreviewMjpegSourceIndex] = useState(0);
  const [fullscreenMjpegSourceIndex, setFullscreenMjpegSourceIndex] = useState(0);
  const [previewMjpegLoaded, setPreviewMjpegLoaded] = useState(false);
  const [fullscreenMjpegLoaded, setFullscreenMjpegLoaded] = useState(false);
  const hasReportedAspectRatio = useRef(false);
  const lastTriggerMatchRef = useRef(false);
  const activeLayerRef = useRef<0 | 1>(0);
  const latestRequestedUrlRef = useRef<string | null>(null);
  const loadingJobRef = useRef<{ layer: 0 | 1; url: string } | null>(null);
  const fullscreenVisibilityCallbackRef = useRef(onFullscreenVisibilityChange);
  const textColor = config.appearance?.textColor || palette.text;
  const mutedTextColor = config.appearance?.mutedTextColor || palette.textMuted;
  const displayUrl = layerUrls[activeLayer];

  const previewSnapshotBaseUrl = (config.snapshotUrl || "").trim() || null;
  const fullscreenSnapshotBaseUrl = (config.fullscreenSnapshotUrl || config.snapshotUrl || "").trim() || null;
  const previewMjpegUrl = (config.mjpegUrl || "").trim() || null;
  const fullscreenMjpegUrl = (config.fullscreenMjpegUrl || config.mjpegUrl || "").trim() || null;
  const previewFlvUrl = (config.flvUrl || config.fullscreenFlvUrl || "").trim() || null;
  const fullscreenFlvUrl = (config.fullscreenFlvUrl || config.flvUrl || "").trim() || null;
  const previewSourceMode = resolveSourceMode(
    config.previewSourceMode,
    previewSnapshotBaseUrl,
    previewMjpegUrl,
    previewFlvUrl
  );
  const fullscreenSourceMode = resolveSourceMode(
    config.fullscreenSourceMode,
    fullscreenSnapshotBaseUrl,
    fullscreenMjpegUrl,
    fullscreenFlvUrl,
    previewSourceMode
  );

  const previewFeed = resolveCameraFeed({
    sourceMode: previewSourceMode,
    snapshotUrl: previewSnapshotBaseUrl,
    mjpegUrl: previewMjpegUrl,
    flvUrl: previewFlvUrl,
  });
  const fullscreenFeed = resolveCameraFeed({
    sourceMode: fullscreenSourceMode,
    snapshotUrl: fullscreenSnapshotBaseUrl,
    mjpegUrl: fullscreenMjpegUrl,
    flvUrl: fullscreenFlvUrl,
  });
  const activeFeed = fullscreenOpen ? fullscreenFeed : previewFeed;
  const activeSnapshotBaseUrl = activeFeed?.kind === "snapshot" ? activeFeed.url : null;
  const previewMjpegSources = useMemo(
    () =>
      previewFeed?.kind === "mjpeg"
        ? buildWebStreamSources(previewFeed.url, "mjpeg")
        : [],
    [previewFeed]
  );
  const fullscreenMjpegSources = useMemo(
    () =>
      fullscreenFeed?.kind === "mjpeg"
        ? buildWebStreamSources(fullscreenFeed.url, "mjpeg")
        : [],
    [fullscreenFeed]
  );
  const previewFlvSources = useMemo(
    () =>
      previewFeed?.kind === "flv"
        ? buildWebStreamSources(previewFeed.url, "flv")
        : [],
    [previewFeed]
  );
  const fullscreenFlvSources = useMemo(
    () =>
      fullscreenFeed?.kind === "flv"
        ? buildWebStreamSources(fullscreenFeed.url, "flv")
        : [],
    [fullscreenFeed]
  );
  const previewFlvRenderUrl = previewFlvSources[0] || (previewFeed?.kind === "flv" ? previewFeed.url : null);
  const fullscreenFlvRenderUrl =
    fullscreenFlvSources[0] || (fullscreenFeed?.kind === "flv" ? fullscreenFeed.url : null);
  const previewFeedKey = `${previewFeed?.kind || "none"}:${previewFeed?.url || ""}`;
  const fullscreenFeedKey = `${fullscreenFeed?.kind || "none"}:${fullscreenFeed?.url || ""}`;
  const currentPreviewMjpegSrc = previewMjpegSources[Math.min(previewMjpegSourceIndex, Math.max(0, previewMjpegSources.length - 1))] || null;
  const currentFullscreenMjpegSrc =
    fullscreenMjpegSources[Math.min(fullscreenMjpegSourceIndex, Math.max(0, fullscreenMjpegSources.length - 1))] || null;
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
    if (!activeSnapshotBaseUrl) {
      return;
    }
    const timer = setInterval(() => setTick((current) => current + 1), activeRefreshMs);
    return () => clearInterval(timer);
  }, [activeRefreshMs, activeSnapshotBaseUrl]);

  useEffect(() => {
    if (fullscreenOpen || previewFeed?.kind !== "mjpeg") {
      setPreviewStreamDebug(null);
      setPreviewMjpegLoaded(false);
    }
  }, [fullscreenOpen, previewFeed?.kind]);

  useEffect(() => {
    setPreviewMjpegSourceIndex(0);
    setPreviewMjpegLoaded(false);
  }, [previewMjpegSources, previewFeed?.kind, previewFeed?.url]);

  useEffect(() => {
    hasReportedAspectRatio.current = false;
  }, [previewFeed?.kind, previewFeed?.url]);

  useEffect(() => {
    // Force a clean preview re-init when source mode/url changes so updates apply instantly.
    loadingJobRef.current = null;
    latestRequestedUrlRef.current = null;
    setLoadingLayer(null);
    setLayerUrls([null, null]);
    setActiveLayer(0);
    activeLayerRef.current = 0;
  }, [previewFeedKey]);

  useEffect(() => {
    setFullscreenMjpegSourceIndex(0);
    setFullscreenMjpegLoaded(false);
  }, [fullscreenMjpegSources, fullscreenFeed?.kind, fullscreenFeed?.url]);

  useEffect(() => {
    if (Platform.OS !== "web" || fullscreenOpen || previewFeed?.kind !== "mjpeg" || !currentPreviewMjpegSrc) {
      return;
    }

    if (previewMjpegLoaded) {
      return;
    }

    const timer = setTimeout(() => {
      setPreviewMjpegSourceIndex((current) =>
        current + 1 < previewMjpegSources.length ? current + 1 : current
      );
    }, 3500);

    return () => clearTimeout(timer);
  }, [
    currentPreviewMjpegSrc,
    fullscreenOpen,
    previewFeed?.kind,
    previewMjpegLoaded,
    previewMjpegSources.length,
  ]);

  useEffect(() => {
    if (Platform.OS !== "web" || !fullscreenOpen || fullscreenFeed?.kind !== "mjpeg" || !currentFullscreenMjpegSrc) {
      return;
    }

    if (fullscreenMjpegLoaded) {
      return;
    }

    const timer = setTimeout(() => {
      setFullscreenMjpegSourceIndex((current) =>
        current + 1 < fullscreenMjpegSources.length ? current + 1 : current
      );
    }, 3500);

    return () => clearTimeout(timer);
  }, [
    currentFullscreenMjpegSrc,
    fullscreenFeed?.kind,
    fullscreenMjpegLoaded,
    fullscreenMjpegSources.length,
    fullscreenOpen,
  ]);

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

  const reportAspectRatio = useCallback((width: number, height: number) => {
    if (!onAspectRatioDetected || hasReportedAspectRatio.current || !width || !height) {
      return;
    }

    const ratio = width / height;
    if (!Number.isFinite(ratio) || ratio <= 0) {
      return;
    }

    if (config.snapshotAspectRatio && Math.abs(config.snapshotAspectRatio - ratio) < 0.02) {
      hasReportedAspectRatio.current = true;
      return;
    }

    hasReportedAspectRatio.current = true;
    onAspectRatioDetected(ratio);
  }, [config.snapshotAspectRatio, onAspectRatioDetected]);

  const snapshotUrl = useMemo(() => {
    if (!activeSnapshotBaseUrl) {
      return null;
    }
    if (Platform.OS === "web" && typeof window !== "undefined" && window.location.pathname.includes("/smarthome-dashboard")) {
      const proxyBase = `${window.location.origin}/smarthome-dashboard/api/camera-snapshot`;
      return `${proxyBase}?url=${encodeURIComponent(activeSnapshotBaseUrl)}&t=${tick}`;
    }
    const separator = activeSnapshotBaseUrl.includes("?") ? "&" : "?";
    return `${activeSnapshotBaseUrl}${separator}t=${tick}`;
  }, [activeSnapshotBaseUrl, tick]);

  useEffect(() => {
    activeLayerRef.current = activeLayer;
  }, [activeLayer]);

  const scheduleLoad = useCallback((url: string) => {
    const targetLayer: 0 | 1 = activeLayerRef.current === 0 ? 1 : 0;
    loadingJobRef.current = { layer: targetLayer, url };
    setLoadingLayer(targetLayer);
    setLayerUrls((current) => {
      const next: [string | null, string | null] = [...current] as [string | null, string | null];
      next[targetLayer] = url;
      return next;
    });
  }, []);

  const commitLayerLoad = useCallback(
    (layer: 0 | 1, url: string, width?: number, height?: number) => {
      const job = loadingJobRef.current;
      if (!job || job.layer !== layer || job.url !== url) {
        return;
      }

      if (width && height) {
        reportAspectRatio(width, height);
      }

      // Keep the imperative ref in sync immediately so any follow-up schedule
      // in this same tick always targets the opposite (hidden) layer.
      activeLayerRef.current = layer;
      setActiveLayer(layer);
      setLoadingLayer(null);
      loadingJobRef.current = null;

      const latest = latestRequestedUrlRef.current;
      if (latest && latest !== url) {
        scheduleLoad(latest);
      }
    },
    [reportAspectRatio, scheduleLoad]
  );

  useEffect(() => {
    latestRequestedUrlRef.current = snapshotUrl;

    if (!snapshotUrl) {
      loadingJobRef.current = null;
      setLoadingLayer(null);
      setLayerUrls([null, null]);
      setActiveLayer(0);
      activeLayerRef.current = 0;
      return;
    }

    const currentVisibleUrl = layerUrls[activeLayerRef.current];
    if (!currentVisibleUrl) {
      const visibleLayer = activeLayerRef.current;
      setLayerUrls((current) => {
        const next: [string | null, string | null] = [...current] as [string | null, string | null];
        next[visibleLayer] = snapshotUrl;
        return next;
      });
      return;
    }

    if (snapshotUrl === currentVisibleUrl) {
      return;
    }

    const job = loadingJobRef.current;
    if (job && job.url === snapshotUrl) {
      return;
    }

    scheduleLoad(snapshotUrl);
  }, [layerUrls, scheduleLoad, snapshotUrl]);

  return (
    <>
      <View style={styles.container}>
        <Pressable
          disabled={!previewFeed}
          onPress={() => {
            playConfiguredUiSound(config.interactionSounds?.open, "open", `${config.id}:open`);
            openFullscreen();
          }}
          style={styles.preview}
        >
        {previewFeed ? (
          <View style={styles.snapshotWrap}>
            {!fullscreenOpen && previewFeed.kind === "snapshot"
              ? ([0, 1] as const).map((layer) => {
                  const url = layerUrls[layer];
                  if (!url) {
                    return null;
                  }
                  const isVisible = layer === activeLayer;
                  const isLoadingTarget = loadingLayer === layer;
                  return Platform.OS === "web"
                    ? createElement("img", {
                        alt: isVisible ? config.title || "Camera snapshot" : "",
                        "aria-hidden": !isVisible,
                        decoding: "sync",
                        draggable: false,
                        key: `preview-web-layer-${layer}`,
                        loading: "eager",
                        onError: () => {
                          if (!isLoadingTarget) {
                            return;
                          }
                          const latest = latestRequestedUrlRef.current;
                          setLoadingLayer(null);
                          loadingJobRef.current = null;
                          if (latest && latest !== displayUrl) {
                            scheduleLoad(latest);
                          }
                        },
                        onLoad: (event: Event) => {
                          const target = event.currentTarget as HTMLImageElement | null;
                          if (!target) {
                            return;
                          }
                          if (isLoadingTarget) {
                            commitLayerLoad(layer, url, target.naturalWidth, target.naturalHeight);
                            return;
                          }
                          if (isVisible) {
                            reportAspectRatio(target.naturalWidth, target.naturalHeight);
                          }
                        },
                        src: url,
                        style: getWebLayerStyle(isVisible),
                      })
                    : (
                        <Image
                          key={`preview-native-layer-${layer}`}
                          onError={() => {
                            if (!isLoadingTarget) {
                              return;
                            }
                            const latest = latestRequestedUrlRef.current;
                            setLoadingLayer(null);
                            loadingJobRef.current = null;
                            if (latest && latest !== displayUrl) {
                              scheduleLoad(latest);
                            }
                          }}
                          onLoad={(event) => {
                            const source = event.nativeEvent.source;
                            if (isLoadingTarget) {
                              commitLayerLoad(layer, url, source?.width, source?.height);
                              return;
                            }
                            if (isVisible && source?.width && source?.height) {
                              reportAspectRatio(source.width, source.height);
                            }
                          }}
                          resizeMode="cover"
                          source={{ uri: url }}
                          style={[styles.imageLayer, isVisible ? styles.layerVisible : styles.layerHidden]}
                        />
                      );
                })
              : null}
            {!fullscreenOpen && previewFeed.kind === "mjpeg" && previewFeed.url
              ? Platform.OS === "web"
                ? createElement("img", {
                    alt: config.title || "Camera MJPEG",
                    decoding: "sync",
                    draggable: false,
                    key: `preview-mjpeg-${currentPreviewMjpegSrc || previewFeed.url}`,
                    loading: "eager",
                    onError: () => {
                      setPreviewMjpegLoaded(false);
                      if (previewMjpegSourceIndex + 1 < previewMjpegSources.length) {
                        setPreviewMjpegSourceIndex((current) => current + 1);
                        setPreviewStreamDebug("MJPEG Preview: Proxy fehlgeschlagen, versuche Direkt-URL...");
                        return;
                      }
                      setPreviewStreamDebug((current) => current || "MJPEG Preview: Bild konnte nicht geladen werden.");
                    },
                    onLoad: (event: Event) => {
                      setPreviewMjpegLoaded(true);
                      setPreviewStreamDebug(null);
                      reportAspectRatio(
                        (event.currentTarget as HTMLImageElement | null)?.naturalWidth || 0,
                        (event.currentTarget as HTMLImageElement | null)?.naturalHeight || 0
                      );
                    },
                    src: currentPreviewMjpegSrc || previewFeed.url,
                    style: webMjpegStyle,
                  })
                : (
                    <Image
                      onLoad={(event) => {
                        const source = event.nativeEvent.source;
                        if (source?.width && source?.height) {
                          reportAspectRatio(source.width, source.height);
                        }
                      }}
                      resizeMode="cover"
                      source={{ uri: previewFeed.url }}
                      style={styles.mjpegImage}
                    />
                  )
              : null}
            {!fullscreenOpen && previewFeed.kind === "mjpeg" && previewStreamDebug ? (
              <View style={styles.streamDebugOverlay}>
                <Text style={styles.streamDebugText}>{previewStreamDebug}</Text>
              </View>
            ) : null}
            {!fullscreenOpen && previewFeed.kind === "flv" && previewFeed.url
              ? Platform.OS === "web"
                ? (
                    <WebFlvPlayer
                      key={`preview-flv-${previewFeedKey}`}
                      title={config.title || "Camera FLV"}
                      url={previewFlvRenderUrl || previewFeed.url}
                    />
                  )
                : (
                    <View style={styles.empty}>
                      <Text style={[styles.emptyText, { color: mutedTextColor }]}>FLV wird nur im Web unterstuetzt.</Text>
                    </View>
                  )
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
              {previewSnapshotBaseUrl || previewMjpegUrl || previewFlvUrl ? "Stream wird geladen..." : "Kein Stream konfiguriert"}
            </Text>
          </View>
        )}
        </Pressable>
        {!previewFeed && !previewSnapshotBaseUrl && !previewMjpegUrl && !previewFlvUrl ? (
          <Text style={[styles.hint, { color: mutedTextColor }]}>Widget ist noch nicht konfiguriert.</Text>
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
            {fullscreenFeed?.kind === "snapshot"
              ? ([0, 1] as const).map((layer) => {
              const url = layerUrls[layer];
              if (!url) {
                return null;
              }
              const isVisible = layer === activeLayer;
              const isLoadingTarget = loadingLayer === layer;
              return Platform.OS === "web"
                ? createElement("img", {
                    alt: isVisible ? config.title || "Camera snapshot fullscreen" : "",
                    "aria-hidden": !isVisible,
                    decoding: "sync",
                    draggable: false,
                    key: `fullscreen-web-layer-${layer}`,
                    loading: "eager",
                    onError: () => {
                      if (!isLoadingTarget) {
                        return;
                      }
                      const latest = latestRequestedUrlRef.current;
                      setLoadingLayer(null);
                      loadingJobRef.current = null;
                      if (latest && latest !== displayUrl) {
                        scheduleLoad(latest);
                      }
                    },
                    onLoad: () => {
                      if (isLoadingTarget) {
                        commitLayerLoad(layer, url);
                      }
                    },
                    src: url,
                    style: getFullscreenWebLayerStyle(isVisible),
                  })
                : (
                    <Image
                      key={`fullscreen-native-layer-${layer}`}
                      onError={() => {
                        if (!isLoadingTarget) {
                          return;
                        }
                        const latest = latestRequestedUrlRef.current;
                        setLoadingLayer(null);
                        loadingJobRef.current = null;
                        if (latest && latest !== displayUrl) {
                          scheduleLoad(latest);
                        }
                      }}
                      onLoad={() => {
                        if (isLoadingTarget) {
                          commitLayerLoad(layer, url);
                        }
                      }}
                      resizeMode="contain"
                      source={{ uri: url }}
                      style={[styles.fullscreenImageLayer, isVisible ? styles.layerVisible : styles.layerHidden]}
                    />
                  );
            })
              : null}
            {fullscreenFeed?.kind === "mjpeg" && fullscreenFeed.url
              ? Platform.OS === "web"
                ? createElement("img", {
                    alt: config.title || "Camera MJPEG fullscreen",
                    decoding: "sync",
                    draggable: false,
                    key: `fullscreen-mjpeg-${currentFullscreenMjpegSrc || fullscreenFeed.url}`,
                    loading: "eager",
                    onError: () => {
                      setFullscreenMjpegLoaded(false);
                      if (fullscreenMjpegSourceIndex + 1 < fullscreenMjpegSources.length) {
                        setFullscreenMjpegSourceIndex((current) => current + 1);
                      }
                    },
                    onLoad: (event: Event) => {
                      setFullscreenMjpegLoaded(true);
                      reportAspectRatio(
                        (event.currentTarget as HTMLImageElement | null)?.naturalWidth || 0,
                        (event.currentTarget as HTMLImageElement | null)?.naturalHeight || 0
                      );
                    },
                    src: currentFullscreenMjpegSrc || fullscreenFeed.url,
                    style: fullscreenWebMjpegStyle,
                  })
                : (
                    <Image
                      onLoad={(event) => {
                        const source = event.nativeEvent.source;
                        if (source?.width && source?.height) {
                          reportAspectRatio(source.width, source.height);
                        }
                      }}
                      resizeMode="contain"
                      source={{ uri: fullscreenFeed.url }}
                      style={styles.fullscreenMjpegImage}
                    />
                  )
              : null}
            {fullscreenFeed?.kind === "flv" && fullscreenFeed.url
              ? Platform.OS === "web"
                ? (
                    <WebFlvPlayer
                      key={`fullscreen-flv-${fullscreenFeedKey}`}
                      fullScreen
                      title={config.title || "Camera FLV fullscreen"}
                      url={fullscreenFlvRenderUrl || fullscreenFeed.url}
                    />
                  )
                : (
                    <View style={styles.empty}>
                      <Text style={[styles.emptyText, { color: mutedTextColor }]}>FLV wird nur im Web unterstuetzt.</Text>
                    </View>
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

function resolveCameraFeed(input: {
  sourceMode: "snapshot" | "mjpeg" | "flv";
  snapshotUrl: string | null;
  mjpegUrl: string | null;
  flvUrl: string | null;
}) {
  const sourcePriority =
    input.sourceMode === "snapshot"
      ? [
          { kind: "snapshot" as const, url: input.snapshotUrl },
          { kind: "mjpeg" as const, url: input.mjpegUrl },
          { kind: "flv" as const, url: input.flvUrl },
        ]
      : input.sourceMode === "mjpeg"
        ? [
            { kind: "mjpeg" as const, url: input.mjpegUrl },
            { kind: "snapshot" as const, url: input.snapshotUrl },
            { kind: "flv" as const, url: input.flvUrl },
          ]
        : [
            { kind: "flv" as const, url: input.flvUrl },
            { kind: "mjpeg" as const, url: input.mjpegUrl },
            { kind: "snapshot" as const, url: input.snapshotUrl },
          ];

  for (const source of sourcePriority) {
    if (source.url) {
      return {
        kind: source.kind,
        url: source.url,
      };
    }
  }

  return null;
}

function resolveSourceMode(
  sourceMode: CameraWidgetConfig["previewSourceMode"],
  snapshotUrl: string | null,
  mjpegUrl: string | null,
  flvUrl: string | null,
  fallback: "snapshot" | "mjpeg" | "flv" = "snapshot"
) {
  if (sourceMode === "snapshot" || sourceMode === "mjpeg" || sourceMode === "flv") {
    return sourceMode;
  }

  if (snapshotUrl && !mjpegUrl && !flvUrl) {
    return "snapshot";
  }

  if (mjpegUrl && !snapshotUrl && !flvUrl) {
    return "mjpeg";
  }

  if (flvUrl && !snapshotUrl && !mjpegUrl) {
    return "flv";
  }

  return fallback;
}

function getWebStreamProxyUrls(targetUrl: string, streamType: "mjpeg" | "flv") {
  if (Platform.OS !== "web" || typeof window === "undefined") {
    return [];
  }

  const encodedUrl = encodeURIComponent(targetUrl);
  return [
    `${window.location.origin}/smarthome-dashboard/api/camera-stream?streamType=${streamType}&url=${encodedUrl}`,
    `${window.location.origin}/smarthome-dashboard/api/camera-mjpeg?streamType=${streamType}&url=${encodedUrl}`,
  ];
}

function buildWebStreamSources(targetUrl: string, streamType: "mjpeg" | "flv") {
  const includeDirect = shouldUseDirectWebStream(targetUrl, streamType);
  const sources = [
    ...getWebStreamProxyUrls(targetUrl, streamType),
    ...(includeDirect ? [targetUrl] : []),
  ];
  return Array.from(new Set(sources.filter(Boolean)));
}

function shouldUseDirectWebStream(targetUrl: string, streamType: "mjpeg" | "flv") {
  if (Platform.OS !== "web" || typeof window === "undefined") {
    return true;
  }

  try {
    const parsed = new URL(targetUrl);
    const hasEmbeddedCredentials = Boolean(parsed.username || parsed.password);
    const mixedContentBlocked = window.location.protocol === "https:" && parsed.protocol === "http:";

    // Browser subresource requests are unreliable with embedded credentials and mixed-content URLs.
    // Prefer same-origin adapter proxy in these cases.
    if (hasEmbeddedCredentials || mixedContentBlocked) {
      return false;
    }
  } catch {
    // Keep fallback path when URL parsing fails.
  }

  return true;
}

function WebFlvPlayer({
  url,
  title,
  fullScreen = false,
}: {
  url: string;
  title: string;
  fullScreen?: boolean;
}) {
  const videoRef = useRef<any>(null);
  const playerRef = useRef<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [interactionRequired, setInteractionRequired] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") {
      return;
    }

    setErrorMessage(null);
    setInteractionRequired(false);
    let disposed = false;
    let player: any = null;
    const videoElement = videoRef.current;

    const attach = async () => {
      if (!videoElement || !url) {
        return;
      }

      const loaded = await ensureFlvJsLoaded();
      if (disposed || !loaded) {
        setErrorMessage("FLV Player konnte nicht geladen werden.");
        return;
      }

      if (!window.flvjs?.isSupported?.()) {
        setErrorMessage("FLV wird von diesem Browser nicht unterstuetzt.");
        return;
      }

      player = window.flvjs.createPlayer(
        {
          type: "flv",
          isLive: true,
          url,
        },
        {
          enableStashBuffer: false,
          lazyLoad: false,
        }
      );
      playerRef.current = player;

      if (window.flvjs?.Events?.ERROR) {
        player.on(window.flvjs.Events.ERROR, (errorType: string, errorDetail: string) => {
          const detail = [errorType, errorDetail].filter(Boolean).join(" / ");
          setErrorMessage(
            detail
              ? `FLV Stream konnte nicht gestartet werden (${detail}).`
              : "FLV Stream konnte nicht gestartet werden."
          );
        });
      }

      player.attachMediaElement(videoElement);
      player.load();
      void videoElement.play().catch(() => {
        setInteractionRequired(true);
      });
    };

    attach().catch(() => {
      setErrorMessage("FLV Stream konnte nicht initialisiert werden.");
    });

    return () => {
      disposed = true;
      if (player) {
        try {
          player.unload();
          player.detachMediaElement();
          player.destroy();
        } catch {
          // ignore cleanup errors
        }
      }
      if (videoElement) {
        videoElement.removeAttribute("src");
        videoElement.load();
      }
      playerRef.current = null;
    };
  }, [url]);

  const resumePlayback = useCallback(() => {
    const videoElement = videoRef.current;
    if (!videoElement) {
      return;
    }

    try {
      if (playerRef.current?.play) {
        playerRef.current.play();
      }
    } catch {
      // ignore and fallback to HTMLVideoElement play
    }

    void videoElement.play().then(() => {
      setInteractionRequired(false);
      setErrorMessage(null);
    }).catch(() => {
      setErrorMessage("Wiedergabe konnte nicht gestartet werden.");
    });
  }, []);

  return (
    <>
      {createElement("video", {
        autoPlay: true,
        controls: false,
        muted: true,
        playsInline: true,
        ref: (element: any) => {
          videoRef.current = element;
        },
        style: fullScreen ? fullscreenWebFlvStyle : webFlvStyle,
        title,
      })}
      {errorMessage ? (
        <View style={styles.flvErrorOverlay}>
          <Text style={styles.flvErrorText}>{errorMessage}</Text>
        </View>
      ) : null}
      {interactionRequired ? (
        <Pressable onPress={resumePlayback} style={styles.flvTapOverlay}>
          <Text style={styles.flvTapText}>Tippen zum Starten</Text>
        </Pressable>
      ) : null}
    </>
  );
}

async function ensureFlvJsLoaded() {
  if (Platform.OS !== "web" || typeof window === "undefined" || typeof document === "undefined") {
    return false;
  }

  if (window.flvjs) {
    return true;
  }

  try {
    const imported = await import("flv.js");
    const maybeFlv = (imported as { default?: any }).default || imported;
    if (maybeFlv) {
      window.flvjs = maybeFlv;
      return true;
    }
  } catch {
    // fallback to CDN loader below
  }

  if (!flvLoaderPromise) {
    flvLoaderPromise = new Promise<boolean>((resolve) => {
      const existing = document.querySelector(`script[data-flvjs-src="${FLV_SCRIPT_SRC}"]`) as HTMLScriptElement | null;
      if (existing) {
        existing.addEventListener("load", () => resolve(Boolean(window.flvjs)), { once: true });
        existing.addEventListener("error", () => resolve(false), { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = FLV_SCRIPT_SRC;
      script.async = true;
      script.dataset.flvjsSrc = FLV_SCRIPT_SRC;
      script.onload = () => resolve(Boolean(window.flvjs));
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    });
  }

  return flvLoaderPromise;
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
    backgroundColor: "transparent",
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
  layerVisible: {
    opacity: 1,
  },
  layerHidden: {
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
  },
  mjpegImage: {
    width: "100%",
    height: "100%",
  },
  fullscreenMjpegImage: {
    width: "100%",
    height: "100%",
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
  flvErrorOverlay: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "rgba(160, 22, 40, 0.75)",
  },
  flvErrorText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
  },
  flvTapOverlay: {
    position: "absolute",
    left: 12,
    right: 12,
    top: 12,
    bottom: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 0, 0, 0.42)",
  },
  flvTapText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
  },
  streamDebugOverlay: {
    position: "absolute",
    left: 10,
    right: 10,
    bottom: 10,
    borderRadius: 10,
    backgroundColor: "rgba(0, 0, 0, 0.72)",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  streamDebugText: {
    color: "#ffe7e7",
    fontSize: 12,
    fontWeight: "700",
  },
});

function getWebLayerStyle(visible: boolean) {
  return {
    ...baseWebLayerStyle,
    opacity: visible ? 1 : 0,
    visibility: visible ? "visible" : "hidden",
    zIndex: visible ? 2 : 1,
  } as const;
}

function getFullscreenWebLayerStyle(visible: boolean) {
  return {
    ...baseFullscreenWebLayerStyle,
    opacity: visible ? 1 : 0,
    visibility: visible ? "visible" : "hidden",
    zIndex: visible ? 2 : 1,
  } as const;
}

const baseWebLayerStyle = {
  position: "absolute",
  left: 0,
  top: 0,
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
  backgroundColor: "#000000",
  transition: LAYER_FADE_MS > 0 ? `opacity ${LAYER_FADE_MS}ms linear` : "none",
  pointerEvents: "none",
} as const;

const baseFullscreenWebLayerStyle = {
  position: "absolute",
  left: 0,
  top: 0,
  width: "100%",
  height: "100%",
  objectFit: "contain",
  display: "block",
  backgroundColor: "#000000",
  transition: LAYER_FADE_MS > 0 ? `opacity ${LAYER_FADE_MS}ms linear` : "none",
  pointerEvents: "none",
} as const;

const webMjpegStyle = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
  backgroundColor: "#000000",
} as const;

const fullscreenWebMjpegStyle = {
  width: "100%",
  height: "100%",
  objectFit: "contain",
  display: "block",
  backgroundColor: "#000000",
} as const;

const webFlvStyle = {
  width: "100%",
  height: "100%",
  objectFit: "contain",
  display: "block",
  backgroundColor: "transparent",
} as const;

const fullscreenWebFlvStyle = {
  width: "100%",
  height: "100%",
  objectFit: "contain",
  display: "block",
  backgroundColor: "#000000",
} as const;
