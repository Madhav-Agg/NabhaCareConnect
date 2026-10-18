/// <reference types="vite/client" />

// This file was missing, so TypeScript had no definitions for Vite's static
// asset imports or for `import.meta.env`. The old code worked around it by
// casting (`(import.meta as any).env?.VITE_BACKEND_URL`), which is why a typo in
// an env var name would silently fall through to a hardcoded fallback URL.