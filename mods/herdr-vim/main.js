// herdr-vim: vim's modes for the Herdr desktop app.
//
// Herdr itself is Insert mode: keys go to the focused terminal. herdr-vim is
// a block of the status bar (bottom left, where nvim's statusline shows the
// mode) that takes the keyboard in Normal mode, so keys drive Herdr instead,
// until `i` returns to Insert mode or a click gives a terminal the keyboard.
//
// It takes two commands from Herdr's keys.json:
//   herdr-vim.escape   bound to Escape in the terminal section: the Escape
//                      goes to the program, a second one within 300 ms in
//                      the same terminal enters Normal mode instead
//   herdr-vim.normal   enters Normal mode
//
// The keys of every mode are in a keys.json written exactly like Herdr's:
// sections of key → action, with modes for sections. The user's
// ~/.config/herdr-vim/keys.json, when it exists, is the whole configuration
// (as Herdr treats an edited keys.json); else this mod's default-keys.json
// applies. It is read each time Normal mode is entered.
//
// Actions, as in Herdr's keys.json: a command (`"pane.zoom"`), a command
// whose value fills its first argument (`"pane.go:left"`), or
// `{"command": ..., "args": {...}}`. herdr-vim's own commands:
//   herdr-vim.go:<direction>     focus the pane that way, as pane.go, one
//                                move at a time; args `edge`, an action
//                                for when there is none (tab.next), and
//                                `nvim`, a key for nvim instead when the
//                                pane runs it (alt+h, for smart-splits)
//   herdr-vim.insert             back to Insert mode
//   herdr-vim.insert:<action>    back to Insert mode, then run the action
//   herdr-vim.type:<text>        back to Insert mode, then type the text in
//                                the terminal (² in Normal mode types ²,
//                                when ² is what enters it)
//   herdr-vim.mode:<mode>        switch mode
//   herdr-vim.once:<mode>        the next key from that mode, then back
//   herdr-vim.help               show or hide the mode's keys

import { View, div } from "gpui-kit";
import { Popup, h_flex, v_flex } from "gpui-base";
import { appHome, commands, exec, focused, hc, home, nextCommand, notify, panes, readTextFile, run, setShared, theme } from "herdr";

const START = "normal";
const INSERT = "insert";
const DOUBLE_MS = 300;
// After a command, the time its pane may hold the keyboard before herdr-vim
// takes it back; a loss outside it is a click, which means Insert mode.
const SETTLE_MS = 250;
// pane.go gives no answer, and focused() names the new pane a few ms later:
// focus that hasn't moved within this long means there was no pane that way.
const GO_MS = 100;
// The key context of herdr-vim's block, and the keys bound in it (normal()):
// each one's action, and the key event it stands for.
const CONTEXT = "HerdrVim";
const TAB_KEYS = {
  tab: { action: "herdrvim_tab", event: { keystroke: "tab", key: "tab", modifiers: {} } },
  "shift-tab": { action: "herdrvim_shift_tab", event: { keystroke: "shift-tab", key: "tab", modifiers: { shift: true } } },
};

const userKeys = () => `${home()}/.config/herdr-vim/keys.json`;
const defaultKeys = () => `${appHome()}/mods/herdr-vim/default-keys.json`;

// The titles of the mods the keys open, from their mod.json ("Find file"),
// for the keys list.
const titles = new Map();
async function loadTitles(keys) {
  const opened = new Set();
  const visit = (action) => {
    const [command, value] = split(action);
    if (command === "herdr-vim.insert" && value) visit(value);
    else if (command === "mod.open" && value) opened.add(value);
  };
  for (const section of Object.values(keys)) for (const action of Object.values(section ?? {})) visit(action);
  for (const mod of opened) {
    if (titles.has(mod)) continue;
    try {
      const title = JSON.parse((await readTextFile(`${appHome()}/mods/${mod}/mod.json`)) ?? "{}").title;
      if (typeof title === "string") titles.set(mod, title);
    } catch {
      // No title: the keys list says "Open <mod>".
    }
  }
}

