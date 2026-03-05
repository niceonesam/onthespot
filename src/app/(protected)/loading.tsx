export default function Loading() {
  const Sk = (props: {
    w: number | string;
    h: number;
    r?: number;
    style?: any;
  }) => (
    <div
      style={{
        width: props.w,
        height: props.h,
        borderRadius: props.r ?? 10,
        background: "#e5e7eb",
        animation: "otsPulse 1.2s ease-in-out infinite",
        ...props.style,
      }}
    />
  );

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      {/* AppShell-like header */}
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
          {/* Pin + title */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <Sk w={24} h={24} r={999} style={{ background: "#dbeafe" }} />
            <Sk w={120} h={18} r={8} style={{ background: "#e5e7eb" }} />
          </div>

          {/* Subtitle */}
          <Sk
            w={220}
            h={14}
            r={8}
            style={{
              background: "#eef2f7",
              maxWidth: 320,
            }}
          />
        </div>

        {/* Right controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Sk w={120} h={30} r={12} />
          <Sk w={140} h={30} r={12} />
          <Sk w={90} h={30} r={12} />
        </div>
      </header>

      {/* Body (matches list + map layout) */}
      <main
        style={{
          flex: 1,
          minHeight: 0,
          background: "var(--background)",
          color: "var(--foreground)",
        }}
      >
        <div style={{ height: "100%", minHeight: 0 }} className="ots-page ots-page--full">
          <div
            className="ots-layout"
            style={{
              height: "100%",
              width: "100%",
              minHeight: 0,
              padding: 12,
              gap: 12,
              alignItems: "stretch",
            }}
          >
            {/* Left list skeleton */}
            <aside
              className="ots-list ots-surface ots-surface--border"
              style={{
                padding: 12,
                borderRadius: 12,
                overflow: "hidden",
              }}
            >
              <Sk w={140} h={18} r={8} style={{ marginBottom: 12 }} />

              <div style={{ display: "grid", gap: 10 }}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    style={{
                      border: "1px solid rgba(0,0,0,0.10)",
                      borderRadius: 12,
                      padding: 10,
                      background: "white",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <Sk w="65%" h={16} r={8} />
                      <Sk w={44} h={14} r={8} style={{ background: "#eef2f7" }} />
                    </div>
                    <Sk w="45%" h={12} r={8} style={{ marginTop: 8, background: "#eef2f7" }} />
                    <Sk w="90%" h={12} r={8} style={{ marginTop: 10 }} />
                    <Sk w="78%" h={12} r={8} style={{ marginTop: 6 }} />
                    <Sk w={76} h={12} r={8} style={{ marginTop: 10, background: "#dbeafe" }} />
                  </div>
                ))}
              </div>

              <Sk w="100%" h={42} r={12} style={{ marginTop: 12, background: "#eef2f7" }} />
            </aside>

            {/* Right map skeleton */}
            <div
              className="ots-map"
              style={{
                position: "relative",
                borderRadius: 12,
                overflow: "hidden",
                minHeight: 0,
              }}
            >
              <Sk w="100%" h={9999} r={12} style={{ height: "100%", background: "#e5e7eb" }} />

              {/* Spot card skeleton (bottom-left) */}
              <div
                className="ots-surface ots-surface--shadow"
                style={{
                  position: "absolute",
                  left: 12,
                  bottom: 12,
                  width: 360,
                  maxWidth: "calc(100% - 24px)",
                  padding: 12,
                  pointerEvents: "none",
                }}
              >
                <Sk w="70%" h={18} r={8} />
                <Sk w="100%" h={160} r={10} style={{ marginTop: 10, background: "#eef2f7" }} />
                <Sk w="55%" h={12} r={8} style={{ marginTop: 10, background: "#eef2f7" }} />
                <Sk w="95%" h={12} r={8} style={{ marginTop: 10 }} />
                <Sk w="88%" h={12} r={8} style={{ marginTop: 6 }} />
                <Sk w={84} h={12} r={8} style={{ marginTop: 10, background: "#dbeafe" }} />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}