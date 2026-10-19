"use client";
export function CommunityErrorState({ reset }: { reset: () => void }) {
  return (
    <section className="panel community-evidence" role="alert">
      <h2>Não foi possível carregar esta área</h2>
      <p>Tente novamente. Se sua sessão expirou, entre novamente no sistema.</p>
      <button className="button" onClick={reset}>
        Tentar novamente
      </button>
    </section>
  );
}
