"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Camera,
  CalendarDays,
  ImageIcon,
  GraduationCap,
  X,
  ArrowRight,
} from "lucide-react";
import { CommunityForm, PhotoUpload } from "./community-client";
import { completeMission } from "@/lib/actions";
import styles from "./missions.module.css";
export function MissionFeedback() {
  const [message, setMessage] = useState("");
  useEffect(() => {
    const saved = (e: Event) => setMessage((e as CustomEvent<string>).detail);
    window.addEventListener("mission:submitted", saved);
    return () => window.removeEventListener("mission:submitted", saved);
  }, []);
  return message ? (
    <div role="status" className="notice success">
      {message} <Link href="/momentos">Abrir Momentos VBJ2 →</Link>
    </div>
  ) : null;
}
export function MissionActivity({
  id,
  title,
  description,
  reward,
  endsAt,
  photo,
  quiz,
}: {
  id: string;
  title: string;
  description: string;
  reward: number;
  endsAt: string;
  photo?: { id: string; maxPhotos: number; coverId?: string };
  quiz?: { question: string; options: string[] };
}) {
  const [open, setOpen] = useState(false),
    dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  return (
    <article
      className={styles.card}
      data-kind={photo ? "photo" : "quiz"}
      id={"atividade-" + id}
    >
      {photo?.coverId ? (
        <img
          className={styles.cover}
          src={"/api/community/media/" + photo.coverId}
          alt={"Capa: " + title}
        />
      ) : (
        <div className={styles.icon}>
          {photo ? <Camera size={26} /> : <GraduationCap size={28} />}
        </div>
      )}
      <span className={styles.reward}>+{reward} Amazonitos</span>
      <h3>{title}</h3>
      <span className={styles.kind}>{photo ? "Com foto" : "Quiz"}</span>
      <p>{description}</p>
      <div className={styles.meta}>
        <span>
          <CalendarDays size={14} /> Até{" "}
          {new Date(endsAt).toLocaleDateString("pt-BR", {
            timeZone: "America/Sao_Paulo",
          })}
        </span>
        {photo ? (
          <span>
            <ImageIcon size={14} /> Até {photo.maxPhotos} fotos
          </span>
        ) : (
          <span>1 pergunta</span>
        )}
      </div>
      <button
        className="button full"
        style={{ marginTop: "auto", background: photo ? undefined : "#6243ec" }}
        onClick={() => setOpen(true)}
      >
        {photo ? <Camera size={18} /> : <ArrowRight size={18} />}{" "}
        {photo ? "Enviar evidência" : "Responder quiz"}
      </button>
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-label={(photo ? "Enviar evidência: " : "Responder quiz: ") + title}
        onCancel={() => setOpen(false)}
        onClose={() => setOpen(false)}
      >
        <button
          type="button"
          className={styles.close}
          aria-label="Fechar atividade"
          onClick={() => setOpen(false)}
        >
          <X />
        </button>
        <h2>{title}</h2>
        <p>{description}</p>
        {photo ? (
          <>
            <p className={styles.muted}>
              Até {photo.maxPhotos} fotos · JPG, PNG ou WebP · 4 MB por foto. A
              publicação é independente da avaliação da recompensa.
            </p>
            <CommunityForm
              action="submit"
              label="Confirmar envio"
              onSuccess={(message) => {
                window.dispatchEvent(
                  new CustomEvent("mission:submitted", { detail: message }),
                );
                setOpen(false);
              }}
            >
              <input type="hidden" name="photoMissionId" value={photo.id} />
              <PhotoUpload max={photo.maxPhotos} />
              <label className="field">
                Legenda (opcional)
                <textarea
                  name="caption"
                  maxLength={1000}
                  placeholder="Conte sobre sua participação..."
                />
              </label>
              <label className="check">
                <input type="checkbox" name="safeImage" required />
                Confirmo que as fotos são reais, autorizadas e não contêm
                informações confidenciais.
              </label>
              <label className="check">
                <input type="checkbox" name="shareConsent" />
                Autorizo publicar automaticamente estas fotos, minha legenda e
                meu nome em Momentos VBJ2, para a comunidade autenticada, sem
                aprovação manual.
              </label>
              <p className={styles.muted}>
                Sem autorização de publicação, sua evidência permanecerá privada
                para você e os avaliadores autorizados.
              </p>
            </CommunityForm>
          </>
        ) : quiz ? (
          <form action={completeMission}>
            <input type="hidden" name="missionId" value={id} />
            <fieldset>
              <legend>{quiz.question}</legend>
              {quiz.options.map((option, i) => (
                <label className="radio-option" key={i}>
                  <input type="radio" name="answer" value={i} required />
                  {option}
                </label>
              ))}
            </fieldset>
            <button className="button full">Enviar resposta</button>
          </form>
        ) : null}
      </dialog>
    </article>
  );
}
