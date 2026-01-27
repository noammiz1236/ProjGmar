import React from "react";

const Home = () => {
  return (
    <div className="store-page">
      <div className="container py-5">
        <h1 className="display-4 fw-bold mb-4">Home</h1>
        <p className="lead text-muted">Welcome to our home</p>

        {/* Placeholder for products */}
        <div className="row">
          <div className="col-md-12">
            <p className="text-center mt-5">Products coming soon...</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
