/** Bottom-nav tab definitions and active-tab resolution. Deliberately
 *  RN-free so the routing logic stays unit-testable in the node test env
 *  (importing the .tsx component would pull react-native into vitest). */

export interface NavTab {
  key: string;
  href: "/" | "/history" | "/drills" | "/phrasebook";
  label: string;
}

export const NAV_TABS: readonly NavTab[] = [
  { key: "home", href: "/", label: "Home" },
  { key: "history", href: "/history", label: "History" },
  { key: "drills", href: "/drills", label: "Drills" },
  { key: "phrasebook", href: "/phrasebook", label: "Phrasebook" },
];

/** Which tab owns a given pathname. Sub-routes reached from a tab keep that
 *  tab lit (e.g. a report opened from History → History stays active).
 *  Full-screen flows (exam, report opened from Home, sign-in) fall back to
 *  Home — those screens don't render the bar anyway. */
export function activeTab(pathname: string): string {
  if (pathname.startsWith("/history")) return "history";
  if (pathname.startsWith("/drills")) return "drills";
  if (pathname.startsWith("/phrasebook")) return "phrasebook";
  return "home";
}
