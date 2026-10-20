const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const editorJs = fs.readFileSync(path.join(root, "extension", "editor.js"), "utf8");
const capturePreviewJs = fs.readFileSync(path.join(root, "extension", "capture-preview.js"), "utf8");

// Verify willReadFrequently is configured to eliminate readback performance warning
assert(editorJs.includes('getContext("2d", { willReadFrequently: true })'), "editor.js must set willReadFrequently: true");
assert(capturePreviewJs.includes('getContext("2d", { willReadFrequently: true })'), "capture-preview.js must set willReadFrequently: true");

function createElement(id, options = {}) {
  const listeners = new Map();
  const classes = new Set();
  const element = {
    id,
    style: {},
    textContent: "",
    classList: {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      contains: (name) => classes.has(name)
    },
    addEventListener: (type, handler) => listeners.set(type, handler),
    dispatch(type, event = {}) {
      const handler = listeners.get(type);
      if (handler) handler(event);
    },
    click() {
      this.dispatch("click", { target: this });
    },
    getAttribute(name) {
      return options.attributes ? options.attributes[name] : undefined;
    },
    setAttribute(name, value) {
      if (!options.attributes) options.attributes = {};
      options.attributes[name] = value;
    },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    ...options
  };
  return element;
}

function createCanvasContext() {
  const operations = [];
  const visibleAnnotations = [];
  const context = {
    operations,
    visibleAnnotations,
    getImageDataCalls: 0,
    drawImage(...args) {
      operations.push({ name: "drawImage", args });
    },
    clearRect(...args) {
      operations.push({ name: "clearRect", args });
      visibleAnnotations.length = 0;
    },
    strokeRect(...args) {
      operations.push({ name: "strokeRect", args });
      visibleAnnotations.push("rect");
    },
    fillRect(...args) {
      const fillStyle = this.fillStyle;
      const globalAlpha = this.globalAlpha;
      operations.push({ name: "fillRect", args, fillStyle, globalAlpha });
      visibleAnnotations.push(fillStyle === "#000000" && globalAlpha === 1 ? "redact" : "highlight");
    },
    fillText(...args) {
      operations.push({ name: "fillText", args });
      visibleAnnotations.push("text");
    },
    beginPath() { operations.push({ name: "beginPath" }); },
    moveTo(...args) { operations.push({ name: "moveTo", args }); },
    lineTo(...args) { operations.push({ name: "lineTo", args }); },
    stroke() { operations.push({ name: "stroke" }); },
    closePath() { operations.push({ name: "closePath" }); },
    fill() { operations.push({ name: "fill" }); },
    save() { operations.push({ name: "save" }); },
    restore() { operations.push({ name: "restore" }); },
    getImageData(...args) {
      this.getImageDataCalls += 1;
      operations.push({ name: "getImageData", args });
      return { data: new Uint8ClampedArray(4) };
    },
    putImageData(...args) {
      operations.push({ name: "putImageData", args });
    },
    fillStyle: "#000000",
    globalAlpha: 1
  };
  return context;
}

