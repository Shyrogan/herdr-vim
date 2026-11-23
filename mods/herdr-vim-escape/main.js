// herdr-vim-escape: Escape Escape enters herdr-vim's Normal mode, as
// `tnoremap <Esc><Esc> <C-\><C-n>` leaves a terminal in nvim.
//
// Herdr's keys.json sends a focused terminal's Escape here
// ({"terminal": {"escape": "mod.open:herdr-vim-escape"}}). The first Escape
// goes on to the program at once, so nvim, agents and shells get it as
// before. A second one within DOUBLE_MS enters Normal mode instead. Keys typed
// after a single Escape never pass through here.

import { View, div } from "gpui-kit";
import { focused, hc, props, closeOverlay, run, shared, setShared } from "herdr";

const DOUBLE_MS = 300;

// When the last Escape went on to a program, and to which terminal. In
// Herdr's shared state: each Escape opens a fresh copy of this mod, which
// keeps nothing of the last one.
const KEY = "herdr-vim.escape";

export default class Escape extends View {
  init(_props, cx) {
    const terminal = focused()?.terminal ?? null;
    const now = Date.now();
    const last = shared(KEY) ?? { at: 0, terminal: null };
    const double = terminal === last.terminal && now - last.at < DOUBLE_MS;
    setShared(KEY, double ? { at: 0, terminal: null } : { at: now, terminal });
    // Close first: the next overlay, or the program, takes the keyboard.
    cx.timer.after(0, () => {
      const overlay = props()?.overlay;
      if (overlay) closeOverlay(overlay);
      if (double || !terminal) run("mod.open", { name: "herdr-vim" });
      else hc(["keys", terminal, "esc"]);
    });
  }

  render() {
    return div();
  }
}
