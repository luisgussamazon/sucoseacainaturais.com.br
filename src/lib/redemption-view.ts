export type RedemptionView = {
  id: string;
  code: string;
  name: string;
  description: string;
  image: string;
  quantity: number;
  cost: number;
  status: "RESERVED" | "COLLECTED" | "CANCELLED";
  createdAt: string;
  collectedAt: string | null;
  collectedByName: string | null;
  cancelledAt: string | null;
  ownerName: string;
  lots: { code: string; quantity: number; expiresAt: string }[];
  postId: string | null;
  postVisible: boolean;
};
