import React from "react";
import ReactDOM from "react-dom/client";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ServerConfigProvider } from "./contexts/ServerConfigContext";
import { AuthProvider } from "./contexts/AuthContext";
import { UserStatusProvider } from "./contexts/UserStatusContext";
import { SocketConnectionProvider } from "./contexts/SocketConnectionContext";
import { MediaDevicesProvider } from "./contexts/MediaDevicesContext";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
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
    </ThemeProvider>
  </React.StrictMode>,
);
