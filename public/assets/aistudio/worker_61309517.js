// edge-tts-worker 單檔版（自動產生，請勿手改；原始碼見 src/）

// src/constants.ts
var TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
var BASE_URL = "speech.platform.bing.com/consumer/speech/synthesize/readaloud";
var WSS_URL = `https://${BASE_URL}/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}`;
var VOICE_LIST_URL = `https://${BASE_URL}/voices/list?trustedclienttoken=${TRUSTED_CLIENT_TOKEN}`;
var CHROMIUM_FULL_VERSION = "143.0.3650.75";
var CHROMIUM_MAJOR_VERSION = CHROMIUM_FULL_VERSION.split(".")[0];
var SEC_MS_GEC_VERSION = `2-${CHROMIUM_FULL_VERSION}`;
var ORIGIN = "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold";
var BASE_HEADERS = {
  "User-Agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROMIUM_MAJOR_VERSION}.0.0.0 Safari/537.36 Edg/${CHROMIUM_MAJOR_VERSION}.0.0.0`,
  "Accept-Encoding": "gzip, deflate, br, zstd",
  "Accept-Language": "en-US,en;q=0.9"
};
var WSS_HEADERS = {
  Pragma: "no-cache",
  "Cache-Control": "no-cache",
  Origin: ORIGIN,
  ...BASE_HEADERS
};
var VOICE_HEADERS = {
  Authority: "speech.platform.bing.com",
  "Sec-CH-UA": `" Not;A Brand";v="99", "Microsoft Edge";v="${CHROMIUM_MAJOR_VERSION}", "Chromium";v="${CHROMIUM_MAJOR_VERSION}"`,
  "Sec-CH-UA-Mobile": "?0",
  Accept: "*/*",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Dest": "empty",
  ...BASE_HEADERS
};
var MAX_TEXT_BYTES = 4096;
var DEFAULT_VOICE = "zh-CN-XiaoxiaoNeural";
var DEFAULT_OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3";

