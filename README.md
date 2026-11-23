# herdr-vim

vim's modes for the [Herdr](https://herdr.dev) desktop app.

Herdr as it is becomes Insert mode: every key goes to the focused terminal, your shell, nvim or agent. `Escape Escape` enters Normal mode, as `tnoremap <Esc><Esc> <C-\><C-n>` leaves a terminal in nvim. There, keys drive Herdr instead: `hjkl` moves between panes, `v` and `s` split, `x` closes, `g t` goes to the next tab, and so on. You stay in Normal mode until `i` takes you back to Insert mode. You can add modes and rebind every key, in a `keys.json` written exactly like Herdr's.

## How it works

herdr-vim is one Herdr mod, a block at the left end of the status bar, where nvim's statusline shows the mode: `● Insert`, or `● Normal` in the accent color. In Normal mode it holds the keyboard, and each key runs a Herdr command or switches mode. `i` gives the keyboard back to the pane, and so does clicking a terminal. A key that waits for another, such as `g`, lists the keys that can follow above the status bar, as which-key does; `?` lists the whole mode.

Herdr sends it two commands from its own `keys.json`:

- `herdr-vim.escape`, bound to `Escape` in the `terminal` section. The first `Escape` goes on to the program at once, so nvim, agents and shells get it as before (in Claude Code, it still interrupts a running turn). A second `Escape` within 300 ms enters Normal mode instead of reaching the program. Keys typed after a single `Escape`, such as `:w` in nvim, never pass through herdr-vim.
- `herdr-vim.normal`, which enters Normal mode from anywhere: bind it to a key of your own.

While herdr-vim holds the keyboard, Herdr draws no focus ring around the current pane. herdr-vim publishes the mode as the shared value `herdr-vim.mode` (`"insert"`, or the mode's name) so a pane header can mark the current pane instead, for example with an accent border when `shared("herdr-vim.mode") !== "insert"` and the pane is `focused`.

## Install

### By hand

```sh
mkdir -p ~/.config/herdr-app/mods/herdr-vim
cp mods/herdr-vim/{main.js,mod.json,default-keys.json} ~/.config/herdr-app/mods/herdr-vim/
```

Put it in the status bar of the layout you use, in `~/.config/herdr-app/layouts/` (Herdr's own layouts can't be edited: clone one first with `layout.clone`). In Herdr's main layout the status bar is the block with `"id": "status"`; replace it with a row holding herdr-vim and that block:

```json
{
  "type": "row",
  "id": "status-row",
  "size": { "px": 28 },
  "children": [
    { "type": "block", "id": "herdr-vim", "size": { "px": 96 }, "content": { "mod": "herdr-vim" } },
    { "type": "block", "id": "status", "content": { "mod": "workspace-status" } }
  ]
}
```

Then bind its commands in `~/.config/herdr-app/keys.json`, as [mods/herdr-vim/keys.json](mods/herdr-vim/keys.json) does:

```json
{
  "global": {
    "alt-space": "herdr-vim.normal"
  },
  "terminal": {
    "escape": "herdr-vim.escape"
  }
}
```

### With Nix (home-manager)

```nix
{
  inputs.herdr-vim.url = "github:Shyrogan/herdr-vim";
}
```

```nix
{inputs, ...}: {
  imports = [inputs.herdr-vim.homeManagerModules.default];
  programs.herdr-vim.enable = true;
}
```

`programs.herdr-vim.keys` writes `~/.config/herdr-vim/keys.json` (see Configure). The status bar block and the bindings still go in your layout and Herdr's `keys.json`.

## Default keys

[default-keys.json](mods/herdr-vim/default-keys.json) has three modes.

`normal`:

| Key | Does |
| --- | --- |
| `h` `j` `k` `l` | focus the pane left, below, above, right |
| `shift-h` `shift-j` `shift-k` `shift-l` | swap the pane that way |
| `v` / `s` | split right / down |
| `x` | close the pane |
| `f` | zoom the pane |
| `t` / `shift-t` | new tab / new space |
| `g` then `t` / `shift-t` | next / previous tab |
| `g` then `s` / `shift-s` | next / previous space |
| `1`–`9`, or `&é"'(-è_ç` | go to that space |
| `n` / `shift-n` | next / previous agent |
| `r` / `shift-r` | rename the tab / space |
| `:` | command palette |
| `m` | `move` mode: `hjkl` swaps panes until `escape` |
| `?` | list the mode's keys |
| `i` | Insert mode |
| `escape` | cancel a pending key (after `g`), close the keys list |

`go` holds the keys after `g`, and `move` is the mode `m` enters.

## Configure

Write `~/.config/herdr-vim/keys.json`. Its format is Herdr's `keys.json`, with modes in place of sections:

```json
{
  "normal": {
    "h": "herdr-vim.go:left",
    "l": { "command": "herdr-vim.go", "args": { "direction": "right", "edge": "tab.next", "nvim": "alt+l" } },
    "shift-h": "pane.swap:left",
    "/": "herdr-vim.insert:mod.open:herdr-fff",
    "space": "herdr-vim.once:leader",
    "i": "herdr-vim.insert",
    "escape": "herdr-vim.insert"
  },
  "leader": {
    "e": "herdr-vim.insert:mod.open:herdr-nvim",
    "r": { "command": "layout.resize", "args": { "id": "sidebar", "px": 240 } }
  }
}
```

As with Herdr's own `keys.json`, your file replaces the defaults entirely: start from a copy of [default-keys.json](mods/herdr-vim/default-keys.json). It is read each time you enter Normal mode.

- **Modes** are the top-level sections. `herdr-vim.normal` and `Escape Escape` enter `normal`.
- **Keys** are spelled as in Herdr's `keys.json`: `h`, `shift-h`, `ctrl-d`, `escape`, `space`, `tab`. A symbol can also be written as the character it types: `?`, `:`, `&`, `²`.
- **Actions** are Herdr's: a command (`"pane.zoom"`), a command whose value fills its first argument (`"pane.go:left"`), or `{ "command": "...", "args": { ... } }`. `herdr-app commands` lists every command. herdr-vim adds its own, written as a mod's commands are in Herdr:

| Action | Does |
| --- | --- |
| `herdr-vim.go:<direction>` | focus the pane `left`, `right`, `up` or `down`, as Herdr's `pane.go`, one move at a time: keys typed while a move lands wait their turn instead of reaching the new pane's program. Arguments: `edge`, an action for when there is no pane that way (`"tab.next"`, as zellij's `move_focus_or_tab`), and `nvim`, a key sent to the pane instead when it runs nvim (`"alt+l"`, for a plugin such as smart-splits.nvim that moves among nvim's splits and hands the move back to Herdr at its edge) |
| `herdr-vim.insert` | back to Insert mode |
| `herdr-vim.insert:<action>` | back to Insert mode, then run the action: for anything that opens a dialog or another mod, which then gets the keyboard |
| `herdr-vim.type:<text>` | back to Insert mode, then type the text into the terminal: with `²` bound to `herdr-vim.normal`, `"²": "herdr-vim.type:²"` in `normal` makes `² ²` type `²`. Keys typed while it goes in follow it |
| `herdr-vim.mode:<mode>` | switch to that mode |
| `herdr-vim.once:<mode>` | take the next key from that mode, then come back: key sequences such as `g t` |
| `herdr-vim.help` | show or hide the mode's keys |

As in nvim, an unbound key does nothing. `escape` closes the keys list first; then, unless the mode binds it (`"escape": "herdr-vim.insert"` returns to Insert mode), it cancels what is pending: a key after `g`, then a mode other than `normal`. A config error shows as a notification.

## License

MIT
