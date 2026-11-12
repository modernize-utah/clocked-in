import { LogSection } from "./log-section";

export default function LogLayout({ children }: LayoutProps<"/log">) {
  return <LogSection>{children}</LogSection>;
}