// src/drm.ts
var WIN_EPOCH = 11644473600n;
var SHA256_INITIAL = [
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
];
var SHA256_STATE = [
  4255104674,
  2435071207,
  3192492180,
  3442351626,
  1811967817,
  79508907,
  4272990180,
  66059218
];
var SHA256_SCHEDULE = [
  3945054110,
  358115615,
  2696978146,
  217723578,
  2787307148,
  3520959633,
  3235718560,
  4192668342,
  4039316851,
  1884868174,
  1904797190,
  15051571,
  3529027680,
  1920361828
];
var SHA256_ROUND_CONSTANTS = [
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
];
var SHA256_ADJUSTMENT = 3386640039;
var SHA256_BLOCK_CONSTANTS = [
  ...SHA256_ROUND_CONSTANTS.slice(0, 14),
  SHA256_ADJUSTMENT,
  ...SHA256_ROUND_CONSTANTS.slice(15)
];
var SHA256_SIGMA0_ADJUSTMENT = 94112640;
var SHA256_SIGMA1_ADJUSTMENT = 758464;
var CS64_COEFFICIENTS = [
  [3895366065, 3005677776],
  [1155409094, 2296378653],
  [1005282748, 693190712],
  [3365689651, 3005795295],
  [2367603217, 3557143765],
  [827258325, 652566332],
  [3911487921, 1618477510],
  [4037392853, 2192753147],
  [101076211, 4199654362],
  [3665427040, 545047652],
  [3201434976, 1010595059],
  [2314848760, 3536931681],
  [905590982, 3137643201],
  [3410617286, 3311559015]
];
var CS64_FACTOR = 2190031155;
var CS64_ADJUSTMENT0 = 4076407578;
var CS64_ADJUSTMENT1 = 186253312;
var u32 = (value) => value >>> 0;
var mul = (a, b) => Math.imul(a, b) >>> 0;
var rotr = (value, bits) => (value >>> bits | value << 32 - bits) >>> 0;
var rol16 = (value) => (value << 16 | value >>> 16) >>> 0;
var sigma0 = (x) => (rotr(x, 7) ^ rotr(x, 18) ^ x >>> 3) >>> 0;
var sigma1 = (x) => (rotr(x, 17) ^ rotr(x, 19) ^ x >>> 10) >>> 0;
function readU32BE(data, offset) {
  return u32(data[offset] << 24 | data[offset + 1] << 16 | data[offset + 2] << 8 | data[offset + 3]);
}
function wordsLe4Even(data) {
  const paddedLength = Math.ceil(data.length / 4) * 4;
  const padded = new Uint8Array(paddedLength);
  padded.set(data);
  const words = [];
  for (let i = 0; i < paddedLength; i += 4) {
    words.push(u32(padded[i] | padded[i + 1] << 8 | padded[i + 2] << 16 | padded[i + 3] << 24));
  }
  if (words.length % 2) words.push(0);
  return words;
}
function expandSchedule(words, firstWord = 16) {
  for (let i = firstWord; i < 64; i++) {
    words.push(u32(sigma1(words[i - 2]) + words[i - 7] + sigma0(words[i - 15]) + words[i - 16]));
  }
}
function sha256Rounds(state, words, firstRound = 0) {
  let [a, b, c, d, e, f, g, h] = state;
  const constants = firstRound === 14 ? SHA256_BLOCK_CONSTANTS : SHA256_ROUND_CONSTANTS;
  for (let i = firstRound; i < 64; i++) {
    const t1 = h + u32(rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + u32(g ^ e & (f ^ g)) + constants[i] + words[i];
    const t2 = u32(rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + u32(a & b | c & (a | b));
    h = g;
    g = f;
    f = e;
    e = u32(d + t1);
    d = c;
    c = b;
    b = a;
    a = u32(t1 + t2);
  }
  return [a, b, c, d, e, f, g, h];
}
function sha256Init(data) {
  const words = new Array(14).fill(0);
  words.push(u32(data[0] << 16 | data[1] << 8 | data[2]));
  words.push(readU32BE(data, 3));
  for (let i = 16; i < 30; i++) {
    let value = SHA256_SCHEDULE[i - 16];
    if (i - 2 >= 14) value += i === 16 ? u32(sigma1(words[i - 2]) ^ SHA256_SIGMA1_ADJUSTMENT) : sigma1(words[i - 2]);
    if (i - 7 >= 14) value += words[i - 7];
    if (i - 15 >= 14) value += i === 29 ? u32(sigma0(words[i - 15]) ^ SHA256_SIGMA0_ADJUSTMENT) : sigma0(words[i - 15]);
    words.push(u32(value));
  }
  words.push(u32(sigma1(words[28]) + words[23] + sigma0(words[15]) + words[14] + SHA256_ADJUSTMENT - SHA256_ROUND_CONSTANTS[14]));
  expandSchedule(words, 31);
  const working = sha256Rounds(SHA256_STATE, words, 14);
  return SHA256_INITIAL.map((x, i) => u32(x + working[i]));
}
function sha256Digest(data) {
  if (data.length < 7) throw new Error("Token salt must contain at least seven bytes");
  const length = 57 + data.length;
  const zeroCount = ((55 - length) % 64 + 64) % 64;
  const padded = new Uint8Array(data.length - 7 + 1 + zeroCount + 8);
  padded.set(data.subarray(7));
  padded[data.length - 7] = 128;
  const view = new DataView(padded.buffer);
  view.setBigUint64(padded.length - 8, BigInt(length * 8), false);
  let state = sha256Init(data.subarray(0, 7));
  for (let offset = 0; offset < padded.length; offset += 64) {
    const words = [];
    for (let i = 0; i < 16; i++) words.push(view.getUint32(offset + i * 4, false));
    expandSchedule(words);
    const working = sha256Rounds(state, words);
    state = state.map((x, i) => u32(x + working[i]));
  }
  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  state.forEach((x, i) => outView.setUint32(i * 4, x, false));
  return out;
}
function cs64Digest(data, digest) {
  const digestView = new DataView(digest.buffer, digest.byteOffset, digest.byteLength);
  const keyA = u32(digestView.getUint32(0, true) | 1);
  const keyB = u32(digestView.getUint32(4, true) | 1);
  const factors = [mul(keyA, CS64_FACTOR), mul(keyB, CS64_FACTOR)];
  const terms = CS64_COEFFICIENTS.map(([coefficient], i) => mul(coefficient, factors[i % 2]));
  const offsets = CS64_COEFFICIENTS.map(([, offset]) => offset);
  const prefixed = new Uint8Array(data.length + 1);
  prefixed.set(data, 1);
  wordsLe4Even(prefixed).forEach((word, i) => {
    let term = mul(word, i % 2 === 0 ? keyA : keyB);
    let offset = mul(rol16(word), i % 2 === 0 ? 4010109435 : 3273069531);
    if (i === 0) {
      term += mul(CS64_ADJUSTMENT0, factors[0]);
      offset += CS64_ADJUSTMENT1;
    }
    terms.push(u32(term));
    offsets.push(u32(offset));
  });
  let swapAcc = 0;
  let swapLast = 0;
  let state = 0;
  let acc = 0;
  for (let i = 0; i < terms.length; i += 2) {
    const x = terms[i];
    const y = terms[i + 1];
    let t = rol16(u32(offsets[i] + x));
    let q = mul(t, 1995771700);
    swapAcc += u32(mul(rol16(q), 3287280279) + q);
    t = rol16(u32(offsets[i + 1] + y));
    q = mul(t, 411160124);
    swapLast = u32(mul(rol16(q), 901586633) + q);
    swapAcc = u32(swapAcc + swapLast);
    state = u32(mul(state, keyA) + x);
    state = mul(rol16(state), 3482890513);
    state = mul(rol16(state), 2265471903);
    state = mul(rol16(state), 315537773);
    state = mul(rol16(state), 629022083);
    acc += state;
    t = u32(mul(state, keyB) + y);
    t = mul(rol16(t), 2725517045);
    t = mul(rol16(t), 3548616447);
    state = mul(rol16(mul(rol16(t), 2090019721)), 3215236969);
    acc = u32(acc + state);
  }
  return [u32(swapLast ^ state), u32(swapAcc ^ acc)];
}
function toHexUpper(bytes) {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s.toUpperCase();
}
var cachedTokenInput = null;
var cachedToken = "";
function tokenHash(input) {
  if (input === cachedTokenInput) return cachedToken;
  const data = new TextEncoder().encode(input);
  const digest = sha256Digest(data);
  const [lo, hi] = cs64Digest(data, digest);
  const cs64Bytes = new Uint8Array(8);
  const cs64View = new DataView(cs64Bytes.buffer);
  cs64View.setUint32(0, lo, true);
  cs64View.setUint32(4, hi, true);
  cachedTokenInput = input;
  cachedToken = `${toHexUpper(cs64Bytes)}-${toHexUpper(digest)}`;
  return cachedToken;
}
var clockSkewSeconds = 0;
var DRM = {
  getUnixTimestamp() {
    return Date.now() / 1e3 + clockSkewSeconds;
  },
  /** 依伺服器回應的 Date 標頭校正時鐘偏差（收到 403 時呼叫）。 */
  handleServerDate(serverDate) {
    if (!serverDate) throw new Error("No server date in headers.");
    const parsed = Date.parse(serverDate);
    if (Number.isNaN(parsed)) throw new Error(`Failed to parse server date: ${serverDate}`);
    clockSkewSeconds += parsed / 1e3 - DRM.getUnixTimestamp();
  },
  resetClockSkew() {
    clockSkewSeconds = 0;
  },
  /** 產生 v2 格式 Sec-MS-GEC；unixTimestamp 僅供測試固定時間。 */
  generateSecMsGec(unixTimestamp) {
    const timestamp = unixTimestamp ?? DRM.getUnixTimestamp();
    let seconds = BigInt(Math.floor(timestamp)) + WIN_EPOCH;
    seconds -= seconds % 300n;
    const ticks = seconds * 10000000n;
    return tokenHash(`${ticks}${TRUSTED_CLIENT_TOKEN}`);
  },
  generateMuid() {
    return toHexUpper(crypto.getRandomValues(new Uint8Array(16)));
  }
};

// src/text.ts
function removeIncompatibleCharacters(text) {
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ");
}
var XML_ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;"
};
function escapeXml(text) {
  return text.replace(/[&<>"']/g, (c) => XML_ESCAPES[c]);
}
function escapedByteLength(char) {
  const escaped = XML_ESCAPES[char];
  if (escaped) return escaped.length;
  const cp = char.codePointAt(0);
  if (cp < 128) return 1;
  if (cp < 2048) return 2;
  if (cp < 65536) return 3;
  return 4;
}
var SPLIT_PRIORITY = [/\n/, /[。！？!?…]/, /[；;，,、：:]/, /\s/];
var MIN_SPLIT_RATIO = 1 / 3;
function splitTextByByteLength(text, maxBytes = MAX_TEXT_BYTES) {
  const chars = Array.from(text);
  const chunks = [];
  let start = 0;
  while (start < chars.length) {
    let bytes = 0;
    let end = start;
    while (end < chars.length) {
      const len = escapedByteLength(chars[end]);
      if (bytes + len > maxBytes) break;
      bytes += len;
      end++;
    }
    if (end === start) end = start + 1;
    if (end < chars.length) {
      const minEnd = start + (end - start) * MIN_SPLIT_RATIO;
      let fallback = -1;
      let chosen = -1;
      for (const re of SPLIT_PRIORITY) {
        let found = -1;
        for (let i = end - 1; i > start; i--) {
          if (re.test(chars[i])) {
            found = i + 1;
            break;
          }
        }
        if (found < 0) continue;
        if (found >= minEnd) {
          chosen = found;
          break;
        }
        fallback = Math.max(fallback, found);
      }
      if (chosen < 0) chosen = fallback;
      if (chosen > start) end = chosen;
    }
    const chunk = chars.slice(start, end).join("").trim();
    if (chunk) chunks.push(chunk);
    start = end;
  }
  return chunks;
}
function hasSpeakableContent(text) {
  return /[\p{L}\p{N}]/u.test(text);
}
function pct(n) {
  return `${Math.round(n * 100) / 100}%`;
}
function buildSSML(text, o) {
  return `<speak xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" xmlns:emo="http://www.w3.org/2009/10/emotionml" version="1.0" xml:lang="en-US"><voice name="${escapeXml(o.voice)}"><prosody volume="${pct(o.volume)}" rate="${pct(o.rate)}" pitch="${pct(o.pitch)}">` + escapeXml(text) + `</prosody></voice></speak>`;
}
function isValidVoiceName(voice) {
  return voice.length <= 120 && /^[A-Za-z0-9][A-Za-z0-9 ,()_.\-]*$/.test(voice);
}
function prepareChunks(text, maxBytes = MAX_TEXT_BYTES) {
  return splitTextByByteLength(removeIncompatibleCharacters(text), maxBytes).filter(hasSpeakableContent);
}

// src/edge.ts
var EdgeHttpError = class extends Error {
  constructor(status, serverDate, detail = "") {
    super(`Edge TTS \u4F3A\u670D\u5668\u62D2\u7D55\u9023\u7DDA\uFF1AHTTP ${status}${detail ? ` ${detail}` : ""}`);
    this.status = status;
    this.serverDate = serverDate;
  }
};
var NoAudioError = class extends Error {
  constructor() {
    super("Edge TTS \u6C92\u6709\u56DE\u50B3\u97F3\u8A0A\uFF0C\u8ACB\u78BA\u8A8D\u97F3\u8272\u540D\u7A31\u8207\u53C3\u6578\u662F\u5426\u6B63\u78BA");
  }
};
function connectId() {
  return crypto.randomUUID().replaceAll("-", "");
}
function dateToString(date = /* @__PURE__ */ new Date()) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const pad = (n) => String(n).padStart(2, "0");
  return `${days[date.getUTCDay()]} ${months[date.getUTCMonth()]} ${pad(date.getUTCDate())} ${date.getUTCFullYear()} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} GMT+0000 (Coordinated Universal Time)`;
}
function buildSpeechConfig(format) {
  return `X-Timestamp:${dateToString()}\r
Content-Type:application/json; charset=utf-8\r
Path:speech.config\r
\r
{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"${format}"}}}}\r
`;
}
function buildSsmlMessage(requestId, ssml) {
  return `X-RequestId:${requestId}\r
Content-Type:application/ssml+xml\r
X-Timestamp:${dateToString()}Z\r
Path:ssml\r
\r
` + ssml;
}
function buildWsUrl() {
  return `${WSS_URL}&ConnectionId=${connectId()}&Sec-MS-GEC=${DRM.generateSecMsGec()}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}`;
}
var decoder = new TextDecoder();
function parseBinaryFrame(buf) {
  const bytes = new Uint8Array(buf);
  if (bytes.length < 2) throw new Error("Edge TTS \u56DE\u50B3\u7684\u4E8C\u9032\u4F4D\u8A0A\u606F\u7F3A\u5C11\u6A19\u982D\u9577\u5EA6");
  const headerLength = bytes[0] << 8 | bytes[1];
  if (headerLength + 2 > bytes.length) throw new Error("Edge TTS \u56DE\u50B3\u7684\u6A19\u982D\u9577\u5EA6\u5927\u65BC\u8A0A\u606F\u672C\u8EAB");
  const header = decoder.decode(bytes.subarray(2, 2 + headerLength));
  return { ...parseHeaders(header), data: bytes.subarray(2 + headerLength) };
}
function parseHeaders(header) {
  let path = null;
  let contentType = null;
  let requestId = null;
  for (const line of header.split("\r\n")) {
    const i = line.indexOf(":");
    if (i < 0) continue;
    const k = line.slice(0, i);
    const v = line.slice(i + 1).trim();
    if (k === "Path") path = v;
    else if (k === "Content-Type") contentType = v;
    else if (k === "X-RequestId") requestId = v;
  }
  return { path, contentType, requestId };
}
var workerConnect = async (url, headers) => {
  const resp = await fetch(url, { headers: { ...headers, Upgrade: "websocket" } });
  return { ws: resp.webSocket, status: resp.status, date: resp.headers.get("date") };
};
async function synthesizeChunk(text, opts, onAudio, connect = workerConnect) {
  try {
    return await synthesizeOnce(text, opts, onAudio, connect);
  } catch (e) {
    if (e instanceof EdgeHttpError && e.status === 403) {
      DRM.handleServerDate(e.serverDate);
      return await synthesizeOnce(text, opts, onAudio, connect);
    }
    throw e;
  }
}
async function synthesizeOnce(text, opts, onAudio, connect) {
  const headers = { ...WSS_HEADERS, Cookie: `muid=${DRM.generateMuid()};` };
  const { ws, status, date } = await connect(buildWsUrl(), headers);
  if (!ws) throw new EdgeHttpError(status, date);
  try {
    ;
    ws.binaryType = "arraybuffer";
  } catch {
  }
  ws.accept();
  const requestId = connectId();
  const format = opts.format ?? DEFAULT_OUTPUT_FORMAT;
  let total = 0;
  return await new Promise((resolve, reject) => {
    let settled = false;
    const idleMs = opts.timeoutMs ?? 3e4;
    let last = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - last > idleMs) finish(new Error("Edge TTS \u903E\u6642\u672A\u56DE\u61C9"));
    }, Math.min(5e3, idleMs));
    const finish = (err) => {
      if (settled) return;
      settled = true;
      clearInterval(timer);
      try {
        ws.close(1e3, "done");
      } catch {
      }
      if (err) reject(err);
      else resolve(total);
    };
    let checked = false;
    const onBinary = (buf) => {
      if (!checked) {
        const f = parseBinaryFrame(buf);
        if (f.path !== "audio" || f.requestId && f.requestId !== requestId) return;
        checked = true;
      }
      const bytes = new Uint8Array(buf);
      const start = 2 + (bytes[0] << 8 | bytes[1]);
      if (start >= bytes.length) return;
      const data = bytes.subarray(start);
      total += data.byteLength;
      onAudio(data);
    };
    const onText = (t) => {
      if (t.includes("Path:turn.end")) finish();
    };
    let queue = null;
    const enqueue = (fn) => {
      queue = (queue ?? Promise.resolve()).then(fn).catch((e) => finish(e));
    };
    ws.addEventListener("message", (ev) => {
      if (settled) return;
      last = Date.now();
      const d = ev.data;
      try {
        if (typeof d === "string") return queue ? enqueue(() => onText(d)) : onText(d);
        if (d instanceof ArrayBuffer) return queue ? enqueue(() => onBinary(d)) : onBinary(d);
        if (ArrayBuffer.isView(d)) {
          const b = d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength);
          return queue ? enqueue(() => onBinary(b)) : onBinary(b);
        }
        enqueue(async () => onBinary(await d.arrayBuffer()));
      } catch (e) {
        finish(e);
      }
    });
    ws.addEventListener("close", (ev) => {
      const done = () => {
        if (!settled) finish(ev.code === 1e3 && total > 0 ? void 0 : new Error(`Edge TTS \u9023\u7DDA\u4E2D\u65B7\uFF08code ${ev.code}${ev.reason ? `: ${ev.reason}` : ""}\uFF09`));
      };
      queue ? enqueue(done) : done();
    });
    ws.addEventListener("error", () => finish(new Error("Edge TTS WebSocket \u767C\u751F\u932F\u8AA4")));
    ws.send(buildSpeechConfig(format));
    ws.send(buildSsmlMessage(requestId, buildSSML(text, opts)));
  });
}
var FLUSH_BYTES = 16 * 1024;
async function synthesizeStream(chunks, opts, deps = {}) {
  if (chunks.length === 0) return null;
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  let started = false;
  let onFirst;
  let onFail;
  const first = new Promise((res, rej) => {
    onFirst = res;
    onFail = rej;
  });
  let pending = [];
  let pendingBytes = 0;
  const flush = () => {
    if (pendingBytes === 0) return;
    let out;
    if (pending.length === 1) out = pending[0].slice();
    else {
      out = new Uint8Array(pendingBytes);
      let o = 0;
      for (const p of pending) {
        out.set(p, o);
        o += p.byteLength;
      }
    }
    pending = [];
    pendingBytes = 0;
    writer.write(out).catch(() => {
    });
  };
  const write = (d) => {
    pending.push(d);
    pendingBytes += d.byteLength;
    if (!started) {
      started = true;
      flush();
      onFirst();
    } else if (pendingBytes >= FLUSH_BYTES) flush();
  };
  const job = (async () => {
    try {
      for (const chunk of chunks) {
        let n = await synthesizeChunk(chunk, opts, write, deps.connect);
        flush();
        if (n === 0) {
          await new Promise((r) => setTimeout(r, 500));
          n = await synthesizeChunk(chunk, opts, write, deps.connect);
        }
      }
      if (!started) throw new NoAudioError();
      flush();
      await writer.close();
    } catch (e) {
      if (!started) onFail(e);
      else {
        console.error("\u4E32\u6D41\u9014\u4E2D\u5931\u6557", e);
        await writer.abort(e).catch(() => {
        });
      }
    }
  })();
  deps.waitUntil?.(job);
  await first;
  return readable;
}
async function fetchVoiceList(fetcher = fetch) {
  const doFetch = () => fetcher(`${VOICE_LIST_URL}&Sec-MS-GEC=${DRM.generateSecMsGec()}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}`, {
    headers: { ...VOICE_HEADERS, Cookie: `muid=${DRM.generateMuid()};` }
  });
  let resp = await doFetch();
  if (resp.status === 403) {
    DRM.handleServerDate(resp.headers.get("date"));
    resp = await doFetch();
  }
  if (!resp.ok) throw new EdgeHttpError(resp.status, resp.headers.get("date"));
  return await resp.json();
}

