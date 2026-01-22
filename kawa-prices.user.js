// ==UserScript==
// @name         PRUN KAWA Prices
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @updateURL    https://raw.githubusercontent.com/kawakawa-inc/kawa-price-userscript/refs/heads/main/kawa-prices.user.js
// @description  Prosperous Universe mod to load KAWA prices into contracts
// @author       Weiiswurst
// @match        https://apex.prosperousuniverse.com/
// @icon         https://www.google.com/s2/favicons?sz=64&domain=prosperousuniverse.com
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      kawakawa.cx
// ==/UserScript==

const kawaPriceUrl = "https://kawakawa.cx/api/prices/KAWA";
const VERSION = "1.0.0";

(async function () {
  'use strict';

  console.log("KAWA Price script starting. Version:", VERSION);
  setInterval(update, 100);
  // Deobfuscate obfuscated class names (actual deobfuscation is done by another method down below)
  const namesToDeobfuscate = ["TemplateSelection__group__", "AddressSelector__input___"];
  const obfuscatedNames = {};

  // Store which forms were patched with the new button already, so that the button is only added once per form
  const patchedForms = [];

  const cacheVersion = await GM.getValue("cache-version", "Beta 1 (or your first install)")
  if (cacheVersion != VERSION) {
    console.log("You updated the KAWA Price Userscript from", cacheVersion, "to", VERSION, ". Deleting all cached values ...")
    for (let key of await GM.listValues()) {
      await GM.deleteValue(key)
    }
  }
  await GM.setValue("cache-version", VERSION)

  const lastPriceUpdate = await GM.getValue("last-price-update", null);
  let kawaPrices = await GM.getValue("kawa-prices", null);
  console.log("Cached KAWA prices:", kawaPrices);
  if (!kawaPrices || !lastPriceUpdate || lastPriceUpdate + (1000 * 60 * 60 * 24) < Date.now()) {
    console.log("KAWA prices out of date, reloading...");
    GM.xmlHttpRequest({
      url: kawaPriceUrl,
      method: "GET",
      onload: async function (response) {
        if (!response || response.status != 200 || !response.responseText) {
          console.log("Loading KAWA prices failed");
          console.log(response);
          return;
        }
        kawaPrices = {};
        const priceData = JSON.parse(response.responseText)
        for (const line of priceData) {
          const material = localizedMaterials[line.commodityName];
          const planetId = line.locationId;
          if (!(material in kawaPrices)) {
            kawaPrices[material] = {}
          }
          kawaPrices[material][planetId] = Number.parseFloat(line.price);
        }
        await GM.setValue("kawa-prices", kawaPrices);
        await GM.setValue("last-price-update", Date.now());
        console.log(priceData.length, "KAWA prices loaded successfully!");
      }
    });
  }

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

  function loadPricesButtonClicked(element) {
    let form = element.closest("form");
    let locationInput = form.querySelector("." + obfuscatedNames["AddressSelector__input___"]);
    let location = locationInput.value;
    if (!location || location == "please enter the location here!") {
      locationInput.value = "please enter the location here!";
      return;
    }
    let error = false;
    for (let templateGroup of form.querySelectorAll("." + obfuscatedNames["TemplateSelection__group__"])) {
      let resource = templateGroup.children[1].querySelector("input");
      let price = templateGroup.children[2].querySelector("input");
      if (resource.value in kawaPrices) {
        if (location in kawaPrices[resource.value]) {
          setPriceValue(price, kawaPrices[resource.value][location]);
        } else {
          setPriceValue(price, kawaPrices[resource.value]["UV-796b"]);
        }
      } else {
        console.log("Unknown resource", resource.value, "(or failed to load KAWA prices.");
        setPriceValue(price, 0);
        error = true;
      }
      price.parentElement.value = price.value;
    }

    if (!error) {
      element.innerText = "KAWA PRICES LOADED!";
    }
    element.disabled = true;
    setTimeout(() => { element.innerText = "LOAD KAWA PRICES"; element.disabled = false; }, 500);
  }

  function isTemplateContainer(formElement) {
    return formElement.parentElement && formElement.parentElement.className.includes("TemplateSelection");
  }
})();

