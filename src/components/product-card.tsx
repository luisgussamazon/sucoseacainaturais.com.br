import { productPhotoSrc } from "@/lib/product-photo";
import { ProductImage } from "./product-image";
import { Product, Batch } from "@prisma/client";
import { redeem } from "@/lib/actions";
import { Coins, Clock3 } from "lucide-react";
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
  return (
    <article className="product-card">
      <div className="product-image">
        <ProductImage src={productPhotoSrc(product)} alt={product.name} />
        <span className="product-category">{product.category}</span>
        {expires && (
          <span className="expiry">
            <Clock3 size={13} />
            Validade {date(expires)}
          </span>
        )}
      </div>
      <div className="product-content">
        <h3>{product.name}</h3>
        <p>{product.description}</p>
        <div className="stock">
          <span className={`stock-dot ${stock ? "" : "out"}`} />
          {stock
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
                  : "Resgatar"}
            </button>
          </form>
        </div>
      </div>
    </article>
  );
}
