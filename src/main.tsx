import React from "react";
import ReactDOM from "react-dom/client";
import { ServerConfigProvider } from "./contexts/ServerConfigContext";
import { AuthProvider } from "./contexts/AuthContext";
import { UserStatusProvider } from "./contexts/UserStatusContext";
import { SocketConnectionProvider } from "./contexts/SocketConnectionContext";
import { MediaDevicesProvider } from "./contexts/MediaDevicesContext";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ServerConfigProvider>
      <AuthProvider>
        <SocketConnectionProvider>
          <UserStatusProvider>
            <MediaDevicesProvider>
              <App />
            </MediaDevicesProvider>
          </UserStatusProvider>
        </SocketConnectionProvider>
      </AuthProvider>
    </ServerConfigProvider>
  </React.StrictMode>,
);
