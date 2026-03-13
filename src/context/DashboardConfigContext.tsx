import {
  PropsWithChildren,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { CameraWidgetConfig, DashboardPage, DashboardSettings, UiSoundSettings, WidgetConfig } from "../types/dashboard";
import { defaultConfig } from "../utils/defaultConfig";
import { normalizeSoundSelection } from "../utils/lcarsSounds";
import { buildMobileOverrideFromWidget, resolveMobileWidget, stripMobileWidgetMeta } from "../utils/mobileWidget";

type DashboardConfigContextValue = {
  config: DashboardSettings;
  rawJson: string;
  rawDesktopJson: string;
  rawMobileJson: string;
  dashboardPages: DashboardPage[];
  activePageId: string;
  savedDashboards: string[];
  updateConfigFromJson: (nextJson: string) => { ok: boolean; error?: string };
  updateDesktopConfigFromJson: (nextJson: string) => { ok: boolean; error?: string };
  updateMobileConfigFromJson: (nextJson: string) => { ok: boolean; error?: string };
  patchConfig: (partial: Partial<DashboardSettings>) => void;
  resetConfig: () => void;
  replaceWidgets: (widgets: WidgetConfig[]) => void;
  updateWidget: (widgetId: string, partial: Partial<WidgetConfig>) => void;
  addWidget: (widget: WidgetConfig) => void;
  removeWidget: (widgetId: string) => void;
  moveWidgetToPage: (widgetId: string, targetPageId: string, position?: WidgetConfig["position"]) => void;
  setActivePage: (pageId: string) => void;
  createDashboardPage: () => void;
  moveDashboardPage: (pageId: string, direction: "left" | "right") => void;
  refreshSavedDashboards: () => Promise<void>;
  saveNamedDashboard: (name: string) => Promise<{ ok: boolean; error?: string }>;
  loadNamedDashboard: (name: string) => Promise<{ ok: boolean; error?: string }>;
  deleteNamedDashboard: (name: string) => Promise<{ ok: boolean; error?: string }>;
};

const LEGACY_DEMO_BASE_URL = "http://127.0.0.1:8087";
const REMOTE_CONFIG_ENDPOINT = "/smarthome-dashboard/api/config";
const SAVED_DASHBOARDS_ENDPOINT = "/smarthome-dashboard/api/dashboards";

const DashboardConfigContext = createContext<DashboardConfigContextValue | null>(null);

function migrateConfig(input: DashboardSettings): DashboardSettings {
  const nextConfig: DashboardSettings = {
    ...input,
    uiSounds: normalizeUiSoundSettings(input.uiSounds),
    iobroker: {
      ...input.iobroker,
      baseUrl: input.iobroker.baseUrl === LEGACY_DEMO_BASE_URL ? "" : input.iobroker.baseUrl,
    },
    widgets: input.widgets.map((widget) => {
      const normalizedInteractionSounds = normalizeWidgetInteractionSounds(widget.interactionSounds);

      if (widget.type !== "camera") {
        return {
          ...widget,
          interactionSounds: normalizedInteractionSounds,
        };
      }

      const legacySnapshot =
        widget.snapshotUrl &&
        (widget.snapshotUrl === `${LEGACY_DEMO_BASE_URL}/cam/einfahrt.jpg` ||
          widget.snapshotUrl === `${LEGACY_DEMO_BASE_URL}/cam/snapshot.jpg`);
      const legacyCamera = widget as CameraWidgetConfig & {
        useSnapshotInPreview?: boolean;
        useSnapshotInFullscreen?: boolean;
        useMjpegInPreview?: boolean;
        useMjpegInFullscreen?: boolean;
        rtspUrl?: string;
      };

      const snapshotUrl = legacySnapshot ? "" : widget.snapshotUrl;
      const previewSnapshotUrl = (snapshotUrl || "").trim() || null;
      const previewMjpegUrl = (widget.mjpegUrl || "").trim() || null;
      const previewFlvUrl = (widget.flvUrl || "").trim() || null;
      const previewFmp4Url = (widget.fmp4Url || "").trim() || null;
      const fullscreenSnapshotUrl = (widget.fullscreenSnapshotUrl || snapshotUrl || "").trim() || null;
      const fullscreenMjpegUrl = (widget.fullscreenMjpegUrl || widget.mjpegUrl || "").trim() || null;
      const fullscreenFlvUrl = (widget.fullscreenFlvUrl || widget.flvUrl || "").trim() || null;
      const fullscreenFmp4Url = (widget.fullscreenFmp4Url || widget.fmp4Url || "").trim() || null;

      const previewSourceMode =
        widget.previewSourceMode ||
        inferCameraSourceMode(
          previewSnapshotUrl,
          previewMjpegUrl,
          previewFlvUrl,
          previewFmp4Url,
          legacyCamera.useMjpegInPreview === true,
          "snapshot"
        );
      const fullscreenSourceMode =
        widget.fullscreenSourceMode ||
        inferCameraSourceMode(
          fullscreenSnapshotUrl,
          fullscreenMjpegUrl,
          fullscreenFlvUrl,
          fullscreenFmp4Url,
          legacyCamera.useMjpegInFullscreen === true,
          previewSourceMode
        );

      return {
        ...widget,
        snapshotUrl,
        previewSourceMode,
        fullscreenSourceMode,
        audioEnabled: normalizeCameraAudioEnabled(widget.audioEnabled),
        interactionSounds: normalizedInteractionSounds,
      };
    }),
  };

  return normalizeDashboardPages(nextConfig);
}

function inferCameraSourceMode(
  snapshotUrl: string | null,
  mjpegUrl: string | null,
  flvUrl: string | null,
  fmp4Url: string | null,
  legacyPreferMjpeg: boolean,
  fallback: "snapshot" | "mjpeg" | "flv" | "fmp4"
) {
  if (legacyPreferMjpeg && mjpegUrl) {
    return "mjpeg";
  }
  if (flvUrl && !snapshotUrl && !mjpegUrl && !fmp4Url) {
    return "flv";
  }
  if (fmp4Url && !snapshotUrl && !mjpegUrl && !flvUrl) {
    return "fmp4";
  }
  if (snapshotUrl && !mjpegUrl && !flvUrl && !fmp4Url) {
    return "snapshot";
  }
  if (mjpegUrl && !snapshotUrl && !flvUrl && !fmp4Url) {
    return "mjpeg";
  }
  if (snapshotUrl) {
    return "snapshot";
  }
  if (mjpegUrl) {
    return "mjpeg";
  }
  if (flvUrl) {
    return "flv";
  }
  if (fmp4Url) {
    return "fmp4";
  }
  return fallback;
}

function normalizeCameraAudioEnabled(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return ["true", "1", "on", "yes"].includes(normalized);
}

export function DashboardConfigProvider({ children }: PropsWithChildren) {
  const [config, setConfig] = useState<DashboardSettings>(defaultConfig);
  const [rawJson, setRawJson] = useState(JSON.stringify(defaultConfig, null, 2));
  const [savedDashboards, setSavedDashboards] = useState<string[]>([]);

  useEffect(() => {
    let active = true;

    const hydrate = async () => {
      let remoteJson = "";

      try {
        const dashboards = await readSavedDashboards();
        if (active) {
          setSavedDashboards(dashboards);
        }
      } catch (error) {
        console.warn("Saved dashboard load failed", error);
      }

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
          return;
        } catch (error) {
          console.warn("Remote config parse failed", error);
        }
      }

      try {
        const parsed = migrateConfig(defaultConfig);
        const nextJson = JSON.stringify(parsed, null, 2);
        if (!active) {
          return;
        }
        setConfig(parsed);
        setRawJson(nextJson);
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
    const normalizedConfig = normalizeDashboardPages(nextConfig);
    setConfig(normalizedConfig);
    const json = JSON.stringify(normalizedConfig, null, 2);
    setRawJson(json);
    try {
      await writeRemoteConfig(json);
    } catch (error) {
      console.warn("Remote config save failed", error);
    }
  };
  const rawMobileJson = useMemo(() => buildMobileJsonSnapshot(config), [config]);

  const value = useMemo<DashboardConfigContextValue>(
    () => ({
      config,
      rawJson,
      rawDesktopJson: rawJson,
      rawMobileJson,
      dashboardPages: config.pages || [],
      activePageId: config.activePageId || (config.pages?.[0]?.id ?? "home"),
      savedDashboards,
      updateConfigFromJson(nextJson) {
        try {
          const parsed = migrateConfig(JSON.parse(nextJson) as DashboardSettings);
          persist(parsed);
          return { ok: true };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : "Unknown JSON error" };
        }
      },
      updateDesktopConfigFromJson(nextJson) {
        try {
          const parsed = migrateConfig(JSON.parse(nextJson) as DashboardSettings);
          persist(parsed);
          return { ok: true };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : "Unknown JSON error" };
        }
      },
      updateMobileConfigFromJson(nextJson) {
        try {
          const parsedMobile = migrateConfig(JSON.parse(nextJson) as DashboardSettings);
          const merged = applyMobileLayoutConfig(config, parsedMobile);
          persist(merged);
          return { ok: true };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : "Unknown JSON error" };
        }
      },
      patchConfig(partial) {
        persist(syncActivePage(config, partial));
      },
      resetConfig() {
        persist(defaultConfig);
      },
      replaceWidgets(widgets) {
        persist(syncActivePage(config, { widgets }));
      },
      updateWidget(widgetId, partial) {
        const widgets = config.widgets.map((widget) =>
            widget.id === widgetId ? ({ ...widget, ...partial } as WidgetConfig) : widget
          );
        persist(syncActivePage(config, { widgets }));
      },
      addWidget(widget) {
        persist(syncActivePage(config, { widgets: [...config.widgets, widget] }));
      },
      removeWidget(widgetId) {
        persist(syncActivePage(config, { widgets: config.widgets.filter((widget) => widget.id !== widgetId) }));
      },
      moveWidgetToPage(widgetId, targetPageId, position) {
        const pages = config.pages || [];
        const targetPage = pages.find((page) => page.id === targetPageId);
        if (!targetPage) {
          return;
        }

        const sourcePage = pages.find((page) => page.widgets.some((widget) => widget.id === widgetId));
        if (!sourcePage || sourcePage.id === targetPage.id) {
          return;
        }

        const sourceWidget = sourcePage.widgets.find((widget) => widget.id === widgetId);
        if (!sourceWidget) {
          return;
        }

        const movedWidget: WidgetConfig = {
          ...sourceWidget,
          position: position || sourceWidget.position,
        };

        const nextPages = pages.map((page) => {
          if (page.id === sourcePage.id) {
            return {
              ...page,
              widgets: page.widgets.filter((widget) => widget.id !== widgetId),
            };
          }

          if (page.id === targetPage.id) {
            return {
              ...page,
              widgets: [...page.widgets.filter((widget) => widget.id !== widgetId), movedWidget],
            };
          }

          return page;
        });

        const nextActive = nextPages.find((page) => page.id === targetPage.id) || targetPage;
        persist({
          ...config,
          pages: nextPages,
          activePageId: nextActive.id,
          title: nextActive.title,
          widgets: nextActive.widgets,
        });
      },
      setActivePage(pageId) {
        if (!pageId || pageId === config.activePageId) {
          return;
        }
        const nextPage = (config.pages || []).find((page) => page.id === pageId);
        if (!nextPage) {
          return;
        }

        persist({
          ...config,
          activePageId: nextPage.id,
          title: nextPage.title,
          widgets: nextPage.widgets,
        });
      },
      createDashboardPage() {
        const existingPages = config.pages || [];
        const suffix = existingPages.length + 1;
        const nextPage: DashboardPage = {
          id: `dashboard-${Date.now()}`,
          title: `Dashboard ${suffix}`,
          widgets: [],
        };

        persist({
          ...config,
          pages: [...existingPages, nextPage],
          activePageId: nextPage.id,
          title: nextPage.title,
          widgets: nextPage.widgets,
        });
      },
      moveDashboardPage(pageId, direction) {
        const pages = config.pages || [];
        const currentIndex = pages.findIndex((page) => page.id === pageId);
        if (currentIndex < 0) {
          return;
        }

        const targetIndex = direction === "left" ? currentIndex - 1 : currentIndex + 1;
        if (targetIndex < 0 || targetIndex >= pages.length) {
          return;
        }

        const nextPages = [...pages];
        const [movedPage] = nextPages.splice(currentIndex, 1);
        if (!movedPage) {
          return;
        }
        nextPages.splice(targetIndex, 0, movedPage);

        const activePage =
          nextPages.find((page) => page.id === (config.activePageId || "")) ||
          nextPages[0];
        if (!activePage) {
          return;
        }

        persist({
          ...config,
          pages: nextPages,
          activePageId: activePage.id,
          title: activePage.title,
          widgets: activePage.widgets,
        });
      },
      async refreshSavedDashboards() {
        try {
          setSavedDashboards(await readSavedDashboards());
        } catch (error) {
          console.warn("Saved dashboard refresh failed", error);
        }
      },
      async saveNamedDashboard(name) {
        const trimmedName = name.trim();
        if (!trimmedName) {
          return { ok: false, error: "Name fehlt" };
        }

        try {
          await writeSavedDashboard(trimmedName, rawJson);
          setSavedDashboards(await readSavedDashboards());
          return { ok: true };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : "Dashboard speichern fehlgeschlagen" };
        }
      },
      async loadNamedDashboard(name) {
        const trimmedName = name.trim();
        if (!trimmedName) {
          return { ok: false, error: "Name fehlt" };
        }

        try {
          const nextJson = await readSavedDashboard(trimmedName);
          const parsed = migrateConfig(JSON.parse(nextJson) as DashboardSettings);
          await persist(parsed);
          return { ok: true };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : "Dashboard laden fehlgeschlagen" };
        }
      },
      async deleteNamedDashboard(name) {
        const trimmedName = name.trim();
        if (!trimmedName) {
          return { ok: false, error: "Name fehlt" };
        }

        try {
          await removeSavedDashboard(trimmedName);
          setSavedDashboards(await readSavedDashboards());
          return { ok: true };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : "Dashboard loeschen fehlgeschlagen" };
        }
      },
    }),
    [config, rawJson, rawMobileJson, savedDashboards]
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

