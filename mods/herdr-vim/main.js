// herdr-vim: vim's modes for the Herdr desktop app.
//
// Herdr itself is Insert mode: keys go to the focused terminal. Opening this
// mod (`mod.open:herdr-vim`, bound to a key in keys.json) enters Normal mode:
// a small badge takes the keyboard, and keys drive Herdr instead (move between
// panes, split, close, switch tabs…) until a key returns to Insert mode
// (`i` or Escape by default) or you click elsewhere.
//
// Every mode's keys come from ~/.config/herdr-vim/config.json, merged over
// the defaults below and read again each time Normal mode is entered. See the
// README for the format.

import { View, div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { closeOverlay, commands, home, openOverlay, props, readTextFile, run, theme } from "herdr";

// The space-selection keys on a number row: 1-9, and AZERTY's unshifted row.
const SPACES = {};
["1", "2", "3", "4", "5", "6", "7", "8", "9"].forEach((n) => (SPACES[n] = { label: `Space ${n}`, run: `space.select:${n}` }));
["&", "é", '"', "'", "(", "-", "è", "_", "ç"].forEach((k, i) => (SPACES[k] = { label: `Space ${i + 1}`, run: `space.select:${i + 1}`, hidden: true }));

const DEFAULTS = {
  // The mode `mod.open:herdr-vim` enters.
  start: "normal",
  modes: {
    normal: {
      label: "NORMAL",
      keys: {
        h: { label: "Pane left", run: "pane.go:left" },
        j: { label: "Pane below", run: "pane.go:down" },
        k: { label: "Pane above", run: "pane.go:up" },
        l: { label: "Pane right", run: "pane.go:right" },
        H: { label: "Swap left", run: "pane.swap:left" },
        J: { label: "Swap down", run: "pane.swap:down" },
        K: { label: "Swap up", run: "pane.swap:up" },
        L: { label: "Swap right", run: "pane.swap:right" },
        v: { label: "Split right", run: "pane.split:right" },
        s: { label: "Split down", run: "pane.split:down" },
        x: { label: "Close pane", run: "pane.close" },
        f: { label: "Zoom pane", run: "pane.zoom" },
        t: { label: "New tab", run: "tab.new" },
        T: { label: "New space", run: "space.new" },
        n: { label: "Next agent", run: "agent.next" },
        N: { label: "Previous agent", run: "agent.prev" },
        r: { label: "Rename tab", run: "tab.rename", then: "insert" },
        R: { label: "Rename space", run: "space.rename", then: "insert" },
        ":": { label: "Command palette", run: "app.palette", then: "insert" },
        m: { label: "Move mode", run: "vim.mode:move" },
        g: {
          label: "Go",
          keys: {
            t: { label: "Next tab", run: "tab.next" },
            T: { label: "Previous tab", run: "tab.prev" },
            s: { label: "Next space", run: "space.next" },
            S: { label: "Previous space", run: "space.prev" },
          },
        },
        ...SPACES,
        "?": { label: "Show keys", run: "vim.help" },
        i: { label: "Insert mode", run: "vim.insert" },
        escape: { label: "Insert mode", run: "vim.insert", hidden: true },
      },
    },
    // Panes move with hjkl until Escape.
    move: {
      label: "MOVE",
      keys: {
        h: { label: "Swap left", run: "pane.swap:left" },
        j: { label: "Swap down", run: "pane.swap:down" },
        k: { label: "Swap up", run: "pane.swap:up" },
        l: { label: "Swap right", run: "pane.swap:right" },
        "?": { label: "Show keys", run: "vim.help" },
        escape: { label: "Normal mode", run: "vim.mode:normal" },
        i: { label: "Insert mode", run: "vim.insert" },
      },
    },
  },
};

const configPath = () => `${home()}/.config/herdr-vim/config.json`;

// The user's keys over the defaults: a key set to null is unbound, and a
// mode with `"replace": true` drops the default keys of that mode.
function merge(defaults, user) {
  const modes = { ...defaults.modes };
  for (const [name, mode] of Object.entries(user.modes ?? {})) {
    const base = mode.replace ? { keys: {} } : (modes[name] ?? { keys: {} });
    const keys = { ...base.keys, ...(mode.keys ?? {}) };
    for (const key of Object.keys(keys)) if (keys[key] === null) delete keys[key];
    modes[name] = { ...base, ...mode, keys };
  }
  return { start: user.start ?? defaults.start, modes };
}

async function loadConfig() {
  const text = await readTextFile(configPath());
  if (!text) return { config: DEFAULTS, error: null };
  try {
    return { config: merge(DEFAULTS, JSON.parse(text)), error: null };
  } catch (e) {
    return { config: DEFAULTS, error: `${configPath()}: ${e.message}` };
  }
}

// A key as config files name it: the character it types ("H", "&", "/"),
// else GPUI's spelling of the chord ("escape", "space", "ctrl-d", "shift-tab").
function keyName(e) {
  const m = e.modifiers;
  if (!m.control && !m.alt && !m.platform && e.key_char && e.key_char.trim()) return e.key_char;
  return e.keystroke;
}

// An entry is a group ({label, keys}) or an action: a string, an object
// {command, args}, an array of actions, or {label, run, then}.
const isGroup = (entry) => entry && typeof entry === "object" && !Array.isArray(entry) && entry.keys;
const label = (entry) =>
  isGroup(entry) || (entry && typeof entry === "object" && !Array.isArray(entry) && entry.label)
    ? entry.label
    : typeof entry === "string"
      ? entry
      : (entry?.command ?? "…");

// "name:value" fills the command's first argument, as in keys.json.
function runCommand(name, args) {
  if (args !== undefined) return run(name, args);
  const at = name.indexOf(":");
  if (at < 0) return run(name, {});
  const [command, value] = [name.slice(0, at), name.slice(at + 1)];
  const first = commands().find((c) => c.name === command)?.args?.[0]?.name;
  return run(command, first ? { [first]: value } : {});
}

export default class Vim extends View {
  init(_props, cx) {
    this.config = DEFAULTS;
    this.mode = DEFAULTS.start;
    this.group = null; // the group a key opened: its label path and keys
    this.help = false;
    this.error = null;
    this.handle = cx.focus_handle();
    this.handle.focus();
    cx.spawn(async (cx) => {
      const { config, error } = await loadConfig();
      this.config = config;
      this.error = error;
      this.mode = config.modes[config.start] ? config.start : Object.keys(config.modes)[0];
      cx.notify();
    });
  }

  insert() {
    const overlay = props()?.overlay;
    if (overlay) closeOverlay(overlay);
  }

  // Commands can move the keyboard to a pane; take it back.
  refocus(cx) {
    for (const ms of [0, 50, 150]) cx.timer.after(ms, () => this.handle.focus());
  }

  // Runs one action; false when it left herdr-vim (Insert mode, an overlay).
  perform(action, cx) {
    if (Array.isArray(action)) {
      for (const a of action) if (!this.perform(a, cx)) return false;
      return true;
    }
    const name = typeof action === "string" ? action : action?.command;
    const args = typeof action === "string" ? undefined : action?.args;
    if (!name) return true;
    if (name === "vim.insert") {
      this.insert();
      return false;
    }
    if (name === "vim.help") {
      this.help = !this.help;
      return true;
    }
    if (name.startsWith("vim.mode:") || name === "vim.mode") {
      const mode = name === "vim.mode" ? args?.mode : name.slice("vim.mode:".length);
      if (this.config.modes[mode]) this.mode = mode;
      else this.error = `no mode "${mode}"`;
      return true;
    }
    if (name.startsWith("vim.open:") || name === "vim.open") {
      // Another mod's overlay takes the keyboard: Insert mode under it.
      const spec = name === "vim.open" ? args : { mod: name.slice("vim.open:".length) };
      this.insert();
      openOverlay({ kind: "popup", ...spec });
      return false;
    }
    runCommand(name, args);
    this.refocus(cx);
    return true;
  }

  press(e, cx) {
    const key = keyName(e);
    const keys = this.group?.keys ?? this.config.modes[this.mode]?.keys ?? {};
    const entry = keys[key];
    this.error = null;
    if (entry === undefined) {
      // An unbound key ends a group; in a mode it does nothing.
      if (this.group) this.group = null;
      else if (key === "escape") return this.insert();
      cx.notify();
      return;
    }
    if (isGroup(entry)) {
      this.group = { path: [...(this.group?.path ?? []), entry.label ?? key], keys: entry.keys };
      cx.notify();
      return;
    }
    this.group = null;
    const action = typeof entry === "object" && !Array.isArray(entry) && "run" in entry ? entry.run : entry;
    if (!this.perform(action, cx)) return;
    const then = typeof entry === "object" && !Array.isArray(entry) ? entry.then : undefined;
    if (then === "insert") return this.insert();
    if (then && this.config.modes[then]) this.mode = then;
    cx.notify();
  }

  keycap(t, key) {
    return div().min_w(20).h(20).px(5).flex_none().flex().items_center().justify_center()
      .rounded(5).border_1().border_color(t.border).bg(t.background)
      .text_size(11).font_family("monospace").text_color(t.foreground).child(key);
  }

  render() {
    const t = theme();
    const mode = this.config.modes[this.mode];
    // The keys to list: a group's always, a mode's on `?`.
    const listed = this.group ? this.group.keys : this.help ? mode?.keys : null;
    const rows = Object.entries(listed ?? {})
      .filter(([, entry]) => entry && !entry.hidden)
      .map(([key, entry]) =>
        h_flex().h(26).flex_none().px(8).gap(8).items_center().rounded(7)
          .child(this.keycap(t, key))
          .child(div().flex_1().min_w(0).truncate().text_color(isGroup(entry) ? t.accent : t.foreground).child(label(entry)))
          .when(isGroup(entry), (el) => el.child(div().text_color(t.dim).child("›"))));
    return v_flex().w_full().text_size(13).text_color(t.foreground)
      .track_focus(this.handle)
      .on_key_down((e, cx) => {
        cx.stop_propagation();
        this.press(e, cx);
      })
      .child(h_flex().h(34).flex_none().px(10).gap(8).items_center()
        .child(div().px(8).py(2).rounded(5).bg(t.accent).text_color(t.accent_foreground).text_size(11).font_semibold()
          .child(mode?.label ?? this.mode.toUpperCase()))
        .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.dim)
          .child(this.error ?? (this.group ? this.group.path.join(" › ") : "? keys · i insert"))))
      .when(rows.length > 0, (el) => el.child(v_flex().p(6).border_t(1).border_color(t.border).children(rows)));
  }
}
