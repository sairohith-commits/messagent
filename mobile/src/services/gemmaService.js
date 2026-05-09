// Gemma on-device inference service — manages model lifecycle and generates replies.
// Wraps localInference.js, which provides the native bridge to the LLM engine.
// Actual native integration (react-native-llama.cpp / MediaPipe) is wired in localInference.js.

import * as FileSystem from 'expo-file-system';
import AsyncStorage    from '@react-native-async-storage/async-storage';
import { loadModel, runInference, unloadModel } from './localInference';

const MODEL_DIR          = `${FileSystem.documentDirectory}models/`;
const MODEL_VERSION_KEY  = '@messagent/model_version';

let _initialized   = false;
let _modelVersion  = null;

// ─── INIT ─────────────────────────────────────────────────────────────────────

/**
 * Check whether the model file is present and, if so, load it into the native engine.
 * Safe to call multiple times — returns immediately if already initialized.
 *
 * @returns {Promise<{ ready: boolean, version: string | null }>}
 */
export async function initGemma() {
  if (_initialized) return { ready: true, version: _modelVersion };

  // Check which model version was last downloaded
  const version = await AsyncStorage.getItem(MODEL_VERSION_KEY);
  if (!version) {
    return { ready: false, version: null }; // no model downloaded yet
  }

  // Derive the model filename from the version string (same convention as modelUpdater.js)
  // In practice the URL's basename is stored alongside the version — here we reconstruct it.
  const dirInfo = await FileSystem.getInfoAsync(MODEL_DIR);
  if (!dirInfo.exists) {
    return { ready: false, version: null };
  }

  // Find the first .bin / .gguf file in the models directory
  const files = await FileSystem.readDirectoryAsync(MODEL_DIR).catch(() => []);
  const modelFile = files.find((f) => f.endsWith('.bin') || f.endsWith('.gguf'));
  if (!modelFile) {
    return { ready: false, version: null };
  }

  const modelPath = `${MODEL_DIR}${modelFile}`;

  try {
    await loadModel(modelPath);
    _initialized  = true;
    _modelVersion = version;
    return { ready: true, version };
  } catch (err) {
    console.error('[gemmaService] Failed to load model:', err.message);
    return { ready: false, version: null };
  }
}

// ─── REPLY GENERATION ─────────────────────────────────────────────────────────

/**
 * Generate a reply to an incoming message using the on-device Gemma model.
 * Falls back to a polite fallback string if the model is not ready.
 *
 * @param {{
 *   message:  string,
 *   mode:     'owner' | 'assistant',
 *   userName: string,
 * }} opts
 * @returns {Promise<string>} Generated reply text
 */
export async function generateReply({ message, mode, userName }) {
  if (!_initialized) {
    // Model not yet downloaded or failed to load — return a safe fallback
    return `Hi! ${userName} will get back to you shortly.`;
  }

  const prompt = buildPrompt({ message, mode, userName });

  try {
    const text = await runInference(prompt, { maxTokens: 200, temperature: 0.7 });
    return text.trim() || `Thanks for your message! ${userName} will reply soon.`;
  } catch (err) {
    console.error('[gemmaService] Inference error:', err.message);
    return `Hi! ${userName} will get back to you shortly.`;
  }
}

/**
 * Release the model from memory. Call when the app goes to background.
 */
export async function releaseGemma() {
  if (!_initialized) return;
  await unloadModel();
  _initialized = false;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function buildPrompt({ message, mode, userName }) {
  if (mode === 'owner') {
    // Persona mode: reply as if you ARE the user
    return (
      `You are ${userName}. Reply naturally and briefly to the following message as if you wrote it yourself. ` +
      `Be friendly and concise. Do not mention AI or that you are replying on behalf of anyone.\n\n` +
      `Message: ${message}\n\nReply:`
    );
  }

  // Assistant mode: reply as a professional assistant
  return (
    `You are a professional assistant for ${userName}. ` +
    `Reply politely to the following message and let the sender know that ${userName} is currently unavailable ` +
    `but will respond soon. Keep the reply concise.\n\n` +
    `Message: ${message}\n\nReply:`
  );
}
