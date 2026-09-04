"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { detectTimeZone } from "@/lib/timezone";

export type TimeZoneInfo = {
  /** IANA zone to format with. `undefined` before the browser zone is known (server render). */
  timeZone: string | undefined;
  /** Where the zone came from: the account setting, the browser, or not yet resolved. */
  source: "account" | "browser" | "unknown";
};

const TimeZoneContext = createContext<TimeZoneInfo>({ timeZone: undefined, source: "unknown" });

/**
 * Makes the viewer's zone available to every client component. The account
 * zone wins when set; otherwise the browser zone is used once mounted, so the
 * server and the first client render agree and nothing mismatches on hydrate.
 */
export function TimeZoneProvider({ timezone, children }: { timezone: string | null; children: React.ReactNode }) {
  const [browserZone, setBrowserZone] = useState<string | null>(null);
  useEffect(() => setBrowserZone(detectTimeZone()), []);

  const value = useMemo<TimeZoneInfo>(() => {
    if (timezone) return { timeZone: timezone, source: "account" };
    if (browserZone) return { timeZone: browserZone, source: "browser" };
    return { timeZone: undefined, source: "unknown" };
  }, [timezone, browserZone]);

  return <TimeZoneContext.Provider value={value}>{children}</TimeZoneContext.Provider>;
}

/** Zone to pass to the formatters. Safe outside a provider (falls back to the browser default). */
export function useTimeZone(): string | undefined {
  return useContext(TimeZoneContext).timeZone;
}

export function useTimeZoneInfo(): TimeZoneInfo {
  return useContext(TimeZoneContext);
}
