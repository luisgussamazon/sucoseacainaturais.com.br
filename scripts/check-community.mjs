// Read-only deployment verification. Never prints identities, sessions or secrets.
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
try {
  const migration =
    await db.$queryRaw`SELECT migration_name FROM "_prisma_migrations" WHERE migration_name IN ('20261019150000_community_photo_missions','20261019190000_community_individual_access_and_interactions') AND finished_at IS NOT NULL AND rolled_back_at IS NULL`;
  if (migration.length !== 2)
    throw new Error("Community migration not applied");
  const [
    users,
    products,
    orders,
    ledger,
    missions,
    posts,
    albums,
    events,
    evidence,
    grants,
    threads,
    photoComments,
  ] = await Promise.all([
    db.user.count(),
    db.product.count(),
    db.order.count(),
    db.ledger.count(),
    db.mission.count(),
    db.communityPost.count(),
    db.communityAlbum.count(),
    db.communityEvent.count(),
    db.photoEvidence.count(),
    db.communityGrant.count(),
    db.communityThread.count(),
    db.mediaComment.count(),
  ]);
  console.log(
    JSON.stringify({
      status: "ok",
      communityMigration: "applied",
      counts: {
        users,
        products,
        orders,
        ledger,
        missions,
        posts,
        albums,
        events,
        evidence,
        grants,
        threads,
        photoComments,
      },
    }),
  );
} catch {
  console.error(
    "Deployment verification failed: schema or database unavailable.",
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
