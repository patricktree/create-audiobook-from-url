#!/bin/sh

# Abort before publishing an artifact when a command fails or a variable is unset.
set -eu

# Pin every external input by content, not a mutable version or container tag.
# Pinning the output separately also detects toolchain or build-environment drift.
LAME_VERSION="4.0"
LAME_ARCHIVE_SHA256="3df5124d5ad3a98312ffd7ba6a9b36230e4f8a3e66d3ce0f425e336c32d216eb"
EMSCRIPTEN_IMAGE="emscripten/emsdk@sha256:8714ed3a9fb585e662c931259a996bac36a57a8dd34b81e8277436fd77364475"
MP3_ENCODER_SHA256="16d5405c410cf202a56af41d9ee98f88bcffde463cd73273102c4e6034695a0b"

script_directory="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)"
package_directory="$(dirname -- "${script_directory}")"
# Keep downloaded and generated files outside the repository until every check passes.
build_directory="$(mktemp -d "${TMPDIR:-/tmp}/create-audiobook-from-url-lame.XXXXXX")"

# The recursive cleanup target is always the exact directory returned by mktemp.
cleanup() {
  rm -rf -- "${build_directory}"
}

trap cleanup EXIT HUP INT TERM

archive_path="${build_directory}/lame-${LAME_VERSION}.tar.gz"
source_directory="${build_directory}/lame"

mkdir -p "${source_directory}"
# Download on the host so the build container can run without network access. Verify the
# archive before tar parses it; extraction remains confined to the unique temporary directory.
curl --fail --location --retry 3 \
  "https://downloads.sourceforge.net/project/lame/lame/${LAME_VERSION}/lame-${LAME_VERSION}.tar.gz" \
  --output "${archive_path}"

printf '%s  %s\n' "${LAME_ARCHIVE_SHA256}" "${archive_path}" | shasum -a 256 --check
tar -xzf "${archive_path}" --strip-components=1 -C "${source_directory}"

# Container security model:
# - --rm removes the container and its anonymous cache volume after the build.
# - --platform fixes architecture-dependent output for reproducibility.
# - --network none prevents downloaded build code from contacting external services.
# - --cap-drop ALL and no-new-privileges remove privilege-escalation paths.
# - --read-only prevents changes to the pinned image filesystem.
# - The private /tmp cannot expose host devices or honor setuid bits.
# - The numeric host user owns the build directory, avoiding root inside the container.
# - The anonymous Emscripten cache permits required LTO asset generation without a host mount.
# - Native bridge sources are read-only; only the temporary build directory is writable.
# No Docker socket, host credentials, host environment variables, or repository root are passed.
docker run --rm --platform linux/amd64 \
  --network none \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --read-only \
  --tmpfs /tmp:rw,nosuid,nodev \
  --user "$(id -u):$(id -g)" \
  --volume /emsdk/upstream/emscripten/cache \
  --volume "${package_directory}/native:/source:ro" \
  --volume "${build_directory}:/work" \
  --workdir /work \
  "${EMSCRIPTEN_IMAGE}" \
  sh -c '
    set -eu

    cd /work/lame
    # Build only the static encoder surface needed by the bridge. Frontends, decoding, analyzer
    # hooks, GUI integration, and stdio are excluded from the generated module.
    # The pkg-config shim accepts the configure version probe but rejects dependency lookups.
    PKG_CONFIG=/source/pkg-config emconfigure ./configure \
      CFLAGS="-DNDEBUG -DNO_STDIO -Oz -flto" \
      LDFLAGS="-Oz -flto" \
      --prefix=/work/lame-install \
      --disable-dependency-tracking \
      --disable-shared \
      --enable-static \
      --disable-frontend \
      --disable-decoder \
      --disable-analyzer-hooks \
      --disable-gtktest \
      --with-fileio=lame

    emmake make -j8
    emmake make install

    cd /work
    # Emit an initialization-only standalone module with no command entry point, then optimize
    # and strip it to minimize unused runtime surface. Tests separately pin its import list.
    emcc /source/lame-bridge.c lame-install/lib/libmp3lame.a \
      -I lame-install/include \
      -DNDEBUG \
      --no-entry \
      -s MALLOC=emmalloc \
      -s ALLOW_MEMORY_GROWTH \
      -s STANDALONE_WASM \
      -s NO_SUPPORT_ERRNO \
      -Oz \
      -flto \
      -Wl,--strip-all \
      -o mp3-encoder.wasm
  '

# This is the only repository write: refuse it unless the result is byte-for-byte reproducible.
generated_mp3_encoder_sha256="$(shasum -a 256 "${build_directory}/mp3-encoder.wasm" | cut -d ' ' -f 1)"
if [ "${generated_mp3_encoder_sha256}" != "${MP3_ENCODER_SHA256}" ]; then
  printf 'Generated MP3 encoder SHA-256 does not match: expected %s, received %s\n' \
    "${MP3_ENCODER_SHA256}" "${generated_mp3_encoder_sha256}" >&2
  exit 1
fi
cp "${build_directory}/mp3-encoder.wasm" "${package_directory}/src/mp3-encoder.wasm"
