"use client";

import Link from "next/link";
import { ReactNode } from "react";

export default function AppShell(props: {
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  fullBleed?: boolean;
  children: ReactNode;
}) {
  const title = props.title ?? "OnTheSpot";

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <header
        className="ots-header"
        style={{
          padding: "10px 16px",
          borderBottom: "1px solid #e5e5e5",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          background: "white",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <Link
            href="/"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              textDecoration: "none",
              color: "#00fffb",
              minWidth: 0,
            }}
            aria-label="OnTheSpot home"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              aria-hidden="true"
              style={{ display: "block" }}
            >
              <path
                d="M12 22s7-4.35 7-11a7 7 0 1 0-14 0c0 6.65 7 11 7 11z"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              />
              
              <circle cx="12" cy="11" r="2.5" fill="#ffb700" />
            </svg>
            <strong style={{ fontSize: 18, color: "#111", whiteSpace: "nowrap" }}>
              {title}
            </strong>
          </Link>

          {props.subtitle ? (
            <span
              className={
                props.subtitle === "Admin"
                  ? "ots-subtitle ots-subtitle--admin"
                  : "ots-subtitle"
              }
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {props.subtitle}
            </span>
          ) : null}
        </div>

        {props.right ? (
          <div style={{ marginLeft: "auto" }}>{props.right}</div>
        ) : (
          <div style={{ marginLeft: "auto" }} />
        )}
      </header>

      <main
        style={{
          flex: 1,
          minHeight: 0,
          overflow: props.fullBleed ? "hidden" : "auto",
          background: "var(--background)",
          color: "var(--foreground)",
        }}
      >
        <div
            className={props.fullBleed ? "ots-page ots-page--full" : "ots-page"}
            style={{ height: "100%", minHeight: 0 }}
        >
            {props.children}
        </div>
      </main>
    </div>
  );
}