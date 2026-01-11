import React from "react";
import ReactDOM from "react-dom/client";
import { ServerConfigProvider } from "./contexts/ServerConfigContext";
import { AuthProvider } from "./contexts/AuthContext";
import { UserStatusProvider } from "./contexts/UserStatusContext";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ServerConfigProvider>
      <AuthProvider>
        <UserStatusProvider>
          <App />
        </UserStatusProvider>
      </AuthProvider>
    </ServerConfigProvider>
  </React.StrictMode>,
);