// src/http.ts
var CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Requested-With",
  "Access-Control-Expose-Headers": "Content-Type, X-Edge-TTS-Chunks",
  "Access-Control-Max-Age": "86400"
};
function withCors(resp) {
  const r = new Response(resp.body, resp);
  for (const [k, v] of Object.entries(CORS_HEADERS)) r.headers.set(k, v);
  return r;
}
function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...extra }
  });
}
function openaiError(status, message, param = null, code = null) {
  const type = status === 401 ? "authentication_error" : status >= 500 ? "server_error" : "invalid_request_error";
  return json({ error: { message, type, param, code } }, status);
}
function requiredToken(env) {
  return env.MS_RA_FORWARDER_TOKEN || env.TOKEN || void 0;
}
function safeEqual(a, b) {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
function checkBearer(request, env) {
  const token = requiredToken(env);
  if (!token) return true;
  const auth = request.headers.get("authorization");
  return !!auth && safeEqual(auth, "Bearer " + token);
}

// src/page.ts
function renderPage() {
  return PAGE;
}
var PAGE = (
  /* html */
  `<!doctype html>
<html lang="zh-Hant-TW">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Edge TTS Worker \u6E2C\u8A66\u9801</title>
<style>
:root{--bg:#0f1220;--card:#181c2e;--line:#2a3050;--fg:#e8eaf6;--mut:#9aa3c7;--acc:#7c8cff;--acc2:#4fd1c5;--err:#ff6b81;--ok:#51cf66}
@media (prefers-color-scheme:light){:root{--bg:#f3f5fb;--card:#fff;--line:#dfe3f0;--fg:#1d2240;--mut:#636b8f;--acc:#4b5cf0;--acc2:#0f9d8f}}
*{box-sizing:border-box}body{margin:0;font:15px/1.6 system-ui,-apple-system,"PingFang TC","Noto Sans TC","Microsoft JhengHei",sans-serif;background:var(--bg);color:var(--fg)}
.wrap{max-width:860px;margin:0 auto;padding:28px 16px 60px}
h1{font-size:24px;margin:0 0 4px}h1 span{background:linear-gradient(90deg,var(--acc),var(--acc2));-webkit-background-clip:text;color:transparent}
.sub{color:var(--mut);margin:0 0 22px}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px 18px 14px;margin-bottom:16px;box-shadow:0 6px 24px rgba(0,0,0,.08)}
.card h2{font-size:16px;margin:0 0 12px;display:flex;gap:8px;align-items:center}
label{display:block;font-size:13px;color:var(--mut);margin:10px 0 4px}
input,select,textarea{width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--line);background:transparent;color:var(--fg);font:inherit}
select option{background:var(--card)}
textarea{min-height:130px;resize:vertical}
.row{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}
.range{display:flex;align-items:center;gap:10px}.range input{padding:0}.range b{min-width:52px;text-align:right;font-variant-numeric:tabular-nums}
button{cursor:pointer;border:0;border-radius:10px;padding:10px 16px;font:inherit;font-weight:600;color:#fff;background:linear-gradient(90deg,var(--acc),var(--acc2))}
button.ghost{background:transparent;border:1px solid var(--line);color:var(--fg);font-weight:500;padding:6px 10px}
button:disabled{opacity:.55;cursor:wait}
.actions{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:14px}
audio{width:100%;margin-top:12px}
.status{font-size:13px;color:var(--mut)}.status.err{color:var(--err)}.status.ok{color:var(--ok)}
code,.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px}
.kv{display:flex;gap:8px;align-items:center;margin:6px 0}.kv .mono{flex:1;word-break:break-all;background:rgba(127,140,255,.08);padding:8px 10px;border-radius:8px}
.seg{display:inline-flex;border:1px solid var(--line);border-radius:10px;overflow:hidden}.seg label{margin:0;padding:8px 12px;cursor:pointer;color:var(--fg)}
.seg input{display:none}.seg input:checked+span{color:var(--acc);font-weight:700}
a{color:var(--acc)}small{color:var(--mut)}
</style>
</head>
<body><div class="wrap">
<h1>\u{1F399}\uFE0F <span>Edge TTS Worker</span></h1>
<p class="sub">\u5FAE\u8EDF Edge\u300C\u5927\u8072\u6717\u8B80\u300D\u8A9E\u97F3\uFF0C\u8DD1\u5728\u4F60\u81EA\u5DF1\u7684 Cloudflare Worker \u4E0A\u3002\u540C\u6642\u63D0\u4F9B Legado \u820A\u4ECB\u9762\u8207 OpenAI \u76F8\u5BB9\u4ECB\u9762\u3002</p>

<div class="card">
<h2>\u{1F511} \u5B58\u53D6\u6B0A\u6756</h2>
<input id="token" type="password" placeholder="\u82E5 Worker \u6709\u8A2D\u5B9A TOKEN\uFF0C\u8ACB\u586B\u5728\u9019\u88E1\uFF08\u53EA\u5B58\u5728\u672C\u6A5F\u700F\u89BD\u5668\uFF09" autocomplete="off">
</div>

<div class="card">
<h2>\u{1F5E3}\uFE0F \u5408\u6210\u6E2C\u8A66</h2>
<div class="row">
<div><label>\u8A9E\u8A00\u7BE9\u9078</label><select id="locale"><option value="zh">\u4E2D\u6587\uFF08\u5168\u90E8\uFF09</option><option value="zh-TW">\u4E2D\u6587\uFF08\u53F0\u7063\uFF09</option><option value="zh-CN">\u4E2D\u6587\uFF08\u4E2D\u570B\uFF09</option><option value="zh-HK">\u7CB5\u8A9E\uFF08\u9999\u6E2F\uFF09</option><option value="en">English</option><option value="ja">\u65E5\u672C\u8A9E</option><option value="ko">\uD55C\uAD6D\uC5B4</option><option value="">\u5168\u90E8\u8A9E\u8A00</option></select></div>
<div><label>\u97F3\u8272</label><select id="voice"><option value="zh-CN-XiaoxiaoNeural">zh-CN-XiaoxiaoNeural</option></select></div>
</div>
<label>\u6587\u5B57</label>
<textarea id="text">\u4F60\u597D\uFF01\u9019\u662F Cloudflare Worker \u4E0A\u7684 Edge TTS \u6E2C\u8A66\u3002Hello, this is a quick English test.</textarea>
<div class="row">
<div><label>\u8A9E\u901F rate</label><div class="range"><input id="rate" type="range" min="-100" max="100" value="0"><b id="rateV">0%</b></div></div>
<div><label>\u97F3\u8ABF pitch</label><div class="range"><input id="pitch" type="range" min="-100" max="100" value="0"><b id="pitchV">0%</b></div></div>
<div><label>\u97F3\u91CF volume</label><div class="range"><input id="volume" type="range" min="-100" max="100" value="100"><b id="volumeV">100%</b></div></div>
</div>
<label>\u6E2C\u8A66\u4ECB\u9762</label>
<div class="seg"><label><input type="radio" name="api" value="legacy" checked><span>\u820A\u7248 /api/text-to-speech</span></label><label><input type="radio" name="api" value="openai"><span>OpenAI /v1/audio/speech</span></label></div>
<div class="actions"><button id="go">\u25B6 \u5408\u6210\u4E26\u64AD\u653E</button><a id="dl" class="status" style="display:none">\u2B07 \u4E0B\u8F09\u97F3\u6A94</a><span id="status" class="status"></span></div>
<audio id="player" controls></audio>
</div>

<div class="card">
<h2>\u{1F4DA} Legado\uFF08\u95B1\u8B80 / legado-with-MD3\uFF09</h2>
<small>\u7528\u4E0A\u65B9\u9078\u7684\u97F3\u8272\u3001\u97F3\u8ABF\u3001\u97F3\u91CF\u7522\u751F\u8A2D\u5B9A\u3002\u8A9E\u901F\u6703\u8DDF\u8457\u95B1\u8B80 App \u7684\u6717\u8B80\u901F\u5EA6\uFF08<code>{{(speakSpeed - 10) * 2}}</code>\uFF09\u3002</small>
<div class="kv"><span class="mono" id="legadoUrl"></span><button class="ghost" data-copy="legadoUrl">\u8907\u88FD</button></div>
<div class="actions"><a id="legadoOpen" href="#"><button class="ghost" type="button">\u{1F4F2} \u4E00\u9375\u532F\u5165\u95B1\u8B80 App</button></a><small>\uFF08\u624B\u6A5F\u4E0A\u7528\u700F\u89BD\u5668\u958B\u9019\u9801\u518D\u9EDE\uFF09</small></div>
</div>

<div class="card">
<h2>\u{1F916} OpenAI \u76F8\u5BB9\uFF08SillyTavern / TauriTavern\uFF09</h2>
<div class="kv"><small style="min-width:72px">Base URL</small><span class="mono" id="baseUrl"></span><button class="ghost" data-copy="baseUrl">\u8907\u88FD</button></div>
<div class="kv"><small style="min-width:72px">Endpoint</small><span class="mono" id="endpoint"></span><button class="ghost" data-copy="endpoint">\u8907\u88FD</button></div>
<small>API Key \u586B TOKEN\uFF1BModel \u586B <code>tts-1</code>\uFF08\u6216 <code>tts-1-hd</code> \u53D6\u5F97 96kbps\uFF09\uFF1BVoice \u76F4\u63A5\u586B Edge \u97F3\u8272\u540D\uFF08\u4F8B\u5982 <code>zh-TW-HsiaoChenNeural</code>\uFF09\uFF0C\u4E5F\u63A5\u53D7 alloy / nova \u7B49 OpenAI \u540D\u7A31\u3002</small>
</div>
<p class="status">\u97F3\u8272\u6E05\u55AE\uFF1A<a href="/v1/voices?locale=zh" target="_blank">/v1/voices</a>\u3000\u6A21\u578B\uFF1A<a href="/v1/models" target="_blank">/v1/models</a></p>
</div>
<script>
const $=id=>document.getElementById(id);const origin=location.origin;
const tok=$('token');tok.value=localStorage.getItem('edgeTtsToken')||'';tok.oninput=()=>{localStorage.setItem('edgeTtsToken',tok.value);refreshLinks()};
for(const k of ['rate','pitch','volume']){$(k).oninput=()=>{$(k+'V').textContent=$(k).value+'%';refreshLinks()}}
let voices=[];
async function loadVoices(){const loc=$('locale').value;try{const r=await fetch('/v1/voices'+(loc?'?locale='+encodeURIComponent(loc):''));const j=await r.json();if(!r.ok)throw new Error(j.error?.message||r.status);voices=j.data;const cur=localStorage.getItem('edgeTtsVoice')||'zh-TW-HsiaoChenNeural';
$('voice').innerHTML=voices.map(v=>'<option value="'+v.id+'">'+v.id+'\u3000'+(v.gender==='Female'?'\u2640':'\u2642')+(v.personalities.length?'\u3000'+v.personalities.join('\u3001'):'')+'</option>').join('');
if(cur&&voices.some(v=>v.id===cur))$('voice').value=cur;}catch(e){setStatus('\u97F3\u8272\u6E05\u55AE\u8F09\u5165\u5931\u6557\uFF1A'+e.message,'err')}refreshLinks()}
$('locale').onchange=loadVoices;$('voice').onchange=()=>{localStorage.setItem('edgeTtsVoice',$('voice').value);refreshLinks()};
function setStatus(t,c){const s=$('status');s.textContent=t;s.className='status '+(c||'')}
function refreshLinks(){const p=new URLSearchParams({voice:$('voice').value,pitch:$('pitch').value,volume:$('volume').value});if(tok.value)p.set('token',tok.value);
const u=origin+'/api/legado-import?'+p.toString();$('legadoUrl').textContent=u;$('legadoOpen').href='legado://import/httpTTS?src='+encodeURIComponent(u);
$('baseUrl').textContent=origin+'/v1';$('endpoint').textContent=origin+'/v1/audio/speech'}
document.querySelectorAll('[data-copy]').forEach(b=>b.onclick=()=>{navigator.clipboard.writeText($(b.dataset.copy).textContent);b.textContent='\u5DF2\u8907\u88FD';setTimeout(()=>b.textContent='\u8907\u88FD',1200)});
$('go').onclick=async()=>{const text=$('text').value.trim();if(!text)return setStatus('\u8ACB\u5148\u8F38\u5165\u6587\u5B57','err');$('go').disabled=true;setStatus('\u5408\u6210\u4E2D\u2026');const t0=performance.now();
const api=document.querySelector('input[name=api]:checked').value;const h={};if(tok.value)h.Authorization='Bearer '+tok.value;let r;
try{if(api==='legacy'){const p=new URLSearchParams({voice:$('voice').value,rate:$('rate').value,pitch:$('pitch').value,volume:$('volume').value,text});r=await fetch('/api/text-to-speech?'+p,{headers:h})}
else{h['Content-Type']='application/json';r=await fetch('/v1/audio/speech',{method:'POST',headers:h,body:JSON.stringify({model:'tts-1',input:text,voice:$('voice').value,speed:Math.max(0.25,1+Number($('rate').value)/100),pitch:Number($('pitch').value),volume:Number($('volume').value),response_format:'mp3'})})}
if(!r.ok){const t=await r.text();let m=t;try{const j=JSON.parse(t);m=j.error?.message||j.error||t}catch{}throw new Error(r.status+' '+m)}
const blob=await r.blob();const url=URL.createObjectURL(blob);$('player').src=url;$('player').play().catch(()=>{});const dl=$('dl');dl.href=url;dl.download='edge-tts.mp3';dl.style.display='';
setStatus('\u5B8C\u6210\uFF1A'+(blob.size/1024).toFixed(1)+' KB\uFF0C\u8017\u6642 '+((performance.now()-t0)/1000).toFixed(2)+' \u79D2','ok')}catch(e){setStatus('\u5931\u6557\uFF1A'+e.message,'err')}finally{$('go').disabled=false}};
loadVoices();
</script>
</body></html>`
);

// src/params.ts
var ParamError = class extends Error {
  constructor(message, param = null, code = null) {
    super(message);
    this.param = param;
    this.code = code;
  }
};
function parseNumberParam(sp, name, def, min, max) {
  const raw = sp.get(name);
  if (raw === null) return def;
  const num = Number(raw);
  if (Number.isNaN(num) || num < min || num > max) throw new ParamError(`Invalid ${name} value`, name);
  return num;
}
function parseLegacyParams(sp) {
  const text = String(sp.get("text") ?? "");
  if (!text) throw new ParamError("Text is required", "text");
  const voice = String(sp.get("voice") ?? "");
  if (!voice) throw new ParamError("Voice is required", "voice");
  if (!isValidVoiceName(voice)) throw new ParamError("Invalid voice value", "voice");
  return {
    text,
    voice,
    pitch: parseNumberParam(sp, "pitch", 0, -100, 100),
    rate: parseNumberParam(sp, "rate", 0, -100, 100),
    volume: parseNumberParam(sp, "volume", 100, -100, 100),
    personality: sp.get("personality") ?? void 0
  };
}
var DEFAULT_VOICE_ALIASES = {
  alloy: "en-US-AvaMultilingualNeural",
  echo: "en-US-AndrewMultilingualNeural",
  fable: "en-AU-WilliamMultilingualNeural",
  onyx: "en-US-BrianMultilingualNeural",
  nova: "en-US-EmmaMultilingualNeural",
  shimmer: "fr-FR-VivienneMultilingualNeural",
  ash: "en-US-BrianMultilingualNeural",
  ballad: "en-AU-WilliamMultilingualNeural",
  coral: "en-US-AvaMultilingualNeural",
  sage: "en-US-EmmaMultilingualNeural",
  verse: "en-US-AndrewMultilingualNeural",
  marin: "fr-FR-VivienneMultilingualNeural",
  cedar: "fr-FR-RemyMultilingualNeural"
};
function voiceAliases(env) {
  const map = { ...DEFAULT_VOICE_ALIASES };
  if (env.VOICE_ALIASES) {
    try {
      const extra = JSON.parse(env.VOICE_ALIASES);
      for (const [k, v] of Object.entries(extra)) if (typeof v === "string" && isValidVoiceName(v)) map[k.toLowerCase()] = v;
    } catch {
      console.warn("VOICE_ALIASES \u4E0D\u662F\u5408\u6CD5 JSON\uFF0C\u5DF2\u5FFD\u7565");
    }
  }
  return map;
}
function resolveVoice(voice, env) {
  const v = (voice ?? "").trim();
  if (!v) return env.DEFAULT_VOICE || DEFAULT_VOICE;
  const alias = voiceAliases(env)[v.toLowerCase()];
  if (alias) return alias;
  if (!isValidVoiceName(v)) throw new ParamError(`Invalid voice: ${v}`, "voice", "invalid_voice");
  return v;
}
var MP3_HD = "audio-24khz-96kbitrate-mono-mp3";
var EDGE_FORMATS = ["audio-24khz-48kbitrate-mono-mp3", "audio-24khz-96kbitrate-mono-mp3", "webm-24khz-16bit-mono-opus"];
function mp3Format(env) {
  const f = env.OUTPUT_FORMAT;
  return f && EDGE_FORMATS.slice(0, 2).includes(f) ? f : DEFAULT_OUTPUT_FORMAT;
}
function resolveFormat(fmt, model, env) {
  const f = (fmt ?? "mp3").toLowerCase();
  const mp3 = () => ({ edge: model === "tts-1-hd" ? MP3_HD : mp3Format(env), contentType: "audio/mpeg" });
  if (f === "mp3") return mp3();
  if (f === "opus" || f === "webm") return { edge: "webm-24khz-16bit-mono-opus", contentType: "audio/webm", singleChunkOnly: true };
  if (["wav", "pcm", "aac", "flac"].includes(f)) {
    if ((env.UNSUPPORTED_FORMAT_FALLBACK ?? "").toLowerCase() === "mp3") return { ...mp3(), fallbackFrom: f };
    throw new ParamError(
      `Edge TTS \u4E0D\u63D0\u4F9B ${f} \u683C\u5F0F\uFF08\u53EA\u6709 mp3 \u8207 opus/webm\uFF09\uFF0CWorker \u4E5F\u4E0D\u8F49\u78BC\u4EE5\u514D\u8D85\u904E\u514D\u8CBB\u65B9\u6848 CPU \u9650\u5236\uFF1B\u8ACB\u6539\u7528 response_format "mp3"`,
      "response_format",
      "unsupported_response_format"
    );
  }
  throw new ParamError(`Unsupported response_format: ${f}\uFF08\u53EF\u7528\uFF1Amp3\u3001opus\uFF09`, "response_format", "unsupported_response_format");
}
function speedToRate(speed) {
  return Math.round((speed - 1) * 100);
}
var OPENAI_MODELS = ["tts-1", "tts-1-hd", "gpt-4o-mini-tts", "edge-tts"];
function parseOpenAIBody(body, env) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ParamError("Request body must be a JSON object");
  const b = body;
  const model = b.model === void 0 ? "tts-1" : b.model;
  if (typeof model !== "string") throw new ParamError("model must be a string", "model");
  if (typeof b.input !== "string" || !b.input.trim()) throw new ParamError("input is required", "input", "missing_input");
  if (b.voice !== void 0 && typeof b.voice !== "string") throw new ParamError("voice must be a string", "voice");
  let speed = 1;
  if (b.speed !== void 0 && b.speed !== null) {
    speed = Number(b.speed);
    if (Number.isNaN(speed) || speed < 0.25 || speed > 4) throw new ParamError("speed must be between 0.25 and 4.0", "speed");
  }
  if (b.response_format !== void 0 && typeof b.response_format !== "string") throw new ParamError("response_format must be a string", "response_format");
  const ext = (name, def) => {
    if (b[name] === void 0 || b[name] === null) return def;
    const n = Number(b[name]);
    if (Number.isNaN(n) || n < -100 || n > 100) throw new ParamError(`${name} must be between -100 and 100`, name);
    return n;
  };
  return {
    model,
    input: b.input,
    voice: resolveVoice(b.voice, env),
    rate: speedToRate(speed),
    pitch: ext("pitch", 0),
    volume: ext("volume", 100),
    format: resolveFormat(b.response_format, model, env)
  };
}

