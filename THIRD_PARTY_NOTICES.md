# Third-Party Notices

Lab Fleet uses open-source dependencies under their respective licenses. The installed npm lockfile is the authoritative dependency inventory.

Significant runtime and packaging dependencies include:

- Electron - MIT License
- React - MIT License
- Vite - MIT License
- Zod - MIT License
- ws - MIT License
- bonjour-service - MIT License
- selfsigned - MIT License
- WinSW - Apache License 2.0
- WiX Toolset 3 - Microsoft Reciprocal License
- Lucide - ISC License

The Windows preparation script downloads the pinned WinSW binary and its license into the release staging directory. WiX is used only as a build tool and is not installed on target computers.

