const utils = require("@iobroker/adapter-core");
const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");
const fs = require("fs");
const path = require("path");
const { Readable } = require("stream");
const { resolveWebRoot } = require("./lib/static");

let objectEntriesCache = [];
let objectEntriesCacheTimestamp = 0;
let objectEntriesPromise = null;
const OBJECT_CACHE_TTL_MS = 5 * 60 * 1000;
const CONFIG_STATE_ID = "dashboardConfig";
const SAVED_DASHBOARDS_STATE_ID = "savedDashboards";
let webShellCache = null;

function startAdapter(options) {
  const adapter = new utils.Adapter({
    ...options,
    name: "smarthome-dashboard",
    ready: () => main(adapter),
    unload: (callback) => callback(),
  });

  return adapter;
}

async function main(adapter) {
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

  refreshObjectEntries(adapter).catch((error) => {
    adapter.log.warn(`Object cache warmup failed: ${error instanceof Error ? error.message : String(error)}`);
  });

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

  app.put("/smarthome-dashboard/api/state", async (req, res) => {
    const { stateId, value } = req.body || {};
    if (!stateId) {
      res.status(400).json({ error: "stateId missing" });
      return;
    }

    await adapter.setForeignStateAsync(stateId, value, false);
    res.json({ ok: true });
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
      const response = await fetch(targetUrl, {
        cache: "no-store",
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

  app.get("/smarthome-dashboard/api/camera-mjpeg", async (req, res) => {
    const targetUrl = typeof req.query?.url === "string" ? req.query.url : "";
    if (!targetUrl) {
      res.status(400).json({ error: "url missing" });
      return;
    }

    const controller = new AbortController();
    req.on("close", () => controller.abort());

    try {
      const response = await fetch(targetUrl, {
        cache: "no-store",
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        res.status(response.status || 502).json({ error: `MJPEG fetch failed (${response.status || 502})` });
        return;
      }

      const contentType = response.headers.get("content-type") || "multipart/x-mixed-replace";
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Connection", "keep-alive");

      const stream = Readable.fromWeb(response.body);
      stream.on("error", () => {
        if (!res.headersSent) {
          res.status(500).end();
          return;
        }
        res.end();
      });
      stream.pipe(res);
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      res.status(500).json({ error: error instanceof Error ? error.message : "MJPEG proxy failed" });
    }
  });

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

  const port = Number(adapter.config.port) || 8099;
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
