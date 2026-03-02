import { createElement } from "react";
import { useEffect, useMemo, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { GrafanaWidgetConfig } from "../../types/dashboard";
import { palette } from "../../utils/theme";

type GrafanaWidgetProps = {
  config: GrafanaWidgetConfig;
};

export function GrafanaWidget({ config }: GrafanaWidgetProps) {
  const textColor = config.appearance?.textColor || palette.text;
  const mutedTextColor = config.appearance?.mutedTextColor || palette.textMuted;
  const resolvedUrl = normalizeGrafanaUrl(config.url);
  const refreshMs = normalizeRefreshMs(config.refreshMs);
  const sandboxValue = config.allowInteractions === false ? "allow-same-origin allow-scripts" : undefined;
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (!refreshMs) {
      return;
    }

    const timer = setInterval(() => {
      setRefreshTick((current) => current + 1);
    }, refreshMs);

    return () => clearInterval(timer);
  }, [refreshMs]);

  const iframeUrl = useMemo(() => appendCacheBuster(resolvedUrl, refreshTick), [resolvedUrl, refreshTick]);

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

  return createElement("iframe", {
    src: iframeUrl,
    style: webFrameStyle,
    sandbox: sandboxValue,
    allow: "fullscreen; autoplay; clipboard-read; clipboard-write",
    allowFullScreen: true,
    loading: "eager",
    referrerPolicy: "no-referrer",
  });
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

function appendCacheBuster(url: string, refreshTick: number) {
  if (!url || refreshTick <= 0) {
    return url;
  }

  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}_smarthomeRefresh=${refreshTick}`;
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
});

const webFrameStyle = {
  width: "100%",
  height: "100%",
  border: "0",
  borderRadius: "0",
  background: "transparent",
  display: "block",
};
