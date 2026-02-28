import { Platform, SafeAreaView, StatusBar, StyleSheet, Text, TextInput, View } from "react-native";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import { DashboardConfigProvider } from "./src/context/DashboardConfigContext";
import { DashboardScreen } from "./src/screens/DashboardScreen";
import { palette } from "./src/utils/theme";

const defaultFontFamily = Platform.OS === "web" ? "Arial, sans-serif" : "Arial";

applyDefaultFont(Text as unknown as { defaultProps?: Record<string, unknown> });
applyDefaultFont(TextInput as unknown as { defaultProps?: Record<string, unknown> });

export default function App() {
  return (
    <DashboardConfigProvider>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" />
        <ExpoStatusBar style="light" />
        <View style={styles.app}>
          <DashboardScreen />
        </View>
      </SafeAreaView>
    </DashboardConfigProvider>
  );
}

function applyDefaultFont(component: { defaultProps?: Record<string, unknown> }) {
  const nextDefaultProps = component.defaultProps || {};
  const existingStyle = nextDefaultProps.style;
  component.defaultProps = {
    ...nextDefaultProps,
    style: existingStyle ? [{ fontFamily: defaultFontFamily }, existingStyle] : { fontFamily: defaultFontFamily },
  };
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.background,
  },
  app: {
    flex: 1,
  },
});
