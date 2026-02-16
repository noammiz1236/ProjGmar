import 'dotenv/config';
import jwt from 'jsonwebtoken';

// Get the JWT_SECRET from env
const JWT_SECRET = process.env.JWT_SECRET;

console.log('JWT_SECRET loaded:', JWT_SECRET ? 'Yes' : 'No');

// You'll need to paste your actual token here from browser localStorage
// To get it: Open browser console on SmartCart and run: localStorage.getItem('token')
const testToken = process.argv[2];

if (!testToken) {
  console.log('\nUsage: node test_api.js YOUR_TOKEN_HERE');
  console.log('\nTo get your token:');
  console.log('1. Open SmartCart in browser');
  console.log('2. Press F12 (or inspect)');
  console.log('3. Go to Console tab');
  console.log('4. Type: localStorage.getItem("token")');
  console.log('5. Copy the token (without quotes) and run this script again');
  process.exit(0);
}

try {
  const decoded = jwt.verify(testToken, JWT_SECRET);
  console.log('\n✓ Token is valid!');
  console.log('User ID:', decoded.userId);
  console.log('Email:', decoded.email);
  console.log('Token expires:', new Date(decoded.exp * 1000).toLocaleString());
} catch (err) {
  console.error('\n✗ Token verification failed:', err.message);
}
