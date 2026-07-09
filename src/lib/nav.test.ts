import { describe, expect, it } from "vitest";
import { NAV_TABS, activeTab } from "./nav";

describe("activeTab", () => {
  it("maps each tab's root path", () => {
    expect(activeTab("/")).toBe("home");
    expect(activeTab("/history")).toBe("history");
    expect(activeTab("/drills")).toBe("drills");
    expect(activeTab("/phrasebook")).toBe("phrasebook");
  });

  it("keeps the owning tab lit on nested routes", () => {
    expect(activeTab("/history/session-123")).toBe("history");
    expect(activeTab("/drills/anything")).toBe("drills");
  });

  it("falls back to home for full-screen flows and unknown paths", () => {
    expect(activeTab("/report/abc")).toBe("home");
    expect(activeTab("/exam/full")).toBe("home");
    expect(activeTab("")).toBe("home");
  });

  it("exposes exactly the four destinations, home first", () => {
    expect(NAV_TABS.map((t) => t.key)).toEqual(["home", "history", "drills", "phrasebook"]);
  });
});
