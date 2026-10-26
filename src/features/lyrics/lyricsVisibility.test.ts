import { describe, it, expect, beforeEach } from "vitest";
import { useLyricsStore } from "./store/lyricsStore";

describe("lyrics visibility and options toggle state", () => {
  beforeEach(() => {
    useLyricsStore.setState({
      showLyrics: true,
      showOptions: true,
      currentLyricsTrackId: "track_test_1",
      offsetMs: 200,
    });
  });

  it("defaults showLyrics and showOptions to true", () => {
    const state = useLyricsStore.getState();
    expect(state.showLyrics).toBe(true);
    expect(state.showOptions).toBe(true);
  });

  it("toggles showLyrics state correctly", () => {
    const { toggleLyrics } = useLyricsStore.getState();

    toggleLyrics();
    expect(useLyricsStore.getState().showLyrics).toBe(false);

    toggleLyrics();
    expect(useLyricsStore.getState().showLyrics).toBe(true);
  });

  it("sets showLyrics explicitly", () => {
    const { setShowLyrics } = useLyricsStore.getState();

    setShowLyrics(false);
    expect(useLyricsStore.getState().showLyrics).toBe(false);

    setShowLyrics(true);
    expect(useLyricsStore.getState().showLyrics).toBe(true);
  });

  it("toggles showOptions state correctly", () => {
    const { toggleOptions } = useLyricsStore.getState();

    toggleOptions();
    expect(useLyricsStore.getState().showOptions).toBe(false);

    toggleOptions();
    expect(useLyricsStore.getState().showOptions).toBe(true);
  });

  it("sets showOptions explicitly", () => {
    const { setShowOptions } = useLyricsStore.getState();

    setShowOptions(false);
    expect(useLyricsStore.getState().showOptions).toBe(false);

    setShowOptions(true);
    expect(useLyricsStore.getState().showOptions).toBe(true);
  });

  it("preserves showLyrics and showOptions across song reset()", () => {
    useLyricsStore.getState().setShowLyrics(false);
    useLyricsStore.getState().setShowOptions(false);

    useLyricsStore.getState().reset();

    const state = useLyricsStore.getState();
    expect(state.showLyrics).toBe(false);
    expect(state.showOptions).toBe(false);
    expect(state.currentLyricsTrackId).toBeNull();
  });
});
