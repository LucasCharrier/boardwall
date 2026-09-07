"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { classify } = require("./allowlist.js");

const OWNER = /^\/(orgs|users)\/([^/]+)\//;
const THEMES = new Set(["system", "light", "dark"]);

function normalizeUrl(input) {
  const trimmed = String(input ?? "").trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return classify(withScheme) === "board" ? withScheme : null;
}

function ownerOf(url) {
  const match = OWNER.exec(new URL(url).pathname);
  return match ? match[2] : null;
}

function initialsOf(name) {
  const words = String(name).replace(/[^\p{L}\p{N} ]/gu, " ").trim().split(/\s+/);
  if (words.length === 0 || !words[0]) return "?";
  const letters = words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2);
  return letters.toUpperCase();
}

function decorate(board) {
  const owner = ownerOf(board.url);
  return {
    ...board,
    owner,
    initials: initialsOf(board.name || owner || "?"),
    avatar: owner ? `https://github.com/${owner}.png?size=96` : null,
  };
}

class Store {
  constructor(file) {
    this.file = file;
    this.data = { boards: [], activeId: null, bounds: null, theme: "system" };
    this.load();
  }

  load() {
    let raw = {};
    try {
      raw = JSON.parse(fs.readFileSync(this.file, "utf8"));
    } catch {}
    const boards = Array.isArray(raw.boards) ? raw.boards : [];
    this.data.boards = boards
      .filter((board) => normalizeUrl(board?.url))
      .map((board) => ({ id: board.id || Store.newId(), name: board.name || "", url: board.url }));
    this.migrateLegacyHome(raw);
    this.data.bounds = raw.bounds ?? null;
    this.data.theme = THEMES.has(raw.theme) ? raw.theme : "system";
    this.data.activeId = this.has(raw.activeId) ? raw.activeId : this.data.boards[0]?.id ?? null;
  }

  migrateLegacyHome(raw) {
    const legacy = normalizeUrl(raw.lastBoard) ?? normalizeUrl(raw.home);
    if (legacy && !this.data.boards.some((board) => board.url === legacy)) {
      this.data.boards.push({ id: Store.newId(), name: "", url: legacy });
    }
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
    } catch {}
  }

  static newId() {
    return Math.random().toString(36).slice(2, 10);
  }

  has(id) {
    return this.data.boards.some((board) => board.id === id);
  }

  get(id) {
    return this.data.boards.find((board) => board.id === id) ?? null;
  }

  add(url, name) {
    const normalized = normalizeUrl(url);
    if (!normalized) return { error: "URL refusée : seule une adresse de GitHub Project est acceptée." };
    const existing = this.data.boards.find((board) => board.url === normalized);
    if (existing) return { error: "Ce board est déjà dans la liste.", id: existing.id };
    const board = { id: Store.newId(), name: String(name ?? "").trim(), url: normalized };
    this.data.boards.push(board);
    this.data.activeId = board.id;
    this.save();
    return { board };
  }

  rename(id, name) {
    const board = this.get(id);
    if (!board) return;
    board.name = String(name ?? "").trim();
    this.save();
  }

  remove(id) {
    const index = this.data.boards.findIndex((board) => board.id === id);
    if (index === -1) return;
    this.data.boards.splice(index, 1);
    if (this.data.activeId === id) {
      this.data.activeId = this.data.boards[Math.min(index, this.data.boards.length - 1)]?.id ?? null;
    }
    this.save();
  }

  move(id, delta) {
    const index = this.data.boards.findIndex((board) => board.id === id);
    const target = index + delta;
    if (index === -1 || target < 0 || target >= this.data.boards.length) return;
    const [board] = this.data.boards.splice(index, 1);
    this.data.boards.splice(target, 0, board);
    this.save();
  }

  setTheme(theme) {
    if (!THEMES.has(theme)) return;
    this.data.theme = theme;
    this.save();
  }

  activate(id) {
    if (!this.has(id)) return;
    this.data.activeId = id;
    this.save();
  }

  publicState() {
    return {
      boards: this.data.boards.map(decorate),
      activeId: this.data.activeId,
      theme: this.data.theme,
    };
  }
}

module.exports = { Store, normalizeUrl, ownerOf, initialsOf };
