import PlacePackEditor from "./PlacePackEditor";

export const dynamic = "force-dynamic";

export default async function PlacePackAdminPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return <PlacePackEditor slug={slug} />;
}