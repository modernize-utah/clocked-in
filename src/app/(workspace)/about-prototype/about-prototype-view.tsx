"use client";

import {
  BarChart3Icon,
  ClockIcon,
  HandCoinsIcon,
  ShieldIcon,
  UserRoundIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useLabels } from "@/hooks/use-labels";
import { useOrganization } from "@/hooks/use-workspace";

const roles = [
  { key: "volunteer", label: "Volunteer" },
  { key: "staff", label: "Staff" },
  { key: "coordinator", label: "Group manager" },
  { key: "admin", label: "Admin" },
] as const;

type RoleKey = (typeof roles)[number]["key"];
type Access = Record<RoleKey, string>;

const ownProfile: Access = {
  volunteer: "Their own profile",
  staff: "Their own profile",
  coordinator: "Their own profile",
  admin: "Their own profile",
};

export function AboutPrototypeView() {
  const organization = useOrganization();
  const copy = useLabels();
  const group = copy.department.toLowerCase();
  const groups = copy.departments.toLowerCase();
  const project = copy.project.toLowerCase();
  const category = copy.taskCategory.toLowerCase();
  const categories = copy.taskCategories.toLowerCase();

  const steps = [
    {
      title: `Name this ${copy.organization.toLowerCase()}`,
      body: "Set the name, website, and description people see on the home page.",
      href: "/organization",
      label: copy.organization,
    },
    {
      title: `Add a ${project} and a ${category}`,
      body: `Add both before anyone can log time. Create ${groups} on the ${copy.departments} screen when you want hours split by team.`,
      href: "/settings/lists",
      label: `${copy.projects} & lists`,
    },
    {
      title: "Invite people",
      body: "Volunteer logs their own hours. Staff can also choose a professional rate. Admin can run the organization with you.",
      href: "/people/invites",
      label: "People",
    },
    {
      title: "Log the first hours",
      body: "Start the timer, enter a start and end, or save a total. The same entry can be repeated across several days.",
      href: "/log/own",
      label: "Log time",
    },
    {
      title: "Open a report",
      body: "Pick a date range, then download the Volunteer Log or the Summary when a grant needs a spreadsheet.",
      href: "/reports",
      label: "Reports",
    },
  ];

  const sections: { label: string; features: { title: string; href?: string; where: string; summary: string; access: Access }[] }[] = [
    {
      label: "Track",
      features: [
        {
          title: "Dashboard",
          href: "/dashboard",
          where: "Track · Dashboard",
          summary: "Hours, in-kind value, volunteer count, your own hours, this week by project, and your recent entries.",
          access: {
            volunteer: "Your hours and entries",
            staff: "Organization totals, plus your entries",
            coordinator: `Totals for their ${groups}`,
            admin: "The whole organization",
          },
        },
        {
          title: "Log your own time",
          href: "/log/own",
          where: "Track · Log time",
          summary: `One live timer at a time — it stays in the header until you stop it — or a saved entry with start and end, or total hours. ${copy.project}, ${category}, notes, and tags are optional.`,
          access: {
            volunteer: "Volunteer rate",
            staff: "Can choose a professional rate",
            coordinator: "Can choose a professional rate",
            admin: "Can choose a professional rate",
          },
        },
        {
          title: "Log member time",
          href: "/log/member",
          where: "Track · Log time",
          summary: "Save start and end, or total hours, for someone else. The entry keeps who it is for and who entered it.",
          access: {
            volunteer: "—",
            staff: "—",
            coordinator: `Active people in their ${groups}`,
            admin: "Any active person",
          },
        },
        {
          title: "Log group time",
          href: "/log/group",
          where: "Track · Log time",
          summary: `One session for a whole ${group}: length times the number of people, at the volunteer rate. The hours are reported with group sessions, separate from each person's total.`,
          access: {
            volunteer: "—",
            staff: "—",
            coordinator: `Sessions for their ${groups}`,
            admin: `Any ${group}`,
          },
        },
        {
          title: "Entries",
          href: "/entries",
          where: "Track · Entries",
          summary:
            "Review, edit, and delete saved time, filtered by date. With time editing turned off in Organization, start, end, and duration stay as saved. Project, category, and notes can still change.",
          access: {
            volunteer: "Own rows",
            staff: "Own rows",
            coordinator: "Own rows",
            admin: "Any person",
          },
        },
      ],
    },
    {
      label: "Analyze",
      features: [
        {
          title: "Reports",
          href: "/reports",
          where: "Analyze · Reports",
          summary: `Summary, People, Group sessions, and Staff, with breakdowns by ${group}, ${category}, ${project}, person, and month. In-kind uses the rate stored on each entry, so a later rate change leaves grant history alone. Download Volunteer Log or Summary CSV.`,
          access: {
            volunteer: "—",
            staff: "Organization, including the Staff tab",
            coordinator: `Their ${groups}`,
            admin: "Organization, staff, and group sessions",
          },
        },
      ],
    },
    {
      label: "Manage",
      features: [
        {
          title: "People",
          href: "/people/invites",
          where: "Manage · People",
          summary:
            "Invite by email with a 6-digit code, or add a person directly. Roles are Volunteer, Staff, and Admin. Assign groups, deactivate someone (access stops, history stays), or remove them. Add time from a person’s row.",
          access: {
            volunteer: "—",
            staff: "—",
            coordinator: `See and invite people in their ${groups}`,
            admin: "Invite, add, roles, groups, deactivate, remove",
          },
        },
        {
          title: `${copy.projects}, ${categories}, and tags`,
          href: "/settings/lists",
          where: `Manage · Settings · ${copy.projects} & lists`,
          summary: `Projects and events people log against. Leave the ${group} as the whole ${copy.organization.toLowerCase()} when everyone should see it, or assign one ${group}. ${copy.taskCategories} and tags are organization-wide.`,
          access: {
            volunteer: "—",
            staff: "—",
            coordinator: `${copy.projects} for their ${groups}`,
            admin: `${copy.projects}, ${categories}, and tags`,
          },
        },
        {
          title: "Organization setup",
          href: "/settings/organization",
          where: "Manage · Settings",
          summary: `Rate year, labels, the time-edit lock, and who is emailed when someone sends feedback. Name, website, and description are on the ${copy.organization.toLowerCase()} page in the account menu. The hourly-rate catalog holds the volunteer default and professional rates. ${copy.departments} are the teams hours roll up to. Themes set colors and fonts, including this page. Brand uploads the mark and wordmarks.`,
          access: {
            volunteer: "—",
            staff: "—",
            coordinator: "—",
            admin: "Organization, rates, groups, theme, and brand",
          },
        },
        {
          title: "Developer",
          href: "/developer/api-keys",
          where: "Manage · Developer",
          summary:
            "Create organization API keys, copy the MCP client config and tool list, and try HTTP routes with your signed-in session. A key secret is shown only when the key is created or rotated.",
          access: {
            volunteer: "—",
            staff: "—",
            coordinator: "—",
            admin: "API keys, MCP, and the HTTP explorer",
          },
        },
      ],
    },
    {
      label: "Your account",
      features: [
        {
          title: "Profile",
          href: "/profile",
          where: "Account menu",
          summary:
            "Name, display name, timezone, phone, ZIP, notes, and password. Punch dates use the timezone. Phone, ZIP, and notes stay on the profile. The same menu opens the current organization, accepts an invite, and signs out.",
          access: ownProfile,
        },
        {
          title: "Feedback",
          where: "Header, and Manage · Feedback",
          summary:
            "Anyone can send a bug or a request from the header. People chosen under Organization get the email. A super admin is a platform flag on the user, and reviews every note in Manage → Feedback.",
          access: {
            volunteer: "Send",
            staff: "Send",
            coordinator: "Send",
            admin: "Send, and choose who is emailed",
          },
        },
        {
          title: "Switch organization",
          where: "Header",
          summary: "Move between organizations you belong to, or create one. Creating an organization opens its own page and makes you its admin.",
          access: {
            volunteer: "Switch, or create and become admin",
            staff: "Switch, or create and become admin",
            coordinator: "Switch, or create and become admin",
            admin: "Switch, or create another",
          },
        },
      ],
    },
  ];

  return (
    <div className="flex flex-col gap-8">
      <section className="overflow-hidden rounded-2xl bg-primary text-primary-foreground ring-1 ring-foreground/10">
        <div className="brand-hero-navy px-6 py-8 sm:px-8 sm:py-10">
          <p className="text-xs font-semibold tracking-[0.22em] text-highlight uppercase">Prototype guide</p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight lg:hidden">Guide</h1>
          <h2 className="mt-3 max-w-3xl font-heading text-3xl font-semibold tracking-tight sm:text-4xl">How this app works</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-primary-foreground/80 sm:text-base">
            {organization.name} uses VolunTime to turn volunteer hours into in-kind value for grants. This page is the map
            for the first person setting it up. Admins open it from Manage.
          </p>
        </div>
        <div className="brand-rule" />
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="start-here">
        <SectionLabel id="start-here">Start here</SectionLabel>
        <ol className="grid gap-3 lg:grid-cols-5">
          {steps.map((step, index) => (
            <li key={step.href} className="flex flex-col rounded-xl bg-card p-4 ring-1 ring-foreground/10">
              <span className="flex size-7 items-center justify-center rounded-full bg-highlight text-sm font-semibold text-primary">
                {index + 1}
              </span>
              <h3 className="mt-3 font-heading text-base font-semibold tracking-tight">{step.title}</h3>
              <p className="mt-1 flex-1 text-sm leading-6 text-muted-foreground">{step.body}</p>
              <Link href={step.href} className="mt-3 text-sm font-medium text-primary underline-offset-4 hover:underline">
                {step.label}
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="roles">
        <SectionLabel id="roles">Roles</SectionLabel>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <RoleCard
            icon={UserRoundIcon}
            tone="success"
            title="Volunteer"
            body="Logs their own time at the volunteer rate. Entries and people reports show their hours."
          />
          <RoleCard
            icon={ClockIcon}
            tone="accent"
            title="Staff"
            body="Logs their own time and can choose a professional rate. Those hours sit on the Staff report, apart from volunteer grant totals. Their other reports cover the organization."
          />
          <RoleCard
            icon={UsersIcon}
            tone="highlight"
            title="Group manager"
            body={`Administers specific ${groups}. Invites people there, logs time for them, records group sessions, and reads those reports. Settings shows People and ${copy.projects} & lists.`}
          />
          <RoleCard
            icon={ShieldIcon}
            tone="primary"
            title="Admin"
            body={`Covers every ${group}, plus organization settings, rates, theme, brand, and Developer. You are reading this because you are an admin.`}
          />
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3" aria-label="How hours become value">
        <ValueNote
          icon={HandCoinsIcon}
          tone="success"
          title="Volunteer in-kind"
          body="Hours times the volunteer rate saved on the entry. This is the grant total on Summary and People."
        />
        <ValueNote
          icon={ClockIcon}
          tone="highlight"
          title="Staff value"
          body="Hours at a professional rate. They stay on the Staff tab."
        />
        <ValueNote
          icon={UsersIcon}
          tone="accent"
          title="Group sessions"
          body="Length times the number of people, at the volunteer rate. Reported on their own tab so people are counted once."
        />
      </section>

      {sections.map((section) => (
        <section key={section.label} className="flex flex-col gap-4" aria-labelledby={`section-${section.label}`}>
          <SectionLabel id={`section-${section.label}`}>{section.label}</SectionLabel>
          <div className="flex flex-col gap-3">
            {section.features.map((feature) => (
              <article key={feature.title} className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                  <h3 className="font-heading text-lg font-semibold tracking-tight">{feature.title}</h3>
                  {feature.href ? (
                    <Link href={feature.href} className="text-xs font-medium text-primary underline-offset-4 hover:underline">
                      {feature.where}
                    </Link>
                  ) : (
                    <p className="text-xs font-medium text-primary">{feature.where}</p>
                  )}
                </div>
                <p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">{feature.summary}</p>
                <dl className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {roles.map((role) => {
                    const value = feature.access[role.key];
                    const quiet = value === "—";
                    return (
                      <div key={role.key} className="rounded-lg bg-muted/70 px-3 py-2">
                        <dt className="text-[0.68rem] font-semibold tracking-[0.16em] text-primary uppercase">{role.label}</dt>
                        <dd className={quiet ? "mt-1 text-sm text-muted-foreground" : "mt-1 text-sm"}>{value}</dd>
                      </div>
                    );
                  })}
                </dl>
              </article>
            ))}
          </div>
        </section>
      ))}

      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <BarChart3Icon className="size-4 text-highlight" />
        Entries count as soon as they are saved.
      </p>
    </div>
  );
}

function SectionLabel({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="text-xs font-semibold tracking-[0.2em] text-primary uppercase">
      {children}
    </h2>
  );
}

function RoleCard({
  icon: Icon,
  tone,
  title,
  body,
}: {
  icon: LucideIcon;
  tone: "success" | "accent" | "highlight" | "primary";
  title: string;
  body: string;
}) {
  const bar = {
    success: "bg-success",
    accent: "bg-brand-accent",
    highlight: "bg-highlight",
    primary: "bg-primary",
  }[tone];
  const iconTone = {
    success: "bg-success/15 text-success",
    accent: "bg-brand-accent/15 text-brand-accent",
    highlight: "bg-highlight/20 text-primary",
    primary: "bg-primary text-primary-foreground",
  }[tone];

  return (
    <article className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
      <div className={`h-1 ${bar}`} />
      <div className="flex flex-col gap-3 p-4">
        <span className={`flex size-8 items-center justify-center rounded-lg ${iconTone}`}>
          <Icon className="size-4" />
        </span>
        <h3 className="font-heading text-base font-semibold tracking-tight">{title}</h3>
        <p className="text-sm leading-6 text-muted-foreground">{body}</p>
      </div>
    </article>
  );
}

function ValueNote({
  icon: Icon,
  tone,
  title,
  body,
}: {
  icon: LucideIcon;
  tone: "success" | "highlight" | "accent";
  title: string;
  body: string;
}) {
  const iconTone = {
    success: "bg-success/15 text-success",
    highlight: "bg-highlight/25 text-primary",
    accent: "bg-brand-accent/15 text-brand-accent",
  }[tone];

  return (
    <div className="flex gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${iconTone}`}>
        <Icon className="size-4" />
      </span>
      <div>
        <h3 className="font-heading text-sm font-semibold">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}
