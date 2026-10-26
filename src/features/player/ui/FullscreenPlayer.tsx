import { useCallback, useEffect, createElement, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { shouldReleaseTopPin, startsPinnedToTop } from "./lyricsTopPin";
import { usePlayerState } from "../hooks/usePlayerState";
import { playerEngine } from "../engine/playerEngine";
import {
  useLyricsStore,
  LyricsProviderIsland,
  braccatoThemeCss,
} from "@/features/lyrics";
import {
  useShortcutsStore,
  matchesShortcut,
  formatAcceleratorForDisplay,
} from "@/features/shortcuts";
import { AnimatePresence, motion } from "framer-motion";
import { PlayerUiElements } from "./PlayerUiElements";
import WindowControls from "@/features/navigation/ui/WindowControls";
import { DownLine, AlignLeftLine, TimeLine } from "@mingcute/react";
import { cn } from "@/shared/lib";
import { preloadCoverArt, useCoverSrc } from "@/features/covers";
import "@braccato/core/element";
import "@braccato/core/styles/variables.css";
import "@braccato/core/styles/lyrics.css";
import "@braccato/core/styles/instrumental.css";
import KawarpWrapper from "./KawarpWrapper";
import { useTranslation } from "@/languages";

const BRACCATO_TAG = "braccato-lyrics";
const KAWARP_FADE_IN_MS = 600;

interface BraccatoLyricsViewProps {
  lyrics: any[];
}

function BraccatoLyricsView({ lyrics }: BraccatoLyricsViewProps) {
  const player = usePlayerState();
  const elementRef = useRef<any>(null);
  const latestLyricsRef = useRef(lyrics);
  const freeScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastWheelTimeRef = useRef(0);
  const isInFreeSearchRef = useRef(false);
  const waitingForAudioAfterClickRef = useRef(false);
  const pinnedToTopRef = useRef(startsPinnedToTop(player.status, player.positionMs));

  const scrollToActiveLine = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      const el = elementRef.current;
      if (!el) return false;

      const activeEls = (el as HTMLElement).querySelectorAll<HTMLElement>(
        ".blyrics--active",
      );
      if (activeEls.length === 0) return false;
      const activeEl = activeEls[activeEls.length - 1];

      const containerRect = el.getBoundingClientRect();
      const elRect = activeEl.getBoundingClientRect();
      if (containerRect.height === 0 || elRect.height === 0) return false;

      const offset = elRect.top - containerRect.top + el.scrollTop;
      const targetScrollTop =
        offset - containerRect.height / 2 + elRect.height / 2;

      if (behavior === "auto") {
        el.scrollTop = Math.max(0, targetScrollTop);
      } else {
        el.scrollTo({
          top: Math.max(0, targetScrollTop),
          behavior,
        });
      }
      return true;
    },
    [],
  );

  const returnToFollowingMode = useCallback(() => {
    if (freeScrollTimerRef.current) {
      clearTimeout(freeScrollTimerRef.current);
      freeScrollTimerRef.current = null;
    }
    isInFreeSearchRef.current = false;
    lastWheelTimeRef.current = 0;

    const el = elementRef.current;
    if (!el) return;

    if (el.renderer) {
      el.renderer.resumeAutoscroll?.();
      const engine = (el.renderer as any)?.engine;
      if (engine) {
        engine.scrollResumeTime = 0;
        engine.nextScrollAllowedTime = 0;
        engine.queuedScroll = true;
      }
    }

    scrollToActiveLine("smooth");
  }, [scrollToActiveLine]);

  const returnToFollowingModeRef = useRef(returnToFollowingMode);
  returnToFollowingModeRef.current = returnToFollowingMode;

  const handleUserInteraction = useCallback(() => {
    pinnedToTopRef.current = false;
    lastWheelTimeRef.current = Date.now();
    isInFreeSearchRef.current = true;

    const el = elementRef.current;
    if (el?.renderer) {
      el.renderer.noteUserScroll?.();
      el.renderer.noteUserScroll?.();
      el.renderer.noteUserScroll?.();
    }

    if (freeScrollTimerRef.current) {
      clearTimeout(freeScrollTimerRef.current);
      freeScrollTimerRef.current = null;
    }

    freeScrollTimerRef.current = setTimeout(() => {
      const elapsed = Date.now() - lastWheelTimeRef.current;
      if (elapsed < 5900) return;

      returnToFollowingMode();
    }, 6000);
  }, [returnToFollowingMode]);

  const handleUserInteractionRef = useRef(handleUserInteraction);
  handleUserInteractionRef.current = handleUserInteraction;

  const setElement = useCallback(
    (el: any) => {
      elementRef.current = el;
      if (!el) return;
      el.theme = braccatoThemeCss;
      el.lyrics = latestLyricsRef.current;
      el.source = "#liner-audio";

      const handleBraccatoLineClick = (e: Event) => {
        const isAudioLoading = playerEngine.getSnapshot().status === "loading";
        if (isAudioLoading) {
          waitingForAudioAfterClickRef.current = true;
          isInFreeSearchRef.current = true;
          if (freeScrollTimerRef.current) {
            clearTimeout(freeScrollTimerRef.current);
            freeScrollTimerRef.current = null;
          }
          if (el.renderer) {
            el.renderer.noteUserScroll?.();
            el.renderer.noteUserScroll?.();
            el.renderer.noteUserScroll?.();
          }
        } else {
          returnToFollowingModeRef.current();
        }

        const detail = (e as CustomEvent).detail as
          { timeS?: number; time?: number } | undefined;
        const timeMs =
          detail?.timeS !== undefined
            ? Math.round(detail.timeS * 1000)
            : detail?.time !== undefined
              ? detail.time > 1000
                ? Math.round(detail.time)
                : Math.round(detail.time * 1000)
              : null;
        if (timeMs !== null) {
          playerEngine.seek(timeMs, true);
        }
      };

      const onUserScroll = () => {
        handleUserInteractionRef.current();
      };

      const onLyricsLoaded = () => {
        if (waitingForAudioAfterClickRef.current) return;
        requestAnimationFrame(() => {
          if (!waitingForAudioAfterClickRef.current) {
            scrollToActiveLine("auto");
          }
        });
      };

      let syncRafId: number;
      let lastReportedIndex = -1;

      const checkActiveLine = () => {
        const audioEl = document.getElementById(
          "liner-audio",
        ) as HTMLAudioElement | null;
        if (audioEl && !Number.isNaN(audioEl.currentTime)) {
          const currentMs = audioEl.currentTime * 1000;
          const lines = useLyricsStore.getState().syncedLines;
          let idx = -1;
          for (let i = 0; i < lines.length; i++) {
            const prevEnd =
              i > 0 && lines[i - 1].words && lines[i - 1].words!.length > 0
                ? lines[i - 1].words![lines[i - 1].words!.length - 1].endMs
                : i > 0
                  ? lines[i - 1].timeMs
                  : 0;
            const targetEarlyMs = Math.max(prevEnd, lines[i].timeMs - 600);
            if (targetEarlyMs <= currentMs) {
              idx = i;
            } else {
              break;
            }
          }
          if (idx !== lastReportedIndex) {
            lastReportedIndex = idx;
            useLyricsStore.getState().setActiveLineIndex(idx >= 0 ? idx : null);
          }
        }
        syncRafId = requestAnimationFrame(checkActiveLine);
      };

      syncRafId = requestAnimationFrame(checkActiveLine);

      el.addEventListener("braccato:lyrics-loaded", onLyricsLoaded);
      el.addEventListener("braccato:line-click", handleBraccatoLineClick);
      el.addEventListener("wheel", onUserScroll, {
        passive: true,
        capture: true,
      });
      el.addEventListener("touchmove", onUserScroll, {
        passive: true,
        capture: true,
      });

      return () => {
        cancelAnimationFrame(syncRafId);
        useLyricsStore.getState().setActiveLineIndex(null);
        el.removeEventListener("braccato:lyrics-loaded", onLyricsLoaded);
        el.removeEventListener("braccato:line-click", handleBraccatoLineClick);
        el.removeEventListener("wheel", onUserScroll, { capture: true });
        el.removeEventListener("touchmove", onUserScroll, { capture: true });
        if (freeScrollTimerRef.current) {
          clearTimeout(freeScrollTimerRef.current);
          freeScrollTimerRef.current = null;
        }
        elementRef.current = null;
      };
    },
    [scrollToActiveLine],
  );

  useEffect(() => {
    latestLyricsRef.current = lyrics;
    const element = elementRef.current;
    if (element) element.lyrics = lyrics;
  }, [lyrics]);

  useEffect(() => {
    if (
      (player.status === "playing" || player.status === "paused") &&
      waitingForAudioAfterClickRef.current
    ) {
      waitingForAudioAfterClickRef.current = false;
      returnToFollowingMode();
    }
  }, [player.status, returnToFollowingMode]);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;

    const checkAndScroll = () => {
      if (cancelled || waitingForAudioAfterClickRef.current || pinnedToTopRef.current) return;
      attempts++;
      const success = scrollToActiveLine("auto");
      if (!success && attempts < 30) {
        requestAnimationFrame(checkAndScroll);
      }
    };

    const rafId = requestAnimationFrame(checkAndScroll);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [lyrics, scrollToActiveLine]);

  useEffect(() => {
    if (!pinnedToTopRef.current) return;
    const startedAt = performance.now();
    let rafId = 0;
    const holdTop = () => {
      const el = elementRef.current as HTMLElement & { renderer?: { noteUserScroll?: () => void; resumeAutoscroll?: () => void } };
      if (!pinnedToTopRef.current) return;
      const audio = document.getElementById("liner-audio") as HTMLAudioElement | null;
      const release = shouldReleaseTopPin({
        status: playerEngine.getSnapshot().status,
        audioPaused: !audio || audio.paused,
        audioTimeMs: (audio?.currentTime ?? 0) * 1000,
        pinnedForMs: performance.now() - startedAt,
      });
      if (release) {
        pinnedToTopRef.current = false;
        el?.renderer?.resumeAutoscroll?.();
        return;
      }
      if (el) {
        el.renderer?.noteUserScroll?.();
        if (el.scrollTop !== 0) el.scrollTop = 0;
      }
      rafId = requestAnimationFrame(holdTop);
    };
    rafId = requestAnimationFrame(holdTop);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <div className="relative flex flex-col flex-1 w-full h-full min-h-0">
      {createElement(BRACCATO_TAG, {
        ref: setElement,
        source: "#liner-audio",
        className: "block flex-1 w-full h-full px-6",
        style: {
          overflowY: "auto",
          overflowX: "hidden",
          position: "relative",
          scrollbarWidth: "none",
        },
      })}
    </div>
  );
}

