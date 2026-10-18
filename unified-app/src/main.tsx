import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";
// Side-effect imports: initialise i18next and keep <html lang> in sync before
// the first paint, so there is no flash of the wrong language or direction.
import "@/lib/i18n";
import "@/lib/documentLanguage";
import { ThemeProvider } from "@/lib/theme";
import App from "./App.tsx";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root element #root is missing from index.html");
}

createRoot(container).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>
);
