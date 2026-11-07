import { notFound } from "next/navigation";
import { communityActor } from "@/components/community-server";
import { CommunityWorkspace } from "@/components/community-workspace";
import { rights } from "@/lib/community";
export default async function CommunityLayout({children}: {children: React.ReactNode}) {
  const permissions = rights(await communityActor());
  if (!permissions.management) notFound();
  return <CommunityWorkspace permissions={{...permissions, photos: permissions.photos || permissions.manage}}>{children}</CommunityWorkspace>;
}
