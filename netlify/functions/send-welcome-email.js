const nodemailer = require('nodemailer');
const config = require('./mailconfig');
const { buildWelcomeEmail, buildWelcomeText } = require('./welcome-template');

const GMAIL_RE = /^[a-z0-9](?:[a-z0-9._+-]*[a-z0-9])?@gmail\.com$/i;

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return json(405, { message: 'Method not allowed' });

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return json(400, { message: 'Invalid JSON' });
  }

  const email = String(payload.email || '').trim().toLowerCase();
  const fullName = String(payload.fullName || '').trim().slice(0, 100);

  if (!GMAIL_RE.test(email)) return json(400, { message: 'Invalid Gmail address' });
  if (fullName.length < 3) return json(400, { message: 'Invalid name' });

  // siteURL comes from mailconfig / Netlify — never from the browser
  const siteURL = (config.siteURL || process.env.URL || '').replace(/\/+$/, '');

  try {
    const transporter = nodemailer.createTransport(config.smtp);
    await transporter.sendMail({
      from: `"${config.from.name}" <${config.from.address}>`,
      to: email,
      subject: config.subject,
      text: buildWelcomeText(fullName, siteURL),
      html: buildWelcomeEmail(fullName, siteURL)
    });
    return json(200, { message: 'Welcome email sent' });
  } catch (err) {
    console.error('Welcome email error:', err);
    return json(500, { message: 'Could not send email' });
  }
};
