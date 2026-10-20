const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(
  path.join(__dirname, "..", "extension", "content.js"),
  "utf8"
);

function createElement({ tagName = "input", role = "", type = "text", value = "", text = "", placeholder = "" } = {}) {
  return {
    tagName: tagName.toUpperCase(),
    value,
    innerText: text,
    title: "",
    getAttribute(name) {
      if (name === "role") return role;
      if (name === "type") return type;
      if (name === "placeholder") return placeholder;
      return null;
    },
    closest(selector) {
      if (selector === "#local-scribe-indicator") return null;
      return this;
    },
    getBoundingClientRect() {
      return { top: 12, left: 24, width: 120, height: 28 };
    }
  };
}

function contentHarness() {
  const listeners = [];
  const messages = [];
  const runtimeListeners = [];
  const documentElement = { appendChild() {} };
  const document = {
    documentElement,
    body: { scrollHeight: 900 },
    getElementById() { return null; },
    createElement() {
      return { style: {}, remove() {} };
    }
  };
  const window = {
    document,
    top: null,
    innerWidth: 800,
    innerHeight: 600,
    scrollX: 10,
    scrollY: 20,
    devicePixelRatio: 2,
    addEventListener(type, listener) {
      if (type === "click") listeners.push(listener);
    },
    removeEventListener() {}
  };
  window.top = window;

  const chrome = {
    runtime: {
      id: "extension-id",
      lastError: null,
      onMessage: { addListener(listener) { runtimeListeners.push(listener); } },
      sendMessage(message) { messages.push(message); }
    },
    storage: {
      local: {
        get(_keys, callback) { callback({ status: "recording", recordingId: "recording-test" }); }
      }
    }
  };

  const context = vm.createContext({
    window,
    document,
    chrome,
    console,
    setTimeout,
    requestAnimationFrame(callback) { callback(); }
  });
  vm.runInContext(source, context);
  return { context, chrome, listeners, messages, runtimeListeners, window };
}

assert.doesNotThrow(() => {
  const harness = contentHarness();
  const password = createElement({ tagName: "input", type: "password", value: "do-not-record" });
  harness.listeners[0]({ target: password, clientX: 40, clientY: 50 });
  assert.strictEqual(harness.messages.length, 1);
  assert.strictEqual(harness.messages[0].recordingId, "recording-test");
  assert.strictEqual(harness.messages[0].elementText, "password");
  assert(!JSON.stringify(harness.messages[0]).includes("do-not-record"));
}, "click recording must never read or transmit form values");

assert.doesNotThrow(() => {
  const harness = contentHarness();
  vm.runInContext(source, harness.context);
  assert.strictEqual(harness.listeners.length, 1, "re-injection must not add a second click listener");
  assert.strictEqual(harness.runtimeListeners.length, 1, "re-injection must not add a second message listener");
}, "stale content scripts must be idempotent when injected more than once");

console.log("PASS stale content scripts guard invalidated extension context and form privacy");
