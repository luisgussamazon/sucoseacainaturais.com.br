"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
// Signals carry no user data; hidden tabs never poll and no content is stored offline.
export function CommunityLiveUpdates() {
  const router = useRouter();
  useEffect(() => {
    let last = 0;
    const refresh = () => {
      if (
        window.location.pathname !== "/" ||
        document.visibilityState !== "visible" ||
        Date.now() - last < 750
      )
        return;
      last = Date.now();
      router.refresh();
    };
    let channel: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== "undefined")
        channel = new BroadcastChannel("ssd-community-updates");
    } catch {
      /* Timer remains available. */
    }
    if (channel) channel.onmessage = refresh;
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    window.addEventListener("community:updated", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      channel?.close();
      window.removeEventListener("focus", refresh);
      window.removeEventListener("community:updated", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router]);
  return null;
}
