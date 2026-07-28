import { redirect } from "next/navigation";

export default function AdminMembersPage() {
  redirect("/admin/operations?area=people-and-launch#people-and-launch");
}
