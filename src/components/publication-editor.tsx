import { FileText, ImagePlus } from "lucide-react";
import {
  CommunityForm,
  PhotoUpload,
  PhotoGallery,
  DescriptionField,
} from "./community-client";
import { categories } from "@/lib/community-options";
type Post = {
  id: string;
  title: string;
  description: string;
  status: string;
  category: string;
  publishedAt: Date;
  pinned: boolean;
  albumId: string | null;
  eventId: string | null;
  imageAuthorization: boolean;
  restrictedChecked: boolean;
  media: { id: string }[];
};
export function PublicationEditor({
  post,
  albums,
  events,
  photos,
}: {
  post?: Post;
  albums: { id: string; title: string }[];
  events: { id: string; title: string }[];
  photos: boolean;
}) {
  const iso = (d: Date) =>
    new Date(d.getTime() - 3 * 3600000).toISOString().slice(0, 16);
  return (
    <section className="panel publication-editor" id="editor">
      <div className="community-card-heading">
        <span className="community-heading-icon">
          <FileText size={23} />
        </span>
        <div>
          <h2>{post ? "Editar publicação" : "Criar publicação"}</h2>
          <p>
            Compartilhe os momentos, eventos e conquistas da nossa comunidade.
          </p>
        </div>
      </div>
      <CommunityForm
        key={post?.id ?? "new"}
        action="post"
        label="Salvar publicação"
        composer
      >
        <input type="hidden" name="id" value={post?.id ?? ""} />
        <div className="publication-fields">
          <label className="field composer-title">
            Título
            <input
              name="title"
              required
              maxLength={5000}
              defaultValue={post?.title}
              placeholder="Digite um título para a publicação"
            />
          </label>
          <label className="field composer-status">
            Status
            <select
              name="status"
              defaultValue={
                post?.status === "PUBLISHED" && post.publishedAt > new Date()
                  ? "SCHEDULED"
                  : (post?.status ?? "DRAFT")
              }
            >
              <option value="DRAFT">Rascunho</option>
              <option value="PUBLISHED">Publicado</option>
              <option value="SCHEDULED">Agendado</option>
              <option value="ARCHIVED">Arquivado</option>
            </select>
          </label>
          <DescriptionField value={post?.description} />
          <label className="field composer-category">
            Categoria
            <select
              name="category"
              defaultValue={post?.category ?? categories[0]}
            >
              {Array.from(
                new Set([...(post ? [post.category] : []), ...categories]),
              ).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="field composer-date">
            Data de publicação (Brasília)
            <input
              type="datetime-local"
              name="publishedAt"
              required
              defaultValue={iso(post?.publishedAt ?? new Date())}
            />
          </label>
          <label className="field composer-album">
            Álbum associado
            <select name="albumId" defaultValue={post?.albumId ?? ""}>
              <option value="">Nenhum</option>
              {albums.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title}
                </option>
              ))}
            </select>
          </label>
          <label className="field composer-event">
            Evento relacionado
            <select name="eventId" defaultValue={post?.eventId ?? ""}>
              <option value="">Nenhum</option>
              {events.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="publication-photos">
          <h3>
            <ImagePlus size={21} /> Adicionar fotos
          </h3>
          {photos ? (
            <PhotoUpload
              compact
              max={Math.max(0, 8 - (post?.media.length ?? 0))}
            />
          ) : (
            <p>O envio de fotos exige permissão individual do administrador.</p>
          )}
          {!!post?.media.length && (
            <>
              <p>Fotografias já salvas</p>
              <PhotoGallery photos={post.media} title={post.title} />
              {photos && (
                <label className="field">
                  Capa existente
                  <select name="coverId">
                    <option value="">
                      Manter capa ou usar a capa selecionada no novo envio
                    </option>
                    {post.media.map((m, i) => (
                      <option key={m.id} value={m.id}>
                        Foto {i + 1}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          )}
        </div>
        <div className="publication-confirmations">
          <label className="check">
            <input
              type="checkbox"
              name="pinned"
              defaultChecked={post?.pinned}
            />
            <span>
              Fixar no topo
              <small>Destaque esta publicação na página principal.</small>
            </span>
          </label>
          <label className="check">
            <input
              type="checkbox"
              name="imageAuthorization"
              defaultChecked={post?.imageAuthorization}
            />
            <span>
              Confirmo autorização válida para uso de todas as imagens.
              <small>
                As imagens respeitam a política de privacidade e de uso de
                imagem.
              </small>
            </span>
          </label>
          <label className="check">
            <input
              type="checkbox"
              name="restrictedChecked"
              defaultChecked={post?.restrictedChecked}
            />
            <span>
              Revisei a ausência de informações restritas.
              <small>Não há dados pessoais sensíveis ou confidenciais.</small>
            </span>
          </label>
        </div>
      </CommunityForm>
    </section>
  );
}