// Types text into a terminal as its own keys, without Enter: hc keys only
// knows named keys, so this attaches to it through herdr-core's framed API
// (hc connect) at its own size, sends the text as input and detaches, as
// herdr-gitview's hcpaste.rs does. A frame: channel (u32), kind (DATA 0,
// CLOSE 2), length (u32), all little-endian, then the payload; the attach
// is the connection's first channel.
const TYPE_SH = `
le32() { for s in 0 8 16 24; do printf "\\\\$(printf %03o $(( ($1 >> s) & 255 )))"; done; }
frame() { le32 "$1"; printf "\\\\$(printf %03o "$2")"; le32 "$(printf %s "$3" | wc -c)"; printf %s "$3"; }
{
  printf %s\\\\n "{\\"jsonrpc\\":\\"2.0\\",\\"id\\":0,\\"method\\":\\"hello\\",\\"params\\":{\\"framed\\":true}}"
  frame 0 0 "{\\"jsonrpc\\":\\"2.0\\",\\"id\\":1,\\"method\\":\\"terminal.attach\\",\\"params\\":{\\"terminal\\":\\"$1\\",\\"cols\\":$2,\\"rows\\":$3,\\"history\\":0}}"
  sleep 0.03
  frame 1 0 "$4"
  frame 1 2 ""
  sleep 0.1
} | hc connect >/dev/null 2>&1
`;
async function typeInto(terminal, text) {
  const facts = JSON.parse((await hc(["get", terminal, "--json"])).stdout);
  const result = await exec("sh", ["-c", TYPE_SH, "herdr-vim-type", terminal, String(facts.cols ?? 80), String(facts.rows ?? 24), text]);
  if (result.code !== 0) throw new Error(result.stderr || `hc connect exited ${result.code}`);
}

// Keys herdr-vim held while it typed, typed after it in the same order:
// characters as text, other keys by name (hc keys).
async function forward(terminal, events) {
  let text = "";
  const flush = async () => {
    if (text) await typeInto(terminal, text);
    text = "";
  };
  for (const e of events) {
    const m = e.modifiers ?? {};
    if (!m.control && !m.alt && !m.platform && e.key_char && /^[^\p{C}]+$/u.test(e.key_char)) {
      text += e.key_char;
      continue;
    }
    await flush();
    await hc(["keys", terminal, e.keystroke === "escape" ? "esc" : e.keystroke.replaceAll("-", "+")]);
  }
  await flush();
}

async function loadKeys() {
  for (const path of [userKeys(), defaultKeys()]) {
    const text = await readTextFile(path);
    if (text === null) continue;
    try {
      return { keys: JSON.parse(text), error: null };
    } catch (e) {
      return { keys: {}, error: `${path}: ${e.message}` };
    }
  }
  return { keys: {}, error: `no ${defaultKeys()}` };
}

// The spellings a key may have in keys.json: Herdr's ("shift-h", "escape",
// "ctrl-d"), and for a symbol the character it types: "?" and "&" for their
// shifted keys, "²" for the key gpui names twosuperior.
function spellings(e) {
  const out = [e.keystroke];
  const m = e.modifiers ?? {};
  const typed = e.key_char;
  if (!m.control && !m.alt && !m.platform && typed && typed !== e.keystroke && /^\P{L}$/u.test(typed)) out.push(typed);
  return out;
}

// "name:value" → [name, value]; an object action → [command, its first
// argument's value].
function split(action) {
  if (action && typeof action === "object") return [action.command, Object.values(action.args ?? {})[0] ?? null];
  const at = action.indexOf(":");
  return at < 0 ? [action, null] : [action.slice(0, at), action.slice(at + 1)];
}

// Runs an action as Herdr's keys.json would.
function runAction(action) {
  if (action && typeof action === "object") return run(action.command, action.args ?? {});
  const [command, value] = split(action);
  if (value === null) return run(command, {});
  const first = commands().find((c) => c.name === command)?.args?.[0]?.name;
  return run(command, first ? { [first]: value } : {});
}

// The order of the keys list: by what the action acts on.
const ORDER = ["pane.go", "herdr-vim.go", "pane.swap", "pane.split", "pane.zoom", "pane.close", "tab.", "space.", "agent.", "herdr-vim.once", "herdr-vim.mode", "herdr-vim.insert", "herdr-vim.help"];
const rank = (action) => {
  const [command, value] = split(action);
  if (command === "herdr-vim.insert" && value) return rank(value);
  const at = ORDER.findIndex((o) => command.startsWith(o));
  return at < 0 ? ORDER.length : at;
};

