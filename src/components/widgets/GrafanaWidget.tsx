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

  if (Platform.OS !== "web") {
    return (
      <View style={styles.fallback}>
        <Text style={[styles.title, { color: textColor }]}>Grafana ist aktuell nur im Web eingebettet.</Text>
        <Text style={[styles.meta, { color: mutedTextColor }]}>{config.url || "Grafana-URL fehlt"}</Text>
      </View>
    );
  }

  if (!config.url) {
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
    src: config.url,
    style: webFrameStyle,
    sandbox: config.allowInteractions ? "allow-same-origin allow-scripts allow-forms allow-popups" : "allow-same-origin allow-scripts",
    referrerPolicy: "no-referrer",
  });
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
