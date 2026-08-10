"use client";

import { useEffect, useRef } from "react";
import { track } from "@vercel/analytics";
import type { FunnelEvent } from "@/lib/funnel";

/// Fires one funnel event when a server-rendered page is first seen.
///
/// A ref rather than an empty dependency array on its own: React runs effects
/// twice in development's strict mode, and a step of a funnel that counts
/// double in dev and single in production is worse than no step at all —
/// you find out which one you were looking at long after you've drawn a
/// conclusion from it.
export default function TrackView({ event }: { event: FunnelEvent }) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    track(event);
  }, [event]);
  return null;
}