async function readSavedDashboards() {
  const response = await fetch(SAVED_DASHBOARDS_ENDPOINT, {
    method: "GET",
  });

  if (!response.ok) {
    throw new Error(`Saved dashboards read failed (${response.status})`);
  }

  const payload = (await response.json()) as { dashboards?: string[] };
  return Array.isArray(payload.dashboards) ? payload.dashboards : [];
}

async function readSavedDashboard(name: string) {
  const response = await fetch(`${SAVED_DASHBOARDS_ENDPOINT}/${encodeURIComponent(name)}`, {
    method: "GET",
  });

  if (!response.ok) {
    throw new Error(`Saved dashboard read failed (${response.status})`);
  }

  const payload = (await response.json()) as { configJson?: string };
  if (typeof payload.configJson !== "string" || !payload.configJson) {
    throw new Error("Saved dashboard config missing");
  }

  return payload.configJson;
}

async function writeSavedDashboard(name: string, configJson: string) {
  const response = await fetch(`${SAVED_DASHBOARDS_ENDPOINT}/${encodeURIComponent(name)}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ configJson }),
  });

  if (!response.ok) {
    throw new Error(`Saved dashboard save failed (${response.status})`);
  }
}

async function removeSavedDashboard(name: string) {
  const response = await fetch(`${SAVED_DASHBOARDS_ENDPOINT}/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error(`Saved dashboard delete failed (${response.status})`);
  }
}

