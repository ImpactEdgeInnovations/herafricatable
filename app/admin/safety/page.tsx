import { redirect } from "next/navigation";

export default function AdminSafetyPage() {
  redirect("/admin/operations?area=safety-work#safety-work");
}
