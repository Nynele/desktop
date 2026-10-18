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
    let pushSeq = 0;

    // Browser-only fullscreen fallback
    const checkBrowserFullscreen = () => {
      if (typeof document !== "undefined" && mounted) {
        const isDomFullscreen = Boolean(
          document.fullscreenElement ||
            (window.matchMedia?.("(display-mode: fullscreen)")?.matches ?? false),
        );
        setIsFullScreen(isDomFullscreen);
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
    const initialQuerySeq = pushSeq;
    window.linerElectron.isFullScreen?.()
      .then((fs) => {
        if (mounted && pushSeq === initialQuerySeq && typeof fs === "boolean") {
          setIsFullScreen(fs);
        }
      })
      .catch(() => {});

    window.linerElectron.isMaximized?.()
      .then((max) => {
        if (mounted && pushSeq === initialQuerySeq && typeof max === "boolean") {
          setIsMaximized(max);
        }
      })
      .catch(() => {});

    // Live sync across os fullscreen transitions & maximize toggles
    const unsubscribe = window.linerElectron.onWindowStateChange?.((state: WindowState) => {
      if (mounted && state) {
        pushSeq++;
        setIsFullScreen(Boolean(state.isFullScreen));
        setIsMaximized(Boolean(state.isMaximized));
      }
    });

    // Fallback sync on window resize for compositors (e.g. Wayland)
    const handleResize = () => {
      if (!mounted) return;
      const resizeSeq = pushSeq;
      window.linerElectron?.isMaximized?.()
        .then((max) => {
          if (mounted && pushSeq === resizeSeq && typeof max === "boolean") {
            setIsMaximized(max);
          }
        })
        .catch(() => {});
      window.linerElectron?.isFullScreen?.()
        .then((fs) => {
          if (mounted && pushSeq === resizeSeq && typeof fs === "boolean") {
            setIsFullScreen(fs);
          }
        })
        .catch(() => {});
    };

    const handleFullscreenChange = () => {
      if (!mounted) return;
      if (document.fullscreenElement) {
        setIsFullScreen(true);
      } else {
        const querySeq = pushSeq;
        window.linerElectron?.isFullScreen?.()
          .then((fs) => {
            if (mounted && pushSeq === querySeq && typeof fs === "boolean") {
              setIsFullScreen(fs);
            }
          })
          .catch(() => {});
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
