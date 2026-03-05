import { redirect } from "next/navigation";

export default function AuthResetRedirect() {
  redirect("/reset-password");
}