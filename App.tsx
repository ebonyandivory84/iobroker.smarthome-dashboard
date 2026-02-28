import { SafeAreaView, StatusBar, StyleSheet, View } from "react-native";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import { DashboardConfigProvider } from "./src/context/DashboardConfigContext";
import { DashboardScreen } from "./src/screens/DashboardScreen";
import { palette } from "./src/utils/theme";

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

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.background,
  },
  app: {
    flex: 1,
  },
});
