const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const popupHtml = fs.readFileSync(path.join(root, "extension", "popup.html"), "utf8");
const popupJs = fs.readFileSync(path.join(root, "extension", "popup.js"), "utf8");
const backgroundJs = fs.readFileSync(path.join(root, "extension", "background.js"), "utf8");

// 1. Check popup.html for Clear Data button
assert(popupHtml.includes('id="btnClearData"'), "Must have btnClearData button in popup.html");
assert(popupHtml.includes('class="btn-clear"'), "Must have btn-clear styling class in popup.html");

// 2. Check popup.js for Clear Data handling
assert(popupJs.includes('const btnClearData = document.getElementById("btnClearData");'), "Must get btnClearData element");
assert(popupJs.includes('CLEAR_RECORDING'), "Must send CLEAR_RECORDING message");

// 3. Check background.js for CLEAR_RECORDING handler
assert(backgroundJs.includes('message.type === "CLEAR_RECORDING"'), "background.js must handle CLEAR_RECORDING message");

console.log("PASS Clear recorded data feature verified independently");
