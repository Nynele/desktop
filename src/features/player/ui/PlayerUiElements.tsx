import { useEffect, useState } from "react";
import { MusicNote } from "@solar-icons/react";
import { AnimatePresence, motion } from "framer-motion";
import { useCoverReady, CoverImage } from "@/features/covers";
import { cn } from "@/shared/lib";
import { usePlayerState } from "../hooks/usePlayerState";
import { VolumePicker } from "./VolumePicker";
import { FullscreenTrackInfo } from "./FullscreenTrackInfo";
import { FullscreenTimeline } from "./FullscreenTimeline";
import { FullscreenTransportControls } from "./FullscreenTransportControls";
import { BASE_COLUMN_WIDTH, fullscreenColumnScale } from "../lib/fullscreenScale";
import { useWindowState } from "@/features/navigation/hooks/useWindowState";

function useFullscreenColumnScale(baseWidth = BASE_COLUMN_WIDTH): number {
  const { isEdgeToEdge } = useWindowState();
  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (!isEdgeToEdge) {
      setScale(1);
      return;
    }
    const update = () =>
      setScale(fullscreenColumnScale(window.innerWidth, window.innerHeight, baseWidth));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [isEdgeToEdge, baseWidth]);

  return scale;
}

interface PlayerUiElementsProps {
  onDuration?: (duration: number) => void;
  onClose?: () => void;
  centered?: boolean;
}

export function PlayerUiElements({
  onClose,
  centered = false,
}: PlayerUiElementsProps) {
  const track = usePlayerState().currentTrack;
  const coverUrl = track?.coverUrl || "";
  const isCoverLoaded = useCoverReady(coverUrl);
  const baseWidth = centered ? Math.round(BASE_COLUMN_WIDTH * 1.1) : BASE_COLUMN_WIDTH;
  const scale = useFullscreenColumnScale(baseWidth);
  const scaled = scale > 1;

  return (
    <div
      className={cn(
        "flex flex-col items-stretch transition-all duration-300",
        centered ? "min-w-[260px]" : "min-w-[240px]",
        !scaled &&
          (centered
            ? "w-[min(380px,36vw,calc(100vh-320px))]"
            : "w-[min(340px,32vw,calc(100vh-340px))]"),
      )}
      style={scaled ? { width: Math.round(baseWidth * scale) } : undefined}
    >
      <div
        className={cn(
          "relative aspect-square w-full shrink-0 overflow-hidden rounded-xl bg-black/20",
          coverUrl && !isCoverLoaded && "animate-pulse",
        )}
      >
        <AnimatePresence initial={false}>
          <motion.div
            key={track?.id || coverUrl || "empty"}
            initial={{ opacity: 0, filter: "blur(8px)" }}
            animate={{ opacity: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, filter: "blur(8px)" }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="absolute inset-0"
          >
            {coverUrl ? (
              <CoverImage
                key={coverUrl}
                src={coverUrl}
                alt={track?.title || ""}
                fill
                sizes={`${Math.round(baseWidth * scale)}px`}
                priority
                unoptimized
                className="rounded-xl object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-white/5 text-white/40">
                <MusicNote size={64} />
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mt-[24px]">
        <FullscreenTrackInfo onClose={onClose} />
      </div>

      <div className="mt-[22px]">
        <FullscreenTimeline />
      </div>

      <div className="mt-[20px]">
        <FullscreenTransportControls />
      </div>

      <div className="mt-[22px] flex justify-center">
        <VolumePicker
          className="w-[60%]"
          size="sm"
          iconSize={22}
          iconClassName="text-white opacity-80 hover:opacity-100"
        />
      </div>
    </div>
  );
}

export default PlayerUiElements;
