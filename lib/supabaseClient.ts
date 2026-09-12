/**
 * Compatibility shim: browser Supabase client with cookie session (SSR).
 * Prefer importing from `@/lib/supabase/client` in new code.
 */
import { createClient } from "@/lib/supabase/client";

export const supabase = createClient();
