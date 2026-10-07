import type { ModePref, ReadingLayout, RenderOptions, Settings } from "./types";
import { FONT_SIZE_MIN, FONT_SIZE_MAX } from "./types";
import { getSettings, updateSettings, resetSettings, onSettings } from "./store";
import { el } from "./util";
import { icon } from "./icons";
import { isTauri } from "./platform";
import { shortcutRows } from "./commands";

/** Right-side sheet for reading measure, appearance, and shortcuts. */
export class SettingsPanel {
  readonly root: HTMLElement;
  private body: HTMLElement;
  private open = false;
  private refs: Record<string, HTMLInputElement | HTMLElement> = {};

  constructor() {
    this.root = el("aside", { class: "settings-panel", "aria-hidden": "true" });
    const head = el("div", { class: "panel-head" }, [
      el("div", { class: "panel-title" }, [
        el("h2", {}, ["Settings"]),
        el("p", {}, ["Document or book, size, and light or dark."]),
      ]),
      el("button", { class: "icon-btn panel-close", "aria-label": "Close settings" }, [icon("x")]),
    ]);
    this.body = el("div", { class: "panel-body" });
    this.root.append(head, this.body);
    head.querySelector(".panel-close")!.addEventListener("click", () => this.setOpen(false));
    this.build();
    this.root.toggleAttribute("inert", true);
    onSettings((s) => this.sync(s));
  }

  private returnFocus: HTMLElement | null = null;

  get isOpen(): boolean {
    return this.open;
  }

  setOpen(v: boolean): void {
    this.open = v;
    this.root.classList.toggle("open", v);
    this.root.setAttribute("aria-hidden", String(!v));
    this.root.toggleAttribute("inert", !v);
    if (v) {
      const active = document.activeElement;
      this.returnFocus = active instanceof HTMLElement ? active : null;
      const close = this.root.querySelector(".panel-close") as HTMLElement | null;
      close?.focus();
    } else {
      this.returnFocus?.focus();
      this.returnFocus = null;
    }
  }

  toggle(): void {
    this.setOpen(!this.open);
  }

  private build(): void {
    const s = getSettings();
    const body = this.body;
    body.innerHTML = "";

    body.append(
      this.section("Appearance", [
        this.segmentedField("layout", "Layout", [
          { value: "scroll", label: "Document" },
          { value: "book", label: "Book" },
        ], s.layout),
        el("p", { class: "hint" }, ["Document scrolls the file. Book turns two pages. Charts and diagrams stay in both."]),
        this.segmentedField("mode", "Mode", [
          { value: "system", label: "Auto" },
          { value: "light", label: "Light" },
          { value: "dark", label: "Dark" },
        ], s.mode),
        el("p", { class: "hint" }, ["Auto follows the system. The type and colors stay the same either way."]),
      ]),
      this.section("Reading", [
        this.sliderField("fontSize", "Font size", FONT_SIZE_MIN, FONT_SIZE_MAX, 1, s.fontSize, "px"),
        this.sliderField("lineHeight", "Line height", 1.2, 2.4, 0.05, s.lineHeight, ""),
        this.sliderField("contentWidth", "Content width", 560, 1600, 10, s.contentWidth, "px"),
        this.sliderField("padding", "Padding", 0, 80, 1, s.padding, "px"),
      ]),
      this.section("Parsing", [
        this.toggleField("render.linkify", "Auto-link URLs", s.render.linkify),
        this.toggleField("render.typographer", "Smart quotes", s.render.typographer),
        this.toggleField("render.emoji", "Emoji :shortcodes:", s.render.emoji),
        this.toggleField("render.math", "Math (KaTeX)", s.render.math),
        this.toggleField("render.taskLists", "Task list checkboxes", s.render.taskLists),
        el("p", { class: "hint" }, ["Links to the web open in your browser, so Mark stays on the document."]),
      ]),
      this.section("Shortcuts", [this.shortcutList()]),
      el("div", { class: "panel-footer" }, [
        el("button", { class: "btn reset-btn", type: "button" }, ["Reset appearance"]),
      ]),
    );
    body.querySelector(".reset-btn")!.addEventListener("click", () => {
      resetSettings();
    });
  }

  private section(title: string, items: HTMLElement[]): HTMLElement {
    return el("div", { class: "panel-section" }, [
      el("h3", {}, [title]),
      ...items,
    ]);
  }

  private row(label: string, control: HTMLElement): HTMLElement {
    return el("div", { class: "field" }, [
      el("label", { class: "field-label" }, [label]),
      el("div", { class: "field-control" }, [control]),
    ]);
  }

  private segmentedField(key: string, label: string, options: { value: string; label: string }[], value: string): HTMLElement {
    const wrap = el("div", { class: "segmented", role: "group", "aria-label": label }, options.map((o) => {
      const b = el("button", { type: "button", class: "seg-btn" + (o.value === value ? " active" : ""), "data-value": o.value }, [o.label]);
      b.addEventListener("click", () => {
        this.commit(key, o.value);
      });
      return b;
    }));
    this.refs[key] = wrap;
    return this.row(label, wrap);
  }

