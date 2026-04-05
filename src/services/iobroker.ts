import {
  DashboardSettings,
  IoBrokerHostStats,
  IoBrokerLogEntry,
  IoBrokerObjectEntry,
  IoBrokerScriptEntry,
  StateSnapshot,
  WidgetImageEntry,
  WidgetSoundEntry,
} from "../types/dashboard";

type ObjectCacheEntry = {
  items: IoBrokerObjectEntry[];
  timestamp: number;
};

type WallboxDailyEnergyEntry = {
  dayKey: string;
  dailyKWh: number;
  lastMeterKWh: number | null;
};

export type IoBrokerStateStreamEvent = {
  id: string;
  val: unknown;
  ack: boolean;
  ts: number;
  lc: number;
};

const OBJECT_CACHE_TTL_MS = 5 * 60 * 1000;
const objectCache = new Map<string, ObjectCacheEntry>();

const buildAuthHeader = (settings: DashboardSettings) => {
  const headers: Record<string, string> = {};

  if (settings.iobroker.token) {
    headers.Authorization = `Bearer ${settings.iobroker.token}`;
    return headers;
  }

  if (settings.iobroker.username && settings.iobroker.password) {
    const raw = `${settings.iobroker.username}:${settings.iobroker.password}`;
    if (typeof btoa === "function") {
      headers.Authorization = `Basic ${btoa(raw)}`;
    }
  }

  return headers;
};

export class IoBrokerClient {
  constructor(private readonly settings: DashboardSettings) {}

  private resolveBaseUrl() {
    const configuredBase = this.settings.iobroker.baseUrl.trim();
    if (configuredBase) {
      return configuredBase.replace(/\/$/, "");
    }

    if (typeof window !== "undefined" && window.location?.origin) {
      return window.location.origin.replace(/\/$/, "");
    }

    return "";
  }

  private endpoint(path: string) {
    const base = this.resolveBaseUrl();
    const adapterPath = (this.settings.iobroker.adapterBasePath || "").replace(/\/$/, "");
    return `${base}${adapterPath}${path}`;
  }

  private cacheKey() {
    return this.endpoint("/objects");
  }

  async readStates(stateIds: string[]): Promise<StateSnapshot> {
    const uniqueStateIds = [...new Set(stateIds.filter(Boolean))];
    if (uniqueStateIds.length === 0) {
      return {};
    }

    const response = await fetch(this.endpoint("/states"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildAuthHeader(this.settings),
      },
      body: JSON.stringify({ stateIds: uniqueStateIds }),
    });

    if (!response.ok) {
      throw new Error(`State read failed (${response.status})`);
    }

