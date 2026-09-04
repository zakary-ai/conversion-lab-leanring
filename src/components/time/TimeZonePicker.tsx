"use client";

import { useEffect, useMemo, useState } from "react";
import { listTimeZones, wallClockIn, zoneCity, zoneOffsetLabel, zoneRegion } from "@/lib/timezone";

/**
 * Grouped IANA zone select with a live "it's 3:42 PM there" preview so people
 * can confirm they picked the right one. Falls back to a free-text input when
 * the runtime can't enumerate zones.
 */
export function TimeZonePicker({
  id = "timezone",
  value,
  onChange,
  showPreview = true,
  disabled,
}: {
  id?: string;
  value: string;
  onChange: (tz: string) => void;
  showPreview?: boolean;
  disabled?: boolean;
}) {
  const [zones, setZones] = useState<string[]>([]);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setZones(listTimeZones());
    setNow(new Date());
  }, []);

  useEffect(() => {
    if (!showPreview) return;
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, [showPreview]);

  const groups = useMemo(() => {
    const all = new Set(zones);
    if (value) all.add(value);
    const byRegion = new Map<string, string[]>();
    for (const z of Array.from(all).sort()) {
      const region = zoneRegion(z);
      const list = byRegion.get(region) ?? [];
      list.push(z);
      byRegion.set(region, list);
    }
    // Keep the common continents first, "Other"/"Etc" last.
    const order = ["America", "Europe", "Asia", "Africa", "Australia", "Pacific", "Atlantic", "Indian", "Antarctica", "Arctic"];
    return Array.from(byRegion.entries()).sort(([a], [b]) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
    });
  }, [zones, value]);

  const clock = showPreview && value && now ? wallClockIn(value, now) : null;
  const offset = value && now ? zoneOffsetLabel(value, now) : "";

  return (
    <div>
      {zones.length > 0 ? (
        <select id={id} className="input" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
          {!value && <option value="">Select a time zone…</option>}
          {groups.map(([region, list]) => (
            <optgroup key={region} label={region}>
              {list.map((z) => (
                <option key={z} value={z}>
                  {region === "Other" ? z : zoneCity(z)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      ) : (
        <input
          id={id}
          className="input"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          placeholder="America/New_York"
        />
      )}
      {clock && (
        <p className="text-xs text-ink-dim mt-1.5" aria-live="polite">
          Right now it&apos;s <span className="text-ink font-medium">{clock.time}</span> on {clock.weekday} in{" "}
          {zoneCity(value)}
          {offset ? ` (${offset})` : ""}.
        </p>
      )}
    </div>
  );
}
