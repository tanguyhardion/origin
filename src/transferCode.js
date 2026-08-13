import { v4 as uuidv4 } from "uuid";
import { normalizeServerUrl } from "./utils";

export function generateTransferCode() {
  return uuidv4().slice(0, 8).toUpperCase();
}

export function encodeTransferPayload({ code, serverUrl }) {
  return JSON.stringify({ code, serverUrl: normalizeServerUrl(serverUrl) });
}

export function parseTransferPayload(value) {
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed.code === "string") {
      return {
        code: parsed.code.trim(),
        serverUrl: typeof parsed.serverUrl === "string" ? normalizeServerUrl(parsed.serverUrl) : "",
      };
    }
  } catch {
    // fallback to plain code
  }

  return { code: value.trim(), serverUrl: "" };
}

