import React, { useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";

const ProductPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [quantity, setQuantity] = useState(1);

  // will need to change to db request
  const defaultProduct = {
    name: "Product not found",
    price: "Product not found",
    description: "Product not found",
    chain_name: "Product not found",
    image: "Product not found",
  };

  const product = {
    name: location.state?.product?.name || defaultProduct.name,
    price: location.state?.product?.price || defaultProduct.price,
    description:
      location.state?.product?.description || defaultProduct.description,
    chain_name:
      location.state?.product?.chain_name || defaultProduct.chain_name,
    image: location.state?.product?.image || defaultProduct.image,
  };

  const handleQuantityChange = (e) => {
    const value = parseInt(e.target.value);
    if (value > 0) {
      setQuantity(value);
    }
  };

  const handleAddToCart = () => {
    console.log(`Adding ${quantity} of product ${product.id} to cart`);
    // Add your cart logic here
    alert(`Added ${quantity} item(s) to cart!`);
  };

  const handleBuyNow = () => {
    console.log(`Buying ${quantity} of product ${product.id}`);
    // Add your checkout logic here
    navigate("/checkout");
  };

  return (
    <div className="product-page">
      <div className="container py-5">
        <button className="btn btn-secondary mb-4" onClick={() => navigate(-1)}>
          → Back
        </button>

        <div className="row">
          {/* Product Image */}
          <div className="col-md-6 mb-4">
            <div className="card">
              <img
                src={product.image}
                alt={product.name}
                className="card-img-top"
                style={{ objectFit: "cover", height: "500px" }}
              />
            </div>
          </div>

          {/* Product Details */}
          <div className="col-md-6">
            <div className="product-details">
              <h1 className="mb-3">{product.name}</h1>

              {/* Rating */}
              <div className="mb-3">
                <span className="text-warning">
                  {"★".repeat(Math.floor(product.rating))}
                  {"☆".repeat(5 - Math.floor(product.rating))}
                </span>
                <span className="ms-2 text-muted">
                  ({product.reviews} reviews)
                </span>
              </div>

              {/* Price */}
              <h2 className="text-primary mb-3">₪{product.price}</h2>

              {/* Category */}
              <p className="text-muted mb-3">
                <strong>Category:</strong> {product.category}
              </p>

              {/* Stock Status */}
              <p
                className={`mb-3 ${product.inStock ? "text-success" : "text-danger"}`}
              >
                <strong>{product.inStock ? "In Stock" : "Out of Stock"}</strong>
              </p>

              {/* Description */}
              <div className="mb-4">
                <h5>Description</h5>
                <p>{product.description}</p>
              </div>

              {/* Quantity Selector */}
              <div className="mb-4">
                <label htmlFor="quantity" className="form-label">
                  <strong>Quantity:</strong>
                </label>
                <input
                  type="number"
                  id="quantity"
                  className="form-control"
                  style={{ maxWidth: "100px" }}
                  min="1"
                  value={quantity}
                  onChange={handleQuantityChange}
                  disabled={!product.inStock}
                />
              </div>

              {/* Action Buttons */}
              <div className="d-flex gap-3">
                <button
                  className="btn btn-primary btn-lg flex-grow-1"
                  onClick={handleAddToCart}
                  disabled={!product.inStock}
                >
                  Add to Cart
                </button>
                <button
                  className="btn btn-success btn-lg flex-grow-1"
                  onClick={handleBuyNow}
                  disabled={!product.inStock}
                >
                  Buy Now
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductPage;
