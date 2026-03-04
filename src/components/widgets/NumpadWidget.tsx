import { Pressable, StyleSheet, Text, View } from "react-native";
import { NumpadWidgetConfig } from "../../types/dashboard";
import { playConfiguredUiSound } from "../../utils/uiSounds";

type NumpadWidgetProps = {
  config: NumpadWidgetConfig;
};

const ROWS = [
  ["7", "8", "9"],
  ["4", "5", "6"],
  ["1", "2", "3"],
  ["*", "0", "#"],
] as const;

export function NumpadWidget({ config }: NumpadWidgetProps) {
  const textColor = config.appearance?.textColor || "#1f1207";
  const panelColor = config.appearance?.cardColor || "#000000";
  const frameColor = config.appearance?.widgetColor || "#d8bea7";
  const keyColor = config.appearance?.cardColor2 || "#c79e7a";

  return (
    <View style={[styles.frame, { backgroundColor: frameColor }]}>
      <View style={[styles.panel, { backgroundColor: panelColor }]}>
        {ROWS.map((row, rowIndex) => (
          <View key={`row-${rowIndex}`} style={styles.row}>
            {row.map((symbol) => {
              const isZero = symbol === "0";
              return (
                <Pressable
                  key={symbol}
                  onPress={() => playConfiguredUiSound(config.interactionSounds?.press, "tap", `${config.id}:press:${symbol}`)}
                  style={({ pressed }) => [
                    styles.key,
                    isZero ? styles.keyWide : null,
                    { backgroundColor: keyColor },
                    pressed ? styles.keyPressed : null,
                  ]}
                >
                  <Text style={[styles.keyLabel, { color: textColor }]}>{symbol}</Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    flex: 1,
    borderRadius: 24,
    padding: 12,
  },
  panel: {
    flex: 1,
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 12,
    justifyContent: "center",
    gap: 10,
  },
  row: {
    flexDirection: "row",
    gap: 10,
  },
  key: {
    flex: 1,
    minHeight: 36,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  keyWide: {
    flex: 1.4,
  },
  keyPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  keyLabel: {
    fontSize: 30,
    lineHeight: 34,
    fontWeight: "800",
    letterSpacing: 0.6,
    textAlign: "center",
  },
});