export function useDashboardConfig() {
  const value = useContext(DashboardConfigContext);
  if (!value) {
    throw new Error("useDashboardConfig must be used inside DashboardConfigProvider");
  }
  return value;
}

function buildMobileJsonSnapshot(input: DashboardSettings) {
  const normalized = normalizeDashboardPages(input);
  const pages = (normalized.pages || []).map((page) => ({
    ...page,
    widgets: page.widgets.map((widget) => {
      const mobileWidget = resolveMobileWidget(widget);
      return stripMobileWidgetMeta(mobileWidget);
    }),
  }));
  const activePage =
    pages.find((page) => page.id === normalized.activePageId) ||
    pages[0];

  const mobileConfig: DashboardSettings = {
    ...normalized,
    pages,
    activePageId: activePage?.id || normalized.activePageId,
    widgets: activePage?.widgets || [],
  };

  return JSON.stringify(mobileConfig, null, 2);
}

function applyMobileLayoutConfig(
  current: DashboardSettings,
  mobileConfig: DashboardSettings
): DashboardSettings {
  const normalizedCurrent = normalizeDashboardPages(current);
  const normalizedMobile = normalizeDashboardPages(mobileConfig);
  const scoped = new Map<string, WidgetConfig>();
  const global = new Map<string, WidgetConfig>();

  for (const page of normalizedMobile.pages || []) {
    for (const widget of page.widgets) {
      scoped.set(`${page.id}::${widget.id}`, widget);
      if (!global.has(widget.id)) {
        global.set(widget.id, widget);
      }
    }
  }

  const nextPages = (normalizedCurrent.pages || []).map((page) => ({
    ...page,
    widgets: page.widgets.map((widget) => {
      const source =
        scoped.get(`${page.id}::${widget.id}`) ||
        global.get(widget.id);
      if (!source) {
        return widget;
      }

      return {
        ...widget,
        mobilePosition: source.mobilePosition || source.position,
        mobileOverride: buildMobileOverrideFromWidget(source),
      };
    }),
  }));
  const nextActivePage =
    nextPages.find((page) => page.id === normalizedCurrent.activePageId) ||
    nextPages[0];

  return {
    ...normalizedCurrent,
    pages: nextPages,
    activePageId: nextActivePage?.id || normalizedCurrent.activePageId,
    widgets: nextActivePage?.widgets || [],
  };
}

