// Model update service — checks the backend for a newer Gemma model version and
// downloads it to the device using expo-file-system.

import * as FileSystem  from 'expo-file-system';
import AsyncStorage     from '@react-native-async-storage/async-storage';
import { get }          from './api';

const MODEL_VERSION_KEY = '@messagent/model_version';

// Models are saved here so they survive app updates
const MODEL_DIR = `${FileSystem.documentDirectory}models/`;

/**
 * Ensure the models directory exists on the device filesystem.
 */
async function ensureModelDir() {
  const info = await FileSystem.getInfoAsync(MODEL_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(MODEL_DIR, { intermediates: true });
  }
}

/**
 * Compare the backend's published model version against the locally stored one.
 *
 * @returns {Promise<{
 *   updateAvailable: boolean,
 *   version?:        string,
 *   url?:            string,
 *   sizeMb?:         number,
 *   minAppVersion?:  string,
 * }>}
 */
export async function checkForModelUpdate() {
  const [remote, localVersion] = await Promise.all([
    get('/model/version'),
    AsyncStorage.getItem(MODEL_VERSION_KEY),
  ]);

  if (!remote?.version) return { updateAvailable: false };

  const updateAvailable = remote.version !== (localVersion ?? '');
  return updateAvailable
    ? { updateAvailable: true, ...remote }
    : { updateAvailable: false };
}

/**
 * Download a model file to the device.
 *
 * @param {string}   url         Direct download URL for the model weights
 * @param {Function} onProgress  Called with a 0–100 integer during download
 * @returns {Promise<string>} Local filesystem path of the downloaded model
 */
export async function downloadModel(url, onProgress) {
  await ensureModelDir();

  // Derive a stable filename from the URL
  const filename = url.split('/').pop() ?? 'model.bin';
  const localPath = `${MODEL_DIR}${filename}`;

  // FileSystem.createDownloadResumable gives us progress callbacks
  const downloadResumable = FileSystem.createDownloadResumable(
    url,
    localPath,
    {},
    ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
      if (totalBytesExpectedToWrite > 0) {
        const pct = Math.round((totalBytesWritten / totalBytesExpectedToWrite) * 100);
        onProgress?.(pct);
      }
    },
  );

  const result = await downloadResumable.downloadAsync();

  if (result?.status !== 200) {
    throw new Error(`Model download failed (HTTP ${result?.status})`);
  }

  return localPath;
}

/**
 * Download a model and, on success, persist the new version tag to AsyncStorage.
 *
 * @param {string}   url
 * @param {string}   version     Version string to save after a successful download
 * @param {Function} onProgress
 * @returns {Promise<string>} Local path of the saved model file
 */
export async function downloadAndSaveModel(url, version, onProgress) {
  const localPath = await downloadModel(url, onProgress);
  await AsyncStorage.setItem(MODEL_VERSION_KEY, version);
  return localPath;
}
