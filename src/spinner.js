import dashboardSvg from "../Spinner Dashboard.svg?raw";
import gateSvg from "../Spinner Dashboard hud.svg?raw";
import logo1 from "../Spinner_Dash_Logo001.png";
import logo2 from "../Spinner_Dash_Logo002.png";
import logo3 from "../Spinner_Dash_Logo003.png";
const logoSources = [logo1, logo2, logo3];
const gateImage =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    gateSvg
      .replace(/<!DOCTYPE[\s\S]*?>/, "")
      .replace('width="100%"', 'width="477"')
      .replace('height="100%"', 'height="241"'),
  );
import { parseDashboard } from "./dashboard.mjs";
import {
  flightTarget,
  buildManeuvers,
  navigationNotice,
  LOOK_AHEAD_SECONDS,
} from "./guidance.mjs";
import * as C from "cesium";
import { createApplicationViewer } from "gods-eye-view/application/viewer";
import {
  createEsriImagery,
  createOsmImagery,
} from "gods-eye-view/maps/imagery";
import {
  makeRoute,
  sampleRoute,
  movePosition,
  turnToward,
} from "./navigation.mjs";

const $ = (id) => document.getElementById(id);
const G = parseDashboard(dashboardSvg);
const HUD = G.hud;
let calibration = { screenW: 146.6, screenH: 69.4, offsetX: 0, offsetY: 0 };
try {
  const saved = JSON.parse(localStorage.getItem("spinner.calibration") || "{}");
  for (const key of Object.keys(calibration)) {
    const input = $(key),
      n = Number(saved[key]);
    if (Number.isFinite(n) && n >= Number(input.min) && n <= Number(input.max))
      calibration[key] = n;
  }
} catch {}
function layout() {
  const { screenW: w, screenH: h, offsetX, offsetY } = calibration,
    s = { x: G.center[0] - w / 2 + offsetX, y: G.center[1] - h / 2 + offsetY };
  $("cockpit").style.aspectRatio = `${w}/${h}`;
  if (!document.fullscreenElement)
    $("cockpit").style.width = `max(240px, min(100vw, calc((100svh - 58px) * ${w} / ${h})))`;
  else $("cockpit").style.width = "100vw";
  const place = (el, [x, y, rw, rh]) =>
    Object.assign(el.style, {
      left: `${((x - s.x) / w) * 100}%`,
      top: `${((y - s.y) / h) * 100}%`,
      width: `${(rw / w) * 100}%`,
      height: `${(rh / h) * 100}%`,
    });
  place($("conditions"), G.strips[0].box);
  place($("navigation"), G.strips[1].box);
  place($("viewport"), HUD);
  const center = G.center[0];
  for (let side = 0; side < 2; side++) {
    const openings = G.small.filter((c) =>
      side ? c.box[0] > center : c.box[0] < center,
    );
    Array.from($(side ? "keys-right" : "keys-left").children).forEach(
      (el, i) => {
        if (openings[i]) place(el, openings[i].box);
      },
    );
  }
  G.circles.forEach((circle, i) => place($(`manual-${i}`), circle.box));
  const decalSize = 6;
  const decalY = G.strips[0].box[1] + G.strips[0].box[3] / 2 - decalSize / 2;
  const decalBoxes = [
    [
      (s.x + G.strips[0].box[0]) / 2 - decalSize / 2,
      decalY,
      decalSize,
      decalSize,
    ],
    [
      (G.strips[0].box[0] + G.strips[0].box[2] + G.strips[1].box[0]) / 2 -
        decalSize / 2,
      decalY,
      decalSize,
      decalSize,
    ],
    [
      (G.strips[1].box[0] + G.strips[1].box[2] + s.x + w) / 2 - decalSize / 2,
      decalY,
      decalSize,
      decalSize,
    ],
  ];
  decalBoxes.forEach((box, i) => {
    const el = $(`decal-${i}`);
    if (el) {
      if (!el.src || !el.getAttribute("src")) el.src = logoSources[i];
      place(el, box);
    }
  });
  const paths = G.holes.map((c) => `<path d="${c.path}"/>`).join("");
  $("plate").setAttribute("viewBox", `${s.x} ${s.y} ${w} ${h}`);
  $("plate").innerHTML =
    `<defs><mask id="openings"><rect x="${s.x}" y="${s.y}" width="${w}" height="${h}" fill="white"/><g fill="black">${paths}</g></mask></defs><rect x="${s.x}" y="${s.y}" width="${w}" height="${h}" fill="#0b1010" mask="url(#openings)"/><g fill="none" stroke="#25302d" stroke-width=".12">${paths}</g>`;
}
const state = {
  mode: "flight",
  map: false,
  auto: true,
  paused: matchMedia("(prefers-reduced-motion: reduce)").matches,
  travel: 0,
  speed: 42,
  altitude: 380,
  heading: 0,
  lon: -118.251,
  lat: 34.047,
  theme: "amber",
  roads: true,
  buildings: true,
  labels: true,
  scanlines: true,
};
let viewer,
  roadLines,
  buildingCollection,
  buildingEdges,
  labels,
  route,
  imageryLayer,
  imageryPromise,
  ready = false;
