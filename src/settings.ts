import type { Settings } from "./types";
import { DEFAULT_SETTINGS, FONT_PRESETS, CODE_FONT_PRESETS } from "./types";
import { THEMES } from "./themes";
import { getSettings, updateSettings, setSettings, onSettings } from "./store";
import { el } from "./util";

interface FontPreset { id: string; name: string; stack: string }

/** Right-side slide-in panel with every appearance / parsing option. */
export class SettingsPanel {
  readonly root: HTMLElement;
  private body: HTMLElement;
  private open = false;
  private refs: Record<string, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement> = {};
  private customFontWrap: Record<string, HTMLElement> = {};

  constructor() {
    this.root = el("aside", { class: "settings-panel", "aria-hidden": "true" });
    const head = el("div", { class: "panel-head" }, [
      el("h2", {}, ["Settings"]),
      el("button", { class: "icon-btn panel-close", "aria-label": "Close settings" }, ["\u00d7"]),
    ]);
    this.body = el("div", { class: "panel-body" });
    this.root.append(head, this.body);
    head.querySelector(".panel-close")!.addEventListener("click", () => this.setOpen(false));
    this.build();
    onSettings((s) => this.sync(s));
  }

  setOpen(v: boolean): void {
    this.open = v;
    this.root.classList.toggle("open", v);
    this.root.setAttribute("aria-hidden", String(!v));
  }

  toggle(): void {
    this.setOpen(!this.open);
  }

