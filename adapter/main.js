const utils = require("@iobroker/adapter-core");
const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");
const fs = require("fs");
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
    parsed.searchParams.get("Password") ||
    parsed.searchParams.get("Pass") ||
    "";

  if (authFromUserInfo || queryUser || queryPassword) {
    const username = decodeURIComponent(parsed.username || queryUser || "");
    const password = decodeURIComponent(parsed.password || queryPassword || "");
    const auth = Buffer.from(`${username}:${password}`).toString("base64");
    headers.Authorization = `Basic ${auth}`;
    if (authFromUserInfo) {
      parsed.username = "";
      parsed.password = "";
    }
  }

  return {
    url: parsed.toString(),
    headers,
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

function proxyCameraStream(requestConfig, req, res, streamType, redirects) {
  const sanitizedUrl = sanitizeCameraUrlForLog(requestConfig.url);
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
  const upstreamRequest = transport.request(
    {
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || (useHttps ? 443 : 80),
      method: "GET",
      path: `${parsed.pathname}${parsed.search}`,
      headers: {
        Accept: "*/*",
        Connection: "keep-alive",
        "User-Agent": "ioBroker-smart-dashboard-camera-proxy/1.0",
        ...requestConfig.headers,
      },
      rejectUnauthorized: !(useHttps && isLikelyLocalHost(parsed.hostname)),
    },
    (upstreamResponse) => {
      const statusCode = upstreamResponse.statusCode || 502;
      const location = upstreamResponse.headers.location;
      const upstreamContentType = upstreamResponse.headers["content-type"] || "";

      if (
        location &&
        [301, 302, 303, 307, 308].includes(statusCode) &&
        redirects < 5
      ) {
        adapter.log.debug(
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
        proxyCameraStream(redirectedConfig, req, res, streamType, redirects + 1);
        return;
      }

      if (statusCode >= 400) {
        adapter.log.warn(
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

      adapter.log.debug(
        `[camera-proxy] stream ok streamType=${streamType || "unknown"} status=${statusCode} contentType=${String(
          upstreamContentType
        )} url=${sanitizedUrl}`
      );

      const sourceContentType = upstreamResponse.headers["content-type"];
      const contentType =
        sourceContentType ||
        (streamType === "flv" || looksLikeFlvUrl(requestConfig.url) ? "video/x-flv" : "multipart/x-mixed-replace");

      res.status(statusCode);
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Connection", "keep-alive");
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
    try {
      upstreamRequest.destroy();
    } catch {
      // ignore
    }
  };

  req.on("aborted", closeUpstream);
  res.on("close", closeUpstream);

  upstreamRequest.on("error", (error) => {
    adapter.log.warn(
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
