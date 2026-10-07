const NS = "http://www.w3.org/2000/svg";

export type IconName = "sun" | "moon" | "settings" | "x" | "play" | "pause" | "skip-back" | "skip-forward";

const PATHS: Record<IconName, string[]> = {
  sun: [
    "M12 2v2",
    "M12 20v2",
    "m4.93 4.93 1.41 1.41",
    "m17.66 17.66 1.41 1.41",
    "M2 12h2",
    "M20 12h2",
    "m6.34 17.66-1.41 1.41",
    "m19.07 4.93-1.41 1.41",
  ],
  moon: ["M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"],
  settings: [
    "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z",
  ],
  x: ["M18 6 6 18", "m6 6 12 12"],
  play: ["M7 5v14l12-7z"],
  pause: ["M9 5v14", "M15 5v14"],
  "skip-back": ["m11 17-5-5 5-5", "m18 17-5-5 5-5"],
  "skip-forward": ["m13 17 5-5-5-5", "m6 17 5-5-5-5"],
};

/** Small stroke icon, same drawing style as the ReUI / Lucide set. */
export function icon(name: IconName): SVGElement {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("icon");
  if (name === "sun") {
    const sun = document.createElementNS(NS, "circle");
    sun.setAttribute("cx", "12");
    sun.setAttribute("cy", "12");
    sun.setAttribute("r", "4");
    svg.append(sun);
  }
  if (name === "play") {
    svg.setAttribute("fill", "currentColor");
    svg.setAttribute("stroke", "none");
  }
  if (name === "settings") {
    const knob = document.createElementNS(NS, "circle");
    knob.setAttribute("cx", "12");
    knob.setAttribute("cy", "12");
    knob.setAttribute("r", "3");
    svg.append(knob);
  }
  for (const d of PATHS[name]) {
    const path = document.createElementNS(NS, "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  return svg;
}
