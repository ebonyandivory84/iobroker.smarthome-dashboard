import { createElement, useEffect, useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { GrafanaWidgetConfig } from "../../types/dashboard";
import { playConfiguredUiSound } from "../../utils/uiSounds";
import { palette } from "../../utils/theme";

type GrafanaWidgetProps = {
  config: GrafanaWidgetConfig;
};

export function GrafanaWidget({ config }: GrafanaWidgetProps) {
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const textColor = config.appearance?.textColor || palette.text;
  const mutedTextColor = config.appearance?.mutedTextColor || palette.textMuted;
  const resolvedUrl = normalizeGrafanaUrl(config.url);
  const iframeUrl = applyGrafanaRefresh(resolvedUrl, config.refreshMs);
  const interactionsAllowed = config.allowInteractions !== false;
  const sandboxValue = interactionsAllowed ? undefined : "allow-same-origin allow-scripts";

  useEffect(() => {
    if (Platform.OS !== "web" || !resolvedUrl) {
      setPreviewReady(false);
      return;
    }

    const timer = setTimeout(() => setPreviewReady(true), 700);
    return () => clearTimeout(timer);
  }, [resolvedUrl]);

  const openFullscreen = () => {
    if (!resolvedUrl) {
      return;
    }
    setPreviewReady(true);
    playConfiguredUiSound(config.interactionSounds?.press, "panel", `${config.id}:press`);
    playConfiguredUiSound(config.interactionSounds?.open, "open", `${config.id}:open`);
    setFullscreenOpen(true);
  };

  const closeFullscreen = () => {
    playConfiguredUiSound(config.interactionSounds?.close, "close", `${config.id}:close`);
    setFullscreenOpen(false);
  };

  if (Platform.OS !== "web") {
    return (
      <View style={styles.fallback}>
        <Text style={[styles.title, { color: textColor }]}>Grafana ist aktuell nur im Web eingebettet.</Text>
        <Text style={[styles.meta, { color: mutedTextColor }]}>{resolvedUrl || "Grafana-URL fehlt"}</Text>
      </View>
    );
  }

  if (!resolvedUrl) {
    return (
      <View style={styles.fallback}>
        <Text style={[styles.title, { color: textColor }]}>Grafana-URL fehlt</Text>
        <Text style={[styles.meta, { color: mutedTextColor }]}>
          Trage im Widget eine Panel- oder Dashboard-URL ein.
        </Text>
      </View>
    );
  }

  return (
    <>
      {createElement(
        "div",
        {
          style: webFrameWrapStyle,
        },
        createElement("iframe", {
          src: previewReady ? iframeUrl : "about:blank",
          style: webPreviewFrameStyle,
          sandbox: sandboxValue,
          allow: "fullscreen; autoplay; clipboard-read; clipboard-write",
          allowFullScreen: true,
          loading: "lazy",
          referrerPolicy: "no-referrer",
        }),
        createElement(
          "div",
          {
            onPointerDown: openFullscreen,
            style: webFullscreenOverlayButtonStyle,
            title: "Grafana im Vollbild anzeigen",
            "aria-label": "Grafana im Vollbild anzeigen",
            role: "button",
            tabIndex: 0,
            onKeyDown: (event: { key?: string }) => {
              if (event.key === "Enter" || event.key === " ") {
                openFullscreen();
              }
            },
          },
          null
        )
      )}
      <Modal animationType={Platform.OS === "web" ? "fade" : "slide"} transparent visible={fullscreenOpen}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSurface}>
            <View style={styles.modalHeader}>
              <Text numberOfLines={1} style={[styles.modalTitle, { color: textColor }]}>
                {config.title || "Grafana"}
              </Text>
              <Pressable onPress={closeFullscreen} style={styles.modalButton}>
                <Text style={[styles.modalButtonLabel, { color: textColor }]}>Schliessen</Text>
              </Pressable>
            </View>
            {createElement("iframe", {
              src: iframeUrl,
              style: {
                ...webFullscreenFrameStyle,
                pointerEvents: interactionsAllowed ? "auto" : "none",
              },
              sandbox: sandboxValue,
              allow: "fullscreen; autoplay; clipboard-read; clipboard-write",
              allowFullScreen: true,
              loading: "eager",
              referrerPolicy: "no-referrer",
            })}
          </View>
        </View>
      </Modal>
    </>
  );
}

function normalizeGrafanaUrl(value?: string) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return "";
  }

  if (trimmed.startsWith("<")) {
    const match = trimmed.match(/src\s*=\s*["']([^"']+)["']/i);
    if (match?.[1]) {
      return match[1];
    }
  }

  return trimmed;
}

function normalizeRefreshMs(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.round(value));
}

function applyGrafanaRefresh(url: string, refreshMs?: number) {
  if (!url) {
    return url;
  }

  if (/[?&]refresh=/.test(url)) {
    return url;
  }

  const normalizedRefreshMs = normalizeRefreshMs(refreshMs);
  if (!normalizedRefreshMs) {
    return url;
  }

  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}refresh=${toGrafanaRefreshValue(normalizedRefreshMs)}`;
}

function toGrafanaRefreshValue(refreshMs: number) {
  if (refreshMs < 1000) {
    return "1s";
  }

  if (refreshMs < 60000) {
    return `${Math.max(1, Math.round(refreshMs / 1000))}s`;
  }

  if (refreshMs < 3600000) {
    return `${Math.max(1, Math.round(refreshMs / 60000))}m`;
  }

  return `${Math.max(1, Math.round(refreshMs / 3600000))}h`;
}

const styles = StyleSheet.create({
  fallback: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    backgroundColor: "rgba(0,0,0,0.18)",
    padding: 14,
    justifyContent: "center",
  },
  title: {
    color: palette.text,
    fontSize: 16,
    fontWeight: "700",
  },
  meta: {
    color: palette.textMuted,
    marginTop: 8,
    lineHeight: 18,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.94)",
    padding: 18,
  },
  modalSurface: {
    flex: 1,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "rgba(4, 10, 18, 1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  modalHeader: {
    height: 56,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  modalTitle: {
    flex: 1,
    marginRight: 12,
    color: palette.text,
    fontSize: 16,
    fontWeight: "800",
  },
  modalButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  modalButtonLabel: {
    color: palette.text,
    fontSize: 12,
    fontWeight: "700",
  },
});

const webFrameWrapStyle = {
  width: "100%",
  height: "100%",
  position: "relative",
};

const webPreviewFrameStyle = {
  width: "100%",
  height: "100%",
  border: "0",
  borderRadius: "0",
  background: "transparent",
  display: "block",
  pointerEvents: "none",
};

const webFullscreenFrameStyle = {
  width: "100%",
  height: "calc(100% - 56px)",
  border: "0",
  display: "block",
  background: "transparent",
};

const webFullscreenOverlayButtonStyle = {
  position: "absolute",
  inset: 0,
  zIndex: 2,
  border: "0",
  background: "transparent",
  cursor: "zoom-in",
  padding: 0,
};
