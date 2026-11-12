import { authenticate } from "@/lib/api/access";
import { deleteMyAvatar, uploadMyAvatar } from "@/lib/api/features/avatar";
import { validation } from "@/lib/api/errors";
import { respond } from "@/lib/api/respond";

export function POST(request: Request) {
  return respond(async () => {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      validation("Choose an image to upload.");
    }

    return uploadMyAvatar(await authenticate(request), form.get("file"));
  });
}

export function DELETE(request: Request) {
  return respond(async () => deleteMyAvatar(await authenticate(request)));
}
