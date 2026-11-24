import { Text } from "@react-email/components";
import { bodyText, EmailLayout } from "./components/layout";

export const accessRequestDecided = {
  id: "access-request-decided",
  subject: "Your access request was {{decision}}",
  variables: ["tenantName", "decision", "name"],
};

export default function AccessRequestDecidedEmail({
  tenantName = "Harbor Volunteers",
  decision = "approved",
  name = "there",
}: {
  tenantName?: string;
  decision?: string;
  name?: string;
}) {
  return (
    <EmailLayout
      preview={`Your request for more access in ${tenantName} was ${decision}.`}
      title="Access request update"
    >
      <Text style={bodyText}>
        Hi {name}, your request for more access in {tenantName} was {decision}.
      </Text>
    </EmailLayout>
  );
}
