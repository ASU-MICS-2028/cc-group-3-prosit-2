import { useEffect } from "react";
import { Gallery } from "./gallery/Gallery";
import { SessionProvider, useSession } from "./auth/Session";
import { navigate, usePath } from "./router";
import { homeScreen } from "./auth/roles";
import { Login } from "./shell/Login";
import { AppShell } from "./shell/AppShell";
import { LockScreen, PinSetup } from "./shell/PinScreens";

export function Routes() {
  const path = usePath();
  const { user, locked, pinSet } = useSession();

  // Redirects live in an effect so rendering stays pure.
  useEffect(() => {
    if (path.startsWith("/dev/gallery")) return;
    if (!user) { if (path !== "/login") navigate("/login", { replace: true }); return; }
    if (!pinSet) { if (path !== "/pin") navigate("/pin", { replace: true }); return; }
    if (!path.startsWith("/app")) navigate(`/app/${homeScreen(user.role)}`, { replace: true });
  }, [path, user, pinSet]);

  if (path.startsWith("/dev/gallery")) return <Gallery />;
  if (!user) return <Login />;
  if (locked) return <LockScreen />;
  if (!pinSet) return <PinSetup onDone={() => navigate(`/app/${homeScreen(user.role)}`, { replace: true })} />;
  return <AppShell />;
}

export function App() {
  return <SessionProvider><Routes /></SessionProvider>;
}