function normalizeDashboardPages(input: DashboardSettings): DashboardSettings {
  const basePages = Array.isArray(input.pages) && input.pages.length
    ? input.pages.map((page, index) => ({
        id: page.id || `dashboard-${index + 1}`,
        title: page.title || `Dashboard ${index + 1}`,
        widgets: normalizeWidgetConfigList(page.widgets),
      }))
    : [
        {
          id: input.activePageId || "home",
          title: input.title || "Dashboard",
          widgets: normalizeWidgetConfigList(input.widgets),
        },
      ];

  const activePage =
    basePages.find((page) => page.id === input.activePageId) ||
    basePages[0];

  return {
    ...input,
    title: activePage.title,
    widgets: activePage.widgets,
    pages: basePages,
    activePageId: activePage.id,
  };
}

function syncActivePage(
  current: DashboardSettings,
  partial: Partial<DashboardSettings>
): DashboardSettings {
  const nextPages = (current.pages || []).map((page) =>
    page.id === current.activePageId
      ? {
          ...page,
          title: typeof partial.title === "string" ? partial.title : page.title,
          widgets: Array.isArray(partial.widgets) ? partial.widgets : page.widgets,
        }
      : page
  );

  return {
    ...current,
    ...partial,
    pages: nextPages,
  };
}

