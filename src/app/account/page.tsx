"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

type FriendRow = {
  requester_id: string;
  addressee_id: string;
  status: "pending" | "accepted" | "rejected";
  created_at: string;
  updated_at: string;
};

type GroupRow = {
  id: string;
  owner_id: string;
  name: string;
  created_at: string;
};

type GroupMembershipRow = {
  group_id: string;
  user_id: string;
  role: string;
  created_at: string;
  groups?: Pick<GroupRow, "id" | "name" | "owner_id"> | null;
};

type MyGroup = {
  id: string;
  name: string;
  owner_id: string;
  my_role: string;
};

export default function AccountPage() {
  const supabase = getSupabaseBrowser();

  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState<string>("");
  const [savingName, setSavingName] = useState(false);

  // Profile picture
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarMsg, setAvatarMsg] = useState<string | null>(null);

  const [rows, setRows] = useState<FriendRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const [addEmail, setAddEmail] = useState("");
  const [busy, setBusy] = useState(false);

  // Groups
  const [groups, setGroups] = useState<MyGroup[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [joinGroupId, setJoinGroupId] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [addMemberId, setAddMemberId] = useState<string>("");
  // User labels (resolve user_id -> email / name for nicer UI)
  const [userLabels, setUserLabels] = useState<Record<string, string>>({});
  const [labelsStatus, setLabelsStatus] = useState<string | null>(null);

  // Animate incoming requests out before we update/remove them
  const [animatingOut, setAnimatingOut] = useState<
    Record<string, "accepted" | "rejected">
  >({});
  const animTimersRef = useRef<Record<string, any>>({});

  function rowKey(r: Pick<FriendRow, "requester_id" | "addressee_id">) {
    return `${r.requester_id}->${r.addressee_id}`;
  }

  async function load() {
    setLoading(true);
    setMsg(null);

    const { data: s } = await supabase.auth.getSession();
    const u = s.session?.user;
    if (!u) {
        setUserId(null);
        setEmail(null);
        setDisplayName("");
        setAvatarUrl(null);
        setAvatarPath(null);
        setAvatarFile(null);
        setAvatarMsg(null);
        setRows([]);
        setLoading(false);
        return;
    }

    setUserId(u.id);
    setEmail(u.email ?? null);

    // Load my profile display name and avatar
    const { data: prof, error: profErr } = await supabase
      .from("profiles")
      .select("display_name, avatar_url, avatar_path")
      .eq("id", u.id)
      .maybeSingle();

    if (profErr) {
      // Non-fatal; page still works
      setMsg((prev) => prev ?? profErr.message);
      setDisplayName("");
      setAvatarUrl(null);
      setAvatarPath(null);
    } else {
      setDisplayName(String((prof as any)?.display_name ?? ""));
      const aPath = ((prof as any)?.avatar_path as string | null | undefined) ?? null;
      setAvatarPath(aPath);

      // Private bucket: generate a short-lived signed URL for display
      if (aPath) {
        const { data: signed, error: signedErr } = await supabase.storage
          .from("avatars")
          .createSignedUrl(aPath, 60 * 60); // 1 hour

        if (signedErr) {
          setMsg((prev) => prev ?? signedErr.message);
          setAvatarUrl(null);
        } else {
          setAvatarUrl(signed?.signedUrl ?? null);
        }
      } else {
        setAvatarUrl(null);
      }
    }

    // Load my groups via memberships (two-step to avoid PostgREST embed issues)
    setLoadingGroups(true);

    const { data: gm, error: gmError } = await supabase
      .from("group_members")
      .select("group_id, user_id, role, created_at")
      .eq("user_id", u.id)
      .order("created_at", { ascending: false });

    if (gmError) {
      // Don't fail the whole page; just show a message
      setMsg((prev) => prev ?? gmError.message);
      setGroups([]);
    } else {
      const groupIds = Array.from(
        new Set((gm ?? []).map((r: any) => String(r.group_id)).filter(Boolean))
      );

      let groupsById = new Map<string, { id: string; name: string; owner_id: string }>();

      if (groupIds.length > 0) {
        const { data: gRows, error: gErr } = await supabase
          .from("groups")
          .select("id, name, owner_id")
          .in("id", groupIds);

        if (gErr) {
          setMsg((prev) => prev ?? gErr.message);
        } else {
          (gRows ?? []).forEach((g: any) => {
            const id = String(g.id);
            groupsById.set(id, {
              id,
              name: String(g.name ?? "(unnamed)"),
              owner_id: String(g.owner_id ?? ""),
            });
          });
        }
      }

      const mapped: MyGroup[] = (gm ?? [])
        .map((r: any) => {
          const gid = String(r.group_id);
          const g = groupsById.get(gid);
          return {
            id: gid,
            name: g?.name ?? "(unnamed)",
            owner_id: g?.owner_id ?? "",
            my_role: String(r.role ?? "member"),
          };
        })
        // de-dupe by group id (defensive)
        .filter((g, i, arr) => arr.findIndex((x) => x.id === g.id) === i);

      setGroups(mapped);
      // Default selected group
      if (!selectedGroupId && mapped.length > 0) {
        setSelectedGroupId(mapped[0].id);
      }
    }

    setLoadingGroups(false);

    const { data, error } = await supabase
      .from("friends")
      .select("requester_id, addressee_id, status, created_at, updated_at")
      .or(`requester_id.eq.${u.id},addressee_id.eq.${u.id}`)
      .order("updated_at", { ascending: false });

    if (error) setMsg(error.message);
    setRows((data ?? []) as FriendRow[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const { data: sub } = supabase.auth.onAuthStateChange(() => load());
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clear any pending animation timers on unmount
  useEffect(() => {
    return () => {
      const timers = animTimersRef.current;
      Object.keys(timers).forEach((k) => {
        try {
          clearTimeout(timers[k]);
        } catch {}
      });
    };
  }, []);

  useEffect(() => {
    const ids: string[] = [];

    rows.forEach((r) => {
        ids.push(r.requester_id);
        ids.push(r.addressee_id);
    });

    groups.forEach((g) => {
        if (g.owner_id) ids.push(g.owner_id);
    });

    if (userId) ids.push(userId);

    resolveUserLabels(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rows, groups, userId]);

  const incoming = useMemo(
    () => rows.filter((r) => r.addressee_id === userId && r.status === "pending"),
    [rows, userId]
  );
  const outgoing = useMemo(
    () => rows.filter((r) => r.requester_id === userId && r.status === "pending"),
    [rows, userId]
  );
  const friends = useMemo(() => rows.filter((r) => r.status === "accepted"), [rows]);

  function otherId(r: FriendRow) {
    return r.requester_id === userId ? r.addressee_id : r.requester_id;
  }

  function prettyId(id: string) {
    if (!id) return "";
    return id.length > 14 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
  }

  function userLabel(id: string) {
    return userLabels[id] ?? prettyId(id);
        }

        async function resolveUserLabels(ids: string[]) {
        const uniq = Array.from(new Set(ids.filter(Boolean)));
        if (uniq.length === 0) return;

        // only fetch ids we don't already have
        const missing = uniq.filter((id) => !userLabels[id]);
        if (missing.length === 0) return;

        try {
            setLabelsStatus(null);

            const res = await fetch(
            `/api/user-lookup?ids=${encodeURIComponent(missing.join(","))}`,
            { cache: "no-store" }
            );

            const raw = await res.text().catch(() => "");
            let j: any = null;
            if (raw) {
            try {
                j = JSON.parse(raw);
            } catch {
                j = null;
            }
            }

            if (!res.ok) {
            setLabelsStatus(`Label lookup failed (${res.status})`);
            return;
            }

            // Accept: { map: { [id]: "label" } } OR { users: [{id,email,display_name}] }
            const next: Record<string, string> = {};

            if (j?.map && typeof j.map === "object") {
            Object.entries(j.map).forEach(([id, label]) => {
                if (typeof label === "string" && label.trim()) next[id] = label;
            });
            } else if (Array.isArray(j?.users)) {
            j.users.forEach((u: any) => {
                const id = String(u?.id ?? "");
                const label =
                String(u?.display_name ?? "").trim() ||
                String(u?.email ?? "").trim() ||
                "";
                if (id && label) next[id] = label;
            });
            }

            if (Object.keys(next).length) {
            setUserLabels((prev) => ({ ...prev, ...next }));
            }
        } catch (e: any) {
            setLabelsStatus(`Label lookup error: ${e?.message ?? String(e)}`);
        }
    }

    async function saveDisplayName() {
    if (!userId) {
        setMsg("Please sign in first.");
        return;
    }

    setSavingName(true);
    setMsg(null);

    try {
        const next = displayName.trim();

        const { error } = await supabase
        .from("profiles")
        .update({ display_name: next ? next : null })
        .eq("id", userId);

        if (error) {
        setMsg(error.message);
        return;
        }

        setMsg("Saved ✅");
    } finally {
        setSavingName(false);
    }
    }

  async function uploadProfilePhoto() {
    if (!userId) {
      setAvatarMsg("Please sign in first.");
      return;
    }
    if (!avatarFile) {
      setAvatarMsg("Choose an image first.");
      return;
    }

    setUploadingAvatar(true);
    setAvatarMsg(null);

    try {
      // Store in Supabase Storage. Bucket name: "avatars"
      const ext = avatarFile.name.split(".").pop()?.toLowerCase() || "jpg";
      const safeExt = ext.replace(/[^a-z0-9]/g, "") || "jpg";
      const path = `${userId}/${crypto.randomUUID()}.${safeExt}`;
      console.log("Uploading avatar to bucket=avatars path=", path);

      const up = await supabase.storage
        .from("avatars")
        .upload(path, avatarFile, {
          cacheControl: "3600",
          upsert: false,
          contentType: avatarFile.type || "image/jpeg",
        });

      if (up.error) {
        console.warn("Avatar upload error:", up.error);
        setAvatarMsg(
          `${up.error.message}.\n\nCommon causes:\n- Storage bucket "avatars" doesn't exist (name must match exactly)\n- Bucket blocks this file type/size\n- Storage policies deny uploads`
        );
        return;
      }

      // Private bucket: create a signed URL for immediate preview
      const { data: signed, error: signedErr } = await supabase.storage
        .from("avatars")
        .createSignedUrl(path, 60 * 60); // 1 hour

      if (signedErr) {
        setAvatarMsg(signedErr.message);
        return;
      }

      const signedUrl = signed?.signedUrl ?? null;

      // Save to profile (store path only for private buckets)
      const { error } = await supabase
        .from("profiles")
        .update({ avatar_url: null, avatar_path: path })
        .eq("id", userId);

      if (error) {
        setAvatarMsg(error.message);
        return;
      }

      // Optional: delete the old avatar file if we have one (best-effort)
      if (avatarPath) {
        try {
          await supabase.storage.from("avatars").remove([avatarPath]);
        } catch {
          // ignore
        }
      }

      setAvatarUrl(signedUrl);
      setAvatarPath(path);
      setAvatarFile(null);
      setAvatarMsg("Profile photo updated ✅");

      // Refresh labels elsewhere (friends/groups) if you rely on profile fields later
      load();
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function sendRequestByEmail() {
    setMsg(null);
    const targetEmail = addEmail.trim().toLowerCase();
    if (!targetEmail) return;

    setBusy(true);
    try {
      const res = await fetch(
        `/api/user-lookup?email=${encodeURIComponent(targetEmail)}`,
        { cache: "no-store" }
      );

      // Some errors (404/405/500) may return HTML or an empty body; don't assume JSON.
      const raw = await res.text().catch(() => "");
      let j: any = null;
      if (raw) {
        try {
          j = JSON.parse(raw);
        } catch {
          j = null;
        }
      }

      if (!res.ok) {
        if (res.status === 404) {
          setMsg("User lookup route not found (/api/user-lookup).");
          return;
        }
        if (res.status === 405) {
          setMsg(
            "User lookup route exists but does not allow GET (405). Ensure src/app/api/user-lookup/route.ts exports GET."
          );
          return;
        }
        if (j?.error) {
          setMsg(String(j.error));
          return;
        }
        setMsg(
          raw
            ? `Lookup failed (${res.status}): ${raw.slice(0, 120)}`
            : `Lookup failed (${res.status})`
        );
        return;
      }

      const targetId = (j?.user_id ?? "") as string;
      if (!targetId) {
        setMsg("No matching user found.");
        return;
      }
      if (targetId === userId) {
        setMsg("You can’t friend yourself. Even if you’re delightful.");
        return;
      }

      // ✅ Pre-check existing relationship to show a precise message
      const existing = rows.find(
        (r) =>
          (r.requester_id === userId && r.addressee_id === targetId) ||
          (r.requester_id === targetId && r.addressee_id === userId)
      );

      if (existing) {
        if (existing.status === "accepted") {
          setMsg("You’re already friends with this user.");
          return;
        }
        if (existing.status === "pending") {
          if (existing.requester_id === userId) {
            setMsg("Friend request already sent — it’s still pending.");
            return;
          } else {
            setMsg(
              "They already sent you a friend request — check Incoming requests to accept it."
            );
            return;
          }
        }
        // rejected (or other)
        setMsg(
          "You already have a previous request with this user. Try removing it first, then resend."
        );
        return;
      }

      const { error } = await supabase
        .from("friends")
        .insert({ addressee_id: targetId, status: "pending" });

      if (error) {
        // Fallback: friendly message for unique constraint collisions
        if (
          error.message?.toLowerCase().includes("duplicate") ||
          error.message?.toLowerCase().includes("friends_unique_pair") ||
          (error as any)?.code === "23505"
        ) {
          setMsg(
            "You already have a friend request with this user (pending or accepted)."
          );
        } else {
          setMsg(error.message);
        }
        return;
      }

      setAddEmail("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function accept(requesterId: string) {
    if (!userId) return;

    const k = `${requesterId}->${userId}`;
    setMsg(null);

    // Start animation immediately (optimistic)
    setAnimatingOut((prev) => ({ ...prev, [k]: "accepted" }));

    // Safety: clear any prior timer for this row
    if (animTimersRef.current[k]) clearTimeout(animTimersRef.current[k]);

    const { error } = await supabase
      .from("friends")
      .update({ status: "accepted" })
      .eq("requester_id", requesterId)
      .eq("addressee_id", userId)
      .eq("status", "pending");

    if (error) {
      // Revert animation if DB rejected it
      setAnimatingOut((prev) => {
        const copy = { ...prev };
        delete copy[k];
        return copy;
      });
      setMsg(error.message);
      return;
    }

    // After the fade-out finishes, update local rows so it moves to "Friends"
    animTimersRef.current[k] = setTimeout(() => {
      setRows((prev) =>
        prev.map((r) =>
          r.requester_id === requesterId &&
          r.addressee_id === userId &&
          r.status === "pending"
            ? { ...r, status: "accepted" }
            : r
        )
      );
      setAnimatingOut((prev) => {
        const copy = { ...prev };
        delete copy[k];
        return copy;
      });

      // Background refresh to ensure server truth (no visual jump)
      load();
    }, 220);
  }

  async function reject(requesterId: string) {
    if (!userId) return;

    const k = `${requesterId}->${userId}`;
    setMsg(null);

    // Start animation immediately (optimistic)
    setAnimatingOut((prev) => ({ ...prev, [k]: "rejected" }));

    if (animTimersRef.current[k]) clearTimeout(animTimersRef.current[k]);

    const { error } = await supabase
      .from("friends")
      .update({ status: "rejected" })
      .eq("requester_id", requesterId)
      .eq("addressee_id", userId)
      .eq("status", "pending");

    if (error) {
      setAnimatingOut((prev) => {
        const copy = { ...prev };
        delete copy[k];
        return copy;
      });
      setMsg(error.message);
      return;
    }

    // After fade-out, remove it from local list (we don't need to keep rejected ones visible)
    animTimersRef.current[k] = setTimeout(() => {
      setRows((prev) =>
        prev.filter(
          (r) =>
            !(
              r.requester_id === requesterId &&
              r.addressee_id === userId &&
              r.status === "pending"
            )
        )
      );
      setAnimatingOut((prev) => {
        const copy = { ...prev };
        delete copy[k];
        return copy;
      });
      load();
    }, 220);
  }

  async function removeFriend(other: string) {
    if (!userId) return;
    setBusy(true);
    setMsg(null);
    try {
      const { error } = await supabase
        .from("friends")
        .delete()
        .or(
          `and(requester_id.eq.${userId},addressee_id.eq.${other}),and(requester_id.eq.${other},addressee_id.eq.${userId})`
        );

      if (error) setMsg(error.message);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function createGroup() {
    if (!userId) {
      setMsg("Please sign in first.");
      return;
    }
    const name = groupName.trim();
    if (!name) return;

    setBusy(true);
    setMsg(null);
    try {
      const { data, error } = await supabase
        .from("groups")
        .insert({ owner_id: userId, name })
        .select("id")
        .single();

      if (error) {
        setMsg(error.message);
        return;
      }

      const gid = String((data as any)?.id ?? "");
      if (!gid) {
        setMsg("Created group but did not get an id back.");
        return;
      }

      // Ensure creator is a member (owner)
      const { error: mErr } = await supabase
        .from("group_members")
        .insert({ group_id: gid, user_id: userId, role: "owner" });

      if (mErr) {
        // Group exists; membership insert failed
        setMsg(`Group created but membership failed: ${mErr.message}`);
      }

      setGroupName("");
      await load();
      setSelectedGroupId(gid);
    } finally {
      setBusy(false);
    }
  }

  async function joinGroup() {
    if (!userId) {
      setMsg("Please sign in first.");
      return;
    }
    const gid = joinGroupId.trim();
    if (!gid) return;

    setBusy(true);
    setMsg(null);
    try {
      const { error } = await supabase
        .from("group_members")
        .insert({ group_id: gid, user_id: userId, role: "member" });

      if (error) {
        if ((error as any)?.code === "23505" || error.message.toLowerCase().includes("duplicate")) {
          setMsg("You are already a member of that group.");
        } else {
          setMsg(error.message);
        }
        return;
      }

      setJoinGroupId("");
      await load();
      setSelectedGroupId(gid);
    } finally {
      setBusy(false);
    }
  }

  async function addMemberToSelectedGroup() {
    if (!userId) {
      setMsg("Please sign in first.");
      return;
    }
    if (!selectedGroupId) {
      setMsg("Select a group first.");
      return;
    }
    const memberId = addMemberId.trim();
    if (!memberId) return;

    setBusy(true);
    setMsg(null);
    try {
      const { error } = await supabase
        .from("group_members")
        .insert({ group_id: selectedGroupId, user_id: memberId, role: "member" });

      if (error) {
        if ((error as any)?.code === "23505" || error.message.toLowerCase().includes("duplicate")) {
          setMsg("That user is already in the group.");
        } else {
          setMsg(error.message);
        }
        return;
      }

      setAddMemberId("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title="Account" subtitle="Friends & settings">
      <div style={{ padding: 16, display: "grid", gap: 16 }}>
        <div className="ots-surface ots-surface--border" style={{ padding: 12 }}>
            <strong>Signed in as</strong>
            <div style={{ marginTop: 6, opacity: 0.85 }}>{email ?? "(not signed in)"}</div>

            {/* Profile photo */}
            <div style={{ marginTop: 12, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 999,
                  border: "1px solid rgba(0,0,0,0.15)",
                  background: "#f3f4f6",
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 800,
                  color: "#111",
                }}
                title={avatarUrl ? "Profile photo" : "No photo yet"}
              >
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatarUrl}
                    alt="Profile"
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <span style={{ fontSize: 14 }}>
                    {(displayName || email || "?").trim().slice(0, 1).toUpperCase()}
                  </span>
                )}
              </div>

              <div style={{ display: "grid", gap: 8, minWidth: 260, maxWidth: 520, flex: "1 1 320px" }}>
                <div style={{ fontSize: 13, color: "#333" }}>Profile picture</div>
                <input
                  type="file"
                  accept="image/*"
                  disabled={!userId}
                  onChange={(e) => setAvatarFile(e.target.files?.[0] ?? null)}
                  style={{
                    padding: 10,
                    borderRadius: 12,
                    border: "1px solid rgba(0,0,0,0.2)",
                    background: "white",
                  }}
                />
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={uploadProfilePhoto}
                    disabled={!userId || uploadingAvatar || !avatarFile}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: "1px solid rgba(0,0,0,0.2)",
                      background: "white",
                      cursor: "pointer",
                      fontWeight: 700,
                    }}
                  >
                    {uploadingAvatar ? "Uploading…" : "Upload"}
                  </button>
                  <span style={{ fontSize: 12, opacity: 0.7 }}>
                    JPG/PNG recommended. Stored privately in Supabase Storage (signed URL preview).
                  </span>
                </div>
                {avatarMsg ? (
                  <div style={{ marginTop: 6, color: avatarMsg.includes("✅") ? "#111" : "crimson", whiteSpace: "pre-wrap" }}>
                    {avatarMsg}
                  </div>
                ) : null}
              </div>
            </div>

            <div style={{ marginTop: 12, display: "grid", gap: 10, maxWidth: 520 }}>
                <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, color: "#333" }}>Display name</span>
                <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Sam"
                    maxLength={60}
                    disabled={!userId}
                    style={{
                    padding: 10,
                    borderRadius: 12,
                    border: "1px solid rgba(0,0,0,0.2)",
                    }}
                />
                </label>

                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <button
                    type="button"
                    onClick={saveDisplayName}
                    disabled={!userId || savingName}
                    style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid rgba(0,0,0,0.2)",
                    background: "white",
                    cursor: "pointer",
                    fontWeight: 700,
                    }}
                >
                    {savingName ? "Saving…" : "Save"}
                </button>

                <span style={{ fontSize: 12, opacity: 0.7 }}>
                    This name is shown to friends/groups (fallback is email).
                </span>
                </div>
            </div>
            </div>

        <div className="ots-surface ots-surface--border" style={{ padding: 12 }}>
          <strong>Add a friend</strong>
          <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input
              value={addEmail}
              onChange={(e) => setAddEmail(e.target.value)}
              placeholder="friend@email.com"
              style={{
                padding: 10,
                borderRadius: 12,
                border: "1px solid rgba(0,0,0,0.2)",
                minWidth: 260,
              }}
            />
            <button
              type="button"
              onClick={sendRequestByEmail}
              disabled={busy || !userId}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(0,0,0,0.2)",
                background: "white",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              Send request
            </button>
          </div>
          {msg ? <div style={{ marginTop: 10, color: "crimson" }}>{msg}</div> : null}
          {labelsStatus ? (
            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.65 }}>
                {labelsStatus}
            </div>
            ) : null}
        </div>

        <div className="ots-surface ots-surface--border" style={{ padding: 12 }}>
          <strong>Groups</strong>

          <div style={{ marginTop: 10, display: "grid", gap: 12 }}>
            {/* Create group */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="New group name"
                style={{
                  padding: 10,
                  borderRadius: 12,
                  border: "1px solid rgba(0,0,0,0.2)",
                  minWidth: 260,
                }}
              />
              <button
                type="button"
                onClick={createGroup}
                disabled={busy || !userId || !groupName.trim()}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(0,0,0,0.2)",
                  background: "white",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                Create group
              </button>
            </div>

            {/* Join group */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <input
                value={joinGroupId}
                onChange={(e) => setJoinGroupId(e.target.value)}
                placeholder="Join by Group ID (UUID, e.g. 081b2fac…2f01)"
                style={{
                  padding: 10,
                  borderRadius: 12,
                  border: "1px solid rgba(0,0,0,0.2)",
                  minWidth: 260,
                }}
              />
              <button
                type="button"
                onClick={joinGroup}
                disabled={busy || !userId || !joinGroupId.trim()}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(0,0,0,0.2)",
                  background: "white",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                Join group
              </button>
            </div>

            {/* My groups */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong style={{ fontSize: 14 }}>My groups</strong>
                {loadingGroups ? <span style={{ opacity: 0.7 }}>Loading…</span> : null}
              </div>

              {(!groups || groups.length === 0) ? (
                <div style={{ marginTop: 10, opacity: 0.7 }}>None yet</div>
              ) : (
                <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                  <label style={{ display: "grid", gap: 6, maxWidth: 420 }}>
                    <span style={{ fontSize: 13, color: "#333" }}>Selected group</span>
                    <select
                      value={selectedGroupId ?? ""}
                      onChange={(e) => setSelectedGroupId(e.target.value)}
                      style={{
                        padding: 10,
                        borderRadius: 12,
                        border: "1px solid rgba(0,0,0,0.2)",
                      }}
                    >
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name} ({g.my_role})
                        </option>
                      ))}
                    </select>
                  </label>

                  <div style={{ display: "grid", gap: 8 }}>
                    {groups.map((g) => (
                      <div
                        key={g.id}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 10,
                          alignItems: "center",
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, color: "#111" }}>{g.name}</div>
                          <div style={{ fontSize: 12, opacity: 0.75 }}>
                            id: <code title={g.id}>{prettyId(g.id)}</code>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedGroupId(g.id)}
                          style={{
                            padding: "8px 10px",
                            borderRadius: 12,
                            border: "1px solid rgba(0,0,0,0.2)",
                            background: "white",
                            cursor: "pointer",
                            fontWeight: 700,
                          }}
                        >
                          Select
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Add friend to selected group */}
            <div style={{ display: "grid", gap: 8 }}>
              <strong style={{ fontSize: 14 }}>Add a friend to the selected group</strong>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <select
                  value={addMemberId}
                  onChange={(e) => setAddMemberId(e.target.value)}
                  disabled={!userId || friends.length === 0}
                  style={{
                    padding: 10,
                    borderRadius: 12,
                    border: "1px solid rgba(0,0,0,0.2)",
                    minWidth: 260,
                  }}
                >
                  <option value="">Select a friend…</option>
                  {friends.map((r) => {
                    const other = otherId(r);
                    return (
                      <option key={other} value={other}>
                        {userLabel(other)}
                      </option>
                    );
                  })}
                </select>

                <button
                  type="button"
                  onClick={addMemberToSelectedGroup}
                  disabled={busy || !userId || !selectedGroupId || !addMemberId}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid rgba(0,0,0,0.2)",
                    background: "white",
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  Add to group
                </button>
              </div>

              <div style={{ fontSize: 12, opacity: 0.75 }}>
                Tip: group membership is what unlocks <code>visibility = "group"</code> spots.
              </div>
            </div>
          </div>
        </div>

        <div className="ots-surface ots-surface--border" style={{ padding: 12 }}>
          <strong>Incoming requests</strong>
          {loading ? (
            <div style={{ marginTop: 10 }}>Loading…</div>
          ) : incoming.length === 0 ? (
            <div style={{ marginTop: 10, opacity: 0.7 }}>None</div>
          ) : (
            <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
              {incoming.map((r) => (
                <div
                  key={rowKey(r)}
                  className={
                    animatingOut[rowKey(r)]
                      ? `ots-row-fade-out ots-row-fade-out--${animatingOut[rowKey(r)]}`
                      : ""
                  }
                  style={{ display: "flex", gap: 10, alignItems: "center" }}
                >
                  <code style={{ opacity: 0.75 }}>{userLabel(r.requester_id)}</code>
                  <button
                    type="button"
                    className="ots-btn-accept"
                    onClick={() => accept(r.requester_id)}
                    disabled={busy || Boolean(animatingOut[rowKey(r)])}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    className="ots-btn-reject"
                    onClick={() => reject(r.requester_id)}
                    disabled={busy || Boolean(animatingOut[rowKey(r)])}
                  >
                    Reject
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="ots-surface ots-surface--border" style={{ padding: 12 }}>
          <strong>Outgoing requests</strong>
          {loading ? (
            <div style={{ marginTop: 10 }}>Loading…</div>
          ) : outgoing.length === 0 ? (
            <div style={{ marginTop: 10, opacity: 0.7 }}>None</div>
          ) : (
            <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
              {outgoing.map((r) => (
                <div
                  key={`${r.requester_id}->${r.addressee_id}`}
                  style={{ display: "flex", gap: 10, alignItems: "center" }}
                >
                  <code style={{ opacity: 0.75 }}>{userLabel(r.addressee_id)}</code>
                  <span style={{ opacity: 0.7 }}>pending</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="ots-surface ots-surface--border" style={{ padding: 12 }}>
          <strong>Friends</strong>
          {loading ? (
            <div style={{ marginTop: 10 }}>Loading…</div>
          ) : friends.length === 0 ? (
            <div style={{ marginTop: 10, opacity: 0.7 }}>None yet</div>
          ) : (
            <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
              {friends.map((r) => {
                const other = otherId(r);
                return (
                  <div
                    key={`${r.requester_id}<->${r.addressee_id}`}
                    style={{ display: "flex", gap: 10, alignItems: "center" }}
                  >
                    <code style={{ opacity: 0.75 }}>{userLabel(other)}</code>
                    <button
                      type="button"
                      onClick={() => removeFriend(other)}
                      disabled={busy}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 12,
                        border: "1px solid rgba(0,0,0,0.2)",
                        background: "white",
                        cursor: "pointer",
                        fontWeight: 700,
                      }}
                    >
                      Remove
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}