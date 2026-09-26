import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Handle Recharts ResizeObserver errors during unmount
window.addEventListener('error', (event) => {
  if (event.message === 'ResizeObserver loop completed with undelivered notifications.' ||
      event.message === 'ResizeObserver loop limit exceeded' ||
      event.error === undefined) {
    event.stopPropagation();
    event.preventDefault();
  }
});

window.addEventListener('unhandledrejection', (event) => {
  if (event.reason === undefined || event.reason === null) {
    event.preventDefault();
  }
});

createRoot(document.getElementById("root")!).render(<App />);
