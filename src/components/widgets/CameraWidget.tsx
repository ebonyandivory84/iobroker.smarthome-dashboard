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
const FLV_SCRIPT_LOAD_TIMEOUT_MS = 8000;
const MJPEG_SOURCE_SWITCH_TIMEOUT_MS = 12_000;
const MJPEG_RECONNECT_DELAY_MS = 1800;
const FLV_RECONNECT_DELAY_MS = 1800;
const MJPEG_PREVIEW_RESUME_DELAY_MS = 2200;
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
  const [previewMjpegSession, setPreviewMjpegSession] = useState(0);
  const [fullscreenSession, setFullscreenSession] = useState(0);
  const [previewFlvSession, setPreviewFlvSession] = useState(0);
  const [previewMjpegSourceIndex, setPreviewMjpegSourceIndex] = useState(0);
  const [fullscreenMjpegSourceIndex, setFullscreenMjpegSourceIndex] = useState(0);
  const [previewFlvSourceIndex, setPreviewFlvSourceIndex] = useState(0);
  const [fullscreenFlvSourceIndex, setFullscreenFlvSourceIndex] = useState(0);
  const [previewFmp4SourceIndex, setPreviewFmp4SourceIndex] = useState(0);
  const [fullscreenFmp4SourceIndex, setFullscreenFmp4SourceIndex] = useState(0);
  const [previewMjpegLoaded, setPreviewMjpegLoaded] = useState(false);
  const [fullscreenMjpegLoaded, setFullscreenMjpegLoaded] = useState(false);
  const [previewMjpegPaused, setPreviewMjpegPaused] = useState(false);
  const hasReportedAspectRatio = useRef(false);
  const lastTriggerMatchRef = useRef(false);
  const activeLayerRef = useRef<0 | 1>(0);
  const latestRequestedUrlRef = useRef<string | null>(null);
  const loadingJobRef = useRef<{ layer: 0 | 1; url: string } | null>(null);
  const fullscreenVisibilityCallbackRef = useRef(onFullscreenVisibilityChange);
  const previewMjpegResumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textColor = config.appearance?.textColor || palette.text;
  const mutedTextColor = config.appearance?.mutedTextColor || palette.textMuted;
  const titleFontSize = Math.max(11, Math.min(28, Math.round(config.titleFontSize || 14)));
  const displayUrl = layerUrls[activeLayer];
  const isTabletLikeWeb =
    Platform.OS === "web" &&
    typeof window !== "undefined" &&
    window.innerWidth >= 700 &&
    window.innerWidth < 1100;

  const previewSnapshotBaseUrl = (
    (isTabletLikeWeb ? config.tabletSnapshotUrl : undefined) ||
    config.snapshotUrl ||
    ""
  ).trim() || null;
  const fullscreenSnapshotBaseUrl = (
    (isTabletLikeWeb ? config.tabletFullscreenSnapshotUrl : undefined) ||
    (isTabletLikeWeb ? config.tabletSnapshotUrl : undefined) ||
    config.fullscreenSnapshotUrl ||
    config.snapshotUrl ||
    ""
  ).trim() || null;
  const previewMjpegUrl = (
    (isTabletLikeWeb ? config.tabletMjpegUrl : undefined) ||
    config.mjpegUrl ||
    ""
  ).trim() || null;
  const fullscreenMjpegUrl = (
    (isTabletLikeWeb ? config.tabletFullscreenMjpegUrl : undefined) ||
    (isTabletLikeWeb ? config.tabletMjpegUrl : undefined) ||
    config.fullscreenMjpegUrl ||
    config.mjpegUrl ||
    ""
  ).trim() || null;
  const previewFlvUrl = (
    (isTabletLikeWeb ? config.tabletFlvUrl : undefined) ||
    config.flvUrl ||
    config.fullscreenFlvUrl ||
    ""
  ).trim() || null;
  const fullscreenFlvUrl = (
    (isTabletLikeWeb ? config.tabletFullscreenFlvUrl : undefined) ||
    (isTabletLikeWeb ? config.tabletFlvUrl : undefined) ||
    config.fullscreenFlvUrl ||
    config.flvUrl ||
    ""
  ).trim() || null;
  const previewFmp4Url = (
    (isTabletLikeWeb ? config.tabletFmp4Url : undefined) ||
    config.fmp4Url ||
    config.fullscreenFmp4Url ||
    ""
  ).trim() || null;
  const fullscreenFmp4Url = (
    (isTabletLikeWeb ? config.tabletFullscreenFmp4Url : undefined) ||
    (isTabletLikeWeb ? config.tabletFmp4Url : undefined) ||
    config.fullscreenFmp4Url ||
    config.fmp4Url ||
    ""
  ).trim() || null;
  const requestedPreviewSourceMode = isTabletLikeWeb
    ? config.tabletPreviewSourceMode || config.previewSourceMode
    : config.previewSourceMode;
  const requestedFullscreenSourceMode = isTabletLikeWeb
    ? config.tabletFullscreenSourceMode || config.fullscreenSourceMode
    : config.fullscreenSourceMode;
  const previewSourceMode = resolveSourceMode(
    requestedPreviewSourceMode,
    previewSnapshotBaseUrl,
    previewMjpegUrl,
    previewFlvUrl,
    previewFmp4Url
  );
  const fullscreenSourceMode = resolveSourceMode(
    requestedFullscreenSourceMode,
    fullscreenSnapshotBaseUrl,
    fullscreenMjpegUrl,
    fullscreenFlvUrl,
    fullscreenFmp4Url,
    previewSourceMode
  );

  const previewFeed = resolveCameraFeed({
    sourceMode: previewSourceMode,
    snapshotUrl: previewSnapshotBaseUrl,
    mjpegUrl: previewMjpegUrl,
    flvUrl: previewFlvUrl,
    fmp4Url: previewFmp4Url,
  });
  const fullscreenFeed = resolveCameraFeed({
    sourceMode: fullscreenSourceMode,
    snapshotUrl: fullscreenSnapshotBaseUrl,
    mjpegUrl: fullscreenMjpegUrl,
    flvUrl: fullscreenFlvUrl,
    fmp4Url: fullscreenFmp4Url,
  });
  const activeFeed = fullscreenOpen ? fullscreenFeed : previewFeed;
  const activeSnapshotBaseUrl = activeFeed?.kind === "snapshot" ? activeFeed.url : null;
  const previewMjpegSources = useMemo(
    () =>
      previewFeed?.kind === "mjpeg"
        ? buildWebStreamSources(previewFeed.url, "mjpeg")
        : [],
    [previewFeed?.kind, previewFeed?.url]
  );
  const fullscreenMjpegSources = useMemo(
    () =>
      fullscreenFeed?.kind === "mjpeg"
        ? buildWebStreamSources(fullscreenFeed.url, "mjpeg")
        : [],
    [fullscreenFeed?.kind, fullscreenFeed?.url]
  );
  const previewFlvSources = useMemo(
    () =>
      previewFeed?.kind === "flv"
        ? buildWebStreamSources(previewFeed.url, "flv")
        : [],
    [previewFeed?.kind, previewFeed?.url]
  );
  const fullscreenFlvSources = useMemo(
    () =>
      fullscreenFeed?.kind === "flv"
        ? buildWebStreamSources(fullscreenFeed.url, "flv")
        : [],
    [fullscreenFeed?.kind, fullscreenFeed?.url]
  );
  const previewFmp4Sources = useMemo(
    () =>
      previewFeed?.kind === "fmp4"
        ? buildWebStreamSources(previewFeed.url, "fmp4")
        : [],
    [previewFeed?.kind, previewFeed?.url]
  );
  const fullscreenFmp4Sources = useMemo(
    () =>
      fullscreenFeed?.kind === "fmp4"
        ? buildWebStreamSources(fullscreenFeed.url, "fmp4")
        : [],
    [fullscreenFeed?.kind, fullscreenFeed?.url]
  );
  const previewFeedKey = `${previewFeed?.kind || "none"}:${previewFeed?.url || ""}`;
  const fullscreenFeedKey = `${fullscreenFeed?.kind || "none"}:${fullscreenFeed?.url || ""}`;
  const currentPreviewMjpegSrc = previewMjpegSources[Math.min(previewMjpegSourceIndex, Math.max(0, previewMjpegSources.length - 1))] || null;
  const currentFullscreenMjpegSrc =
    fullscreenMjpegSources[Math.min(fullscreenMjpegSourceIndex, Math.max(0, fullscreenMjpegSources.length - 1))] || null;
  const currentPreviewFlvSrc = previewFlvSources[Math.min(previewFlvSourceIndex, Math.max(0, previewFlvSources.length - 1))] || null;
  const currentFullscreenFlvSrc =
    fullscreenFlvSources[Math.min(fullscreenFlvSourceIndex, Math.max(0, fullscreenFlvSources.length - 1))] || null;
  const currentPreviewFmp4Src =
    previewFmp4Sources[Math.min(previewFmp4SourceIndex, Math.max(0, previewFmp4Sources.length - 1))] || null;
  const currentFullscreenFmp4Src =
    fullscreenFmp4Sources[Math.min(fullscreenFmp4SourceIndex, Math.max(0, fullscreenFmp4Sources.length - 1))] || null;
  const activeRefreshMs = fullscreenOpen
    ? Math.max(180, config.fullscreenRefreshMs || config.refreshMs || 2000)
    : Math.max(100, config.refreshMs || 2000);
  const previewMjpegHasFallback = previewMjpegSourceIndex + 1 < previewMjpegSources.length;
  const fullscreenMjpegHasFallback = fullscreenMjpegSourceIndex + 1 < fullscreenMjpegSources.length;

  const closeFullscreen = () => {
    if (previewMjpegResumeTimerRef.current) {
      clearTimeout(previewMjpegResumeTimerRef.current);
      previewMjpegResumeTimerRef.current = null;
    }
    if (previewFeed?.kind === "mjpeg") {
      setPreviewMjpegLoaded(false);
      setPreviewMjpegSourceIndex(0);
      setPreviewMjpegPaused(true);
      setPreviewStreamDebug("MJPEG Preview: Warte auf Stream-Freigabe...");
      previewMjpegResumeTimerRef.current = setTimeout(() => {
        setPreviewMjpegPaused(false);
        // On minimize, re-init exactly like an initial load.
        setPreviewMjpegLoaded(false);
        setPreviewMjpegSourceIndex(0);
        setPreviewStreamDebug(null);
        setPreviewMjpegSession((current) => current + 1);
        previewMjpegResumeTimerRef.current = null;
      }, MJPEG_PREVIEW_RESUME_DELAY_MS);
    }
    if (previewFeed?.kind === "flv") {
      // Restart preview immediately to keep max/min transitions snappy on tablet.
      setPreviewFlvSession((current) => current + 1);
    }
    fullscreenVisibilityCallbackRef.current?.(false);
    setFullscreenOpen(false);
    setPinned(false);
  };

  const movePreviewMjpegToNextSource = useCallback(() => {
    if (!previewMjpegHasFallback) {
      return false;
    }
    setPreviewMjpegLoaded(false);
    setPreviewMjpegSourceIndex((current) => Math.min(previewMjpegSources.length - 1, current + 1));
    setPreviewStreamDebug("MJPEG Preview: Quelle fehlgeschlagen, versuche alternative Quelle...");
    return true;
  }, [previewMjpegHasFallback, previewMjpegSources.length]);

  const restartPreviewMjpeg = useCallback((message = "MJPEG Preview: Neuverbindung...") => {
    setPreviewMjpegLoaded(false);
    setPreviewMjpegSourceIndex((current) =>
      previewMjpegSources.length > 1 ? (current + 1) % previewMjpegSources.length : 0
    );
    setPreviewStreamDebug(message);
    setPreviewMjpegSession((current) => current + 1);
  }, [previewMjpegSources.length]);

  const moveFullscreenMjpegToNextSource = useCallback(() => {
    if (!fullscreenMjpegHasFallback) {
      return false;
    }
    setFullscreenMjpegLoaded(false);
    setFullscreenMjpegSourceIndex((current) => Math.min(fullscreenMjpegSources.length - 1, current + 1));
    return true;
  }, [fullscreenMjpegHasFallback, fullscreenMjpegSources.length]);

  const openFullscreen = () => {
    setFullscreenSession((current) => current + 1);
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
      if (fullscreenOpen) {
        setPreviewMjpegPaused(true);
      } else {
        setPreviewMjpegPaused(false);
      }
    }
  }, [fullscreenOpen, previewFeed?.kind]);

  useEffect(() => {
    setPreviewMjpegSourceIndex(0);
    setPreviewMjpegLoaded(false);
    setPreviewMjpegPaused(false);
  }, [previewMjpegSources, previewFeed?.kind, previewFeed?.url]);

  useEffect(() => {
    // Force a clean preview re-init when source mode/url changes so updates apply instantly.
    loadingJobRef.current = null;
    latestRequestedUrlRef.current = null;
    hasReportedAspectRatio.current = false;
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
    setPreviewFlvSourceIndex(0);
  }, [previewFlvSources, previewFeed?.kind, previewFeed?.url]);

  useEffect(() => {
    setFullscreenFlvSourceIndex(0);
  }, [fullscreenFlvSources, fullscreenFeed?.kind, fullscreenFeed?.url]);

  useEffect(() => {
    setPreviewFmp4SourceIndex(0);
  }, [previewFmp4Sources, previewFeed?.kind, previewFeed?.url]);

  useEffect(() => {
    setFullscreenFmp4SourceIndex(0);
  }, [fullscreenFmp4Sources, fullscreenFeed?.kind, fullscreenFeed?.url]);

  useEffect(() => {
    if (Platform.OS !== "web" || fullscreenOpen || previewMjpegPaused || previewFeed?.kind !== "mjpeg" || !currentPreviewMjpegSrc) {
      return;
    }

    const watchdog = setTimeout(() => {
      if (previewMjpegLoaded) {
        return;
      }
      if (movePreviewMjpegToNextSource()) {
        return;
      }
      restartPreviewMjpeg();
    }, MJPEG_SOURCE_SWITCH_TIMEOUT_MS);

    return () => clearTimeout(watchdog);
  }, [
    currentPreviewMjpegSrc,
    fullscreenOpen,
    movePreviewMjpegToNextSource,
    previewMjpegPaused,
    previewFeed?.kind,
    previewMjpegLoaded,
    restartPreviewMjpeg,
  ]);

  useEffect(() => {
    if (Platform.OS !== "web" || !fullscreenOpen || fullscreenFeed?.kind !== "mjpeg" || !currentFullscreenMjpegSrc) {
      return;
    }

    const watchdog = setTimeout(() => {
      if (fullscreenMjpegLoaded) {
        return;
      }
      moveFullscreenMjpegToNextSource();
    }, MJPEG_SOURCE_SWITCH_TIMEOUT_MS);

    return () => clearTimeout(watchdog);
  }, [
    currentFullscreenMjpegSrc,
    fullscreenFeed?.kind,
    fullscreenMjpegLoaded,
    fullscreenOpen,
    moveFullscreenMjpegToNextSource,
  ]);

  useEffect(() => {
    if (
      Platform.OS !== "web" ||
      fullscreenOpen ||
      previewMjpegPaused ||
      previewFeed?.kind !== "mjpeg" ||
      previewMjpegLoaded ||
      !previewStreamDebug
    ) {
      return;
    }

    const retry = setTimeout(() => {
      restartPreviewMjpeg();
    }, MJPEG_RECONNECT_DELAY_MS);

    return () => clearTimeout(retry);
  }, [fullscreenOpen, previewMjpegPaused, previewFeed?.kind, previewMjpegLoaded, previewStreamDebug, restartPreviewMjpeg]);

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
    return () => {
      if (previewMjpegResumeTimerRef.current) {
        clearTimeout(previewMjpegResumeTimerRef.current);
      }
    };
  }, []);

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

    if (config.snapshotAspectRatio) {
      hasReportedAspectRatio.current = true;
      return;
    }

    hasReportedAspectRatio.current = true;
    onAspectRatioDetected(ratio);
  }, [config.snapshotAspectRatio, onAspectRatioDetected]);

  const reportAspectRatioValue = useCallback((ratio: number) => {
    if (!Number.isFinite(ratio) || ratio <= 0) {
      return;
    }
    reportAspectRatio(ratio, 1);
  }, [reportAspectRatio]);

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
            {!fullscreenOpen && !previewMjpegPaused && previewFeed.kind === "mjpeg" && previewFeed.url
              ? Platform.OS === "web"
                ? createElement("img", {
                    alt: config.title || "Camera MJPEG",
                    decoding: "sync",
                    draggable: false,
                    key: `preview-mjpeg-${currentPreviewMjpegSrc || previewFeed.url}:${previewMjpegSession}`,
                    loading: "eager",
                    onError: () => {
                      if (movePreviewMjpegToNextSource()) {
                        return;
                      }
                      restartPreviewMjpeg("MJPEG Preview: Quelle nicht erreichbar, Neuverbindung...");
                    },
                    onLoad: (event: Event) => {
                      const target = event.currentTarget as HTMLImageElement | null;
                      const width = target?.naturalWidth || 0;
                      const height = target?.naturalHeight || 0;
                      if (!width || !height) {
                        if (movePreviewMjpegToNextSource()) {
                          return;
                        }
                        restartPreviewMjpeg("MJPEG Preview: Ungueltige Bilddaten, Neuverbindung...");
                        return;
                      }
                      setPreviewMjpegLoaded(true);
                      setPreviewStreamDebug(null);
                      reportAspectRatio(width, height);
                    },
                    src: withReconnectNonce(currentPreviewMjpegSrc || previewFeed.url, previewMjpegSession),
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
                      resizeMode="contain"
                      source={{ uri: withReconnectNonce(previewFeed.url, previewMjpegSession) }}
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
                      key={`preview-flv-${previewFeedKey}:${previewFlvSession}`}
                      onAspectRatioDetected={reportAspectRatioValue}
                      onSourceIndexChange={setPreviewFlvSourceIndex}
                      preferredSourceIndex={previewFlvSourceIndex}
                      sources={previewFlvSources.length ? previewFlvSources : [previewFeed.url]}
                      title={config.title || "Camera FLV"}
                    />
                  )
                : (
                    <View style={styles.empty}>
                      <Text style={[styles.emptyText, { color: mutedTextColor }]}>FLV wird nur im Web unterstuetzt.</Text>
                    </View>
                  )
              : null}
            {!fullscreenOpen && previewFeed.kind === "fmp4" && previewFeed.url
              ? Platform.OS === "web"
                ? (
                    <WebFmp4Player
                      key={`preview-fmp4-${previewFeedKey}:${currentPreviewFmp4Src || "none"}`}
                      onAspectRatioDetected={reportAspectRatioValue}
                      onSourceIndexChange={setPreviewFmp4SourceIndex}
                      preferredSourceIndex={previewFmp4SourceIndex}
                      sources={previewFmp4Sources.length ? previewFmp4Sources : [previewFeed.url]}
                      title={config.title || "Camera fMP4"}
                    />
                  )
                : (
                    <View style={styles.empty}>
                      <Text style={[styles.emptyText, { color: mutedTextColor }]}>fMP4 wird nur im Web unterstuetzt.</Text>
                    </View>
                  )
              : null}
            {config.showTitle !== false && config.title ? (
              <View style={styles.titleBadge}>
                <Text numberOfLines={1} style={[styles.titleBadgeLabel, { color: textColor, fontSize: titleFontSize }]}>
                  {config.title}
                </Text>
              </View>
            ) : null}
          </View>
        ) : (
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: mutedTextColor }]}>
              {previewSnapshotBaseUrl || previewMjpegUrl || previewFlvUrl || previewFmp4Url ? "Stream wird geladen..." : "Kein Stream konfiguriert"}
            </Text>
          </View>
        )}
        </Pressable>
        {!previewFeed && !previewSnapshotBaseUrl && !previewMjpegUrl && !previewFlvUrl && !previewFmp4Url ? (
          <Text style={[styles.hint, { color: mutedTextColor }]}>Widget ist noch nicht konfiguriert.</Text>
        ) : null}
      </View>
      <Modal
        animationType={
          Platform.OS === "web"
            ? "none"
            : "none"
        }
        transparent
        visible={fullscreenOpen}
      >
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
                    key: `fullscreen-mjpeg-${currentFullscreenMjpegSrc || fullscreenFeed.url}:${fullscreenSession}`,
                    loading: "eager",
                    onError: () => {
                      if (moveFullscreenMjpegToNextSource()) {
                        return;
                      }
                      setFullscreenMjpegLoaded(false);
                    },
                    onLoad: (event: Event) => {
                      const target = event.currentTarget as HTMLImageElement | null;
                      const width = target?.naturalWidth || 0;
                      const height = target?.naturalHeight || 0;
                      if (!width || !height) {
                        if (moveFullscreenMjpegToNextSource()) {
                          return;
                        }
                        setFullscreenMjpegLoaded(false);
                        return;
                      }
                      setFullscreenMjpegLoaded(true);
                      reportAspectRatio(width, height);
                    },
                    src: withReconnectNonce(currentFullscreenMjpegSrc || fullscreenFeed.url, fullscreenSession),
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
                      key={`fullscreen-flv-${fullscreenFeedKey}:${fullscreenSession}`}
                      fullScreen
                      onAspectRatioDetected={reportAspectRatioValue}
                      onSourceIndexChange={setFullscreenFlvSourceIndex}
                      preferredSourceIndex={fullscreenFlvSourceIndex}
                      sources={fullscreenFlvSources.length ? fullscreenFlvSources : [fullscreenFeed.url]}
                      title={config.title || "Camera FLV fullscreen"}
                    />
                  )
                : (
                    <View style={styles.empty}>
                      <Text style={[styles.emptyText, { color: mutedTextColor }]}>FLV wird nur im Web unterstuetzt.</Text>
                    </View>
                  )
              : null}
            {fullscreenFeed?.kind === "fmp4" && fullscreenFeed.url
              ? Platform.OS === "web"
                ? (
                    <WebFmp4Player
                      key={`fullscreen-fmp4-${fullscreenFeedKey}:${currentFullscreenFmp4Src || "none"}`}
                      fullScreen
                      onAspectRatioDetected={reportAspectRatioValue}
                      onSourceIndexChange={setFullscreenFmp4SourceIndex}
                      preferredSourceIndex={fullscreenFmp4SourceIndex}
                      sources={fullscreenFmp4Sources.length ? fullscreenFmp4Sources : [fullscreenFeed.url]}
                      title={config.title || "Camera fMP4 fullscreen"}
                    />
                  )
                : (
                    <View style={styles.empty}>
                      <Text style={[styles.emptyText, { color: mutedTextColor }]}>fMP4 wird nur im Web unterstuetzt.</Text>
                    </View>
                  )
              : null}
          </View>
          {config.showTitle !== false && config.title ? (
            <View style={styles.fullscreenTitle}>
              <Text style={[styles.titleBadgeLabel, { color: textColor, fontSize: titleFontSize }]}>{config.title}</Text>
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
  sourceMode: "snapshot" | "mjpeg" | "flv" | "fmp4";
  snapshotUrl: string | null;
  mjpegUrl: string | null;
  flvUrl: string | null;
  fmp4Url: string | null;
}) {
  const sourcePriority =
    input.sourceMode === "snapshot"
      ? [
          { kind: "snapshot" as const, url: input.snapshotUrl },
          { kind: "mjpeg" as const, url: input.mjpegUrl },
          { kind: "flv" as const, url: input.flvUrl },
          { kind: "fmp4" as const, url: input.fmp4Url },
        ]
      : input.sourceMode === "mjpeg"
        ? [
            { kind: "mjpeg" as const, url: input.mjpegUrl },
            { kind: "snapshot" as const, url: input.snapshotUrl },
            { kind: "flv" as const, url: input.flvUrl },
            { kind: "fmp4" as const, url: input.fmp4Url },
          ]
        : input.sourceMode === "flv"
          ? [
              { kind: "flv" as const, url: input.flvUrl },
              { kind: "mjpeg" as const, url: input.mjpegUrl },
              { kind: "snapshot" as const, url: input.snapshotUrl },
              { kind: "fmp4" as const, url: input.fmp4Url },
            ]
          : [
              { kind: "fmp4" as const, url: input.fmp4Url },
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
  fmp4Url: string | null,
  fallback: "snapshot" | "mjpeg" | "flv" | "fmp4" = "snapshot"
) {
  if (sourceMode === "snapshot" || sourceMode === "mjpeg" || sourceMode === "flv" || sourceMode === "fmp4") {
    return sourceMode;
  }

  if (snapshotUrl && !mjpegUrl && !flvUrl && !fmp4Url) {
    return "snapshot";
  }

  if (mjpegUrl && !snapshotUrl && !flvUrl && !fmp4Url) {
    return "mjpeg";
  }

  if (flvUrl && !snapshotUrl && !mjpegUrl && !fmp4Url) {
    return "flv";
  }

  if (fmp4Url && !snapshotUrl && !mjpegUrl && !flvUrl) {
    return "fmp4";
  }

  return fallback;
}

function getWebStreamProxyUrls(targetUrl: string, streamType: "mjpeg" | "flv" | "fmp4") {
  if (Platform.OS !== "web" || typeof window === "undefined") {
    return [];
  }

  const encodedUrl = encodeURIComponent(targetUrl);
  if (streamType === "mjpeg") {
    return [
      `${window.location.origin}/smarthome-dashboard/api/camera-stream?streamType=${streamType}&url=${encodedUrl}`,
      `${window.location.origin}/smarthome-dashboard/api/camera-mjpeg?streamType=${streamType}&url=${encodedUrl}`,
    ];
  }

  return [`${window.location.origin}/smarthome-dashboard/api/camera-stream?streamType=${streamType}&url=${encodedUrl}`];
}

function buildWebStreamSources(targetUrl: string, streamType: "mjpeg" | "flv" | "fmp4") {
  const includeDirect = shouldUseDirectWebStream(targetUrl, streamType);
  const proxySources = getWebStreamProxyUrls(targetUrl, streamType);
  const sources = [...proxySources, ...(includeDirect ? [targetUrl] : [])];
  return Array.from(new Set(sources.filter(Boolean)));
}

function withReconnectNonce(url: string, nonce: number) {
  if (!url) {
    return url;
  }
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("_r", String(nonce));
    return parsed.toString();
  } catch {
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}_r=${nonce}`;
  }
}

function shouldUseDirectWebStream(targetUrl: string, streamType: "mjpeg" | "flv" | "fmp4") {
  if (Platform.OS !== "web" || typeof window === "undefined") {
    return true;
  }

  try {
    const parsed = new URL(targetUrl);
    const hasEmbeddedCredentials = Boolean(parsed.username || parsed.password);
    const hasQueryCredentials =
      Boolean(parsed.searchParams.get("user")) ||
      Boolean(parsed.searchParams.get("username")) ||
      Boolean(parsed.searchParams.get("password")) ||
      Boolean(parsed.searchParams.get("pass"));
    const mixedContentBlocked = window.location.protocol === "https:" && parsed.protocol === "http:";

    // Mixed-content is blocked on HTTPS pages.
    if (mixedContentBlocked) {
      return false;
    }

    // For MJPEG we still allow a direct fallback after proxy (many cameras work only directly).
    if ((streamType === "mjpeg" || streamType === "fmp4") && (hasEmbeddedCredentials || hasQueryCredentials)) {
      return true;
    }

    // For FLV with URL credentials we keep proxy-only by default.
    if (hasEmbeddedCredentials || hasQueryCredentials) {
      return false;
    }
  } catch {
    // Keep fallback path when URL parsing fails.
  }

  return true;
}

function isMixedContentBlocked(targetUrl: string) {
  if (Platform.OS !== "web" || typeof window === "undefined") {
    return false;
  }
  try {
    const parsed = new URL(targetUrl);
    return window.location.protocol === "https:" && parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function WebFlvPlayer({
  sources,
  title,
  fullScreen = false,
  onAspectRatioDetected,
  preferredSourceIndex = 0,
  onSourceIndexChange,
}: {
  sources: string[];
  title: string;
  fullScreen?: boolean;
  onAspectRatioDetected?: (ratio: number) => void;
  preferredSourceIndex?: number;
  onSourceIndexChange?: (index: number) => void;
}) {
  const videoRef = useRef<any>(null);
  const setVideoRef = useCallback((element: any) => {
    videoRef.current = element;
  }, []);
  const playerRef = useRef<any>(null);
  const ratioReportedRef = useRef(false);
  const aspectRatioCallbackRef = useRef(onAspectRatioDetected);
  const normalizedSources = useMemo(
    () => Array.from(new Set((sources || []).map((entry) => (entry || "").trim()).filter(Boolean))),
    [sources]
  );
  const maxSourceIndex = Math.max(0, normalizedSources.length - 1);
  const [sourceIndex, setSourceIndex] = useState(Math.min(preferredSourceIndex, maxSourceIndex));
  const [restartNonce, setRestartNonce] = useState(0);
  const currentSource = normalizedSources[Math.min(sourceIndex, maxSourceIndex)] || "";
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasVideoFrame, setHasVideoFrame] = useState(false);

  useEffect(() => {
    aspectRatioCallbackRef.current = onAspectRatioDetected;
  }, [onAspectRatioDetected]);

  useEffect(() => {
    const next = Math.min(preferredSourceIndex, maxSourceIndex);
    setSourceIndex(next);
  }, [maxSourceIndex, preferredSourceIndex]);

  useEffect(() => {
    onSourceIndexChange?.(sourceIndex);
  }, [onSourceIndexChange, sourceIndex]);

  useEffect(() => {
    setErrorMessage(null);
    setHasVideoFrame(false);
  }, [currentSource]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") {
      return;
    }

    let disposed = false;
    let player: any = null;
    let retryTimer: ReturnType<typeof setInterval> | null = null;
    let watchdogTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    const videoElement = videoRef.current;

    const safeSetError = (message: string) => {
      if (!disposed) {
        setErrorMessage(message);
      }
    };

    const scheduleReconnect = (message: string) => {
      safeSetError(message);
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      reconnectTimer = setTimeout(() => {
        if (disposed) {
          return;
        }
        setRestartNonce((current) => current + 1);
      }, FLV_RECONNECT_DELAY_MS);
    };

    const moveToNextSource = (message: string) => {
      if (sourceIndex + 1 < normalizedSources.length) {
        setSourceIndex((current) => Math.min(normalizedSources.length - 1, current + 1));
        safeSetError(message);
        return true;
      }
      return false;
    };

    const tryPlay = () => {
      if (!videoElement || disposed) {
        return;
      }
      try {
        if (playerRef.current?.play) {
          playerRef.current.play();
        }
      } catch {
        // ignore
      }
      void videoElement.play().catch(() => {
        // Ignore autoplay rejections; retry loop handles late-ready starts.
      });
    };

    const attach = async () => {
      if (!videoElement || !currentSource) {
        safeSetError("FLV Stream URL fehlt.");
        return;
      }

      ratioReportedRef.current = false;
      const loaded = await ensureFlvJsLoaded();
      if (disposed || !loaded) {
        if (!moveToNextSource("FLV Quelle fehlgeschlagen, versuche alternative Quelle...")) {
          scheduleReconnect("FLV Player konnte nicht geladen werden, Neuverbindung...");
        }
        return;
      }

      if (!window.flvjs?.isSupported?.()) {
        safeSetError("FLV wird von diesem Browser nicht unterstuetzt.");
        return;
      }

      let switchedSource = false;
      player = window.flvjs.createPlayer(
        {
          type: "flv",
          isLive: true,
          url: currentSource,
        },
        {
          enableStashBuffer: false,
          lazyLoad: false,
        }
      );
      playerRef.current = player;

      if (window.flvjs?.Events?.ERROR) {
        player.on(window.flvjs.Events.ERROR, (errorType: string, errorDetail: string) => {
          if (switchedSource || disposed) {
            return;
          }
          switchedSource = true;
          const detail = [errorType, errorDetail].filter(Boolean).join(" / ");
          if (moveToNextSource("FLV Quelle fehlgeschlagen, versuche alternative Quelle...")) {
            return;
          }
          scheduleReconnect(
            detail
              ? `FLV Stream konnte nicht gestartet werden (${detail}), Neuverbindung...`
              : "FLV Stream konnte nicht gestartet werden, Neuverbindung..."
          );
        });
      }

      player.attachMediaElement(videoElement);
      videoElement.onloadedmetadata = () => {
        const callback = aspectRatioCallbackRef.current;
        if (ratioReportedRef.current || !callback) {
          return;
        }
        const width = Number(videoElement.videoWidth || 0);
        const height = Number(videoElement.videoHeight || 0);
        if (!width || !height) {
          return;
        }
        const ratio = width / height;
        if (!Number.isFinite(ratio) || ratio <= 0) {
          return;
        }
        ratioReportedRef.current = true;
        callback(ratio);
      };
      videoElement.oncanplay = () => {
        if (watchdogTimer) {
          clearTimeout(watchdogTimer);
          watchdogTimer = null;
        }
        setHasVideoFrame(true);
        tryPlay();
      };
      player.load();
      tryPlay();
      watchdogTimer = setTimeout(() => {
        if (disposed || switchedSource) {
          return;
        }
        const hasData = Number(videoElement.readyState || 0) >= 2;
        if (hasData) {
          return;
        }
        switchedSource = true;
        if (moveToNextSource("FLV Quelle fehlgeschlagen, versuche alternative Quelle...")) {
          return;
        }
        scheduleReconnect("FLV Stream konnte nicht gestartet werden, Neuverbindung...");
      }, MJPEG_SOURCE_SWITCH_TIMEOUT_MS);
      retryTimer = setInterval(() => {
        if (!videoElement || disposed || !videoElement.paused) {
          return;
        }
        tryPlay();
      }, 1200);
    };

    attach().catch(() => {
      if (!moveToNextSource("FLV Quelle fehlgeschlagen, versuche alternative Quelle...")) {
        scheduleReconnect("FLV Stream konnte nicht initialisiert werden, Neuverbindung...");
      }
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
        videoElement.onloadedmetadata = null;
        videoElement.oncanplay = null;
        videoElement.removeAttribute("src");
        videoElement.load();
      }
      if (retryTimer) {
        clearInterval(retryTimer);
      }
      if (watchdogTimer) {
        clearTimeout(watchdogTimer);
      }
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      playerRef.current = null;
    };
  }, [currentSource, normalizedSources.length, restartNonce, sourceIndex]);

  return (
    <>
      {createElement("video", {
        autoPlay: true,
        controls: false,
        muted: true,
        playsInline: true,
        ref: setVideoRef,
        style: fullScreen ? fullscreenWebFlvStyle : webFlvStyle,
        title,
      })}
      {!hasVideoFrame ? <View style={styles.flvLoadingOverlay} /> : null}
      {errorMessage ? (
        <View style={styles.flvErrorOverlay}>
          <Text style={styles.flvErrorText}>{errorMessage}</Text>
        </View>
      ) : null}
    </>
  );
}

function WebFmp4Player({
  sources,
  title,
  fullScreen = false,
  onAspectRatioDetected,
  preferredSourceIndex = 0,
  onSourceIndexChange,
}: {
  sources: string[];
  title: string;
  fullScreen?: boolean;
  onAspectRatioDetected?: (ratio: number) => void;
  preferredSourceIndex?: number;
  onSourceIndexChange?: (index: number) => void;
}) {
  const videoRef = useRef<any>(null);
  const setVideoRef = useCallback((element: any) => {
    videoRef.current = element;
  }, []);
  const ratioReportedRef = useRef(false);
  const aspectRatioCallbackRef = useRef(onAspectRatioDetected);
  const normalizedSources = useMemo(
    () => Array.from(new Set((sources || []).map((entry) => (entry || "").trim()).filter(Boolean))),
    [sources]
  );
  const maxSourceIndex = Math.max(0, normalizedSources.length - 1);
  const [sourceIndex, setSourceIndex] = useState(Math.min(preferredSourceIndex, maxSourceIndex));
  const currentSource = normalizedSources[Math.min(sourceIndex, maxSourceIndex)] || "";
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    aspectRatioCallbackRef.current = onAspectRatioDetected;
  }, [onAspectRatioDetected]);

  useEffect(() => {
    const next = Math.min(preferredSourceIndex, maxSourceIndex);
    setSourceIndex(next);
  }, [maxSourceIndex, preferredSourceIndex]);

  useEffect(() => {
    onSourceIndexChange?.(sourceIndex);
  }, [onSourceIndexChange, sourceIndex]);

  useEffect(() => {
    setErrorMessage(null);
    ratioReportedRef.current = false;
  }, [currentSource]);

  useEffect(() => {
    if (Platform.OS !== "web" || !currentSource) {
      return;
    }

    let disposed = false;
    const videoElement = videoRef.current as HTMLVideoElement | null;
    if (!videoElement) {
      return;
    }

    const moveToNextSource = (message: string) => {
      if (sourceIndex + 1 < normalizedSources.length) {
        setSourceIndex((current) => Math.min(normalizedSources.length - 1, current + 1));
        if (!disposed) {
          setErrorMessage(message);
        }
        return true;
      }
      return false;
    };

    const tryPlay = () => {
      void videoElement.play().catch(() => {
        // ignore autoplay issues
      });
    };

    const handleMetadata = () => {
      const callback = aspectRatioCallbackRef.current;
      if (ratioReportedRef.current || !callback) {
        return;
      }
      const width = Number(videoElement.videoWidth || 0);
      const height = Number(videoElement.videoHeight || 0);
      if (!width || !height) {
        return;
      }
      const ratio = width / height;
      if (!Number.isFinite(ratio) || ratio <= 0) {
        return;
      }
      ratioReportedRef.current = true;
      callback(ratio);
    };

    const handleError = () => {
      if (disposed) {
        return;
      }
      if (!moveToNextSource("fMP4 Quelle fehlgeschlagen, versuche alternative Quelle...")) {
        setErrorMessage("fMP4 Stream konnte nicht gestartet werden.");
      }
    };

    videoElement.addEventListener("loadedmetadata", handleMetadata);
    videoElement.addEventListener("canplay", tryPlay);
    videoElement.addEventListener("error", handleError);
    tryPlay();

    const watchdog = setTimeout(() => {
      if (disposed) {
        return;
      }
      const hasData = videoElement.readyState >= 2;
      if (!hasData) {
        handleError();
      }
    }, MJPEG_SOURCE_SWITCH_TIMEOUT_MS);

    return () => {
      disposed = true;
      clearTimeout(watchdog);
      videoElement.removeEventListener("loadedmetadata", handleMetadata);
      videoElement.removeEventListener("canplay", tryPlay);
      videoElement.removeEventListener("error", handleError);
    };
  }, [currentSource, normalizedSources.length, sourceIndex]);

  return (
    <>
      {createElement("video", {
        autoPlay: true,
        controls: false,
        muted: true,
        playsInline: true,
        ref: setVideoRef,
        src: currentSource || undefined,
        style: fullScreen ? fullscreenWebFmp4Style : webFmp4Style,
        title,
      })}
      {errorMessage ? (
        <View style={styles.flvErrorOverlay}>
          <Text style={styles.flvErrorText}>{errorMessage}</Text>
        </View>
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
      let settled = false;
      const settle = (value: boolean) => {
        if (settled) {
          return;
        }
        settled = true;
        resolve(value);
      };
      const timeout = setTimeout(() => settle(Boolean(window.flvjs)), FLV_SCRIPT_LOAD_TIMEOUT_MS);
      const existing = document.querySelector(`script[data-flvjs-src="${FLV_SCRIPT_SRC}"]`) as HTMLScriptElement | null;
      if (existing) {
        const readyState = (existing as HTMLScriptElement & { readyState?: string }).readyState;
        if (readyState === "loaded" || readyState === "complete") {
          clearTimeout(timeout);
          settle(Boolean(window.flvjs));
          return;
        }
        existing.addEventListener("load", () => {
          clearTimeout(timeout);
          settle(Boolean(window.flvjs));
        }, { once: true });
        existing.addEventListener("error", () => {
          clearTimeout(timeout);
          settle(false);
        }, { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = FLV_SCRIPT_SRC;
      script.async = true;
      script.dataset.flvjsSrc = FLV_SCRIPT_SRC;
      script.onload = () => {
        clearTimeout(timeout);
        settle(Boolean(window.flvjs));
      };
      script.onerror = () => {
        clearTimeout(timeout);
        settle(false);
      };
      document.head.appendChild(script);
    });
  }

  const loaded = await flvLoaderPromise;
  if (!loaded) {
    // Allow retries for later widgets if network/CDN was temporarily unavailable.
    flvLoaderPromise = null;
  }
  return loaded;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: "hidden",
  },
  preview: {
    flex: 1,
    minHeight: 0,
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
    zIndex: 12,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: "rgba(4, 8, 14, 0.44)",
    pointerEvents: "none",
    ...(Platform.OS === "web"
      ? {
          transform: "translateZ(0)" as const,
          willChange: "transform" as const,
          backfaceVisibility: "hidden" as const,
        }
      : null),
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
    padding: 0,
  },
  fullscreenImageLayer: {
    position: "absolute",
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
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
  flvLoadingOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "#000000",
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
  position: "absolute",
  left: 0,
  top: 0,
  width: "100%",
  height: "100%",
  objectFit: "scale-down",
  objectPosition: "center center",
  display: "block",
  backgroundColor: "#000000",
  pointerEvents: "none",
} as const;

const fullscreenWebMjpegStyle = {
  position: "absolute",
  left: 0,
  top: 0,
  width: "100%",
  height: "100%",
  objectFit: "contain",
  objectPosition: "center center",
  display: "block",
  backgroundColor: "#000000",
  pointerEvents: "none",
} as const;

const webFlvStyle = {
  width: "100%",
  height: "100%",
  objectFit: "contain",
  display: "block",
  backgroundColor: "#000000",
} as const;

const fullscreenWebFlvStyle = {
  width: "100%",
  height: "100%",
  objectFit: "contain",
  display: "block",
  backgroundColor: "#000000",
} as const;

const webFmp4Style = {
  width: "100%",
  height: "100%",
  objectFit: "contain",
  display: "block",
  backgroundColor: "#000000",
} as const;

const fullscreenWebFmp4Style = {
  width: "100%",
  height: "100%",
  objectFit: "contain",
  display: "block",
  backgroundColor: "#000000",
} as const;
