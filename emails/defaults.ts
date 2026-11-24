/**
 * Default copy for tenant email templates. Bodies are the TipTap-safe HTML an admin edits
 * (no inline styles); `wrapEmailHtml` adds the VolunTime chrome and styles at send time.
 * Keep wording in step with the React Email previews in this folder.
 */
export type EmailTemplateDefault = {
  for: string;
  name: string;
  subject: string;
  heading: string;
  preview: string;
  html: string;
};

export const emailTemplateDefaults: EmailTemplateDefault[] = [
  {
    for: "Invite",
    name: "Invitation",
    subject: "{{tenant.name}} invited you to join VolunTime",
    heading: "You have an invite",
    preview: "Log your volunteer hours with {{tenant.name}}.",
    html: [
      "<p>{{tenant.name}} invited you to join the {{invite.targetKind}} {{invite.targetName}} as {{invite.roleName}}.</p>",
      "<p>Your username will be {{user.username}}.</p>",
      "<p>Use this code to accept the invite:</p>",
      "<p>{{invite.code}}</p>",
      "<p><em>The code expires in 7 days.</em></p>",
      '<p>Enter the code at <a href="{{invite.url}}">{{invite.url}}</a></p>',
    ].join(""),
  },
  {
    for: "Welcome",
    name: "Account welcome",
    subject: "Your account for {{tenant.name}}",
    heading: "Your account is ready",
    preview: "Your temporary password for {{tenant.name}} is inside.",
    html: [
      "<p>An administrator created a VolunTime account for you at {{tenant.name}}.</p>",
      "<p>Username: {{user.username}}</p>",
      "<p>Temporary password: {{user.password}}</p>",
      "<p><em>You will choose a new password the first time you sign in.</em></p>",
      '<p>Sign in at <a href="{{account.url}}">{{account.url}}</a></p>',
    ].join(""),
  },
  {
    for: "PasswordReset",
    name: "Password reset",
    subject: "Your VolunTime password reset code",
    heading: "Reset your password",
    preview: "Your VolunTime password reset code is inside.",
    html: [
      "<p>Use this code to reset your VolunTime password:</p>",
      "<p>{{reset.code}}</p>",
      "<p><em>The code expires in 15 minutes. If you did not ask for this, you can ignore this email.</em></p>",
      '<p>Enter the code at <a href="{{reset.url}}">{{reset.url}}</a></p>',
    ].join(""),
  },
  {
    for: "LoggedTime",
    name: "Hours logged",
    subject: "Your hours for {{tenant.name}} were saved",
    heading: "Hours logged",
    preview: "{{entry.hours}} hours were saved on {{entry.date}}.",
    html: [
      "<p>Hi {{user.firstName}},</p>",
      "<p>{{entry.hours}} hours were saved on {{entry.date}}.</p>",
      '<p><a href="{{entry.url}}">Review your hours</a></p>',
    ].join(""),
  },
  {
    for: "UnclassifiedEntry",
    name: "Unclassified time",
    subject: "Please classify your volunteer time",
    heading: "Unclassified time",
    preview: "Your last time entry needs a project, task category, or group.",
    html: [
      "<p>Hi {{user.firstName}}, your last timer save has no project, task category, or group. Classify it or delete it so grant reports stay accurate.</p>",
      '<p><a href="{{entry.url}}">Review unclassified entries</a></p>',
    ].join(""),
  },
  {
    for: "FeedbackReceived",
    name: "Feedback received",
    subject: "Thanks for your {{feedback.typeLabel}}",
    heading: "We got your feedback",
    preview: "Thanks for telling us about {{feedback.title}}.",
    html: [
      "<p>Hi {{user.firstName}},</p>",
      "<p>Thank you for sending this {{feedback.typeLabel}}: {{feedback.title}}. We read every report and use it to make VolunTime better.</p>",
      "<p><em>We will email you again if this is completed.</em></p>",
    ].join(""),
  },
  {
    for: "FeedbackNotify",
    name: "New feedback (admins)",
    subject: "New {{feedback.typeLabel}}: {{feedback.title}}",
    heading: "New feedback received",
    preview: "{{feedback.submitterName}} submitted a {{feedback.typeLabel}}.",
    html: [
      "<p>{{feedback.submitterName}} submitted a {{feedback.typeLabel}}: {{feedback.title}}</p>",
      "<p><em>Priority {{feedback.priorityLabel}} · {{feedback.areaLabel}}</em></p>",
      "<p>{{feedback.description}}</p>",
      '<p>Review it at <a href="{{feedback.url}}">{{feedback.url}}</a></p>',
    ].join(""),
  },
  {
    for: "FeedbackCompleted",
    name: "Feedback completed",
    subject: "Update on your {{feedback.typeLabel}}",
    heading: "Your feedback is complete",
    preview: "An update on {{feedback.title}}.",
    html: [
      "<p>Hi {{user.firstName}},</p>",
      '<p>About your {{feedback.typeLabel}} "{{feedback.title}}": {{feedback.outcome}}.</p>',
      "<p>{{feedback.note}}</p>",
      "<p><em>Thank you for helping us improve VolunTime.</em></p>",
    ].join(""),
  },
  {
    for: "AccessRequestReceived",
    name: "Access request (admins)",
    subject: "Access request for {{tenant.name}}",
    heading: "Access request",
    preview: "{{request.requesterEmail}} asked for more access in {{tenant.name}}.",
    html: "<p>{{request.requesterEmail}} requested more access in {{tenant.name}}. Review the request in People settings.</p>",
  },
  {
    for: "AccessRequestDecided",
    name: "Access request decided",
    subject: "Your access request was {{request.decision}}",
    heading: "Access request update",
    preview: "Your request for more access in {{tenant.name}} was {{request.decision}}.",
    html: "<p>Hi {{user.name}}, your request for more access in {{tenant.name}} was {{request.decision}}.</p>",
  },
  {
    for: "NeedSubmitted",
    name: "Need submitted (admins)",
    subject: "Need waiting for approval: {{need.name}}",
    heading: "Need submitted",
    preview: "{{need.managerName}} submitted {{need.name}} for approval.",
    html: "<p>{{need.managerName}} submitted “{{need.name}}” in {{tenant.name}} for admin approval.</p>",
  },
  {
    for: "NeedDecided",
    name: "Need decided",
    subject: "Your need was {{need.decision}}: {{need.name}}",
    heading: "Need update",
    preview: "“{{need.name}}” was {{need.decision}}.",
    html: "<p>Your need “{{need.name}}” in {{tenant.name}} was {{need.decision}}.</p>",
  },
  {
    for: "VolunteerMessage",
    name: "Message to volunteers",
    subject: "{{message.subject}}",
    heading: "{{need.name}}",
    preview: "A message about {{need.name}}.",
    html: [
      "<p>{{message.body}}</p>",
      "<p><em>This message is about a volunteer need you signed up for. You are not on a mailing list.</em></p>",
    ].join(""),
  },
];
