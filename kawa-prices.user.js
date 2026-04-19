// ==UserScript==
// @name         PRUN KAWA Prices
// @namespace    http://tampermonkey.net/
// @version      2.0.0
// @updateURL    https://raw.githubusercontent.com/kawakawa-inc/kawa-price-userscript/refs/heads/main/kawa-prices.user.js
// @downloadURL  https://raw.githubusercontent.com/kawakawa-inc/kawa-price-userscript/refs/heads/main/kawa-prices.user.js
// @description  Prosperous Universe mod to load KAWA prices into contracts
// @author       Weiiswurst
// @match        https://apex.prosperousuniverse.com/
// @icon         https://www.google.com/s2/favicons?sz=64&domain=prosperousuniverse.com
// @grant        GM_xmlhttpRequest
// @connect      kawakawa.cx
// ==/UserScript==

const priceCheckUrl = "https://kawakawa.cx/api/price-check/KAWA";
const VERSION = "2.0.0";

(async function () {
  'use strict';

  console.log("KAWA Price script starting. Version:", VERSION);
  setInterval(update, 100);
  // Deobfuscate obfuscated class names (actual deobfuscation is done by another method down below)
  const namesToDeobfuscate = ["TemplateSelection__group__", "AddressSelector__input___"];
  const obfuscatedNames = {};

  // Store which forms were patched with the new button already, so that the button is only added once per form
  const patchedForms = [];

  // this function runs every 100ms from a setInterval
  function update() {
    findObfuscationMappings(); // This function must be called constantly, as new elements can enter the document at any time.
    for (let form of document.forms) {
      if (!isTemplateContainer(form)) continue;
      if (patchedForms.includes(form)) continue;
      let templateSelect = form.parentElement.querySelector("select");

      if (templateSelect.value == "BUY" || templateSelect.value == "SELL") {
        for (let button of form.querySelectorAll("button")) {

          if (button.innerText == "APPLY TEMPLATE") {
            let newButton = document.createElement("button");
            newButton.className = button.className;
            newButton.type = "button";
            newButton.innerText = "LOAD KAWA PRICES";
            newButton.onclick = (event) => {
              loadPricesButtonClicked(event.currentTarget);
            };
            button.parentElement.insertBefore(newButton, button);

            let feedbackEl = document.createElement("p");
            feedbackEl.innerText = "Please send Feedback and Bug Reports on the KAWA price userscript (" + VERSION + ") to Weiiswurst on Discord!";
            form.appendChild(feedbackEl);
            patchedForms.push(form);
            break;
          }
        }
      }
    }
  }

  // Some class names are obfuscated by their css compiler.
  // The obfuscation changes very frequently, so the mapping is re-done on each page reload.
  function findObfuscationMappings() {
    for (let el of document.querySelectorAll("*")) {
      for (let queryName of namesToDeobfuscate) {
        if (queryName in obfuscatedNames) continue;
        for (let className of el.classList) {
          if (className.startsWith(queryName)) {
            obfuscatedNames[queryName] = className;
            console.log("Deobfuscated", queryName, "to", className);
          }
        }
      }
    }
  }

  // As the input form is a "controlled form" in react,
  // We must somehow inform react that the value has changed.
  // This can be done with this absolute mess of a code.
  function setPriceValue(inputElement, price) {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    nativeInputValueSetter.call(inputElement, price);
    inputElement.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function fetchPrices(materials, location) {
    const params = new URLSearchParams();
    for (const m of materials) params.append("material", m);
    if (location) params.set("location", location);
    const url = priceCheckUrl + "?" + params.toString();
    return new Promise((resolve, reject) => {
      GM.xmlHttpRequest({
        url,
        method: "GET",
        onload: (response) => {
          if (!response || response.status != 200 || !response.responseText) {
            reject(new Error("HTTP " + (response && response.status)));
            return;
          }
          try {
            resolve(JSON.parse(response.responseText));
          } catch (e) {
            reject(e);
          }
        },
        onerror: (err) => reject(err),
      });
    });
  }

  async function loadPricesButtonClicked(element) {
    let form = element.closest("form");
    let locationInput = form.querySelector("." + obfuscatedNames["AddressSelector__input___"]);
    let location = locationInput.value;
    if (!location || location == "please enter the location here!") {
      locationInput.value = "please enter the location here!";
      return;
    }

    const rows = [];
    for (let templateGroup of form.querySelectorAll("." + obfuscatedNames["TemplateSelection__group__"])) {
      let resourceInput = templateGroup.children[1].querySelector("input");
      let priceInput = templateGroup.children[2].querySelector("input");
      rows.push({ resource: resourceInput.value, priceInput });
    }
    if (rows.length === 0) return;

    element.disabled = true;
    element.innerText = "LOADING...";

    let error = false;
    try {
      const data = await fetchPrices(rows.map(r => r.resource), location);
      const byQuery = new Map(data.results.map(r => [r.query, r]));
      for (const row of rows) {
        const result = byQuery.get(row.resource);
        if (result && typeof result.price === "number") {
          setPriceValue(row.priceInput, result.price);
        } else {
          console.log("No price for", row.resource, result);
          setPriceValue(row.priceInput, 0);
          error = true;
        }
        row.priceInput.parentElement.value = row.priceInput.value;
      }
    } catch (e) {
      console.log("Failed to load KAWA prices:", e);
      error = true;
    }

    element.innerText = error ? "LOAD KAWA PRICES" : "KAWA PRICES LOADED!";
    setTimeout(() => { element.innerText = "LOAD KAWA PRICES"; element.disabled = false; }, 500);
  }

  function isTemplateContainer(formElement) {
    return formElement.parentElement && formElement.parentElement.className.includes("TemplateSelection");
  }
})();
