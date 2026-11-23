// herdr-vim: vim's modes for the Herdr desktop app.
//
// Herdr itself is Insert mode: keys go to the focused terminal. Opening this
// mod (`mod.open:herdr-vim`, bound to a key in Herdr's keys.json) enters
// Normal mode: a small badge takes the keyboard, and keys drive Herdr
// instead, until a key returns to Insert mode or you click elsewhere.
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
//   herdr-vim.insert             back to Insert mode
//   herdr-vim.insert:<action>    back to Insert mode, then run the action
//   herdr-vim.mode:<mode>        switch mode
//   herdr-vim.once:<mode>        the next key from that mode, then back
//   herdr-vim.help               show or hide the mode's keys

import { View, div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { appHome, closeOverlay, commands, home, props, readTextFile, run, theme } from "herdr";

const START = "normal";
const userKeys = () => `${home()}/.config/herdr-vim/keys.json`;
const defaultKeys = () => `${appHome()}/mods/herdr-vim/default-keys.json`;

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
// "ctrl-d"), and for a shifted symbol the character it types ("?", "&").
function spellings(e) {
  const out = [e.keystroke];
  const m = e.modifiers;
  if (m.shift && !m.control && !m.alt && !m.platform && e.key_char && /^\P{L}$/u.test(e.key_char)) out.push(e.key_char);
  return out;
}

// "name:value" fills the command's first argument, as in keys.json.
function runAction(action) {
  if (action && typeof action === "object") return run(action.command, action.args ?? {});
  const at = action.indexOf(":");
  if (at < 0) return run(action, {});
  const [command, value] = [action.slice(0, at), action.slice(at + 1)];
  const first = commands().find((c) => c.name === command)?.args?.[0]?.name;
  return run(command, first ? { [first]: value } : {});
}

const describe = (action) => (typeof action === "string" ? action : JSON.stringify(action));

export default class Vim extends View {
  init(_props, cx) {
    this.keys = {};
    this.mode = START;
    this.once = null; // a mode for the next key only
    this.help = false;
    this.error = null;
    this.handle = cx.focus_handle();
    this.handle.focus();
    cx.spawn(async (cx) => {
      const { keys, error } = await loadKeys();
      this.keys = keys;
      this.error = error;
      if (!keys[START]) this.error ??= `keys.json has no "${START}" mode`;
      cx.notify();
    });
  }

  insert() {
    const overlay = props()?.overlay;
    if (overlay) closeOverlay(overlay);
  }

  // A command can move the keyboard to a pane; take it back.
  refocus(cx) {
    for (const ms of [0, 50, 150]) cx.timer.after(ms, () => this.handle.focus());
  }

  // Runs an action; false when it left herdr-vim.
  perform(action, cx) {
    const name = typeof action === "string" ? action : action?.command;
    const at = typeof action === "string" ? action.indexOf(":") : -1;
    const [command, value] = at < 0 ? [name, null] : [action.slice(0, at), action.slice(at + 1)];
    switch (command) {
      case "herdr-vim.insert":
        this.insert();
        if (value) runAction(value);
        return false;
      case "herdr-vim.mode":
      case "herdr-vim.once": {
        const mode = value ?? action?.args?.mode;
        if (!this.keys[mode]) this.error = `no mode "${mode}" in keys.json`;
        else if (command === "herdr-vim.once") this.once = mode;
        else this.mode = mode;
        return true;
      }
      case "herdr-vim.help":
        this.help = !this.help;
        return true;
      default:
        runAction(action);
        this.refocus(cx);
        return true;
    }
  }

  press(e, cx) {
    const section = this.keys[this.once ?? this.mode] ?? {};
    const key = spellings(e).find((k) => k in section);
    const wasOnce = this.once;
    this.once = null;
    this.error = null;
    if (key === undefined) {
      // Escape leaves a mode that doesn't bind it.
      if (!wasOnce && e.keystroke === "escape") return this.insert();
    } else if (!this.perform(section[key], cx)) {
      return;
    }
    cx.notify();
  }

  keycap(t, key) {
    return div().min_w(20).h(20).px(5).flex_none().flex().items_center().justify_center()
      .rounded(5).border_1().border_color(t.border).bg(t.background)
      .text_size(11).font_family("monospace").text_color(t.foreground).child(key);
  }

  render() {
    const t = theme();
    const shown = this.once ?? this.mode;
    // A one-key mode always lists its keys; a mode on herdr-vim.help. Keys
    // bound to the same action share a row.
    const listed = this.once || this.help ? (this.keys[shown] ?? {}) : {};
    const byAction = new Map();
    for (const [key, action] of Object.entries(listed)) {
      const what = describe(action);
      byAction.set(what, [...(byAction.get(what) ?? []), key]);
    }
    const rows = [...byAction].map(([what, keys]) =>
      h_flex().h(26).flex_none().px(8).gap(6).items_center().rounded(7)
        .children(keys.map((k) => this.keycap(t, k)))
        .child(div().flex_1().min_w(0).pl(4).truncate().text_size(12).text_color(t.muted).child(what)));
    return v_flex().w_full().text_size(13).text_color(t.foreground)
      .track_focus(this.handle)
      .on_key_down((e, cx) => {
        cx.stop_propagation();
        this.press(e, cx);
      })
      .child(h_flex().h(34).flex_none().px(10).gap(8).items_center()
        .child(div().px(8).py(2).rounded(5).bg(t.accent).text_color(t.accent_foreground).text_size(11).font_semibold()
          .child(this.mode.toUpperCase()))
        .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(this.error ? t.ansi1 : t.dim)
          .child(this.error ?? (this.once ? `${this.once} …` : "? keys · i insert"))))
      .when(rows.length > 0, (el) => el.child(v_flex().p(6).border_t(1).border_color(t.border).children(rows)));
  }
}
