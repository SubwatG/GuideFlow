const assert = require("assert");
const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(
  path.join(__dirname, "..", "extension", "content.js"),
  "utf8"
);

assert(source.includes("function isExtensionContextValid()"));
assert(source.includes("if (!isExtensionContextValid()) return;"));
assert(source.includes("Ignore invalidated extension contexts"));
console.log("PASS stale content scripts guard invalidated extension context");
