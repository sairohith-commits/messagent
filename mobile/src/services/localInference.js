// Native inference bridge — abstracts the native module for on-device LLM inference.
// Structured so the actual native module (react-native-llama.cpp or MediaPipe LLM)
// can be dropped in as a replacement without changing any callers.

// TODO: when integrating a real native module:
//   1. Install the package (e.g. `npm install react-native-llama.cpp`)
//   2. Replace the placeholder implementations below with real calls
//   3. Ensure the model path points to a gguf/bin file in FileSystem.documentDirectory

let _modelLoaded = false;

/**
 * Load a model from the local filesystem into memory.
 * Must be called before runInference().
 *
 * @param {string} modelPath  Absolute path to the model file on device
 * @returns {Promise<{ ok: boolean }>}
 */
export async function loadModel(modelPath) {
  // TODO: replace with native module call, e.g.:
  // const LlamaContext = await initLlama({ model: modelPath, n_ctx: 2048, n_threads: 4 });
  // _nativeContext = LlamaContext;

  console.log(`[localInference] loadModel called with: ${modelPath} (placeholder)`);
  _modelLoaded = true;
  return { ok: true };
}

/**
 * Run inference on the loaded model with a text prompt.
 *
 * @param {string}  prompt       Full prompt string (system + user message)
 * @param {object}  [options]    Inference parameters
 * @param {number}  [options.maxTokens=256]
 * @param {number}  [options.temperature=0.7]
 * @returns {Promise<string>}    Generated text completion
 */
export async function runInference(prompt, { maxTokens = 256, temperature = 0.7 } = {}) {
  if (!_modelLoaded) {
    throw new Error('[localInference] No model loaded — call loadModel() first');
  }

  // TODO: replace with native module call, e.g.:
  // const result = await _nativeContext.completion({ prompt, n_predict: maxTokens, temperature });
  // return result.text;

  console.log(`[localInference] runInference called (placeholder) — prompt length: ${prompt.length}`);

  // Placeholder: return a clearly marked stub response
  return '[Local AI placeholder — native module not yet integrated]';
}

/**
 * Unload the model from memory to free resources.
 * Call when navigating away from inference-heavy screens or on app background.
 *
 * @returns {Promise<void>}
 */
export async function unloadModel() {
  // TODO: replace with native module call, e.g.:
  // await _nativeContext.release();

  _modelLoaded = false;
  console.log('[localInference] Model unloaded (placeholder)');
}
