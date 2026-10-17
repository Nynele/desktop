import { useEffect, useState } from "react";
import type { WindowState } from "../../../../electron/preload";

export interface WindowStateHookResult {
  isMaximized: boolean;
  isFullScreen: boolean;
  isEdgeToEdge: boolean;
}

export function useWindowState(): WindowStateHookResult {
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    let mounted = true;

    // Browser-only fullscreen fallback
    const checkBrowserFullscreen = () => {
      if (typeof document !== "undefined") {
        const isDomFullscreen = Boolean(
          document.fullscreenElement ||
            (window.matchMedia?.("(display-mode: fullscreen)")?.matches ?? false),
        );
        if (isDomFullscreen && mounted) {
          setIsFullScreen(true);
        }
      }
    };

    if (!window.linerElectron) {
      checkBrowserFullscreen();
      const handleFullscreenChange = () => checkBrowserFullscreen();
      document.addEventListener("fullscreenchange", handleFullscreenChange);
      return () => {
        mounted = false;
        document.removeEventListener("fullscreenchange", handleFullscreenChange);
      };
    }

    // Hydrate initial os window state from electron
    window.linerElectron.isFullScreen?.().then((fs) => {
      if (mounted && typeof fs === "boolean") {
        setIsFullScreen(fs);
      }
    });

    window.linerElectron.isMaximized?.().then((max) => {
      if (mounted && typeof max === "boolean") {
        setIsMaximized(max);
      }
    });

    // Live sync across os fullscreen transitions & maximize toggles
    const unsubscribe = window.linerElectron.onWindowStateChange?.((state: WindowState) => {
      if (mounted && state) {
        setIsFullScreen(Boolean(state.isFullScreen));
        setIsMaximized(Boolean(state.isMaximized));
      }
    });

    // Fallback sync on window resize for compositors (e.g. Wayland)
    const handleResize = () => {
      if (!mounted) return;
      window.linerElectron?.isMaximized?.().then((max) => {
        if (mounted && typeof max === "boolean") setIsMaximized(max);
      });
      window.linerElectron?.isFullScreen?.().then((fs) => {
        if (mounted && typeof fs === "boolean") setIsFullScreen(fs);
      });
    };

    const handleFullscreenChange = () => {
      if (!mounted) return;
      if (document.fullscreenElement) {
        setIsFullScreen(true);
      }
    };

    window.addEventListener("resize", handleResize);
    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      mounted = false;
      unsubscribe?.();
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  return {
    isMaximized,
    isFullScreen,
    isEdgeToEdge: isMaximized || isFullScreen,
  };
}

export default useWindowState;