    return (await response.json()) as StateSnapshot;
  }

  async openStateStream(
    stateIds: string[],
    options: {
      signal?: AbortSignal;
      onState: (event: IoBrokerStateStreamEvent) => void;
    }
  ): Promise<void> {
    const uniqueStateIds = [...new Set(stateIds.map((entry) => entry.trim()).filter(Boolean))];
    if (!uniqueStateIds.length) {
      return;
    }

    const params = new URLSearchParams();
    uniqueStateIds.forEach((stateId) => params.append("stateId", stateId));
    const response = await fetch(this.endpoint(`/state-events?${params.toString()}`), {
      method: "GET",
      headers: {
        Accept: "text/event-stream",
        ...buildAuthHeader(this.settings),
      },
      cache: "no-store",
      signal: options.signal,
    });

    if (response.status === 404) {
      throw new Error("State stream endpoint unavailable (404)");
    }
    if (!response.ok) {
      throw new Error(`State stream failed (${response.status})`);
    }
    if (!response.body || typeof (response.body as ReadableStream<Uint8Array>).getReader !== "function") {
      throw new Error("State stream unsupported by this runtime");
    }

    const reader = (response.body as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let eventName = "";
    let dataLines: string[] = [];

    const flushEvent = () => {
      if (!dataLines.length) {
        eventName = "";
        return;
      }
      const payload = dataLines.join("\n");
      const normalizedEvent = (eventName || "message").trim().toLowerCase();
      eventName = "";
      dataLines = [];
      if (normalizedEvent !== "state") {
        return;
      }
      try {
        const parsed = JSON.parse(payload) as Partial<IoBrokerStateStreamEvent>;
        if (!parsed || typeof parsed.id !== "string" || !parsed.id.trim()) {
          return;
        }
        const ts = typeof parsed.ts === "number" ? parsed.ts : Number(parsed.ts);
        const lc = typeof parsed.lc === "number" ? parsed.lc : Number(parsed.lc);
        options.onState({
          id: parsed.id,
          val: parsed.val,
          ack: parsed.ack === true,
          ts: Number.isFinite(ts) ? ts : 0,
          lc: Number.isFinite(lc) ? lc : 0,
        });
      } catch {
        // Ignore malformed state stream events and continue reading.
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });

      let lineBreakIndex = buffer.indexOf("\n");
      while (lineBreakIndex >= 0) {
        let line = buffer.slice(0, lineBreakIndex);
        buffer = buffer.slice(lineBreakIndex + 1);
        if (line.endsWith("\r")) {
          line = line.slice(0, -1);
        }

        if (!line) {
          flushEvent();
        } else if (line.startsWith(":")) {
          // Heartbeat/comment line.
        } else if (line.startsWith("event:")) {
          eventName = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).trimStart());
        }

        lineBreakIndex = buffer.indexOf("\n");
      }
    }

    flushEvent();
  }

  async writeState(stateId: string, value: unknown) {
    try {
      const response = await fetch(this.endpoint("/state"), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...buildAuthHeader(this.settings),
        },
        body: JSON.stringify({ stateId, value }),
      });

      if (!response.ok) {
        throw new Error(`State write failed (${response.status})`);
      }
    } catch (error) {
      console.warn("ioBroker writeState failed", error);
    }
  }

  async listObjects(query = ""): Promise<IoBrokerObjectEntry[]> {
    const normalizedQuery = query.trim().toLowerCase();
    const cacheKey = this.cacheKey();
    const cached = objectCache.get(cacheKey);
    const cacheIsFresh = cached && Date.now() - cached.timestamp < OBJECT_CACHE_TTL_MS;

    if (cacheIsFresh) {
      return filterObjects(cached.items, normalizedQuery);
    }

    const response = await fetch(this.endpoint("/objects"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildAuthHeader(this.settings),
      },
      body: JSON.stringify({ query: "" }),
    });

    if (!response.ok) {
      throw new Error(`Object list failed (${response.status})`);
    }

    const items = (await response.json()) as IoBrokerObjectEntry[];
    objectCache.set(cacheKey, {
      items,
      timestamp: Date.now(),
    });

    return filterObjects(items, normalizedQuery);
  }

  async primeObjectCache() {
    try {
      await this.listObjects("");
    } catch (error) {
      console.warn("Object cache warmup failed", error);
    }
  }

  async listWidgetImages(): Promise<WidgetImageEntry[]> {
    const response = await fetch(this.endpoint("/images"), {
      method: "GET",
      headers: {
        ...buildAuthHeader(this.settings),
      },
    });

    if (!response.ok) {
      throw new Error(`Image list failed (${response.status})`);
    }

    return (await response.json()) as WidgetImageEntry[];
  }

  async listWidgetSounds(): Promise<WidgetSoundEntry[]> {
    const response = await fetch(this.endpoint("/sounds"), {
      method: "GET",
      headers: {
        ...buildAuthHeader(this.settings),
      },
    });

    if (!response.ok) {
      throw new Error(`Sound list failed (${response.status})`);
    }

    return (await response.json()) as WidgetSoundEntry[];
  }

  async uploadWidgetImage(name: string, dataUrl: string): Promise<WidgetImageEntry> {
    return this.uploadWidgetFile<WidgetImageEntry>("/images/upload", name, dataUrl);
  }

  async uploadWidgetSound(name: string, dataUrl: string): Promise<WidgetSoundEntry> {
    return this.uploadWidgetFile<WidgetSoundEntry>("/sounds/upload", name, dataUrl);
  }

  async readLogs(options?: {
    limit?: number;
    minSeverity?: string;
    source?: string;
    contains?: string;
  }): Promise<IoBrokerLogEntry[]> {
    const limit = Math.max(1, Math.min(200, Math.round(options?.limit || 100)));
    const params = new URLSearchParams({
      limit: String(limit),
    });
    if (options?.minSeverity) {
      params.set("minSeverity", options.minSeverity);
    }
    if (options?.source) {
      params.set("source", options.source);
    }
    if (options?.contains) {
      params.set("contains", options.contains);
    }

    const response = await fetch(this.endpoint(`/logs?${params.toString()}`), {
      method: "GET",
      headers: {
        ...buildAuthHeader(this.settings),
      },
    });

    if (!response.ok) {
      throw new Error(`Log read failed (${response.status})`);
    }

    return (await response.json()) as IoBrokerLogEntry[];
  }

  async listScripts(options?: {
    limit?: number;
    instance?: string;
    contains?: string;
  }): Promise<IoBrokerScriptEntry[]> {
    const limit = Math.max(1, Math.min(1000, Math.round(options?.limit || 200)));
    const params = new URLSearchParams({
      limit: String(limit),
    });
    if (options?.instance) {
      params.set("instance", options.instance);
    }
    if (options?.contains) {
      params.set("contains", options.contains);
    }

    const response = await fetch(this.endpoint(`/scripts?${params.toString()}`), {
      method: "GET",
      headers: {
        ...buildAuthHeader(this.settings),
      },
    });

    if (!response.ok) {
      throw new Error(`Script list failed (${response.status})`);
    }

    return (await response.json()) as IoBrokerScriptEntry[];
  }

  async readHostStats(): Promise<IoBrokerHostStats> {
    const response = await fetch(this.endpoint("/host-stats"), {
      method: "GET",
      headers: {
        ...buildAuthHeader(this.settings),
      },
    });

    if (!response.ok) {
      throw new Error(`Host stats read failed (${response.status})`);
    }

    return (await response.json()) as IoBrokerHostStats;
  }

  async readWallboxDailyEnergy(widgetId: string): Promise<WallboxDailyEnergyEntry | null> {
    const normalizedWidgetId = widgetId.trim();
    if (!normalizedWidgetId) {
      return null;
    }

    const response = await fetch(
      this.endpoint(`/wallbox-daily-energy/${encodeURIComponent(normalizedWidgetId)}`),
      {
        method: "GET",
        headers: {
          ...buildAuthHeader(this.settings),
        },
      }
    );

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Wallbox daily energy read failed (${response.status})`);
    }

    const payload = (await response.json()) as {
      entry?: {
        dayKey?: unknown;
        dailyKWh?: unknown;
        lastMeterKWh?: unknown;
      } | null;
    };
    const entry = payload.entry;
    if (!entry || typeof entry !== "object") {
      return null;
    }

    const dayKey = typeof entry.dayKey === "string" ? entry.dayKey.trim() : "";
    const dailyKWh = typeof entry.dailyKWh === "number" ? entry.dailyKWh : Number(entry.dailyKWh);
    const rawLastMeter = entry.lastMeterKWh;
    const lastMeterKWh =
      rawLastMeter === null || rawLastMeter === undefined
        ? null
        : typeof rawLastMeter === "number"
          ? rawLastMeter
          : Number(rawLastMeter);

    if (!dayKey || !Number.isFinite(dailyKWh) || dailyKWh < 0) {
      return null;
    }
    if (lastMeterKWh !== null && (!Number.isFinite(lastMeterKWh) || lastMeterKWh < 0)) {
      return null;
    }

    return {
      dayKey,
      dailyKWh,
      lastMeterKWh,
    };
  }

  async writeWallboxDailyEnergy(widgetId: string, entry: WallboxDailyEnergyEntry) {
    const normalizedWidgetId = widgetId.trim();
    if (!normalizedWidgetId) {
      return;
    }

    const response = await fetch(
      this.endpoint(`/wallbox-daily-energy/${encodeURIComponent(normalizedWidgetId)}`),
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...buildAuthHeader(this.settings),
        },
        body: JSON.stringify(entry),
      }
    );

    if (!response.ok) {
      throw new Error(`Wallbox daily energy save failed (${response.status})`);
    }
  }

  private async uploadWidgetFile<T>(path: string, name: string, dataUrl: string): Promise<T> {
    const response = await fetch(this.endpoint(path), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildAuthHeader(this.settings),
      },
      body: JSON.stringify({ name, dataUrl }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      const message = payload?.error || `Upload failed (${response.status})`;
      throw new Error(message);
    }

    return (await response.json()) as T;
  }
}

function filterObjects(items: IoBrokerObjectEntry[], query: string) {
  if (!query) {
    return items;
  }

  return items.filter((entry) => {
    return (
      entry.id.toLowerCase().includes(query) ||
      (entry.name && entry.name.toLowerCase().includes(query)) ||
      (entry.role && entry.role.toLowerCase().includes(query))
    );
  });
}
