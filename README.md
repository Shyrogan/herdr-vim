# herdr-vim

vim's modes for the [Herdr](https://herdr.dev) desktop app.

Herdr as it is becomes Insert mode: every key goes to the focused terminal, your shell, nvim or agent. One key enters Normal mode, where keys drive Herdr instead: `hjkl` moves between panes, `v` and `s` split, `x` closes, `g t` goes to the next tab, and so on. You stay in Normal mode until `i` or `Escape` takes you back to Insert mode. You can add modes and rebind every key, in a `keys.json` written exactly like Herdr's.

## How it works

herdr-vim is a single Herdr mod. Entering Normal mode opens it as a small badge at the top of the window that takes the keyboard. Each key runs a Herdr command or switches mode. Leaving to Insert mode closes the badge, and so does clicking elsewhere.

Herdr has no modes of its own, so the badge is what holds the keyboard while you're in a mode other than Insert.

## Install

### By hand

```sh
mkdir -p ~/.config/herdr-app/mods/herdr-vim
cp mods/herdr-vim/{main.js,mod.json,default-keys.json} ~/.config/herdr-app/mods/herdr-vim/
```

Then add the key that enters Normal mode to `~/.config/herdr-app/keys.json`. [mods/herdr-vim/keys.json](mods/herdr-vim/keys.json) suggests `alt-space`:

```json
{
  "global": {
    "alt-space": "mod.open:herdr-vim"
  }
}
```

Pick a key terminal programs don't need. `escape` won't do: nvim and agents rely on it. On a French AZERTY keyboard, `²` (left of `1`) is a good choice.

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

`programs.herdr-vim.keys` writes `~/.config/herdr-vim/keys.json` (see Configure). The key that enters Normal mode still goes in Herdr's `keys.json`.

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
| `i`, `escape` | Insert mode |

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

`escape` returns to Insert mode in any mode that doesn't bind it. A config error shows in the badge.

## License

MIT