  private sliderField(key: string, label: string, min: number, max: number, step: number, value: number, unit: string): HTMLElement {
    const val = el("span", { class: "slider-val" }, [this.fmt(value, unit)]);
    const input = el("input", { type: "range", class: "slider", min: String(min), max: String(max), step: String(step) }) as HTMLInputElement;
    input.value = String(value);
    input.addEventListener("input", () => {
      val.textContent = this.fmt(parseFloat(input.value), unit);
      this.commit(key, parseFloat(input.value));
    });
    this.refs[key] = input;
    (input as SliderInput).valEl = val;
    (input as SliderInput).unit = unit;
    return this.row(label, el("div", { class: "slider-wrap" }, [input, val]));
  }

  private toggleField(key: string, label: string, value: boolean): HTMLElement {
    const input = el("input", { type: "checkbox", class: "toggle" }) as HTMLInputElement;
    input.checked = value;
    input.addEventListener("change", () => this.commit(key, input.checked));
    this.refs[key] = input;
    const wrap = el("label", { class: "toggle-wrap" }, [input, el("span", { class: "toggle-track" }, [el("span", { class: "toggle-thumb" })])]);
    return this.row(label, wrap);
  }

  private commit(key: string, value: string | number | boolean): void {
    const render = renderPatch(key, value);
    if (render) {
      updateSettings({ render: { ...getSettings().render, ...render } });
      return;
    }
    const flat = flatPatch(key, value);
    if (flat) updateSettings(flat);
  }

  private sync(s: Settings): void {
    const active = document.activeElement as HTMLElement | null;

    const setVal = (key: string, val: string | boolean) => {
      const c = this.refs[key];
      if (!c || c === active) return;
      if (c instanceof HTMLInputElement && c.type === "checkbox") {
        c.checked = Boolean(val);
      } else if (c instanceof HTMLInputElement && c.type === "range") {
        const slider = c as SliderInput;
        c.value = String(val);
        if (slider.valEl) slider.valEl.textContent = this.fmt(parseFloat(String(val)), slider.unit ?? "");
      } else if (c.classList.contains("segmented")) {
        c.querySelectorAll(".seg-btn").forEach((b) => {
          if (b instanceof HTMLElement) b.classList.toggle("active", b.dataset.value === String(val));
        });
      }
    };

    setVal("layout", s.layout);
    setVal("mode", s.mode);
    setVal("fontSize", String(s.fontSize));
    setVal("lineHeight", String(s.lineHeight));
    setVal("contentWidth", String(s.contentWidth));
    setVal("padding", String(s.padding));
    setVal("render.linkify", s.render.linkify);
    setVal("render.typographer", s.render.typographer);
    setVal("render.emoji", s.render.emoji);
    setVal("render.math", s.render.math);
    setVal("render.taskLists", s.render.taskLists);
  }

  private shortcutList(): HTMLElement {
    return el("div", { class: "shortcut-list" }, shortcutRows(isTauri).map((row) =>
      el("div", { class: "shortcut-row" }, [
        el("span", {}, [row.label]),
        el("kbd", { class: "shortcut-key" }, [row.keys]),
      ])
    ));
  }

  private fmt(v: number, unit: string): string {
    return (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")) + unit;
  }
}

interface SliderInput extends HTMLInputElement {
  valEl?: HTMLElement;
  unit?: string;
}

function renderPatch(key: string, value: string | number | boolean): Partial<RenderOptions> | null {
  if (!key.startsWith("render.")) return null;
  const on = Boolean(value);
  switch (key.slice("render.".length)) {
    case "linkify": return { linkify: on };
    case "typographer": return { typographer: on };
    case "emoji": return { emoji: on };
    case "math": return { math: on };
    case "taskLists": return { taskLists: on };
    default: return null;
  }
}

function flatPatch(key: string, value: string | number | boolean): Partial<Settings> | null {
  switch (key) {
    case "mode": return modePatch(value);
    case "layout": return layoutPatch(value);
    case "fontSize": return { fontSize: Number(value) };
    case "lineHeight": return { lineHeight: Number(value) };
    case "contentWidth": return { contentWidth: Number(value) };
    case "padding": return { padding: Number(value) };
    default: return null;
  }
}

function modePatch(value: string | number | boolean): Partial<Settings> | null {
  if (value !== "system" && value !== "light" && value !== "dark") return null;
  const mode: ModePref = value;
  return { mode };
}

function layoutPatch(value: string | number | boolean): Partial<Settings> | null {
  if (value !== "scroll" && value !== "book") return null;
  const layout: ReadingLayout = value;
  return { layout };
}
