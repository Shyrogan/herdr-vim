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
    # The mod's files, in share/herdr-vim/mods/herdr-vim/.
    packages = forAll (pkgs: {
      default = pkgs.runCommand "herdr-vim" {} ''
        mkdir -p $out/share/herdr-vim/mods
        cp -r ${./mods/herdr-vim} $out/share/herdr-vim/mods/herdr-vim
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
        settings = lib.mkOption {
          type = lib.types.attrsOf lib.types.anything;
          default = {};
          example = lib.literalExpression ''
            {
              modes.normal.keys = {
                "/" = { label = "Find file"; run = "vim.open:herdr-fff"; };
                x = null;
              };
            }
          '';
          description = ''
            Written to ~/.config/herdr-vim/config.json and merged over the
            default keys. See the README for the format.
          '';
        };
      };

      config = lib.mkIf cfg.enable {
        # File by file, so the mod folder stays writable for the app's type files.
        xdg.configFile = {
          "herdr-app/mods/herdr-vim/main.js".source = "${mod}/main.js";
          "herdr-app/mods/herdr-vim/mod.json".source = "${mod}/mod.json";
          "herdr-vim/config.json" = lib.mkIf (cfg.settings != {}) {
            text = builtins.toJSON cfg.settings;
          };
        };
      };
    };

    formatter = forAll (pkgs: pkgs.alejandra);
  };
}
