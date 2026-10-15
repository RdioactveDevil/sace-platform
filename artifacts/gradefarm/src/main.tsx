import { createRoot } from "react-dom/client";
import App from "./App";
import { installApiAuth } from "./lib/apiAuth";
import "./index.css";

installApiAuth();

createRoot(document.getElementById("root")!).render(<App />);
