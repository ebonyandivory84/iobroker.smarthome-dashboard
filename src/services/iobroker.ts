import { DashboardSettings, StateSnapshot } from "../types/dashboard";

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

  private endpoint(path: string) {
    const base = this.settings.iobroker.baseUrl.replace(/\/$/, "");
    const adapterPath = (this.settings.iobroker.adapterBasePath || "").replace(/\/$/, "");
    return `${base}${adapterPath}${path}`;
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
}