// Stolen from https://github.com/kawakawa-inc/kawakawa-cx/blob/main/packages/types/src/materials.ts#L16C8-L387C2
// Looks like there is no API for it :(
const localizedMaterials = {
  'advancedBulkhead': 'Advanced Bulkhead',
  'advancedDeckElements': 'Advanced Deck Elements',
  'advancedEngine': 'Advanced STL Engine',
  'advancedFuelPump': 'Advanced Fuel Pump',
  'advancedFuelRod': 'Advanced Fuel Rod',
  'advancedHeatShield': 'Advanced Thermal Protection Tile',
  'advancedHighgSeats': 'Advanced High-G Seats',
  'advancedHullPlate': 'Advanced Hull Plate',
  'advancedNozzle': 'Advanced Nozzle',
  'advancedRadiationShielding': 'Advanced Anti-rad Plate',
  'advancedStructuralElements': 'Advanced Structural Elements',
  'advancedThermalProtectionMaterial': 'Advanced Thermal Protection Material',
  'advancedWhippleShielding': 'Advanced Whipple Shielding',
  'advancedWindow': 'Advanced Transparent Aperture',
  'aerostatFoundation': 'Aerostat Foundation',
  'airScrubber': 'Air Scrubber',
  'allPurposeFodder': 'All-Purpose Fodder',
  'aluminium': 'Aluminium',
  'aluminiumIronAlloy': 'Ferrominium',
  'aluminiumOre': 'Aluminium Ore',
  'aluminiumTitaniumAlloy': 'Alpha-Stabilized Titanium',
  'alurhenium': 'Alurhenium',
  'ammonia': 'Ammonia',
  'antennaArray': 'Antenna Array',
  'antibacterialTreeFlowers': 'Flowery Hops',
  'argon': 'Argon',
  'artificialSoil': 'Artificial Soil',
  'audioDistributionSystem': 'Audio Distribution System',
  'audioTransmitter': 'Audio Transmitter',
  'autoDoc': 'Auto-Doc',
  'automatedCoolingSystem': 'Automated Cooling System',
  'bacteria': 'Helpful Bacteria',
  'bandages': 'Bandages',
  'basicAiFramework': 'Basic AI Framework',
  'basicBulkhead': 'Basic Bulkhead',
  'basicDeckElements': 'Basic Deck Elements',
  'basicFuelPump': 'Basic Fuel Pump',
  'basicFuelRod': 'Basic Fuel Rod',
  'basicHeatShield': 'Basic Thermal Protection Tile',
  'basicHighgSeats': 'Basic High-G Seats',
  'basicHullPlate': 'Basic Hull Plate',
  'basicNozzle': 'Basic Nozzle',
  'basicRadiationShielding': 'Basic Anti-rad Plate',
  'basicStructuralElements': 'Basic Structural Elements',
  'basicThermalProtectionMaterial': 'Basic Thermal Protection Material',
  'basicWhippleShielding': 'Basic Whipple Shielding',
  'basicWindow': 'Basic Transparent Aperture',
  'beryl': 'Beryl Crystals',
  'beryllium': 'Beryllium',
  'bioreactiveMineral': 'Bioreactive Minerals',
  'biosphereUnit': 'Biosphere Unit',
  'bleach': 'Desaturation Agent',
  'blueGoldConnectors': 'Shielded Connectors',
  'bodyScanner': 'Body Scanner',
  'boronCrystals': 'Boron Crystals',
  'borosilicate': 'Borosilicate',
  'breathableLiquid': 'Breathable Liquid',
  'caffeinatedBeans': 'Caffeinated Beans',
  'calcium': 'Calcium',
  'caliche': 'Caliche Rock',
  'capacitor': 'Electric Field Capacitor',
  'carbohydrateGrains': 'High-Carb Grains',
  'carbohydrateMaize': 'High-Carb Maize',
  'carbon': 'Carbon',
  'ceramicFabric': 'Ceramic Fabric',
  'ceramicTungstenFabric': 'Ceramic-Tungsten Fabric',
  'chemicalReagents': 'Chemical Reagents',
  'chlorine': 'Chlorine',
  'climateController': 'Climate Controller',
  'combustionChamber': 'Combustion Chamber',
  'commandBridge1': 'Command Bridge MK1',
  'commandBridge2': 'Command Bridge MK2',
  'commandBridgeShort': 'Short-distance Command Bridge',
  'communicationSystem': 'Communication System',
  'coolingFan': 'Active Cooling Device',
  'copper': 'Copper',
  'copperAluminiumAlloy': 'Bronze',
  'copperConnectors': 'Budget Connectors',
  'copperOre': 'Copper Ore',
  'coreModuleKit': 'Core Module Kit',
  'cottonProcessed': 'Cotton Fabric',
  'cottonRaw': 'Raw Cotton Fiber',
  'crewQuarters': 'Crew Quarters (Large)',
  'crewQuartersMed': 'Crew Quarters (Medium)',
  'crewQuartersSmall': 'Crew Quarters (Small)',
  'crewQuartersTiny': 'Crew Quarters (Tiny)',
  'crowdControlDrone': 'Crowd Control Drone',
  'cryoUnit': 'Cryogenic Unit',
  'cryogenicFluid': 'Cryogenic Stabilizer',
  'cryopreservationUnit': 'Cryopreservation Unit',
  'dataAnalyzer': 'Data Analyzer',
  'dataVisualizer': 'Data Visualizer',
  'decorativeElements': 'Decorative Elements',
  'distributedDatabase': 'Distributed Database',
  'drinkingWater': 'Drinking Water',
  'droneChassis': 'Drone Chassis',
  'droneFrame': 'Drone Frame',
  'droneOperationsUnit': 'Drone Operations Unit',
  'einsteinium': 'Einsteinium',
  'engineerBundle': 'Engineer Consumable Bundle',
  'engineerClothing': 'Smart Space Suit',
  'engineerFood': 'Flavoured Insta-Meal',
  'engineerLuxuryDrink': 'Einsteinium-Infused Gin',
  'engineerLuxuryHealth': 'VitaGel',
  'engineerTools': 'Personal Data Assistant',
  'enrichedEinsteinium': 'Enriched Einsteinium',
  'enrichedTechnetium': 'Enriched Technetium',
  'entertainmentDataCore': 'Entertainment Data Core',
  'entertainmentUnit': 'Entertainment Unit',
  'epoxy': 'Epoxy Resin',
  'fastenerKitMedium': 'Medium Fastener Kit',
  'fastenerKitSmall': 'Small Fastener Kit',
  'fattyNuts': 'Triglyceride Nuts',
  'fattyVegetables': 'Triglyceride Fruits',
  'fissionReactor': 'Fission Reactor',
  'floatingTank': 'Floating Tank',
  'flowControl': 'Flow Control Device',
  'fluidPiping': 'Fluid Piping',
  'fluorine': 'Fluorine',
  'flux': 'Flux',
  'ftlFieldController': 'FTL Field Controller',
  'ftlFuel': 'FTL Fuel',
  'fuelSavingEngine': 'Fuel-saving STL Engine',
  'fullBodyInteractionDevice': 'Full-Body Interaction Device',
  'galerite': 'Galerite Rock',
  'gasContainer': 'Cylindrical Gas Container',
  'gasVent': 'Gas Vent',
  'gatewaySegment': 'Gateway Segment',
  'glassCombustionChamber': 'Glass Combustion Chamber',
  'glassEngine': 'Glass-based STL Engine',
  'glassNozzle': 'Glass Nozzle',
  'gold': 'Gold',
  'goldCopperAlloy': 'Red Gold',
  'goldIronAlloy': 'Blue Gold',
  'goldOre': 'Gold Ore',
  'grapes': 'Wine-Quality Grapes',
  'habitatUnit': 'Habitat Unit',
  'habitationModule': 'Habitation Module',
  'halite': 'Halite Crystals',
  'handcraftWorkshopUnit': 'Handcraft Workshop Unit',
  'hardenedHullPlate': 'Hardened Hull Plate',
  'hardenedStructuralElements': 'Hardened Structural Elements',
  'heliotropeExtract': 'Heliotrope Extract',
  'helium': 'Helium',
  'helium3': 'Helium-3 Isotope',
  'herbs': 'Spicy Herbs',
  'highLoadCargoBay': 'High-load Cargo Bay Kit',
  'highPowerReactor': 'High-power FTL Reactor',
  'highVolumeCargoBay': 'High-volume Cargo Bay Kit',
  'holographicDisplay': 'Holographic Display',
  'holographicGlasses': 'Holographic Glasses',
  'hugeCargoBay': 'Huge Cargo Bay Kit',
  'hydrocarbonPlants': 'Hydrocarbon Plants',
  'hydrogen': 'Hydrogen',
  'hyperPowerReactor': 'Hyper-power Reactor',
  'hyperthrustEngine': 'Hyperthrust STL Engine',
  'hyperthrustNozzle': 'Hyperthrust Nozzle',
  'indigo': 'Indigo Colorant',
  'informationDataCore': 'Information Data Core',
  'informationManagementSystem': 'Information Management System',
  'insuFoam': 'InsuFoam',
  'iodine': 'Iodine',
  'iron': 'Iron',
  'ironOre': 'Iron Ore',
  'ironTitaniumAlloy': 'Ferro-Titanium',
  'kevlar': 'Para Aramid',
  'krypton': 'Krypton',
  'kryptonium': 'Kryptonium',
  'laboratoryUnit': 'Laboratory Unit',
  'largeCapacitorBank': 'Large Capacitor Bank',
  'largeCargoBay': 'Large Cargo Bay Kit',
  'largeDeviceCover': 'Durable Casing L',
  'largeEmitter': 'Large FTL Emitter',
  'largeFtlTank': 'Large FTL Fuel Tank Kit',
  'largePlasticsBoard': 'Polymer Sheet Type L',
  'largeShipRepairDroneUnit': 'Large Ship-Repair Drone Operations Unit',
  'largeStlTank': 'Large STL Fuel Tank Kit',
  'laserDiode': 'Laser Diodes',
  'lifeSupportSystem': 'Life Support System',
  'lightweightBulkhead': 'Lightweight Bulkhead',
  'lightweightDeckElements': 'Lightweight Deck Elements',
  'lightweightHullPlate': 'Lightweight Hull Plate',
  'lightweightStructuralElements': 'Lightweight Structural Elements',
  'lightweightWindow': 'Lightweight Transparent Aperture',
  'limestone': 'Limestone',
  'liquidCrystals': 'Liquid Crystals',
  'liquidEinsteinium': 'Liquid Einsteinium',
  'lithium': 'Lithium',
  'lithiumOre': 'Lithium Ore',
  'localDatabase': 'Local Database',
  'logisticsSystem': 'Logistics System',
  'lowHeatFuelPump': 'Low-heat Fuel Pump',
  'machineLearningInterface': 'Machine Learning Interface',
  'magnesite': 'Magnesite',
  'magnesium': 'Magnesium',
  'magneticFloor': 'Magnetic Ground Cover',
  'magnetite': 'Magnetite',
  'mainFrameBlank': 'Basic Mainframe',
  'meat': 'Meat Tissue Patties',
  'medicalStretcher': 'Medical Stretcher',
  'mediumCapacitorBank': 'Medium Capacitor Bank',
  'mediumCargoBay': 'Medium Cargo Bay Kit',
  'mediumDeviceCover': 'Durable Casing M',
  'mediumEmitter': 'Medium FTL Emitter',
  'mediumFtlTank': 'Medium FTL Fuel Tank Kit',
  'mediumPlasticsBoard': 'Polymer Sheet Type M',
  'mediumStlTank': 'Medium STL Fuel Tank Kit',
  'megaTubeCoating': 'MegaTube Coating',
  'memoryBank': 'Memory Bank',
  'metalHalideLamp': 'Metal-Halide Lighting System',
  'microHeadphones': 'Micro Headphones',
  'microProcessor': 'Micro-Processor',
  'mineralConstructionGranulate': 'Mineral Construction Granulate',
  'motherBoard': 'Motherboard',
  'mushrooms': 'Protein-Rich Mushrooms',
  'nanoCarbonSheeting': 'Nano-Carbon Sheeting',
  'nanoFiber': 'Nano Fiber',
  'nanoGlass': 'Nano-Coated Glass',
  'nanoResin': 'Nano-Enhanced Resin',
  'navigation1': 'Navigation Module MK1',
  'navigation2': 'Navigation Module MK2',
  'neon': 'Neon',
  'neonLightingSystem': 'Neon Lighting System',
  'networkingFramework': 'Networking Framework',
  'neuralNetwork': 'Neural Network',
  'nitrogen': 'Nitrogen',
  'nonVolatileMemory': 'Non-Volatile Memory',
  'nutrientSolution': 'Nutrient Solution',
  'nylon': 'Nylon Fabric',
  'officeSupplies': 'Office Supplies',
  'olfactorySubstances': 'Olfactory Substances',
  'operatingSystem': 'Operating System',
  'oxygen': 'Oxygen',
  'painkillers': 'Painkillers',
  'pesticides': 'DDT Plant Agent',
  'pineberries': 'Pineberries',
  'pioneerBundle': 'Pioneer Consumable Bundle',
  'pioneerClothing': 'Basic Overalls',
  'pioneerLuxuryClothing': 'Padded Work Overall',
  'pioneerLuxuryDrink': 'Caffeinated Infusion',
  'polarityFieldGenerator': 'Polarity Field Generator',
  'polyEthylene': 'Poly-Ethylene',
  'polymerGranulate': 'Polymer Granulate',
  'powerCell': 'Power Cell',
  'premiumFertilizer': 'Premium Fertilizer',
  'pressureShielding': 'Pressure Shielding',
  'printedCircuitBoard': 'Printed Circuit Board',
  'proteinAlgae': 'Protein-Rich Algae',
  'proteinBeans': 'Protein-Rich Beans',
  'proteinPaste': 'Protein Paste',
  'quickChargeReactor': 'Quick-charge FTL Reactor',
  'radiationShielding': 'Radiation Shielding',
  'radioDevice': 'Radio Device',
  'radioisotopeGenerator': 'Radioisotope Generator',
  'rations': 'Basic Rations',
  'reactorControlSystem': 'Reactor Control System',
  'redGoldConnectors': 'High-Capacity Connectors',
  'reinforcedBulkhead': 'Reinforced Bulkhead',
  'reinforcedDeckElements': 'Reinforced Deck Elements',
  'reinforcedHullPlate': 'Reinforced Hull Plate',
  'reinforcedStructuralElements': 'Reinforced Structural Elements',
  'reinforcedTranslucentMaterial': 'Reinforced Glass',
  'reinforcedWindow': 'Reinforced Transparent Aperture',
  'rescueDrone': 'Rescue Drone',
  'rhenium': 'Rhenium',
  'rheniumOre': 'Rhenium Ore',
  'safetyUniform': 'Safety Uniform',
  'scientistBundle': 'Scientist Consumable Bundle',
  'scientistClothing': 'AI-Assisted Lab Coat',
  'scientistFood': 'Quality Meat Meal',
  'scientistLuxuryDrink': 'Smart Zinfandel',
  'scientistLuxuryHealth': 'NeuroStimulants',
  'scientistTools': 'Scientific Work Station',
  'sealant': 'Poly-Sulfite Sealant',
  'searchAlgorithm': 'Search Algorithm',
  'sedativeSubstance': 'Sedative Substance',
  'sensor': 'Sensor',
  'sensorArray': 'Sensor Array',
  'settlerBundle': 'Settler Consumable Bundle',
  'settlerClothing': 'Exoskeleton Work Suit',
  'settlerLuxuryDrink': 'Kombucha',
  'settlerLuxuryTools': 'Repair Kit',
  'settlerTools': 'Power Tools',
  'shipRepairDrone': 'Ship-Repair Drone',
  'shockwaveDampeningModule': 'Shockwave-dampening Module',
  'silicon': 'Silicon',
  'siliconOre': 'Silicon Ore',
  'silkProcessed': 'Silken Fabric',
  'silkRaw': 'Raw Silk Strains',
  'singularityStabilizer': 'Singularity Stabilizer',
  'smallCapacitorBank': 'Small Capacitor Bank',
  'smallCargoBay': 'Small Cargo Bay Kit',
  'smallDeviceCover': 'Durable Casing S',
  'smallEmitter': 'Small FTL Emitter',
  'smallFtlTank': 'Small FTL Fuel Tank Kit',
  'smallPlasticsBoard': 'Polymer Sheet Type S',
  'smallShipRepairDroneUnit': 'Small Ship-Repair Drone Operations Unit',
  'smallStlTank': 'Small STL Fuel Tank Kit',
  'sodium': 'Sodium',
  'sodiumBorohydride': 'Sodium Borohydride',
  'solarCell': 'Solar Cell',
  'solarPanel': 'Solar Panel',
  'sortingAlgorithm': 'Sorting Algorithm',
  'spaceTether': 'Space Tether',
  'specializedRadiationShielding': 'Specialized Anti-rad Plate',
  'stabilitySupportSystem': 'Stability Support System',
  'standardEngine': 'Standard STL Engine',
  'standardReactor': 'Standard FTL Reactor',
  'steel': 'Steel',
  'stlFuel': 'STL Fuel',
  'structuralSpacecraftComponent': 'Structural Spacecraft Component',
  'sulfur': 'Sulfur',
  'sulfurCrystals': 'Sulfur Crystals',
  'surgeryUnit': 'Surgery Unit',
  'surgicalDrone': 'Surgical Drone',
  'surgicalEquipment': 'Surgical Equipment',
  'surveillanceDrone': 'Surveillance Drone',
  'tantalite': 'Tantalite Rock',
  'tantalum': 'Tantalum',
  'targetingComputer': 'Targeting Computer',
  'tclAcid': 'TCL Acid',
  'technetium': 'Technetium',
  'technetiumOxide': 'Technetium Oxide',
  'technetiumStabilizers': 'Stabilized Technetium',
  'technicianBundle': 'Technician Consumable Bundle',
  'technicianClothing': 'HazMat Work Suit',
  'technicianHealth': 'Basic Medical Kit',
  'technicianLuxuryDrink': 'Stellar Pale Ale',
  'technicianLuxuryHealth': 'Stem Cell Treatment',
  'technicianTools': 'Multi-Purpose Scanner',
  'technoKevlar': 'Enhanced Para Aramid',
  'tectosilisite': 'Tectosilisite',
  'tensionReliefStructure': 'Tension Relief Structure',
  'tensorProcessingUnit': 'Tensor Processing Unit',
  'testTubes': 'Test Tubes',
  'thermalShielding': 'Thermal Shielding',
  'thermoFluid': 'ThermoFluid',
  'tinyCargoBay': 'Tiny Cargo Bay Kit',
  'titanium': 'Titanium',
  'titaniumOre': 'Titanium Ore',
  'torusSegment': 'Torus Segment',
  'touchDeviceBlank': 'Handheld Personal Console',
  'touchScreen': 'Capacitive Display',
  'transistor': 'Advanced Transistor',
  'translucentMaterial': 'Glass',
  'traumaCareUnit': 'Trauma Care Unit',
  'truss': 'Truss',
  'tungstenAluminiumAlloy': 'Alpha-Stabilized Tungsten',
  'tungstenResource': 'Bacterial Tungsten Solution',
  'twoDimensionalDisplay': 'Information Display',
  'universalToolset': 'Universal Toolset',
  'universeMap': 'Spatial Navigation Map',
  'verySmallCargoBay': 'Very Small Cargo Bay Kit',
  'vitaEssence': 'Vita Essence',
  'vortexEngine': 'Vortex Engine',
  'vortexFuelTank': 'Vortex Fuel Tank',
  'vortexReactor': 'Vortex Reactor',
  'vortexStimulationFuel': 'Vortex Fuel',
  'waferMedium': 'Medium Wafer',
  'waferSmall': 'Small Wafer',
  'water': 'Water',
  'waterFilter': 'Active Water Filter',
  'waterRecycler': 'Water Reclaimer',
  'weakArtificalIntelligence': 'Weak Artificial Intelligence',
  'windowManager': 'Window Manager',
  'wolfram': 'Tungsten',
  'wolfrhenium': 'Wolfrhenium',
  'workstationBlank': 'Basic Workstation',
  'zircon': 'Zircon Crystals',
  'zirconium': 'Zirconium',
}