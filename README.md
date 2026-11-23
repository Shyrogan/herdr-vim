# herdr-vim

vim's modes for the [Herdr](https://herdr.dev) desktop app.

Herdr as it is becomes Insert mode: every key goes to the focused terminal, your shell, nvim or agent. `Escape Escape` enters Normal mode, as `tnoremap <Esc><Esc> <C-\><C-n>` leaves a terminal in nvim. There, keys drive Herdr instead: `hjkl` moves between panes, `v` and `s` split, `x` closes, `g t` goes to the next tab, and so on. You stay in Normal mode until `i` takes you back to Insert mode. You can add modes and rebind every key, in a `keys.json` written exactly like Herdr's.

## How it works

herdr-vim is two Herdr mods. `herdr-vim` is Normal mode (and any other mode): entering it opens a small badge at the top of the window that takes the keyboard. Each key runs a Herdr command or switches mode. Leaving to Insert mode closes the badge, and so does clicking elsewhere.

`herdr-vim-escape` handles `Escape` in a terminal. The first `Escape` goes on to the program at once, so nvim, agents and shells get it as before (in Claude Code, it still interrupts a running turn). A second `Escape` within 300 ms enters Normal mode instead of reaching the program. Keys typed after a single `Escape`, such as `:w` in nvim, never pass through herdr-vim.

Herdr has no modes of its own, so the badge is what holds the keyboard while you're in a mode other than Insert.

## Install

### By hand

```sh
mkdir -p ~/.config/herdr-app/mods/herdr-vim ~/.config/herdr-app/mods/herdr-vim-escape
cp mods/herdr-vim/{main.js,mod.json,default-keys.json} ~/.config/herdr-app/mods/herdr-vim/
cp mods/herdr-vim-escape/* ~/.config/herdr-app/mods/herdr-vim-escape/
```

Then send a terminal's `Escape` to herdr-vim in `~/.config/herdr-app/keys.json`, as [mods/herdr-vim/keys.json](mods/herdr-vim/keys.json) does:

```json
{
  "terminal": {
    "escape": "mod.open:herdr-vim-escape"
  }
}
```

You can also bind a key of your own to `mod.open:herdr-vim`, which enters Normal mode directly.

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

`programs.herdr-vim.keys` writes `~/.config/herdr-vim/keys.json` (see Configure). The `escape` binding still goes in Herdr's `keys.json`.

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
| `escape` | cancel a pending key (after `g`) |

`go` holds the keys after `g`, and `move` is the mode `m` enters.

## Configure

Write `~/.config/herdr-vim/keys.json`. Its format is Herdr's `keys.json`, with modes in place of sections:

```json
{
  "normal": {
    "h": "pane.go:left",
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

- **Modes** are the top-level sections. `mod.open:herdr-vim` enters `normal`.
- **Keys** are spelled as in Herdr's `keys.json`: `h`, `shift-h`, `ctrl-d`, `escape`, `space`, `tab`. A shifted symbol can also be written as the character it types: `?`, `:`, `&`.
- **Actions** are Herdr's: a command (`"pane.zoom"`), a command whose value fills its first argument (`"pane.go:left"`), or `{ "command": "...", "args": { ... } }`. `herdr-app commands` lists every command. herdr-vim adds its own, written as a mod's commands are in Herdr:

| Action | Does |
| --- | --- |
| `herdr-vim.insert` | back to Insert mode |
| `herdr-vim.insert:<action>` | back to Insert mode, then run the action: for anything that opens a dialog or another mod, which then gets the keyboard |
| `herdr-vim.mode:<mode>` | switch to that mode |
| `herdr-vim.once:<mode>` | take the next key from that mode, then come back: key sequences such as `g t` |
| `herdr-vim.help` | show or hide the mode's keys |

As in nvim, an unbound key does nothing, so `escape` only cancels a pending key unless a mode binds it. A config error shows in the badge.

## License

MIT
