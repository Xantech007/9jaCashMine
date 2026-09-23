const axios = require('axios');

// Full list mapped directly to Paystack Bank Codes
const BANKS = [
  { name: 'Access Bank', code: '044' },
  { name: 'Access Bank (Diamond)', code: '063' },
  { name: 'ALAT by Wema', code: '035A' },
  { name: 'ASO Savings and Loans', code: '401' },
  { name: 'Bowen Microfinance Bank', code: '50931' },
  { name: 'CEMCS Microfinance Bank', code: '50823' },
  { name: 'Citibank Nigeria', code: '023' },
  { name: 'Coronation Merchant Bank', code: '559' },
  { name: 'Ecobank Nigeria', code: '050' },
  { name: 'Ekondo Microfinance Bank', code: '562' },
  { name: 'Eyowo', code: '50126' },
  { name: 'Fidelity Bank', code: '070' },
  { name: 'Firmus MFB', code: '51314' },
  { name: 'First Bank of Nigeria', code: '011' },
  { name: 'First City Monument Bank', code: '214' },
  { name: 'FSDH Merchant Bank', code: '501' },
  { name: 'Globus Bank', code: '00103' },
  { name: 'Guaranty Trust Bank', code: '058' },
  { name: 'Hackman Microfinance Bank', code: '51251' },
  { name: 'Hasal Microfinance Bank', code: '50383' },
  { name: 'Heritage Bank', code: '030' },
  { name: 'Ibile Microfinance Bank', code: '51240' },
  { name: 'Infinity Microfinance Bank', code: '50457' },
  { name: 'Jaiz Bank', code: '301' },
  { name: 'Kadpoly Microfinance Bank', code: '50502' },
  { name: 'Keystone Bank', code: '082' },
  { name: 'Kuda Microfinance Bank', code: '50211' },
  { name: 'Lagos Building Investment Company', code: '90052' },
  { name: 'Links MFB', code: '50549' },
  { name: 'Lotus Bank', code: '303' },
  { name: 'Mayfair MFB', code: '50563' },
  { name: 'Mint MFB', code: '50304' },
  { name: 'Moniepoint', code: '50515' },
  { name: 'NPF Microfinance Bank', code: '50629' },
  { name: 'Opay', code: '999992' },
  { name: 'Paga', code: '100002' },
  { name: 'PalmPay', code: '999991' },
  { name: 'Parallex Bank', code: '526' },
  { name: 'Parkway - ReadyCash', code: '311' },
  { name: 'Paycom', code: '305' },
  { name: 'Petra Microfinance Bank', code: '50746' },
  { name: 'Polaris Bank', code: '076' },
  { name: 'PremiumTrust Bank', code: '000031' },
  { name: 'Providus Bank', code: '101' },
  { name: 'QuickFund MFB', code: '51293' },
  { name: 'Rand Merchant Bank', code: '502' },
  { name: 'Rubies Bank', code: '125' },
  { name: 'Signature Bank', code: '000034' },
  { name: 'Sparkle Bank', code: '51310' },
  { name: 'Stanbic IBTC Bank', code: '221' },
  { name: 'Standard Chartered Bank', code: '068' },
  { name: 'Sterling Bank', code: '232' },
  { name: 'SunTrust Bank', code: '100' },
  { name: 'TAJBank', code: '302' },
  { name: 'Tanadi Microfinance Bank', code: '51269' },
  { name: 'Titan Trust Bank', code: '102' },
  { name: 'U&C Microfinance Bank', code: '50840' },
  { name: 'Union Bank of Nigeria', code: '032' },
  { name: 'United Bank for Africa', code: '033' },
  { name: 'Unity Bank', code: '215' },
  { name: 'VFD Microfinance Bank', code: '566' },
  { name: 'Wema Bank', code: '035' },
  { name: 'Zenith Bank', code: '057' },
  { name: '9 Payment Service Bank', code: '120001' }
];

exports.handler = async (event) => {
  const accountNumber = event.queryStringParameters.account_number;

  if (!accountNumber || accountNumber.length !== 10) {
    return {
      statusCode: 400,
      body: JSON.stringify({ status: false, message: 'Valid 10-digit account number required' })
    };
  }

  try {
    const requests = BANKS.map(async (bank) => {
      try {
        const res = await axios.get(
          `https://api.paystack.co/bank/resolve?account_number=${accountNumber}&bank_code=${bank.code}`,
          {
            headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
            timeout: 3000
          }
        );
        if (res.data && res.data.status) {
          return {
            bankName: bank.name,
            bankCode: bank.code,
            accountName: res.data.data.account_name,
            accountNumber: accountNumber
          };
        }
      } catch (e) {
        return null;
      }
    });

    const results = await Promise.all(requests);
    const matches = results.filter((item) => item !== null);

    if (matches.length === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({ status: false, message: 'No active account found across supported banks' })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        status: true,
        count: matches.length,
        data: matches
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ status: false, message: 'Verification service error' })
    };
  }
};
