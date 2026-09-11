{ pkgs, lib, config, inputs, ... }: {
  packages = with pkgs; [
    vscode
    git

    pkg-config
    wrapGAppsHook4
    librsvg
    webkitgtk_4_1
  ];

  languages = {
    javascript = {
      enable = true;
      package = pkgs.nodejs_24;
      corepack.enable = true;
      yarn.enable = true;
    };
    typescript.enable = true;
    rust = {
      enable = true;
      components = [ "cargo" "rustc" ];
    };
  };
  
  enterShell = ''
    export XDG_DATA_DIRS="$GSETTINGS_SCHEMAS_PATH"
  '';
}
