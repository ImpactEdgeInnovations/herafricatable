import { redirect } from "next/navigation";

export default function AdminReleasePage() {
  redirect("/admin/operations?area=release-tools#release-tools");
}
