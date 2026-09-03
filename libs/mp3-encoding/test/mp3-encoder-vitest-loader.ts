import fs from "node:fs";

const mp3EncoderModule = new WebAssembly.Module(
  fs.readFileSync(new URL("../src/mp3-encoder.wasm", import.meta.url)),
);

export default mp3EncoderModule;
