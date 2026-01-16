// VS Code TypeScript shim for Supabase Edge Functions.
//
// Supabase Edge Functions run on Deno and use URL imports.
// If the Deno VS Code extension isn't active, TypeScript will report:
// - TS2307 Cannot find module 'https://...'
// - TS2304 Cannot find name 'Deno'
//
// This file provides minimal declarations so the editor stays clean.

declare const Deno: {
  env: {
    get(name: string): string | undefined;
  };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

declare module "@supabase/supabase-js" {
  export const createClient: any;
}

declare module "https://deno.land/std@0.224.0/http/server.ts" {
  export function serve(
    handler: (req: Request) => Response | Promise<Response>
  ): void;
}

declare module "https://esm.sh/@supabase/supabase-js@2" {
  export function createClient(...args: any[]): any;
}
