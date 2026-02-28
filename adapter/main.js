const utils = require("@iobroker/adapter-core");
const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");
const path = require("path");
const { resolveWebRoot } = require("./lib/static");

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
  const devServerUrl =
    adapter.config && typeof adapter.config.devServerUrl === "string" ? adapter.config.devServerUrl.trim() : "";

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
    const view = await adapter.getObjectViewAsync("system", "state", {
      startkey: "",
      endkey: "\u9999",
    });

    const entries = (view?.rows || [])
      .map((row) => ({
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
      }))
      .filter((entry) => {
        if (!query) {
          return true;
        }

        return (
          entry.id.toLowerCase().includes(query) ||
          (entry.name && entry.name.toLowerCase().includes(query)) ||
          (entry.role && entry.role.toLowerCase().includes(query))
        );
      })
      .slice(0, 500);

    res.json(entries);
  });

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

if (require.main !== module) {
  module.exports = startAdapter;
} else {
  startAdapter();
}
