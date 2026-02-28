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
const LEGACY_DEMO_BASE_URL = "http://127.0.0.1:8087";
const REMOTE_CONFIG_ENDPOINT = "/smarthome-dashboard/api/config";

const DashboardConfigContext = createContext<DashboardConfigContextValue | null>(null);

function migrateConfig(input: DashboardSettings): DashboardSettings {
  const nextConfig: DashboardSettings = {
    ...input,
    iobroker: {
      ...input.iobroker,
      baseUrl: input.iobroker.baseUrl === LEGACY_DEMO_BASE_URL ? "" : input.iobroker.baseUrl,
    },
    widgets: input.widgets.map((widget) => {
      if (widget.type !== "camera") {
        return widget;
      }

      const legacySnapshot =
        widget.snapshotUrl &&
        (widget.snapshotUrl === `${LEGACY_DEMO_BASE_URL}/cam/einfahrt.jpg` ||
          widget.snapshotUrl === `${LEGACY_DEMO_BASE_URL}/cam/snapshot.jpg`);

      return legacySnapshot ? { ...widget, snapshotUrl: "" } : widget;
    }),
  };

  return nextConfig;
}

export function DashboardConfigProvider({ children }: PropsWithChildren) {
  const [config, setConfig] = useState<DashboardSettings>(defaultConfig);
  const [rawJson, setRawJson] = useState(JSON.stringify(defaultConfig, null, 2));

  useEffect(() => {
    let active = true;

    const hydrate = async () => {
      let remoteJson = "";

      try {
        remoteJson = await readRemoteConfig();
      } catch (error) {
        console.warn("Remote config load failed", error);
      }

      if (remoteJson) {
        try {
          const parsed = migrateConfig(JSON.parse(remoteJson) as DashboardSettings);
          if (!active) {
            return;
          }
          setConfig(parsed);
          setRawJson(JSON.stringify(parsed, null, 2));
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(parsed, null, 2));
          return;
        } catch (error) {
          console.warn("Remote config parse failed", error);
        }
      }

      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        const fallbackJson = stored || JSON.stringify(defaultConfig, null, 2);
        const parsed = migrateConfig(JSON.parse(fallbackJson) as DashboardSettings);
        const nextJson = JSON.stringify(parsed, null, 2);
        if (!active) {
          return;
        }
        setConfig(parsed);
        setRawJson(nextJson);
        await AsyncStorage.setItem(STORAGE_KEY, nextJson);
        await writeRemoteConfig(nextJson);
      } catch (error) {
        console.warn("Config load failed", error);
      }
    };

    hydrate();

    return () => {
      active = false;
    };
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
    try {
      await writeRemoteConfig(json);
    } catch (error) {
      console.warn("Remote config save failed", error);
    }
  };

  const value = useMemo<DashboardConfigContextValue>(
    () => ({
      config,
      rawJson,
      updateConfigFromJson(nextJson) {
        try {
          const parsed = migrateConfig(JSON.parse(nextJson) as DashboardSettings);
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

async function readRemoteConfig() {
  const response = await fetch(REMOTE_CONFIG_ENDPOINT, {
    method: "GET",
  });

  if (!response.ok) {
    throw new Error(`Remote config read failed (${response.status})`);
  }

  const payload = (await response.json()) as { configJson?: string };
  return typeof payload.configJson === "string" ? payload.configJson : "";
}

async function writeRemoteConfig(configJson: string) {
  const response = await fetch(REMOTE_CONFIG_ENDPOINT, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ configJson }),
  });

  if (!response.ok) {
    throw new Error(`Remote config save failed (${response.status})`);
  }
}

export function useDashboardConfig() {
  const value = useContext(DashboardConfigContext);
  if (!value) {
    throw new Error("useDashboardConfig must be used inside DashboardConfigProvider");
  }
  return value;
}
