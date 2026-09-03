#include <emscripten.h>
#include <lame/lame.h>
#include <stdarg.h>
#include <stdint.h>
#include <stdlib.h>

// LAME documents 1.25 * samples + 7200 bytes as sufficient encoder output space.
#define PCM_SAMPLE_CAPACITY 4608
#define MP3_BUFFER_CAPACITY ((PCM_SAMPLE_CAPACITY * 5) / 4 + 7200)
#define ENCODER_ERROR_INVALID_ARGUMENT -1

typedef struct Encoder {
  short *pcm;
  unsigned char *mp3;
  lame_global_flags *lame;
  struct Encoder *next;
} Encoder;

// JavaScript supplies raw numeric handles, so validate membership before dereferencing one.
static Encoder *live_encoders;

static void discard_lame_message(const char *format, va_list arguments) {
  (void)format;
  (void)arguments;
}

static Encoder *find_live_encoder(const Encoder *candidate) {
  Encoder *encoder = live_encoders;

  while (encoder) {
    if (encoder == candidate) {
      return encoder;
    }
    encoder = encoder->next;
  }

  return NULL;
}

static int validate_encoded_byte_length(int encoded_byte_length) {
  // Do not expose adjacent WASM memory if LAME ever violates its output-size contract.
  if (encoded_byte_length > MP3_BUFFER_CAPACITY) {
    return ENCODER_ERROR_INVALID_ARGUMENT;
  }

  return encoded_byte_length;
}

EMSCRIPTEN_KEEPALIVE
Encoder *encoder_create(unsigned int sample_rate, unsigned int bitrate) {
  Encoder *encoder = calloc(1, sizeof(Encoder));
  if (!encoder) {
    return NULL;
  }

  encoder->pcm = malloc(PCM_SAMPLE_CAPACITY * sizeof(short));
  encoder->mp3 = malloc(MP3_BUFFER_CAPACITY);
  encoder->lame = lame_init();
  if (!encoder->pcm || !encoder->mp3 || !encoder->lame) {
    goto cleanup;
  }

  lame_set_errorf(encoder->lame, discard_lame_message);
  lame_set_debugf(encoder->lame, discard_lame_message);
  lame_set_msgf(encoder->lame, discard_lame_message);
  lame_set_num_channels(encoder->lame, 1);
  lame_set_mode(encoder->lame, MONO);
  lame_set_in_samplerate(encoder->lame, sample_rate);
  lame_set_out_samplerate(encoder->lame, sample_rate);
  lame_set_VBR(encoder->lame, vbr_off);
  lame_set_brate(encoder->lame, bitrate);
  lame_set_bWriteVbrTag(encoder->lame, 0);
  lame_set_write_id3tag_automatic(encoder->lame, 0);

  if (lame_init_params(encoder->lame) < 0) {
    goto cleanup;
  }

  encoder->next = live_encoders;
  live_encoders = encoder;

  return encoder;

cleanup:
  if (encoder->lame) {
    lame_close(encoder->lame);
  }
  free(encoder->pcm);
  free(encoder->mp3);
  free(encoder);
  return NULL;
}

EMSCRIPTEN_KEEPALIVE
short *encoder_get_pcm(Encoder *encoder) {
  Encoder *live_encoder = find_live_encoder(encoder);
  return live_encoder ? live_encoder->pcm : NULL;
}

EMSCRIPTEN_KEEPALIVE
unsigned char *encoder_get_mp3(Encoder *encoder) {
  Encoder *live_encoder = find_live_encoder(encoder);
  return live_encoder ? live_encoder->mp3 : NULL;
}

EMSCRIPTEN_KEEPALIVE
int encoder_encode(Encoder *encoder, unsigned int sample_count) {
  Encoder *live_encoder = find_live_encoder(encoder);

  if (!live_encoder) {
    return ENCODER_ERROR_INVALID_ARGUMENT;
  }

  if (sample_count > PCM_SAMPLE_CAPACITY) {
    return ENCODER_ERROR_INVALID_ARGUMENT;
  }

  int encoded_byte_length = lame_encode_buffer(
      live_encoder->lame,
      live_encoder->pcm,
      live_encoder->pcm,
      sample_count,
      live_encoder->mp3,
      MP3_BUFFER_CAPACITY);

  return validate_encoded_byte_length(encoded_byte_length);
}

EMSCRIPTEN_KEEPALIVE
int encoder_flush(Encoder *encoder) {
  Encoder *live_encoder = find_live_encoder(encoder);

  if (!live_encoder) {
    return ENCODER_ERROR_INVALID_ARGUMENT;
  }

  int encoded_byte_length =
      lame_encode_flush(live_encoder->lame, live_encoder->mp3, MP3_BUFFER_CAPACITY);

  return validate_encoded_byte_length(encoded_byte_length);
}

EMSCRIPTEN_KEEPALIVE
void encoder_free(Encoder *encoder) {
  Encoder **link = &live_encoders;

  while (*link && *link != encoder) {
    link = &(*link)->next;
  }

  if (!*link) {
    return;
  }

  Encoder *live_encoder = *link;
  *link = live_encoder->next;

  lame_close(live_encoder->lame);
  free(live_encoder->pcm);
  free(live_encoder->mp3);
  free(live_encoder);
}
