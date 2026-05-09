// Model version service — exposes the current on-device Gemma model info to free-tier mobile clients

'use strict';

/**
 * Return the current published Gemma model version info.
 *
 * In production, set MODEL_VERSION, MODEL_URL, MODEL_SIZE_MB, and MODEL_MIN_APP_VERSION
 * in the environment. Bump MODEL_VERSION whenever a new model is released — mobile
 * clients compare this against their locally stored version and prompt an update.
 *
 * @returns {{
 *   version:        string,
 *   url:            string,
 *   sizeMb:         number,
 *   minAppVersion:  string,
 * }}
 */
function getCurrentModelVersion() {
  return {
    version:       process.env.MODEL_VERSION        ?? 'gemma-2b-it-q4-v1.0',
    url:           process.env.MODEL_URL             ?? '',
    sizeMb:        Number(process.env.MODEL_SIZE_MB  ?? 1400),
    minAppVersion: process.env.MODEL_MIN_APP_VERSION ?? '1.0.0',
  };
}

module.exports = { getCurrentModelVersion };
