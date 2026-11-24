export function POST() {
  return Response.json({ code: "not_found", message: "Not found." }, { status: 404 });
}
