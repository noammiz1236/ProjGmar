import React, { useEffect, useRef, useState } from "react";
import { Html5QrcodeScanner } from "html5-qrcode";
import api from "../api";

const BarcodeScanner = ({ onResult, onClose }) => {
  const scannerRef = useRef(null);
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(true);

  useEffect(() => {
    const scanner = new Html5QrcodeScanner("barcode-reader", {
      fps: 10,
      qrbox: { width: 250, height: 150 },
      supportedScanTypes: [0],
    });

    scanner.render(
      async (decodedText) => {
        setScanning(false);
        scanner.clear();
        try {
          const { data } = await api.get(`/api/items/barcode/${decodedText}`);
          onResult({ ...data.item, prices: data.prices });
        } catch (err) {
          setError(`מוצר עם ברקוד ${decodedText} לא נמצא`);
        }
      },
      () => {},
    );

    scannerRef.current = scanner;
    return () => {
      try { scanner.clear(); } catch (e) {}
    };
  }, [onResult]);

  return (
    <div className="sc-modal-overlay" dir="rtl">
      <div className="sc-modal" style={{ maxWidth: "560px" }}>
        <div className="sc-modal-header">
          <h5>סריקת ברקוד</h5>
          <button className="sc-icon-btn" onClick={onClose}>
            <i className="bi bi-x-lg"></i>
          </button>
        </div>
        <div className="sc-modal-body">
          {scanning && <div id="barcode-reader" style={{ width: "100%" }}></div>}
          {error && (
            <div className="text-center py-3">
              <div className="alert alert-warning" style={{ borderRadius: "10px" }}>
                <p className="mb-2">{error}</p>
                <button
                  className="sc-btn sc-btn-primary"
                  onClick={() => { setError(""); setScanning(true); }}
                  style={{ fontSize: "0.85rem" }}
                >
                  <i className="bi bi-arrow-clockwise me-1"></i> נסה שוב
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="sc-modal-footer">
          <button className="sc-btn sc-btn-ghost" onClick={onClose}>סגור</button>
        </div>
      </div>
    </div>
  );
};

export default BarcodeScanner;
