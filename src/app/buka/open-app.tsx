"use client";
import { useEffect } from "react";

/** Leaves the splash for the real start page; the splash stays on screen until that page arrives. */
export function OpenApp() {
  useEffect(() => {
    window.location.replace("/");
  }, []);
  return null;
}
