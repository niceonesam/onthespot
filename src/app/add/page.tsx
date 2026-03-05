import AddSpotForm from "@/components/AddSpotForm";
import { Suspense } from "react";

export default function AddSpotPage() {
  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <Suspense fallback={<div style={{ padding: 16 }}>Loading…</div>}>
        <AddSpotForm />
      </Suspense>
    </div>
  );
}