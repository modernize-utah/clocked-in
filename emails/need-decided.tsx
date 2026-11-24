import { Text } from "@react-email/components";
import { bodyText, EmailLayout } from "./components/layout";

export const needDecided = {
  id: "need-decided",
  subject: "Your need was {{decision}}: {{needName}}",
  variables: ["tenantName", "needName", "decision"],
};

export default function NeedDecidedEmail({
  tenantName = "Harbor Volunteers",
  needName = "Ushers",
  decision = "published",
}: {
  tenantName?: string;
  needName?: string;
  decision?: string;
}) {
  return (
    <EmailLayout preview={`“${needName}” was ${decision}.`} title="Need update">
      <Text style={bodyText}>
        Your need “{needName}” in {tenantName} was {decision}.
      </Text>
    </EmailLayout>
  );
}