const buttons = new Map();
let cruiseSpeed = state.speed;
const fullscreen = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await $("cockpit").requestFullscreen();
  } catch {
    status("Use the browser fullscreen control.");
  }
};
const toggleMap = () => {
  state.map = !state.map;
  sync();
};
const keysLeft = [
  ["FLY", "Flight mode", () => setMode("flight")],
  ["DRIVE", "Driving mode", () => setMode("drive")],
  [
    "AUTO",
    "Toggle automatic travel",
    () => {
      state.auto = !state.auto;
      if (state.auto) reset();
      sync();
    },
  ],
  ["LEFT", "Steer left", () => steer(-0.16)],
  [
    "HOLD",
    "Pause or resume travel",
    () => {
      state.paused = !state.paused;
      sync();
    },
  ],
  ["RIGHT", "Steer right", () => steer(0.16)],
  ["ALT+", "Increase altitude", () => alt(35)],
  ["ALT-", "Decrease altitude", () => alt(-35)],
  [
    "SPD+",
    "Set cruising speed",
    () => {
      const input = $("cruise-speed");
      input.max = state.mode === "flight" ? 432 : 90;
      input.value = Math.round(state.speed * 3.6);
      $("speed-settings").showModal();
    },
  ],
];
const keysRight = [
  [
    "SPD-",
    "Resume cruising speed",
    () => {
      state.speed = cruiseSpeed;
      state.paused = false;
      sync();
    },
  ],
  ["AMBER", "Amber schematic view", () => theme("amber")],
  ["SAT", "Satellite imagery", () => theme("satellite")],
  [
    "ROAD",
    "Toggle roads",
    () => {
      state.roads = !state.roads;
      sync();
    },
  ],
  [
    "BLDG",
    "Toggle buildings",
    () => {
      state.buildings = !state.buildings;
      sync();
    },
  ],
  ["NAV9", "Toggle overhead map", toggleMap],
  ["FULL", "Fullscreen", fullscreen],
  ["SET", "Controls and calibration", () => $("settings").showModal()],
  ["HOME", "Reset route", () => reset()],
];
for (const [side, items] of [
  [0, keysLeft],
  [1, keysRight],
])
  for (const [index, [text, label, action]] of items.entries()) {
    const button = document.createElement("button");
    button.title = label;
    button.setAttribute("aria-label", label);
    const dots = document.createElement("span");
    dots.className = "dot-matrix";
    dots.setAttribute("aria-hidden", "true");
    for (let n = 0; n < 18; n++) {
      const dot = document.createElement("i");
      dot.style.setProperty("--phase", `${-((n + index * 3) % 18) * 0.12}s`);
      dots.append(dot);
    }
    const name = document.createElement("span");
    name.className = "function-label";
    name.textContent = text;
    button.append(dots, name);
    button.addEventListener("click", action);
    $(side ? "keys-right" : "keys-left").append(button);
    buttons.set(text, button);
  }