export interface FullscreenPlayerProps {
  effectsReady?: boolean;
  onClose: () => void;
}

export function FullscreenPlayer({
  effectsReady = true,
  onClose,
}: FullscreenPlayerProps) {
  const { t } = useTranslation();
  const player = usePlayerState();
  const coverUrl = player.currentTrack?.coverUrl;
  const kawarpSrc = useCoverSrc(coverUrl);

  useEffect(() => {
    if (!player.currentTrack) {
      onClose();
    }
  }, [player.currentTrack, onClose]);

  const {
    braccatoLyrics,
    lyricsLoading,
    lyricsError,
    plainLyrics,
    availableProviders,
    currentLyricsTrackId,
    showLyrics,
    toggleLyrics,
    showOptions,
    toggleOptions,
    setShowOptions,
  } = useLyricsStore();

  const toggleLyricsShortcut = useShortcutsStore(
    (s) => s.mainApp.toggleLyrics,
  );
  const toggleLyricsOptionsShortcut = useShortcutsStore(
    (s) => s.mainApp.toggleLyricsOptions,
  );

  const onError = useCallback((err: Error) => {
    console.error("kawarp load error:", err);
  }, []);

  const [kawarpShown, setKawarpShown] = useState(false);
  const onKawarpLoad = useCallback(() => {
    setTimeout(() => setKawarpShown(true), KAWARP_FADE_IN_MS);
  }, []);

  const nextCoverUrl = player.queue[player.currentIndex + 1]?.coverUrl;
  useEffect(() => {
    void preloadCoverArt(coverUrl);
    void preloadCoverArt(nextCoverUrl);
  }, [coverUrl, nextCoverUrl]);

  const currentTrackId = player.currentTrack?.id;
  const isMatchingTrack = Boolean(
    currentTrackId && currentLyricsTrackId === currentTrackId,
  );
  const hasLyrics = isMatchingTrack && braccatoLyrics.length > 0;
  const showProviderIsland = hasLyrics && availableProviders.length > 0;
  const isInstrumental =
    isMatchingTrack &&
    !lyricsLoading &&
    !hasLyrics &&
    !lyricsError &&
    plainLyrics === "[INSTRUMENTAL]";

  const [forceShowEmptyLyrics, setForceShowEmptyLyrics] = useState(false);

  useEffect(() => {
    setForceShowEmptyLyrics(false);
  }, [currentTrackId]);

  const effectiveShowLyrics = hasLyrics
    ? showLyrics
    : forceShowEmptyLyrics;

  const [showTopControls, setShowTopControls] = useState(true);
  const isHoveringTopRef = useRef(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetHideTimer = useCallback((delay = 2500) => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    hideTimerRef.current = setTimeout(() => {
      if (!isHoveringTopRef.current) {
        setShowTopControls(false);
      }
    }, delay);
  }, []);

  const handleToggleLyrics = useCallback(() => {
    if (hasLyrics) {
      toggleLyrics();
    } else {
      setForceShowEmptyLyrics((v) => !v);
    }
    setShowTopControls(true);
    resetHideTimer(2500);
  }, [hasLyrics, toggleLyrics, resetHideTimer]);

  const handleToggleOptions = useCallback(() => {
    toggleOptions();
    setShowTopControls(true);
    resetHideTimer(2500);
  }, [toggleOptions, resetHideTimer]);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      const isInTopZone = e.clientY <= 90;
      const isMovingTowardsTop = e.clientY <= 150 && e.movementY < -2;

      if (isInTopZone || isMovingTowardsTop) {
        setShowTopControls(true);
        resetHideTimer(2500);
      } else {
        if (!isHoveringTopRef.current) {
          resetHideTimer(600);
        }
      }
    },
    [resetHideTimer],
  );

  useEffect(() => {
    resetHideTimer(3000);
    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, [handleMouseMove, resetHideTimer]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable
      ) {
        return;
      }
      if (toggleLyricsShortcut && matchesShortcut(e, toggleLyricsShortcut)) {
        e.preventDefault();
        handleToggleLyrics();
      } else if (
        toggleLyricsOptionsShortcut &&
        hasLyrics &&
        matchesShortcut(e, toggleLyricsOptionsShortcut)
      ) {
        e.preventDefault();
        handleToggleOptions();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    handleToggleLyrics,
    handleToggleOptions,
    hasLyrics,
    toggleLyricsShortcut,
    toggleLyricsOptionsShortcut,
  ]);

  return (
    <div
      data-theme="dark"
      className="dark relative h-full w-full overflow-hidden bg-black text-white"
    >
      <div className="absolute inset-0 overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{ backgroundColor: "var(--color-bg-primary)" }}
        />
        {(kawarpSrc || coverUrl) && !kawarpShown && (
          <div
            className="absolute inset-0 bg-cover bg-center pointer-events-none"
            style={{
              backgroundImage: `url(${kawarpSrc || coverUrl})`,
              filter: "blur(64px) saturate(1.3)",
              transform: "scale(1.3)",
            }}
          />
        )}
        {effectsReady ? (
          <KawarpWrapper src={kawarpSrc} onLoad={onKawarpLoad} onError={onError} />
        ) : null}
      </div>

      <div className="absolute inset-0 z-[1] bg-black/40" />

      <div className="absolute inset-0 z-10 overflow-hidden">
        <motion.div
          animate={{
            x: effectiveShowLyrics ? "-25%" : "0%",
          }}
          transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-0 flex flex-col items-center justify-center gap-5 pointer-events-none z-10"
        >
          <div className="pointer-events-auto">
            <PlayerUiElements onClose={onClose} centered={!effectiveShowLyrics} />
          </div>
        </motion.div>

        <AnimatePresence>
          {effectiveShowLyrics && (
            <motion.div
              key="fullscreen-lyrics-column"
              initial={{ opacity: 0, x: "100%" }}
              animate={{ opacity: 1, x: "0%" }}
              exit={{
                opacity: 0,
                x: "100%",
                transition: { duration: 0.32, ease: [0.32, 0.72, 0, 1] },
              }}
              transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
              className="absolute right-0 top-0 bottom-0 w-1/2 h-full min-h-0 pl-2 pr-6 flex flex-col pointer-events-auto z-20"
            >
              <AnimatePresence>
                {showProviderIsland && showOptions && (
                  <motion.div
                    key="lyrics-provider-island"
                    initial={{ opacity: 0, y: -40 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{
                      opacity: 0,
                      y: -40,
                      transition: { duration: 0.22, ease: [0.32, 0.72, 0, 1] },
                    }}
                    transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                    onMouseEnter={() => {
                      isHoveringTopRef.current = true;
                      setShowTopControls(true);
                    }}
                    onMouseLeave={() => {
                      isHoveringTopRef.current = false;
                      resetHideTimer(800);
                    }}
                    className={cn(
                      "absolute top-[6px] left-1/2 -translate-x-1/2 z-30 flex justify-center transition-opacity duration-300 ease-out",
                      showTopControls
                        ? "opacity-100 pointer-events-auto"
                        : "opacity-0 pointer-events-none",
                    )}
                  >
                    <LyricsProviderIsland onClose={() => setShowOptions(false)} />
                  </motion.div>
                )}
              </AnimatePresence>

              <div
                className="flex-1 min-h-0 relative w-full h-full"
                style={{
                  display: hasLyrics ? "flex" : "none",
                }}
              >
                <AnimatePresence initial={false}>
                  {hasLyrics && (
                    <motion.div
                      key={`lyrics-${currentTrackId}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, pointerEvents: "none" }}
                      transition={{ duration: 0.22, ease: "easeInOut" }}
                      className="absolute inset-0 flex flex-col"
                    >
                      <BraccatoLyricsView lyrics={braccatoLyrics} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <AnimatePresence mode="wait">
                {!hasLyrics && lyricsLoading ? (
                  <motion.div
                    key="skeleton"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="absolute inset-0 flex flex-col items-center justify-center"
                  >
                    <div className="flex flex-col gap-5 w-full max-w-[500px]">
                      {[80, 65, 45, 70, 55, 85, 60, 50, 75, 40, 65, 55].map(
                        (w, i) => (
                          <div
                            key={i}
                            className="h-5 rounded animate-pulse bg-border-alpha-14"
                            style={{ width: `${w}%` }}
                          />
                        ),
                      )}
                    </div>
                  </motion.div>
                ) : !hasLyrics && isInstrumental ? (
                  <motion.div
                    key="instrumental"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="absolute inset-0 flex items-center justify-center text-text-tertiary text-lg"
                  >
                    <span>{t("player.instrumental")}</span>
                  </motion.div>
                ) : !hasLyrics ? (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="absolute inset-0 flex items-center justify-center text-text-tertiary"
                  >
                    <div className="flex flex-col items-center justify-center gap-3 opacity-80">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="48"
                        height="48"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="opacity-40"
                      >
                        <path d="M9 18V5l12-2v13"></path>
                        <circle cx="6" cy="18" r="3"></circle>
                        <circle cx="18" cy="16" r="3"></circle>
                        <line x1="2" y1="2" x2="22" y2="22"></line>
                      </svg>
                      <span
                        className="text-[15px] font-[400] max-w-[250px] text-center"
                        style={{ lineHeight: "1.4" }}
                      >
                        {lyricsError || t("player.no_lyrics_found")}
                      </span>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div
        onMouseEnter={() => {
          isHoveringTopRef.current = true;
          setShowTopControls(true);
        }}
        onMouseLeave={() => {
          isHoveringTopRef.current = false;
          resetHideTimer(800);
        }}
        className={cn(
          "absolute top-[6px] left-[6px] z-30 select-none transition-opacity duration-300 ease-out",
          showTopControls
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none",
        )}
        data-no-window-drag
      >
        <div className="inline-flex items-center h-[32px] rounded-lg bg-black/50 backdrop-blur-xl border border-white/[0.06] px-[3px] gap-[2px]">
          <button
            type="button"
            aria-label={t("player.close_fullscreen")}
            title={t("player.close_fullscreen")}
            onClick={onClose}
            className="w-[26px] h-[26px] min-w-[26px] rounded-md flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 active:scale-95 transition-colors duration-150 cursor-pointer border-none bg-transparent"
          >
            <DownLine size={16} />
          </button>

          <button
            type="button"
            onClick={handleToggleLyrics}
            aria-label={effectiveShowLyrics ? t("player.hide_lyrics") : t("player.show_lyrics")}
            title={`${effectiveShowLyrics ? t("player.hide_lyrics") : t("player.show_lyrics")}${toggleLyricsShortcut ? ` (${formatAcceleratorForDisplay(toggleLyricsShortcut)})` : ""}`}
            className={cn(
              "h-[26px] px-[8px] rounded-md flex items-center gap-[6px] text-[12px] font-[500] border-none cursor-pointer transition-colors duration-150 active:scale-95",
              effectiveShowLyrics
                ? "bg-white/20 text-white hover:bg-white/25 shadow-sm"
                : "bg-transparent text-white/70 hover:text-white hover:bg-white/10",
            )}
          >
            <AlignLeftLine size={14} />
            <span className="hidden sm:inline">
              {t("player.lyrics")}
            </span>
          </button>

          <AnimatePresence initial={false}>
            {effectiveShowLyrics && hasLyrics && (
              <motion.button
                key="lyrics-options-toggle-btn"
                initial={{ opacity: 0, width: 0, scale: 0.8 }}
                animate={{ opacity: 1, width: 26, scale: 1 }}
                exit={{ opacity: 0, width: 0, scale: 0.8 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                type="button"
                onClick={handleToggleOptions}
                aria-label={showOptions ? t("player.hide_lyrics_options") : t("player.show_lyrics_options")}
                title={`${showOptions ? t("player.hide_lyrics_options") : t("player.show_lyrics_options")}${toggleLyricsOptionsShortcut ? ` (${formatAcceleratorForDisplay(toggleLyricsOptionsShortcut)})` : ""}`}
                className={cn(
                  "h-[26px] min-h-[26px] rounded-md flex items-center justify-center p-0 border-none cursor-pointer overflow-hidden transition-colors duration-150 active:scale-95 shrink-0",
                  showOptions
                    ? "bg-white/20 text-white hover:bg-white/25 shadow-sm"
                    : "bg-transparent text-white/70 hover:text-white hover:bg-white/10",
                )}
              >
                <TimeLine size={13} className="shrink-0" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div
        onMouseEnter={() => {
          isHoveringTopRef.current = true;
          setShowTopControls(true);
        }}
        onMouseLeave={() => {
          isHoveringTopRef.current = false;
          resetHideTimer(800);
        }}
        className={cn(
          "absolute top-[6px] right-[6px] z-30 select-none transition-opacity duration-300 ease-out",
          showTopControls
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none",
        )}
      >
        <WindowControls isFullscreen embedded />
      </div>
    </div>
  );
}

export default function PlayerPage() {
  const navigate = useNavigate();
  return <FullscreenPlayer onClose={() => navigate(-1)} />;
}
