import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Difficulty } from "../data/problemTypes";
import { Navbar } from "./Navbar";
import { RoomLobby } from "./RoomLobby";

const remaining: Record<Difficulty, number> = {
  easy: 2,
  medium: 2,
  hard: 2,
};

describe("unlimited room leave controls", () => {
  it("labels the active contestant exit as Leave for now", () => {
    const html = renderToStaticMarkup(
      <Navbar
        score={500}
        rank={2}
        remaining={remaining}
        roomCode="ABC234"
        timeRemaining="Unlimited"
        onSelectDifficulty={() => undefined}
        onExit={() => undefined}
        exitLabel="Leave for now"
      />,
    );

    expect(html).toContain('aria-label="Leave for now"');
    expect(html).toContain('title="Leave for now"');
  });

  it("gives an unlimited host separate leave-for-now and close controls", () => {
    const html = renderToStaticMarkup(
      <RoomLobby
        role="host"
        code="ABC234"
        players={[]}
        durationSeconds={1_800}
        unlimited
        onLeave={() => undefined}
        onClose={() => undefined}
        leaveLabel="Leave for now"
      />,
    );

    expect(html).toContain("Leave for now");
    expect(html).toContain("Close room");
  });
});
