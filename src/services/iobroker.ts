import { DashboardSettings, IoBrokerObjectEntry, StateSnapshot, WidgetImageEntry } from "../types/dashboard";

type ObjectCacheEntry = {
  items: IoBrokerObjectEntry[];
  timestamp: number;
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