// How the keys list names an action.
const NAMES = {
  "pane.go": (v) => `Focus ${v}`,
  "herdr-vim.go": (v) => `Focus ${v}`,
  "pane.swap": (v) => `Move pane ${v}`,
  "pane.split": (v) => `Split ${v}`,
  "pane.close": () => "Close pane",
  "pane.zoom": () => "Zoom pane",
  "tab.new": () => "New tab",
  "tab.next": () => "Next tab",
  "tab.prev": () => "Previous tab",
  "tab.rename": () => "Rename tab",
  "space.new": () => "New space",
  "space.next": () => "Next space",
  "space.prev": () => "Previous space",
  "space.rename": () => "Rename space",
  "space.select": (v) => `Space ${v}`,
  "agent.next": () => "Next agent",
  "agent.prev": () => "Previous agent",
  "app.palette": () => "Commands",
  "mod.open": (v) => titles.get(v) ?? `Open ${v}`,
  "herdr-vim.insert": (v) => (v ? name(v) : "Insert mode"),
  "herdr-vim.type": (v) => `Type ${v}`,
  "herdr-vim.mode": (v) => `${title(v)} mode`,
  "herdr-vim.once": (v) => `${title(v)} …`,
  "herdr-vim.help": () => "Show keys",
};
const title = (s) => (s ? s[0].toUpperCase() + s.slice(1) : "");
// The pane runs nvim: as its program, or as herdr-nvim's sidebar, whose own
// client titles it "nvim · <file>".
function runsNvim(id) {
  const pane = id ? panes().find((p) => p.pane === id) : null;
  return pane?.program?.key === "nvim" || /^nvim\b/.test(pane?.title ?? "");
}

function name(action) {
  const [command, value] = split(action);
  return NAMES[command]?.(value) ?? (typeof action === "string" ? action.replace(":", " ") : command);
}

// How the keys list writes a key: "shift-h" as H, "ctrl-d" as Ctrl+D.
function keyLabel(key) {
  const parts = key.length > 1 && key.includes("-") ? key.split("-") : [key];
  const last = parts.pop();
  const mods = parts.map((p) => p.toLowerCase());
  const named = { space: "Space", escape: "Esc", enter: "Enter", tab: "Tab", backspace: "⌫", left: "←", right: "→", up: "↑", down: "↓" }[last];
  const base = named ?? (last.length === 1 ? (mods.includes("shift") ? last.toUpperCase() : last) : title(last));
  const shown = mods.filter((m) => !(m === "shift" && last.length === 1 && !named));
  return [...shown.map((m) => ({ ctrl: "Ctrl+", alt: "Alt+", cmd: "⌘", shift: "Shift+" })[m] ?? `${title(m)}+`), base].join("");
}

export default class Vim extends View {
  init(_props, cx) {
    this.keys = {};
    this.mode = INSERT;
    this.once = null; // a mode for the next key only
    this.help = false;
    this.settleUntil = 0;
    this.holding = false;
    // A herdr-vim.go in flight, and the keys typed meanwhile, which wait
    // their turn: a move read before the last one lands would start from the
    // pane it left.
    this.moving = 0; // since when, or 0
    this.queued = [];
    this.lastEscape = { at: 0, terminal: null };
    this.handle = cx.focus_handle();
    this.watch = null;
    // The mode for other mods (a pane header can mark the current pane in
    // Normal mode, when the terminal has no focus ring): "insert" or a mode.
    this.published = null;
    this.publish();
    cx.spawn(async (cx) => {
      for (;;) this.command(await nextCommand(), cx);
    });
  }

  publish() {
    if (this.published === this.mode) return;
    this.published = this.mode;
    setShared("herdr-vim.mode", this.mode);
  }

  command(c, cx) {
    if (c === "escape") this.escape(cx);
    else if (c === "normal") this.normal(cx);
  }

  // Escape in a terminal: to the program, or with the previous one, Normal.
  escape(cx) {
    const terminal = focused()?.terminal ?? null;
    const now = Date.now();
    const double = terminal !== null && terminal === this.lastEscape.terminal && now - this.lastEscape.at < DOUBLE_MS;
    this.lastEscape = double ? { at: 0, terminal: null } : { at: now, terminal };
    if (double) this.normal(cx);
    else if (terminal) hc(["keys", terminal, "esc"]);
  }

  normal(cx) {
    this.mode = START;
    this.once = null;
    this.help = false;
    // Tab and Shift+Tab are the window's key bindings (focus the next tab
    // stop), which run before a key handler sees the key, so they would take
    // the keyboard away. Bindings in herdr-vim's own context win over them
    // and come back as actions (render). Herdr drops a mod's bindings each
    // time it rebuilds its keymap, so they go in again each time; the same
    // binding twice changes nothing.
    cx.bind_keys(Object.keys(TAB_KEYS).map((keystroke) => ({ keystroke, action: TAB_KEYS[keystroke].action, context: CONTEXT })));
    this.handle.focus();
    this.watch?.cancel();
    // No focus-out event reaches a mod: look whether the keyboard is still
    // here, and treat a loss after a command has settled as a click away.
    this.watch = cx.timer.every(100, (cx) => {
      if (this.handle.is_focused() || Date.now() < this.settleUntil) return;
      this.leave(cx);
    });
    cx.spawn(async (cx) => {
      const { keys, error } = await loadKeys();
      this.keys = keys;
      await loadTitles(keys);
      if (error) notify({ title: "herdr-vim", body: error, level: "error" });
      else if (!keys[START]) notify({ title: "herdr-vim", body: `keys.json has no "${START}" mode`, level: "error" });
      cx.notify();
    });
    this.publish();
    cx.notify();
  }

