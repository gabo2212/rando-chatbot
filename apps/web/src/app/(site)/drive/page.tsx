"use client";

import { useEffect, useState } from "react";

/**
 * iOS Safari often blocks DeviceOrientation / gyro inside iframes.
 * On touch devices, break out to the game as a top-level page so motion works.
 */
function isTouchPlayDevice() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(pointer: coarse)").matches ||
    window.matchMedia("(hover: none) and (max-width: 1024px)").matches ||
    (navigator.maxTouchPoints > 0 &&
      Math.min(screen.width, screen.height) <= 920)
  );
}

export default function DrivePage() {
  const [useIframe, setUseIframe] = useState(true);

  useEffect(() => {
    if (isTouchPlayDevice()) {
      window.location.replace("/games/procedural-drive.html");
      setUseIframe(false);
    }
  }, []);

  if (!useIframe) {
    return <div className="h-full w-full bg-black" />;
  }

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden bg-black touch-none">
      <iframe
        src="/games/procedural-drive.html"
        title="Endless Drive"
        allow="autoplay; fullscreen; gamepad; accelerometer; gyroscope; magnetometer"
        allowFullScreen
        className="absolute inset-0 h-full w-full border-0"
      />
    </div>
  );
}
