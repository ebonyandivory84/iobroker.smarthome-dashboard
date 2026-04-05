const utils = require("@iobroker/adapter-core");
const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { Readable } = require("stream");
const http = require("http");
const https = require("https");
const { resolveWebRoot } = require("./lib/static");
let UndiciAgent = null;
try {
  ({ Agent: UndiciAgent } = require("undici"));
} catch {
  UndiciAgent = null;
}

let objectEntriesCache = [];
let objectEntriesCacheTimestamp = 0;
let objectEntriesPromise = null;
let insecureHttpsDispatcher = null;
let runningAdapter = null;
const OBJECT_CACHE_TTL_MS = 5 * 60 * 1000;
const CONFIG_STATE_ID = "dashboardConfig";
const SAVED_DASHBOARDS_STATE_ID = "savedDashboards";
const WALLBOX_DAILY_ENERGY_STATE_ID = "wallboxDailyEnergy";
const LOG_BUFFER_LIMIT = 2000;
const STATE_EVENT_UNSUBSCRIBE_GRACE_MS = 15000;
let webShellCache = null;
let logEntriesBuffer = [];
let logListenerRegistered = false;
let stateEventShutdown = null;

const LOG_LEVEL_ORDER = {
  silly: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
};

function startAdapter(options) {
  const adapter = new utils.Adapter({
    ...options,
    logTransporter: true,
    name: "smarthome-dashboard",
    ready: () => main(adapter),
    unload: (callback) => {
      Promise.resolve(stopLogCapture(adapter))
        .then(() => (stateEventShutdown ? stateEventShutdown() : undefined))
        .catch((error) => {
          adapter.log.warn(`Log capture cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
        })
        .finally(() => callback());
    },
  });

  return adapter;
}

async function main(adapter) {
  runningAdapter = adapter;
  const app = express();
  app.use(express.json());
  const webRoot = resolveWebRoot(adapter);
  const widgetAssetsRoot = path.resolve(__dirname, "..", "assets");
  const devServerUrl =
    adapter.config && typeof adapter.config.devServerUrl === "string" ? adapter.config.devServerUrl.trim() : "";

  await adapter.setObjectNotExistsAsync(CONFIG_STATE_ID, {
    type: "state",
    common: {
      name: "Dashboard configuration JSON",
      type: "string",
      role: "json",
      read: true,
      write: true,
      def: "",
    },
    native: {},
  });

  await adapter.setObjectNotExistsAsync(SAVED_DASHBOARDS_STATE_ID, {
    type: "state",
    common: {
      name: "Saved dashboard configurations",
      type: "string",
      role: "json",
      read: true,
      write: true,
      def: "{}",
    },
    native: {},
  });

  await adapter.setObjectNotExistsAsync(WALLBOX_DAILY_ENERGY_STATE_ID, {
    type: "state",
    common: {
      name: "Persisted wallbox daily energy runtime values",
      type: "string",
      role: "json",
      read: true,
      write: true,
      def: "{}",
    },
    native: {},
  });

  refreshObjectEntries(adapter).catch((error) => {
    adapter.log.warn(`Object cache warmup failed: ${error instanceof Error ? error.message : String(error)}`);
  });
  startLogCapture(adapter);
  const stateEventClients = new Set();
  const stateSubscriptionRefCounts = new Map();
  const pendingStateUnsubscribeTimers = new Map();

  const subscribeForeignState = async (stateId) => {
    if (typeof adapter.subscribeForeignStatesAsync === "function") {
      await adapter.subscribeForeignStatesAsync(stateId);
      return;
    }
    adapter.subscribeForeignStates(stateId);
  };

  const unsubscribeForeignState = async (stateId) => {
    if (typeof adapter.unsubscribeForeignStatesAsync === "function") {
      await adapter.unsubscribeForeignStatesAsync(stateId);
      return;
    }
    adapter.unsubscribeForeignStates(stateId);
  };

  const ensureStateSubscriptions = async (stateIds) => {
    const nextIds = Array.from(new Set((stateIds || []).filter(Boolean)));
    if (!nextIds.length) {
      return;
    }

    const toSubscribe = [];
    for (const stateId of nextIds) {
      const pendingTimer = pendingStateUnsubscribeTimers.get(stateId);
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        pendingStateUnsubscribeTimers.delete(stateId);
      }
      const previousCount = stateSubscriptionRefCounts.get(stateId) || 0;
      if (previousCount === 0) {
        toSubscribe.push(stateId);
      }
      stateSubscriptionRefCounts.set(stateId, previousCount + 1);
    }

    if (!toSubscribe.length) {
      return;
    }

    try {
      await Promise.all(toSubscribe.map((stateId) => subscribeForeignState(stateId)));
    } catch (error) {
      toSubscribe.forEach((stateId) => {
        const currentCount = stateSubscriptionRefCounts.get(stateId) || 0;
        if (currentCount <= 1) {
          stateSubscriptionRefCounts.delete(stateId);
        } else {
          stateSubscriptionRefCounts.set(stateId, currentCount - 1);
        }
      });
      throw error;
    }
  };

  const releaseStateSubscriptions = async (stateIds) => {
    const nextIds = Array.from(new Set((stateIds || []).filter(Boolean)));
    if (!nextIds.length) {
      return;
    }

    for (const stateId of nextIds) {
      const pendingTimer = pendingStateUnsubscribeTimers.get(stateId);
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        pendingStateUnsubscribeTimers.delete(stateId);
      }
      const currentCount = stateSubscriptionRefCounts.get(stateId) || 0;
      if (currentCount <= 1) {
        stateSubscriptionRefCounts.delete(stateId);
        const timer = setTimeout(() => {
          pendingStateUnsubscribeTimers.delete(stateId);
          if ((stateSubscriptionRefCounts.get(stateId) || 0) > 0) {
            return;
          }
          void unsubscribeForeignState(stateId).catch((error) => {
            adapter.log.warn(
              `State unsubscribe failed for ${stateId}: ${error instanceof Error ? error.message : String(error)}`
            );
          });
        }, STATE_EVENT_UNSUBSCRIBE_GRACE_MS);
        pendingStateUnsubscribeTimers.set(stateId, timer);
        continue;
      }
      stateSubscriptionRefCounts.set(stateId, currentCount - 1);
    }
  };

  const writeStateEvent = (res, stateId, state) => {
    const payload = JSON.stringify({
      id: stateId,
      val: state ? state.val : null,
      ack: state ? state.ack === true : false,
      ts: Number.isFinite(Number(state?.ts)) ? Number(state.ts) : 0,
      lc: Number.isFinite(Number(state?.lc)) ? Number(state.lc) : 0,
    });
    res.write(`event: state\ndata: ${payload}\n\n`);
  };

  const handleStateEvent = (stateId, state) => {
    if (!stateId || !stateEventClients.size) {
      return;
    }

    const staleClients = [];
    for (const client of stateEventClients) {
      if (!client.stateIdSet.has(stateId)) {
        continue;
      }
      try {
        writeStateEvent(client.res, stateId, state);
      } catch {
        client.closed = true;
        staleClients.push(client);
      }
    }

    staleClients.forEach((client) => {
      stateEventClients.delete(client);
      if (client.heartbeat) {
        clearInterval(client.heartbeat);
        client.heartbeat = null;
      }
      void releaseStateSubscriptions(client.stateIds);
      try {
        client.res.end();
      } catch {
        // Ignore already-closed sockets.
      }
    });
  };

  adapter.on("stateChange", handleStateEvent);
  stateEventShutdown = async () => {
    adapter.removeListener("stateChange", handleStateEvent);
    const activeClients = Array.from(stateEventClients);
    stateEventClients.clear();

    for (const client of activeClients) {
      if (client.heartbeat) {
        clearInterval(client.heartbeat);
      }
      try {
        client.res.end();
      } catch {
        // Ignore already-closed sockets.
      }
    }

    const remainingStateIds = Array.from(
      new Set([
        ...stateSubscriptionRefCounts.keys(),
        ...pendingStateUnsubscribeTimers.keys(),
      ])
    );
    pendingStateUnsubscribeTimers.forEach((timer) => clearTimeout(timer));
    pendingStateUnsubscribeTimers.clear();
    stateSubscriptionRefCounts.clear();
    await Promise.all(
      remainingStateIds.map(async (stateId) => {
        try {
          await unsubscribeForeignState(stateId);
        } catch {
          // Ignore shutdown unsubscription errors.
        }
      })
    );
  };

  app.get("/smarthome-dashboard/api/config", async (_req, res) => {
    try {
      const state = await adapter.getStateAsync(CONFIG_STATE_ID);
      const configJson = typeof state?.val === "string" ? state.val : "";
      res.json({ configJson });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Config read failed" });
    }
  });

  app.put("/smarthome-dashboard/api/config", async (req, res) => {
    const configJson = typeof req.body?.configJson === "string" ? req.body.configJson : "";
    if (!configJson) {
      res.status(400).json({ error: "configJson missing" });
      return;
    }

    try {
      JSON.parse(configJson);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid JSON" });
      return;
    }

    try {
      await adapter.setStateAsync(CONFIG_STATE_ID, {
        val: configJson,
        ack: true,
      });
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Config save failed" });
    }
  });

  app.get("/smarthome-dashboard/api/dashboards", async (_req, res) => {
    try {
      const dashboards = await readSavedDashboards(adapter);
      res.json({ dashboards: Object.keys(dashboards).sort((a, b) => a.localeCompare(b, "de")) });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Saved dashboards read failed" });
    }
  });

  app.get("/smarthome-dashboard/api/dashboards/:name", async (req, res) => {
    const name = normalizeDashboardName(req.params?.name);
    if (!name) {
      res.status(400).json({ error: "name missing" });
      return;
    }

    try {
      const dashboards = await readSavedDashboards(adapter);
      const configJson = dashboards[name];
      if (!configJson) {
        res.status(404).json({ error: "Dashboard not found" });
        return;
      }

      res.json({ configJson });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Saved dashboard read failed" });
    }
  });

  app.put("/smarthome-dashboard/api/dashboards/:name", async (req, res) => {
    const name = normalizeDashboardName(req.params?.name);
    const configJson = typeof req.body?.configJson === "string" ? req.body.configJson : "";

    if (!name) {
      res.status(400).json({ error: "name missing" });
      return;
    }

    if (!configJson) {
      res.status(400).json({ error: "configJson missing" });
      return;
    }

    try {
      JSON.parse(configJson);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid JSON" });
      return;
    }

    try {
      const dashboards = await readSavedDashboards(adapter);
      dashboards[name] = configJson;
      await writeSavedDashboards(adapter, dashboards);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Saved dashboard save failed" });
    }
  });

  app.delete("/smarthome-dashboard/api/dashboards/:name", async (req, res) => {
    const name = normalizeDashboardName(req.params?.name);
    if (!name) {
      res.status(400).json({ error: "name missing" });
      return;
    }

    try {
      const dashboards = await readSavedDashboards(adapter);
      delete dashboards[name];
      await writeSavedDashboards(adapter, dashboards);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Saved dashboard delete failed" });
    }
  });

  app.get("/smarthome-dashboard/api/wallbox-daily-energy/:widgetId", async (req, res) => {
    const widgetId = normalizeRuntimeWidgetId(req.params?.widgetId);
    if (!widgetId) {
      res.status(400).json({ error: "widgetId missing" });
      return;
    }

    try {
      const store = await readWallboxDailyEnergyStore(adapter);
      res.json({ entry: store[widgetId] || null });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Wallbox daily energy read failed" });
    }
  });

  app.put("/smarthome-dashboard/api/wallbox-daily-energy/:widgetId", async (req, res) => {
    const widgetId = normalizeRuntimeWidgetId(req.params?.widgetId);
    if (!widgetId) {
      res.status(400).json({ error: "widgetId missing" });
      return;
    }

    const normalizedEntry = normalizeWallboxDailyEnergyEntry(req.body);
    if (!normalizedEntry) {
      res.status(400).json({ error: "Invalid wallbox daily energy payload" });
      return;
    }

    try {
      const store = await readWallboxDailyEnergyStore(adapter);
      store[widgetId] = {
        ...normalizedEntry,
        updatedAt: Date.now(),
      };
      await writeWallboxDailyEnergyStore(adapter, store);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Wallbox daily energy save failed" });
    }
  });

  app.post("/smarthome-dashboard/api/states", async (req, res) => {
    const stateIds = Array.isArray(req.body?.stateIds) ? req.body.stateIds : [];
    const entries = await Promise.all(
      stateIds.map(async (stateId) => {
        const state = await adapter.getForeignStateAsync(stateId);
        return [stateId, state ? state.val : null];
      })
    );

    res.json(Object.fromEntries(entries));
  });

  app.all("/smarthome-dashboard/api/state-events", async (req, res) => {
    const stateIds = normalizeStateEventIds(req.query, req.body);
    if (!stateIds.length) {
      res.status(400).json({ error: "stateId missing" });
      return;
    }

    try {
      await ensureStateSubscriptions(stateIds);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "State stream subscribe failed" });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    if (typeof res.flushHeaders === "function") {
      res.flushHeaders();
    }

    const client = {
      closed: false,
      heartbeat: null,
      res,
      stateIdSet: new Set(stateIds),
      stateIds,
    };
    stateEventClients.add(client);

    const cleanup = () => {
      if (client.closed) {
        return;
      }
      client.closed = true;
      stateEventClients.delete(client);
      if (client.heartbeat) {
        clearInterval(client.heartbeat);
        client.heartbeat = null;
      }
      void releaseStateSubscriptions(client.stateIds);
      try {
        client.res.end();
      } catch {
        // ignore
      }
    };

    try {
      res.write("event: ready\ndata: {}\n\n");
    } catch {
      cleanup();
      return;
    }

    client.heartbeat = setInterval(() => {
      if (client.closed) {
        return;
      }
      try {
        client.res.write(": ping\n\n");
      } catch {
        cleanup();
      }
    }, 20000);

    req.on("aborted", cleanup);
    req.on("close", cleanup);
    res.on("close", cleanup);
  });

  app.put("/smarthome-dashboard/api/state", async (req, res) => {
    const { stateId, value } = req.body || {};
    if (!stateId) {
      res.status(400).json({ error: "stateId missing" });
      return;
    }

    try {
      const object = await adapter.getForeignObjectAsync(stateId);
      const writable = object && object.common ? object.common.write !== false : true;
      if (!writable) {
        res.status(400).json({ error: `State is read-only: ${stateId}` });
        return;
      }

      await adapter.setForeignStateAsync(stateId, value, false);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "State write failed" });
    }
  });

  app.post("/smarthome-dashboard/api/objects", async (req, res) => {
    const query = typeof req.body?.query === "string" ? req.body.query.trim().toLowerCase() : "";
    const entries = await getCachedObjectEntries(adapter);
    const filteredEntries = entries.filter((entry) => {
      if (!query) {
        return true;
      }

      return (
        entry.id.toLowerCase().includes(query) ||
        (entry.name && entry.name.toLowerCase().includes(query)) ||
        (entry.role && entry.role.toLowerCase().includes(query))
      );
    });

    const limitedEntries = filteredEntries.slice(0, 60000);

    res.json(limitedEntries);
  });

  app.get("/smarthome-dashboard/api/logs", async (req, res) => {
    try {
      const limit = clampInt(req.query?.limit, 100, 1, 200);
      const minSeverity = normalizeLogSeverity(req.query?.minSeverity);
      const source = normalizeFilter(req.query?.source);
      const contains = normalizeFilter(req.query?.contains);
      const logs = readBufferedLogs({
        limit,
        minSeverity,
        source,
        contains,
      });

      res.json(logs);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Log read failed" });
    }
  });

  app.get("/smarthome-dashboard/api/scripts", async (req, res) => {
    try {
      const limit = clampInt(req.query?.limit, 200, 1, 1000);
      const instance = normalizeFilter(req.query?.instance);
      const contains = normalizeFilter(req.query?.contains);
      const scripts = await listJavaScriptEntries(adapter, {
        limit,
        instance,
        contains,
      });

      res.json(scripts);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Script list failed" });
    }
  });

  app.get("/smarthome-dashboard/api/host-stats", async (_req, res) => {
    try {
      const stats = await readHostStats(adapter);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Host stats read failed" });
    }
  });

  app.get("/smarthome-dashboard/api/images", async (_req, res) => {
    try {
      const files = await fs.promises.readdir(widgetAssetsRoot, { withFileTypes: true });
      const images = files
        .filter((entry) => entry.isFile() && /\.(png|jpe?g|webp|gif)$/i.test(entry.name))
        .map((entry) => ({
          name: entry.name,
          url: `/smarthome-dashboard/widget-assets/${encodeURIComponent(entry.name)}`,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "de"));

      res.json(images);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Image list failed" });
    }
  });

  app.get("/smarthome-dashboard/api/camera-snapshot", async (req, res) => {
    const targetUrl = typeof req.query?.url === "string" ? req.query.url : "";
    if (!targetUrl) {
      res.status(400).json({ error: "url missing" });
      return;
    }

    try {
      const requestConfig = buildCameraRequestConfig(targetUrl);
      const response = await fetch(requestConfig.url, {
        cache: "no-store",
        headers: requestConfig.headers,
        ...buildCameraFetchOptions(requestConfig.url),
      });

      if (!response.ok) {
        res.status(response.status).json({ error: `Snapshot fetch failed (${response.status})` });
        return;
      }

      const contentType = response.headers.get("content-type") || "image/jpeg";
      const buffer = Buffer.from(await response.arrayBuffer());
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.send(buffer);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Snapshot proxy failed" });
    }
  });

  const handleCameraStreamProxy = async (req, res) => {
    const targetUrl = typeof req.query?.url === "string" ? req.query.url : "";
    const streamType = typeof req.query?.streamType === "string" ? req.query.streamType.toLowerCase() : "";
    if (!targetUrl) {
      res.status(400).json({ error: "url missing" });
      return;
    }

    try {
      const requestConfig = buildCameraRequestConfig(targetUrl);
      proxyCameraStream(requestConfig, req, res, streamType, 0);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Stream proxy failed" });
    }
  };

  app.get("/smarthome-dashboard/api/camera-stream", handleCameraStreamProxy);
  app.get("/smarthome-dashboard/api/camera-mjpeg", handleCameraStreamProxy);

  app.use("/smarthome-dashboard/widget-assets", express.static(widgetAssetsRoot));

  if (devServerUrl) {
    const target = devServerUrl.replace(/\/+$/, "");
    app.use(
      "/assets",
      createProxyMiddleware({
        target,
        changeOrigin: true,
        ws: true,
      })
    );
    app.use(
      "/_expo",
      createProxyMiddleware({
        target,
        changeOrigin: true,
        ws: true,
      })
    );
    app.use(
      "/smarthome-dashboard",
      createProxyMiddleware({
        target,
        changeOrigin: true,
        ws: true,
        pathRewrite: {
          "^/smarthome-dashboard": "",
        },
      })
    );
  } else {
    app.use("/assets", express.static(path.join(webRoot, "assets")));
    app.use("/_expo", express.static(path.join(webRoot, "_expo")));
    app.get(["/smarthome-dashboard", "/smarthome-dashboard/"], (req, res, next) => {
      sendWebShell(webRoot, res, next);
    });
    app.use("/smarthome-dashboard", express.static(webRoot));
    app.get("/smarthome-dashboard/*", (req, res, next) => {
      sendWebShell(webRoot, res, next);
    });
  }

  const port = Number(adapter.config.port) || 8109;
  app.listen(port, () => {
    if (devServerUrl) {
      adapter.log.info(`SmartHome Dashboard dev proxy enabled: ${devServerUrl}`);
    } else {
      adapter.log.info(`SmartHome Dashboard static web root: ${webRoot}`);
    }
    adapter.log.info(`SmartHome Dashboard available on http://0.0.0.0:${port}/smarthome-dashboard`);
  });
}

function normalizeDashboardName(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeRuntimeWidgetId(value) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 160) {
    return "";
  }
  return trimmed;
}

function normalizeStateEventIds(query, body) {
  const rawValues = [];

  if (Array.isArray(query?.stateId)) {
    rawValues.push(...query.stateId);
  } else if (typeof query?.stateId === "string") {
    rawValues.push(query.stateId);
  }

  if (Array.isArray(query?.stateIds)) {
    rawValues.push(...query.stateIds);
  } else if (typeof query?.stateIds === "string") {
    rawValues.push(...query.stateIds.split(","));
  }

  if (Array.isArray(body?.stateIds)) {
    rawValues.push(...body.stateIds);
  } else if (typeof body?.stateIds === "string") {
    rawValues.push(...body.stateIds.split(","));
  }

  return Array.from(
    new Set(
      rawValues
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter(Boolean)
    )
  );
}

function buildCameraRequestConfig(rawUrl) {
  const parsed = new URL(rawUrl);
  const headers = {};

  const authFromUserInfo = parsed.username || parsed.password;
  const queryUser =
    parsed.searchParams.get("user") ||
    parsed.searchParams.get("username") ||
    parsed.searchParams.get("User") ||
    parsed.searchParams.get("Username") ||
    "";
  const queryPassword =
    parsed.searchParams.get("password") ||
    parsed.searchParams.get("pass") ||
    parsed.searchParams.get("pwd") ||
    parsed.searchParams.get("Password") ||
    parsed.searchParams.get("Pass") ||
    parsed.searchParams.get("Pwd") ||
    "";
  const resolvedUsername = decodeURIComponent(parsed.username || queryUser || "");
  const resolvedPassword = decodeURIComponent(parsed.password || queryPassword || "");

  if (authFromUserInfo || queryUser || queryPassword) {
    const auth = Buffer.from(`${resolvedUsername}:${resolvedPassword}`).toString("base64");
    headers.Authorization = `Basic ${auth}`;
    if (authFromUserInfo) {
      parsed.username = "";
      parsed.password = "";
    }
  }

  return {
    url: parsed.toString(),
    headers,
    auth: {
      username: resolvedUsername,
      password: resolvedPassword,
      hasQueryCredentials: Boolean(queryUser || queryPassword),
    },
  };
}

function sanitizeCameraUrlForLog(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    parsed.username = "";
    parsed.password = "";
    ["password", "pass", "pwd", "token", "auth"].forEach((key) => {
      if (parsed.searchParams.has(key)) {
        parsed.searchParams.set(key, "***");
      }
      const upper = key.charAt(0).toUpperCase() + key.slice(1);
      if (parsed.searchParams.has(upper)) {
        parsed.searchParams.set(upper, "***");
      }
    });
    return parsed.toString();
  } catch {
    return "<invalid-url>";
  }
}

function buildCameraFetchOptions(targetUrl) {
  try {
    const parsed = new URL(targetUrl);
    const options = {
      redirect: "follow",
    };

    if (parsed.protocol === "https:" && isLikelyLocalHost(parsed.hostname)) {
      const dispatcher = getInsecureHttpsDispatcher();
      if (dispatcher) {
        options.dispatcher = dispatcher;
      }
    }

    return options;
  } catch {
    return {
      redirect: "follow",
    };
  }
}

function proxyCameraStream(requestConfig, req, res, streamType, redirects, authRetries = 0) {
  const sanitizedUrl = sanitizeCameraUrlForLog(requestConfig.url);
  const log = runningAdapter?.log;
  let parsed;
  try {
    parsed = new URL(requestConfig.url);
  } catch {
    if (!res.headersSent) {
      res.status(400).json({ error: "Invalid camera stream URL" });
    } else {
      res.end();
    }
    return;
  }

  const useHttps = parsed.protocol === "https:";
  const transport = useHttps ? https : http;
  let upstreamResponseRef = null;
  let closed = false;
  const forwardedRange = typeof req.headers.range === "string" ? req.headers.range : "";
  const forwardedIfRange = typeof req.headers["if-range"] === "string" ? req.headers["if-range"] : "";
  const forwardedUserAgent = typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : "";
  const forwardedAccept = typeof req.headers.accept === "string" ? req.headers.accept : "";
  const allowRangeForwarding = streamType !== "fmp4";
  const upstreamRequest = transport.request(
    {
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || (useHttps ? 443 : 80),
      method: "GET",
      path: `${parsed.pathname}${parsed.search}`,
      headers: {
        Accept: forwardedAccept || "*/*",
        ...(allowRangeForwarding && forwardedRange ? { Range: forwardedRange } : {}),
        ...(allowRangeForwarding && forwardedIfRange ? { "If-Range": forwardedIfRange } : {}),
        "User-Agent": forwardedUserAgent || "ioBroker-smart-dashboard-camera-proxy/1.0",
        ...requestConfig.headers,
      },
      rejectUnauthorized: !(useHttps && isLikelyLocalHost(parsed.hostname)),
    },
    (upstreamResponse) => {
      upstreamResponseRef = upstreamResponse;
      const statusCode = upstreamResponse.statusCode || 502;
      const location = upstreamResponse.headers.location;
      const upstreamContentType = upstreamResponse.headers["content-type"] || "";

      if (
        location &&
        [301, 302, 303, 307, 308].includes(statusCode) &&
        redirects < 5
      ) {
        log?.debug(
          `[camera-proxy] redirect streamType=${streamType || "unknown"} status=${statusCode} from=${sanitizedUrl} to=${sanitizeCameraUrlForLog(
            new URL(location, requestConfig.url).toString()
          )}`
        );
        upstreamResponse.resume();
        const redirectedUrl = new URL(location, requestConfig.url).toString();
        const redirectedConfig = buildCameraRequestConfig(redirectedUrl);
        if (!redirectedConfig.headers.Authorization && requestConfig.headers.Authorization) {
          redirectedConfig.headers.Authorization = requestConfig.headers.Authorization;
        }
        proxyCameraStream(redirectedConfig, req, res, streamType, redirects + 1, authRetries);
        return;
      }

      if (statusCode >= 400) {
        if (
          (statusCode === 401 || statusCode === 403) &&
          streamType === "mjpeg" &&
          authRetries < 3 &&
          requestConfig.auth?.username &&
          requestConfig.auth?.password !== undefined
        ) {
          try {
            const variant = authRetries === 0 ? "userPwd" : authRetries === 1 ? "usernamePassword" : "both";
            const retryUrl = withCameraQueryCredentials(
              requestConfig.url,
              requestConfig.auth.username,
              requestConfig.auth.password || "",
              variant
            );
            const retryConfig = buildCameraRequestConfig(retryUrl);
            if (authRetries >= 2) {
              delete retryConfig.headers.Authorization;
            } else if (!retryConfig.headers.Authorization && requestConfig.headers.Authorization) {
              retryConfig.headers.Authorization = requestConfig.headers.Authorization;
            }
            log?.warn(
              `[camera-proxy] upstream ${statusCode} streamType=mjpeg, retry auth strategy=${variant} url=${sanitizeCameraUrlForLog(
                retryConfig.url
              )}`
            );
            upstreamResponse.resume();
            proxyCameraStream(retryConfig, req, res, streamType, redirects, authRetries + 1);
            return;
          } catch {
            // fall through to normal error handling
          }
        }

        log?.warn(
          `[camera-proxy] upstream error streamType=${streamType || "unknown"} status=${statusCode} contentType=${String(
            upstreamContentType
          )} url=${sanitizedUrl}`
        );
        const chunks = [];
        upstreamResponse.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        upstreamResponse.on("end", () => {
          if (res.headersSent) {
            return;
          }
          const body = Buffer.concat(chunks).toString("utf8");
          res.status(statusCode).json({ error: body || `Stream fetch failed (${statusCode})` });
        });
        return;
      }

      log?.debug(
        `[camera-proxy] stream ok streamType=${streamType || "unknown"} status=${statusCode} contentType=${String(
          upstreamContentType
        )} url=${sanitizedUrl}`
      );

      const sourceContentType = upstreamResponse.headers["content-type"];
      const contentType =
        sourceContentType ||
        (streamType === "flv" || looksLikeFlvUrl(requestConfig.url)
          ? "video/x-flv"
          : streamType === "fmp4"
            ? "video/mp4"
            : "multipart/x-mixed-replace");

      res.status(statusCode);
      for (const [header, value] of Object.entries(upstreamResponse.headers)) {
        if (value === undefined) {
          continue;
        }
        if (isHopByHopProxyHeader(header)) {
          continue;
        }
        res.setHeader(header, value);
      }
      if (!res.hasHeader("Content-Type")) {
        res.setHeader("Content-Type", contentType);
      }
      if (!res.hasHeader("Cache-Control")) {
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      }
      res.setHeader("X-Accel-Buffering", "no");

      upstreamResponse.on("error", () => {
        if (!res.headersSent) {
          res.status(502).end();
          return;
        }
        res.end();
      });
      upstreamResponse.pipe(res);
    }
  );

  const closeUpstream = () => {
    if (closed) {
      return;
    }
    closed = true;
    if (upstreamResponseRef) {
      try {
        upstreamResponseRef.unpipe(res);
      } catch {
        // ignore
      }
      try {
        upstreamResponseRef.destroy();
      } catch {
        // ignore
      }
    }
    try {
      upstreamRequest.destroy();
    } catch {
      // ignore
    }
  };

  req.on("aborted", closeUpstream);
  req.on("close", closeUpstream);
  res.on("close", closeUpstream);

  upstreamRequest.on("error", (error) => {
    log?.warn(
      `[camera-proxy] request failed streamType=${streamType || "unknown"} url=${sanitizedUrl}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    if (!res.headersSent) {
      res.status(502).json({ error: error instanceof Error ? error.message : "Stream proxy request failed" });
      return;
    }
    res.end();
  });

  upstreamRequest.end();
}

function isHopByHopProxyHeader(headerName) {
  const normalized = String(headerName || "")
    .trim()
    .toLowerCase();
  return (
    normalized === "connection" ||
    normalized === "keep-alive" ||
    normalized === "proxy-authenticate" ||
    normalized === "proxy-authorization" ||
    normalized === "te" ||
    normalized === "trailer" ||
    normalized === "transfer-encoding" ||
    normalized === "upgrade"
  );
}

function withCameraQueryCredentials(rawUrl, username, password, variant = "userPwd") {
  const parsed = new URL(rawUrl);
  const user = String(username || "");
  const pass = String(password || "");

  if (variant === "userPwd" || variant === "both") {
    parsed.searchParams.set("user", user);
    parsed.searchParams.set("pwd", pass);
  }

  if (variant === "usernamePassword" || variant === "both") {
    parsed.searchParams.set("username", user);
    parsed.searchParams.set("password", pass);
  }

  return parsed.toString();
}

function getInsecureHttpsDispatcher() {
  if (!UndiciAgent) {
    return null;
  }
  if (insecureHttpsDispatcher) {
    return insecureHttpsDispatcher;
  }
  insecureHttpsDispatcher = new UndiciAgent({
    connect: {
      rejectUnauthorized: false,
    },
  });
  return insecureHttpsDispatcher;
}

function isLikelyLocalHost(hostname) {
  if (!hostname) {
    return false;
  }

  const host = String(hostname).toLowerCase();
  if (host === "localhost" || host === "::1" || host.endsWith(".local")) {
    return true;
  }

  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4Match) {
    return false;
  }

  const octets = ipv4Match.slice(1).map((value) => Number(value));
  if (octets.some((value) => Number.isNaN(value) || value < 0 || value > 255)) {
    return false;
  }

  const [a, b] = octets;
  if (a === 10) {
    return true;
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }
  if (a === 192 && b === 168) {
    return true;
  }
  if (a === 127) {
    return true;
  }

  return false;
}

function looksLikeFlvUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    const pathname = parsed.pathname.toLowerCase();
    if (pathname.endsWith(".flv") || pathname.includes("/flv")) {
      return true;
    }
    const streamParam = parsed.searchParams.get("stream");
    if (streamParam && streamParam.toLowerCase().includes(".bcs")) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

function startLogCapture(adapter) {
  if (!logListenerRegistered) {
    adapter.on("log", handleAdapterLogMessage);
    logListenerRegistered = true;
  }

  if (typeof adapter.requireLog === "function") {
    Promise.resolve(adapter.requireLog(true)).catch((error) => {
      adapter.log.warn(`Log subscription activation failed: ${error instanceof Error ? error.message : String(error)}`);
    });
  } else {
    adapter.log.warn("Log transporter is not available; Log-Widget may stay empty.");
  }

  appendLogEntry({
    _id: Date.now(),
    from: `system.adapter.${adapter.namespace}`,
    severity: "info",
    ts: Date.now(),
    message: "SmartHome Dashboard log capture active",
  });
}

function stopLogCapture(adapter) {
  if (logListenerRegistered) {
    adapter.removeListener("log", handleAdapterLogMessage);
    logListenerRegistered = false;
  }

  if (typeof adapter.requireLog === "function") {
    return adapter.requireLog(false);
  }

  return undefined;
}

function handleAdapterLogMessage(message) {
  appendLogEntry(message);
}

function appendLogEntry(message) {
  if (!message || typeof message !== "object") {
    return;
  }

  const entry = {
    id: Number.isFinite(message._id) ? message._id : Date.now(),
    from: typeof message.from === "string" ? message.from : "",
    severity: normalizeLogSeverity(message.severity),
    ts: Number.isFinite(message.ts) ? Number(message.ts) : Date.now(),
    message: normalizeLogText(message.message),
  };

  logEntriesBuffer.push(entry);
  if (logEntriesBuffer.length > LOG_BUFFER_LIMIT) {
    logEntriesBuffer = logEntriesBuffer.slice(-LOG_BUFFER_LIMIT);
  }
}

function normalizeLogText(value) {
  if (typeof value === "string") {
    return value;
  }
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function normalizeLogSeverity(raw) {
  const value = String(raw || "")
    .trim()
    .toLowerCase();
  if (value in LOG_LEVEL_ORDER) {
    return value;
  }
  return "info";
}

function severityRank(severity) {
  const normalized = normalizeLogSeverity(severity);
  return LOG_LEVEL_ORDER[normalized] ?? LOG_LEVEL_ORDER.info;
}

function normalizeFilter(value) {
  return typeof value === "string" ? value.trim() : "";
}

function clampInt(raw, fallback, min, max) {
  const parsed = Number.parseInt(String(raw || ""), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

function readBufferedLogs({ limit, minSeverity, source, contains }) {
  const minSeverityRank = severityRank(minSeverity);
  const sourceFilter = String(source || "").toLowerCase();
  const textFilter = String(contains || "").toLowerCase();

  const filtered = logEntriesBuffer.filter((entry) => {
    if (severityRank(entry.severity) < minSeverityRank) {
      return false;
    }
    if (sourceFilter && !String(entry.from || "").toLowerCase().includes(sourceFilter)) {
      return false;
    }
    if (textFilter && !String(entry.message || "").toLowerCase().includes(textFilter)) {
      return false;
    }
    return true;
  });

  return filtered.slice(-limit).reverse();
}

async function listJavaScriptEntries(adapter, options) {
  const limit = clampInt(options?.limit, 200, 1, 1000);
  const containsFilter = String(options?.contains || "")
    .trim()
    .toLowerCase();
  const instanceFilter = String(options?.instance || "")
    .trim()
    .toLowerCase();
  const entries = await getCachedObjectEntries(adapter);
  const candidates = entries.filter((entry) => {
    if (!isScriptEnabledStateId(entry.id)) {
      return false;
    }

    if (instanceFilter) {
      const instance = resolveScriptInstance(entry.id).toLowerCase();
      if (instance !== instanceFilter) {
        return false;
      }
    }

    if (!containsFilter) {
      return true;
    }

    return (
      String(entry.id || "").toLowerCase().includes(containsFilter) ||
      String(entry.name || "").toLowerCase().includes(containsFilter)
    );
  });

  // Avoid wildcard-in-the-middle lookups because they trigger expensive fallback scans.
  const states = await adapter.getForeignStatesAsync("javascript.*");
  const fetched = candidates.slice(0, 1500).map((entry) => ({
    stateId: entry.id,
    name: resolveScriptName(entry),
    instance: resolveScriptInstance(entry.id),
    enabled: normalizeScriptEnabledValue(states?.[entry.id]?.val),
  }));

  return fetched
    .sort((a, b) => {
      const byName = a.name.localeCompare(b.name, "de");
      if (byName !== 0) {
        return byName;
      }
      return a.stateId.localeCompare(b.stateId, "de");
    })
    .slice(0, limit);
}

function isScriptEnabledStateId(stateId) {
  const id = String(stateId || "");
  return id.startsWith("javascript.") && id.includes(".scriptEnabled.");
}

function resolveScriptInstance(stateId) {
  const parts = String(stateId || "").split(".");
  if (parts.length >= 2) {
    return `${parts[0]}.${parts[1]}`;
  }
  return "javascript.0";
}

function resolveScriptName(entry) {
  const friendlyName = typeof entry?.name === "string" ? entry.name.trim() : "";
  if (friendlyName) {
    return friendlyName;
  }

  const id = String(entry?.id || "");
  const marker = ".scriptEnabled.";
  const markerIndex = id.indexOf(marker);
  if (markerIndex >= 0) {
    const suffix = id.slice(markerIndex + marker.length);
    if (suffix) {
      return suffix;
    }
  }

  return id;
}

function normalizeScriptEnabledValue(value) {
  if (value === true || value === 1) {
    return true;
  }
  if (value === false || value === 0) {
    return false;
  }

  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "on" || normalized === "enabled";
}

async function readHostStats(adapter) {
  const hostName = String(adapter.host || os.hostname() || "host");
  const disk = readDiskStats();
  const ramTotalBytes = toFiniteNumber(os.totalmem());
  const ramFreeBytes = toFiniteNumber(os.freemem());
  const cpuUsagePercent = sampleCpuUsagePercent();
  const cpuTemperatureC = await resolveCpuTemperature(adapter, hostName);
  const processes = await resolveProcessCount(adapter);

  return {
    hostName,
    ts: Date.now(),
    diskTotalBytes: disk.totalBytes,
    diskFreeBytes: disk.freeBytes,
    ramTotalBytes,
    ramFreeBytes,
    cpuUsagePercent,
    cpuTemperatureC,
    processes,
  };
}

let previousCpuSnapshot = null;

function sampleCpuUsagePercent() {
  const cpuList = os.cpus();
  if (!Array.isArray(cpuList) || !cpuList.length) {
    return null;
  }

  let total = 0;
  let idle = 0;
  for (const core of cpuList) {
    const times = core?.times || {};
    const user = toFiniteNumber(times.user);
    const nice = toFiniteNumber(times.nice);
    const sys = toFiniteNumber(times.sys);
    const irq = toFiniteNumber(times.irq);
    const currentIdle = toFiniteNumber(times.idle);
    total += user + nice + sys + irq + currentIdle;
    idle += currentIdle;
  }

  const now = Date.now();
  if (!previousCpuSnapshot) {
    previousCpuSnapshot = { total, idle, now };
    return null;
  }

  const deltaTotal = total - previousCpuSnapshot.total;
  const deltaIdle = idle - previousCpuSnapshot.idle;
  previousCpuSnapshot = { total, idle, now };

  if (!Number.isFinite(deltaTotal) || deltaTotal <= 0) {
    return null;
  }

  const usage = ((deltaTotal - deltaIdle) / deltaTotal) * 100;
  return clampNumber(usage, 0, 100);
}

function readDiskStats() {
  const fallback = {
    totalBytes: null,
    freeBytes: null,
  };

  if (typeof fs.statfsSync !== "function") {
    return fallback;
  }

  try {
    const stats = fs.statfsSync("/");
    const blockSize = toFiniteNumber(stats.bsize || stats.frsize);
    const blocks = toFiniteNumber(stats.blocks);
    const freeBlocks = toFiniteNumber(stats.bavail ?? stats.bfree);

    if (!blockSize || !blocks || !Number.isFinite(freeBlocks)) {
      return fallback;
    }

    return {
      totalBytes: blockSize * blocks,
      freeBytes: blockSize * freeBlocks,
    };
  } catch {
    return fallback;
  }
}

async function resolveCpuTemperature(adapter, hostName) {
  const stateIds = [
    `system.host.${hostName}.cpuTemperature`,
    `system.host.${hostName}.temp`,
  ];

  for (const stateId of stateIds) {
    try {
      const state = await adapter.getForeignStateAsync(stateId);
      const parsed = parseTemperatureValue(state?.val);
      if (parsed !== null) {
        return parsed;
      }
    } catch {
      // continue
    }
  }

  const files = [
    "/sys/class/thermal/thermal_zone0/temp",
    "/sys/devices/virtual/thermal/thermal_zone0/temp",
    "/sys/class/hwmon/hwmon0/temp1_input",
  ];

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, "utf8");
      const parsed = parseTemperatureValue(content);
      if (parsed !== null) {
        return parsed;
      }
    } catch {
      // continue
    }
  }

  return null;
}

function parseTemperatureValue(value) {
  const numeric = toFiniteNumber(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }
  if (numeric > 1000) {
    return clampNumber(numeric / 1000, 0, 150);
  }
  return clampNumber(numeric, 0, 150);
}

async function resolveProcessCount(adapter) {
  try {
    const view = await adapter.getObjectViewAsync("system", "instance", {
      startkey: "system.adapter.",
      endkey: "system.adapter.\u9999",
    });
    const count = Array.isArray(view?.rows) ? view.rows.length : null;
    return Number.isFinite(count) ? count : null;
  } catch {
    return null;
  }
}

function toFiniteNumber(value) {
  if (typeof value === "bigint") {
    return Number(value);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
}

function normalizeWallboxDailyEnergyDayKey(value) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : "";
}

function normalizeWallboxDailyEnergyEntry(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const dayKey = normalizeWallboxDailyEnergyDayKey(value.dayKey);
  const dailyKWh = toFiniteNumber(value.dailyKWh);
  const lastMeterKWhRaw = value.lastMeterKWh;
  const lastMeterKWh = lastMeterKWhRaw === null ? null : toFiniteNumber(lastMeterKWhRaw);

  if (!dayKey || dailyKWh === null || dailyKWh < 0) {
    return null;
  }

  if (lastMeterKWh !== null && (!Number.isFinite(lastMeterKWh) || lastMeterKWh < 0)) {
    return null;
  }

  return {
    dayKey,
    dailyKWh,
    lastMeterKWh,
    updatedAt: Date.now(),
  };
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}

async function readSavedDashboards(adapter) {
  const state = await adapter.getStateAsync(SAVED_DASHBOARDS_STATE_ID);
  const raw = typeof state?.val === "string" ? state.val : "";
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([key, value]) => typeof key === "string" && key.trim() && typeof value === "string" && value
      )
    );
  } catch {
    return {};
  }
}

async function readWallboxDailyEnergyStore(adapter) {
  const state = await adapter.getStateAsync(WALLBOX_DAILY_ENERGY_STATE_ID);
  const raw = typeof state?.val === "string" ? state.val : "";
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    const normalizedStore = {};
    Object.entries(parsed).forEach(([widgetId, entry]) => {
      const normalizedWidgetId = normalizeRuntimeWidgetId(widgetId);
      const normalizedEntry = normalizeWallboxDailyEnergyEntry(entry);
      if (!normalizedWidgetId || !normalizedEntry) {
        return;
      }
      normalizedStore[normalizedWidgetId] = normalizedEntry;
    });
    return normalizedStore;
  } catch {
    return {};
  }
}

async function writeWallboxDailyEnergyStore(adapter, store) {
  await adapter.setStateAsync(WALLBOX_DAILY_ENERGY_STATE_ID, {
    val: JSON.stringify(store, null, 2),
    ack: true,
  });
}

async function writeSavedDashboards(adapter, dashboards) {
  await adapter.setStateAsync(SAVED_DASHBOARDS_STATE_ID, {
    val: JSON.stringify(dashboards, null, 2),
    ack: true,
  });
}

async function sendWebShell(webRoot, res, next) {
  try {
    if (!webShellCache) {
      const indexPath = path.join(webRoot, "index.html");
      const html = await fs.promises.readFile(indexPath, "utf8");
      webShellCache = injectStandaloneMeta(html);
    }

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(webShellCache);
  } catch (error) {
    next(error);
  }
}

function injectStandaloneMeta(html) {
  const standaloneMeta = [
    '<meta name="theme-color" content="#040811" />',
    '<meta name="apple-mobile-web-app-capable" content="yes" />',
    '<meta name="mobile-web-app-capable" content="yes" />',
    '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />',
    '<meta name="apple-mobile-web-app-title" content="SmartHome Dashboard" />',
  ].join("\n    ");

  return html
    .replace(
      /<meta name="viewport"[^>]*>/i,
      '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, shrink-to-fit=no" />'
    )
    .replace("</head>", `    ${standaloneMeta}\n  </head>`);
}

async function getCachedObjectEntries(adapter) {
  const cacheIsFresh = objectEntriesCache.length > 0 && Date.now() - objectEntriesCacheTimestamp < OBJECT_CACHE_TTL_MS;
  if (cacheIsFresh) {
    return objectEntriesCache;
  }

  return refreshObjectEntries(adapter);
}

async function refreshObjectEntries(adapter) {
  if (objectEntriesPromise) {
    return objectEntriesPromise;
  }

  objectEntriesPromise = adapter
    .getObjectViewAsync("system", "state", {
      startkey: "",
      endkey: "\u9999",
    })
    .then((view) => {
      objectEntriesCache = (view?.rows || []).map((row) => ({
        id: row.id,
        name:
          row.value &&
          row.value.common &&
          typeof row.value.common.name === "string"
            ? row.value.common.name
            : undefined,
        type:
          row.value &&
          row.value.common &&
          typeof row.value.common.type === "string"
            ? row.value.common.type
            : undefined,
        role:
          row.value &&
          row.value.common &&
          typeof row.value.common.role === "string"
            ? row.value.common.role
            : undefined,
        valueType:
          row.value &&
          row.value.common &&
          typeof row.value.common.type === "string"
            ? row.value.common.type
            : undefined,
      }));
      objectEntriesCacheTimestamp = Date.now();
      return objectEntriesCache;
    })
    .finally(() => {
      objectEntriesPromise = null;
    });

  return objectEntriesPromise;
}

if (require.main !== module) {
  module.exports = startAdapter;
} else {
  startAdapter();
}
