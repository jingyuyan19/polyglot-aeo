#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import process from "node:process";

const DEFAULT_ENDPOINT = "https://api.minimax.io";
const DEFAULT_MODEL = "speech-2.8-hd";
const DEFAULT_VOICE_ID = "Chinese (Mandarin)_Sincere_Adult";
const DEFAULT_FORMAT = "wav";

function parseArgs(argv) {
  const args = {
    endpoint: process.env.MINIMAX_ENDPOINT || DEFAULT_ENDPOINT,
    apiKey: process.env.MINIMAX_API_KEY || "",
    model: process.env.MINIMAX_TTS_MODEL || DEFAULT_MODEL,
    voiceId: process.env.MINIMAX_TTS_VOICE_ID || DEFAULT_VOICE_ID,
    speed: Number(process.env.MINIMAX_TTS_SPEED || "1.16"),
    format: process.env.MINIMAX_TTS_FORMAT || DEFAULT_FORMAT,
    languageBoost: process.env.MINIMAX_TTS_LANGUAGE_BOOST || "auto",
    sampleRate: Number(process.env.MINIMAX_TTS_SAMPLE_RATE || "48000"),
    bitrate: Number(process.env.MINIMAX_TTS_BITRATE || "128000"),
    channel: Number(process.env.MINIMAX_TTS_CHANNELS || "2"),
    volume: Number(process.env.MINIMAX_TTS_VOLUME || "1"),
    pitch: Number(process.env.MINIMAX_TTS_PITCH || "0"),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key.startsWith("--")) continue;
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for ${key}`);
    }
    i += 1;
    switch (key) {
      case "--input":
        args.input = value;
        break;
      case "--output":
        args.output = value;
        break;
      case "--endpoint":
        args.endpoint = value;
        break;
      case "--model":
        args.model = value;
        break;
      case "--voice-id":
        args.voiceId = value;
        break;
      case "--speed":
        args.speed = Number(value);
        break;
      case "--format":
        args.format = value;
        break;
      case "--language-boost":
        args.languageBoost = value;
        break;
      case "--sample-rate":
        args.sampleRate = Number(value);
        break;
      case "--bitrate":
        args.bitrate = Number(value);
        break;
      case "--channels":
        args.channel = Number(value);
        break;
      default:
        throw new Error(`Unknown argument: ${key}`);
    }
  }

  return args;
}

function requireValidArgs(args) {
  if (!args.input) throw new Error("Missing --input");
  if (!args.output) throw new Error("Missing --output");
  if (!args.apiKey) throw new Error("Missing MINIMAX_API_KEY environment variable");
  if (!Number.isFinite(args.speed) || args.speed <= 0) throw new Error("Invalid TTS speed");
  if (!["mp3", "wav", "flac"].includes(args.format)) {
    throw new Error("Invalid format. Use mp3, wav, or flac.");
  }
}

function stripTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

async function synthesize(args) {
  const text = await readFile(args.input, "utf8");
  const endpoint = `${stripTrailingSlash(args.endpoint)}/v1/t2a_v2`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: args.model,
      text,
      stream: false,
      language_boost: args.languageBoost,
      output_format: "hex",
      voice_setting: {
        voice_id: args.voiceId,
        speed: args.speed,
        vol: args.volume,
        pitch: args.pitch,
      },
      audio_setting: {
        sample_rate: args.sampleRate,
        bitrate: args.bitrate,
        format: args.format,
        channel: args.channel,
      },
    }),
  });

  const bodyText = await response.text();
  let payload;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    throw new Error(`MiniMax returned non-JSON response (${response.status}): ${bodyText.slice(0, 300)}`);
  }

  if (!response.ok || payload?.base_resp?.status_code !== 0) {
    const status = payload?.base_resp?.status_code ?? response.status;
    const message = payload?.base_resp?.status_msg ?? bodyText.slice(0, 300);
    throw new Error(`MiniMax TTS failed (${status}): ${message}`);
  }

  const audioHex = payload?.data?.audio;
  if (!audioHex || typeof audioHex !== "string") {
    throw new Error("MiniMax response did not include data.audio hex output");
  }

  await mkdir(dirname(args.output), { recursive: true });
  await writeFile(args.output, Buffer.from(audioHex, "hex"));

  return {
    output: args.output,
    traceId: payload.trace_id,
    audioFormat: payload.extra_info?.audio_format,
    sampleRate: payload.extra_info?.audio_sample_rate,
    audioLengthMs: payload.extra_info?.audio_length,
    usageCharacters: payload.extra_info?.usage_characters,
  };
}

try {
  const args = parseArgs(process.argv.slice(2));
  requireValidArgs(args);
  const result = await synthesize(args);
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