  // Back to Insert mode, the keyboard to the focused terminal, or to the
  // focused mod pane (a chat): pane.focus marks a mod pane focused without
  // giving it the keyboard, which a focusable mod takes on its "focus"
  // command, as pane.go sends it. <mod>.focus reaches every shown copy of
  // that mod, so two side by side both answer it.
  insert(cx) {
    this.leave(cx);
    const f = focused();
    if (f?.terminal) return run("pane.focus", { terminal: f.terminal });
    if (!f?.pane) return;
    run("pane.focus", { pane: f.pane });
    const mod = panes().find((p) => p.pane === f.pane)?.mod;
    if (mod) this.attempt(`${mod}.focus`);
  }

  // Insert mode without moving the keyboard (it already went elsewhere).
  leave(cx) {
    this.watch?.cancel();
    this.watch = null;
    this.queued = [];
    this.mode = INSERT;
    this.once = null;
    this.help = false;
    this.publish();
    cx.notify();
  }

  // A command can move the keyboard to a pane, a few ms after it runs; take
  // it back the moment it goes, or the next key typed reaches the program.
  refocus(cx, settle = SETTLE_MS) {
    this.settleUntil = Math.max(this.settleUntil, Date.now() + settle);
    if (this.holding) return;
    this.holding = true;
    const hold = (cx) => {
      if (this.mode === INSERT || Date.now() >= this.settleUntil) {
        this.holding = false;
        return;
      }
      if (!this.handle.is_focused()) this.handle.focus();
      cx.timer.after(1, hold);
    };
    hold(cx);
  }

  // Focus the pane that way; at the edge, `edge`; in nvim, `nvim` to it.
  go({ direction, edge, nvim }, cx) {
    const at = focused();
    if (nvim && at?.terminal && runsNvim(at.pane)) {
      // nvim's smart-splits moves among its splits, and past its edge runs
      // a move of Herdr's, which may take the keyboard a moment.
      this.refocus(cx, 600);
      hc(["keys", at.terminal, nvim]);
      return;
    }
    const from = { pane: at?.pane ?? null, tab: at?.tab ?? null };
    this.moving = Date.now();
    this.refocus(cx);
    run("pane.go", { direction });
    let start = Date.now();
    let atEdge = false;
    const check = (cx) => {
      const now = focused();
      const moved = (now?.pane ?? null) !== from.pane || (now?.tab ?? null) !== from.tab;
      if (!moved && Date.now() - start < GO_MS) return cx.timer.after(5, check);
      if (!moved && edge && !atEdge) {
        atEdge = true;
        start = Date.now();
        this.refocus(cx);
        this.attempt(edge);
        return cx.timer.after(5, check);
      }
      this.moving = 0;
      const queued = this.queued;
      this.queued = [];
      // A move among them queues the rest again.
      for (const e of queued) this.press(e, cx);
    };
    cx.timer.after(0, check);
  }

  attempt(action) {
    try {
      runAction(action);
    } catch (e) {
      notify({ title: "herdr-vim", body: `${name(action)}: ${e.message ?? e}`, level: "error" });
    }
  }

  perform(action, cx) {
    const [command, value] = split(action);
    switch (command) {
      case "herdr-vim.go":
        this.go(typeof action === "object" ? { ...action.args } : { direction: value }, cx);
        return;
      case "herdr-vim.insert":
        this.insert(cx);
        if (value) runAction(value);
        return;
      case "herdr-vim.type": {
        const terminal = focused()?.terminal;
        if (!terminal || !value) return this.insert(cx);
        // herdr-vim keeps the keyboard until the text is in, and the keys
        // typed meanwhile follow it: ² ² b reads ²b, not b².
        this.moving = Date.now();
        this.queued = [];
        cx.spawn(async (cx) => {
          try {
            await typeInto(terminal, value);
            while (this.queued.length) {
              const queued = this.queued;
              this.queued = [];
              await forward(terminal, queued);
            }
          } catch (e) {
            notify({ title: "herdr-vim", body: `type ${value}: ${e.message ?? e}`, level: "error" });
          }
          this.moving = 0;
          this.insert(cx);
        });
        return;
      }
      case "herdr-vim.mode":
      case "herdr-vim.once": {
        const mode = value ?? action?.args?.mode;
        if (!this.keys[mode]) notify({ title: "herdr-vim", body: `no mode "${mode}" in keys.json`, level: "error" });
        else if (command === "herdr-vim.once") this.once = mode;
        else this.mode = mode;
        return;
      }
      case "herdr-vim.help":
        this.help = !this.help;
        return;
      default:
        this.refocus(cx);
        this.attempt(action);
    }
  }

