import { useState } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import NavBar from "./components/NavBar";
import Store from "./pages/Store";
import Login from "./pages/Login";
import Register from "./pages/Register";

function App() {
  return (
    <Router>
      <NavBar />
      <Routes>
        <Route path="/store" element={<Store />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/"
          element={
            <div className="container py-5">
              <h1>Welcome Home</h1>
            </div>
          }
        />
      </Routes>
    </Router>
  );
}

export default App;
