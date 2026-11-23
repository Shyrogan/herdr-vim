// herdr-vim-escape: Escape Escape enters herdr-vim's Normal mode, as
// `tnoremap <Esc><Esc> <C-\><C-n>` leaves a terminal in nvim.
//
// A controller that draws nothing: one copy lives in the layout as a
// floating block ({"id": "herdr-vim", "content": {"mod": "herdr-vim-escape"}}),
// and Herdr's keys.json sends it a focused terminal's Escape as a command
// ({"terminal": {"escape": "herdr-vim-escape.escape"}}), so no popup takes
// the keyboard. The first Escape goes on to the program at once, so nvim,
// agents and shells get it as before. A second one within DOUBLE_MS, in the
// same terminal, enters Normal mode instead. Keys typed after a single Escape
// never pass through here.

import { View, div } from "gpui-kit";
import { focused, hc, nextCommand, run } from "herdr";

const DOUBLE_MS = 300;

export default class Escape extends View {
  init(_props, cx) {
    // When the last Escape went on to a program, and to which terminal.
    this.last = { at: 0, terminal: null };
    cx.spawn(async () => {
      for (;;) {
        if ((await nextCommand()) === "escape") this.escape();
      }
    });
  }

  escape() {
    const terminal = focused()?.terminal ?? null;
    const now = Date.now();
    const double = terminal !== null && terminal === this.last.terminal && now - this.last.at < DOUBLE_MS;
    this.last = double ? { at: 0, terminal: null } : { at: now, terminal };
    if (double) run("mod.open", { name: "herdr-vim" });
    else if (terminal) hc(["keys", terminal, "esc"]);
  }

  render() {
    return div();
  }
}
