import { Link, Text } from "@react-email/components";
import { bodyText, EmailLayout, linkText, quietText } from "./components/layout";

export const accountWelcome = {
  id: "account-welcome",
  subject: "Your account for {{tenantName}}",
  variables: ["tenantName", "username", "password", "url"],
};

export default function AccountWelcomeEmail({
  tenantName = "Harbor Volunteers",
  username = "ada",
  password = "temp-pass-1",
  url = "http://localhost:3025/login",
}: {
  tenantName?: string;
  username?: string;
  password?: string;
  url?: string;
}) {
  return (
    <EmailLayout
      preview={`Your temporary password for ${tenantName} is inside.`}
      title="Your account is ready"
    >
      <Text style={bodyText}>
        An administrator created a VolunTime account for you at {tenantName}.
      </Text>
      <Text style={bodyText}>Username: {username}</Text>
      <Text style={bodyText}>Temporary password: {password}</Text>
      <Text style={quietText}>You will choose a new password the first time you sign in.</Text>
      <Text style={bodyText}>
        Sign in at{" "}
        <Link href={url} style={linkText}>
          {url}
        </Link>
      </Text>
    </EmailLayout>
  );
}
