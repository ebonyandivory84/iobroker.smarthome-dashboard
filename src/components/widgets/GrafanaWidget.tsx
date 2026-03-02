import { createElement } from "react";
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
  const sandboxValue = config.allowInteractions === false ? "allow-same-origin allow-scripts" : undefined;

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
    src: resolvedUrl,
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
  borderRadius: "16px",
  background: "rgba(0,0,0,0.18)",
};
