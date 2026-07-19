import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

if (import.meta.env.DEV && !window.labFleet) {
  const { installMockApi } = await import("./mock-api");
  installMockApi();
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {window.labFleet ? <App /> : <StartupFailure />}
  </React.StrictMode>
);

function StartupFailure(): React.ReactNode {
  return (
    <main className="loading-screen" role="alert">
      <span className="brand-mark large" aria-hidden="true">LF</span>
      <h1>Lab Fleet could not start</h1>
      <p>The secure desktop bridge did not load. Restart the application. If the problem continues, reinstall Lab Fleet.</p>
    </main>
  );
}
