/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_NIMIQ_HUB_URL?: string;
  /** Social handle stamped on share cards and prefilled in posts. */
  readonly VITE_SOCIAL_HANDLE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
