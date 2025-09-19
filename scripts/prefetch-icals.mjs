#!/usr/bin/env node
import { fileURLToPath } from "url";
import path from "path";
import { mkdir, readFile, writeFile } from "fs/promises";
import http from "http";
import https from "https";
import tls from "tls";

const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || "";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const pubsPath = path.join(repoRoot, "pubs.json");
const feedsDir = path.join(repoRoot, "feeds");

async function ensureFeedsDirectory() {
  await mkdir(feedsDir, { recursive: true });
}

async function loadPubsConfig() {
  const raw = await readFile(pubsPath, "utf8");
  return JSON.parse(raw);
}

async function savePubsConfig(pubsConfig) {
  const serialized = `${JSON.stringify(pubsConfig, null, 2)}\n`;
  await writeFile(pubsPath, serialized, "utf8");
}

function isHttpUrl(url) {
  return /^https?:/i.test(url ?? "");
}

function buildProxyAuthHeader(url) {
  if (!url.username && !url.password) {
    return undefined;
  }

  const decodedUser = decodeURIComponent(url.username || "");
  const decodedPass = decodeURIComponent(url.password || "");
  const token = Buffer.from(`${decodedUser}:${decodedPass}`).toString("base64");
  return `Basic ${token}`;
}

function fetchDirect(url) {
  return new Promise((resolve, reject) => {
    const targetUrl = new URL(url);
    const client = targetUrl.protocol === "https:" ? https : http;

    const request = client.get(
      targetUrl,
      {
        headers: {
          "User-Agent": "sportspub-ical-prefetch",
          Accept: "text/calendar,text/plain,*/*",
        },
      },
      (response) => {
        if (response.statusCode !== 200) {
          reject(
            new Error(`Failed to fetch ${url}: ${response.statusCode} ${response.statusMessage}`)
          );
          response.resume();
          return;
        }

        const chunks = [];
        response.setEncoding("utf8");
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => resolve(chunks.join("")));
      }
    );

    request.on("error", reject);
  });
}

function parseHttpResponse(responseText) {
  const separator = responseText.indexOf("\r\n\r\n");
  const headerText = separator >= 0 ? responseText.slice(0, separator) : responseText;
  const bodyText = separator >= 0 ? responseText.slice(separator + 4) : "";
  const headerLines = headerText.split(/\r?\n/);
  const statusLine = headerLines.shift() || "";
  const statusMatch = statusLine.match(/^HTTP\/\d+\.\d+\s+(\d+)/);
  const statusCode = statusMatch ? Number(statusMatch[1]) : NaN;
  const headers = {};

  headerLines.forEach((line) => {
    const [name, ...rest] = line.split(":");
    if (!name) {
      return;
    }
    headers[name.trim().toLowerCase()] = rest.join(":").trim();
  });

  return { statusLine, statusCode, headers, bodyText };
}

function decodeChunkedBody(bodyText) {
  let index = 0;
  let decoded = "";

  while (index < bodyText.length) {
    const lineEnd = bodyText.indexOf("\r\n", index);
    if (lineEnd === -1) {
      break;
    }

    const sizeLine = bodyText.slice(index, lineEnd);
    const separatorIndex = sizeLine.indexOf(";");
    const sizeValue = separatorIndex >= 0 ? sizeLine.slice(0, separatorIndex) : sizeLine;
    const size = Number.parseInt(sizeValue.trim(), 16);
    if (Number.isNaN(size)) {
      throw new Error(`Unable to parse chunk size: ${sizeLine}`);
    }

    index = lineEnd + 2;
    if (size === 0) {
      break;
    }

    decoded += bodyText.slice(index, index + size);
    index += size + 2;
  }

  return decoded;
}

