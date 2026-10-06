/// <reference types="vite/client" />

declare const __SHOP_PIN_HASH__: string;
declare const __DEMO__: boolean;
declare const __MANUAL__: boolean;

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}
