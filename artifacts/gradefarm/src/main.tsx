import { createRoot } from "react-dom/client";
import App from "./App";
import { installApiAuth } from "./lib/apiAuth";
import "./index.css";
// Titan's handwriting, bundled: Google Fonts is blocked on some school networks,
// and the annotations are laid out for this font.
import "@fontsource/caveat/500.css";
import "@fontsource/caveat/600.css";
import "@fontsource/caveat/700.css";

installApiAuth();

createRoot(document.getElementById("root")!).render(<App />);
