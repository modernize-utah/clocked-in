import { Text } from "@react-email/components";
import { bodyText, EmailLayout } from "./components/layout";

export const needSubmitted = {
  id: "need-submitted",
  subject: "Need waiting for approval: {{needName}}",
  variables: ["tenantName", "needName", "managerName"],
};

export default function NeedSubmittedEmail({
  tenantName = "Harbor Volunteers",
  needName = "Ushers",
  managerName = "Alex",
}: {
  tenantName?: string;
  needName?: string;
  managerName?: string;
}) {
  return (
    <EmailLayout preview={`${managerName} submitted ${needName} for approval.`} title="Need submitted">
      <Text style={bodyText}>
        {managerName} submitted “{needName}” in {tenantName} for admin approval.
      </Text>
    </EmailLayout>
  );
}
