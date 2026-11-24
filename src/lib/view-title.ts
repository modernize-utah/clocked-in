export function welcomeTitle(name: string) {
  const first = name.trim().split(/\s+/)[0];
  return first ? `Welcome back, ${first}` : "Welcome back";
}

export function viewTitle(pathname: string | null, name: string, tenantName?: string | null) {
  if (!pathname) return "";
  if (pathname === "/") return tenantName?.trim() || "Home";
  if (pathname === "/dashboard/design") return "Edit dashboard";
  if (pathname.startsWith("/dashboard")) return welcomeTitle(name);
  if (pathname.startsWith("/log")) return "Log time";
  if (pathname.startsWith("/entries")) return "Entries";
  if (pathname.startsWith("/reports")) return "Reports";
  if (pathname === "/tenant/new") return "New tenant";
  if (pathname === "/tenant") return tenantName?.trim() || "Tenant";
  if (pathname.startsWith("/profile")) return "Profile";
  if (pathname.startsWith("/people")) return "People";
  if (pathname.startsWith("/settings")) return "Settings";
  if (pathname.startsWith("/developer")) return "Developer";
  if (pathname.startsWith("/about-prototype")) return "Guide";
  if (pathname.startsWith("/feedback")) return "Feedback";
  if (pathname.startsWith("/needs")) return "Needs";
  return "";
}
