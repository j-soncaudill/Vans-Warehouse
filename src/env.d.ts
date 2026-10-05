/// <reference types="vite/client" />

declare const __SHOP_PIN_HASH__: string;

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}
