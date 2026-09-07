"use strict";

// Le logo est rendu par Electron lui-même : pas de dépendance graphique, et la
// source de vérité reste ce fichier. Motif « mur de boards » — un appareil à
// joints décalés, une brique verte pour le board actif. Testé à 16 px : c'est la
// taille qui a écarté la piste « colonnes kanban », vide sur ses deux tiers bas.
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const HTML = `<!doctype html><meta charset="utf-8"><style>
  html, body { margin: 0; width: 1024px; height: 1024px; background: transparent; }
  .pad { padding: 92px; box-sizing: border-box; width: 1024px; height: 1024px; }
  .tile {
    width: 100%; height: 100%; border-radius: 190px; box-sizing: border-box;
    background: linear-gradient(160deg, #2b3138 0%, #15181d 55%, #0d1117 100%);
    border: 3px solid rgba(255, 255, 255, .10);
    box-shadow: inset 0 3px 0 rgba(255, 255, 255, .10);
    padding: 150px 130px; display: flex; flex-direction: column; gap: 38px;
  }
  .row { flex: 1; display: flex; gap: 38px; }
  .b { border-radius: 26px; background: #434b54; }
  .b.dim { background: #394048; }
  .b.go { background: linear-gradient(180deg, #4ac162 0%, #3fb950 100%); }
</style>
<div class="pad"><div class="tile">
  <div class="row"><div class="b dim" style="flex:2"></div><div class="b" style="flex:3"></div></div>
  <div class="row"><div class="b go" style="flex:3"></div><div class="b dim" style="flex:2"></div></div>
  <div class="row"><div class="b" style="flex:2"></div><div class="b dim" style="flex:3"></div></div>
</div></div>`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1024, height: 1024, show: false, transparent: true, frame: false });
  await win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(HTML));
  await new Promise((resolve) => setTimeout(resolve, 400));
  const out = path.join(__dirname, "..", "build", "icon.png");
  fs.writeFileSync(out, (await win.webContents.capturePage()).toPNG());
  process.stdout.write(`icon.png écrit (${fs.statSync(out).size} octets)\n`);
  app.quit();
});
