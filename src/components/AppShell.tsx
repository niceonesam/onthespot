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
              gap: 10,
              textDecoration: "none",
              color: "#0F2A44",
              minWidth: 0,
            }}
            aria-label="OnTheSpot home"
          >
            <img
              src="/brand/onthespot-logo.svg"
              alt="OnTheSpot logo"
              style={{
                display: "block",
                height: 36,
                width: "auto",
                maxWidth: "min(60vw, 240px)",
                objectFit: "contain",
              }}
            />
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