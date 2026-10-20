import {
  communityActor,
  CommunityMoments,
  MyRecognitionConsent,
  MyPhotoParticipationHistory,
} from "@/components/community-server";
import { PageTitle } from "@/components/ui";
export default async function Moments({
  searchParams,
}: {
  searchParams: Promise<{ album?: string; page?: string }>;
}) {
  const user = await communityActor(),
    params = await searchParams;
  return (
    <>
      <PageTitle
        eyebrow="NOSSA EQUIPE, NOSSAS CONQUISTAS"
        title="Momentos VBJ2"
        description="Ações, eventos e conquistas registrados pela equipe."
      />
      <CommunityMoments
        user={user}
        albumId={params.album}
        page={Math.max(1, Math.min(100, Number(params.page) || 1))}
      />
      <details id="minhas-conquistas" className="panel">
        <summary>Minhas atividades concluídas e autorizações</summary>
        <MyRecognitionConsent user={user} />
        <MyPhotoParticipationHistory user={user} />
      </details>
    </>
  );
}
