"use strict";

const HOSTS = new Set(["github.com", "www.github.com"]);

const BOARD_PATHS = [
  /^\/orgs\/[^/]+\/projects(\/\d+(\/.*)?)?$/,
  /^\/users\/[^/]+\/projects(\/\d+(\/.*)?)?$/,
];

const AUTH_PATHS = [
  /^\/login(\/.*)?$/,
  /^\/logout$/,
  /^\/session$/,
  /^\/sessions(\/.*)?$/,
  /^\/orgs\/[^/]+\/sso(\/.*)?$/,
  /^\/authentication(\/.*)?$/,
];

function classify(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return "blocked";
  }
  if (url.protocol !== "https:" || !HOSTS.has(url.hostname)) return "blocked";

  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (BOARD_PATHS.some((pattern) => pattern.test(path))) return "board";
  if (AUTH_PATHS.some((pattern) => pattern.test(path))) return "auth";
  return "blocked";
}

function isAllowed(rawUrl) {
  return classify(rawUrl) !== "blocked";
}

module.exports = { classify, isAllowed };
