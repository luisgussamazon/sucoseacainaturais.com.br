"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="empty">
      <h2>Não foi possível concluir esta operação</h2>
      <p>
        Confira os dados informados. Se o problema continuar, contate a
        administração.
      </p>
      <button className="button" onClick={reset}>
        Tentar novamente
      </button>
    </div>
  );
}
