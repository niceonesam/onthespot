"use client";

import AddSpotForm from "@/components/AddSpotForm";
import { useRouter } from "next/navigation";

export default function AddSpotModalPage() {
  const router = useRouter();

  return (
    <div
      onClick={() => router.back()}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "grid",
        placeItems: "center",
        padding: 16,
        zIndex: 1000,
      }}
    >
      <div
        className="ots-surface ots-surface--shadow"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(900px, 100%)",
          maxHeight: "90vh",
          overflow: "auto",
          padding: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: 12,
            borderBottom: "1px solid rgba(0,0,0,0.1)",
          }}
        >
          <strong>Add Spot</strong>
          <button type="button" onClick={() => router.back()}>
            ✕
          </button>
        </div>

        <AddSpotForm />
      </div>
    </div>
  );
}