function runEditorScript(scriptName, { captureId = "", captureRecordingId = "recording-1", guideRecordingId = "recording-1" } = {}) {
  const context = createCanvasContext();
  const windowListeners = new Map();
  const canvas = createElement("paintCanvas", {
    width: 100,
    height: 100,
    getContext: () => context,
    toDataURL: () => "data:image/png;base64,fixture",
    toBlob: (callback) => callback({ type: "image/png" })
  });
  const previewImage = createElement("previewImg", { naturalWidth: 100, naturalHeight: 100 });
  const ids = {
    paintCanvas: canvas,
    previewImg: previewImage,
    pageTitle: createElement("pageTitle"),
    imageDesc: createElement("imageDesc"),
    toastMsg: createElement("toastMsg"),
    btnCopy: createElement("btnCopy"),
    btnDownload: createElement("btnDownload"),
    btnAppend: createElement("btnAppend"),
    btnThemeToggle: createElement("btnThemeToggle"),
    themeIcon: createElement("themeIcon"),
    btnCopyResult: createElement("btnCopyResult"),
    btnDownloadResult: createElement("btnDownloadResult"),
    btnAppendResult: createElement("btnAppendResult"),
    toolNone: createElement("toolNone"),
    toolRect: createElement("toolRect"),
    toolArrow: createElement("toolArrow"),
    toolHighlight: createElement("toolHighlight"),
    toolRedact: createElement("toolRedact"),
    toolText: createElement("toolText"),
    btnUndo: createElement("btnUndo"),
    btnClear: createElement("btnClear")
  };
  const colorDots = ["#EF4444", "#3B82F6"].map((color) => createElement("color-dot", {
    attributes: { "data-color": color }
  }));
  const document = {
    body: createElement("body"),
    addEventListener(type, handler) {
      if (type === "DOMContentLoaded") this.domReady = handler;
    },
    getElementById: (id) => ids[id] || createElement(id),
    querySelectorAll: (selector) => selector === ".color-dot" ? colorDots : [],
    createElement: (tagName) => tagName === "canvas"
      ? createElement("flattenedCanvas", {
        width: 100,
        height: 100,
        getContext: () => createCanvasContext(),
        toDataURL: () => "data:image/png;base64,flattened"
      })
      : createElement(tagName)
  };
  const imageClass = class {
    constructor() {
      this.naturalWidth = 100;
      this.naturalHeight = 100;
      this.width = 100;
      this.height = 100;
    }
    set src(value) {
      this._src = value;
      if (this.onload) this.onload();
    }
    get src() { return this._src; }
  };
  const runtimeMessages = [];
  const chrome = {
    runtime: {
      lastError: null,
      sendMessage(message, callback) {
        runtimeMessages.push(message);
        if (message.type === "GET_CAPTURE_IMAGE") {
          callback({ ok: true, capture: { dataUrl: "data:image/png;base64,fixture", title: "Capture", recordingId: captureRecordingId }, recordingId: captureRecordingId });
        } else if (message.type === "GET_GUIDE") {
          callback({ ok: true, bundle: { steps: [] }, revision: 1, recordingId: guideRecordingId });
        } else if (message.type === "GET_PENDING_EDIT_IMAGE") {
          callback({ dataUrl: "data:image/png;base64,fixture", title: "Capture", recordingId: captureRecordingId });
        } else {
          callback({ ok: true });
        }
      }
    },
    storage: {
      local: {
        get: (_keys, callback) => callback({}),
        set: (_value, callback) => callback && callback()
      },
      onChanged: { addListener: () => {} }
    }
  };
  const window = {
    addEventListener(type, handler) { windowListeners.set(type, handler); },
    dispatch(type, event = {}) {
      const handler = windowListeners.get(type);
      if (handler) handler(event);
    }
  };
  const sandbox = {
    document,
    window,
    chrome,
    Image: imageClass,
    localStorage: { getItem: () => null, setItem: () => {} },
    navigator: { clipboard: { write: async () => {} } },
    ClipboardItem: class {},
    fetch: async () => ({ blob: async () => ({ type: "image/png" }) }),
    prompt: () => "fixture text",
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    console,
    location: { search: captureId ? `?captureId=${captureId}` : "" },
    URLSearchParams,
    Date,
    Math,
    Uint8ClampedArray
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, "extension", scriptName), "utf8"), sandbox, { filename: scriptName });
  document.domReady();
  if (scriptName === "capture-preview.js") {
    previewImage.onload && previewImage.onload();
  }
  return { canvas, context, window, ids, runtimeMessages };
}

function drawRect(editor) {
  if (editor.ids.toolRect) editor.ids.toolRect.click();
  editor.canvas.dispatch("mousedown", { button: 0, clientX: 10, clientY: 10 });
  editor.window.dispatch("mouseup", { clientX: 80, clientY: 80 });
}

function drawRedaction(editor) {
  editor.ids.toolRedact.click();
  editor.canvas.dispatch("mousedown", { button: 0, clientX: 10, clientY: 10 });
  editor.window.dispatch("mouseup", { clientX: 80, clientY: 80 });
}

for (const scriptName of ["editor.js", "capture-preview.js"]) {
  const editor = runEditorScript(scriptName, {
    captureId: "capture-1",
    captureRecordingId: "capture-recording",
    guideRecordingId: "new-guide"
  });
  assert.strictEqual(editor.context.getImageDataCalls, 0, `${scriptName} must not snapshot canvas pixels`);

  drawRedaction(editor);
  assert(editor.context.visibleAnnotations.includes("redact"), `${scriptName} must render the redaction rectangle`);
  const redactionFill = editor.context.operations.find((operation) => operation.name === "fillRect");
  assert.strictEqual(redactionFill.fillStyle, "#000000", `${scriptName} redaction must use an opaque black fill`);
  assert.strictEqual(redactionFill.globalAlpha, 1, `${scriptName} redaction must not use transparency`);
  editor.ids.btnUndo.click();
  assert(!editor.context.visibleAnnotations.includes("redact"), `${scriptName} undo must remove the redaction command`);

  drawRect(editor);
  assert(editor.context.visibleAnnotations.includes("rect"), `${scriptName} must render the drawn rectangle`);

  editor.context.operations.length = 0;
  editor.ids.btnUndo.click();
  assert(!editor.context.visibleAnnotations.includes("rect"), `${scriptName} undo must remove the last drawn command`);
  assert(editor.context.operations.some((operation) => operation.name === "clearRect"), `${scriptName} undo must redraw from the base image`);
  assert(!editor.context.operations.some((operation) => operation.name === "putImageData"), `${scriptName} undo must not restore a pixel snapshot`);

  drawRect(editor);
  editor.ids.btnClear.click();
  assert.strictEqual(editor.context.visibleAnnotations.length, 0, `${scriptName} clear must remove annotations`);
  editor.ids.btnUndo.click();
  assert(editor.context.visibleAnnotations.includes("rect"), `${scriptName} undo must restore the command before clear`);

  if (scriptName === "capture-preview.js") {
    editor.ids.btnAppend.click();
    const appendMessage = editor.runtimeMessages.find((message) => message.type === "APPEND_STEP");
    assert.strictEqual(appendMessage.recordingId, "capture-recording", `${scriptName} must append against the original capture guide`);
  }
}

console.log("PASS willReadFrequently performance optimization verified");
console.log("PASS vector command history redraws undo/clear without canvas snapshots");
