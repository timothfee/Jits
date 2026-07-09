import { useSyncExternalStore } from "react";

function getHash(): string {
  if (typeof window === "undefined") return "/";
  const hash = window.location.hash.slice(1);
  return hash || "/";
}

function subscribe(callback: () => void) {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}

export function useHashLocation(): [string, (to: string) => void] {
  const fullHash = useSyncExternalStore(subscribe, getHash);
  // Strip query string before handing path to wouter's router so that
  // /#/?techniqueCategoryId=1 still matches the "/" route correctly.
  const path = fullHash.split("?")[0] || "/";

  const navigate = (to: string) => {
    window.location.hash = to;
  };

  return [path, navigate];
}