$("speed-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = $("cruise-speed");
  if (!input.checkValidity()) return;
  cruiseSpeed = Number(input.value) / 3.6;
  state.speed = cruiseSpeed;
  $("speed-settings").close();
  sync();
});
$("speed-cancel").onclick = () => $("speed-settings").close();
function sync() {
  const flags = {
    FLY: state.mode === "flight",
    DRIVE: state.mode === "drive",
    AUTO: state.auto,
    HOLD: state.paused,
    NAV9: state.map,
    AMBER: state.theme === "amber",
    SAT: state.theme === "satellite",
    ROAD: state.roads,
    BLDG: state.buildings,
  };
  for (const [key, value] of Object.entries(flags))
    buttons.get(key).setAttribute("aria-pressed", String(value));

  if (roadLines) roadLines.show = state.roads;
  if (buildingCollection) buildingCollection.show = state.buildings;
  if (buildingEdges) buildingEdges.show = state.buildings;
  if (labels) labels.show = state.labels;
  $("scanlines").hidden = !state.scanlines;
}
function setMode(mode) {
  state.mode = mode;
  state.map = false;
  state.speed = mode === "flight" ? 42 : 9;
  cruiseSpeed = state.speed;
  state.altitude = mode === "flight" ? 380 : 3.2;
  reset();
  sync();
}
function reset() {
  state.travel = 0;
  if (route) {
    const p = sampleRoute(route, 0);
    Object.assign(state, p);
  }
  sync();
}
function steer(amount) {
  state.auto = false;
  state.heading += amount;
  sync();
}
function speed(amount) {
  state.speed = C.Math.clamp(
    state.speed + amount,
    0,
    state.mode === "flight" ? 120 : 25,
  );
}
function alt(amount) {
  if (state.mode === "flight")
    state.altitude = C.Math.clamp(state.altitude + amount, 40, 2500);
}
const tickerState = new WeakMap();
function scrollNotice(el, now) {
  const identity = el.textContent.replace(/\d+/g, "#");
  let ticker = tickerState.get(el);
  if (!ticker || ticker.identity !== identity) {
    ticker = { identity, start: now };
    tickerState.set(el, ticker);
  }
  const overflow = el.scrollWidth - el.parentElement.clientWidth + 8;
  if (overflow <= 0) {
    el.style.transform = "translateX(0)";
    return;
  }
  const period = overflow / 35 + 4,
    phase = ((now - ticker.start) / 1000) % period;
  const offset = Math.min(overflow, Math.max(0, (phase - 2) * 35));
  el.style.transform = `translateX(${-offset}px)`;
}

