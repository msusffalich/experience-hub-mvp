import { randomUUID } from "node:crypto";
import { ApiError, asApiError } from "./errors.mjs";

export function createRouter() {
  const routes = [];

  function add(method, pattern, handler, options = {}) {
    routes.push({
      method: method.toUpperCase(),
      pattern,
      handler,
      auth: options.auth !== false,
      body: options.body || "json",
    });
  }

  async function dispatch(req, res, context) {
    const url = new URL(req.url, "http://localhost");
    const route = routes.find((candidate) =>
      candidate.method === req.method && matchPath(candidate.pattern, url.pathname),
    );
    if (!route) return false;
    const params = matchPath(route.pattern, url.pathname);
    try {
      const auth = route.auth ? await context.auth.requireUser(req) : null;
      const body = ["POST", "PUT", "PATCH", "DELETE"].includes(req.method)
        ? await readBody(req, route.body, context.config.maxJsonBytes)
        : null;
      const result = await route.handler({
        req,
        res,
        url,
        params,
        body,
        auth,
        context,
      });
      if (!res.writableEnded) sendResult(res, result);
    } catch (error) {
      sendError(res, asApiError(error), context.requestId);
    }
    return true;
  }

  return { add, dispatch, routes };
}

export function json(status, body, headers = {}) {
  return { type: "json", status, body, headers };
}

export function bytes(status, body, contentType, headers = {}) {
  return { type: "bytes", status, body, contentType, headers };
}

export function redirect(location, status = 302) {
  return { type: "redirect", status, location };
}

export function noContent() {
  return { type: "empty", status: 204 };
}

export function requestId(req) {
  return String(req.headers["x-request-id"] || randomUUID()).slice(0, 128);
}

function matchPath(pattern, pathname) {
  const expected = pattern.split("/").filter(Boolean);
  const actual = pathname.split("/").filter(Boolean);
  if (expected.length !== actual.length) return false;
  const params = {};
  for (let index = 0; index < expected.length; index += 1) {
    if (expected[index].startsWith(":")) {
      params[expected[index].slice(1)] = decodeURIComponent(actual[index]);
    } else if (expected[index] !== actual[index]) {
      return false;
    }
  }
  return params;
}

async function readBody(req, bodyType, maxBytes) {
  if (bodyType === "none") return null;
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      throw new ApiError(413, "request_too_large", "La solicitud supera el límite permitido.");
    }
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
  if (bodyType === "bytes") return buffer;
  if (!buffer.length) return {};
  try {
    return JSON.parse(buffer.toString("utf8"));
  } catch {
    throw new ApiError(400, "invalid_json", "La solicitud no contiene JSON válido.");
  }
}

function sendResult(res, result) {
  if (!result) return sendResult(res, noContent());
  const headers = {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...(result.headers || {}),
  };
  if (result.type === "redirect") {
    res.writeHead(result.status, { ...headers, Location: result.location });
    res.end();
    return;
  }
  if (result.type === "bytes") {
    res.writeHead(result.status, {
      ...headers,
      "Content-Type": result.contentType || "application/octet-stream",
      "Content-Length": result.body.length,
    });
    res.end(result.body);
    return;
  }
  if (result.type === "empty") {
    res.writeHead(result.status, headers);
    res.end();
    return;
  }
  const payload = Buffer.from(JSON.stringify(result.body ?? null));
  res.writeHead(result.status, {
    ...headers,
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": payload.length,
  });
  res.end(payload);
}

function sendError(res, error, id) {
  const body = {
    error: error.code,
    message: error.message,
    requestId: id,
    ...(error.details ? { details: error.details } : {}),
  };
  sendResult(res, json(error.status || 500, body));
}
