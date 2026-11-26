import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ReferralPortal } from "./components/ReferralPortal";
import "./style.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {location.pathname.startsWith("/referidos") ? <ReferralPortal /> : <App />}
  </StrictMode>,
);