  press(e, cx) {
    if (this.mode === INSERT) return;
    // A second without an answer is no move to wait for.
    if (this.moving && Date.now() - this.moving < 1000) {
      const { keystroke, key_char, modifiers } = e;
      this.queued.push({ keystroke, key_char, modifiers: { ...modifiers } });
      return;
    }
    const section = this.keys[this.once ?? this.mode] ?? {};
    const key = spellings(e).find((k) => k in section);
    const pending = this.once;
    this.once = null;
    // Escape closes the keys list first, bound or not.
    if (e.keystroke === "escape" && this.help && !pending) this.help = false;
    else if (key !== undefined) this.perform(section[key], cx);
    // Unbound, Escape cancels what is pending: a one-key mode, then a mode
    // back to Normal.
    else if (e.keystroke === "escape" && !pending) this.mode = START;
    this.publish();
    cx.notify();
  }

  // The keys of a mode, as rows of [label, keys]: keys bound to the same
  // action share a row, and the space.select:<n> rows collapse into one.
  rows(mode) {
    const byLabel = new Map();
    const bound = Object.entries(this.keys[mode] ?? {});
    bound.sort(([, a], [, b]) => rank(a) - rank(b));
    for (const [key, action] of bound) {
      const select = split(action)[0] === "space.select";
      const label = select ? "Space 1–9" : name(action);
      const keys = byLabel.get(label) ?? [];
      if (!select) keys.push(keyLabel(key));
      else if (keys.length === 0) keys.push("1–9");
      byLabel.set(label, keys);
    }
    return [...byLabel];
  }

  keysList(t) {
    const mode = this.once ?? this.mode;
    const rows = this.rows(mode);
    const half = Math.ceil(rows.length / 2);
    const column = (part) => v_flex().w(232).children(part.map(([label, keys]) =>
      h_flex().h(28).px(8).gap(9).rounded(7).items_center().justify_between()
        .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(label))
        .child(div().flex_none().text_size(11).text_color(t.dim).child(keys.join("  ")))));
    return v_flex().p(5).bg(t.popover).rounded(10).border_1().border_color(t.border).shadow_lg().text_size(12.8)
      .child(h_flex().h(30).px(8).items_center().justify_between()
        .child(div().text_size(11.5).font_medium().text_color(t.dim).child(`${title(mode)} keys`))
        .child(div().text_size(11).text_color(t.dim).child("Esc")))
      .child(rows.length > 10 ? h_flex().gap(4).items_start().child(column(rows.slice(0, half))).child(column(rows.slice(half))) : column(rows));
  }

  render() {
    const t = theme();
    const normal = this.mode !== INSERT;
    const shown = normal ? title(this.once ?? this.mode) : "Insert";
    const label = h_flex().gap(6).items_center()
      .child(div().size(6).rounded(3).bg(normal ? t.accent : t.dim))
      .child(div().text_color(normal ? t.foreground : t.muted).when(normal, (el) => el.font_medium()).child(shown))
      .when(Boolean(this.once), (el) => el.child(div().ml(-4).text_color(t.dim).child("…")));
    // A one-key mode always lists its keys, as which-key does; a mode on
    // herdr-vim.help.
    const listing = normal && (this.once || this.help);
    return h_flex().size_full().pl(14).items_center().bg(t.chrome).border_t(1).border_color(t.border).text_size(11.8)
      .key_context(CONTEXT)
      .track_focus(this.handle)
      .on_key_down((e, cx) => {
        cx.stop_propagation();
        this.press(e, cx);
      })
      .on_action(TAB_KEYS.tab.action, (_e, cx) => this.press(TAB_KEYS.tab.event, cx))
      .on_action(TAB_KEYS["shift-tab"].action, (_e, cx) => this.press(TAB_KEYS["shift-tab"].event, cx))
      .child(Popup.new("herdr-vim-keys", label).anchor("bottom_left")
        .when(Boolean(listing), (el) => el.content(div().pb(8).child(this.keysList(t)))));
  }
}
