import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// No StrictMode: its double-invoked effects would replay Janani's greeting and reopen the microphone.
createRoot(document.getElementById("root")!).render(<App />);
