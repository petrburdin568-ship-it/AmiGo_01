type AppShellProps = {
  title: string;
  description: string;
  children: React.ReactNode;
  mode?: "default" | "chat" | "plain";
  eyebrowContent?: React.ReactNode;
};

export function AppShell({
  children,
  mode = "default"
}: AppShellProps) {
  if (mode === "chat") {
    return <section className="chat-page">{children}</section>;
  }

  if (mode === "plain" || mode === "default") {
    return <section className="page-section stack-xl">{children}</section>;
  }
}
