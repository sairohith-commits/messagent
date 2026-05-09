// Agent Zustand store — manages per-platform AI agent configuration,
// local model state, and on-device Gemma initialisation status.

import { create } from 'zustand';
import { get, put } from '../services/api';
import { DEFAULT_PLATFORMS } from '../constants/theme';
import { checkForModelUpdate, downloadAndSaveModel } from '../services/modelUpdater';
import { initGemma } from '../services/gemmaService';

function patchPlatform(platforms, platformKey, updates) {
  return platforms.map((p) =>
    p.platform === platformKey ? { ...p, ...updates } : p,
  );
}

function mergeWithDefaults(apiPlatforms = []) {
  return DEFAULT_PLATFORMS.map((def) => {
    const saved = apiPlatforms.find((p) => p.platform === def.platform);
    return saved
      ? {
          platform:      saved.platform,
          enabled:       saved.enabled,
          mode:          saved.mode,
          replyMode:     saved.replyMode     ?? 'auto',
          scheduleStart: saved.scheduleStart ?? null,
          scheduleEnd:   saved.scheduleEnd   ?? null,
        }
      : { ...def, replyMode: 'auto' };
  });
}

export const useAgentStore = create((set, get) => ({
  // ── Platform configs ────────────────────────────────────────────────────────
  platforms: DEFAULT_PLATFORMS,
  isLoading: false,

  // ── Remote model update state (shown in Settings for free users) ────────────
  modelVersion:         null,
  modelUpdateAvailable: false,
  modelDownloading:     false,
  modelProgress:        0,
  modelDownloadUrl:     null,

  // ── On-device Gemma state ───────────────────────────────────────────────────
  // status: 'not_downloaded' | 'downloading' | 'ready' | 'error'
  gemmaState: {
    status:          'not_downloaded',
    version:         null,
    updateAvailable: false,
    progress:        0,
  },

  // ── fetchSettings ───────────────────────────────────────────────────────────
  fetchSettings: async () => {
    set({ isLoading: true });
    try {
      const data = await get('/agent/settings');
      set({ platforms: mergeWithDefaults(data.platforms) });
    } catch (err) {
      console.warn('[agentStore] fetchSettings failed:', err.message);
    } finally {
      set({ isLoading: false });
    }
  },

  // ── togglePlatform (optimistic) ─────────────────────────────────────────────
  togglePlatform: async (platformKey, enabled) => {
    const prev = get().platforms;
    const next = patchPlatform(prev, platformKey, { enabled });
    set({ platforms: next });
    try {
      await put('/agent/settings', { platforms: next });
    } catch (err) {
      set({ platforms: prev });
      throw err;
    }
  },

  // ── setMode (optimistic) ────────────────────────────────────────────────────
  setMode: async (platformKey, mode) => {
    const prev = get().platforms;
    const next = patchPlatform(prev, platformKey, { mode });
    set({ platforms: next });
    try {
      await put('/agent/settings', { platforms: next });
    } catch (err) {
      set({ platforms: prev });
      throw err;
    }
  },

  // ── setReplyMode (optimistic) ───────────────────────────────────────────────
  setReplyMode: async (platformKey, replyMode) => {
    const prev = get().platforms;
    const next = patchPlatform(prev, platformKey, { replyMode });
    set({ platforms: next });
    try {
      await put('/agent/settings', { platforms: next });
    } catch (err) {
      set({ platforms: prev });
      throw err;
    }
  },

  // ── setSchedule (optimistic) ────────────────────────────────────────────────
  setSchedule: async (platformKey, scheduleStart, scheduleEnd) => {
    const prev = get().platforms;
    const next = patchPlatform(prev, platformKey, { scheduleStart, scheduleEnd });
    set({ platforms: next });
    try {
      await put('/agent/settings', { platforms: next });
    } catch (err) {
      set({ platforms: prev });
      throw err;
    }
  },

  // ── checkAndUpdateModel ─────────────────────────────────────────────────────
  checkAndUpdateModel: async () => {
    try {
      const info = await checkForModelUpdate();

      if (!info.updateAvailable) {
        set({ modelVersion: info.version ?? get().modelVersion, modelUpdateAvailable: false });
        return;
      }

      set({
        modelUpdateAvailable: true,
        modelVersion:         info.version,
        modelDownloadUrl:     info.url,
      });
    } catch (err) {
      console.warn('[agentStore] checkAndUpdateModel failed:', err.message);
    }
  },

  // ── downloadModel ───────────────────────────────────────────────────────────
  downloadModel: async () => {
    const { modelDownloadUrl, modelVersion } = get();
    if (!modelDownloadUrl) return;

    set({ modelDownloading: true, modelProgress: 0 });
    try {
      await downloadAndSaveModel(
        modelDownloadUrl,
        modelVersion,
        (pct) => set({ modelProgress: pct }),
      );
      set({ modelDownloading: false, modelProgress: 100, modelUpdateAvailable: false });

      // After a successful download, automatically initialise the model
      await get().initializeGemma();
    } catch (err) {
      set({ modelDownloading: false });
      console.warn('[agentStore] downloadModel failed:', err.message);
      throw err;
    }
  },

  // ── initializeGemma ─────────────────────────────────────────────────────────
  // Called on app start for free-tier users. Checks model presence, downloads
  // if needed, and updates gemmaState throughout.
  initializeGemma: async () => {
    // Mark as "checking"
    set((s) => ({ gemmaState: { ...s.gemmaState, status: 'not_downloaded' } }));

    try {
      // 1. Check if a new version is available from the backend
      await get().checkAndUpdateModel();

      const { modelUpdateAvailable, modelDownloadUrl, modelVersion } = get();

      // 2. If model file already exists on device, try to init it
      const { ready, version } = await initGemma();

      if (ready) {
        set((s) => ({
          gemmaState: {
            ...s.gemmaState,
            status:          'ready',
            version,
            updateAvailable: modelUpdateAvailable,
          },
        }));
        return;
      }

      // 3. No local model — auto-download if a URL is available
      if (modelUpdateAvailable && modelDownloadUrl) {
        set((s) => ({
          gemmaState: { ...s.gemmaState, status: 'downloading', progress: 0 },
        }));

        await downloadAndSaveModel(
          modelDownloadUrl,
          modelVersion,
          (pct) => set((s) => ({ gemmaState: { ...s.gemmaState, progress: pct } })),
        );

        // Re-init after download
        const result = await initGemma();
        set((s) => ({
          gemmaState: {
            ...s.gemmaState,
            status:          result.ready ? 'ready' : 'error',
            version:         result.version,
            updateAvailable: false,
            progress:        100,
          },
          modelDownloading:     false,
          modelUpdateAvailable: false,
        }));
      } else {
        // No model available yet
        set((s) => ({ gemmaState: { ...s.gemmaState, status: 'not_downloaded' } }));
      }
    } catch (err) {
      console.warn('[agentStore] initializeGemma failed:', err.message);
      set((s) => ({ gemmaState: { ...s.gemmaState, status: 'error' } }));
    }
  },
}));
