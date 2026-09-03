# Third-party notices

`src/mp3-encoder.wasm` contains LAME 4.0, distributed under the GNU Library General Public License version 2.

- Source: <https://downloads.sourceforge.net/project/lame/lame/4.0/lame-4.0.tar.gz>
- SHA-256: `3df5124d5ad3a98312ffd7ba6a9b36230e4f8a3e66d3ce0f425e336c32d216eb`
- Built artifact SHA-256: `f2108ac22910269624cf6dd6efdd20de1ff58858d45994f470497d24a16f0f0f`
- License: <https://www.gnu.org/licenses/old-licenses/lgpl-2.0.html>

Run `pnpm run build:encoder` to rebuild the replaceable WebAssembly module from that source using the toolchain pinned in the build script.
