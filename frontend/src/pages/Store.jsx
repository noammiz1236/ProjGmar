import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import InfiniteScroll from "react-infinite-scroll-component";
import api from "../api";

const Store = () => {
  const navigate = useNavigate();

  const [products, setProducts] = useState([]);
  const [nextOffset, setNextOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const limit = 12;

  // Fetch products
  const fetchProducts = async () => {
    try {
      const response = await api.get(
        `/api/store?limit=${limit}&offset=${nextOffset}`,
      );
      const newProducts = Array.isArray(response.data.products)
        ? response.data.products
        : [];

      setProducts((prev) => [...prev, ...newProducts]);
      setNextOffset(
        response.data.nextOffset || nextOffset + newProducts.length,
      );

      setHasMore(response.data.hasMore ?? false);
    } catch (err) {
      console.error("Error fetching products:", err);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleProductClick = (product) => {
    navigate(`/product/${product.item_id}`, { state: { product } });
  };

  if (loading && products.length === 0) {
    return (
      <div className="store-page">
        <div className="container py-5 text-center">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <p className="mt-3">Loading products...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="store-page">
      <div className="container py-5">
        <h1 className="display-4 fw-bold mb-4">Store</h1>
        <p className="lead text-muted">
          Welcome to our store. Browse our products below.
        </p>

        {products.length === 0 ? (
          <div className="text-center">
            <p className="text-muted">No products available at the moment.</p>
          </div>
        ) : (
          <InfiniteScroll
            dataLength={products.length}
            next={fetchProducts}
            hasMore={hasMore}
            loader={
              <div className="text-center py-3">
                <div className="spinner-border text-primary" role="status">
                  <span className="visually-hidden">Loading...</span>
                </div>
              </div>
            }
            endMessage={<p className="text-center py-3">No more products</p>}
          >
            <div className="row g-4 mt-3">
              {products.map((product, index) => (
                <div key={index} className="col-md-4">
                  <div
                    className="card h-100 shadow-sm"
                    onClick={() => handleProductClick(product)}
                    style={{ cursor: "pointer", transition: "transform 0.2s" }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.transform = "scale(1.05)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.transform = "scale(1)")
                    }
                  >
                    <div className="card-body">
                      <h5 className="card-title">
                        {product.item_name || "Product not found"}
                      </h5>
                      <p className="card-text text-muted mb-2">
                        <strong>Chain:</strong>{" "}
                        {product.chain_name || "Product not found"}
                      </p>
                      <p className="card-text">
                        <strong className="text-primary fs-4">
                          ₪{product.price ?? "Product not found"}
                        </strong>
                      </p>
                      <button className="btn btn-primary w-100">
                        View Details
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </InfiniteScroll>
        )}
      </div>
    </div>
  );
};

export default Store;
