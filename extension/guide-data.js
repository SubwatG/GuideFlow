/*
 * GuideFlow data boundary.
 *
 * This file is deliberately dependency-free so it can be loaded by the
 * extension pages and by a CommonJS test/importer.  Only fields understood by
 * GuideFlow are copied into the returned object; arbitrary input properties
 * never become part of the data sent to a viewer.
 */
(function attachGuideFlowData(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }
  root.GuideFlowData = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function createGuideFlowData() {
  "use strict";

  const MAX_STEPS = 1000;
  // Chrome runtime messages are capped at 64 MiB.  Leave headroom for the
  // envelope and serialization overhead when moving a bundle between pages.
  const MAX_TOTAL_BYTES = 48 * 1024 * 1024;
  const MAX_TEXT_LENGTH = 4000;
  const MAX_TITLE_LENGTH = 200;
  const MAX_IMAGES_PER_STEP = 200;
  const MAX_IMAGE_DATA_URL_BYTES = 32 * 1024 * 1024;
  const OWN = Object.prototype.hasOwnProperty;

  const IMAGE_DATA_URL_RE = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/i;

  function hasOwn(value, key) {
    return value !== null && value !== undefined && OWN.call(value, key);
  }

  function invalid(message) {
    throw new TypeError(`Invalid GuideFlow data: ${message}`);
  }

  function isPlainRecord(value) {
    if (value === null || typeof value !== "object") return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }

  function byteLength(value) {
    if (typeof TextEncoder !== "undefined") {
      return new TextEncoder().encode(value).byteLength;
    }
    if (typeof Buffer !== "undefined" && typeof Buffer.byteLength === "function") {
      return Buffer.byteLength(value, "utf8");
    }
    // The fallback is only used by older extension runtimes without either
    // standard byte counter.  It still counts UTF-8 code points correctly for
    // the characters GuideFlow accepts.
    return unescape(encodeURIComponent(value)).length;
  }

  function serializedInput(input) {
    let serialized;
    try {
      serialized = JSON.stringify(input);
    } catch (_) {
      invalid("bundle must be JSON serializable");
    }
    if (typeof serialized !== "string") invalid("bundle must be an object or array");
    if (byteLength(serialized) > MAX_TOTAL_BYTES) invalid("bundle exceeds the size limit");
    return serialized;
  }

  function cleanText(value, field, maxLength = MAX_TEXT_LENGTH) {
    if (value === undefined) return undefined;
    if (typeof value !== "string") invalid(`${field} must be text`);
    if (value.length > maxLength) invalid(`${field} exceeds the length limit`);
    return value;
  }

  function cleanNumber(value, field, { min = -Infinity, max = Infinity } = {}) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      invalid(`${field} must be finite`);
    }
    if (value < min || value > max) invalid(`${field} is out of range`);
    return value;
  }

  function cleanOptionalNumber(source, output, key, options) {
    if (hasOwn(source, key)) output[key] = cleanNumber(source[key], key, options);
  }

  function safeImageUrl(value) {
    if (typeof value !== "string") invalid("image must be a data URL");
    if (byteLength(value) > MAX_IMAGE_DATA_URL_BYTES) invalid("image exceeds the size limit");
    const match = IMAGE_DATA_URL_RE.exec(value);
    if (!match) invalid("image must be a PNG, JPEG, WebP, or GIF data URL");
    const payload = match[2];
    if (payload.length === 0 || payload.length % 4 !== 0) {
      invalid("image base64 payload is malformed");
    }
    return value;
  }

  function cleanBox(value, field) {
    if (!isPlainRecord(value)) invalid(`${field} must be an object`);
    const raw = {};
    for (const key of ["top", "left", "width", "height"]) {
      if (hasOwn(value, key)) raw[key] = cleanNumber(value[key], `${field}.${key}`, { min: key === "width" || key === "height" ? 0 : -Number.MAX_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER });
    }
    if (Object.keys(raw).length === 0) invalid(`${field} must contain coordinates`);
    // Older recorders measured unclipped element rectangles. A partly offscreen
    // element can legitimately have negative positions or exceed the viewport.
    const clip = number => Math.max(0, Math.min(100, number));
    const output = {};
    if (hasOwn(raw, "left")) output.left = clip(raw.left);
    if (hasOwn(raw, "top")) output.top = clip(raw.top);
    if (hasOwn(raw, "width")) output.width = Math.max(0, clip((raw.left || 0) + raw.width) - clip(raw.left || 0));
    if (hasOwn(raw, "height")) output.height = Math.max(0, clip((raw.top || 0) + raw.height) - clip(raw.top || 0));
    return output;
  }

  function cleanCoords(value) {
    if (value === null) return null;
    if (!isPlainRecord(value)) invalid("coords must be an object or null");
    const output = {};
    if (hasOwn(value, "xPercent")) output.xPercent = cleanNumber(value.xPercent, "coords.xPercent", { min: 0, max: 100 });
    if (hasOwn(value, "yPercent")) output.yPercent = cleanNumber(value.yPercent, "coords.yPercent", { min: 0, max: 100 });
    if (hasOwn(value, "box")) {
      output.box = value.box === null ? null : cleanBox(value.box, "coords.box");
    }
    if (Object.keys(output).length === 0) invalid("coords must contain coordinates");
    return output;
  }

  function cleanDocumentCoords(value) {
    if (value === null) return null;
    if (!isPlainRecord(value)) invalid("documentCoords must be an object or null");
    const output = {};
    if (hasOwn(value, "x")) output.x = cleanNumber(value.x, "documentCoords.x");
    if (hasOwn(value, "y")) output.y = cleanNumber(value.y, "documentCoords.y");
    if (hasOwn(value, "box")) {
      if (value.box === null) {
        output.box = null;
      } else {
        if (!isPlainRecord(value.box)) invalid("documentCoords.box must be an object");
        const box = {};
        if (hasOwn(value.box, "left")) box.left = cleanNumber(value.box.left, "documentCoords.box.left");
        if (hasOwn(value.box, "top")) box.top = cleanNumber(value.box.top, "documentCoords.box.top");
        if (hasOwn(value.box, "width")) box.width = cleanNumber(value.box.width, "documentCoords.box.width", { min: 0 });
        if (hasOwn(value.box, "height")) box.height = cleanNumber(value.box.height, "documentCoords.box.height", { min: 0 });
        if (Object.keys(box).length === 0) invalid("documentCoords.box must contain coordinates");
        output.box = box;
      }
    }
    if (Object.keys(output).length === 0) invalid("documentCoords must contain coordinates");
    return output;
  }

  function cleanViewport(value) {
    if (value === null) return null;
    if (!isPlainRecord(value)) invalid("viewport must be an object or null");
    const output = {};
    if (hasOwn(value, "width")) output.width = cleanNumber(value.width, "viewport.width", { min: 0 });
    if (hasOwn(value, "height")) output.height = cleanNumber(value.height, "viewport.height", { min: 0 });
    if (hasOwn(value, "dpr")) output.dpr = cleanNumber(value.dpr, "viewport.dpr", { min: 0 });
    if (hasOwn(value, "scrollHeight")) output.scrollHeight = cleanNumber(value.scrollHeight, "viewport.scrollHeight", { min: 0 });
    if (hasOwn(value, "scrollWidth")) output.scrollWidth = cleanNumber(value.scrollWidth, "viewport.scrollWidth", { min: 0 });
    if (hasOwn(value, "scrollX")) output.scrollX = cleanNumber(value.scrollX, "viewport.scrollX", { min: 0 });
    if (hasOwn(value, "scrollY")) output.scrollY = cleanNumber(value.scrollY, "viewport.scrollY", { min: 0 });
    if (Object.keys(output).length === 0) invalid("viewport must contain dimensions");
    return output;
  }

  function cleanImageGeometry(value) {
    if (value === null) return null;
    if (!isPlainRecord(value)) invalid("imageGeometry must be an object or null");
    const output = {};
    // Keep the geometry contract intentionally small.  Additional fields are
    // ignored rather than copied from an untrusted object.
    if (hasOwn(value, "width")) output.width = cleanNumber(value.width, "imageGeometry.width", { min: 0 });
    if (hasOwn(value, "height")) output.height = cleanNumber(value.height, "imageGeometry.height", { min: 0 });
    if (Object.keys(output).length === 0) invalid("imageGeometry must contain dimensions");
    return output;
  }

  function cleanMeta(value) {
    if (value === undefined) return {};
    if (!isPlainRecord(value)) invalid("meta must be an object");
    const output = {};
    if (hasOwn(value, "title")) output.title = cleanText(value.title, "title", MAX_TITLE_LENGTH);
    if (hasOwn(value, "startTime")) output.startTime = cleanNumber(value.startTime, "meta.startTime", { min: 0 });
    if (hasOwn(value, "captureMode")) output.captureMode = cleanText(value.captureMode, "meta.captureMode", 200);
    if (hasOwn(value, "url")) output.url = cleanText(value.url, "meta.url");
    if (hasOwn(value, "pageTitle")) output.pageTitle = cleanText(value.pageTitle, "meta.pageTitle");
    if (hasOwn(value, "action")) output.action = cleanText(value.action, "meta.action");
    if (hasOwn(value, "description")) output.description = cleanText(value.description, "meta.description");
    if (hasOwn(value, "viewport")) output.viewport = cleanViewport(value.viewport);
    if (hasOwn(value, "coords")) output.coords = cleanCoords(value.coords);
    if (hasOwn(value, "documentCoords")) output.documentCoords = cleanDocumentCoords(value.documentCoords);
    if (hasOwn(value, "imageGeometry")) output.imageGeometry = cleanImageGeometry(value.imageGeometry);
    return output;
  }

  function cleanStep(value, index, meta) {
    if (!isPlainRecord(value)) invalid(`session[${index}] must be an object`);
    const output = {};
    let recognized = false;

    if (hasOwn(value, "id")) {
      output.id = cleanText(value.id, `session[${index}].id`, 200);
      if (!output.id) invalid(`session[${index}].id must not be empty`);
      recognized = true;
    }
    if (hasOwn(value, "timestamp")) {
      output.timestamp = cleanNumber(value.timestamp, `session[${index}].timestamp`, { min: 0 });
      recognized = true;
    }

    const textFields = [
      "url", "pageTitle", "action", "elementTag", "elementText", "description", "tipText", "captureMode"
    ];
    for (const field of textFields) {
      if (hasOwn(value, field)) {
        output[field] = cleanText(value[field], `session[${index}].${field}`);
        recognized = true;
      }
    }

    if (hasOwn(value, "coords")) {
      output.coords = cleanCoords(value.coords);
      recognized = true;
    }
    if (hasOwn(value, "documentCoords")) {
      output.documentCoords = cleanDocumentCoords(value.documentCoords);
      recognized = true;
    }
    if (hasOwn(value, "viewport")) {
      output.viewport = cleanViewport(value.viewport);
      recognized = true;
    }
    if (hasOwn(value, "imageGeometry")) {
      output.imageGeometry = cleanImageGeometry(value.imageGeometry);
      recognized = true;
    }
    if (hasOwn(value, "screenshot")) {
      output.screenshot = safeImageUrl(value.screenshot);
      recognized = true;
    }
    if (hasOwn(value, "screenshots")) {
      if (!Array.isArray(value.screenshots)) invalid(`session[${index}].screenshots must be an array`);
      if (value.screenshots.length > MAX_IMAGES_PER_STEP) invalid(`session[${index}] has too many images`);
      output.screenshots = value.screenshots.map((image) => safeImageUrl(image));
      recognized = true;
    }

    if (!recognized) invalid(`session[${index}] has no supported fields`);
    if (!output.screenshot && output.screenshots?.length) output.screenshot = output.screenshots[0];
    if (!output.screenshot) invalid(`session[${index}] requires a screenshot`);

    if (!hasOwn(output, "id")) {
      const timestamp = hasOwn(output, "timestamp")
        ? output.timestamp
        : (typeof meta.startTime === "number" ? meta.startTime : 0);
      output.id = `step_${timestamp}_${index}`;
    }
    return output;
  }

  function validateBundle(input) {
    serializedInput(input);
    let source = input;
    if (Array.isArray(source)) {
      source = { meta: {}, session: source };
    }
    if (!isPlainRecord(source)) invalid("bundle must be an object or legacy array");

    if (hasOwn(source, "schemaVersion") && source.schemaVersion !== 1) {
      invalid("unsupported schema version");
    }
    if (!hasOwn(source, "session")) invalid("session is required");
    if (!Array.isArray(source.session)) invalid("session must be an array");
    if (source.session.length > MAX_STEPS) invalid("too many steps");

    const meta = cleanMeta(source.meta);
    const session = source.session.map((step, index) => cleanStep(step, index, meta));
    if (new Set(session.map(step => step.id)).size !== session.length) invalid("duplicate step id");
    return { schemaVersion: 1, meta, session };
  }

  function serializeForHtml(data) {
    const clean = validateBundle(data);
    let json;
    try {
      json = JSON.stringify(clean);
    } catch (_) {
      invalid("bundle must be JSON serializable");
    }
    return json
      .replace(/</g, "\\u003c")
      .replace(/>/g, "\\u003e")
      .replace(/&/g, "\\u0026")
      .replace(/\u2028/g, "\\u2028")
      .replace(/\u2029/g, "\\u2029");
  }

  return {
    validateBundle,
    serializeForHtml,
    safeImageUrl,
    limits: Object.freeze({
      maxSteps: MAX_STEPS,
      maxTotalBytes: MAX_TOTAL_BYTES,
      maxTextLength: MAX_TEXT_LENGTH,
      maxTitleLength: MAX_TITLE_LENGTH,
      maxImagesPerStep: MAX_IMAGES_PER_STEP,
      maxImageDataUrlBytes: MAX_IMAGE_DATA_URL_BYTES
    })
  };
});
