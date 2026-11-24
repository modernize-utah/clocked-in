import { Text } from "@react-email/components";
import { bodyText, EmailLayout } from "./components/layout";

export const accessRequestReceived = {
  id: "access-request-received",
  subject: "Access request for {{tenantName}}",
  variables: ["tenantName", "requesterEmail"],
};

export default function AccessRequestReceivedEmail({
  tenantName = "Harbor Volunteers",
  requesterEmail = "volunteer@example.com",
}: {
  tenantName?: string;
  requesterEmail?: string;
}) {
  return (
    <EmailLayout preview={`${requesterEmail} asked for more access in ${tenantName}.`} title="Access request">
      <Text style={bodyText}>
        {requesterEmail} requested more access in {tenantName}. Review the request in People settings.
      </Text>
    </EmailLayout>
  );
}