function status(message) {
  $("view-status").textContent = message;
}
function plate() {
  const visible = $("plate-visible").checked ? "1" : "0";
  $("plate").style.opacity = visible;
  const decals = $("decals");
  if (decals) decals.style.opacity = visible;
}
async function theme(value) {
  state.theme = value;
  sync();
  if (value === "amber") {
    if (imageryLayer) imageryLayer.show = false;
    return;
  }
  if (imageryLayer) {
    imageryLayer.show = true;
    return;
  }
  status("CONNECTING SATELLITE IMAGERY…");
  try {
    imageryPromise ||= createEsriImagery().catch(() => createOsmImagery());
    const provider = await imageryPromise;
    if (!imageryLayer) {
      imageryLayer = viewer.imageryLayers.addImageryProvider(provider);
      imageryLayer.brightness = 0.6;
      let tileFailures = 0;
      provider.errorEvent?.addEventListener(() => {
        if (++tileFailures === 3)
          status("IMAGERY UNAVAILABLE · AMBER VIEW REMAINS AVAILABLE");
      });
    }
    imageryLayer.show = state.theme === "satellite";
    status("");
  } catch {
    imageryPromise = null;
    state.theme = "amber";
    sync();
    status("SATELLITE UNAVAILABLE · LOCAL MAP READY");
  }
}
$("help-button").onclick = () => $("settings").showModal();
for (const key of Object.keys(calibration)) {
  const input = $(key);
  input.value = calibration[key];
  input.addEventListener("input", () => {
    if (!input.checkValidity() || input.value === "") return;
    calibration[key] = Number(input.value);
    layout();
    try {
      localStorage.setItem("spinner.calibration", JSON.stringify(calibration));
    } catch {}
  });
}
$("plate-visible").addEventListener("change", plate);
document.addEventListener("fullscreenchange", () => {
  const credits = $("credits");
  if (document.fullscreenElement) $("cockpit").append(credits);
  else document.body.insertBefore(credits, $("settings"));
  layout();
});
window.addEventListener("resize", () => {
  layout();
  if (viewer) viewer.resize();
});
const pressed = new Set();
window.addEventListener("keydown", (e) => {
  if (
    $("settings").open ||
    $("speed-settings").open ||
    e.target.matches("input,textarea")
  )
    return;
  const k = e.key.toLowerCase();
  if ([" ", "arrowleft", "arrowright", "arrowup", "arrowdown"].includes(k))
    e.preventDefault();
  pressed.add(k);
  if (e.repeat) return;
  const actions = {
    f: () => setMode("flight"),
    d: () => setMode("drive"),
    m: () => buttons.get("NAV9").click(),
    a: () => buttons.get("AUTO").click(),
    " ": () => buttons.get("HOLD").click(),
    r: reset,
  };
  actions[k]?.();
});
window.addEventListener("keyup", (e) => pressed.delete(e.key.toLowerCase()));
window.addEventListener("blur", () => pressed.clear());
let mapHeight = 2400;
layout();
sync();

