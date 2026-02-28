const utils = require("@iobroker/adapter-core");
const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");
const fs = require("fs");
const path = require("path");
const { resolveWebRoot } = require("./lib/static");

let objectEntriesCache = [];
let objectEntriesCacheTimestamp = 0;
let objectEntriesPromise = null;
const OBJECT_CACHE_TTL_MS = 5 * 60 * 1000;

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

  refreshObjectEntries(adapter).catch((error) => {
    adapter.log.warn(`Object cache warmup failed: ${error instanceof Error ? error.message : String(error)}`);
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
    app.use("/smarthome-dashboard", express.static(webRoot));
    app.get("/smarthome-dashboard/*", (req, res, next) => {
      const indexPath = path.join(webRoot, "index.html");
      res.sendFile(indexPath, (error) => {
        if (error) {
          next();
        }
      });
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
