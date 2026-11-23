{
  description = "vim's modes for the Herdr desktop app";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = {
    self,
    nixpkgs,
  }: let
    systems = ["x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin"];
    forAll = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
  in {
    # The mods, in share/herdr-vim/mods/.
    packages = forAll (pkgs: {
      default = pkgs.runCommand "herdr-vim" {} ''
        mkdir -p $out/share/herdr-vim/mods
        cp -r ${./mods}/. $out/share/herdr-vim/mods/
      '';
    });

    homeManagerModules.default = {
      config,
      lib,
      pkgs,
      ...
    }: let
      cfg = config.programs.herdr-vim;
      mod = "${cfg.package}/share/herdr-vim/mods/herdr-vim";
    in {
      options.programs.herdr-vim = {
        enable = lib.mkEnableOption "herdr-vim, vim's modes for the Herdr desktop app";
        package = lib.mkOption {
          type = lib.types.package;
          default = self.packages.${pkgs.stdenv.hostPlatform.system}.default;
          description = "The herdr-vim mod.";
        };
        keys = lib.mkOption {
          type = lib.types.nullOr (lib.types.attrsOf (lib.types.attrsOf lib.types.anything));
          default = null;
          example = lib.literalExpression ''
            let defaults = builtins.fromJSON (builtins.readFile "''${pkgs.herdr-vim}/share/herdr-vim/mods/herdr-vim/default-keys.json");
            in defaults // { normal = defaults.normal // { "/" = "herdr-vim.insert:mod.open:herdr-fff"; }; }
          '';
          description = ''
            Written to ~/.config/herdr-vim/keys.json, in the format of Herdr's
            keys.json with modes for sections. Like Herdr's keys.json, it
            replaces the default keys entirely. Null keeps the defaults.
          '';
        };
      };

      config = lib.mkIf cfg.enable {
        # File by file, so the mod folder stays writable for the app's type files.
        xdg.configFile = {
          "herdr-app/mods/herdr-vim/main.js".source = "${mod}/main.js";
          "herdr-app/mods/herdr-vim/mod.json".source = "${mod}/mod.json";
          "herdr-app/mods/herdr-vim/default-keys.json".source = "${mod}/default-keys.json";
          "herdr-vim/keys.json" = lib.mkIf (cfg.keys != null) {
            text = builtins.toJSON cfg.keys;
          };
        };
      };
    };

    # alejandra alone reads stdin when `nix fmt` passes no paths.
    formatter =
      forAll (pkgs:
        pkgs.writeShellScriptBin "fmt" ''exec ${pkgs.lib.getExe pkgs.alejandra} "''${@:-.}"'');
  };
}
