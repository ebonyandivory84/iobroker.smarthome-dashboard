import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  PropsWithChildren,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { DashboardSettings, WidgetConfig } from "../types/dashboard";
import { defaultConfig } from "../utils/defaultConfig";

type DashboardConfigContextValue = {
  config: DashboardSettings;
  rawJson: string;
  updateConfigFromJson: (nextJson: string) => { ok: boolean; error?: string };
  patchConfig: (partial: Partial<DashboardSettings>) => void;
  resetConfig: () => void;
  replaceWidgets: (widgets: WidgetConfig[]) => void;
  updateWidget: (widgetId: string, partial: Partial<WidgetConfig>) => void;
  addWidget: (widget: WidgetConfig) => void;
  removeWidget: (widgetId: string) => void;
};

const STORAGE_KEY = "smarthome-dashboard-config";

const DashboardConfigContext = createContext<DashboardConfigContextValue | null>(null);

export function DashboardConfigProvider({ children }: PropsWithChildren) {
  const [config, setConfig] = useState<DashboardSettings>(defaultConfig);
  const [rawJson, setRawJson] = useState(JSON.stringify(defaultConfig, null, 2));

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!stored) {
          return;
        }

        const parsed = JSON.parse(stored) as DashboardSettings;
        setConfig(parsed);
        setRawJson(JSON.stringify(parsed, null, 2));
      })
      .catch((error) => {
        console.warn("Config load failed", error);
      });
  }, []);

  const persist = async (nextConfig: DashboardSettings) => {
    setConfig(nextConfig);
    const json = JSON.stringify(nextConfig, null, 2);
    setRawJson(json);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, json);
    } catch (error) {
      console.warn("Config save failed", error);
    }
  };

  const value = useMemo<DashboardConfigContextValue>(
    () => ({
      config,
      rawJson,
      updateConfigFromJson(nextJson) {
        try {
          const parsed = JSON.parse(nextJson) as DashboardSettings;
          persist(parsed);
          return { ok: true };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : "Unknown JSON error" };
        }
      },
      patchConfig(partial) {
        const nextConfig: DashboardSettings = {
          ...config,
          ...partial,
        };
        persist(nextConfig);
      },
      resetConfig() {
        persist(defaultConfig);
      },
      replaceWidgets(widgets) {
        const nextConfig: DashboardSettings = {
          ...config,
          widgets,
        };
        persist(nextConfig);
      },
      updateWidget(widgetId, partial) {
        const nextConfig: DashboardSettings = {
          ...config,
          widgets: config.widgets.map((widget) =>
            widget.id === widgetId ? ({ ...widget, ...partial } as WidgetConfig) : widget
          ),
        };
        persist(nextConfig);
      },
      addWidget(widget) {
        const nextConfig: DashboardSettings = {
          ...config,
          widgets: [...config.widgets, widget],
        };
        persist(nextConfig);
      },
      removeWidget(widgetId) {
        const nextConfig: DashboardSettings = {
          ...config,
          widgets: config.widgets.filter((widget) => widget.id !== widgetId),
        };
        persist(nextConfig);
      },
    }),
    [config, rawJson]
  );

  return <DashboardConfigContext.Provider value={value}>{children}</DashboardConfigContext.Provider>;
}

export function useDashboardConfig() {
  const value = useContext(DashboardConfigContext);
  if (!value) {
    throw new Error("useDashboardConfig must be used inside DashboardConfigProvider");
  }
  return value;
}
