import {
  mysteryTier,
  storePhotoSrc,
  productItemRange,
} from "@/lib/store-presentation";
import { ProductImage } from "./product-image";
import { Product, Batch } from "@prisma/client";
import { redeem } from "@/lib/actions";
import { Coins, Clock3, Package } from "lucide-react";
import { date, number } from "./ui";
export function ProductCard({
  product,
  balance,
}: {
  product: Product & { batches: Batch[] };
  balance: number;
}) {
  const stock = product.batches.reduce((s, b) => s + b.quantity, 0);
  const expires = product.batches[0]?.expiresAt;
  const disabled = !stock || balance < product.price;
  const tier = mysteryTier(product),
    range = tier ? productItemRange(product.description) : null;
  return (
    <article
      className={
        "product-card" +
        (tier ? " mystery-card tier-" + tier.toLowerCase() : "")
      }
    >
      <div className="product-image">
        <ProductImage src={storePhotoSrc(product)} alt={product.name} />
        <span className="product-category">{product.category}</span>
        {expires && !tier && (
          <span className="expiry">
            <Clock3 size={13} />
            Validade {date(expires)}
          </span>
        )}
      </div>
      <div className="product-content">
        <h3>{product.name}</h3>
        {range ? (
          <details className="product-description">
            <summary>
              <Package size={16} />
              {range}
            </summary>
            <div>
              <p>{product.description}</p>
              <p>
                {number(stock)} unidades disponíveis
                {expires ? " · Validade do próximo lote: " + date(expires) : ""}
              </p>
            </div>
          </details>
        ) : (
          <p>{product.description}</p>
        )}
        <div className={"stock" + (!stock ? " stock-empty" : "")}>
          <span className={`stock-dot ${stock ? "" : "out"}`} />
          {tier
            ? stock
              ? "Disponível para resgate"
              : "Esgotado no momento"
            : stock
              ? `${number(stock)} unidades disponíveis`
              : "Sem estoque disponível"}
        </div>
        <div className="product-bottom">
          <div className="price">
            <Coins size={20} />
            <strong>{number(product.price)}</strong>
            <small>Amazonitos</small>
          </div>
          <form action={redeem}>
            <input type="hidden" name="productId" value={product.id} />
            <input type="hidden" name="quantity" value="1" />
            <button className="button compact" disabled={disabled}>
              {!stock
                ? "Esgotado"
                : disabled
                  ? "Saldo insuficiente"
                  : tier
                    ? "Resgatar agora"
                    : "Resgatar"}
            </button>
          </form>
        </div>
      </div>
    </article>
  );
}