  private build(): void {
    const s = getSettings();
    const body = this.body;
    body.innerHTML = "";

    body.append(
      this.section("Theme", [
        this.selectField("themeId", "Preset", [
          ...THEMES.map((t) => ({ value: t.id, label: t.name })),
          { value: "custom", label: "Custom" },
        ], s.themeId),
        this.segmentedField("mode", "Mode", [
          { value: "system", label: "Auto" },
          { value: "light", label: "Light" },
          { value: "dark", label: "Dark" },
        ], s.mode),
        this.colorField("accent", "Accent", s.accent),
      ]),
      this.section("Typography", [
        this.fontField("fontFamily", "Body font", FONT_PRESETS, s.fontFamily),
        this.fontField("codeFontFamily", "Code font", CODE_FONT_PRESETS, s.codeFontFamily),
        this.sliderField("fontSize", "Font size", 12, 26, 1, s.fontSize, "px"),
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
        this.selectField("render.linkTarget", "External links", [
          { value: "blank", label: "Open in browser" },
          { value: "self", label: "Open here" },
        ], s.render.linkTarget),
      ]),
    );

    // Custom color editor (only relevant for the "custom" theme).
    const customWrap = el("div", { class: "panel-section custom-colors" }, [
      el("h3", {}, ["Custom colors"]),
      el("p", { class: "hint" }, ["Active when preset is \u201cCustom\u201d."]),
      this.colorGrid(s),
    ]);
    body.append(customWrap);
    this.customFontWrap["__custom_colors"] = customWrap;
    this.updateCustomVisibility(s.themeId);

    body.append(
      el("div", { class: "panel-footer" }, [
        el("button", { class: "btn reset-btn" }, ["Reset to defaults"]),
      ]),
    );
    body.querySelector(".reset-btn")!.addEventListener("click", () => {
      setSettings(structuredClone(DEFAULT_SETTINGS));
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

  private selectField(key: string, label: string, options: { value: string; label: string }[], value: string): HTMLElement {
    const sel = el("select", { class: "select" }, options.map((o) => {
      const opt = el("option", { value: o.value }, [o.label]);
      if (o.value === value) opt.selected = true;
      return opt;
    }));
    sel.addEventListener("change", () => this.commit(key, sel.value));
    this.refs[key] = sel;
    return this.row(label, sel);
  }

  private segmentedField(key: string, label: string, options: { value: string; label: string }[], value: string): HTMLElement {
    const wrap = el("div", { class: "segmented" }, options.map((o) => {
      const b = el("button", { type: "button", class: "seg-btn" + (o.value === value ? " active" : ""), "data-value": o.value }, [o.label]);
      b.addEventListener("click", () => {
        this.commit(key, o.value);
      });
      return b;
    }));
    this.refs[key] = wrap as unknown as HTMLInputElement; // stored for sync
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
    (input as any)._valEl = val;
    (input as any)._unit = unit;
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

  private colorField(key: string, label: string, value: string): HTMLElement {
    const input = el("input", { type: "color", class: "color-input" }) as HTMLInputElement;
    input.value = this.toHex(value);
    const hex = el("input", { type: "text", class: "color-hex", spellcheck: "false" }) as HTMLInputElement;
    hex.value = value;
    input.addEventListener("input", () => {
      hex.value = input.value;
      this.commit(key, input.value);
    });
    hex.addEventListener("change", () => {
      if (/^#([0-9a-f]{6})$/i.test(hex.value.trim())) {
        input.value = hex.value.trim();
        this.commit(key, hex.value.trim());
      }
    });
    this.refs[key] = input;
    (input as any)._hexEl = hex;
    return this.row(label, el("div", { class: "color-wrap" }, [input, hex]));
  }

  private fontField(key: string, label: string, presets: FontPreset[], value: string): HTMLElement {
    const sel = el("select", { class: "select" }, [
      ...presets.map((p) => {
        const o = el("option", { value: p.stack }, [p.name]);
        if (p.stack === value) o.selected = true;
        return o;
      }),
      (() => {
        const o = el("option", { value: "__custom__" }, ["Custom\u2026"]);
        return o;
      })(),
    ]) as HTMLSelectElement;
    if (!presets.some((p) => p.stack === value)) sel.value = "__custom__";

    const customInput = el("input", { type: "text", class: "text-input", placeholder: "e.g. Georgia, serif", spellcheck: "false" }) as HTMLInputElement;
    customInput.value = value;

    const customRow = el("div", { class: "custom-font-row" + (sel.value === "__custom__" ? "" : " hidden") }, [customInput]);
    this.customFontWrap[key] = customRow;

    const apply = () => {
      if (sel.value === "__custom__") {
        customRow.classList.remove("hidden");
        this.commit(key, customInput.value || value);
      } else {
        customRow.classList.add("hidden");
        this.commit(key, sel.value);
      }
    };
    sel.addEventListener("change", apply);
    customInput.addEventListener("input", () => {
      if (sel.value === "__custom__") this.commit(key, customInput.value);
    });

    this.refs[key] = sel;
    (sel as any)._customInput = customInput;
    return el("div", { class: "field" }, [
      el("label", { class: "field-label" }, [label]),
      el("div", { class: "field-control" }, [sel, customRow]),
    ]);
  }

  private colorGrid(s: Settings): HTMLElement {
    const entries: { key: keyof Settings["custom"]; label: string }[] = [
      { key: "bg", label: "Background" },
      { key: "fg", label: "Text" },
      { key: "heading", label: "Headings" },
      { key: "link", label: "Links" },
      { key: "muted", label: "Muted" },
      { key: "border", label: "Borders" },
      { key: "codeBg", label: "Code bg" },
      { key: "quote", label: "Quotes" },
    ];
    return el("div", { class: "color-grid" }, entries.flatMap((e) => {
      const id = "custom." + e.key;
      const input = el("input", { type: "color", class: "color-input" }) as HTMLInputElement;
      input.value = this.toHex(s.custom[e.key]);
      input.addEventListener("input", () => this.commit(id, input.value));
      this.refs[id] = input;
      return [el("label", { class: "color-cell" }, [input, el("span", {}, [e.label])])];
    }));
  }

  private commit(key: string, value: string | number | boolean): void {
    if (key.includes(".")) {
      const [a, b] = key.split(".");
      if (a === "render") updateSettings({ render: { ...getSettings().render, [b]: value } } as any);
      else if (a === "custom") updateSettings({ custom: { ...getSettings().custom, [b]: value } } as any);
    } else {
      updateSettings({ [key]: value } as any);
    }
  }

  private sync(s: Settings): void {
    // Avoid disrupting a control the user is currently editing.
    const active = document.activeElement as HTMLElement | null;

    const setVal = (key: string, val: string | boolean) => {
      const c = this.refs[key] as any;
      if (!c || c === active) return;
      if (c.tagName === "SELECT") {
        // Font selects use preset stacks; map to preset or custom.
        c.value = val as string;
      } else if (c.type === "checkbox") {
        c.checked = val;
      } else if (c.type === "range") {
        c.value = String(val);
        if (c._valEl) c._valEl.textContent = this.fmt(parseFloat(val as any), c._unit ?? "");
      } else if (c.type === "color") {
        c.value = this.toHex(val as string);
        if (c._hexEl) c._hexEl.value = val as string;
      } else if (c.classList && c.classList.contains("segmented")) {
        c.querySelectorAll(".seg-btn").forEach((b: HTMLElement) =>
          b.classList.toggle("active", b.dataset.value === String(val))
        );
      }
    };

    setVal("themeId", s.themeId);
    setVal("mode", s.mode);
    setVal("accent", s.accent);
    setVal("fontSize", String(s.fontSize));
    setVal("lineHeight", String(s.lineHeight));
    setVal("contentWidth", String(s.contentWidth));
    setVal("padding", String(s.padding));
    setVal("render.linkify", s.render.linkify);
    setVal("render.typographer", s.render.typographer);
    setVal("render.emoji", s.render.emoji);
    setVal("render.math", s.render.math);
    setVal("render.taskLists", s.render.taskLists);
    setVal("render.linkTarget", s.render.linkTarget);
    setVal("custom.bg", s.custom.bg);
    setVal("custom.fg", s.custom.fg);
    setVal("custom.heading", s.custom.heading);
    setVal("custom.link", s.custom.link);
    setVal("custom.muted", s.custom.muted);
    setVal("custom.border", s.custom.border);
    setVal("custom.codeBg", s.custom.codeBg);
    setVal("custom.quote", s.custom.quote);

    // Font selects: map a (possibly custom) stack to a preset or "Custom…".
    this.syncFont("fontFamily", s.fontFamily, FONT_PRESETS, active);
    this.syncFont("codeFontFamily", s.codeFontFamily, CODE_FONT_PRESETS, active);

    this.updateCustomVisibility(s.themeId);
  }

  private syncFont(key: string, val: string, presets: { stack: string }[], active: Element | null): void {
    const sel = this.refs[key] as (HTMLSelectElement & { _customInput?: HTMLInputElement }) | undefined;
    if (!sel) return;
    const preset = presets.find((p) => p.stack === val);
    if (sel !== active) sel.value = preset ? preset.stack : "__custom__";
    const row = this.customFontWrap[key];
    if (row) row.classList.toggle("hidden", !!preset);
    const ci = sel._customInput;
    if (ci && ci !== active) ci.value = val;
  }

  private updateCustomVisibility(themeId: string): void {
    const show = themeId === "custom";
    const sec = this.customFontWrap["__custom_colors"];
    if (sec) sec.classList.toggle("hidden", !show);
  }

  private fmt(v: number, unit: string): string {
    return (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")) + unit;
  }

  private toHex(v: string): string {
    const m = /^#([0-9a-f]{6})$/i.exec((v || "").trim());
    if (m) return "#" + m[1];
    return "#888888";
  }
}
