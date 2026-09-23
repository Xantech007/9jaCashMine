// netlify/functions/api.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const serverless = require('serverless-http');

const app = express();
app.use(cors());
app.use(express.json());

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

// API Routes (prepended with /.netlify/functions/api)
const router = express.Router();

router.get('/banks', async (req, res) => {
  try {
    const response = await axios.get('https://api.paystack.co/bank', {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` }
    });
    res.json({
      status: true,
      data: response.data.data.map(b => ({ name: b.name, code: b.code }))
    });
  } catch (error) {
    res.status(500).json({ status: false, message: 'Failed to retrieve bank list' });
  }
});

router.get('/verify-account', async (req, res) => {
  const { account_number, bank_code } = req.query;
  if (!account_number || !bank_code) {
    return res.status(400).json({ status: false, message: 'Missing parameters' });
  }

  try {
    const response = await axios.get(
      `https://api.paystack.co/bank/resolve?account_number=${account_number}&bank_code=${bank_code}`,
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` } }
    );
    res.json({
      status: true,
      data: {
        account_number: response.data.data.account_number,
        account_name: response.data.data.account_name
      }
    });
  } catch (error) {
    res.status(422).json({
      status: false,
      message: error.response?.data?.message || 'Could not resolve account details'
    });
  }
});

app.use('/.netlify/functions/api', router);

module.handler = serverless(app);