async function start() {
  viewer = createApplicationViewer({
    container: $("globe"),
    creditContainer: $("credits"),
  });
  viewer.targetFrameRate = 30;
  viewer.resolutionScale =
    Math.min(window.devicePixelRatio || 1, 1.5) /
    Math.max(window.devicePixelRatio || 1, 1);
  const scene = viewer.scene;
  const origRender = scene.render.bind(scene);
  scene.render = function (time) {
    const canvas = viewer.canvas;
    if (
      !canvas ||
      canvas.width <= 0 ||
      canvas.height <= 0 ||
      canvas.clientWidth <= 0 ||
      canvas.clientHeight <= 0 ||
      scene.context.drawingBufferWidth <= 0 ||
      scene.context.drawingBufferHeight <= 0
    ) {
      return;
    }
    try {
      return origRender(time);
    } catch (e) {
      if (
        e instanceof C.DeveloperError &&
        e.message?.includes("greater than 0")
      ) {
        return;
      }
      throw e;
    }
  };
  scene.renderError.addEventListener(() => {
    ready = false;
    status("GRAPHICS INTERRUPTED · RELOAD TO RETRY");
  });
  scene.globe.show = true;
  scene.globe.baseColor = C.Color.fromCssColorString("#080e0d");
  scene.globe.enableLighting = false;
  scene.skyAtmosphere.show = false;
  scene.skyBox.show = false;
  scene.sun.show = false;
  scene.moon.show = false;
  scene.backgroundColor = C.Color.fromCssColorString("#050b0c");
  scene.fog.enabled = false;
  scene.screenSpaceCameraController.enableInputs = false;
  viewer.creditDisplay.addStaticCredit(
    new C.Credit(
      '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a> · ODbL · God’s Eye View renderer',
      true,
    ),
  );
  const response = await fetch(`${import.meta.env.BASE_URL}data/los-angeles.json`);
  if (!response.ok) throw Error("Local map data is missing.");
  const data = await response.json();
  route = makeRoute(data.driveRoute);
  if (!route.total) throw Error("Local route is empty.");
  roadLines = scene.primitives.add(new C.PolylineCollection());
  buildingEdges = scene.primitives.add(new C.PolylineCollection());
  const gold = C.Material.fromType("Color", {
      color: C.Color.fromCssColorString("#b68d38").withAlpha(0.78),
    }),
    edge = C.Material.fromType("Color", {
      color: C.Color.fromCssColorString("#d2a443").withAlpha(0.65),
    });
  for (const road of data.roads) {
    if (road.points.length < 2) continue;
    roadLines.add({
      positions: C.Cartesian3.fromDegreesArrayHeights(
        road.points.flatMap((p) => [...p, 0.15]),
      ),
      width: ["primary", "secondary", "trunk", "motorway"].includes(road.kind)
        ? 2
        : 1,
      material: gold,
    });
  }
  const buildings = [];
  for (const b of data.buildings) {
    if (b.points.length < 4) continue;
    const positions = C.Cartesian3.fromDegreesArray(b.points.flat());
    buildings.push(
      new C.GeometryInstance({
        geometry: new C.PolygonGeometry({
          polygonHierarchy: new C.PolygonHierarchy(positions),
          height: 0,
          extrudedHeight: b.height,
          vertexFormat: C.PerInstanceColorAppearance.VERTEX_FORMAT,
        }),
        attributes: {
          color: C.ColorGeometryInstanceAttribute.fromColor(
            C.Color.fromCssColorString("#182421"),
          ),
        },
      }),
    );
    buildingEdges.add({
      positions: C.Cartesian3.fromDegreesArrayHeights(
        b.points.flatMap((p) => [...p, b.height + 0.1]),
      ),
      width: 1,
      material: edge,
    });
    for (
      let i = 0;
      i < b.points.length - 1;
      i += Math.max(1, Math.floor(b.points.length / 6))
    ) {
      const p = b.points[i];
      buildingEdges.add({
        positions: C.Cartesian3.fromDegreesArrayHeights([
          ...p,
          0,
          ...p,
          b.height,
        ]),
        width: 1,
        material: edge,
      });
    }
  }
  buildingCollection = scene.primitives.add(
    new C.Primitive({
      geometryInstances: buildings,
      appearance: new C.PerInstanceColorAppearance({
        translucent: false,
        closed: true,
      }),
      asynchronous: true,
    }),
  );
  roadLines.add({
    positions: C.Cartesian3.fromDegreesArrayHeights(
      data.driveRoute.flatMap((p) => [...p, 0.4]),
    ),
    width: 3,
    material: C.Material.fromType("PolylineGlow", {
      glowPower: 0.15,
      color: C.Color.fromCssColorString("#6be5d2"),
    }),
  });
  labels = scene.primitives.add(new C.LabelCollection());
  for (const l of data.landmarks)
    labels.add({
      position: C.Cartesian3.fromDegrees(l.lon, l.lat, 95),
      text: l.name.toUpperCase(),
      font: "11px monospace",
      fillColor: C.Color.fromCssColorString("#77d8d3"),
      outlineColor: C.Color.BLACK,
      outlineWidth: 2,
      style: C.LabelStyle.FILL_AND_OUTLINE,
      scaleByDistance: new C.NearFarScalar(150, 1, 7000, 0.55),
      distanceDisplayCondition: new C.DistanceDisplayCondition(70, 14000),
    });
  const maneuvers = buildManeuvers(route, data.roads);
  $("source-status").textContent =
    `OSM · ${data.roads.length} STREETS · ${data.buildings.length} BUILDINGS · SIMULATED TRAVEL`;
  reset();
  ready = true;
  status("");
  sync();
  const target = viewer.entities.add({
    position: C.Cartesian3.fromDegrees(state.lon, state.lat, state.altitude),
    billboard: {
      image: gateImage,
      width: 240,
      height: 121,
      scaleByDistance: new C.NearFarScalar(20, 1.5, 1200, 0.25),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });
  let last = performance.now(),
    hudTime = 0;
  viewer.scene.preRender.addEventListener(() => {
    const now = performance.now(),
      dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (!state.paused && !document.hidden) {
      if (pressed.has("arrowleft")) {
        state.auto = false;
        state.heading -= dt * 0.65;
      }
      if (pressed.has("arrowright")) {
        state.auto = false;
        state.heading += dt * 0.65;
      }
      if (pressed.has("w")) speed(dt * 10);
      if (pressed.has("s")) speed(-dt * 10);
      if (pressed.has("arrowup")) alt(dt * 90);
      if (pressed.has("arrowdown")) alt(-dt * 90);
      if (state.auto) {
        state.travel += state.speed * dt;
        const p = sampleRoute(route, state.travel);
        state.lon = p.lon;
        state.lat = p.lat;
        state.heading = turnToward(state.heading, p.heading, dt * 1.1);
      } else
        Object.assign(
          state,
          movePosition(state.lon, state.lat, state.heading, state.speed * dt),
        );
    }
    viewer.camera.frustum.fov = C.Math.toRadians(
      state.mode === "flight" ? 75 : 60,
    );
    viewer.camera.setView({
      destination: C.Cartesian3.fromDegrees(
        state.lon,
        state.lat,
        state.map ? mapHeight : state.altitude,
      ),
      orientation: {
        heading: state.map ? 0 : state.heading,
        pitch: C.Math.toRadians(
          state.map ? -90 : state.mode === "flight" ? -14 : -2,
        ),
        roll: 0,
      },
    });
    const ahead = flightTarget(state, route);
    target.position = C.Cartesian3.fromDegrees(
      ahead.lon,
      ahead.lat,
      ahead.altitude,
    );
    target.show = state.mode === "flight" && !state.map && state.speed > 0;
    scrollNotice($("telemetry"), now);
    scrollNotice($("nav-detail"), now);
    if (now - hudTime > 200) {
      hudTime = now;
      const notices = [
        `LOS ANGELES - ${state.mode.toUpperCase()} ${state.paused ? "HOLD" : state.auto ? "AUTO" : "MANUAL"}`,
        `LIVE WEATHER NOT CONNECTED`,
        `LIVE TRAFFIC NOT CONNECTED`,
        `SIMULATION - ${Math.round(state.speed * 3.6)} KM/H - ALT ${Math.round(state.altitude)} M`,
      ];
      $("telemetry").textContent =
        notices[Math.floor(now / 24000) % notices.length];
      $("nav-detail").textContent = navigationNotice(state, route, maneuvers);
      $("scene-label").textContent =
        `LOS ANGELES / ${state.map ? "SECTOR MAP" : state.mode === "flight" ? "AIR CORRIDOR" : "STREET LEVEL"}`;
      buttons.get("AUTO").setAttribute("aria-pressed", String(state.auto));
    }
  });
  window.spinner = {
    getState: () => ({
      ...state,
      cruiseSpeed,
      ready,
      routeLength: route.total,
    }),
    getTarget: () => ({ ...flightTarget(state, route), visible: target.show }),
    getCamera: () => ({ height: viewer.camera.positionCartographic.height }),
    getGeometry: () => ({
      panels: G.panels.length,
      smallPerSide: G.small.length / 2,
      circles: G.circles.length,
      strips: G.strips.map((c) => c.box),
      roads: data.roads.length,
      buildings: data.buildings.length,
    }),
  };
}
start().catch((error) => {
  console.error(error);
  status(`WORLD UNAVAILABLE · ${error.message} · RELOAD TO RETRY`);
  $("telemetry").textContent = "STARTUP FAILED";
});
