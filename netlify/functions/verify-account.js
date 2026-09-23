const axios = require('axios');

exports.handler = async (event) => {
  const account_number = event.queryStringParameters.account_number;
  const bank_code = event.queryStringParameters.bank_code;

  if (!account_number || !bank_code) {
    return {
      statusCode: 400,
      body: JSON.stringify({ status: false, message: 'Missing parameters' })
    };
  }

  try {
    const response = await axios.get(
      `https://api.paystack.co/bank/resolve?account_number=${account_number}&bank_code=${bank_code}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
        }
      }
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        status: true,
        data: response.data.data
      })
    };
  } catch (error) {
    return {
      statusCode: 422,
      body: JSON.stringify({
        status: false,
        message: error.response?.data?.message || 'Could not verify account details'
      })
    };
  }
};
