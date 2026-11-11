import { navigate, back, usePath } from "../router";
import { BottomNav, Header } from "../components/nav";
import { OfflineBanner, StateView } from "../components/display";
import { PrimaryButton, TextButton } from "../components/buttons";
import { Avatar } from "../components/display";
import { ROLE_LABEL, TABS, canOpen, homeScreen } from "../auth/roles";
import { useSession } from "../auth/Session";
import { SCREENS } from "../screens/registry";
import { useData } from "../data/DataProvider";
import { t } from "../i18n";

/** Home titles greet by name ("Hi Ama"); only the greeting word is translated. */
const greet = (title: string) => { const m = title.match(/^Hi (.+)$/); return m ? t("Hi {name}", { name: m[1] }) : title; };

export function AppShell() {
  const { user, session, signOut } = useSession();
  const path = usePath();
  const { online } = useData();
  if (!user) return null;

  const tabs = TABS[user.role];
  const [screenId, ...rest] = path.replace(/^\/app\/?/, "").split("/");
  const screen = screenId || homeScreen(user.role);
  const param = rest.join("/") || undefined;
  const def = SCREENS[screen];
  const isRoot = tabs.some((t) => t.screen === screen);

  let body;
  if (!def) body = <StateView kind="error" plain text={t("We couldn't find that page.")} action={<PrimaryButton onClick={() => navigate(`/app/${homeScreen(user.role)}`)}>{t("Go to my home")}</PrimaryButton>} />;
  else if (!canOpen(user.role, screen)) body = <StateView kind="error" plain text={t("You don't have access to that page.")} action={<PrimaryButton onClick={() => navigate(`/app/${homeScreen(user.role)}`)}>{t("Go to my home")}</PrimaryButton>} />;
  else body = def.render(param);

  const allowed = def && canOpen(user.role, screen);
  return (
    <div className="shell">
      {!online && <OfflineBanner mode="offline" />}
      {allowed ? (isRoot
        ? <Header kind="home" greeting={greet(def.title)} subtitle={def.caption} />
        : <Header kind="inner" title={def.title} caption={def.caption} onBack={back} />) : <Header kind="inner" title="HealthConnect" onBack={back} />}
      <div className="whoami" aria-label={t("Signed in as")}>
        <Avatar name={user.name} />
        <span className="whoami-text">
          <span className="body-strong">{user.name}</span>
          <span className="caption">{t(ROLE_LABEL[user.role])}</span>
          {session?.mode === "test" && <span className="caption">{t("Test mode")}</span>}
        </span>
        {/* Test mode only: a live account has one role, chosen by the server. Sign out lives in Me. */}
        {session?.mode === "test" && <TextButton onClick={() => signOut()}>{t("Switch account")}</TextButton>}
      </div>
      <main className="shell-body" id="main">{body}</main>
      <div className="shell-nav">
        <BottomNav tabs={tabs.map((t) => ({ key: t.screen, label: t.label, icon: t.icon }))} active={isRoot ? screen : ""} onSelect={(k) => navigate(`/app/${k}`)} />
      </div>
    </div>
  );
}
