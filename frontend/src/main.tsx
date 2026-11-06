import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// No StrictMode: its double-invoked effects would replay MomCheck's greeting and reopen the microphone.
createRoot(document.getElementById("root")!).render(<App />);