function normalizeUiSoundSettings(input?: UiSoundSettings): UiSoundSettings {
  const soundSet = input?.soundSet;

  return {
    enabled: input?.enabled !== false,
    volume:
      typeof input?.volume === "number" && Number.isFinite(input.volume)
        ? Math.max(0, Math.min(100, Math.round(input.volume)))
        : 55,
    soundSet: soundSet === "ops" || soundSet === "soft" || soundSet === "voyager" ? soundSet : "voyager",
    widgetTypeDefaults: normalizeWidgetTypeSoundDefaults(input?.widgetTypeDefaults),
    pageSounds: {
      tabPress: normalizeSoundSelection(input?.pageSounds?.tabPress),
      swipe: normalizeSoundSelection(input?.pageSounds?.swipe),
      contentScroll: normalizeSoundSelection(input?.pageSounds?.contentScroll),
      pullToRefresh: normalizeSoundSelection(input?.pageSounds?.pullToRefresh),
      layoutToggle: normalizeSoundSelection(input?.pageSounds?.layoutToggle),
      addWidget: normalizeSoundSelection(input?.pageSounds?.addWidget),
      openSettings: normalizeSoundSelection(input?.pageSounds?.openSettings),
      widgetEdit: normalizeSoundSelection(input?.pageSounds?.widgetEdit),
      editorButton: normalizeSoundSelection(input?.pageSounds?.editorButton),
    },
  };
}

