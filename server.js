require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY; // e.g. sk_live_xxx or sk_test_xxx

// Endpoint 1: Fetch list of supported banks with their Paystack bank codes
app.get('/api/banks', async (req, res) => {
  try {
    const response = await axios.get('https://api.paystack.co/bank', {
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`
      }
    });

    res.json({
      status: true,
      data: response.data.data.map(b => ({
        name: b.name,
        code: b.code
      }))
    });
  } catch (error) {
    console.error('Error fetching banks:', error.response?.data || error.message);
    res.status(500).json({ status: false, message: 'Failed to retrieve bank list' });
  }
});

// Endpoint 2: Resolve Account Number
app.get('/api/verify-account', async (req, res) => {
  const { account_number, bank_code } = req.query;

  if (!account_number || !bank_code) {
    return res.status(400).json({
      status: false,
      message: 'Both account_number and bank_code are required'
    });
  }

  try {
    const response = await axios.get(
      `https://api.paystack.co/bank/resolve?account_number=${account_number}&bank_code=${bank_code}`,
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`
        }
      }
    );

    res.json({
      status: true,
      data: {
        account_number: response.data.data.account_number,
        account_name: response.data.data.account_name
      }
    });
  } catch (error) {
    console.error('Resolution Error:', error.response?.data || error.message);
    res.status(422).json({
      status: false,
      message: error.response?.data?.message || 'Could not resolve account details'
    });
  }
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
