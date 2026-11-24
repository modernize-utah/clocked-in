import { Link, Section, Text } from "@react-email/components";
import { bodyText, codeBox, codeText, EmailLayout, linkText, quietText } from "./components/layout";

export const invitation = {
  id: "invitation",
  subject: "{{tenantName}} invited you to join VolunTime",
  variables: ["targetKind", "targetName", "tenantName", "roleName", "username", "code", "url"],
};

export default function InvitationEmail({
  targetKind = "Tenant",
  targetName = "Harbor Volunteers",
  tenantName = "Harbor Volunteers",
  roleName = "Staff",
  username = "jsmith",
  code = "482913",
  url = "http://localhost:3025/accept?code=482913",
}: {
  targetKind?: string;
  targetName?: string;
  tenantName?: string;
  roleName?: string;
  username?: string;
  code?: string;
  url?: string;
}) {
  return (
    <EmailLayout
      preview={`Log your volunteer hours with ${tenantName}.`}
      title="You have an invite"
    >
      <Text style={bodyText}>
        {tenantName} invited you to join the {targetKind} {targetName} as {roleName}.
      </Text>
      <Text style={bodyText}>Your username will be {username}.</Text>
      <Text style={bodyText}>Use this code to accept the invite:</Text>
      <Section style={codeBox}>
        <Text style={codeText}>{code}</Text>
      </Section>
      <Text style={quietText}>The code expires in 7 days.</Text>
      <Text style={bodyText}>
        Enter the code at <Link href={url} style={linkText}>{url}</Link>
      </Text>
    </EmailLayout>
  );
}
