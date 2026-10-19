export const categories = [
  "Ações do RH",
  "Eventos",
  "Reconhecimento",
  "Comunicados",
  "Campanhas",
  "Conquistas da operação",
] as const;
export const missionCategories = [
  "5S",
  "Segurança",
  "Sustentabilidade",
  "Engajamento",
  "Aprendizagem",
  "Outros",
] as const;
export const permissions = [
  { key: "publish", label: "Criar publicações" },
  { key: "photos", label: "Enviar e gerenciar fotos" },
  { key: "albums", label: "Criar e editar álbuns" },
  { key: "events", label: "Criar eventos" },
  { key: "missions", label: "Criar missões" },
  { key: "review", label: "Avaliar evidências" },
  { key: "recognize", label: "Publicar reconhecimentos" },
  { key: "moderate", label: "Moderar comentários" },
] as const;
export const statusLabels = {
  DRAFT: "Rascunho",
  PUBLISHED: "Publicado",
  SCHEDULED: "Agendado",
  ARCHIVED: "Arquivado",
};