// src/app.ts
var MAX_CHUNKS = 40;
async function handle(request, env, ctx, deps = {}) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  let resp;
  try {
    resp = await route(request, url, path, env, ctx, deps);
  } catch (e) {
    console.error("unhandled", e);
    resp = json({ error: e.message }, 500);
  }
  return withCors(resp);
}
async function route(request, url, path, env, ctx, deps) {
  const m = request.method;
  const isGet = m === "GET" || m === "HEAD";
  switch (path) {
    case "/":
    case "/index.html":
      if (!isGet) break;
      return new Response(renderPage(), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" } });
    case "/health":
      return json({ ok: true });
    case "/api/text-to-speech":
      if (!isGet) break;
      return legacyTTS(request, url, env, ctx, deps);
    case "/api/legado-import":
      if (!isGet) break;
      return legadoImport(request, url, env);
    case "/v1/audio/speech":
    case "/audio/speech":
      if (m !== "POST") return openaiError(405, "Use POST for /v1/audio/speech", null, "method_not_allowed");
      return openaiSpeech(request, env, ctx, deps);
    case "/v1/models":
    case "/models":
      return json({
        object: "list",
        data: OPENAI_MODELS.map((id) => ({ id, object: "model", created: 0, owned_by: "edge-tts-worker" }))
      });
    case "/v1/voices":
    case "/api/voices":
      return voices(request, env, ctx, deps);
    case "/favicon.ico":
      return new Response(null, { status: 204 });
  }
  if (path.startsWith("/v1/")) return openaiError(404, `Unknown endpoint: ${request.method} ${path}`, null, "not_found");
  return json({ error: "Not Found" }, 404);
}
async function legacyTTS(request, url, env, ctx, deps) {
  if (!checkBearer(request, env)) return new Response("Unauthorized", { status: 401 });
  let p;
  try {
    p = parseLegacyParams(url.searchParams);
  } catch (e) {
    if (e instanceof ParamError) return json({ error: e.message }, 400);
    throw e;
  }
  const chunks = prepareChunks(p.text);
  if (chunks.length > MAX_CHUNKS) return json({ error: `Text too long\uFF08\u8D85\u904E ${MAX_CHUNKS} \u6BB5\uFF0C\u8ACB\u5206\u6279\u9001\u51FA\uFF09` }, 413);
  try {
    const stream = await synthesizeStream(
      chunks,
      { voice: p.voice, rate: p.rate, pitch: p.pitch, volume: p.volume, format: mp3Format(env) },
      { connect: deps.connect, waitUntil: ctx?.waitUntil?.bind(ctx) }
    );
    return audioResponse(stream, "audio/mpeg", chunks.length);
  } catch (e) {
    return json({ error: e.message }, upstreamStatus(e));
  }
}
function legadoImport(request, url, env) {
  const token = requiredToken(env);
  const sp = url.searchParams;
  if (token) {
    const given = sp.get("token");
    if (!given || !safeEqual(given, token)) return new Response("Unauthorized", { status: 401 });
  }
  const voice = String(sp.get("voice") ?? "");
  if (!voice) return json({ error: "Voice is required" }, 400);
  let pitch, volume;
  try {
    pitch = parseNumberParam(sp, "pitch", 0, -100, 100);
    volume = parseNumberParam(sp, "volume", 100, -100, 100);
  } catch (e) {
    return json({ error: e.message }, 400);
  }
  const personality = sp.get("personality");
  const parts = [`voice=${encodeURIComponent(voice)}`, `volume=${volume}`, `pitch=${pitch}`];
  if (personality) parts.push(`personality=${encodeURIComponent(personality)}`);
  const queryString = `${parts.join("&")}&rate={{(speakSpeed - 10) * 2}}`;
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname);
  const protocol = sp.get("protocol") || (local ? url.protocol.replace(":", "") : "https");
  const host = request.headers.get("host") || url.host;
  const apiUrl = `${protocol}://${host}/api/text-to-speech?${queryString}&text={{java.encodeURI(speakText)}}`;
  const header = token ? { Authorization: "Bearer " + token } : {};
  const data = {
    name: sp.get("name") || voice,
    contentType: "audio/mpeg",
    id: Date.now(),
    loginCheckJs: "",
    loginUi: "",
    loginUrl: "",
    url: apiUrl,
    header: JSON.stringify(header)
  };
  return json(data);
}
async function openaiSpeech(request, env, ctx, deps) {
  if (!checkBearer(request, env)) return openaiError(401, "Incorrect API key provided. Set Authorization: Bearer <TOKEN>.", null, "invalid_api_key");
  let body;
  try {
    body = await request.json();
  } catch {
    return openaiError(400, "Request body must be valid JSON");
  }
  let p;
  try {
    p = parseOpenAIBody(body, env);
  } catch (e) {
    if (e instanceof ParamError) return openaiError(400, e.message, e.param, e.code);
    throw e;
  }
  const chunks = prepareChunks(p.input);
  if (chunks.length > MAX_CHUNKS) return openaiError(413, `input too long (more than ${MAX_CHUNKS} chunks of 4096 bytes)`, "input", "input_too_long");
  if (p.format.singleChunkOnly && chunks.length > 1) {
    return openaiError(400, "opus\uFF08WebM\uFF09\u53EA\u652F\u63F4\u55AE\u6BB5\u6587\u5B57\uFF08\u7D04 1300 \u500B\u4E2D\u6587\u5B57 / 4000 \u500B\u82F1\u6587\u5B57\u5143\u4EE5\u5167\uFF09\uFF0C\u9577\u6587\u8ACB\u7528 mp3", "response_format", "input_too_long_for_format");
  }
  try {
    const stream = await synthesizeStream(
      chunks,
      { voice: p.voice, rate: p.rate, pitch: p.pitch, volume: p.volume, format: p.format.edge },
      { connect: deps.connect, waitUntil: ctx?.waitUntil?.bind(ctx) }
    );
    const resp = audioResponse(stream, p.format.contentType, chunks.length);
    if (p.format.fallbackFrom) resp.headers.set("X-Edge-TTS-Format-Fallback", `${p.format.fallbackFrom}->mp3`);
    return resp;
  } catch (e) {
    return openaiError(upstreamStatus(e), e.message, null, "upstream_error");
  }
}
function audioResponse(stream, contentType, chunks) {
  return new Response(stream ?? new Uint8Array(0), {
    status: 200,
    headers: { "Content-Type": contentType, "Cache-Control": "no-store", "X-Edge-TTS-Chunks": String(chunks) }
  });
}
function upstreamStatus(e) {
  if (e instanceof EdgeHttpError) return 502;
  if (e instanceof NoAudioError) return 502;
  return 500;
}
var VOICE_TTL_SECONDS = 6 * 3600;
var memVoices = null;
async function voices(request, env, ctx, deps) {
  let list = memVoices && Date.now() - memVoices.at < VOICE_TTL_SECONDS * 1e3 ? memVoices.data : null;
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const cacheKey = new Request(new URL("/__edge-voices-cache", request.url).toString());
  if (!list && cache) {
    const hit = await cache.match(cacheKey).catch(() => void 0);
    if (hit) list = await hit.json();
  }
  if (!list) {
    try {
      list = await fetchVoiceList(deps.fetcher ?? fetch);
    } catch (e) {
      return openaiError(502, `\u7121\u6CD5\u53D6\u5F97 Edge \u97F3\u8272\u6E05\u55AE\uFF1A${e.message}`, null, "upstream_error");
    }
    if (cache) {
      const put = cache.put(cacheKey, json(list, 200, { "Cache-Control": `public, max-age=${VOICE_TTL_SECONDS}` })).catch(() => {
      });
      ctx?.waitUntil ? ctx.waitUntil(put) : await put;
    }
  }
  memVoices = { at: memVoices?.data === list ? memVoices.at : Date.now(), data: list };
  const url = new URL(request.url);
  const locale = url.searchParams.get("locale")?.toLowerCase();
  const data = list.filter((v) => !locale || v.Locale.toLowerCase().startsWith(locale)).map((v) => ({
    id: v.ShortName,
    name: v.ShortName,
    full_name: v.Name,
    friendly_name: v.FriendlyName,
    locale: v.Locale,
    gender: v.Gender,
    categories: v.VoiceTag?.ContentCategories ?? [],
    personalities: v.VoiceTag?.VoicePersonalities ?? []
  }));
  return json({ object: "list", data, aliases: voiceAliases(env) }, 200, { "Cache-Control": "public, max-age=3600" });
}

// src/index.ts
var index_default = {
  async fetch(request, env, ctx) {
    return handle(request, env, ctx);
  }
};
export {
  index_default as default
};
