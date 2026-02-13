import React, { useState, useRef } from "react";
import api from "../api";

const ProductSearchForList = ({ onSelect }) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef(null);

  const handleChange = (value) => {
    setQuery(value);
    if (timerRef.current) clearTimeout(timerRef.current);

    if (value.trim().length < 2) {
      setResults([]);
      return;
    }

    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await api.get(`/api/store?q=${encodeURIComponent(value.trim())}&limit=8`);
        setResults(Array.isArray(data.products) ? data.products : []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }, 350);
  };

  const handleSelect = (item) => {
    onSelect({
      id: item.item_id,
      name: item.item_name,
      price: item.price,
      chain_name: item.chain_name,
    });
    setQuery("");
    setResults([]);
  };

  return (
    <div dir="rtl">
      <div className="position-relative">
        <i className="bi bi-search" style={{
          position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)",
          color: "var(--sc-text-muted)", fontSize: "0.85rem", pointerEvents: "none",
        }}></i>
        <input
          type="text"
          className="form-control sc-input"
          placeholder="חפש מוצר להוספה..."
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          autoFocus
          style={{
            padding: "10px 36px 10px 12px",
            fontSize: "0.88rem",
            borderRadius: "10px",
          }}
        />
      </div>

      {loading && (
        <div className="text-center py-2">
          <small style={{ color: "var(--sc-text-muted)" }}>מחפש...</small>
        </div>
      )}

      {results.length > 0 && (
        <div style={{
          marginTop: "6px",
          border: "1px solid var(--sc-border)",
          borderRadius: "var(--sc-radius)",
          background: "var(--sc-surface)",
          boxShadow: "var(--sc-shadow)",
          maxHeight: "260px",
          overflowY: "auto",
        }}>
          {results.map((item, i) => (
            <div
              key={`${item.item_id}-${item.chain_id}-${i}`}
              onClick={() => handleSelect(item)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "10px 14px",
                cursor: "pointer",
                borderBottom: i < results.length - 1 ? "1px solid var(--sc-border)" : "none",
                transition: "background 0.15s ease",
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = "rgba(79,70,229,0.04)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
            >
              {item.image_url ? (
                <img
                  src={item.image_url}
                  alt={item.item_name}
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "10px",
                    flexShrink: 0,
                    objectFit: "contain",
                    border: "1px solid var(--sc-border)",
                    backgroundColor: "#fff",
                  }}
                  onError={(e) => {
                    e.target.style.display = "none";
                    const placeholder = document.createElement("div");
                    placeholder.style = "width:36px;height:36px;border-radius:10px;flex-shrink:0;background:linear-gradient(135deg,rgba(79,70,229,0.08),rgba(6,182,212,0.06));display:flex;align-items:center;justify-content:center";
                    placeholder.innerHTML = '<i class="bi bi-box-seam" style="font-size:0.9rem;color:var(--sc-primary)"></i>';
                    e.target.parentNode.insertBefore(placeholder, e.target);
                  }}
                />
              ) : (
                <div style={{
                  width: "36px", height: "36px", borderRadius: "10px", flexShrink: 0,
                  background: "linear-gradient(135deg, rgba(79,70,229,0.08), rgba(6,182,212,0.06))",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <i className="bi bi-box-seam" style={{ fontSize: "0.9rem", color: "var(--sc-primary)" }}></i>
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="fw-bold" style={{ fontSize: "0.85rem", lineHeight: 1.3 }}>
                  {item.item_name}
                </div>
                {item.chain_name && (
                  <small style={{ color: "var(--sc-text-muted)", fontSize: "0.75rem" }}>
                    <i className="bi bi-shop me-1"></i>{item.chain_name}
                  </small>
                )}
              </div>
              {item.price && (
                <div style={{
                  fontWeight: 700, color: "var(--sc-primary)",
                  fontSize: "0.9rem", flexShrink: 0,
                }}>
                  ₪{item.price}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProductSearchForList;
