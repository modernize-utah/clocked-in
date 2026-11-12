import { authenticate } from "@/lib/api/access";
import { createFeedback, listFeedback, parseCreateFeedback } from "@/lib/api/features/feedback";
import { query, readBody } from "@/lib/api/json";
import { respond } from "@/lib/api/respond";
import { uploadFeedbackScreenshots } from "@/lib/server/feedback-assets";

export function GET(request: Request) {
  return respond(async () => listFeedback(await authenticate(request), query(request)));
}

export function POST(request: Request) {
  return respond(async () => {
    const access = await authenticate(request);
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const files = form.getAll("screenshots").filter((item): item is File => item instanceof File && item.size > 0);
      const screenshotUrls = files.length > 0 ? await uploadFeedbackScreenshots(access.caller.id, files) : [];
      const organizationId = String(form.get("organizationId") ?? "").trim();
      return createFeedback(
        access,
        parseCreateFeedback({
          type: String(form.get("type") ?? ""),
          priority: String(form.get("priority") ?? ""),
          area: String(form.get("area") ?? ""),
          title: String(form.get("title") ?? ""),
          description: String(form.get("description") ?? ""),
          screenshotUrls,
          ...(organizationId ? { organizationId } : {}),
        }),
      );
    }
    return createFeedback(access, parseCreateFeedback(await readBody(request)));
  }, 201);
}
