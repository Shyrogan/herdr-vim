# herdr-vim

vim's modes for the [Herdr](https://herdr.dev) desktop app.

Herdr as it is becomes Insert mode: every key goes to the focused terminal, your shell, nvim or agent. One key enters Normal mode, where keys drive Herdr instead: `hjkl` moves between panes, `v` and `s` split, `x` closes, `gt` goes to the next tab, and so on. You stay in Normal mode until `i` or `Escape` takes you back to Insert mode. You can define more modes, and every key in every mode comes from a config file.

## How it works

herdr-vim is a single Herdr mod. Entering Normal mode opens it as a small badge at the top of the window that takes the keyboard. Each key runs a Herdr command, opens a group of more keys (shown which-key style), or switches mode. Leaving to Insert mode closes the badge. Clicking elsewhere closes it too.

Herdr has no key sequences or modes of its own, so the badge is what holds the keyboard while you're in a mode other than Insert.

## Install

### With Nix (home-manager)

```nix
{
  inputs.herdr-vim.url = "github:Shyrogan/herdr-vim";
}
```

```nix
{inputs, ...}: {
  imports = [inputs.herdr-vim.homeManagerModules.default];

  programs.herdr-vim = {
    enable = true;
    # Written to ~/.config/herdr-vim/config.json (see Configure).
    settings.modes.normal.keys."/" = {
      label = "Find file";
      run = "vim.open:herdr-fff";
    };
  };
}
```

### By hand

```sh
mkdir -p ~/.config/herdr-app/mods/herdr-vim
cp mods/herdr-vim/* ~/.config/herdr-app/mods/herdr-vim/
```

### The key that enters Normal mode

Bind one in `~/.config/herdr-app/keys.json`. Pick a key that terminal programs don't need. `Escape` won't do: nvim and agents rely on it.

```json
{
  "global": {
    "alt-space": "mod.open:herdr-vim"
  }
}
```

On a French AZERTY keyboard, `²` (left of `1`) is a good choice: `"²": "mod.open:herdr-vim"`.

## Default keys

Normal mode:

| Key | Does |
| --- | --- |
| `h` `j` `k` `l` | focus the pane left, below, above, right |
| `H` `J` `K` `L` | swap the pane that way |
| `v` / `s` | split right / down |
| `x` | close the pane |
| `f` | zoom the pane |
| `t` / `T` | new tab / new space |
| `g t` / `g T` | next / previous tab |
| `g s` / `g S` | next / previous space |
| `1`–`9` (or `&é"'(-è_ç`) | go to that space |
| `n` / `N` | next / previous agent |
| `r` / `R` | rename the tab / space |
| `:` | command palette |
| `m` | Move mode: `hjkl` swaps panes until `Escape` |
| `?` | list the mode's keys |
| `i`, `Escape` | Insert mode |

## Configure

`~/.config/herdr-vim/config.json` is read each time you enter Normal mode, so changes apply the next time you press the key. It's merged over the defaults: the keys you set replace or add to the default ones, `null` unbinds a key, and `"replace": true` on a mode drops all its default keys. [config.example.json](config.example.json) shows every feature.

```json
{
  "start": "normal",
  "modes": {
    "normal": {
      "keys": {
        "/": { "label": "Find file", "run": "vim.open:herdr-fff" },
        "x": null,
        "space": {
          "label": "Leader",
          "keys": {
            "e": { "label": "nvim sidebar", "run": "mod.open:herdr-nvim", "then": "insert" }
          }
        }
      }
    },
    "window": {
      "label": "WINDOW",
      "keys": {
        "z": "pane.zoom",
        "escape": "vim.mode:normal"
      }
    }
  }
}
```

- **`start`**: the mode the entry key opens (default `normal`).
- **`modes`**: each mode has a `label` for the badge, and `keys`.
- **Key names**: the character the key types (`h`, `H`, `/`, `&`, `²`), or the chord as Herdr spells it when it types nothing or has a modifier (`escape`, `space`, `tab`, `shift-tab`, `ctrl-d`).
- **A key's value** is one of:
  - an action;
  - `{ "label": "...", "run": action, "then": "insert" | "<mode>" }`: a labelled action, optionally followed by a mode change. `"hidden": true` keeps it out of the `?` list;
  - `{ "label": "...", "keys": { ... } }`: a group. The key opens it, and the next key picks inside it. An unbound key closes it.
- **Actions**:
  - any Herdr command, written as in `keys.json`: `"pane.go:left"` (the value after `:` fills the command's first argument), or `{ "command": "layout.resize", "args": { "id": "sidebar", "px": 240 } }`. `herdr-app commands` lists them all;
  - `"vim.insert"`: back to Insert mode;
  - `"vim.mode:<name>"`: switch to another mode;
  - `"vim.open:<mod>"` or `{ "command": "vim.open", "args": { "mod": "...", "props": {}, "kind": "popup", "width": 640 } }`: open another mod's overlay. Herdr-vim returns to Insert mode under it, so that mod gets the keyboard;
  - `"vim.help"`: show or hide the list of the mode's keys;
  - an array of actions, run in order.

A config error shows in the badge, and the defaults apply until it's fixed.

## License

MIT
