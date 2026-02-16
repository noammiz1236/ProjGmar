import React, { useState, useEffect } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import api from '../api';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const PriceHistoryChart = ({ productId }) => {
  const [priceHistory, setPriceHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchPriceHistory = async () => {
      try {
        setLoading(true);
        const { data } = await api.get(`/api/products/${productId}/price-history`);
        
        if (data.priceHistory && data.priceHistory.length > 0) {
          setPriceHistory(data.priceHistory);
        } else {
          setError(true);
        }
      } catch (err) {
        console.error('Error fetching price history:', err);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchPriceHistory();
  }, [productId]);

  if (loading) {
    return (
      <div className="sc-card p-4 text-center">
        <div className="spinner-border spinner-border-sm" style={{ color: 'var(--sc-primary)' }}></div>
        <p className="mt-2 mb-0" style={{ fontSize: '0.85rem', color: 'var(--sc-text-muted)' }}>טוען היסטוריית מחירים...</p>
      </div>
    );
  }

  if (error || priceHistory.length === 0) {
    return (
      <div className="sc-card p-4 text-center" style={{ background: 'rgba(100,116,139,0.05)' }}>
        <i className="bi bi-graph-up" style={{ fontSize: '2rem', color: 'var(--sc-text-muted)', opacity: 0.3 }}></i>
        <p className="mt-2 mb-0" style={{ fontSize: '0.85rem', color: 'var(--sc-text-muted)' }}>
          אין נתוני היסטוריית מחירים זמינים עבור מוצר זה
        </p>
      </div>
    );
  }

  // Group by chain
  const chainData = {};
  priceHistory.forEach(entry => {
    const chain = entry.chain_name || 'לא ידוע';
    if (!chainData[chain]) {
      chainData[chain] = [];
    }
    chainData[chain].push({
      date: new Date(entry.updated_at),
      price: parseFloat(entry.price)
    });
  });

  // Sort each chain's data by date
  Object.keys(chainData).forEach(chain => {
    chainData[chain].sort((a, b) => a.date - b.date);
  });

  // Get all unique dates
  const allDates = [...new Set(priceHistory.map(p => new Date(p.updated_at).toLocaleDateString('he-IL')))];
  allDates.sort((a, b) => new Date(a) - new Date(b));

  // Chart colors
  const colors = [
    { bg: 'rgba(79, 70, 229, 0.1)', border: 'rgb(79, 70, 229)' },
    { bg: 'rgba(236, 72, 153, 0.1)', border: 'rgb(236, 72, 153)' },
    { bg: 'rgba(6, 182, 212, 0.1)', border: 'rgb(6, 182, 212)' },
    { bg: 'rgba(245, 158, 11, 0.1)', border: 'rgb(245, 158, 11)' },
    { bg: 'rgba(16, 185, 129, 0.1)', border: 'rgb(16, 185, 129)' },
  ];

  const datasets = Object.keys(chainData).map((chain, idx) => {
    const color = colors[idx % colors.length];
    return {
      label: chain,
      data: chainData[chain].map(d => d.price),
      borderColor: color.border,
      backgroundColor: color.bg,
      borderWidth: 2,
      tension: 0.3,
      fill: true,
      pointRadius: 4,
      pointHoverRadius: 6,
    };
  });

  const chartData = {
    labels: allDates.slice(-30), // Last 30 data points
    datasets: datasets,
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          font: { size: 12, family: 'Segoe UI' },
          color: getComputedStyle(document.documentElement).getPropertyValue('--sc-text').trim(),
          padding: 12,
        }
      },
      title: {
        display: true,
        text: 'מגמת מחירים',
        font: { size: 16, weight: 'bold', family: 'Segoe UI' },
        color: getComputedStyle(document.documentElement).getPropertyValue('--sc-text').trim(),
        padding: { bottom: 20 }
      },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        titleColor: '#fff',
        bodyColor: '#fff',
        borderColor: 'rgba(255, 255, 255, 0.1)',
        borderWidth: 1,
        padding: 12,
        displayColors: true,
        callbacks: {
          label: function(context) {
            return `${context.dataset.label}: ₪${context.parsed.y.toFixed(2)}`;
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: false,
        ticks: {
          callback: function(value) {
            return '₪' + value.toFixed(2);
          },
          color: getComputedStyle(document.documentElement).getPropertyValue('--sc-text-muted').trim(),
          font: { size: 11 }
        },
        grid: {
          color: getComputedStyle(document.documentElement).getPropertyValue('--sc-border').trim(),
        }
      },
      x: {
        ticks: {
          color: getComputedStyle(document.documentElement).getPropertyValue('--sc-text-muted').trim(),
          font: { size: 11 },
          maxRotation: 45,
          minRotation: 45
        },
        grid: {
          display: false
        }
      }
    }
  };

  // Price statistics
  const allPrices = priceHistory.map(p => parseFloat(p.price));
  const currentPrice = allPrices[0];
  const avgPrice = allPrices.reduce((a, b) => a + b, 0) / allPrices.length;
  const minPrice = Math.min(...allPrices);
  const maxPrice = Math.max(...allPrices);

  return (
    <div className="sc-card p-4">
      <div className="row mb-3">
        <div className="col-6 col-md-3 mb-2">
          <small style={{ color: 'var(--sc-text-muted)', fontSize: '0.75rem' }}>מחיר נוכחי</small>
          <div className="fw-bold" style={{ fontSize: '1.1rem', color: 'var(--sc-primary)' }}>₪{currentPrice?.toFixed(2)}</div>
        </div>
        <div className="col-6 col-md-3 mb-2">
          <small style={{ color: 'var(--sc-text-muted)', fontSize: '0.75rem' }}>ממוצע</small>
          <div className="fw-bold" style={{ fontSize: '1.1rem' }}>₪{avgPrice.toFixed(2)}</div>
        </div>
        <div className="col-6 col-md-3 mb-2">
          <small style={{ color: 'var(--sc-text-muted)', fontSize: '0.75rem' }}>מינימום</small>
          <div className="fw-bold" style={{ fontSize: '1.1rem', color: 'var(--sc-success)' }}>₪{minPrice.toFixed(2)}</div>
        </div>
        <div className="col-6 col-md-3 mb-2">
          <small style={{ color: 'var(--sc-text-muted)', fontSize: '0.75rem' }}>מקסימום</small>
          <div className="fw-bold" style={{ fontSize: '1.1rem', color: 'var(--sc-danger)' }}>₪{maxPrice.toFixed(2)}</div>
        </div>
      </div>
      <div style={{ height: '280px' }}>
        <Line data={chartData} options={options} />
      </div>
    </div>
  );
};

export default PriceHistoryChart;
