import { useEffect, useCallback } from "react";
import { useLocation, useNavigate, useNavigationType } from "react-router-dom";

// One back behavior for the whole app: go to the screen the person was on
// before this one. Browser history alone can't be trusted for that - it can
// hold the Sign in page (left there after signing in, so "back" looked like
// being signed out), Google's sign-in pages, or nothing at all when a link
// was opened fresh. So this keeps its own list of the screens visited in
// this tab and only steps back when the previous one is a real app screen.
// Otherwise it goes to the page's sensible parent (the fallback).

// Screens back should never land on.
const SKIP = [/^\/login\b/, /^\/register\b/, /^\/forgot-password\b/, /^\/reset-password\b/, /\/callback\b/];
const skippable = (path) => SKIP.some((re) => re.test(path || ""));

const STORE_KEY = "showpilot_nav_stack";
let stack = []; // [{ key, path }]
let index = -1;

function load() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORE_KEY) || "null");
    if (saved && Array.isArray(saved.stack)) { stack = saved.stack; index = saved.index; }
  } catch {}
}
function save() {
  try { sessionStorage.setItem(STORE_KEY, JSON.stringify({ stack: stack.slice(-50), index: Math.min(index, 49) })); } catch {}
}
load();

function record(location, type) {
  const entry = { key: location.key, path: location.pathname + location.search };
  if (type === "POP") {
    const at = stack.findIndex((e) => e.key === entry.key);
    if (at >= 0) index = at;
    else { stack = [entry]; index = 0; } // a reload or a jump we never saw
  } else if (type === "REPLACE" && index >= 0) {
    stack[index] = entry;
  } else {
    stack = stack.slice(0, index + 1);
    stack.push(entry);
    index = stack.length - 1;
  }
  if (stack.length > 50) { index -= stack.length - 50; stack = stack.slice(-50); }
  save();
}

// Mount once inside the Router.
export function NavTracker() {
  const location = useLocation();
  const type = useNavigationType();
  useEffect(() => { record(location, type); }, [location.key]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

// The previous app screen in this tab, if there is one worth going back to.
export function previousScreen() {
  const prev = index > 0 ? stack[index - 1] : null;
  return prev && !skippable(prev.path) ? prev.path : null;
}

// const goBack = useGoBack("/"); onClick={() => goBack()}
// `fallback` is where back goes when there's no previous app screen.
export function useGoBack(fallback = "/") {
  const navigate = useNavigate();
  return useCallback((override) => {
    const to = typeof override === "string" ? override : fallback;
    if (previousScreen() && (window.history.state?.idx ?? 0) > 0) navigate(-1);
    else navigate(to || "/", { replace: true });
  }, [navigate, fallback]);
}