function normalizeWidgetInteractionSounds(
  input?: DashboardSettings["widgets"][number]["interactionSounds"]
) {
  if (!input) {
    return undefined;
  }

  return {
    press: normalizeSoundSelection(input.press),
    confirm: normalizeSoundSelection(input.confirm),
    slider: normalizeSoundSelection(input.slider),
    open: normalizeSoundSelection(input.open),
    close: normalizeSoundSelection(input.close),
    scroll: normalizeSoundSelection(input.scroll),
    notify: normalizeSoundSelection(input.notify),
    notifyWarn: normalizeSoundSelection(input.notifyWarn),
    notifyError: normalizeSoundSelection(input.notifyError),
  };
}

function normalizeWidgetTypeSoundDefaults(
  input?: UiSoundSettings["widgetTypeDefaults"]
) {
  if (!input) {
    return {};
  }

  return {
    state: normalizeWidgetInteractionSounds(input.state),
    camera: normalizeWidgetInteractionSounds(input.camera),
    energy: normalizeWidgetInteractionSounds(input.energy),
    solar: normalizeWidgetInteractionSounds(input.solar),
    grafana: normalizeWidgetInteractionSounds(input.grafana),
    weather: normalizeWidgetInteractionSounds(input.weather),
    numpad: normalizeWidgetInteractionSounds(input.numpad),
    link: normalizeWidgetInteractionSounds(input.link),
    log: normalizeWidgetInteractionSounds(input.log),
    script: normalizeWidgetInteractionSounds(input.script),
    host: normalizeWidgetInteractionSounds(input.host),
    wallbox: normalizeWidgetInteractionSounds(input.wallbox),
  };
}

function normalizeWidgetConfigList(input: DashboardSettings["widgets"] | undefined) {
  if (!Array.isArray(input)) {
    return [];
  }

  const usedIds = new Set<string>();

  return input.map((widget, index) => {
    const baseId = (widget.id || `${widget.type}-${index + 1}`).trim();
    let nextId = baseId || `${widget.type}-${index + 1}`;
    let suffix = 2;

    while (usedIds.has(nextId)) {
      nextId = `${baseId}-${suffix}`;
      suffix += 1;
    }

    usedIds.add(nextId);

    return {
      ...widget,
      id: nextId,
      interactionSounds: normalizeWidgetInteractionSounds(widget.interactionSounds),
    };
  });
}