function fetchViaHttpProxy(url, proxy) {
  const targetUrl = new URL(url);
  const proxyUrlObj = new URL(proxy);
  const proxyPort = proxyUrlObj.port ? Number(proxyUrlObj.port) : 80;
  const proxyAuth = buildProxyAuthHeader(proxyUrlObj);

  if (targetUrl.protocol === "http:") {
    return new Promise((resolve, reject) => {
      const request = http.request(
        {
          host: proxyUrlObj.hostname,
          port: proxyPort,
          method: "GET",
          path: targetUrl.toString(),
          headers: {
            Host: targetUrl.host,
            "User-Agent": "sportspub-ical-prefetch",
            Accept: "text/calendar,text/plain,*/*",
            ...(proxyAuth ? { "Proxy-Authorization": proxyAuth } : {}),
          },
        },
        (response) => {
          if (response.statusCode !== 200) {
            reject(
              new Error(
                `Failed to fetch ${url} via proxy: ${response.statusCode} ${response.statusMessage}`
              )
            );
            response.resume();
            return;
          }

          const chunks = [];
          response.setEncoding("utf8");
          response.on("data", (chunk) => chunks.push(chunk));
          response.on("end", () => resolve(chunks.join("")));
        }
      );

      request.on("error", reject);
      request.end();
    });
  }

  return new Promise((resolve, reject) => {
    const connectRequest = http.request({
      host: proxyUrlObj.hostname,
      port: proxyPort,
      method: "CONNECT",
      path: `${targetUrl.hostname}:${targetUrl.port || 443}`,
      headers: {
        Host: `${targetUrl.hostname}:${targetUrl.port || 443}`,
        ...(proxyAuth ? { "Proxy-Authorization": proxyAuth } : {}),
      },
    });

    connectRequest.on("connect", (res, socket) => {
      if (res.statusCode !== 200) {
        reject(
          new Error(
            `Proxy CONNECT to ${url} failed with status ${res.statusCode}`
          )
        );
        socket.destroy();
        return;
      }

      const tlsSocket = tls.connect({
        socket,
        servername: targetUrl.hostname,
      });

      const requestLines = [
        `GET ${targetUrl.pathname}${targetUrl.search || ""} HTTP/1.1`,
        `Host: ${targetUrl.host}`,
        "User-Agent: sportspub-ical-prefetch",
        "Accept: text/calendar,text/plain,*/*",
        "Connection: close",
        "",
        "",
      ];

      tlsSocket.write(requestLines.join("\r\n"));

      const chunks = [];
      tlsSocket.on("data", (chunk) => chunks.push(chunk));
      tlsSocket.on("error", reject);
      tlsSocket.on("end", () => {
        const rawBuffer = Buffer.concat(chunks.map((chunk) => Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        const responseText = rawBuffer.toString("utf8");
        const { statusLine, statusCode, headers, bodyText } = parseHttpResponse(responseText);

        if (statusCode !== 200) {
          reject(new Error(`Failed to fetch ${url}: ${statusLine || "Unknown status"}`));
          return;
        }

        const transferEncoding = headers["transfer-encoding"] || "";
        const decodedBody = transferEncoding.toLowerCase().includes("chunked")
          ? decodeChunkedBody(bodyText)
          : bodyText;

        resolve(decodedBody);
      });
    });

    connectRequest.on("error", reject);
    connectRequest.end();
  });
}

async function fetchIcs(url) {
  if (!isHttpUrl(url)) {
    throw new Error(`Unsupported calendar URL: ${url}`);
  }

  if (proxyUrl) {
    return await fetchViaHttpProxy(url, proxyUrl);
  }

  return await fetchDirect(url);
}

async function writeIcs(pubKey, icsContents) {
  const outputPath = path.join(feedsDir, `${pubKey}.ics`);
  await writeFile(outputPath, icsContents, "utf8");
  return outputPath;
}

async function main() {
  await ensureFeedsDirectory();

  const pubs = await loadPubsConfig();
  const updatedKeys = [];

  for (const [pubKey, pubConfig] of Object.entries(pubs)) {
    const sourceUrl = pubConfig.sourceIcal || pubConfig.ical;

    if (!sourceUrl) {
      console.warn(`Skipping ${pubKey}: missing calendar URL.`);
      continue;
    }

    try {
      console.log(`Fetching calendar for ${pubKey} from ${sourceUrl}`);
      const icsText = await fetchIcs(sourceUrl);
      await writeIcs(pubKey, icsText);

      pubConfig.sourceIcal = sourceUrl;
      pubConfig.ical = path.posix.join("feeds", `${pubKey}.ics`);

      updatedKeys.push(pubKey);
    } catch (error) {
      console.error(`Failed to fetch calendar for ${pubKey}`, error);
    }
  }

  await savePubsConfig(pubs);

  if (updatedKeys.length === 0) {
    console.log("No calendars were updated.");
    return;
  }

  console.log(`Updated calendars for: ${updatedKeys.join(", ")}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
